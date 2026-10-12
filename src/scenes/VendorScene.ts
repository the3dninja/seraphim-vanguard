import Phaser from 'phaser';
import { COLOR, W, H } from '../config';
import { ITEMS, WEAPONS, defOf, isItem, isWeapon, type ItemId, type WeaponId } from '../data/items';
import {
  addConsumable, equipFromStorage, equipWeapon, sellFromStorage, sellPrice, unequipItem,
} from '../inventory';
import type { SaveData } from '../save';
import { ask, button, text } from '../ui';

interface VendorData {
  state: SaveData;
  mode: 'level' | 'base';
  from: string; // scene to resume on Leave
  onLeave: () => void;
}

const ROW_H = 28;
const LIST_Y = 46;
const MAX_ROWS = 7;

// The shop, used both at in-level vendor stops and at Base.
export class VendorScene extends Phaser.Scene {
  private d!: VendorData;
  private stock: string[] = [];
  private tab: 'buy' | 'sell' = 'buy';
  private selected: string | null = null;
  private content!: Phaser.GameObjects.Container;
  private page = 0;

  constructor() { super('Vendor'); }

  init(data: VendorData) {
    this.d = data;
    this.tab = 'buy';
    this.selected = null;
    this.page = 0;
    this.stock = this.rollStock();
  }

  create() {
    this.scene.bringToTop(); // draw over Base, which sits later in the scene list
    this.cameras.main.fadeIn(250);
    this.add.rectangle(0, 0, W, H, 0x000000).setOrigin(0).setInteractive();
    this.content = this.add.container(0, 0);
    this.render();
  }

  private owns(id: WeaponId) {
    const s = this.d.state;
    return s.weapon === id || s.storage.includes(id);
  }

  // In-level vendors roll a small random stock on arrival; Base always has the basics.
  private rollStock(): string[] {
    const items: string[] = [];
    const weapons = (Object.keys(WEAPONS) as WeaponId[]).filter((w) => !this.owns(w));
    if (this.d.mode === 'base') return [...weapons, ...Object.keys(ITEMS)];
    const chance: Record<ItemId, number> = { repair: 0.85, shield: 0.45, overdrive: 0.55 };
    for (const id of Object.keys(ITEMS) as ItemId[]) if (Math.random() < chance[id]) items.push(id);
    if (items.length === 0) items.push('repair');
    return [...weapons, ...items];
  }

