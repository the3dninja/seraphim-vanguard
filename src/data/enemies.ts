import type { DType } from './items';

// How much of each damage type something takes, in %: 100 is normal, 200 is
// double (a weakness), 50 is half (a resistance), 0 is immune.
export type Taken = Record<DType, number>;
export const DTYPES: DType[] = ['kinetic', 'laser', 'plasma', 'ion', 'explosive'];
import type { EnemyKind } from './levels';

// Net mines are dropped by Trappers, bombs by Bombers, proximity mines (pmine) by Mine Layers,
// boulders are thrown by Rockjaw, and seekers burst out of Spore Pods and Husks;
// all can be shot down.
export type FoeKind = EnemyKind | 'mine' | 'bomb' | 'pmine' | 'boulder' | 'seeker';

export interface FoeDef {
  hp: number;
  texture: string;
  dropChance: number;
  credits: [number, number];
  taken: Taken; // how much of each damage type it takes, in %
  organic?: boolean; // the Hollow: not stunned by EMP or ion
  light?: boolean; // an Afterburner ram destroys it outright
  mimic?: { own: number; others: number }; // the Mimic's damage taken, in %, from its copied type and the rest
}

// Health can be any number, decimals included, like the damage that wears it down.
// Weaknesses mostly follow the factions: Raiders are weak to Laser and shrug
// off Ion, the Vossari are weak to Ion, the Drone Swarm to Explosive, and the
// Hollow to Plasma and Explosive. A
// Mimic's damage table is set when it spawns, from its `mimic` numbers: one
// for whatever the ship's first weapon deals, one for the rest.
export const ENEMY_STATS: Record<FoeKind, FoeDef> = {
  dart: { hp: 2, texture: 'dart', dropChance: 0.5, credits: [2, 5], taken: { kinetic: 100, laser: 200, plasma: 100, ion: 50, explosive: 100 }, light: true },
  weaver: { hp: 4, texture: 'weaver', dropChance: 0.8, credits: [5, 10], taken: { kinetic: 100, laser: 200, plasma: 100, ion: 50, explosive: 100 }, light: true },
  drone: { hp: 1.5, texture: 'drone', dropChance: 0.3, credits: [2, 3], taken: { kinetic: 50, laser: 200, plasma: 100, ion: 200, explosive: 200 }, light: true },
  gunboat: { hp: 12, texture: 'gunboat', dropChance: 0.9, credits: [10, 15], taken: { kinetic: 100, laser: 200, plasma: 100, ion: 50, explosive: 100 } },
  bomber: { hp: 25, texture: 'bomber', dropChance: 0.9, credits: [15, 25], taken: { kinetic: 100, laser: 200, plasma: 100, ion: 50, explosive: 100 } },
  trapper: { hp: 15, texture: 'trapper', dropChance: 0.9, credits: [10, 15], taken: { kinetic: 100, laser: 200, plasma: 100, ion: 50, explosive: 100 } },
  driller: { hp: 4, texture: 'driller', dropChance: 0.6, credits: [15, 25], taken: { kinetic: 50, laser: 200, plasma: 100, ion: 200, explosive: 200 }, light: true },
  lancer: { hp: 7.5, texture: 'lancer', dropChance: 0.8, credits: [9, 16], taken: { kinetic: 100, laser: 50, plasma: 100, ion: 200, explosive: 100 } },
  bulwark: { hp: 20, texture: 'bulwark', dropChance: 0.9, credits: [20, 35], taken: { kinetic: 100, laser: 50, plasma: 100, ion: 200, explosive: 100 } },
  minelayer: { hp: 15, texture: 'minelayer', dropChance: 0.85, credits: [10, 15], taken: { kinetic: 50, laser: 200, plasma: 100, ion: 200, explosive: 200 } },
  carrier: { hp: 25, texture: 'carrier', dropChance: 0.95, credits: [25, 35], taken: { kinetic: 100, laser: 50, plasma: 100, ion: 200, explosive: 100 } },
  phantom: { hp: 7.5, texture: 'phantom', dropChance: 0.85, credits: [10, 15], taken: { kinetic: 100, laser: 50, plasma: 150, ion: 200, explosive: 100 } },
  spore: { hp: 5, texture: 'spore', dropChance: 0.35, credits: [2, 6], taken: { kinetic: 100, laser: 100, plasma: 150, ion: 100, explosive: 150 }, organic: true, light: true },
  tendril: { hp: 10, texture: 'tendril', dropChance: 0.8, credits: [10, 15], taken: { kinetic: 100, laser: 100, plasma: 150, ion: 100, explosive: 150 }, organic: true },
  brood: { hp: 35, texture: 'brood', dropChance: 1, credits: [30, 45], taken: { kinetic: 100, laser: 100, plasma: 150, ion: 50, explosive: 150 }, organic: true },
  mimic: {
    hp: 15, texture: 'mimic', dropChance: 0.9, credits: [15, 25], taken: { kinetic: 100, laser: 100, plasma: 100, ion: 100, explosive: 100 },
    mimic: { own: 25, others: 300 }, organic: true,
  },
  husk: { hp: 30, texture: 'husk', dropChance: 1, credits: [30, 45], taken: { kinetic: 100, laser: 100, plasma: 150, ion: 100, explosive: 150 }, organic: true },
  egg: { hp: 5, texture: 'egg', dropChance: 0.5, credits: [5, 10], taken: { kinetic: 100, laser: 100, plasma: 150, ion: 100, explosive: 150 }, organic: true },
  larva: { hp: 2, texture: 'larva', dropChance: 0.25, credits: [3, 5], taken: { kinetic: 100, laser: 100, plasma: 150, ion: 100, explosive: 150 }, organic: true, light: true },
  seeker: { hp: 1, texture: 'seeker', dropChance: 0.1, credits: [1, 2], taken: { kinetic: 100, laser: 100, plasma: 100, ion: 100, explosive: 100 }, organic: true, light: true },
  // Corrupted: four times the health of the ship under the growths, the same
  // weaknesses, and more credits.
  cdart: { hp: 8, texture: 'cdart', dropChance: 0.6, credits: [6, 12], taken: { kinetic: 100, laser: 150, plasma: 100, ion: 100, explosive: 100 } },
  cweaver: { hp: 16, texture: 'cweaver', dropChance: 0.85, credits: [14, 24], taken: { kinetic: 100, laser: 150, plasma: 100, ion: 100, explosive: 100 } },
  cgunboat: { hp: 40, texture: 'cgunboat', dropChance: 0.95, credits: [26, 42], taken: { kinetic: 100, laser: 150, plasma: 100, ion: 100, explosive: 100 } },
  cbomber: { hp: 80, texture: 'cbomber', dropChance: 1, credits: [30, 48], taken: { kinetic: 100, laser: 150, plasma: 100, ion: 100, explosive: 100 } },
  ctrapper: { hp: 40, texture: 'ctrapper', dropChance: 0.95, credits: [26, 44], taken: { kinetic: 100, laser: 150, plasma: 100, ion: 100, explosive: 100 } },
  cdrone: { hp: 8, texture: 'cdrone', dropChance: 0.4, credits: [5, 8], taken: { kinetic: 100, laser: 100, plasma: 100, ion: 100, explosive: 150 } },
  cdriller: { hp: 16, texture: 'cdriller', dropChance: 0.7, credits: [16, 30], taken: { kinetic: 100, laser: 100, plasma: 100, ion: 100, explosive: 150 } },
  cminelayer: { hp: 40, texture: 'cminelayer', dropChance: 0.9, credits: [22, 38], taken: { kinetic: 100, laser: 100, plasma: 100, ion: 100, explosive: 150 } },
  clancer: { hp: 24, texture: 'clancer', dropChance: 0.85, credits: [22, 36], taken: { kinetic: 100, laser: 100, plasma: 100, ion: 150, explosive: 100 } },
  cbulwark: { hp: 56, texture: 'cbulwark', dropChance: 0.95, credits: [44, 70], taken: { kinetic: 100, laser: 100, plasma: 100, ion: 150, explosive: 100 } },
  ccarrier: { hp: 88, texture: 'ccarrier', dropChance: 1, credits: [48, 76], taken: { kinetic: 100, laser: 100, plasma: 100, ion: 150, explosive: 100 } },
  cphantom: { hp: 20, texture: 'cphantom', dropChance: 0.9, credits: [24, 38], taken: { kinetic: 100, laser: 100, plasma: 100, ion: 150, explosive: 100 } },
  bomb: { hp: 2, texture: 'bomb', dropChance: 0, credits: [0, 0], taken: { kinetic: 100, laser: 100, plasma: 100, ion: 100, explosive: 100 } },
  mine: { hp: 4, texture: 'mine', dropChance: 0, credits: [0, 0], taken: { kinetic: 100, laser: 100, plasma: 100, ion: 100, explosive: 100 } },
  pmine: { hp: 2, texture: 'pmine', dropChance: 0, credits: [0, 0], taken: { kinetic: 100, laser: 100, plasma: 100, ion: 100, explosive: 100 } },
  boulder: { hp: 6, texture: 'boulder', dropChance: 0, credits: [0, 0], taken: { kinetic: 50, laser: 150, plasma: 100, ion: 150, explosive: 200 } },
};

// Damage after weaknesses and resistances.
export const typeMultiplier = (dtype: DType, taken: Taken) => (taken[dtype] ?? 100) / 100;
// What a damage table shows as weak to (more than 100%) and resistant to (less).
export const weakTo = (taken: Taken) => DTYPES.filter((t) => taken[t] > 100);
export const resists = (taken: Taken) => DTYPES.filter((t) => taken[t] < 100);
