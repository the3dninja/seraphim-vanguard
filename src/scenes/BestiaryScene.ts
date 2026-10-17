import Phaser from 'phaser';
import { COLOR, W, H } from '../config';
import { BESTIARY, discovered, type BeastEntry } from '../data/bestiary';
import { DTYPE_COLOR, type DType } from '../data/items';
import type { SaveData } from '../save';
import { button, starfield, text } from '../ui';

interface BestiaryData { state: SaveData; onLeave: () => void }

// One page per faction, or more when a faction has more entries than fit.
interface Page { title: string; entries: BeastEntry[]; known: boolean }

const COLS = 4;
const ROWS = 3;
const TILE = 38; // tile size; tiles sit 40 px apart
const GRID_X = (W - COLS * 40) / 2 + 1;
const GRID_Y = 20;
const ICON = 30; // icons are scaled to fit this box
const INFO_Y = 164;
const TAG: Record<DType, string> = { kinetic: 'KIN', laser: 'LAS', plasma: 'PLA', ion: 'ION', explosive: 'EXP' };
const hex = (c: number) => `#${c.toString(16).padStart(6, '0')}`;

// The Base Bestiary: pictures in the top half, the picked entry's details in
// the bottom half. Unfaced enemies, and factions with none faced, show as ?.
export class BestiaryScene extends Phaser.Scene {
  private d!: BestiaryData;
  private pages: Page[] = [];
  private known = new Set<string>();
  private page = 0;
  private pick = 0;
  private content!: Phaser.GameObjects.Container;
  private scroll!: ReturnType<typeof starfield>;

  constructor() { super('Bestiary'); }

  init(data: BestiaryData) {
    this.d = data;
    this.known = discovered(data.state);
    this.pages = [];
    for (const c of BESTIARY) {
      const n = Math.ceil(c.entries.length / (COLS * ROWS));
      const known = c.entries.some((e) => this.known.has(e.id));
      for (let p = 0; p < n; p++) {
        this.pages.push({
          title: n > 1 ? `${c.name} ${p + 1}/${n}` : c.name,
          entries: c.entries.slice(p * COLS * ROWS, (p + 1) * COLS * ROWS),
          known,
        });
      }
    }
    this.page = 0;
    this.pick = 0;
  }

  create() {
    this.scene.bringToTop();
    this.cameras.main.fadeIn(250);
    this.add.rectangle(0, 0, W, H, 0x000000).setOrigin(0).setInteractive();
    this.scroll = starfield(this);
    this.content = this.add.container(0, 0);

    const kb = this.input.keyboard!;
    kb.enabled = true;
    kb.on('keydown', (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (['arrowleft', 'a'].includes(k)) this.turn(-1);
      else if (['arrowright', 'd'].includes(k)) this.turn(1);
      else if (['arrowup', 'w'].includes(k)) this.select(this.pick - COLS);
      else if (['arrowdown', 's'].includes(k)) this.select(this.pick + COLS);
      else if (['escape', 'backspace'].includes(k)) this.leave();
    });
    this.render();
  }

  private turn(dir: number) {
    const p = Phaser.Math.Clamp(this.page + dir, 0, this.pages.length - 1);
    if (p === this.page) return;
    this.page = p;
    this.pick = 0;
    this.render();
  }

  private select(i: number) {
    if (i < 0 || i >= this.pages[this.page].entries.length) return;
    this.pick = i;
    this.render();
  }

  private render() {
    this.content.removeAll(true);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => { this.content.add(o); return o; };
    const pg = this.pages[this.page];

    add(text(this, W / 2, 6, pg.known ? pg.title : '???', pg.known ? COLOR.yellow : COLOR.gray).setOrigin(0.5, 0));

    pg.entries.forEach((en, i) => {
      const x = GRID_X + (i % COLS) * 40;
      const y = GRID_Y + Math.floor(i / COLS) * 46;
      const known = this.known.has(en.id);
      const border = i === this.pick ? 0xf8b800 : en.boss && known ? 0x881400 : 0x3c3c3c;
      const tile = add(this.add.rectangle(x, y, TILE, TILE, border).setOrigin(0));
      add(this.add.rectangle(x + 1, y + 1, TILE - 2, TILE - 2, 0x000000).setOrigin(0));
      tile.setInteractive({ useHandCursor: true }).on('pointerup', () => this.select(i));
      const key = known && this.textures.exists(en.texture) ? en.texture : 'qmark';
      const img = add(this.add.image(x + TILE / 2, y + TILE / 2, key));
      const big = Math.max(img.width, img.height);
      // Small sprites grow by whole steps so the pixels stay square.
      img.setScale(big * 2 <= ICON ? Math.floor(ICON / big) : Math.min(1, ICON / big));
      if (known && en.tint) img.setTint(en.tint);
    });

    this.info(pg.entries[this.pick], add);

    const last = this.pages.length - 1;
    add(button(this, 6, H - 22, 30, 18, '<', () => this.turn(-1), COLOR.cyan)).setEnabled(this.page > 0);
    add(button(this, 40, H - 22, W - 80, 18, 'BACK', () => this.leave(), COLOR.cyan));
    add(button(this, W - 36, H - 22, 30, 18, '>', () => this.turn(1), COLOR.cyan)).setEnabled(this.page < last);
  }

  // The bottom half: name, weaknesses and resistances, the write-up and the kill count.
  private info(en: BeastEntry, add: <T extends Phaser.GameObjects.GameObject>(o: T) => T) {
    add(this.add.rectangle(4, INFO_Y - 4, W - 8, 1, 0x3c3c3c).setOrigin(0));
    if (!this.known.has(en.id)) {
      add(text(this, W / 2, INFO_Y + 50, 'UNDISCOVERED', COLOR.gray).setOrigin(0.5, 0));
      return;
    }
    add(text(this, 6, INFO_Y, en.name, COLOR.yellow));
    this.types(6, INFO_Y + 14, 'WEAK', en.weak, add);
    this.types(6, INFO_Y + 25, 'RESIST', en.resist, add);
    add(text(this, 6, INFO_Y + 40, en.desc, COLOR.white).setWordWrapWidth(W - 12));
    const ky = H - 38;
    add(text(this, 6, ky, `KILLS ${this.d.state.kills[en.id] ?? 0}`, COLOR.white));
    if (en.boss) add(text(this, W - 6, ky, en.boss, COLOR.red).setOrigin(1, 0));
  }

  // "WEAK PLA EXP", each type in its damage color, or a dash for none.
  private types(x: number, y: number, label: string, list: DType[], add: <T extends Phaser.GameObjects.GameObject>(o: T) => T) {
    add(text(this, x, y, label, COLOR.gray));
    let tx = x + 56;
    if (!list.length) add(text(this, tx, y, '-', COLOR.gray));
    for (const t of list) {
      add(text(this, tx, y, TAG[t], hex(DTYPE_COLOR[t])));
      tx += 32;
    }
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
