import Phaser from 'phaser';
import { COLOR, W, H } from '../config';
import { ITEMS, WEAPONS, defOf, isItem, isWeapon, type ItemId, type WeaponId } from '../data/items';
import {
  addConsumable, emptyWeaponSlot, equipFromStorage, equipWeapon, itemSlotFor, sellFromStorage, sellPrice,
  unequipItem, upgradesFor, weaponLevel, type Upgrade,
} from '../inventory';
import { writeSave, type SaveData } from '../save';
import { ask, button, text, toast } from '../ui';

interface VendorData {
  state: SaveData;
  mode: 'level' | 'base';
  from: string; // scene to resume on Leave
  onLeave: () => void;
}

type Tab = 'buy' | 'sell' | 'upgrade';

const ROW_H = 28;
const LIST_Y = 46;
const MAX_ROWS = 7;

// The shop, used both at in-level vendor stops and at Base. The Base vendor
// adds an Upgrade tab for hull, extra slots and weapon levels.
export class VendorScene extends Phaser.Scene {
  private d!: VendorData;
  private stock: string[] = [];
  private tab: Tab = 'buy';
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
    return s.weapons.includes(id) || s.storage.includes(id);
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
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => { this.content.add(o); return o; };
    const s = this.d.state;

    add(text(this, 6, 7, this.d.mode === 'base' ? 'BASE VENDOR' : 'VENDOR', COLOR.white));
    add(this.add.image(W - 6, 10, 'coinIcon').setOrigin(1, 0.5));
    add(text(this, W - 16, 7, `${s.credits}`, COLOR.yellow).setOrigin(1, 0));

    const tabs: [Tab, string][] = this.d.mode === 'base'
      ? [['buy', 'BUY'], ['sell', 'SELL'], ['upgrade', 'UPGRADE']]
      : [['buy', 'BUY'], ['sell', 'SELL']];
    // UPGRADE is the longest label, so it gets the widest tab.
    const widths = tabs.length === 3 ? [48, 48, 64] : [82, 82];
    let tx = 6;
    tabs.forEach(([tab, label], i) => {
      add(button(this, tx, 22, widths[i], 16, label, () => {
        this.tab = tab; this.page = 0; this.selected = null; this.render();
      }, this.tab === tab ? COLOR.yellow : COLOR.gray));
      tx += widths[i] + 4;
    });

    const rows: { id: string; count: number; up?: Upgrade }[] = this.tab === 'buy' ? this.stock.map((id) => ({ id, count: 1 }))
      : this.tab === 'sell' ? this.groupedStorage()
      : upgradesFor(s).map((u) => ({ id: u.key, count: 1, up: u }));
    const pages = Math.max(1, Math.ceil(rows.length / MAX_ROWS));
    this.page = Math.min(this.page, pages - 1);
    const shown = rows.slice(this.page * MAX_ROWS, (this.page + 1) * MAX_ROWS);

    if (rows.length === 0) {
      const empty = { buy: 'SOLD OUT', sell: 'STORAGE IS EMPTY', upgrade: 'FULLY UPGRADED' }[this.tab];
      add(text(this, W / 2, LIST_Y + 40, empty, COLOR.gray).setOrigin(0.5));
    }

