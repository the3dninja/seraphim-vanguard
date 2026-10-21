import type { Taken } from './enemies';
import type { BossKind } from './levels';

// Boss health, part by part, and how much of each damage type each part takes
// (in %, see Taken). Also the Hive's barrier cells and the treasure hauler,
// which are shot down the same way. The Tuner (?tune) can change all of it.
export type BossStatsKind = BossKind | 'barrier' | 'cargo';
export interface BossStats { hp: Record<string, number>; taken: Record<string, Taken> }

const t = (kinetic: number, laser: number, plasma: number, ion: number, explosive: number): Taken =>
  ({ kinetic, laser, plasma, ion, explosive });

export const BOSS_STATS: Record<BossStatsKind, BossStats> = {
  rockjaw: { hp: { core: 75, plate: 24, midPlate: 30 }, taken: { body: t(100, 100, 100, 150, 200) } },
  // Rockjaw's icy kin, tougher all over.
  frostjaw: { hp: { core: 135, plate: 65, midPlate: 80 }, taken: { body: t(100, 150, 100, 100, 200) } },
  dreadnought: {
    hp: { outerTurret: 50, innerTurret: 75, bridge: 200 },
    taken: { body: t(50, 75, 100, 150, 100) },
  },
  watcher: { hp: { body: 450 }, taken: { body: t(100, 100, 100, 200, 100) } },
  hollowwatcher: { hp: { body: 2500 }, taken: { body: t(50, 50, 250, 50, 50) } },
  // The shield also takes half of what this table says, and comes back at 60%.
  voss: {
    hp: { shield: 150, hull: 450, parasite: 750 },
    taken: { hull: t(100, 50, 100, 200, 100), shield: t(50, 200, 100, 200, 100), parasite: t(100, 100, 200, 100, 100) },
  },
  // The queens heal: the more health they have, the faster.
  queen: { hp: { body: 2500 }, taken: { body: t(150, 50, 150, 50, 150) } },
  broodmother: { hp: { body: 7500 }, taken: { body: t(100, 100, 100, 100, 100) } },
  sporeheart: { hp: { core: 750, petal: 100 }, taken: { body: t(150, 100, 150, 100, 150) } },
  wyrm: { hp: { head: 750, segment: 50 }, taken: { body: t(150, 100, 150, 100, 150) } },
  mind: {
    hp: { eye: 100, membrane: 500, core: 750, horror: 1000 },
    taken: { body: t(150, 100, 150, 100, 150) },
  },
  barrier: { hp: { cell: 35 }, taken: { body: t(150, 100, 150, 100, 150) } },
  cargo: { hp: { body: 100 }, taken: { body: t(100, 100, 100, 100, 100) } },
};
