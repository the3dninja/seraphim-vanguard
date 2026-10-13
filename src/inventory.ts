import { ITEMS, WEAPONS, defOf, isItem, isWeapon, type ItemId, type WeaponId } from './data/items';
import type { SaveData } from './save';

// Consumables go into the item slot when they fit, otherwise into storage.
export function addConsumable(s: SaveData, id: ItemId) {
  if (!s.item) s.item = { id, count: 1 };
  else if (s.item.id === id && s.item.count < ITEMS[id].cap) s.item.count++;
  else s.storage.push(id);
}

export function equipWeapon(s: SaveData, id: WeaponId) {
  s.storage.push(s.weapon);
  s.weapon = id;
}

// Move one storage entry into its slot, swapping out whatever was there.
export function equipFromStorage(s: SaveData, index: number) {
  const id = s.storage[index];
  if (isWeapon(id)) {
    s.storage.splice(index, 1);
    equipWeapon(s, id);
  } else if (isItem(id)) {
    if (s.item && s.item.id === id) {
      if (s.item.count >= ITEMS[id].cap) return;
      s.storage.splice(index, 1);
      s.item.count++;
      return;
    }
    s.storage.splice(index, 1);
    if (s.item) for (let i = 0; i < s.item.count; i++) s.storage.push(s.item.id);
    s.item = { id, count: 1 };
  }
}

// Fill the item slot with as many of one consumable from storage as it holds,
// sending a different item that was there back to storage. Returns false if
// nothing could move (the slot already holds a full stack of it).
export function equipStack(s: SaveData, id: ItemId): boolean {
  if (s.item && s.item.id !== id) unequipItem(s);
  let moved = false;
  while (s.storage.includes(id) && (!s.item || s.item.count < ITEMS[id].cap)) {
    s.storage.splice(s.storage.indexOf(id), 1);
    if (s.item) s.item.count++;
    else s.item = { id, count: 1 };
    moved = true;
  }
  return moved;
}

export function unequipItem(s: SaveData) {
  if (!s.item) return;
  for (let i = 0; i < s.item.count; i++) s.storage.push(s.item.id);
  s.item = null;
}

export const sellPrice = (id: string) => Math.floor(defOf(id).price / 2);

export function sellFromStorage(s: SaveData, index: number) {
  const [id] = s.storage.splice(index, 1);
  if (id) s.credits += sellPrice(id);
}

export const weaponDef = (s: SaveData) => WEAPONS[s.weapon];
