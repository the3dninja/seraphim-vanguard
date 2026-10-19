import Phaser from 'phaser';
import { COLOR, W, H } from '../config';
import {
  GEAR, ITEMS, MAX_GEAR_LEVEL, MAX_WEAPON_LEVEL, WEAPONS, type GearId, type ItemId, type WeaponId,
} from '../data/items';
import { gearLevel, weaponLevel } from '../inventory';
import { TEST_BUTTONS, TEST_ICONS, TEST_SEQUENCES, type TestPanel, type TestWaves } from '../combatTest';
import type { SaveData } from '../save';
import { button, text } from '../ui';

interface TestMenuData {
  panel: TestPanel;
  waves: TestWaves;
  state: SaveData;
  equip: (slot: number, id: WeaponId) => void;
  equipGear: (slot: number, id: GearId) => void;
  equipItem: (slot: number, id: ItemId) => void;
  setLevel: (id: WeaponId, level: number) => void;
  setGearLevel: (id: GearId, level: number) => void;
  resume: () => void;
  quit: () => void;
}

// A grid of icon buttons, each opening a slot picker (1, 2, ...) under it.
interface Grid<T extends string> {
  ids: T[];
  cols: number;
  y: number;
  slots: () => (T | null)[];
  name: (id: T) => string;
  icon: (id: T) => string;
  equip: (slot: number, id: T) => void;
}

// A slot's number, what's in it, and its level as buttons 1 to 5.
interface LevelRow {
  slot: number;
  held: () => string | null;
  icon: Phaser.GameObjects.Image;
  iconOf: (id: string) => string;
  level: (id: string) => number;
  levels: { box: Phaser.GameObjects.Rectangle; label: Phaser.GameObjects.Text }[];
}

const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
const GEAR_IDS = Object.keys(GEAR) as GearId[];
const ITEM_IDS = Object.keys(ITEMS) as ItemId[];
const BOX = 19; // icon button size
const CELL = 21; // icon buttons sit this far apart
// Ship panel rows, top to bottom.
const WEAPON_Y = 32;
const WEAPON_LEVEL_Y = 76;
const GEAR_Y = 126;
const GEAR_LEVEL_Y = 170;
const ITEM_Y = 220;
const NAME_Y = 282; // name of the last tapped weapon, gear or item
const hexNum = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;