    shown.forEach((row, i) => {
      const y = LIST_Y + i * ROW_H;
      const hit = this.add.rectangle(4, y, W - 8, ROW_H - 2, this.selected === row.id ? 0x1c1c3c : 0x000000).setOrigin(0);
      hit.setInteractive().on('pointerup', () => { this.selected = row.id; this.render(); });
      add(hit);
      if (row.up) {
        this.upgradeRow(add, row.up, y);
        return;
      }
      const def = defOf(row.id);
      add(this.add.image(12, y + 9, def.icon));
      const lv = isWeapon(row.id) && this.tab === 'sell' ? weaponLevel(s, row.id) : 1;
      add(text(this, 22, y + 3, row.count > 1 ? `${def.name} X${row.count}` : lv > 1 ? `${def.name} L${lv}` : def.name));
      if (this.tab === 'buy') {
        add(text(this, 22, y + 14, `${def.price} CR`, COLOR.yellow));
        add(button(this, W - 44, y + 7, 38, 16, 'BUY', () => this.buy(row.id)).setEnabled(s.credits >= def.price));
      } else {
        add(text(this, 22, y + 14, `SELLS ${sellPrice(s, row.id)}`, COLOR.yellow));
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
    const infoY = 248;
    add(this.add.rectangle(4, infoY - 4, W - 8, 1, 0x3c3c3c).setOrigin(0));
    const sel = this.selected;
    const up = sel && this.tab === 'upgrade' ? upgradesFor(s).find((u) => u.key === sel) : null;
    const info = up ? up.desc : sel && !sel.includes(':') && (isWeapon(sel) || isItem(sel)) ? defOf(sel).desc : 'TAP AN ENTRY FOR INFO';
    add(text(this, 6, infoY, info, sel ? COLOR.white : COLOR.dim).setWordWrapWidth(W - 12));

    this.slotStrip(add, 280);

    add(button(this, 6, H - 22, W - 12, 18, this.d.mode === 'base' ? 'BACK' : 'LEAVE', () => this.leave(), COLOR.cyan));
  }

  private upgradeRow(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T, up: Upgrade, y: number) {
    const s = this.d.state;
    add(this.add.image(12, y + 9, up.icon));
    add(text(this, 22, y + 3, up.name));
    const price = `${up.price} CR`;
    add(text(this, 22, y + 14, price, COLOR.yellow));
    add(text(this, 22 + (price.length + 1) * 8, y + 14, up.detail, COLOR.gray));
    add(button(this, W - 44, y + 7, 38, 16, 'BUY', () => this.buyUpgrade(up)).setEnabled(s.credits >= up.price));
  }

  // What's equipped right now, so purchases can be compared. Tap an item to stow it.
  private slotStrip(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T, y: number) {
    const s = this.d.state;
    add(text(this, 6, y, 'WPN', COLOR.gray));
    s.weapons.forEach((w, i) => {
      const x = 34 + i * 14;
      add(this.add.rectangle(x, y - 3, 12, 12, 0x000000).setOrigin(0).setStrokeStyle(1, 0x3c3c3c));
      if (w) add(this.add.image(x + 6, y + 3, WEAPONS[w].icon));
    });
    const ix = 72;
    add(text(this, ix, y, 'ITEM', COLOR.gray));
    s.items.forEach((it, i) => {
      const x = ix + 36 + i * 24;
      add(this.add.rectangle(x, y - 3, 12, 12, 0x000000).setOrigin(0).setStrokeStyle(1, 0x3c3c3c));
      if (!it) return;
      add(this.add.image(x + 6, y + 3, ITEMS[it.id].icon));
      add(text(this, x + 13, y, `${it.count}`));
      const hit = add(this.add.rectangle(x - 2, y - 5, 24, 16, 0x000000, 0).setOrigin(0).setInteractive());
      hit.on('pointerup', () => {
        ask(this, `MOVE ${ITEMS[it.id].name} TO STORAGE?`, ['YES', 'NO'], (a) => {
          if (a === 0) unequipItem(s, i);
          this.render();
        });
      });
    });
  }

  private groupedStorage() {
    const counts = new Map<string, number>();
    for (const id of this.d.state.storage) counts.set(id, (counts.get(id) ?? 0) + 1);
    return [...counts].map(([id, count]) => ({ id, count }));
  }

  private canEquip(id: string) {
    const s = this.d.state;
    if (isWeapon(id)) return true;
    if (!isItem(id)) return false;
    const it = s.items[itemSlotFor(s, id) ?? 0];
    return !(it && it.id === id && it.count >= ITEMS[id].cap);
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
      this.equipBought(id);
    });
  }

  // An empty weapon slot takes it straight away; otherwise ask which weapon to swap out.
  private equipBought(id: WeaponId) {
    const s = this.d.state;
    const name = WEAPONS[id].name;
    const done = (slot: number | null) => {
      if (slot === null) s.storage.push(id);
      else equipWeapon(s, id, slot);
      this.render();
    };
    const empty = emptyWeaponSlot(s);
    if (empty !== null) { done(empty); return; }
    if (s.weapons.length === 1) {
      const cur = WEAPONS[s.weapons[0]!].name;
      ask(this, `REPLACE ${cur} WITH ${name}?\n${cur} MOVES TO STORAGE.`, ['YES', 'NO'], (a) => done(a === 0 ? 0 : null));
      return;
    }
    const list = s.weapons.map((w, i) => `${i + 1} ${WEAPONS[w!].name}`).join('\n');
    ask(this, `REPLACE WHICH?\n${list}`, ['1', '2', 'NO'], (a) => done(a < 2 ? a : null));
  }

  private buyUpgrade(up: Upgrade) {
    const s = this.d.state;
    if (s.credits < up.price) return;
    this.selected = up.key;
    this.render();
    ask(this, `BUY ${up.name}\n${up.detail}\nFOR ${up.price} CR?`, ['YES', 'NO'], (a) => {
      if (a === 0 && s.credits >= up.price) {
        s.credits -= up.price;
        up.apply(s);
        writeSave(s);
        this.selected = null;
        toast(this, 'UPGRADED!', 228, 900);
      }
      this.render();
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
