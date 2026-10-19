import Phaser from 'phaser';
import { COLOR, W, H } from '../config';
import { WEAPONS, type WeaponId } from '../data/items';
import { CONFIG_BOX, TEST_SEQUENCES, type TestWaves } from '../combatTest';
import type { SaveData } from '../save';
import { button, text } from '../ui';

interface TestMenuData {
  waves: TestWaves;
  state: SaveData;
  equip: (slot: number, id: WeaponId) => void;
  resume: () => void;
  quit: () => void;
}

const WEAPON_IDS = Object.keys(WEAPONS) as WeaponId[];
const COLS = 6;
const CELL = 26; // weapon buttons sit this far apart
const GRID_X = (W - COLS * CELL) / 2;
const GRID_Y = 150;
const ROW_H = 44; // room under each row for the slot picker
const hexNum = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;

// Combat test's pause menu: wave sequence toggles, weapon picker, quit. Opened
// over the paused Game scene by the config button, and closed by it again.
export class TestMenuScene extends Phaser.Scene {
  private d!: TestMenuData;
  private picker: Phaser.GameObjects.Container | null = null;
  private slotTags: Phaser.GameObjects.Text[] = [];
  private weaponName!: Phaser.GameObjects.Text;

  constructor() { super('TestMenu'); }

  init(data: TestMenuData) {
    this.d = data;
    this.picker = null;
    this.slotTags = [];
  }

  create() {
    // Shade over the game; tapping empty space just closes the slot picker.
    this.add.rectangle(0, 0, W, H, 0x000000, 0.8).setOrigin(0).setInteractive()
      .on('pointerdown', () => this.closePicker());
    text(this, W / 2, 8, 'COMBAT TEST', COLOR.yellow).setOrigin(0.5, 0);

    text(this, 14, 24, 'WAVES', COLOR.gray);
    TEST_SEQUENCES.forEach((seq, i) => this.toggle(14, 34 + i * 20, W - 28, 16, seq.name, i));

    text(this, 14, GRID_Y - 12, 'WEAPONS', COLOR.gray);
    WEAPON_IDS.forEach((id, i) => this.weaponButton(id, GRID_X + (i % COLS) * CELL + 2, GRID_Y + Math.floor(i / COLS) * ROW_H));
    this.weaponName = text(this, W / 2, GRID_Y + 2 * ROW_H - 4, '', COLOR.white).setOrigin(0.5, 0);
    this.refreshSlots();

    button(this, 14, 258, W - 28, 18, 'QUIT TO MENU', () => this.d.quit(), COLOR.red);

    // The config button again, lit, in the same place: tap to resume.
    const { x, y, size } = CONFIG_BOX;
    this.add.rectangle(x, y, size, size, 0x000000).setOrigin(0).setStrokeStyle(1, hexNum(COLOR.yellow))
      .setInteractive({ useHandCursor: true }).on('pointerdown', () => this.d.resume());
    this.add.image(x + size / 2, y + size / 2, 'iconGear').setTint(hexNum(COLOR.yellow));
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

  private weaponButton(id: WeaponId, x: number, y: number) {
    const box = this.add.rectangle(x, y, 22, 22, 0x000000).setOrigin(0).setStrokeStyle(1, 0x7c7c7c)
      .setInteractive({ useHandCursor: true });
    this.add.image(x + 11, y + 11, WEAPONS[id].icon).setScale(2);
    // Which slot it's in, if any, in the corner.
    this.slotTags.push(text(this, x + 23, y - 2, '', COLOR.cyan).setOrigin(1, 0).setData('id', id).setDepth(1));
    box.on('pointerdown', () => this.openPicker(id, x, y));
  }

  // Slot buttons 1 and 2 under the tapped weapon.
  private openPicker(id: WeaponId, x: number, y: number) {
    this.closePicker();
    this.weaponName.setText(WEAPONS[id].name);
    const c = this.add.container(0, 0).setDepth(5);
    [0, 1].forEach((slot) => {
      const bx = Phaser.Math.Clamp(x - 1 + slot * 13, 2, W - 14);
      const held = this.d.state.weapons[slot] === id;
      c.add(button(this, bx, y + 24, 12, 13, `${slot + 1}`, () => {
        this.d.equip(slot, id);
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
    const w = this.d.state.weapons;
    for (const t of this.slotTags) {
      const id = t.getData('id') as WeaponId;
      t.setText(w[0] === id ? '1' : w[1] === id ? '2' : '');
    }
    this.weaponName.setText(`1 ${w[0] ? WEAPONS[w[0]].name : '-'}\n2 ${w[1] ? WEAPONS[w[1]].name : '-'}`).setAlign('center');
  }
}