// Combat test's pause menu, opened over the paused Game scene by one of the two
// test buttons: swords for the wave toggles, the ship for weapons, gear and
// items. Its own copies of those buttons switch panels, or resume when tapped
// on the open one. MENU goes back to the title.
export class TestMenuScene extends Phaser.Scene {
  private d!: TestMenuData;
  private picker: Phaser.GameObjects.Container | null = null;
  private slotTags: { tag: Phaser.GameObjects.Text; held: () => number }[] = [];
  private pickedName!: Phaser.GameObjects.Text;
  private levelRows: LevelRow[] = [];

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
    if (this.d.panel === 'waves') this.wavesPanel();
    else this.shipPanel();
    this.menuButton();
    this.panelButtons();
  }

  private wavesPanel() {
    text(this, W / 2, 8, 'WAVES', COLOR.yellow).setOrigin(0.5, 0);
    text(this, W / 2, 24, 'EACH LOOPS TILL OFF.\nSTACK ANY NUMBER.', COLOR.gray).setOrigin(0.5, 0).setAlign('center');
    TEST_SEQUENCES.forEach((seq, i) => this.toggle(14, 56 + i * 26, W - 28, 20, seq.name, i));
  }

  private shipPanel() {
    const s = this.d.state;
    text(this, W / 2, 8, 'SHIP', COLOR.yellow).setOrigin(0.5, 0);

    text(this, 14, WEAPON_Y - 11, 'WEAPONS', COLOR.gray);
    this.grid<WeaponId>({
      ids: WEAPON_IDS, cols: 6, y: WEAPON_Y, slots: () => s.weapons,
      name: (id) => WEAPONS[id].name, icon: (id) => WEAPONS[id].icon, equip: this.d.equip,
    });
    [0, 1].forEach((slot) => this.levelRow(WEAPON_LEVEL_Y + slot * 18, {
      slot, held: () => s.weapons[slot], iconOf: (id) => WEAPONS[id as WeaponId].icon,
      level: (id) => weaponLevel(s, id as WeaponId), max: MAX_WEAPON_LEVEL,
      set: (id, lv) => this.d.setLevel(id as WeaponId, lv),
    }));

    text(this, 14, GEAR_Y - 11, 'GEAR', COLOR.gray);
    this.grid<GearId>({
      ids: GEAR_IDS, cols: 8, y: GEAR_Y, slots: () => s.gear,
      name: (id) => GEAR[id].name, icon: (id) => GEAR[id].icon, equip: this.d.equipGear,
    });
    [0, 1].forEach((slot) => this.levelRow(GEAR_LEVEL_Y + slot * 18, {
      slot, held: () => s.gear[slot], iconOf: (id) => GEAR[id as GearId].icon,
      level: (id) => gearLevel(s, id as GearId), max: MAX_GEAR_LEVEL,
      set: (id, lv) => this.d.setGearLevel(id as GearId, lv),
    }));

    text(this, 14, ITEM_Y - 11, 'ITEMS (NEVER RUN OUT)', COLOR.gray);
    this.grid<ItemId>({
      ids: ITEM_IDS, cols: 8, y: ITEM_Y, slots: () => s.items.map((it) => it?.id ?? null),
      name: (id) => ITEMS[id].name, icon: (id) => ITEMS[id].icon, equip: this.d.equipItem,
    });

    this.pickedName = text(this, W / 2, NAME_Y, '', COLOR.white).setOrigin(0.5, 0);
    this.refreshSlots();
  }

  // The swords and ship buttons, where they sit in flight. The open panel's is lit.
  private panelButtons() {
    const { y, size } = TEST_BUTTONS;
    (['waves', 'ship'] as TestPanel[]).forEach((panel) => {
      const x = TEST_BUTTONS.x[panel];
      const open = panel === this.d.panel;
      this.add.rectangle(x, y, size, size, open ? 0x3c2800 : 0x000000).setOrigin(0)
        .setStrokeStyle(1, open ? hexNum(COLOR.yellow) : 0xfcfcfc)
        .setInteractive({ useHandCursor: true })
        .on('pointerdown', () => (open ? this.d.resume() : this.scene.restart({ ...this.d, panel })));
      this.add.image(x + size / 2, y + size / 2, TEST_ICONS[panel]).setTintFill(hexNum(COLOR.yellow));
    });
  }

  // Bottom left, in line with the test buttons: a left arrow and MENU, back to the title.
  private menuButton() {
    const { y, size } = TEST_BUTTONS;
    const box = this.add.rectangle(4, y, 48, size, 0x000000).setOrigin(0).setStrokeStyle(1, hexNum(COLOR.red))
      .setInteractive({ useHandCursor: true });
    box.on('pointerdown', () => box.setFillStyle(0x3c3c3c));
    box.on('pointerout', () => box.setFillStyle(0x000000));
    box.on('pointerup', () => this.d.quit());
    this.add.triangle(0, 0, 8, y + 11, 13, y + 6, 13, y + 16, hexNum(COLOR.red)).setOrigin(0);
    text(this, 16, y + 7, 'MENU', COLOR.red);
  }

  // An on/off button for one wave sequence. On shows yellow with ON.
  private toggle(x: number, y: number, w: number, h: number, label: string, i: number) {
    const box = this.add.rectangle(x, y, w, h, 0x000000).setOrigin(0).setInteractive({ useHandCursor: true });
    const name = text(this, x + 6, y + h / 2 - 4, label);
    const state = text(this, x + w - 6, y + h / 2 - 4, '').setOrigin(1, 0);
    const show = () => {
      const on = this.d.waves.on[i];
      const c = on ? COLOR.yellow : COLOR.gray;
      box.setStrokeStyle(1, hexNum(c)).setFillStyle(on ? 0x3c2800 : 0x000000);
      name.setColor(c);
      state.setColor(c).setText(on ? 'ON' : 'OFF');
    };
    box.on('pointerdown', () => { this.d.waves.toggle(i); show(); });
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

  private levelRow(y: number, o: {
    slot: number; held: () => string | null; iconOf: (id: string) => string;
    level: (id: string) => number; max: number; set: (id: string, lv: number) => void;
  }) {
    text(this, 14, y + 4, `${o.slot + 1}`, COLOR.cyan);
    const icon = this.add.image(32, y + 8, 'icon_pulse').setScale(2);
    const levels = [];
    for (let lv = 1; lv <= o.max; lv++) {
      const x = 50 + (lv - 1) * 23;
      const box = this.add.rectangle(x, y, 21, 16, 0x000000).setOrigin(0).setInteractive({ useHandCursor: true });
      const label = text(this, x + 11, y + 4, `${lv}`).setOrigin(0.5, 0);
      box.on('pointerdown', () => {
        this.closePicker();
        const id = o.held();
        if (!id) return;
        o.set(id, lv);
        this.refreshSlots();
      });
      levels.push({ box, label });
    }
    this.levelRows.push({ slot: o.slot, held: o.held, icon, iconOf: o.iconOf, level: o.level, levels });
  }

  // Slot buttons under the tapped icon, one per slot, over whatever is below it.
  private openPicker<T extends string>(g: Grid<T>, id: T, x: number, y: number) {
    this.closePicker();
    this.pickedName.setText(g.name(id));
    const c = this.add.container(0, 0).setDepth(5);
    const n = g.slots().length;
    const left = Phaser.Math.Clamp(x + BOX / 2 - (n * 13 - 1) / 2, 2, W - 2 - n * 13);
    g.slots().forEach((held, slot) => {
      c.add(button(this, left + slot * 13, y + BOX + 1, 12, 13, `${slot + 1}`, () => {
        g.equip(slot, id);
        this.closePicker();
        this.refreshSlots();
      }, held === id ? COLOR.cyan : COLOR.white));
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
    for (const row of this.levelRows) {
      const id = row.held();
      row.icon.setVisible(!!id);
      if (id) row.icon.setTexture(row.iconOf(id));
      const cur = id ? row.level(id) : 0;
      row.levels.forEach(({ box, label }, i) => {
        const c = !id ? COLOR.dim : i + 1 === cur ? COLOR.yellow : COLOR.gray;
        box.setStrokeStyle(1, hexNum(c)).setFillStyle(i + 1 === cur ? 0x3c2800 : 0x000000);
        label.setColor(c);
      });
    }
  }
}
