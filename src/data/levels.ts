export type EnemyKind = 'dart' | 'weaver';
export type Pattern = 'line' | 'column' | 'vee' | 'pair' | 'single';

export interface Wave {
  delay: number; // ms after the previous wave spawned (or cleared, with waitClear)
  kind: EnemyKind;
  pattern: Pattern;
  count?: number;
  x?: number; // 0..1 across the screen, for column/single/vee
  waitClear?: boolean; // wait for the screen to be empty before counting the delay
}

export interface LevelDef {
  name: string;
  segments: Wave[][]; // a vendor stop sits between each pair of segments
}

// Level 1, the tutorial: Darts and Weavers only, slow sparse bullets.
export const LEVELS: LevelDef[] = [
  {
    name: 'OUTPOST RUN',
    segments: [
      [
        { delay: 2500, kind: 'dart', pattern: 'column', count: 4, x: 0.5 },
        { delay: 3000, kind: 'dart', pattern: 'column', count: 4, x: 0.25 },
        { delay: 2500, kind: 'dart', pattern: 'column', count: 4, x: 0.75 },
        { delay: 3000, kind: 'dart', pattern: 'line', count: 5 },
        { delay: 3500, kind: 'weaver', pattern: 'single', x: 0.5 },
        { delay: 2500, kind: 'dart', pattern: 'vee', count: 5, x: 0.5 },
        { delay: 3000, kind: 'weaver', pattern: 'pair' },
        { delay: 3000, kind: 'dart', pattern: 'line', count: 5, waitClear: true },
      ],
      [
        { delay: 2000, kind: 'weaver', pattern: 'pair' },
        { delay: 2500, kind: 'dart', pattern: 'column', count: 5, x: 0.2 },
        { delay: 1200, kind: 'dart', pattern: 'column', count: 5, x: 0.8 },
        { delay: 3000, kind: 'weaver', pattern: 'line', count: 3 },
        { delay: 3000, kind: 'dart', pattern: 'vee', count: 7, x: 0.5 },
        { delay: 3000, kind: 'dart', pattern: 'line', count: 6 },
        { delay: 1500, kind: 'weaver', pattern: 'pair' },
        { delay: 3000, kind: 'dart', pattern: 'vee', count: 7, x: 0.35, waitClear: true },
      ],
      [
        { delay: 2000, kind: 'dart', pattern: 'line', count: 6 },
        { delay: 1500, kind: 'weaver', pattern: 'line', count: 3 },
        { delay: 3000, kind: 'dart', pattern: 'column', count: 6, x: 0.3 },
        { delay: 600, kind: 'dart', pattern: 'column', count: 6, x: 0.7 },
        { delay: 3000, kind: 'weaver', pattern: 'line', count: 4 },
        { delay: 2500, kind: 'dart', pattern: 'vee', count: 7, x: 0.5 },
        // Final wave
        { delay: 2000, kind: 'weaver', pattern: 'line', count: 4, waitClear: true },
        { delay: 800, kind: 'dart', pattern: 'line', count: 6 },
        { delay: 800, kind: 'dart', pattern: 'line', count: 6 },
        { delay: 1500, kind: 'weaver', pattern: 'pair' },
      ],
    ],
  },
];
