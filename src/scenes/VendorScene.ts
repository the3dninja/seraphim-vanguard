import Phaser from 'phaser';
import { COLOR, W, H } from '../config';
import {
  GEAR, ITEMS, KITS, WEAPONS, defOf, isGear, isItem, isKit, isWeapon, stackLabel, type GearId, type ItemId, type KitId,
  type WeaponId,
} from '../data/items';
import {
  addConsumable, applyKit, emptyGearSlot, emptyWeaponSlot, equipFromStorage, equipGear, equipWeapon, gearLevel,
  itemSlotFor, kitTargets, sellFromStorage, sellPrice, unequipGear, unequipItem, upgradesFor, weaponLevel, type Upgrade,
} from '../inventory';
import { writeSave, type SaveData } from '../save';
import { ask, button, choose, text, toast } from '../ui';

interface VendorData {
  state: SaveData;
  mode: 'level' | 'base';
  from: string; // scene to resume on Leave
  onLeave: () => void;
}

type Tab = 'buy' | 'sell' | 'upgrade';

const ROW_H = 28;
const LIST_Y = 46;
const LIST_END = 228; // the list, storage strip and pager share the space down to here
const INFO_Y = 234;
const STRIP_Y = 270; // equipped slots: weapons and gear, then items on the line below
const STORE_X = 64; // where storage icons start, after the label
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

  private owns(id: WeaponId | GearId) {
    const s = this.d.state;
    return (s.weapons as string[]).includes(id) || (s.gear as string[]).includes(id) || s.storage.includes(id);
  }

  // The Base vendor always has its full stock: Base weapons and gear from
  // their first level on, and the common consumables. In-level vendors roll
  // 4 to 6 entries on arrival: 0 to 2 common consumables (Repair Kits most
  // often), 2 to 3 exclusives (in-level weapons and gear, and rare
  // consumables), and sometimes an Upgrade Kit, more often in later levels.
  private rollStock(): string[] {
    const s = this.d.state;
    const lv = s.level;
    const weapons = (Object.keys(WEAPONS) as WeaponId[]).filter((w) => !this.owns(w) && lv >= WEAPONS[w].from);
    const gear = (Object.keys(GEAR) as GearId[]).filter((g) => !this.owns(g) && lv >= GEAR[g].from);
    const common = (Object.keys(ITEMS) as ItemId[]).filter((i) => !ITEMS[i].rare);
    if (this.d.mode === 'base') {
      return [...weapons.filter((w) => WEAPONS[w].where === 'base'), ...gear.filter((g) => GEAR[g].where === 'base'), ...common];
    }
    const out: string[] = [];
    const consumables = Phaser.Math.RND.weightedPick([0, 1, 1, 2, 2]);
    for (let i = 0; i < consumables; i++) {
      const id = Math.random() < 0.5 ? 'repair' : Phaser.Utils.Array.GetRandom(common);
      if (!out.includes(id)) out.push(id);
    }
    const rare = (Object.keys(ITEMS) as ItemId[]).filter((i) => ITEMS[i].rare);
    const pool = Phaser.Utils.Array.Shuffle([
      ...weapons.filter((w) => WEAPONS[w].where === 'level'), ...gear.filter((g) => GEAR[g].where === 'level'), ...rare,
    ]);
    out.push(...pool.slice(0, Phaser.Math.Between(2, 3)));
    if (Math.random() < 0.12 + lv * 0.03) out.push(Math.random() < 0.55 ? 'wkit' : 'gkit');
    // Top up with common consumables so there are always at least four.
    for (const id of Phaser.Utils.Array.Shuffle([...common])) if (out.length < 4 && !out.includes(id)) out.push(id);
    return out;
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

    // Storage sits in the space under the list as a compact strip of icons and
    // counts. The Sell tab lists storage already, so it leaves the strip out.
    const stored = this.tab === 'sell' ? [] : this.storageLayout();
    const storeLines = this.tab === 'sell' ? 0 : Math.max(1, ...stored.map((e) => e.line + 1));
    const storeH = storeLines ? storeLines * 13 + 4 : 0;
    let maxRows = Math.floor((LIST_END - LIST_Y - storeH) / ROW_H);
    if (rows.length > maxRows) maxRows = Math.floor((LIST_END - LIST_Y - storeH - 18) / ROW_H);
    const pages = Math.max(1, Math.ceil(rows.length / maxRows));
    this.page = Math.min(this.page, pages - 1);
    const shown = rows.slice(this.page * maxRows, (this.page + 1) * maxRows);

    if (rows.length === 0) {
      const empty = { buy: 'SOLD OUT', sell: 'STORAGE IS EMPTY', upgrade: 'FULLY UPGRADED' }[this.tab];
      add(text(this, W / 2, LIST_Y + 20, empty, COLOR.gray).setOrigin(0.5));
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
      const lv = this.tab !== 'sell' ? 1 : isWeapon(row.id) ? weaponLevel(s, row.id) : isGear(row.id) ? gearLevel(s, row.id) : 1;
      add(text(this, 22, y + 3, row.count > 1 ? `${def.name} X${row.count}` : lv > 1 ? `${def.name} L${lv}` : def.name));
      if (this.tab === 'buy') {
        add(text(this, 22, y + 14, `${def.price} CR`, COLOR.yellow));
        add(button(this, W - 44, y + 7, 38, 16, 'BUY', () => this.buy(row.id)).setEnabled(s.credits >= def.price));
      } else {
        add(text(this, 22, y + 14, `${sellPrice(s, row.id)} CR`, COLOR.yellow));
        if (isKit(row.id)) {
          const kit = row.id;
          add(button(this, W - 86, y + 11, 40, 14, 'USE', () => this.useKit(kit, true)).setEnabled(kitTargets(s, kit).length > 0));
        } else {
          add(button(this, W - 86, y + 11, 40, 14, 'EQUIP', () => {
            equipFromStorage(s, s.storage.indexOf(row.id));
            this.render();
          }).setEnabled(this.canEquip(row.id)));
        }
        add(button(this, W - 42, y + 11, 36, 14, 'SELL', () => {
          sellFromStorage(s, s.storage.indexOf(row.id));
          this.render();
        }));
      }
    });

    let y = LIST_Y + Math.max(shown.length, rows.length === 0 ? 1 : 0) * ROW_H + 2;
    if (storeLines) {
      this.storageStrip(add, stored, y);
      y += storeH;
    }
    if (pages > 1) {
      add(button(this, 6, y, 40, 14, '<', () => { this.page = (this.page + pages - 1) % pages; this.render(); }));
      add(text(this, W / 2, y + 7, `${this.page + 1}/${pages}`, COLOR.gray).setOrigin(0.5));
      add(button(this, W - 46, y, 40, 14, '>', () => { this.page = (this.page + 1) % pages; this.render(); }));
    }

    // Info box for the tapped entry.
    add(this.add.rectangle(4, INFO_Y - 4, W - 8, 1, 0x3c3c3c).setOrigin(0));
    const sel = this.selected;
    const up = sel && this.tab === 'upgrade' ? upgradesFor(s).find((u) => u.key === sel) : null;
    const info = up ? up.desc : sel && !sel.includes(':') && (isWeapon(sel) || isItem(sel) || isGear(sel) || isKit(sel)) ? defOf(sel).desc : 'TAP AN ENTRY FOR INFO';
    add(text(this, 6, INFO_Y, info, sel ? COLOR.white : COLOR.dim).setWordWrapWidth(W - 12));

    this.slotStrip(add, STRIP_Y);

    add(button(this, 6, H - 22, W - 12, 18, this.d.mode === 'base' ? 'BACK' : 'LEAVE', () => this.leave(), COLOR.cyan));
  }

  // Storage entries flowed into lines after the label: icon, count, small gap.
  private storageLayout() {
    let x = STORE_X;
    let line = 0;
    return this.groupedStorage().map((e) => {
      const w = 10 + `${e.count}`.length * 8 + 6;
      if (x + w - 6 > W - 4) { x = STORE_X; line++; }
      const at = { ...e, x, line, w };
      x += w;
      return at;
    });
  }

  // What's in storage, as icons with a count, so it takes little room. Tap one for its info.
  private storageStrip(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T,
    stored: { id: string; count: number; x: number; line: number; w: number }[], y: number) {
    add(this.add.rectangle(4, y, W - 8, 1, 0x1c1c3c).setOrigin(0));
    add(text(this, 6, y + 4, 'STORAGE', COLOR.gray));
    if (stored.length === 0) add(text(this, STORE_X, y + 4, 'EMPTY', COLOR.dim));
    for (const e of stored) {
      const ly = y + 4 + e.line * 13;
      const picked = this.selected === e.id;
      add(this.add.image(e.x + 4, ly + 4, defOf(e.id).icon));
      add(text(this, e.x + 10, ly, `${e.count}`, picked ? COLOR.yellow : COLOR.white));
      const hit = add(this.add.rectangle(e.x - 2, ly - 3, e.w - 2, 13, 0x000000, 0).setOrigin(0).setInteractive());
      hit.on('pointerup', () => { this.selected = e.id; this.render(); });
      if (picked) add(this.add.rectangle(e.x - 2, ly - 3, e.w - 3, 13).setOrigin(0).setStrokeStyle(1, 0xf8b800));
    }
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

  // What's equipped right now, so purchases can be compared: weapons and gear
  // on one line, items with their stack counts (like 1/3) on the next. Tap an
  // item or gear to stow it.
  private slotStrip(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T, y: number) {
    const s = this.d.state;
    const box = (x: number, by: number) => add(this.add.rectangle(x, by - 3, 12, 12, 0x000000).setOrigin(0).setStrokeStyle(1, 0x3c3c3c));
    const stowOnTap = (x: number, by: number, w: number, name: string, stow: () => void) => {
      const hit = add(this.add.rectangle(x - 2, by - 5, w, 16, 0x000000, 0).setOrigin(0).setInteractive());
      hit.on('pointerup', () => {
        ask(this, `MOVE ${name} TO STORAGE?`, ['YES', 'NO'], (a) => {
          if (a === 0) stow();
          this.render();
        });
      });
    };
    add(text(this, 6, y, 'WPN', COLOR.gray));
    s.weapons.forEach((w, i) => {
      const x = 34 + i * 14;
      box(x, y);
      if (w) add(this.add.image(x + 6, y + 3, WEAPONS[w].icon));
    });
    if (s.gear.length > 0) {
      add(text(this, 76, y, 'GEAR', COLOR.gray));
      s.gear.forEach((g, i) => {
        const x = 112 + i * 14;
        box(x, y);
        if (!g) return;
        add(this.add.image(x + 6, y + 3, GEAR[g].icon));
        stowOnTap(x, y, 16, GEAR[g].name, () => unequipGear(s, i));
      });
    }
    const iy = y + 15;
    add(text(this, 6, iy, 'ITEM', COLOR.gray));
    s.items.forEach((it, i) => {
      const x = 42 + i * 44;
      box(x, iy);
      if (!it) return;
      add(this.add.image(x + 6, iy + 3, ITEMS[it.id].icon));
      add(text(this, x + 14, iy, stackLabel(it)));
      stowOnTap(x, iy, 40, ITEMS[it.id].name, () => unequipItem(s, i));
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
    if (isGear(id)) return s.gear.length > 0;
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
    if (isKit(id)) {
      this.stock.splice(this.stock.indexOf(id), 1);
      this.render();
      if (kitTargets(s, id).length === 0) {
        s.storage.push(id);
        ask(this, `${def.name} STOWED.\nNOTHING TO UPGRADE YET.`, ['OK'], () => this.render());
        return;
      }
      ask(this, `${def.name}\nAPPLY OR STOW?`, ['APPLY', 'STOW'], (a) => {
        if (a === 1) { s.storage.push(id); this.render(); return; }
        this.useKit(id, false);
      });
      return;
    }
    if (!isWeapon(id) && !isGear(id)) return;
    this.stock = this.stock.filter((x) => x !== id);
    this.render();
    if (isGear(id) && s.gear.length === 0) {
      s.storage.push(id);
      ask(this, `${def.name} STOWED.\nBUY A GEAR SLOT AT THE\nBASE VENDOR TO USE IT.`, ['OK'], () => this.render());
      return;
    }
    ask(this, `${def.name}\nEQUIP OR STOW?`, ['EQUIP', 'STOW'], (choice) => {
      if (choice === 1) {
        s.storage.push(id);
        this.render();
        return;
      }
      if (isGear(id)) this.equipBoughtGear(id);
      else this.equipBought(id);
    });
  }

  // Same as weapons: an empty gear slot takes it, otherwise ask what to swap out.
  private equipBoughtGear(id: GearId) {
    const s = this.d.state;
    const name = GEAR[id].name;
    const done = (slot: number | null) => {
      if (slot === null) s.storage.push(id);
      else equipGear(s, id, slot);
      this.render();
    };
    const empty = emptyGearSlot(s);
    if (empty !== null) { done(empty); return; }
    if (s.gear.length === 1) {
      const cur = GEAR[s.gear[0]!].name;
      ask(this, `REPLACE ${cur} WITH ${name}?\n${cur} MOVES TO STORAGE.`, ['YES', 'NO'], (a) => done(a === 0 ? 0 : null));
      return;
    }
    const list = s.gear.map((g, i) => `${i + 1} ${GEAR[g!].name}`).join('\n');
    ask(this, `REPLACE WHICH?\n${list}`, ['1', '2', 'NO'], (a) => done(a < 2 ? a : null));
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

  // Pick what an Upgrade Kit raises. A stored kit is taken out of storage once used;
  // a kit that was just bought goes to storage if the pick is cancelled.
  private useKit(kit: KitId, stored: boolean) {
    const s = this.d.state;
    const targets = kitTargets(s, kit);
    const lvOf = (id: WeaponId | GearId) => (isWeapon(id) ? weaponLevel(s, id) : gearLevel(s, id as GearId));
    choose(this, `${KITS[kit].name}: UPGRADE WHICH?`,
      targets.map((id) => ({ label: `${defOf(id).name.slice(0, 11)} ${lvOf(id)}>${lvOf(id) + 1}`, icon: defOf(id).icon })), (i) => {
        if (i < 0) {
          if (!stored) s.storage.push(kit);
          this.render();
          return;
        }
        if (stored) s.storage.splice(s.storage.indexOf(kit), 1);
        applyKit(s, targets[i]);
        if (this.d.mode === 'base') writeSave(s);
        toast(this, 'UPGRADED!', 228, 900);
        this.render();
      });
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
