import type { ItemId, WeaponId } from './data/items';

// Everything that survives between sessions. Saved to the browser's
// localStorage whenever the player reaches Base.
export interface SaveData {
  v: 1;
  level: number; // next level to play, 1-based
  credits: number;
  maxHealth: number;
  weapon: WeaponId;
  item: { id: ItemId; count: number } | null; // the one item slot
  storage: string[]; // weapon and item ids not in a slot
}

const KEY = 'seraphim-vanguard-save';

export function newSave(): SaveData {
  return { v: 1, level: 1, credits: 0, maxHealth: 5, weapon: 'pulse', item: null, storage: [] };
}

// Storage can be unavailable (private mode, blocked site data), so every access is guarded.
export function loadSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.v !== 1) return null;
    return { ...newSave(), ...data };
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
