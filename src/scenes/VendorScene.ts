import Phaser from 'phaser';
import { COLOR, W, H } from '../config';
import {
  GEAR, ITEMS, KITS, WEAPONS, defOf, isGear, isItem, isKit, isWeapon, kindOf, scoreOf, stackLabel, type GearId, type ItemId, type KitId,
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
  repair?: Repair; // in-level vendors fix the hull for credits
  first?: boolean; // the campaign's very first vendor stop (level 1, after segment 1)
}

// The ship's health as the level knows it, for the in-level Repair tab.
export interface Repair { health: () => number; max: number; heal: (n: number) => void }

// What one heart of repair costs at an in-level vendor: more later in the campaign.
export const repairPrice = (level: number) => 6 + level * 2;

// The score in-level vendors favor at a level: 1 at level 1, up to 9 at level 15.
const targetScore = (level: number) => 1 + ((level - 1) * 8) / 14;

// How likely something is to be stocked: things near the target score are
// most likely, weaker things a bit less, and stronger things fall off fast
// (a little under 1 in 7 for 3 points above, never 7 or more above).
function stockWeight(id: string, level: number) {
  const d = scoreOf(id) - targetScore(level);
  if (d >= 7) return 0;
  return d > 0 ? Math.max(0.03, Math.exp(-(d * d) / 4.5)) : Math.max(0.3, 1 + d * 0.12);
}

// `n` different picks from the pool, each weighted by stockWeight.
function pickByStrength(pool: string[], level: number, n: number) {
  const left = pool.map((id) => ({ id, w: stockWeight(id, level) })).filter((e) => e.w > 0);
  const out: string[] = [];
  while (out.length < n && left.length) {
    let r = Math.random() * left.reduce((sum, e) => sum + e.w, 0);
    const i = left.findIndex((e) => (r -= e.w) <= 0);
    out.push(left.splice(i < 0 ? left.length - 1 : i, 1)[0].id);
  }
  return out;
}

type Tab = 'buy' | 'sell' | 'upgrade' | 'repair';

