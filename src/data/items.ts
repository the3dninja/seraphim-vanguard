// Prices and stats are placeholders for playtesting, not final numbers.

export type WeaponId = 'pulse' | 'spread';
export type ItemId = 'repair' | 'shield' | 'overdrive';
export type GearId = 'deflector' | 'magnet' | 'plating' | 'satellite';

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

// A stack as it shows in a slot: how many against how many fit, like 1/3.
export const stackLabel = (it: { id: ItemId; count: number }) => `${it.count}/${ITEMS[it.id].cap}`;

// Special gear sits in gear slots and works on its own (all passive for now).
// Like weapons, each one is one of a kind and has levels 1 to 5.
export const MAX_GEAR_LEVEL = 5;

export interface GearDef {
  name: string;
  price: number;
  desc: string;
  icon: string;
  from: number; // first level whose vendors stock it
  where: 'base' | 'level'; // Base vendor stock, or an in-level vendor exclusive
  levelUp: string; // what each upgrade level adds, for the Upgrade tab
}

export const GEAR: Record<GearId, GearDef> = {
  plating: {
    name: 'HULL PLATING', price: 400, icon: 'icon_plating', from: 6, where: 'base',
    desc: '+2 MAX HEALTH ON TOP OF HULL UPGRADES.', levelUp: '+1 MAX HEALTH.',
  },
  magnet: {
    name: 'CREDIT MAGNET', price: 300, icon: 'icon_magnet', from: 6, where: 'base',
    desc: 'PULLS IN CREDITS FROM A WIDE RADIUS.', levelUp: 'A WIDER, STRONGER PULL.',
  },
  deflector: {
    name: 'DEFLECTOR', price: 450, icon: 'icon_deflector', from: 6, where: 'level',
    desc: 'ABSORBS 1 HIT, THEN RECHARGES IN 8 SECONDS.', levelUp: 'FASTER RECHARGE. 2 HITS AT LV 3.',
  },
  satellite: {
    name: 'SATELLITE', price: 600, icon: 'icon_satellite', from: 6, where: 'level',
    desc: 'A MINI DRONE CIRCLES YOU AND FIRES SMALL SHOTS.', levelUp: 'FASTER FIRE. 2 DRONES AT LV 5.',
  },
};

// What each gear does at a level, 1 to 5. Read by the game while flying.
export const gearStats = {
  plating: (lv: number) => ({ health: 1 + lv }),
  magnet: (lv: number) => ({ radius: 36 + lv * 8, pull: 70 + lv * 15 }),
  deflector: (lv: number) => ({ hits: lv >= 3 ? 2 : 1, recharge: 8000 - (lv - 1) * 1000 }),
  satellite: (lv: number) => ({ drones: lv >= 5 ? 2 : 1, interval: 650 - (lv - 1) * 70, damage: 0.5 + (lv - 1) * 0.15 }),
};

export const isWeapon = (id: string): id is WeaponId => id in WEAPONS;
export const isItem = (id: string): id is ItemId => id in ITEMS;
export const isGear = (id: string): id is GearId => id in GEAR;

export function defOf(id: string): { name: string; price: number; desc: string; icon: string } {
  return isWeapon(id) ? WEAPONS[id] : isGear(id) ? GEAR[id] : ITEMS[id as ItemId];
}
