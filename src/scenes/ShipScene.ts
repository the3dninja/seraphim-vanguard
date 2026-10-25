import Phaser from 'phaser';
import { COLOR, W, H } from '../config';
import {
  KITS, defOf, isGear, isItem, isKit, isWeapon, stackLabel, type GearId, type KitId, type WeaponId,
} from '../data/items';
import {
  applyKit, equipFromStorage, equipGear, equipStack, equipWeapon, gearLevel, gearSlotPrice, itemCap, itemSlotPrice, kitTargets,
  unequipGear, unequipItem, unequipWeapon, weaponLevel, weaponSlotPrice,
} from '../inventory';
import { writeSave, type SaveData } from '../save';
import { button, choose, text } from '../ui';

interface ShipData {
  state: SaveData;
  onLeave: () => void;
}

type Kind = 'weapon' | 'item' | 'gear';
type Filter = Kind | 'all';

// Slots around the big ship: weapons near the nose, gear on the sides, items
// in a row along the bottom. `n` is the slot's number within its kind.
interface SlotDef { kind: Kind; n: number; x: number; y: number }
const SLOT = 22;
const SLOTS: SlotDef[] = [
  { kind: 'weapon', n: 0, x: 44, y: 32 },
  { kind: 'weapon', n: 1, x: W - 44 - SLOT, y: 32 },
  { kind: 'gear', n: 0, x: 32, y: 66 },
  { kind: 'gear', n: 1, x: W - 32 - SLOT, y: 66 },
  { kind: 'item', n: 0, x: W / 2 - SLOT / 2 - 32, y: 110 },
  { kind: 'item', n: 1, x: W / 2 - SLOT / 2, y: 110 },
  { kind: 'item', n: 2, x: W / 2 - SLOT / 2 + 32, y: 110 },
];
// What a locked slot will cost at the Base vendor.
const slotPrice = (def: SlotDef) =>
  (def.kind === 'weapon' ? weaponSlotPrice : def.kind === 'gear' ? gearSlotPrice : itemSlotPrice)(def.n);

const TABS: { f: Filter; label: string }[] = [
  { f: 'all', label: 'ALL' }, { f: 'weapon', label: 'WPN' }, { f: 'gear', label: 'GEAR' }, { f: 'item', label: 'ITEM' },
];
const TAB_Y = 146;
const LIST_Y = 164;
const ROW_H = 20;
const MAX_ROWS = 4;
const PAGER_Y = LIST_Y + MAX_ROWS * ROW_H + 2;
const INFO_Y = 262;
const DRAG_START = 5; // px of movement before a press becomes a drag

const SLOT_ART: Record<Kind, string> = { weapon: 'slotWeapon', item: 'slotItem', gear: 'slotGear' };
// Upgrade Kits list with the items, but are used with the USE button rather than equipped.
const kindOf = (id: string): Kind => (isWeapon(id) ? 'weapon' : isItem(id) || isKit(id) ? 'item' : 'gear');
const KIND_NAME: Record<Kind, string> = { weapon: 'WEAPON', item: 'ITEM', gear: 'GEAR' };

// What the player has picked up: a slot or a storage entry. Picking a second
// thing of the matching kind (slot then entry, or entry then slot) equips it.
type Sel = { from: 'slot'; slot: number } | { from: 'storage'; id: string } | null;

interface Focusable { id: string; x: number; y: number; w: number; h: number; activate: () => void }
interface Press { from: 'slot' | 'row'; slot?: number; id?: string; x: number; y: number; dragging: boolean }

// The Base ship loadout screen: drag storage entries onto slots (or tap one,
// then tap a slot), drag slots back to storage to stow. Arrow keys and Enter
// do the same on a keyboard. Every change autosaves.
export class ShipScene extends Phaser.Scene {
  private d!: ShipData;
  private content!: Phaser.GameObjects.Container;
  private sel: Sel = null;
  private filter: Filter = 'all';
  private page = 0;
  private focusables: Focusable[] = [];
  private focus = 'slot:0';
  private keyboardMode = false;
  private press: Press | null = null;
  private ghost: Phaser.GameObjects.Image | null = null;
  private ring: Phaser.GameObjects.Rectangle | null = null;
  private message = ''; // feedback for the last action, shown in the info box

  constructor() { super('Ship'); }

  init(data: ShipData) {
    this.d = data;
    this.sel = null;
    this.filter = 'all';
    this.page = 0;
    this.focus = 'slot:0';
    this.keyboardMode = false;
    this.press = null;
    this.ghost = null;
    this.message = '';
  }

