// Tuner exports that have been added to the game, oldest first. Each change
// names a Tuner value by its path (like weapons.spread.interval) with its
// value before and after. The Tuner's History lists these and can put the
// values back to how they were before any one of them.
export interface TuneChange { path: string; from: number; to: number }
export interface TuneRevision { n: number; date: string; changes: TuneChange[] }

export const TUNE_HISTORY: TuneRevision[] = [
  {
    n: 1, date: '2026-10-19',
    changes: [
      { path: 'weapons.homing.splash', from: 12, to: 30 },
      { path: 'weapons.homing.splashGain', from: 3, to: 5 },
      { path: 'weapons.spread.faster', from: 30, to: 50 },
      { path: 'weapons.spread.interval', from: 340, to: 400 },
      { path: 'weapons.spread.speed', from: 300, to: 250 },
    ],
  },
];
