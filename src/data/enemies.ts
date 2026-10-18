import type { DType } from './items';
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
  weak: DType[]; // takes double damage
  resist: DType[]; // takes half damage
  organic?: boolean; // the Hollow: not stunned by EMP or ion
  light?: boolean; // an Afterburner ram destroys it outright
}

// Weaknesses follow the factions: Raiders are weak to Laser, the Vossari to
// Ion and Plasma, the Drone Swarm to Ion and Explosive, and the Hollow to
// Plasma while shrugging off Kinetic. A Mimic's resistance is set when it
// spawns, to whatever the ship's first weapon deals.
export const ENEMY_STATS: Record<FoeKind, FoeDef> = {
  dart: { hp: 1, texture: 'dart', dropChance: 0.5, credits: [2, 5], weak: ['laser'], resist: [], light: true },
  weaver: { hp: 3, texture: 'weaver', dropChance: 0.8, credits: [6, 10], weak: ['laser'], resist: [], light: true },
  drone: { hp: 1, texture: 'drone', dropChance: 0.3, credits: [2, 3], weak: ['explosive'], resist: [], light: true },
  gunboat: { hp: 8, texture: 'gunboat', dropChance: 0.9, credits: [11, 18], weak: ['laser', 'explosive'], resist: [] },
  bomber: { hp: 6, texture: 'bomber', dropChance: 0.9, credits: [11, 20], weak: ['kinetic'], resist: ['laser'] },
  trapper: { hp: 6, texture: 'trapper', dropChance: 0.9, credits: [11, 20], weak: ['kinetic'], resist: ['laser'] },
  driller: { hp: 4, texture: 'driller', dropChance: 0.6, credits: [7, 14], weak: ['ion'], resist: ['kinetic'], light: true },
  lancer: { hp: 6, texture: 'lancer', dropChance: 0.8, credits: [9, 16], weak: ['ion'], resist: ['laser'] },
  bulwark: { hp: 14, texture: 'bulwark', dropChance: 0.9, credits: [20, 34], weak: ['ion', 'plasma'], resist: ['kinetic'] },
  minelayer: { hp: 7, texture: 'minelayer', dropChance: 0.85, credits: [9, 16], weak: ['ion'], resist: ['explosive'] },
  carrier: { hp: 22, texture: 'carrier', dropChance: 0.95, credits: [22, 36], weak: ['plasma'], resist: ['laser'] },
  phantom: { hp: 5, texture: 'phantom', dropChance: 0.85, credits: [10, 16], weak: ['ion', 'explosive'], resist: [] },
  spore: { hp: 2, texture: 'spore', dropChance: 0.35, credits: [2, 6], weak: ['plasma'], resist: ['kinetic'], organic: true, light: true },
  tendril: { hp: 6, texture: 'tendril', dropChance: 0.8, credits: [10, 16], weak: ['plasma', 'laser'], resist: ['kinetic'], organic: true },
  brood: { hp: 30, texture: 'brood', dropChance: 1, credits: [29, 45], weak: ['plasma', 'explosive'], resist: ['kinetic', 'ion'], organic: true },
  mimic: { hp: 9, texture: 'mimic', dropChance: 0.9, credits: [14, 22], weak: [], resist: [], organic: true },
  husk: { hp: 24, texture: 'husk', dropChance: 1, credits: [27, 43], weak: ['plasma'], resist: ['kinetic', 'laser'], organic: true },
  egg: { hp: 8, texture: 'egg', dropChance: 0.5, credits: [4, 7], weak: ['plasma', 'explosive'], resist: ['kinetic'], organic: true },
  larva: { hp: 2, texture: 'larva', dropChance: 0.25, credits: [2, 3], weak: ['plasma'], resist: [], organic: true, light: true },
  seeker: { hp: 1, texture: 'seeker', dropChance: 0.1, credits: [1, 2], weak: ['plasma'], resist: [], organic: true, light: true },
  bomb: { hp: 1, texture: 'bomb', dropChance: 0, credits: [0, 0], weak: [], resist: [] },
  mine: { hp: 1, texture: 'mine', dropChance: 0, credits: [0, 0], weak: [], resist: [] },
  pmine: { hp: 1, texture: 'pmine', dropChance: 0, credits: [0, 0], weak: [], resist: [] },
  boulder: { hp: 3, texture: 'boulder', dropChance: 0, credits: [0, 0], weak: ['explosive'], resist: [] },
};

// Damage after weaknesses and resistances.
export function typeMultiplier(dtype: DType, weak: DType[], resist: DType[]) {
  if (weak.includes(dtype)) return 2;
  if (resist.includes(dtype)) return 0.5;
  return 1;
}