  create() {
    this.scene.bringToTop(); // draw over Base, which sits later in the scene list
    this.cameras.main.fadeIn(250);
    this.add.rectangle(0, 0, W, H, 0x000000).setOrigin(0).setInteractive();
    this.content = this.add.container(0, 0);
    this.setupInput();
    this.render();
  }

  private get s() { return this.d.state; }

  // --- Slots -------------------------------------------------------------

  // Extra slots are bought at the Base vendor.
  private unlocked(def: SlotDef) {
    const counts: Record<Kind, number> = { weapon: this.s.weapons.length, item: this.s.items.length, gear: this.s.gear.length };
    return def.n < counts[def.kind];
  }

  private contents(def: SlotDef): { id: string; count: number } | null {
    if (!this.unlocked(def)) return null;
    if (def.kind === 'weapon') {
      const w = this.s.weapons[def.n];
      return w ? { id: w, count: 1 } : null;
    }
    if (def.kind === 'gear') {
      const g = this.s.gear[def.n];
      return g ? { id: g, count: 1 } : null;
    }
    const it = this.s.items[def.n];
    return it ? { id: it.id, count: it.count } : null;
  }

  // --- Drawing -----------------------------------------------------------

  private render() {
    this.content.removeAll(true);
    this.focusables = [];
    this.ring = null;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T) => { this.content.add(o); return o; };
    const s = this.s;

    add(text(this, 6, 7, 'SHIP', COLOR.white));
    add(this.add.image(W - 6, 10, 'coinIcon').setOrigin(1, 0.5));
    add(text(this, W - 14, 7, `${s.credits}`, COLOR.yellow).setOrigin(1, 0));

    add(this.add.image(W / 2, 80, 'shipLarge').setScale(2));

    SLOTS.forEach((def, i) => this.drawSlot(add, def, i));

    // Storage list with filter tabs.
    TABS.forEach((t, i) => {
      const b = add(button(this, 6 + i * 42, TAB_Y, 40, 14, t.label, () => this.setFilter(t.f),
        this.filter === t.f ? COLOR.yellow : COLOR.gray));
      this.focusable(`tab:${t.f}`, b.x, b.y, 40, 14, () => this.setFilter(t.f));
    });

    const rows = this.rows();
    const pages = Math.max(1, Math.ceil(rows.length / MAX_ROWS));
    this.page = Math.min(this.page, pages - 1);
    const shown = rows.slice(this.page * MAX_ROWS, (this.page + 1) * MAX_ROWS);
    const dropTarget = this.sel?.from === 'slot' && this.contents(SLOTS[this.sel.slot]);
    add(this.add.rectangle(4, LIST_Y - 2, W - 8, MAX_ROWS * ROW_H + 2, 0x000000)
      .setOrigin(0).setStrokeStyle(1, dropTarget ? 0x3cbcfc : 0x3c3c3c));
    if (rows.length === 0) {
      const empty = this.filter === 'gear' ? 'NO GEAR YET' : 'STORAGE IS EMPTY';
      add(text(this, W / 2, LIST_Y + 30, empty, COLOR.gray).setOrigin(0.5));
    }
    shown.forEach((row, i) => {
      const y = LIST_Y + i * ROW_H;
      const def = defOf(row.id);
      const picked = this.sel?.from === 'storage' && this.sel.id === row.id;
      const hit = add(this.add.rectangle(5, y, W - 10, ROW_H - 2, picked ? 0x1c1c3c : 0x000000).setOrigin(0));
      hit.setInteractive().on('pointerdown', (p: Phaser.Input.Pointer) => {
        this.press = { from: 'row', id: row.id, x: p.x, y: p.y, dragging: false };
      });
      add(this.add.image(14, y + 9, def.icon));
      add(text(this, 24, y + 5, row.count > 1 ? `${def.name} X${row.count}` : def.name, picked ? COLOR.yellow : COLOR.white));
      this.focusable(`row:${i}`, 5, y, W - 10, ROW_H - 2, () => this.tapRow(row.id));
    });

    if (pages > 1) {
      const prev = () => { this.page = (this.page + pages - 1) % pages; this.render(); };
      const next = () => { this.page = (this.page + 1) % pages; this.render(); };
      add(button(this, 6, PAGER_Y, 36, 14, '<', prev));
      add(text(this, W / 2, PAGER_Y + 7, `${this.page + 1}/${pages}`, COLOR.gray).setOrigin(0.5));
      add(button(this, W - 42, PAGER_Y, 36, 14, '>', next));
      this.focusable('pg:prev', 6, PAGER_Y, 36, 14, prev);
      this.focusable('pg:next', W - 42, PAGER_Y, 36, 14, next);
    }

