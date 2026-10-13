import type { ItemId, WeaponId } from './data/items';

export interface ItemStack { id: ItemId; count: number }

// Everything that survives between sessions. Saved to the browser's
// localStorage whenever the player reaches Base.
export interface SaveData {
  v: 2;
  level: number; // next level to play, 1-based
  credits: number;
  maxHealth: number; // 5 to start, +1 per Hull upgrade up to 10
  weapons: (WeaponId | null)[]; // one entry per unlocked weapon slot; slot 0 always holds one
  items: (ItemStack | null)[]; // one entry per unlocked item slot
  gearSlots: number; // unlocked gear slots (no gear exists yet)
  weaponLevels: Partial<Record<WeaponId, number>>; // 1 to 5; missing means 1
  storage: string[]; // weapon and item ids not in a slot
}

const KEY = 'seraphim-vanguard-save';

export function newSave(): SaveData {
  return {
    v: 2, level: 1, credits: 0, maxHealth: 5,
    weapons: ['pulse'], items: [null], gearSlots: 0, weaponLevels: {}, storage: [],
  };
}

// Version 1 saves had exactly one weapon and one item slot.
function migrate(data: any): SaveData | null {
  if (data?.v === 2) return { ...newSave(), ...data };
  if (data?.v === 1) {
    const { weapon, item, ...rest } = data;
    return { ...newSave(), ...rest, v: 2, weapons: [weapon ?? 'pulse'], items: [item ?? null] };
  }
  return null;
}

// Storage can be unavailable (private mode, blocked site data), so every access is guarded.
export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeSave(data: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Nothing to do: the game keeps running, it just won't remember.
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export const cloneSave = (d: SaveData): SaveData => JSON.parse(JSON.stringify(d));
