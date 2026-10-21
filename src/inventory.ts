import {
  GEAR, ITEMS, KITS, MAX_GEAR_LEVEL, MAX_WEAPON_LEVEL, WEAPONS, defOf, gearStats, isGear, isItem, isWeapon,
  type GearId, type ItemId, type KitId, type WeaponId,
} from './data/items';
import type { SaveData } from './save';

// --- Weapons -------------------------------------------------------------

export const equippedWeapons = (s: SaveData) => s.weapons.filter((w): w is WeaponId => !!w);
export const weaponLevel = (s: SaveData, id: WeaponId) => s.weaponLevels[id] ?? 1;
export const weaponStats = (s: SaveData, id: WeaponId) => WEAPONS[id].stats(weaponLevel(s, id));

// The slot a new weapon should go in when the player didn't pick one: the
// first empty slot, or null if every slot is full.
export const emptyWeaponSlot = (s: SaveData) => {
  const i = s.weapons.indexOf(null);
  return i >= 0 ? i : null;
};

// Put a weapon in a slot, sending whatever was there to storage.
export function equipWeapon(s: SaveData, id: WeaponId, slot = emptyWeaponSlot(s) ?? 0) {
  const old = s.weapons[slot];
  if (old) s.storage.push(old);
  s.weapons[slot] = id;
}

// The ship always keeps a weapon in slot 1, so only later slots can be emptied.
export function unequipWeapon(s: SaveData, slot: number): boolean {
  const id = s.weapons[slot];
  if (!id || slot === 0) return false;
  s.storage.push(id);
  s.weapons[slot] = null;
  return true;
}

// --- Gear ----------------------------------------------------------------

export const equippedGear = (s: SaveData) => s.gear.filter((g): g is GearId => !!g);
export const gearLevel = (s: SaveData, id: GearId) => s.gearLevels[id] ?? 1;
export const hasGear = (s: SaveData, id: GearId) => s.gear.includes(id);

// Max health with Hull Plating counted in.
export const totalMaxHealth = (s: SaveData) =>
  s.maxHealth + (hasGear(s, 'plating') ? gearStats.plating(gearLevel(s, 'plating')).health : 0);

export const emptyGearSlot = (s: SaveData) => {
  const i = s.gear.indexOf(null);
  return i >= 0 ? i : null;
};

// Put gear in a slot, sending whatever was there to storage.
export function equipGear(s: SaveData, id: GearId, slot = emptyGearSlot(s) ?? 0) {
  const old = s.gear[slot];
  if (old) s.storage.push(old);
  s.gear[slot] = id;
}

export function unequipGear(s: SaveData, slot: number) {
  const id = s.gear[slot];
  if (!id) return;
  s.storage.push(id);
  s.gear[slot] = null;
}

// --- Items ---------------------------------------------------------------

// Where one more of a consumable fits: a slot with the same item and room,
// else an empty slot, else null.
export function itemSlotFor(s: SaveData, id: ItemId): number | null {
  const same = s.items.findIndex((it) => it && it.id === id && it.count < ITEMS[id].cap);
  if (same >= 0) return same;
  const empty = s.items.indexOf(null);
  return empty >= 0 ? empty : null;
}

// Consumables go into an item slot when they fit, otherwise into storage.
export function addConsumable(s: SaveData, id: ItemId) {
  const slot = itemSlotFor(s, id);
  if (slot === null) { s.storage.push(id); return; }
  const it = s.items[slot];
  if (it) it.count++;
  else s.items[slot] = { id, count: 1 };
}

export function unequipItem(s: SaveData, slot: number) {
  const it = s.items[slot];
  if (!it) return;
  for (let i = 0; i < it.count; i++) s.storage.push(it.id);
  s.items[slot] = null;
}

// Fill one item slot with as many of a consumable from storage as it holds,
// sending a different item that was there back to storage. Returns false if
// nothing could move (the slot already holds a full stack of it).
export function equipStack(s: SaveData, id: ItemId, slot = itemSlotFor(s, id) ?? 0): boolean {
  if (s.items[slot] && s.items[slot]!.id !== id) unequipItem(s, slot);
  let moved = false;
  while (s.storage.includes(id)) {
    const it = s.items[slot];
    if (it && it.count >= ITEMS[id].cap) break;
    s.storage.splice(s.storage.indexOf(id), 1);
    if (it) it.count++;
    else s.items[slot] = { id, count: 1 };
    moved = true;
  }
  return moved;
}

