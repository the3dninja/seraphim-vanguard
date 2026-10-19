import type { LevelDef, Wave } from './data/levels';
import { newSave, type SaveData } from './save';

// Combat test mode (?test): an empty level where wave sequences are switched
// on from a pause menu and loop until switched off, for trying weapons
// against a spread of enemies. Nothing in it is saved or logged.

export const TEST_LEVEL: LevelDef = {
  name: 'COMBAT TEST', desc: '', node: '', theme: 'outpost', segments: [[]],
};

// Level 0 keeps level-specific tips quiet. Two weapon slots, no items or gear.
export function testSave(): SaveData {
  return { ...newSave(), level: 0, maxHealth: 8, weapons: ['pulse', null], items: [] };
}

// Groupings taken from the levels' own wave scripts, a few kinds per sequence.
// `delay` is ms after the group before it, as in a level.
export const TEST_SEQUENCES: { name: string; waves: Wave[] }[] = [
  {
    name: 'RAIDERS',
    waves: [
      { delay: 400, kind: 'dart', pattern: 'vee', count: 7 },
      { delay: 2000, kind: 'weaver', pattern: 'pair' },
      { delay: 2500, kind: 'gunboat', pattern: 'single' },
      { delay: 2500, kind: 'dart', pattern: 'line', count: 6 },
      { delay: 3000, kind: 'bomber', pattern: 'single', x: 0.3 },
      { delay: 2500, kind: 'trapper', pattern: 'single', x: 0.7 },
      { delay: 2500, kind: 'dart', pattern: 'column', count: 6, x: 0.25 },
    ],
  },
  {
    name: 'DRONE SWARM',
    waves: [
      { delay: 400, kind: 'drone', pattern: 'swarm', count: 8, x: 0.1 },
      { delay: 1800, kind: 'drone', pattern: 'swarm', count: 8, x: 0.9 },
      { delay: 2500, kind: 'dart', pattern: 'vee', count: 5 },
      { delay: 2500, kind: 'driller', pattern: 'pair' },
      { delay: 3000, kind: 'gunboat', pattern: 'pair' },
      { delay: 3000, kind: 'drone', pattern: 'swarm', count: 10, x: 0.1 },
    ],
  },
  {
    name: 'VOSSARI',
    waves: [
      { delay: 400, kind: 'lancer', pattern: 'pair' },
      { delay: 2000, kind: 'dart', pattern: 'vee', count: 7 },
      { delay: 2500, kind: 'bulwark', pattern: 'single' },
      { delay: 3000, kind: 'carrier', pattern: 'single', x: 0.7 },
      { delay: 3000, kind: 'lancer', pattern: 'single', x: 0.3 },
      { delay: 3000, kind: 'phantom', pattern: 'pair' },
    ],
  },
  {
    name: 'HEAVIES',
    waves: [
      { delay: 400, kind: 'minelayer', pattern: 'single' },
      { delay: 2500, kind: 'weaver', pattern: 'line', count: 4 },
      { delay: 3000, kind: 'bomber', pattern: 'single', x: 0.6 },
      { delay: 3000, kind: 'gunboat', pattern: 'line', count: 3 },
      { delay: 3500, kind: 'minelayer', pattern: 'pair' },
      { delay: 2500, kind: 'trapper', pattern: 'single', x: 0.3 },
    ],
  },
  {
    name: 'THE HOLLOW',
    waves: [
      { delay: 400, kind: 'spore', pattern: 'column', count: 5, x: 0.3 },
      { delay: 2500, kind: 'tendril', pattern: 'pair' },
      { delay: 2500, kind: 'brood', pattern: 'single' },
      { delay: 3000, kind: 'husk', pattern: 'pair' },
      { delay: 3000, kind: 'spore', pattern: 'vee', count: 7 },
      { delay: 3000, kind: 'mimic', pattern: 'pair' },
      { delay: 2500, kind: 'tendril', pattern: 'line', count: 3 },
    ],
  },
];

const LOOP_GAP = 3000; // ms between the last group of a sequence and its first again

// Which sequences are on, and how far along each one is.
export class TestWaves {
  readonly on = TEST_SEQUENCES.map(() => false);
  private next = TEST_SEQUENCES.map(() => 0);
  private wait = TEST_SEQUENCES.map(() => 0);

  toggle(i: number) {
    this.on[i] = !this.on[i];
    this.next[i] = 0;
    this.wait[i] = TEST_SEQUENCES[i].waves[0].delay;
  }

  update(dt: number, spawn: (w: Wave) => void) {
    TEST_SEQUENCES.forEach((seq, i) => {
      if (!this.on[i]) return;
      this.wait[i] -= dt * 1000;
      if (this.wait[i] > 0) return;
      spawn(seq.waves[this.next[i]]);
      this.next[i] = (this.next[i] + 1) % seq.waves.length;
      const delay = seq.waves[this.next[i]].delay;
      this.wait[i] += this.next[i] === 0 ? Math.max(delay, LOOP_GAP) : delay;
    });
  }
}

// The config button: bottom center, in line with the HUD's gear and item buttons.
export const CONFIG_BOX = { x: 79, y: 294, size: 22 }; // top left, at W 180 x H 320
