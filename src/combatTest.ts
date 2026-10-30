import { isGear, isItem, isWeapon, type GearId, type ItemId, type WeaponId } from './data/items';
import type { LevelDef, Wave } from './data/levels';
import { itemCap } from './inventory';
import { newSave, type SaveData } from './save';

// Combat test mode (?test): an empty level where wave sequences are switched
// on from a pause menu and loop until switched off, for trying weapons
// against a spread of enemies. Only its loadout is saved (see testSave), so
// a reload, like the phone closing the page, comes back with it; the run
// itself and the main save are untouched.

export const TEST_LEVEL: LevelDef = {
  id: 'test', name: 'COMBAT TEST', desc: '', node: '', theme: 'outpost', segments: [[]],
};

// Level 0 keeps level-specific tips quiet. Two weapon and gear slots, three
// item slots, filled with the last loadout picked in the test menu.
export function testSave(): SaveData {
  const s: SaveData = { ...newSave(), level: 0, maxHealth: 8, weapons: ['pulse', null], gear: [null, null], items: [null, null, null] };
  try {
    const l = JSON.parse(localStorage.getItem(LOADOUT_KEY) ?? 'null') as Loadout | null;
    if (!l) return s;
    const keep = <T extends string>(ids: (T | null)[] | undefined, ok: (id: string) => boolean, n: number) =>
      Array.from({ length: n }, (_, i) => (ids?.[i] && ok(ids[i]!) ? ids[i] : null));
    s.weapons = keep(l.weapons, isWeapon, 2);
    if (!s.weapons[0]) s.weapons = [s.weapons[1] ?? 'pulse', null];
    s.gear = keep(l.gear, isGear, 2);
    s.weaponLevels = { ...l.weaponLevels };
    s.gearLevels = { ...l.gearLevels };
    s.items = keep(l.items, isItem, 3).map((id) => (id ? { id, count: itemCap(s, id) } : null));
  } catch { /* storage blocked or bad data: the default loadout */ }
  return s;
}

// The test loadout as kept in this browser: what's in each slot and each weapon and gear's level.
const LOADOUT_KEY = 'sv-test-loadout';
interface Loadout {
  weapons: (WeaponId | null)[]; gear: (GearId | null)[]; items: (ItemId | null)[];
  weaponLevels: SaveData['weaponLevels']; gearLevels: SaveData['gearLevels'];
}
export function saveTestLoadout(s: SaveData) {
  const l: Loadout = {
    weapons: s.weapons, gear: s.gear, items: s.items.map((it) => it?.id ?? null),
    weaponLevels: s.weaponLevels, gearLevels: s.gearLevels,
  };
  try { localStorage.setItem(LOADOUT_KEY, JSON.stringify(l)); } catch { /* storage blocked: not kept */ }
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
    name: 'VESPARAN',
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
    name: 'CORRUPTED',
    waves: [
      { delay: 400, kind: 'cdart', pattern: 'line', count: 5 },
      { delay: 2500, kind: 'cweaver', pattern: 'pair' },
      { delay: 2500, kind: 'cgunboat', pattern: 'single' },
      { delay: 3000, kind: 'cdrone', pattern: 'swarm', count: 6, x: 0.1 },
      { delay: 2500, kind: 'cdriller', pattern: 'single', x: 0.2 },
      { delay: 3000, kind: 'clancer', pattern: 'single', x: 0.6 },
      { delay: 3000, kind: 'cbomber', pattern: 'single', x: 0.4 },
      { delay: 3500, kind: 'ctrapper', pattern: 'single', x: 0.8 },
      { delay: 3000, kind: 'cminelayer', pattern: 'single' },
      { delay: 3500, kind: 'cbulwark', pattern: 'single' },
      { delay: 3500, kind: 'ccarrier', pattern: 'single', x: 0.6 },
      { delay: 3500, kind: 'cphantom', pattern: 'pair' },
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

// The two test buttons, crossed swords for waves and a ship for equipment:
// bottom middle, between the HUD's gear and item buttons. Left edges, at W 180 x H 320.
export type TestPanel = 'waves' | 'ship';
export const TEST_BUTTONS = { y: 294, size: 22, x: { waves: 56, ship: 80 } as Record<TestPanel, number> };
export const TEST_ICONS: Record<TestPanel, string> = { waves: 'iconSwords', ship: 'ship' };

// Items never run out in test mode, so each waits this long (ms) before it can
// be used again: about as long as it lasts, or a few seconds for one-shot ones.
export const ITEM_COOLDOWN: Record<ItemId, number> = {
  repair: 3000, fullrepair: 6000, shield: 7000, overdrive: 10000, nova: 6000, cluster: 2500, emp: 5000,
  warp: 7000, decoy: 6000, drone: 20000, rewind: 1000,
};
