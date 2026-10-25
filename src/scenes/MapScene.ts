import Phaser from 'phaser';
import { COLOR, W, H } from '../config';
import { LEVELS, commonEnemies, isBuilt, levelEnder, metEnemies, type LevelDef } from '../data/levels';
import { SIDES, type SideDef } from '../data/sides';
import type { SaveData } from '../save';
import { button, starfield, text } from '../ui';

// What Base flies next: a main level by number (a cleared one is a replay), or a side mission.
export type Pick = { level: number; side?: undefined } | { side: string; level?: undefined };

interface MapData {
  state: SaveData;
  unlocked?: string[]; // side missions that just unlocked, flagged on the map
  // Just back from a level that unlocked side missions: show them with no
  // buttons, then return to Base on its own after a few seconds.
  announce?: boolean;
  onLeave: () => void;
  // Fly the picked level or side mission; Base takes it from there.
  onLaunch?: (pick: Pick) => void;
  // What was picked last time, picked again on opening.
  pick?: Pick | null;
  // On leaving: the launchable stop left picked, or null for the next level.
  onPick?: (pick: Pick | null) => void;
}

// A stop on the map: a main level by index, or a side mission.
type Stop = { i: number; side?: undefined } | { i: number; side: SideDef };

// Node positions: one row per act of five levels, snaking up the screen.
const ROWS = [166, 110, 56];
const COLS = [22, 56, 90, 124, 158];
const nodePos = (i: number) => {
  const row = Math.floor(i / 5);
  const col = row % 2 === 0 ? i % 5 : 4 - (i % 5);
  return { x: COLS[col], y: ROWS[row] + ((i % 2) * 2 - 1) * 7 };
};
// Side mission moons hang just below the level they sit beside, in pairs
// side by side.
const sidePos = (sd: SideDef) => {
  const twins = SIDES.filter((o) => o.anchor === sd.anchor);
  const k = twins.indexOf(sd);
  const a = nodePos(sd.anchor - 1);
  return { x: a.x + (twins.length === 2 ? (k ? 12 : -12) : 0), y: a.y + 19 };
};
const INFO_Y = 202;

// The Base star map: a roadmap of all 15 levels and the side missions beside
// them. The next level is picked by default, and the one after it can be read
// too, so purchases can be planned. Cleared levels can be looked back on.
// The next level and any open side mission can be launched from here.
export class MapScene extends Phaser.Scene {
  private d!: MapData;
  private selected: Stop = { i: 0 };
  private content!: Phaser.GameObjects.Container;
  private scroll!: ReturnType<typeof starfield>;

  constructor() { super('Map'); }

  init(data: MapData) {
    this.d = data;
    this.selected = { i: Math.min(data.state.level, LEVELS.length) - 1 };
    const pk = data.pick;
    const pickSide = pk?.side ? SIDES.find((sd) => sd.id === pk.side) : undefined;
    if (pickSide) this.selected = { i: pickSide.anchor - 1, side: pickSide };
    else if (pk?.level) this.selected = { i: pk.level - 1 };
    // Newly unlocked side missions are picked first, so their briefing shows.
    const fresh = SIDES.find((sd) => data.unlocked?.includes(sd.id));
    if (fresh) this.selected = { i: fresh.anchor - 1, side: fresh };
  }

