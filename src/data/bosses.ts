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
  rockjaw: { hp: { core: 75, plate: 24, midPlate: 30 }, taken: { body: t(50, 100, 100, 150, 200) } },
  // Rockjaw's icy kin, tougher all over.
  frostjaw: { hp: { core: 175, plate: 65, midPlate: 80 }, taken: { body: t(50, 150, 100, 100, 200) } },
  dreadnought: {
    hp: { outerTurret: 25, innerTurret: 35, bridge: 125 },
    taken: { body: t(100, 50, 50, 200, 200) },
  },
  watcher: { hp: { body: 420 }, taken: { body: t(100, 50, 50, 200, 200) } },
  hollowwatcher: { hp: { body: 2184 }, taken: { body: t(50, 150, 100, 200, 50) } },
  // The shield also takes half of what this table says, and comes back at 60%.
  voss: {
    hp: { shield: 100, hull: 420, parasite: 510 },
    taken: { hull: t(100, 50, 50, 200, 200), shield: t(100, 100, 100, 200, 100), parasite: t(50, 100, 200, 100, 100) },
  },
  // The queens heal: the more health they have, the faster.
  queen: { hp: { body: 2400 }, taken: { body: t(50, 100, 200, 100, 100) } },
  broodmother: { hp: { body: 5280 }, taken: { body: t(50, 100, 200, 100, 100) } },
  sporeheart: { hp: { core: 520, petal: 70 }, taken: { body: t(50, 100, 200, 100, 200) } },
  wyrm: { hp: { head: 620, segment: 34 }, taken: { body: t(50, 100, 200, 100, 200) } },
  mind: {
    hp: { eye: 60, membrane: 400, core: 520, horror: 560 },
    taken: { body: t(50, 100, 200, 100, 200) },
  },
  barrier: { hp: { cell: 36 }, taken: { body: t(50, 100, 200, 100, 200) } },
  cargo: { hp: { body: 90 }, taken: { body: t(100, 100, 100, 100, 100) } },
};
