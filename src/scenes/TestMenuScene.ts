import Phaser from 'phaser';
import { COLOR, W, H } from '../config';
import {
  GEAR, ITEMS, MAX_GEAR_LEVEL, MAX_WEAPON_LEVEL, WEAPONS, type GearId, type ItemId, type WeaponId,
} from '../data/items';
import { gearLevel, weaponLevel } from '../inventory';
import { TEST_BUTTONS, TEST_ICONS, TEST_SEQUENCES, type TestPanel, type TestWaves } from '../combatTest';
import type { SaveData } from '../save';
import { text } from '../ui';

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
const LEVEL_ROW = 18; // a slot's level row, and the gap to the next
const SECTION_GAP = 8; // between the level rows and the next heading
// The panel scrolls between the title and the name line; a drag anywhere
// scrolls it, and only a tap (moving less than DRAG px) presses anything.
const VIEW_TOP = 20;
const NAME_Y = 282; // name of the last tapped weapon, gear or item
const VIEW_BOTTOM = NAME_Y - 3;
const DRAG = 4;
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
  private content!: Phaser.GameObjects.Container; // everything that scrolls, laid out from 0
  private contentH = 0;
  private scrollY = 0;
  private scrollBar!: Phaser.GameObjects.Rectangle;
  private dragFrom: { y: number; scroll: number } | null = null;
  private dragged = false;

  constructor() { super('TestMenu'); }

  init(data: TestMenuData) {
    this.d = data;
    this.picker = null;
    this.slotTags = [];
    this.levelRows = [];
    this.scrollY = 0;
    this.dragFrom = null;
    this.dragged = false;
  }

  create() {
    // Shade over the game; tapping empty space just closes the slot picker.
    this.tap(this.add.rectangle(0, 0, W, H, 0x000000, 0.8).setOrigin(0).setInteractive(), () => this.closePicker(), false);
    this.content = this.add.container(0, VIEW_TOP);
    const mask = this.make.graphics({}, false).fillRect(0, VIEW_TOP, W, VIEW_BOTTOM - VIEW_TOP);
    this.content.setMask(mask.createGeometryMask());
    this.scrollBar = this.add.rectangle(W - 2, VIEW_TOP, 2, 10, 0x7c7c7c).setOrigin(1, 0).setVisible(false);
    if (this.d.panel === 'waves') this.wavesPanel();
    else this.shipPanel();
    this.menuButton();
    this.panelButtons();
    this.dragScroll();
  }

  // A drag anywhere scrolls the panel; once a press has moved DRAG px it's a
  // drag, and lifting it presses nothing.
  private dragScroll() {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragFrom = { y: p.y, scroll: this.scrollY };
      this.dragged = false;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragFrom || !p.isDown) return;
      const dy = p.y - this.dragFrom.y;
      if (Math.abs(dy) >= DRAG) this.dragged = true;
      if (this.dragged) this.scrollTo(this.dragFrom.scroll - dy);
    });
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.scrollTo(this.scrollY + dy * 0.5));
  }

  private scrollTo(y: number) {
    const view = VIEW_BOTTOM - VIEW_TOP;
    const max = Math.max(0, this.contentH - view);
    this.scrollY = Phaser.Math.Clamp(Math.round(y), 0, max);
    this.content.y = VIEW_TOP - this.scrollY;
    // A thin bar on the right shows where you are, when there's more than fits.
    this.scrollBar.setVisible(max > 0);
    if (max > 0) {
      const h = Math.max(12, (view * view) / this.contentH);
      this.scrollBar.setSize(2, h).setY(VIEW_TOP + ((view - h) * this.scrollY) / max);
    }
  }

  // Runs `fn` when a press on `obj` is lifted without having dragged (and, for
  // things in the scrolling panel, inside the part that shows).
  private tap(obj: Phaser.GameObjects.GameObject, fn: () => void, scrolls = true) {
    obj.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.dragged) return;
      if (scrolls && (p.y < VIEW_TOP || p.y >= VIEW_BOTTOM)) return;
      fn();
    });
    return obj;
  }

  // Adds to the scrolling panel.
  private c<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.content.add(obj);
    return obj;
  }

  private wavesPanel() {
    text(this, 14, 6, 'WAVES', COLOR.yellow);
    this.c(text(this, W / 2, 4, 'EACH LOOPS TILL OFF.\nSTACK ANY NUMBER.', COLOR.gray).setOrigin(0.5, 0).setAlign('center'));
    TEST_SEQUENCES.forEach((seq, i) => this.toggle(14, 34 + i * 26, W - 28, 20, seq.name, i));
    this.contentH = 34 + TEST_SEQUENCES.length * 26;
    this.scrollTo(0);
  }

  private shipPanel() {
    const s = this.d.state;
    text(this, 14, 6, 'SHIP', COLOR.yellow);
    let y = 12; // laid out top to bottom, so rows never overlap

    const section = <T extends string>(title: string, g: Omit<Grid<T>, 'y'>, rows?: (slot: number, y: number) => void) => {
      this.c(text(this, 8, y - 11, title, COLOR.gray));
      this.grid<T>({ ...g, y });
      y += Math.ceil(g.ids.length / g.cols) * CELL + 4;
      if (rows) {
        [0, 1].forEach((slot) => rows(slot, y + slot * LEVEL_ROW));
        y += 2 * LEVEL_ROW;
      }
      y += SECTION_GAP + 11;
    };

    section<WeaponId>('WEAPONS', {
      ids: WEAPON_IDS, cols: 6, slots: () => s.weapons,
      name: (id) => WEAPONS[id].name, icon: (id) => WEAPONS[id].icon, equip: this.d.equip,
    }, (slot, ry) => this.levelRow(ry, {
      slot, held: () => s.weapons[slot], iconOf: (id) => WEAPONS[id as WeaponId].icon,
      level: (id) => weaponLevel(s, id as WeaponId), max: MAX_WEAPON_LEVEL,
      set: (id, lv) => this.d.setLevel(id as WeaponId, lv),
    }));

    section<GearId>('GEAR', {
      ids: GEAR_IDS, cols: 8, slots: () => s.gear,
      name: (id) => GEAR[id].name, icon: (id) => GEAR[id].icon, equip: this.d.equipGear,
    }, (slot, ry) => this.levelRow(ry, {
      slot, held: () => s.gear[slot], iconOf: (id) => GEAR[id as GearId].icon,
      level: (id) => gearLevel(s, id as GearId), max: MAX_GEAR_LEVEL,
      set: (id, lv) => this.d.setGearLevel(id as GearId, lv),
    }));

    section<ItemId>('ITEMS (NEVER RUN OUT)', {
      ids: ITEM_IDS, cols: 8, slots: () => s.items.map((it) => it?.id ?? null),
      name: (id) => ITEMS[id].name, icon: (id) => ITEMS[id].icon, equip: this.d.equipItem,
    });
    this.contentH = y - SECTION_GAP - 11;

    // Slot numbers sit over the corners of the next icons along, so they go on top.
    for (const { tag } of this.slotTags) this.content.bringToTop(tag);
    this.pickedName = text(this, W / 2, NAME_Y, '', COLOR.white).setOrigin(0.5, 0);
    this.refreshSlots();
    this.scrollTo(0);
  }

  // The swords and ship buttons, where they sit in flight. The open panel's is lit.
  private panelButtons() {
    const { y, size } = TEST_BUTTONS;
    (['waves', 'ship'] as TestPanel[]).forEach((panel) => {
      const x = TEST_BUTTONS.x[panel];
      const open = panel === this.d.panel;
      const box = this.add.rectangle(x, y, size, size, open ? 0x3c2800 : 0x000000).setOrigin(0)
        .setStrokeStyle(1, open ? hexNum(COLOR.yellow) : 0xfcfcfc)
        .setInteractive({ useHandCursor: true });
      this.tap(box, () => (open ? this.d.resume() : this.scene.restart({ ...this.d, panel })), false);
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
    this.tap(box, () => this.d.quit(), false);
    this.add.triangle(0, 0, 8, y + 11, 13, y + 6, 13, y + 16, hexNum(COLOR.red)).setOrigin(0);
    text(this, 16, y + 7, 'MENU', COLOR.red);
  }

  // An on/off button for one wave sequence. On shows yellow with ON.
  private toggle(x: number, y: number, w: number, h: number, label: string, i: number) {
    const box = this.c(this.add.rectangle(x, y, w, h, 0x000000).setOrigin(0).setInteractive({ useHandCursor: true }));
    const name = this.c(text(this, x + 6, y + h / 2 - 4, label));
    const state = this.c(text(this, x + w - 6, y + h / 2 - 4, '').setOrigin(1, 0));
    const show = () => {
      const on = this.d.waves.on[i];
      const c = on ? COLOR.yellow : COLOR.gray;
      box.setStrokeStyle(1, hexNum(c)).setFillStyle(on ? 0x3c2800 : 0x000000);
      name.setColor(c);
      state.setColor(c).setText(on ? 'ON' : 'OFF');
    };
    this.tap(box, () => { this.d.waves.toggle(i); show(); });
    show();
  }

  private grid<T extends string>(g: Grid<T>) {
    const left = Math.round((W - g.cols * CELL) / 2) + 1;
    g.ids.forEach((id, i) => {
      const x = left + (i % g.cols) * CELL;
      const y = g.y + Math.floor(i / g.cols) * CELL;
      const box = this.c(this.add.rectangle(x, y, BOX, BOX, 0x000000).setOrigin(0).setStrokeStyle(1, 0x7c7c7c)
        .setInteractive({ useHandCursor: true }));
      this.c(this.add.image(x + BOX / 2, y + BOX / 2, g.icon(id)).setScale(2));
      // Which slot it's in, if any, in the corner.
      const tag = this.c(text(this, x + BOX + 1, y - 2, '', COLOR.cyan).setOrigin(1, 0));
      this.slotTags.push({ tag, held: () => g.slots().indexOf(id) });
      this.tap(box, () => this.openPicker(g, id, x, y));
    });
  }

  private levelRow(y: number, o: {
    slot: number; held: () => string | null; iconOf: (id: string) => string;
    level: (id: string) => number; max: number; set: (id: string, lv: number) => void;
  }) {
    this.c(text(this, 14, y + 4, `${o.slot + 1}`, COLOR.cyan));
    const icon = this.c(this.add.image(32, y + 8, 'icon_pulse').setScale(2));
    const levels = [];
    for (let lv = 1; lv <= o.max; lv++) {
      const x = 50 + (lv - 1) * 23;
      const box = this.c(this.add.rectangle(x, y, 21, 16, 0x000000).setOrigin(0).setInteractive({ useHandCursor: true }));
      const label = this.c(text(this, x + 11, y + 4, `${lv}`).setOrigin(0.5, 0));
      this.tap(box, () => {
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
    const c = this.c(this.add.container(0, 0));
    const n = g.slots().length;
    const left = Phaser.Math.Clamp(x + BOX / 2 - (n * 13 - 1) / 2, 2, W - 2 - n * 13);
    g.slots().forEach((held, slot) => {
      const color = held === id ? COLOR.cyan : COLOR.white;
      const bx = left + slot * 13, by = y + BOX + 1;
      const box = this.add.rectangle(bx, by, 12, 13, 0x000000).setOrigin(0).setStrokeStyle(1, hexNum(color))
        .setInteractive({ useHandCursor: true });
      this.tap(box, () => {
        g.equip(slot, id);
        this.closePicker();
        this.refreshSlots();
      });
      c.add([box, text(this, bx + 6, by + 7, `${slot + 1}`, color).setOrigin(0.5)]);
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