  create() {
    this.scene.bringToTop(); // draw over Base, which sits later in the scene list
    this.cameras.main.fadeIn(250);
    this.add.rectangle(0, 0, W, H, 0x000000).setOrigin(0).setInteractive();
    this.scroll = starfield(this);
    this.drawRoute();
    this.content = this.add.container(0, 0);

    if (this.d.announce) {
      // Nothing to tap: the map shows itself, then goes back to the menu.
      this.add.rectangle(0, 0, W, H, 0x000000, 0).setOrigin(0).setInteractive().setDepth(20);
      this.render();
      this.time.delayedCall(3000, () => this.leave());
      return;
    }
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

  // Cleared levels, the next one and the one after it, and side missions
  // beside any of those.
  private selectable(st: Stop) {
    const i = st.side ? st.side.anchor - 1 : st.i;
    return i >= 0 && i <= Math.min(this.next + 1, LEVELS.length - 1);
  }

  // Every stop in map order: each level, then the side missions beside it.
  private stops(): Stop[] {
    return LEVELS.flatMap((_l, i) => [{ i } as Stop, ...SIDES.filter((sd) => sd.anchor === i + 1).map((side) => ({ i, side }))]);
  }

  private same(a: Stop, b: Stop) { return a.i === b.i && a.side === b.side; }

  private step(dir: number) {
    const all = this.stops().filter((st) => this.selectable(st));
    const k = all.findIndex((st) => this.same(st, this.selected));
    const to = all[k + dir];
    if (to) { this.selected = to; this.render(); }
  }

  private sideState(sd: SideDef) {
    const st = this.d.state;
    if (st.sides.includes(sd.id)) return 'cleared';
    return sd.anchor >= st.level ? 'coming' : 'open';
  }

  // Whether a stop can be flown from here: the next level, an open side
  // mission, or a cleared one of either, as a replay.
  private launchable(st: Stop) {
    if (st.side) return this.sideState(st.side) !== 'coming';
    return (this.replaying(st) || (st.i === this.next && this.d.state.level <= LEVELS.length)) && isBuilt(LEVELS[st.i]);
  }

  private replaying(st: Stop) {
    return st.side ? this.sideState(st.side) === 'cleared' : st.i < this.d.state.level - 1;
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
      if (levelEnder(i + 1) && i <= this.next) this.bossMark(x - 9, y - 8);
      const hit = this.add.rectangle(x, y, 28, 28, 0x000000, 0).setInteractive();
      hit.on('pointerup', () => {
        if (this.selectable({ i })) { this.selected = { i }; this.render(); }
      });
    });
    // Side mission moons, joined to their level by a short dotted line.
    for (const sd of SIDES) {
      const { x, y } = sidePos(sd);
      const a = nodePos(sd.anchor - 1);
      const state = this.sideState(sd);
      g.fillStyle(state === 'open' ? 0x3cbcfc : state === 'cleared' ? 0xf8b800 : 0x3c3c3c);
      for (let s = 0.45; s < 0.8; s += 0.17) g.fillRect(Math.round(a.x + (x - a.x) * s), Math.round(a.y + (y - a.y) * s), 1, 1);
      const img = this.add.image(x, y, sd.node);
      if (state === 'coming') img.setAlpha(0.35);
      // A treasure mission shows a pulsing pile of gold in the corner while it's open.
      if (sd.treasure && state === 'open') {
        const pile = this.add.image(x + 7, y + 5, 'goldPile').setDepth(5);
        this.tweens.add({ targets: pile, scale: 1.25, alpha: 0.55, yoyo: true, repeat: -1, duration: 500, ease: 'Sine.easeInOut' });
      }
      if (sd.boss && (state === 'open' || state === 'cleared')) this.bossMark(x - 7, y - 6);
      if (state === 'cleared') this.add.image(x + 6, y + 5, 'check').setScale(0.75);
      // An open one blinks a ring so it stands out.
      if (state === 'open') {
        const ring = this.add.circle(x, y, 8).setStrokeStyle(1, 0x3cbcfc);
        this.tweens.add({ targets: ring, alpha: 0.15, yoyo: true, repeat: -1, duration: 600 });
      }
      const hit = this.add.rectangle(x, y, 20, 20, 0x000000, 0).setInteractive();
      const stop: Stop = { i: sd.anchor - 1, side: sd };
      hit.on('pointerup', () => {
        if (this.selectable(stop)) { this.selected = stop; this.render(); }
      });
    }
    this.announce();
    // The player's ship waits at the next level.
    const n = nodePos(this.next);
    const ship = this.add.image(n.x, n.y - 15, 'ship').setScale(0.7);
    this.tweens.add({ targets: ship, y: n.y - 13, yoyo: true, repeat: -1, duration: 500, ease: 'Sine.easeInOut' });
  }

  // A red skull pulsing on the corner of a boss or mini boss level, once it's unlocked.
  private bossMark(x: number, y: number) {
    const skull = this.add.image(x, y, 'bossSkull').setDepth(5);
    this.tweens.add({ targets: skull, scale: 1.2, alpha: 0.5, yoyo: true, repeat: -1, duration: 550, ease: 'Sine.easeInOut' });
  }

  // Side missions that just unlocked: a banner near them that flashes a few
  // times and fades. Their moons already blink a ring while open.
  private announce() {
    const fresh = SIDES.filter((sd) => this.d.unlocked?.includes(sd.id));
    if (!fresh.length) return;
    const { y } = sidePos(fresh[0]);
    const msg = fresh.length > 1 ? `${fresh.length} SIDE MISSIONS\nUNLOCKED` : 'SIDE MISSION\nUNLOCKED';
    // Under the moons, or above them on the bottom row, out of the info panel.
    const by = y + 38 < INFO_Y ? y + 23 : y - 30;
    const banner = this.add.container(0, 0).setDepth(10);
    banner.add(this.add.rectangle(W / 2, by, 140, 26, 0x000000).setStrokeStyle(1, 0xf8b800));
    banner.add(text(this, W / 2, by, msg, COLOR.yellow).setOrigin(0.5).setAlign('center'));
    this.tweens.add({
      targets: banner, alpha: 0.15, yoyo: true, repeat: 3, duration: 250, delay: 300,
      onComplete: () => this.tweens.add({ targets: banner, alpha: 0, delay: 1800, duration: 400, onComplete: () => banner.destroy() }),
    });
  }

  private render() {
    this.content.removeAll(true);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => { this.content.add(o); return o; };
    const { i, side } = this.selected;
    const l: LevelDef = side ?? LEVELS[i];

    add(text(this, W / 2, 6, side ? 'SIDE MISSION' : `LEVEL ${i + 1}`, side ? COLOR.cyan : COLOR.gray).setOrigin(0.5, 0));
    add(text(this, W / 2, 18, l.name, COLOR.white).setOrigin(0.5, 0));
    let status: [string, string];
    let ender = '';
    let launch = false;
    if (side) {
      const st = this.sideState(side);
      status = st === 'cleared' ? ['CLEARED', COLOR.green] : st === 'open' ? ['OPEN', COLOR.yellow] : ['COMING UP', COLOR.cyan];
      ender = side.boss ? 'MINI BOSS' : '';
    } else {
      status = i < this.next ? ['CLEARED', COLOR.green] : i === this.next ? ['NEXT', COLOR.yellow] : ['COMING UP', COLOR.cyan];
      ender = levelEnder(i + 1);
    }
    launch = this.launchable(this.selected);
    add(text(this, W / 2, 30, ender ? `${status[0]} - ${ender}` : status[0], status[1]).setOrigin(0.5, 0));

    // Blinking brackets around the selected level.
    const { x, y } = side ? sidePos(side) : nodePos(i);
    const box = side ? 16 : 24;
    const sel = add(this.add.rectangle(x, y, box, box).setStrokeStyle(1, 0xf8b800));
    this.tweens.add({ targets: sel, alpha: 0.2, yoyo: true, repeat: -1, duration: 350 });

    add(this.add.rectangle(4, INFO_Y, W - 8, 1, 0x3c3c3c).setOrigin(0));
    add(text(this, 6, INFO_Y + 5, l.desc, COLOR.white).setWordWrapWidth(W - 12));

    // Common enemies, unlabeled: the enemy's own sprite (or ? if not met yet)
    // and 1 to 3 pips.
    const ey = 256;
    const met = metEnemies(this.d.state.level);
    commonEnemies(l).forEach(([kind, pips], k) => {
      const cx = 18 + k * 40;
      const known = met.has(kind) && this.textures.exists(kind);
      add(this.add.image(cx, ey + 21, known ? kind : 'qmark').setOrigin(0.5));
      for (let p = 0; p < 3; p++) add(this.add.image(cx - 4 + p * 4, ey + 32, p < pips ? 'pip' : 'pipEmpty'));
    });

    if (this.d.announce) return;
    if (launch && this.d.onLaunch) {
      add(button(this, 6, H - 22, 84, 18, 'BACK', () => this.leave(), COLOR.cyan));
      const label = this.replaying(this.selected) ? 'REPLAY' : 'LAUNCH';
      add(button(this, 94, H - 22, W - 100, 18, label, () => this.leave(true), COLOR.yellow));
    } else add(button(this, 6, H - 22, W - 12, 18, 'BACK', () => this.leave(), COLOR.cyan));
  }

  // The selected stop as Base's pick, if it can be flown. The next level is
  // Base's default, so it's null.
  private pick(): Pick | null {
    const st = this.selected;
    if (!this.launchable(st)) return null;
    if (st.side) return { side: st.side.id };
    return this.replaying(st) ? { level: st.i + 1 } : null;
  }

  // With `launch`, fly the selected stop.
  private leave(launch = false) {
    if (!this.scene.isActive()) return;
    const pick = this.pick();
    this.input.keyboard!.enabled = false;
    this.cameras.main.fadeOut(250);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop();
      this.scene.resume('Base');
      this.d.onLeave();
      if (!this.d.announce) this.d.onPick?.(pick);
      if (launch) this.d.onLaunch?.(pick ?? { level: this.next + 1 });
    });
  }

  update(_t: number, delta: number) {
    this.scroll(delta / 1000, 0.2);
  }
}
