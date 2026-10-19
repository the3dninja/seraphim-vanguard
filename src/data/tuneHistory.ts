// Tuner exports that have been added to the game, oldest first. Each change
// names a Tuner value by its path (like weapons.spread.interval) with its
// value before and after. The Tuner's History lists these and can put the
// values back to how they were before any one of them.
export interface TuneChange { path: string; from: number; to: number }
export interface TuneRevision { n: number; date: string; changes: TuneChange[] }

export const TUNE_HISTORY: TuneRevision[] = [];