  private render() {
    this.content.removeAll(true);
    const add = (o: Phaser.GameObjects.GameObject) => { this.content.add(o); return o; };
    const s = this.d.state;

    add(text(this, 6, 7, this.d.mode === 'base' ? 'BASE VENDOR' : 'VENDOR', COLOR.white));
    add(this.add.image(W - 6, 10, 'coinIcon').setOrigin(1, 0.5));
    add(text(this, W - 14, 7, `${s.credits}`, COLOR.yellow).setOrigin(1, 0));

    const tabBtn = (x: number, label: string, tab: 'buy' | 'sell') =>
      add(button(this, x, 22, 82, 16, label, () => { this.tab = tab; this.page = 0; this.selected = null; this.render(); },
        this.tab === tab ? COLOR.yellow : COLOR.gray));
    tabBtn(6, 'BUY', 'buy');
    tabBtn(92, 'SELL', 'sell');

    const rows = this.tab === 'buy' ? this.stock.map((id) => ({ id, count: 1 })) : this.groupedStorage();
    const pages = Math.max(1, Math.ceil(rows.length / MAX_ROWS));
    this.page = Math.min(this.page, pages - 1);
    const shown = rows.slice(this.page * MAX_ROWS, (this.page + 1) * MAX_ROWS);

    if (rows.length === 0) {
      add(text(this, W / 2, LIST_Y + 40, this.tab === 'buy' ? 'SOLD OUT' : 'STORAGE IS EMPTY', COLOR.gray).setOrigin(0.5));
    }

    shown.forEach((row, i) => {
      const y = LIST_Y + i * ROW_H;
      const def = defOf(row.id);
      const hit = this.add.rectangle(4, y, W - 8, ROW_H - 2, this.selected === row.id ? 0x1c1c3c : 0x000000).setOrigin(0);
      hit.setInteractive().on('pointerup', () => { this.selected = row.id; this.render(); });
      add(hit);
      add(this.add.image(12, y + 9, def.icon));
      add(text(this, 22, y + 3, row.count > 1 ? `${def.name} X${row.count}` : def.name));
      if (this.tab === 'buy') {
        add(text(this, 22, y + 14, `${def.price} CR`, COLOR.yellow));
        add(button(this, W - 44, y + 7, 38, 16, 'BUY', () => this.buy(row.id)).setEnabled(s.credits >= def.price));
      } else {
        add(text(this, 22, y + 14, `SELLS ${sellPrice(row.id)}`, COLOR.yellow));
        add(button(this, W - 86, y + 11, 40, 14, 'EQUIP', () => {
          equipFromStorage(s, s.storage.indexOf(row.id));
          this.render();
        }).setEnabled(this.canEquip(row.id)));
        add(button(this, W - 42, y + 11, 36, 14, 'SELL', () => {
          sellFromStorage(s, s.storage.indexOf(row.id));
          this.render();
        }));
      }
    });

    if (pages > 1) {
      add(button(this, 6, LIST_Y + MAX_ROWS * ROW_H - 2, 40, 14, '<', () => { this.page = (this.page + pages - 1) % pages; this.render(); }));
      add(text(this, W / 2, LIST_Y + MAX_ROWS * ROW_H + 5, `${this.page + 1}/${pages}`, COLOR.gray).setOrigin(0.5));
      add(button(this, W - 46, LIST_Y + MAX_ROWS * ROW_H - 2, 40, 14, '>', () => { this.page = (this.page + 1) % pages; this.render(); }));
    }

    // Info box for the tapped entry.
    const infoY = 260;
    add(this.add.rectangle(4, infoY - 4, W - 8, 1, 0x3c3c3c).setOrigin(0));
    const info = this.selected ? defOf(this.selected).desc : 'TAP AN ENTRY FOR INFO';
    add(text(this, 6, infoY, info, this.selected ? COLOR.white : COLOR.dim).setWordWrapWidth(W - 12));

    // Slot strip: what's equipped right now, so purchases can be compared.
    const slotY = 284;
    add(text(this, 6, slotY, 'WPN', COLOR.gray));
    add(this.add.image(38, slotY + 3, WEAPONS[s.weapon].icon));
    add(text(this, 76, slotY, 'ITEM', COLOR.gray));
    if (s.item) {
      add(this.add.image(116, slotY + 3, ITEMS[s.item.id].icon));
      add(text(this, 124, slotY, `${s.item.count}/${ITEMS[s.item.id].cap}`));
      const itemHit = this.add.rectangle(108, slotY - 4, 66, 14, 0x000000, 0).setOrigin(0).setInteractive();
      itemHit.on('pointerup', () => {
        ask(this, `MOVE ${ITEMS[s.item!.id].name} TO STORAGE?`, ['YES', 'NO'], (i) => {
          if (i === 0) unequipItem(s);
          this.render();
        });
      });
      add(itemHit);
    } else {
      add(text(this, 112, slotY, 'EMPTY', COLOR.dim));
    }

    add(button(this, 6, H - 22, W - 12, 18, this.d.mode === 'base' ? 'BACK' : 'LEAVE', () => this.leave(), COLOR.cyan));
  }

  private groupedStorage() {
    const counts = new Map<string, number>();
    for (const id of this.d.state.storage) counts.set(id, (counts.get(id) ?? 0) + 1);
    return [...counts].map(([id, count]) => ({ id, count }));
  }

  private canEquip(id: string) {
    const s = this.d.state;
    if (isWeapon(id)) return true;
    if (isItem(id)) return !(s.item && s.item.id === id && s.item.count >= ITEMS[id].cap);
    return false;
  }

  private buy(id: string) {
    const s = this.d.state;
    const def = defOf(id);
    if (s.credits < def.price) return;
    s.credits -= def.price;
    this.selected = id;
    if (isItem(id)) {
      addConsumable(s, id);
      this.render();
      return;
    }
    if (!isWeapon(id)) return;
    this.stock = this.stock.filter((x) => x !== id);
    this.render();
    ask(this, `${def.name}\nEQUIP OR STOW?`, ['EQUIP', 'STOW'], (choice) => {
      if (choice === 1) {
        s.storage.push(id);
        this.render();
        return;
      }
      const cur = WEAPONS[s.weapon].name;
      ask(this, `REPLACE ${cur} WITH ${def.name}?\n${cur} MOVES TO STORAGE.`, ['YES', 'NO'], (yes) => {
        if (yes === 0) equipWeapon(s, id);
        else s.storage.push(id);
        this.render();
      });
    });
  }

  private leave() {
    this.cameras.main.fadeOut(250);
    this.cameras.main.once('camerafadeoutcomplete', () => {
      this.scene.stop();
      this.scene.resume(this.d.from);
      this.d.onLeave();
    });
  }
}