// Everything sits at a fixed height, so nothing shifts as lists grow or shrink:
// three rows per page, the page arrows, the info box (up to 4 lines), Storage,
// the equipped slots and the Leave button.
const ROW_H = 34;
const PER_PAGE = 3;
const LIST_Y = 44;
const PAGER_Y = LIST_Y + PER_PAGE * ROW_H + 2;
const INFO_Y = PAGER_Y + 22;
const STORE_LINES = 3;
const STRIP_Y = 272; // equipped slots: weapons and gear, then items on the line below
const STORE_Y = STRIP_Y - 10 - STORE_LINES * 13;
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
  // Exclusives are picked by strength: each has a score from 1 to 9, and the
  // further into the campaign, the higher the score vendors favor. Stronger
  // things still turn up early now and then, just rarely.
  private rollStock(): string[] {
    const s = this.d.state;
    const lv = s.level;
    // The Credit Booster is rare early on: the Base vendor has it from level 4,
    // and in-level vendors mostly pass it over before then.
    const common = (Object.keys(ITEMS) as ItemId[]).filter((i) => !ITEMS[i].rare && (i !== 'booster' || this.d.mode !== 'base' || lv >= 4));
    const skipBooster = (id: string) => id === 'booster' && Math.random() < Math.max(0, 0.85 - (lv - 1) * 0.15);
    if (this.d.mode === 'base') {
      const weapons = (Object.keys(WEAPONS) as WeaponId[]).filter((w) => !this.owns(w) && lv >= WEAPONS[w].from);
      const gear = (Object.keys(GEAR) as GearId[]).filter((g) => !this.owns(g) && lv >= GEAR[g].from);
      return [...weapons.filter((w) => WEAPONS[w].where === 'base'), ...gear.filter((g) => GEAR[g].where === 'base'), ...common];
    }
    if (this.d.first) return this.firstStock(common);
    const out: string[] = [];
    const consumables = Phaser.Math.RND.weightedPick([0, 1, 1, 2, 2]);
    for (let i = 0; i < consumables; i++) {
      const id = Math.random() < 0.5 ? 'repair' : Phaser.Utils.Array.GetRandom(common);
      if (!out.includes(id) && !skipBooster(id)) out.push(id);
    }
    // Gear only shows up once gear slots can be bought (level 6 on).
    const gearOk = lv >= 6 || s.gear.length > 0;
    const pool = [
      ...(Object.keys(WEAPONS) as WeaponId[]).filter((w) => WEAPONS[w].where === 'level' && !this.owns(w)),
      ...(gearOk ? (Object.keys(GEAR) as GearId[]).filter((g) => GEAR[g].where === 'level' && !this.owns(g)) : []),
      ...(Object.keys(ITEMS) as ItemId[]).filter((i) => ITEMS[i].rare),
    ];
    out.push(...pickByStrength(pool, lv, Phaser.Math.Between(2, 3)));
    if (Math.random() < 0.12 + lv * 0.03) out.push(Math.random() < 0.55 ? 'wkit' : 'gkit');
    // Top up with common consumables so there are always at least four.
    for (const id of Phaser.Utils.Array.Shuffle([...common])) if (out.length < 4 && !out.includes(id) && !skipBooster(id)) out.push(id);
    return out;
  }

  // The very first vendor stop is a fixed, affordable spread so new players
  // can actually buy something: a Repair Kit, a Shield Cell and two more cheap
  // consumables, plus one or two pricier picks to show what's out there.
  private firstStock(common: ItemId[]): string[] {
    const cheap = Phaser.Utils.Array.Shuffle(common.filter((i) => i !== 'repair' && i !== 'shield' && ITEMS[i].price <= 25));
    const pool = [
      ...(Object.keys(WEAPONS) as WeaponId[]).filter((w) => WEAPONS[w].where === 'level' && !this.owns(w)),
      ...(Object.keys(ITEMS) as ItemId[]).filter((i) => ITEMS[i].rare && ITEMS[i].price < 200),
    ];
    return ['repair', 'shield', ...cheap.slice(0, 2), ...pickByStrength(pool, 1, Phaser.Math.Between(1, 2))];
  }

  private render() {
    this.content.removeAll(true);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => { this.content.add(o); return o; };
    const s = this.d.state;

    add(text(this, 6, 7, this.d.mode === 'base' ? 'BASE VENDOR' : 'VENDOR', COLOR.white));
    add(this.add.image(W - 6, 10, 'coinIcon').setOrigin(1, 0.5));
    add(text(this, W - 16, 7, `${s.credits}`, COLOR.yellow).setOrigin(1, 0));

    const tabs: [Tab, string][] = this.d.mode === 'base' ? [['buy', 'BUY'], ['sell', 'SELL'], ['upgrade', 'UPGRADE']]
      : this.d.repair ? [['buy', 'BUY'], ['sell', 'SELL'], ['repair', 'REPAIR']]
      : [['buy', 'BUY'], ['sell', 'SELL']];
    // UPGRADE and REPAIR are the longest labels, so they get the widest tab.
    const widths = tabs.length === 3 ? [48, 48, 64] : [82, 82];
    let tx = 6;
    tabs.forEach(([tab, label], i) => {
      add(button(this, tx, 22, widths[i], 16, label, () => {
        this.tab = tab; this.page = 0; this.selected = null; this.render();
      }, this.tab === tab ? COLOR.yellow : COLOR.gray));
      tx += widths[i] + 4;
    });

    if (this.tab === 'repair') this.repairPanel(add);
    else this.listRows(add);

    // Info box for the tapped entry, under the page arrows.
    add(this.add.rectangle(4, INFO_Y - 4, W - 8, 1, 0x3c3c3c).setOrigin(0));
    const sel = this.selected;
    const up = sel && this.tab === 'upgrade' ? upgradesFor(s).find((u) => u.key === sel) : null;
    const info = up ? up.desc
      : sel && !sel.includes(':') && (isWeapon(sel) || isItem(sel) || isGear(sel) || isKit(sel)) ? defOf(sel).desc
      : this.tab === 'repair' ? `REPAIRS COST ${repairPrice(s.level)} CR A HEART AT THIS VENDOR.`
      : 'TAP AN ENTRY FOR INFO';
    add(text(this, 6, INFO_Y, info, sel || this.tab === 'repair' ? COLOR.white : COLOR.dim).setWordWrapWidth(W - 12));

    // Storage, at a fixed spot above the equipped slots. The Sell tab lists storage already.
    if (this.tab !== 'sell') this.storageStrip(add, STORE_Y);

    this.slotStrip(add, STRIP_Y);

    add(button(this, 6, H - 22, W - 12, 18, this.d.mode === 'base' ? 'BACK' : 'LEAVE', () => this.leave(), COLOR.cyan));
  }

  // The Buy, Sell or Upgrade list: three rows a page, each with what kind of
  // thing it is under its name, and the page arrows under the rows.
  private listRows(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T) {
    const s = this.d.state;
    const rows: { id: string; count: number; up?: Upgrade }[] = this.tab === 'buy' ? this.sortedStock().map((id) => ({ id, count: 1 }))
      : this.tab === 'sell' ? this.groupedStorage()
      : upgradesFor(s).map((u) => ({ id: u.key, count: 1, up: u }));
    const pages = Math.max(1, Math.ceil(rows.length / PER_PAGE));
    this.page = Math.min(this.page, pages - 1);
    const shown = rows.slice(this.page * PER_PAGE, (this.page + 1) * PER_PAGE);

    if (rows.length === 0) {
      const empty = { buy: 'SOLD OUT', sell: 'STORAGE IS EMPTY', upgrade: 'FULLY UPGRADED', repair: '' }[this.tab];
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
      const kind = kindOf(row.id);
      add(this.add.image(12, y + 11, def.icon));
      const lv = this.tab !== 'sell' ? 1 : isWeapon(row.id) ? weaponLevel(s, row.id) : isGear(row.id) ? gearLevel(s, row.id) : 1;
      add(text(this, 22, y + 3, row.count > 1 ? `${def.name} X${row.count}` : lv > 1 ? `${def.name} L${lv}` : def.name));
      add(text(this, 22, y + 13, kind.label, kind.color));
      if (this.tab === 'buy') {
        add(text(this, 22, y + 23, `${def.price} CR`, COLOR.yellow));
        add(button(this, W - 44, y + 12, 38, 16, 'BUY', () => this.buy(row.id)).setEnabled(s.credits >= def.price));
      } else {
        add(text(this, 22, y + 23, `${sellPrice(s, row.id)} CR`, COLOR.yellow));
        const by = y + 14;
        if (isKit(row.id)) {
          const kit = row.id;
          add(button(this, W - 86, by, 40, 14, 'USE', () => this.useKit(kit, true)).setEnabled(kitTargets(s, kit).length > 0));
        } else {
          add(button(this, W - 86, by, 40, 14, 'EQUIP', () => {
            equipFromStorage(s, s.storage.indexOf(row.id));
            this.render();
          }).setEnabled(this.canEquip(row.id)));
        }
        add(button(this, W - 42, by, 36, 14, 'SELL', () => {
          sellFromStorage(s, s.storage.indexOf(row.id));
          this.render();
        }));
      }
    });

    if (pages > 1) {
      add(button(this, 6, PAGER_Y, 40, 14, '<', () => { this.page = (this.page + pages - 1) % pages; this.render(); }));
      add(text(this, W / 2, PAGER_Y + 7, `${this.page + 1}/${pages}`, COLOR.gray).setOrigin(0.5));
      add(button(this, W - 46, PAGER_Y, 40, 14, '>', () => { this.page = (this.page + 1) % pages; this.render(); }));
    }
  }

  // The Buy list grouped by kind: weapons, then gear, then kits, then items.
  private sortedStock() {
    const order = (id: string) => (isWeapon(id) ? 0 : isGear(id) ? 1 : isKit(id) ? 2 : ITEMS[id as ItemId]?.rare ? 3 : 4);
    return [...this.stock].sort((a, b) => order(a) - order(b));
  }

  // In-level vendors fix the hull, a heart at a time or all at once.
  private repairPanel(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T) {
    const r = this.d.repair!;
    const s = this.d.state;
    const hp = r.health();
    const price = repairPrice(s.level);
    const missing = r.max - hp;
    add(text(this, 6, LIST_Y + 4, 'HULL', COLOR.gray));
    for (let i = 0; i < r.max; i++) {
      add(this.add.image(44 + (i % 10) * 9, LIST_Y + 8 + Math.floor(i / 10) * 8, i < hp ? 'heart' : 'heartEmpty'));
    }
    if (missing <= 0) {
      add(text(this, W / 2, LIST_Y + 44, 'HULL IS FULL', COLOR.green).setOrigin(0.5));
      return;
    }
    const all = Math.min(missing, Math.floor(s.credits / price));
    const fix = (n: number) => {
      if (n <= 0 || s.credits < n * price) return;
      s.credits -= n * price;
      r.heal(n);
      toast(this, n > 1 ? `+${n} HEALTH` : '+1 HEALTH', LIST_Y + 96, 700);
      this.render();
    };
    add(button(this, 6, LIST_Y + 30, W - 12, 20, `REPAIR 1   ${price} CR`, () => fix(1)).setEnabled(s.credits >= price));
    const label = all >= missing ? `REPAIR ALL   ${missing * price} CR` : `REPAIR ${Math.max(all, 1)}   ${Math.max(all, 1) * price} CR`;
    add(button(this, 6, LIST_Y + 56, W - 12, 20, label, () => fix(Math.max(all, 1))).setEnabled(all > 1));
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
  private storageStrip(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T, y: number) {
    const all = this.storageLayout();
    const stored = all.filter((e) => e.line < STORE_LINES);
    add(this.add.rectangle(4, y, W - 8, 1, 0x1c1c3c).setOrigin(0));
    add(text(this, 6, y + 4, 'STORAGE', COLOR.gray));
    if (all.length === 0) add(text(this, STORE_X, y + 4, 'EMPTY', COLOR.dim));
    if (stored.length < all.length) add(text(this, 6, y + 17, `+${all.length - stored.length}`, COLOR.gray));
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
    add(this.add.image(12, y + 11, up.icon));
    add(text(this, 22, y + 3, up.name));
    const kind = up.key.startsWith('wlv:') ? ['WEAPON LEVEL', '#fc7460'] : up.key.startsWith('glv:') ? ['GEAR LEVEL', '#9878f8'] : ['SHIP UPGRADE', '#3cbcfc'];
    add(text(this, 22, y + 13, kind[0], kind[1]));
    const price = `${up.price} CR`;
    add(text(this, 22, y + 23, price, COLOR.yellow));
    add(text(this, 22 + (price.length + 1) * 8, y + 23, up.detail, COLOR.gray));
    add(button(this, W - 44, y + 12, 38, 16, 'BUY', () => this.buyUpgrade(up)).setEnabled(s.credits >= up.price));
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

  // Gear with no gear slot to put it in asks first, since it can only be stowed.
  private buy(id: string, sure = false) {
    const s = this.d.state;
    const def = defOf(id);
    if (s.credits < def.price) return;
    if (isGear(id) && s.gear.length === 0 && !sure) {
      ask(this, `NO GEAR SLOT YET.\nBUY ${def.name}\nAND STORE IT?`, ['YES', 'NO'], (a) => {
        if (a === 0) this.buy(id, true);
      });
      return;
    }
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
      this.render();
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
