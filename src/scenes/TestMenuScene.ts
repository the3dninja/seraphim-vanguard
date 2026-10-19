import Phaser from 'phaser';
import { COLOR, W, H } from '../config';
import { GEAR, MAX_WEAPON_LEVEL, WEAPONS, type GearId, type WeaponId } from '../data/items';
import { weaponLevel } from '../inventory';
import { CONFIG_BOX, TEST_SEQUENCES, type TestWaves } from '../combatTest';
import type { SaveData } from '../save';
import { button, text } from '../ui';

interface TestMenuData {
  waves: TestWaves;
  state: SaveData;
  equip: (slot: number, id: WeaponId) => void;
  equipGear: (slot: number, id: GearId) => void;
  setLevel: (id: WeaponId, level: number) => void;
  resume: () => void;
  quit: () => void;
}

// A grid of icon buttons, each opening a slot 1 / slot 2 picker under it.
interface Grid<T extends string> {
  ids: T[];
  cols: number;
  y: number;
  slots: () => (T | null)[];
  name: (id: T) => string;
  icon: (id: T) => string;
  equip: (slot: number, id: T) => void;
}

const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
const GEAR_IDS = Object.keys(GEAR) as GearId[];
const BOX = 19; // icon button size
const CELL = 21; // icon buttons sit this far apart
const WEAPON_Y = 136;
const LEVEL_Y = 182; // the two weapon slot rows with their level buttons
const GEAR_Y = 230;
const NAME_Y = 285; // name of the last tapped weapon or gear
const hexNum = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;

// Combat test's pause menu: wave sequence toggles, weapon and gear pickers,
// weapon levels, and back to the title. Opened over the paused Game scene by
// the config button, and closed by it again.
export class TestMenuScene extends Phaser.Scene {
  private d!: TestMenuData;
  private picker: Phaser.GameObjects.Container | null = null;
  private slotTags: { tag: Phaser.GameObjects.Text; held: () => number }[] = [];
  private pickedName!: Phaser.GameObjects.Text;
  private levelRows: { icon: Phaser.GameObjects.Image; levels: { box: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }[] }[] = [];

  constructor() { super('TestMenu'); }

  init(data: TestMenuData) {
    this.d = data;
    this.picker = null;
    this.slotTags = [];
    this.levelRows = [];
  }

  create() {
    // Shade over the game; tapping empty space just closes the slot picker.
    this.add.rectangle(0, 0, W, H, 0x000000, 0.8).setOrigin(0).setInteractive()
      .on('pointerdown', () => this.closePicker());
    text(this, W / 2, 8, 'COMBAT TEST', COLOR.yellow).setOrigin(0.5, 0);

    text(this, 14, 24, 'WAVES', COLOR.gray);
    TEST_SEQUENCES.forEach((seq, i) => this.toggle(14, 34 + i * 18, W - 28, 15, seq.name, i));

    const s = this.d.state;
    text(this, 14, WEAPON_Y - 11, 'WEAPONS', COLOR.gray);
    this.grid<WeaponId>({
      ids: WEAPON_IDS, cols: 6, y: WEAPON_Y, slots: () => s.weapons,
      name: (id) => WEAPONS[id].name, icon: (id) => WEAPONS[id].icon, equip: this.d.equip,
    });
    [0, 1].forEach((slot) => this.levelRow(slot, LEVEL_Y + slot * 19));

    text(this, 14, GEAR_Y - 11, 'GEAR', COLOR.gray);
    this.grid<GearId>({
      ids: GEAR_IDS, cols: 8, y: GEAR_Y, slots: () => s.gear,
      name: (id) => GEAR[id].name, icon: (id) => GEAR[id].icon, equip: this.d.equipGear,
    });
    this.pickedName = text(this, W / 2, NAME_Y, '', COLOR.white).setOrigin(0.5, 0);
    this.refreshSlots();

    this.menuButton();

    // The config button again, lit, in the same place: tap to resume.
    const { x, y, size } = CONFIG_BOX;
    this.add.rectangle(x, y, size, size, 0x000000).setOrigin(0).setStrokeStyle(1, hexNum(COLOR.yellow))
      .setInteractive({ useHandCursor: true }).on('pointerdown', () => this.d.resume());
    this.add.image(x + size / 2, y + size / 2, 'iconGear').setTint(hexNum(COLOR.yellow));
  }

  // Bottom left, in line with the config button: a left arrow and MENU, back to the title.
  private menuButton() {
    const { y, size } = CONFIG_BOX;
    const box = this.add.rectangle(4, y, 56, size, 0x000000).setOrigin(0).setStrokeStyle(1, hexNum(COLOR.red))
      .setInteractive({ useHandCursor: true });
    box.on('pointerdown', () => box.setFillStyle(0x3c3c3c));
    box.on('pointerout', () => box.setFillStyle(0x000000));
    box.on('pointerup', () => this.d.quit());
    this.add.triangle(0, 0, 9, y + 11, 15, y + 6, 15, y + 16, hexNum(COLOR.red)).setOrigin(0);
    text(this, 19, y + 7, 'MENU', COLOR.red);
  }