// Move one storage entry into the slot it would naturally go in, swapping
// out whatever was there. Returns false if it had nowhere to go.
export function equipFromStorage(s: SaveData, index: number): boolean {
  const id = s.storage[index];
  if (isWeapon(id)) {
    s.storage.splice(index, 1);
    equipWeapon(s, id);
    return true;
  }
  if (isGear(id)) {
    if (s.gear.length === 0) return false;
    s.storage.splice(index, 1);
    equipGear(s, id);
    return true;
  }
  if (isItem(id)) {
    const slot = itemSlotFor(s, id) ?? 0;
    const it = s.items[slot];
    if (it && it.id === id && it.count >= ITEMS[id].cap) return false;
    s.storage.splice(index, 1);
    if (it && it.id === id) { it.count++; return true; }
    unequipItem(s, slot);
    s.items[slot] = { id, count: 1 };
    return true;
  }
  return false;
}

// --- Selling -------------------------------------------------------------

// Credits spent upgrading a weapon or gear to its current level.
export function upgradeSpend(s: SaveData, id: WeaponId | GearId) {
  const level = isWeapon(id) ? weaponLevel(s, id) : gearLevel(s, id);
  const price = isWeapon(id) ? weaponUpgradePrice : gearUpgradePrice;
  let total = 0;
  for (let lv = 2; lv <= level; lv++) total += price(lv);
  return total;
}

// Half of what it cost, upgrades included.
export const sellPrice = (s: SaveData, id: string) =>
  Math.floor((defOf(id).price + (isWeapon(id) || isGear(id) ? upgradeSpend(s, id) : 0)) / 2);

export function sellFromStorage(s: SaveData, index: number) {
  const [id] = s.storage.splice(index, 1);
  if (!id) return;
  s.credits += sellPrice(s, id);
  // Weapons and gear are one of a kind, so a sold one forgets its upgrades.
  if (isWeapon(id)) delete s.weaponLevels[id];
  if (isGear(id)) delete s.gearLevels[id];
}

// --- Base vendor upgrades ------------------------------------------------

export const MAX_HEALTH_CAP = 10;
export const MAX_WEAPON_SLOTS = 2;
export const MAX_ITEM_SLOTS = 3;
export const MAX_GEAR_SLOTS = 2;

// Placeholder prices for playtesting. Slot prices match the Ship screen.
// Weapon upgrades: 300, 500, 700 and 900 for levels 2 to 5. Gear: 200 to 500.
export const weaponUpgradePrice = (nextLevel: number) => 200 * nextLevel - 100;
export const gearUpgradePrice = (nextLevel: number) => 100 * nextLevel;
export const hullPrice = (s: SaveData) => 100 * (s.maxHealth - 4);
export const weaponSlotPrice = (n: number) => [0, 600][n] ?? 0;
export const itemSlotPrice = (n: number) => [0, 300, 1000][n] ?? 0;
export const gearSlotPrice = (n: number) => [600, 1000][n] ?? 0;

export interface Upgrade {
  key: string;
  name: string;
  detail: string; // short note after the price, at most 6 characters
  desc: string;
  icon: string;
  price: number;
  apply: (s: SaveData) => void;
}

