import Phaser from 'phaser';
import { COLOR, W, H } from '../config';
import { LEVELS, commonEnemies, levelEnder, metEnemies } from '../data/levels';
import type { SaveData } from '../save';
import { button, starfield, text } from '../ui';

interface MapData {
  state: SaveData;
  onLeave: () => void;
}

// Node positions: one row per act of five levels, snaking up the screen.
const ROWS = [168, 112, 56];
const COLS = [22, 56, 90, 124, 158];
const nodePos = (i: number) => {
  const row = Math.floor(i / 5);
  const col = row % 2 === 0 ? i % 5 : 4 - (i % 5);
  return { x: COLS[col], y: ROWS[row] + ((i % 2) * 2 - 1) * 7 };
};
const INFO_Y = 188;

// The Base star map: a roadmap of all 15 levels. Info only. The next level
// is picked by default, and the one after it can be read too, so purchases
// can be planned. Cleared levels can be looked back on.
export class MapScene extends Phaser.Scene {
  private d!: MapData;
  private selected = 0;
  private content!: Phaser.GameObjects.Container;
  private scroll!: ReturnType<typeof starfield>;

  constructor() { super('Map'); }

  init(data: MapData) {
    this.d = data;
    this.selected = Math.min(data.state.level, LEVELS.length) - 1;
  }

  create() {
    this.scene.bringToTop(); // draw over Base, which sits later in the scene list
    this.cameras.main.fadeIn(250);
    this.add.rectangle(0, 0, W, H, 0x000000).setOrigin(0).setInteractive();
    this.scroll = starfield(this);
    this.drawRoute();
    this.content = this.add.container(0, 0);

    const kb = this.input.keyboard!;
    kb.enabled = true;
    kb.on('keydown', (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['arrowleft', 'arrowdown', 'a', 's'].includes(k)) this.step(-1);
      else if (['arrowright', 'arrowup', 'd', 'w'].includes(k)) this.step(1);
      else if (['escape', 'backspace', 'enter', ' '].includes(k)) this.leave();
    });
    this.render();
  }

  private get next() { return Math.min(this.d.state.level, LEVELS.length) - 1; }

  // Cleared levels, the next one and the one after it.
  private selectable(i: number) {
    return i >= 0 && i <= Math.min(this.next + 1, LEVELS.length - 1);
  }

  private step(dir: number) {
    const i = this.selected + dir;
    if (this.selectable(i)) { this.selected = i; this.render(); }
  }

  // The path and the level pictures, drawn once.
  private drawRoute() {
    const g = this.add.graphics();
    for (let i = 0; i < LEVELS.length - 1; i++) {
      const a = nodePos(i), b = nodePos(i + 1);
      const done = i < this.next;
      const steps = Math.floor(Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y) / 4);
      g.fillStyle(done ? 0xf8b800 : 0x3c3c3c);
      for (let s = 2; s < steps - 1; s++) {
        g.fillRect(Math.round(a.x + ((b.x - a.x) * s) / steps), Math.round(a.y + ((b.y - a.y) * s) / steps), 1, 1);
      }
    }
    LEVELS.forEach((l, i) => {
      const { x, y } = nodePos(i);
      const img = this.add.image(x, y, l.node);
      if (i > this.next + 1) img.setAlpha(0.3);
      if (i < this.next) this.add.image(x + 8, y + 7, 'check');
      const hit = this.add.rectangle(x, y, 28, 28, 0x000000, 0).setInteractive();
      hit.on('pointerup', () => {
        if (this.selectable(i)) { this.selected = i; this.render(); }
      });
    });
    // The player's ship waits at the next level.
    const n = nodePos(this.next);
    const ship = this.add.image(n.x, n.y - 15, 'ship').setScale(0.7);
    this.tweens.add({ targets: ship, y: n.y - 13, yoyo: true, repeat: -1, duration: 500, ease: 'Sine.easeInOut' });
  }

  private render() {
    this.content.removeAll(true);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => { this.content.add(o); return o; };
    const i = this.selected;
    const l = LEVELS[i];

    add(text(this, W / 2, 6, `LEVEL ${i + 1}`, COLOR.gray).setOrigin(0.5, 0));
    add(text(this, W / 2, 18, l.name, COLOR.white).setOrigin(0.5, 0));
    const status = i < this.next ? ['CLEARED', COLOR.green] : i === this.next ? ['NEXT', COLOR.yellow] : ['COMING UP', COLOR.cyan];
    const ender = levelEnder(i + 1);
    add(text(this, W / 2, 30, ender ? `${status[0]} - ${ender}` : status[0], status[1]).setOrigin(0.5, 0));

    // Blinking brackets around the selected level.
    const { x, y } = nodePos(i);
    const sel = add(this.add.rectangle(x, y, 24, 24).setStrokeStyle(1, 0xf8b800));
    this.tweens.add({ targets: sel, alpha: 0.2, yoyo: true, repeat: -1, duration: 350 });

    add(this.add.rectangle(4, INFO_Y, W - 8, 1, 0x3c3c3c).setOrigin(0));
    add(text(this, 6, INFO_Y + 5, l.desc, COLOR.white).setWordWrapWidth(W - 12));

    // Common enemies: the enemy's own sprite (or ? if not met yet) and 1 to 3 pips.
    const ey = 254;
    add(text(this, 6, ey, 'COMMON ENEMIES', COLOR.gray));
    const met = metEnemies(this.d.state.level);
    commonEnemies(l).forEach(([kind, pips], k) => {
      const cx = 18 + k * 40;
      const known = met.has(kind) && this.textures.exists(kind);
      add(this.add.image(cx, ey + 21, known ? kind : 'qmark').setOrigin(0.5));
      for (let p = 0; p < 3; p++) add(this.add.image(cx - 4 + p * 4, ey + 32, p < pips ? 'pip' : 'pipEmpty'));
    });

    add(button(this, 6, H - 22, W - 12, 18, 'BACK', () => this.leave(), COLOR.cyan));
  }

  private leave() {
    this.input.keyboard!.enabled = false;
    this.cameras.main.fadeOut(250);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop();
      this.scene.resume('Base');
      this.d.onLeave();
    });
  }

  update(_t: number, delta: number) {
    this.scroll(delta / 1000, 0.2);
  }
}