  // An on/off button for one wave sequence. On shows yellow with ON.
  private toggle(x: number, y: number, w: number, h: number, label: string, i: number) {
    const box = this.add.rectangle(x, y, w, h, 0x000000).setOrigin(0).setInteractive({ useHandCursor: true });
    const name = text(this, x + 6, y + 4, label);
    const state = text(this, x + w - 6, y + 4, '').setOrigin(1, 0);
    const show = () => {
      const on = this.d.waves.on[i];
      const c = on ? COLOR.yellow : COLOR.gray;
      box.setStrokeStyle(1, hexNum(c)).setFillStyle(on ? 0x3c2800 : 0x000000);
      name.setColor(c);
      state.setColor(c).setText(on ? 'ON' : 'OFF');
    };
    box.on('pointerdown', () => { this.closePicker(); this.d.waves.toggle(i); show(); });
    show();
  }

  private grid<T extends string>(g: Grid<T>) {
    const left = Math.round((W - g.cols * CELL) / 2) + 1;
    g.ids.forEach((id, i) => {
      const x = left + (i % g.cols) * CELL;
      const y = g.y + Math.floor(i / g.cols) * CELL;
      const box = this.add.rectangle(x, y, BOX, BOX, 0x000000).setOrigin(0).setStrokeStyle(1, 0x7c7c7c)
        .setInteractive({ useHandCursor: true });
      this.add.image(x + BOX / 2, y + BOX / 2, g.icon(id)).setScale(2);
      // Which slot it's in, if any, in the corner.
      const tag = text(this, x + BOX + 1, y - 2, '', COLOR.cyan).setOrigin(1, 0).setDepth(1);
      this.slotTags.push({ tag, held: () => g.slots().indexOf(id) });
      box.on('pointerdown', () => this.openPicker(g, id, x, y));
    });
  }

  // A weapon slot's number, its weapon, and that weapon's level as buttons 1 to 5.
  private levelRow(slot: number, y: number) {
    text(this, 14, y + 4, `${slot + 1}`, COLOR.cyan);
    const icon = this.add.image(32, y + 8, 'icon_pulse').setScale(2);
    const levels = [];
    for (let lv = 1; lv <= MAX_WEAPON_LEVEL; lv++) {
      const x = 50 + (lv - 1) * 23;
      const box = this.add.rectangle(x, y, 21, 16, 0x000000).setOrigin(0).setInteractive({ useHandCursor: true });
      const label = text(this, x + 11, y + 4, `${lv}`).setOrigin(0.5, 0);
      box.on('pointerdown', () => {
        this.closePicker();
        const id = this.d.state.weapons[slot];
        if (!id) return;
        this.d.setLevel(id, lv);
        this.refreshSlots();
      });
      levels.push({ box, label });
    }
    this.levelRows.push({ icon, levels });
  }

  // Slot buttons 1 and 2 under the tapped icon, over whatever is below it.
  private openPicker<T extends string>(g: Grid<T>, id: T, x: number, y: number) {
    this.closePicker();
    this.pickedName.setText(g.name(id));
    const c = this.add.container(0, 0).setDepth(5);
    [0, 1].forEach((slot) => {
      const bx = Phaser.Math.Clamp(x - 3 + slot * 13, 2, W - 14);
      const held = g.slots()[slot] === id;
      c.add(button(this, bx, y + BOX + 1, 12, 13, `${slot + 1}`, () => {
        g.equip(slot, id);
        this.closePicker();
        this.refreshSlots();
      }, held ? COLOR.cyan : COLOR.white));
    });
    this.picker = c;
  }

  private closePicker() {
    this.picker?.destroy();
    this.picker = null;
  }

  private refreshSlots() {
    for (const { tag, held } of this.slotTags) {
      const slot = held();
      tag.setText(slot >= 0 ? `${slot + 1}` : '');
    }
    const w = this.d.state.weapons;
    this.levelRows.forEach((row, slot) => {
      const id = w[slot];
      row.icon.setVisible(!!id);
      if (id) row.icon.setTexture(WEAPONS[id].icon);
      const cur = id ? weaponLevel(this.d.state, id) : 0;
      row.levels.forEach(({ box, label }, i) => {
        const c = !id ? COLOR.dim : i + 1 === cur ? COLOR.yellow : COLOR.gray;
        box.setStrokeStyle(1, hexNum(c)).setFillStyle(i + 1 === cur ? 0x3c2800 : 0x000000);
        label.setColor(c);
      });
    });
  }
}
