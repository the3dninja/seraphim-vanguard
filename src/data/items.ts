// Prices and stats are placeholders for playtesting, not final numbers.

export type WeaponId = 'pulse' | 'spread';
export type ItemId = 'repair' | 'shield' | 'overdrive';

export interface WeaponDef {
  name: string;
  price: number;
  desc: string;
  icon: string;
  interval: number; // ms between volleys
  angles: number[]; // degrees from straight up, one bullet per angle
  damage: number;
  texture: string;
}

export interface ItemDef {
  name: string;
  price: number;
  desc: string;
  icon: string;
  cap: number; // max stack in one item slot
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pulse: {
    name: 'PULSE BLASTER', price: 40, icon: 'icon_pulse', texture: 'bullet',
    desc: 'FAST STRAIGHT SHOTS. RELIABLE BUT NARROW.',
    interval: 140, angles: [0], damage: 1,
  },
  spread: {
    name: 'SPREAD GUN', price: 60, icon: 'icon_spread', texture: 'pellet',
    desc: '3 SHOTS IN A FAN. COVERS THE SCREEN.',
    interval: 260, angles: [-14, 0, 14], damage: 1,
  },
};

export const ITEMS: Record<ItemId, ItemDef> = {
  repair: { name: 'REPAIR KIT', price: 15, icon: 'icon_repair', cap: 3, desc: 'RESTORES 2 HEALTH.' },
  shield: { name: 'SHIELD CELL', price: 30, icon: 'icon_shield', cap: 2, desc: 'BLOCKS ALL DAMAGE FOR 5 SECONDS.' },
  overdrive: { name: 'OVERDRIVE CELL', price: 20, icon: 'icon_overdrive', cap: 3, desc: 'DOUBLE FIRE RATE FOR 8 SECONDS.' },
};

export const isWeapon = (id: string): id is WeaponId => id in WEAPONS;
export const isItem = (id: string): id is ItemId => id in ITEMS;

export function defOf(id: string): { name: string; price: number; desc: string; icon: string } {
  return isWeapon(id) ? WEAPONS[id] : ITEMS[id as ItemId];
}
