import type { GearId, ItemId, WeaponId } from './data/items';

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
  gear: (GearId | null)[]; // one entry per unlocked gear slot (0 to 2)
  weaponLevels: Partial<Record<WeaponId, number>>; // 1 to 5; missing means 1
  gearLevels: Partial<Record<GearId, number>>; // 1 to 5; missing means 1
  storage: string[]; // weapon, gear and item ids not in a slot
  sides: string[]; // side missions beaten (see data/sides.ts)
  kills: Record<string, number>; // enemies and bosses destroyed, by kind (for the Bestiary)
  seen: string[]; // enemy and boss kinds faced in flight
  // Bestiary entries looked at. Saves from before this have none: everything
  // they'd found counts as looked at (see unreadFoes).
  read?: string[];
}

const KEY = 'seraphim-vanguard-save';

export function newSave(): SaveData {
  return {
    v: 2, level: 1, credits: 0, maxHealth: 5,
    weapons: ['pulse'], items: [null], gear: [], weaponLevels: {}, gearLevels: {}, storage: [], sides: [],
    kills: {}, seen: [], read: [],
  };
}

// Version 1 saves had exactly one weapon and one item slot. Early version 2
// saves counted gear slots (gearSlots) before gear existed.
function migrate(data: any): SaveData | null {
  if (data?.v === 2) {
    const { gearSlots, ...rest } = data;
    const out = { ...newSave(), ...rest };
    if (!Array.isArray(data.gear)) out.gear = Array(gearSlots ?? 0).fill(null);
    rearToGear(out);
    return out;
  }
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

// Rear Guard was a weapon and is now gear: an equipped one goes to storage
// (where its id now reads as gear), and its level carries over.
function rearToGear(s: SaveData) {
  const w = s.weapons as (string | null)[];
  const i = w.indexOf('rear');
  if (i >= 0) {
    w[i] = null;
    s.storage.push('rear');
    // Slot 1 always holds a weapon: move a later one up, or fall back to the Pulse Blaster.
    if (!w[0]) {
      const j = w.findIndex((x) => !!x);
      if (j > 0) { w[0] = w[j]; w[j] = null; } else w[0] = 'pulse';
    }
  }
  const lv = (s.weaponLevels as Record<string, number>).rear;
  if (lv) {
    delete (s.weaponLevels as Record<string, number>).rear;
    s.gearLevels.rear = lv;
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