// What the Base vendor's Upgrade tab offers right now. Each kind shows only
// its next step, so a bought upgrade is replaced by the one after it.
export function upgradesFor(s: SaveData): Upgrade[] {
  const list: Upgrade[] = [];
  if (s.maxHealth < MAX_HEALTH_CAP) {
    list.push({
      key: 'hull', name: 'HULL PLATE', detail: `HP ${s.maxHealth}>${s.maxHealth + 1}`, icon: 'icon_hull',
      desc: `+1 MAX HEALTH, UP TO ${MAX_HEALTH_CAP}.`,
      price: hullPrice(s), apply: (st) => { st.maxHealth++; },
    });
  }
  if (s.weapons.length < MAX_WEAPON_SLOTS) {
    const n = s.weapons.length;
    list.push({
      key: 'wslot', name: `WEAPON SLOT ${n + 1}`, detail: '', icon: 'slotWeaponSmall',
      desc: 'BOTH EQUIPPED WEAPONS FIRE AT THE SAME TIME.',
      price: weaponSlotPrice(n), apply: (st) => { st.weapons.push(null); },
    });
  }
  if (s.items.length < MAX_ITEM_SLOTS) {
    const n = s.items.length;
    list.push({
      key: 'islot', name: `ITEM SLOT ${n + 1}`, detail: '', icon: 'slotItemSmall',
      desc: 'ONE MORE ITEM, WITH ITS OWN BUTTON IN FLIGHT.',
      price: itemSlotPrice(n), apply: (st) => { st.items.push(null); },
    });
  }
  if (s.gear.length < MAX_GEAR_SLOTS) {
    const n = s.gear.length;
    list.push({
      key: 'gslot', name: `GEAR SLOT ${n + 1}`, detail: '', icon: 'slotGearSmall',
      desc: 'HOLDS ONE SPECIAL GEAR. GEAR WORKS ON ITS OWN.',
      price: gearSlotPrice(n), apply: (st) => { st.gear.push(null); },
    });
  }
  // Every weapon the player owns, equipped or stored.
  const owned = [...new Set([...equippedWeapons(s), ...s.storage.filter(isWeapon)])];
  for (const id of owned) {
    const lv = weaponLevel(s, id);
    if (lv >= MAX_WEAPON_LEVEL) continue;
    list.push({
      key: `wlv:${id}`, name: WEAPONS[id].name, detail: `LV ${lv}>${lv + 1}`, icon: WEAPONS[id].icon,
      desc: lv + 1 === 3 || lv + 1 === 5 ? `MORE DAMAGE AND ${signature(id, lv + 1)}` : 'MORE DAMAGE PER SHOT.',
      price: weaponUpgradePrice(lv + 1), apply: (st) => { st.weaponLevels[id] = lv + 1; },
    });
  }
  for (const id of [...new Set([...equippedGear(s), ...s.storage.filter(isGear)])]) {
    const lv = gearLevel(s, id);
    if (lv >= MAX_GEAR_LEVEL) continue;
    list.push({
      key: `glv:${id}`, name: GEAR[id].name, detail: `LV ${lv}>${lv + 1}`, icon: GEAR[id].icon,
      desc: GEAR[id].levelUp,
      price: gearUpgradePrice(lv + 1), apply: (st) => { st.gearLevels[id] = lv + 1; },
    });
  }
  return list;
}

function signature(id: WeaponId, lv: number) {
  const before = WEAPONS[id].stats(lv - 1);
  const after = WEAPONS[id].stats(lv);
  if (after.shots.length > before.shots.length) return `${after.shots.length} SHOTS AT ONCE.`;
  return 'A FASTER FIRE RATE.';
}

// --- Upgrade Kits ----------------------------------------------------------

// What a kit can raise: weapons or gear the player owns (equipped or stored)
// that aren't at level 5 yet.
export function kitTargets(s: SaveData, kit: KitId): (WeaponId | GearId)[] {
  if (KITS[kit].target === 'weapon') {
    return [...new Set([...equippedWeapons(s), ...s.storage.filter(isWeapon)])].filter((w) => weaponLevel(s, w) < MAX_WEAPON_LEVEL);
  }
  return [...new Set([...equippedGear(s), ...s.storage.filter(isGear)])].filter((g) => gearLevel(s, g) < MAX_GEAR_LEVEL);
}

export function applyKit(s: SaveData, target: WeaponId | GearId) {
  if (isWeapon(target)) s.weaponLevels[target] = Math.min(MAX_WEAPON_LEVEL, weaponLevel(s, target) + 1);
  else s.gearLevels[target] = Math.min(MAX_GEAR_LEVEL, gearLevel(s, target) + 1);
}
