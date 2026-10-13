// Prices and stats are placeholders for playtesting, not final numbers.

export type WeaponId = 'pulse' | 'spread';
export type ItemId = 'repair' | 'shield' | 'overdrive';

export interface Shot { dx: number; deg: number } // x offset from the nose, degrees from straight up

export interface WeaponDef {
  name: string;
  price: number;
  desc: string;
  icon: string;
  texture: string;
  // Stats at each upgrade level, 1 to 5. Damage rises every level; levels 3
  // and 5 also bring the weapon's signature bump.
  stats: (level: number) => { interval: number; shots: Shot[]; damage: number };
}

export const MAX_WEAPON_LEVEL = 5;
const levelDamage = (base: number, level: number) => base * (1 + 0.25 * (level - 1));
const fan = (...degs: number[]): Shot[] => degs.map((deg) => ({ dx: 0, deg }));

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
    stats: (lv) => ({
      interval: lv >= 3 ? 115 : 140,
      shots: lv >= 5 ? [{ dx: -3, deg: 0 }, { dx: 3, deg: 0 }] : fan(0),
      damage: levelDamage(1, lv),
    }),
  },
  spread: {
    name: 'SPREAD GUN', price: 60, icon: 'icon_spread', texture: 'pellet',
    desc: '3 SHOTS IN A FAN. COVERS THE SCREEN.',
    stats: (lv) => ({
      interval: lv >= 3 ? 220 : 260,
      shots: lv >= 5 ? fan(-28, -14, 0, 14, 28) : fan(-14, 0, 14),
      damage: levelDamage(1, lv),
    }),
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