    this.drawInfo(add);

    // Back, plus one button that does the obvious thing with the selection,
    // for players who don't drag.
    add(button(this, 6, H - 22, 82, 18, 'BACK', () => this.leave(), COLOR.cyan));
    this.focusable('btn:back', 6, H - 22, 82, 18, () => this.leave());
    const act = this.actionFor();
    add(button(this, 92, H - 22, 82, 18, act?.label ?? 'EQUIP', () => this.act()).setEnabled(!!act));
    this.focusable('btn:act', 92, H - 22, 82, 18, () => this.act());

    if (!this.focusables.some((f) => f.id === this.focus)) {
      this.focus = this.focusables.find((f) => f.id.startsWith(this.focus.split(':')[0]))?.id ?? 'btn:back';
    }
    if (this.keyboardMode) {
      const f = this.focusables.find((x) => x.id === this.focus)!;
      this.ring = add(this.add.rectangle(f.x - 2, f.y - 2, f.w + 4, f.h + 4).setOrigin(0).setStrokeStyle(1, 0xf8b800));
      this.tweens.add({ targets: this.ring, alpha: 0.3, duration: 400, yoyo: true, repeat: -1 });
    }
  }

  private drawSlot(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T, def: SlotDef, i: number) {
    const open = this.unlocked(def);
    const held = this.contents(def);
    const picked = this.sel?.from === 'slot' && this.sel.slot === i;
    const target = open && this.sel?.from === 'storage' && kindOf(this.sel.id) === def.kind;
    const border = picked ? 0xf8b800 : target ? 0x3cbcfc : open ? 0x7c7c7c : 0x3c3c3c;
    const box = add(this.add.rectangle(def.x, def.y, SLOT, SLOT, held ? 0x000000 : 0x101018).setOrigin(0).setStrokeStyle(1, border));
    const cx = def.x + SLOT / 2, cy = def.y + SLOT / 2;
    if (held) {
      add(this.add.image(cx, cy, defOf(held.id).icon).setScale(2));
      // Stacks show against their cap under the slot, like 1/3.
      const it = def.kind === 'item' ? this.s.items[def.n] : null;
      if (it) add(text(this, cx, def.y + SLOT + 2, stackLabel(it, itemCap(this.s, it.id)), COLOR.white).setOrigin(0.5, 0));
    } else {
      // Empty or locked: a faint picture of what the slot takes.
      add(this.add.image(cx, open ? cy : cy + 3, SLOT_ART[def.kind]).setAlpha(open ? 0.6 : 0.35));
    }
    if (!open) {
      add(this.add.image(cx, def.y + 5, 'lock'));
      add(text(this, cx, def.y + SLOT + 2, `${slotPrice(def)}`, COLOR.dim).setOrigin(0.5, 0));
    }
    box.setInteractive().on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.press = { from: 'slot', slot: i, x: p.x, y: p.y, dragging: false };
    });
    this.focusable(`slot:${i}`, def.x, def.y, SLOT, SLOT, () => this.tapSlot(i));
  }

  private drawInfo(add: <T extends Phaser.GameObjects.GameObject>(o: T) => T) {
    add(this.add.rectangle(4, INFO_Y - 4, W - 8, 1, 0x3c3c3c).setOrigin(0));
    if (this.message) {
      add(text(this, 6, INFO_Y, this.message, COLOR.yellow).setWordWrapWidth(W - 12));
      return;
    }
    let title = '';
    let body = 'DRAG AN ENTRY ONTO A SLOT, OR TAP IT THEN TAP A SLOT.';
    let id: string | null = null;
    const sel = this.sel;
    if (sel?.from === 'storage') {
      id = sel.id;
    } else if (sel?.from === 'slot') {
      const slot = SLOTS[sel.slot];
      const held = this.contents(slot);
      if (held) {
        id = held.id;
      } else {
        title = `EMPTY ${KIND_NAME[slot.kind]} SLOT`;
        body = `TAP ${slot.kind === 'item' ? 'AN ITEM' : slot.kind === 'gear' ? 'GEAR' : 'A WEAPON'} IN STORAGE TO EQUIP IT.`;
      }
    }
    if (id) {
      title = isWeapon(id) ? `${defOf(id).name} LV${weaponLevel(this.s, id)}`
        : isGear(id) ? `${defOf(id).name} LV${gearLevel(this.s, id)}` : defOf(id).name;
      body = defOf(id).desc;
      if (isItem(id)) add(text(this, W - 6, INFO_Y, `MAX ${itemCap(this.s, id)}`, COLOR.gray).setOrigin(1, 0));
    }
    if (title) add(text(this, 6, INFO_Y, title, COLOR.cyan));
    add(text(this, 6, title ? INFO_Y + 11 : INFO_Y, body, title ? COLOR.white : COLOR.dim).setWordWrapWidth(W - 12));
  }

  private focusable(id: string, x: number, y: number, w: number, h: number, activate: () => void) {
    this.focusables.push({ id, x, y, w, h, activate });
  }

  private rows() {
    const counts = new Map<string, number>();
    for (const id of this.s.storage) {
      if (this.filter === 'all' || kindOf(id) === this.filter) counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return [...counts].map(([id, count]) => ({ id, count }));
  }

  // --- Actions -----------------------------------------------------------

  private setFilter(f: Filter) {
    this.filter = f;
    this.page = 0;
    if (this.sel?.from === 'storage' && f !== 'all' && kindOf(this.sel.id) !== f) this.sel = null;
    this.render();
  }

  private tapSlot(i: number) {
    const def = SLOTS[i];
    if (!this.unlocked(def)) {
      this.say(`LOCKED ${KIND_NAME[def.kind]} SLOT. BUY IT FOR ${slotPrice(def)} CR IN THE BASE VENDOR'S UPGRADE TAB.`);
      return;
    }
    const sel = this.sel;
    if (sel?.from === 'storage') {
      if (kindOf(sel.id) === def.kind) this.place(sel.id, def.n);
      else this.say(`THAT GOES IN ${kindOf(sel.id) === 'item' ? 'AN' : 'A'} ${KIND_NAME[kindOf(sel.id)]} SLOT.`, false);
      return;
    }
    this.sel = sel?.from === 'slot' && sel.slot === i ? null : { from: 'slot', slot: i };
    this.render();
  }

  private tapRow(id: string) {
    const sel = this.sel;
    if (sel?.from === 'slot' && SLOTS[sel.slot].kind === kindOf(id)) {
      this.place(id, SLOTS[sel.slot].n);
      return;
    }
    this.sel = sel?.from === 'storage' && sel.id === id ? null : { from: 'storage', id };
    this.render();
  }

  // Equip a storage entry into slot `n` of its kind, or wherever it fits best.
  private place(id: string, n?: number) {
    const s = this.s;
    if (isKit(id)) { this.useKit(id); return; }
    if (isWeapon(id)) {
      if (n === undefined) equipFromStorage(s, s.storage.indexOf(id));
      else { s.storage.splice(s.storage.indexOf(id), 1); equipWeapon(s, id, n); }
    } else if (isItem(id)) {
      if (!equipStack(s, id, n)) { this.say('THAT STACK IS ALREADY FULL.'); return; }
    } else if (isGear(id)) {
      if (s.gear.length === 0) { this.say('NO GEAR SLOT YET. BUY ONE IN THE BASE VENDOR\'S UPGRADE TAB.'); return; }
      s.storage.splice(s.storage.indexOf(id), 1);
      equipGear(s, id, n);
    }
    this.changed();
  }

  // Apply an Upgrade Kit from storage to a weapon or gear the player picks.
  private useKit(kit: KitId) {
    const s = this.s;
    const targets = kitTargets(s, kit);
    if (targets.length === 0) { this.say(`NOTHING TO UPGRADE WITH THE ${KITS[kit].name} YET.`); return; }
    const lvOf = (id: WeaponId | GearId) => (isWeapon(id) ? weaponLevel(s, id) : gearLevel(s, id as GearId));
    choose(this, `${KITS[kit].name}: UPGRADE WHICH?`,
      targets.map((id) => ({ label: `${defOf(id).name.slice(0, 11)} ${lvOf(id)}>${lvOf(id) + 1}`, icon: defOf(id).icon })), (i) => {
        if (i < 0) return;
        s.storage.splice(s.storage.indexOf(kit), 1);
        applyKit(s, targets[i]);
        this.sel = null;
        this.changed();
      });
  }

  private stow(i: number) {
    const def = SLOTS[i];
    if (def.kind === 'weapon' && !unequipWeapon(this.s, def.n)) {
      this.say('THE SHIP NEEDS A WEAPON IN SLOT 1. SWAP ANOTHER ONE IN INSTEAD.', false);
      return;
    }
    if (def.kind === 'item') unequipItem(this.s, def.n);
    if (def.kind === 'gear') unequipGear(this.s, def.n);
    this.changed();
  }

  private actionFor(): { label: string; run: () => void } | null {
    const sel = this.sel;
    if (sel?.from === 'storage') return { label: isKit(sel.id) ? 'USE' : 'EQUIP', run: () => this.place(sel.id) };
    if (sel?.from === 'slot' && this.contents(SLOTS[sel.slot])) return { label: 'STOW', run: () => this.stow(sel.slot) };
    return null;
  }

  private act() { this.actionFor()?.run(); }

  // Show a note in the info box until the next action.
  private say(msg: string, clearSel = true) {
    if (clearSel) this.sel = null;
    this.message = msg;
    this.render();
    this.message = '';
  }

  private changed() {
    this.sel = null;
    writeSave(this.s);
    this.render();
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

  // --- Input -------------------------------------------------------------

  private setupInput() {
    this.input.keyboard!.enabled = true;
    this.input.on('pointerdown', () => {
      // Hide the keyboard ring without redrawing, which would destroy what was just pressed.
      this.keyboardMode = false;
      this.ring?.setVisible(false);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => this.dragMove(p));
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => this.release(p));
    this.input.on('pointerupoutside', () => this.cancelPress());

    this.input.keyboard!.on('keydown', (e: KeyboardEvent) => {
      const dirs: Record<string, [number, number]> = {
        ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
        w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0],
      };
      const dir = dirs[e.key] ?? dirs[e.key.toLowerCase()];
      if (dir) {
        e.preventDefault();
        if (this.keyboardMode) this.moveFocus(dir[0], dir[1]);
        this.keyboardMode = true;
        this.render();
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (!this.keyboardMode) { this.keyboardMode = true; this.render(); return; }
        this.focusables.find((f) => f.id === this.focus)?.activate();
      } else if (e.key === 'Escape' || e.key === 'Backspace') {
        e.preventDefault();
        if (this.sel) { this.sel = null; this.render(); } else this.leave();
      }
    });
  }

  // Pick the nearest focusable in the pressed direction, favoring ones in line.
  private moveFocus(dx: number, dy: number) {
    const cur = this.focusables.find((f) => f.id === this.focus);
    if (!cur) return;
    const cx = cur.x + cur.w / 2, cy = cur.y + cur.h / 2;
    let best: Focusable | null = null;
    let bestScore = Infinity;
    for (const f of this.focusables) {
      if (f === cur) continue;
      const fx = f.x + f.w / 2, fy = f.y + f.h / 2;
      const ahead = (fx - cx) * dx + (fy - cy) * dy;
      if (ahead <= 1) continue;
      const side = Math.abs((fx - cx) * dy) + Math.abs((fy - cy) * dx);
      const score = ahead + side * 2;
      if (score < bestScore) { bestScore = score; best = f; }
    }
    if (best) this.focus = best.id;
  }

  private dragMove(p: Phaser.Input.Pointer) {
    const pr = this.press;
    if (!pr || !p.isDown) return;
    if (!pr.dragging) {
      if (Phaser.Math.Distance.Between(pr.x, pr.y, p.x, p.y) < DRAG_START) return;
      const id = pr.from === 'row' ? pr.id! : this.contents(SLOTS[pr.slot!])?.id;
      if (!id) { this.press = null; return; } // empty or locked slot: nothing to drag
      pr.dragging = true;
      this.sel = pr.from === 'row' ? { from: 'storage', id } : { from: 'slot', slot: pr.slot! };
      this.render(); // light up where it can go
      this.ghost = this.add.image(p.x, p.y, defOf(id).icon).setScale(2).setAlpha(0.85).setDepth(500);
    }
    // Hold the icon above a finger so it stays visible; drops still land where the finger is.
    this.ghost?.setPosition(p.x, p.wasTouch ? p.y - 16 : p.y);
  }

  private release(p: Phaser.Input.Pointer) {
    const pr = this.press;
    if (!pr) return;
    this.press = null;
    this.ghost?.destroy();
    this.ghost = null;
    if (!pr.dragging) {
      if (pr.from === 'row') this.tapRow(pr.id!);
      else this.tapSlot(pr.slot!);
      return;
    }
    const over = SLOTS.findIndex((d) => p.x >= d.x - 3 && p.x < d.x + SLOT + 3 && p.y >= d.y - 3 && p.y < d.y + SLOT + 3);
    if (pr.from === 'row') {
      if (over >= 0) this.tapSlot(over); // same rules as tap-then-tap
      else { this.sel = null; this.render(); }
    } else if (p.y >= TAB_Y && p.y < INFO_Y) {
      this.stow(pr.slot!);
    } else {
      this.sel = null;
      this.render();
    }
  }

  private cancelPress() {
    if (!this.press) return;
    this.press = null;
    this.ghost?.destroy();
    this.ghost = null;
    this.sel = null;
    this.render();
  }
}
