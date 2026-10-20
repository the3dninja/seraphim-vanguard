// Tuner exports that have been added to the game, oldest first. Each change
// names a Tuner value by its path (like weapons.spread.interval, or
// weapons.spread.interval.perLv for its change each level) with its
// value before and after. The Tuner's History lists these and can put the
// values back to how they were before any one of them.
export interface TuneChange { path: string; from: number; to: number }
export interface TuneRevision { n: number; date: string; changes: TuneChange[] }

export const TUNE_HISTORY: TuneRevision[] = [
  {
    n: 1, date: '2026-10-19',
    changes: [
      { path: 'weapons.homing.splash.perLv', from: 3, to: 2 },
      { path: 'weapons.spread.interval.perLv', from: -30, to: -50 },
      { path: 'weapons.spread.interval', from: 340, to: 400 },
      { path: 'weapons.spread.speed', from: 300, to: 250 },
    ],
  },
  {
    n: 2, date: '2026-10-20',
    changes: [
      { path: 'weapons.bio.burn', from: 1.1, to: 1.5 },
      { path: 'weapons.bio.burn.perLv', from: 0, to: 0.75 },
      { path: 'weapons.bio.burnTime.perLv', from: 500, to: 750 },
      { path: 'weapons.bio.damage', from: 1.1, to: 0.5 },
      { path: 'weapons.bio.damage.perLv', from: 0.385, to: 0.5 },
      { path: 'weapons.bio.interval', from: 500, to: 350 },
      { path: 'weapons.homing.damage.perLv', from: 1.875, to: 0.5 },
      { path: 'weapons.homing.splash', from: 12, to: 15 },
      { path: 'weapons.ion.damage', from: 1.4, to: 1 },
      { path: 'weapons.ion.interval', from: 300, to: 400 },
      { path: 'weapons.ion.interval.perLv', from: -15, to: -5 },
      { path: 'weapons.ion.jumpDamage', from: 0.7, to: 0.5 },
      { path: 'weapons.ion.jumpDamage.perLv', from: 0, to: 0.25 },
      { path: 'weapons.ion.jumpRange', from: 46, to: 30 },
      { path: 'weapons.ion.jumpRange.perLv', from: 0, to: 5 },
      { path: 'weapons.ion.jumps', from: 2, to: 0.5 },
      { path: 'weapons.ion.jumps.perLv', from: 0, to: 0.5 },
      { path: 'weapons.ion.life', from: 320, to: 400 },
      { path: 'weapons.ion.life.perLv', from: 25.6, to: -25 },
      { path: 'weapons.spread.damage.perLv', from: 0.25, to: 0.5 },
    ],
  },
  {
    n: 3, date: '2026-10-20',
    changes: [
      { path: 'weapons.bio.angle.perLv', from: -2, to: 0 },
      { path: 'weapons.bio.burn', from: 1.5, to: 2 },
      { path: 'weapons.bio.burn.perLv', from: 0.75, to: 1 },
      { path: 'weapons.bio.burnTime', from: 2000, to: 3000 },
      { path: 'weapons.bio.burnTime.perLv', from: 750, to: 500 },
      { path: 'weapons.bio.cling', from: 2, to: 3 },
      { path: 'weapons.bio.damage.perLv', from: 0.5, to: 0 },
      { path: 'weapons.bio.interval.perLv', from: -25, to: 0 },
      { path: 'weapons.bio.shots.lv2', from: 1, to: 2 },
      { path: 'weapons.bio.shots.lv3', from: 2, to: 3 },
      { path: 'weapons.bio.shots.lv4', from: 2, to: 4 },
      { path: 'weapons.bio.shots.lv5', from: 3, to: 5 },
      { path: 'weapons.homing.damage', from: 2.5, to: 2 },
      { path: 'weapons.ion.damage.perLv', from: 0.35, to: 0.5 },
      { path: 'weapons.ion.shots.lv3', from: 1, to: 2 },
      { path: 'weapons.ion.shots.lv4', from: 1, to: 2 },
      { path: 'weapons.ion.stun', from: 300, to: 750 },
      { path: 'weapons.ion.stun.perLv', from: 150, to: 250 },
      { path: 'weapons.spread.shots.lv3', from: 3, to: 4 },
      { path: 'weapons.spread.shots.lv4', from: 3, to: 4 },
    ],
  },
];
