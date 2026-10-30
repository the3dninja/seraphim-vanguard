// The kinds of enemy, formation, theme, hazard and boss a level can use, as
// lists so the Level Editor can offer and check them.
export const ENEMY_KINDS = ['dart', 'weaver', 'gunboat', 'drone', 'bomber', 'trapper', 'driller', 'lancer', 'bulwark',
  'minelayer', 'carrier', 'phantom', 'spore', 'tendril', 'brood', 'mimic', 'husk', 'egg', 'larva',
  // Corrupted: Raider, Drone Swarm and Vossari ships overgrown by the Hollow (see corrupt.ts).
  'cdart', 'cweaver', 'cgunboat', 'cbomber', 'ctrapper', 'cdrone', 'cdriller', 'cminelayer',
  'clancer', 'cbulwark', 'ccarrier', 'cphantom'] as const;
export type EnemyKind = typeof ENEMY_KINDS[number];
// line/column/vee/pair/single drop in from the top. swarm snakes in from the
// top corner on the side `x` names (under 0.5 is left) and crosses the screen.
// Drillers come in from the side `x` names instead of the top (pair = one from each side).
export const PATTERNS = ['line', 'column', 'vee', 'pair', 'single', 'swarm'] as const;
export type Pattern = typeof PATTERNS[number];
export const THEMES = ['outpost', 'scrapyard', 'asteroids', 'ice', 'blockade', 'nebula', 'forge', 'relay',
  'blight', 'throne', 'deep', 'rift', 'beyond', 'reef', 'bloom', 'gate', 'heart', 'mist'] as const;
export type Theme = typeof THEMES[number];
// shard: falling ice. patch: an ice sheet that makes the ship slide. turret: a
// capital ship gun that leans in from the screen edge and fires a burst.
// lightning: a column flashes, then a bolt strikes down it. flare: a sweep of
// fire down the screen; only the shadow under a shelter rock is safe. fence: a
// laser fence across the screen that blinks on and off as it scrolls down.
// Act 3 (see act3.ts): spores: a cloud that hides what's inside it. doors:
// blast doors that slide shut as they scroll down; fly through the gap. well:
// a gravity well that pulls the ship and bends shots. wall: living coral that
// grows in from the side (shooting it cuts it back). tentacle: flickers at the
// edge, then sweeps across the screen. artery: a pulsing vessel that bursts
// into shots. Level 15 (see heart.ts): barrier: a wall of fleshy cells across
// the screen that has to be shot through. growth: a short piece of one.
// Side missions (see sidehaz.ts): press, gust, ember, blackout, sweep. satchunk:
// broken satellite pieces that drift down slowly and block shots and searchlights.
export const HAZARD_KINDS = ['debris', 'rock', 'shard', 'patch', 'turret', 'lightning', 'flare', 'fence',
  'spores', 'doors', 'well', 'wall', 'tentacle', 'artery', 'barrier', 'growth',
  'press', 'gust', 'ember', 'blackout', 'sweep', 'satchunk'] as const;
export type HazardKind = typeof HAZARD_KINDS[number];
export const BOSS_KINDS = ['rockjaw', 'dreadnought', 'watcher', 'voss', 'queen', 'mind', 'sporeheart', 'wyrm',
  'frostjaw', 'hollowwatcher', 'broodmother'] as const;
export type BossKind = typeof BOSS_KINDS[number];
// ramp: how many times as often it comes by the end of the segment as at the start.
export interface HazardSpec { kind: HazardKind; every: [number, number]; ramp?: number }

// Enemies warping into the top half of the screen (level 14): one-off warp-ins
// at points `p` (0..1) through a segment, `big` ones with twice the enemies;
// and in `every`'s segment, a warp-in every `start` ms at first, closing to
// every `end` ms, until `until` through it. With a gate, each warp-in comes in
// a warp ring, and the wait for the next only runs once the last has passed.
export interface WarpPlan {
  at: { seg: number; p: number; big?: boolean }[];
  every?: { seg: number; until: number; start: [number, number]; end: [number, number] };
}

export interface Wave {
  delay: number; // ms after the previous wave spawned (or cleared, with waitClear)
  kind: EnemyKind;
  pattern: Pattern;
  count?: number;
  x?: number; // 0..1 across the screen, for column/single/vee/swarm
  waitClear?: boolean; // wait for the screen to be empty before counting the delay
}

export interface LevelDef {
  // A name that stays the same wherever the level sits in the game (the
  // Level Editor keeps its drafts by it).
  id: string;
  name: string;
  desc: string; // shown on the star map; hints at enemies the player hasn't met
  node: string; // star map picture
  theme: Theme;
  hazards?: HazardSpec[]; // ms between each hazard during action
  segmentHazards?: HazardSpec[][]; // per segment, in place of `hazards`
  boss?: BossKind; // fought after the last segment
  bossHazards?: boolean; // hazards keep coming during the boss fight
  treasure?: number; // credits in a cargo hauler that drifts in after the last segment
  storm?: boolean; // Storm Eye: lightning and embers follow a script that builds over the level (storm.ts)
  // Usually two segments with a vendor stop between; empty = not built yet.
  // One segment means no vendor (the last level).
  segments: Wave[][];
  // After this segment the rift opens instead of the vendor arriving, and the
  // next segment is flown in alien space (level 11).
  riftAfter?: number;
  // After this segment a second tear opens and lets the ship out of the rift
  // into Hollow space, and then the vendor arrives (level 11).
  riftExitAfter?: number;
  noCrates?: number[]; // segments where gear supply crates don't drop (see CRATES)
  allies?: number; // wingmen flying with the ship (act 3)
  dark?: boolean; // only a pool of light around the ship (level 13)
  // Segments run straight into each other with no vendor stop (levels 1 and 15).
  vendorless?: boolean;
  segmentThemes?: Theme[]; // per segment, in place of `theme`
  segmentBoss?: (BossKind | undefined)[]; // a mini boss at the end of a segment
  segmentRadio?: (string | undefined)[]; // a radio call as each segment starts
  segmentNames?: string[]; // what each segment is called in the Level Editor
  // Heart of the Hollow's way through the hive (hive.ts): walls, gates, the
  // storm and the backdrops, part by part, one part per segment.
  hive?: boolean;
  warps?: WarpPlan;
  // Maw Gate's structure (mawgate.ts): the way in through the gate's hull,
  // warp rings around every warp-in, and the last gate in place of a boss.
  gate?: boolean;
  // Star map "common enemies" for levels that aren't built yet. Built levels
  // count their own wave scripts instead.
  enemies?: [string, number][];
}

// Wave scripts with every delay scaled by `k`, to the nearest 50 ms.
const shorten = (k: number, segs: Wave[][]) => segs.map((seg) => seg.map((w) => ({ ...w, delay: Math.round((w.delay * k) / 50) * 50 })));
// Waves coming more and more often: delays scaled by `from` at the first
// wave, closing in steadily to `to` at the last.
export const ramp = (from: number, to: number, waves: Wave[]) => waves.map((w, i) => {
  const k = from + (to - from) * (i / Math.max(1, waves.length - 1));
  return { ...w, delay: Math.round((w.delay * k) / 50) * 50 };
});

// Waves growing as they go: each wave's count scaled by `from` at the first
// wave, rising steadily to `to` at the last. Waves without a count are left be.
export const swell = (from: number, to: number, waves: Wave[]) => waves.map((w, i) => {
  if (!w.count) return w;
  const k = from + (to - from) * (i / Math.max(1, waves.length - 1));
  const n = Math.round(w.count * k);
  return { ...w, count: w.pattern === 'vee' && n % 2 === 0 ? n + 1 : n }; // a vee keeps its point
});

// Flying a cleared level or side mission again pays this share of the credits.
export const REPLAY_PAY = 0.5;

export const isBuilt = (l: LevelDef | undefined): l is LevelDef => !!l && l.segments.length > 0;

export const LEVELS: LevelDef[] = [
  // Level 1, the tutorial: Darts and Weavers only, slow sparse bullets.
  {
    id: 'outpost',
    name: 'OUTPOST RUN',
    desc: 'HOME SYSTEM PATROL. RAIDER SCOUTS PROBE THE OUTPOST. A GOOD PLACE TO LEARN.',
    node: 'node_gas',
    theme: 'outpost',
    // No vendor stop yet: the first one is on level 2.
    vendorless: true,
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
        { delay: 2000, kind: 'weaver', pattern: 'pair' },
        { delay: 2500, kind: 'dart', pattern: 'column', count: 5, x: 0.2 },
        { delay: 1200, kind: 'dart', pattern: 'column', count: 5, x: 0.8 },
        { delay: 3000, kind: 'weaver', pattern: 'line', count: 3, waitClear: true },
      ],
      [
        { delay: 3000, kind: 'dart', pattern: 'vee', count: 7, x: 0.5 },
        { delay: 3000, kind: 'dart', pattern: 'line', count: 6 },
        { delay: 1500, kind: 'weaver', pattern: 'pair' },
        { delay: 3000, kind: 'dart', pattern: 'vee', count: 7, x: 0.35, waitClear: true },
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
  // Level 2: Scrap Drones swarm in from the sides, Gunboats park and fire
  // spreads, and drifting wreckage soaks up shots from both sides.
  {
    id: 'scrapyard',
    name: 'SCRAPYARD BELT',
    desc: 'A GRAVEYARD OF WRECKS THAT BLOCK SHOTS. SALVAGE SWARMS AND ARMED HAULERS.',
    node: 'node_scrap',
    theme: 'scrapyard',
    hazards: [{ kind: 'debris', every: [5000, 8000] }],
    segments: [
      [
        { delay: 2500, kind: 'dart', pattern: 'line', count: 5 },
        { delay: 3000, kind: 'drone', pattern: 'swarm', count: 6, x: 0 },
        { delay: 3500, kind: 'dart', pattern: 'vee', count: 5, x: 0.5 },
        { delay: 3000, kind: 'drone', pattern: 'swarm', count: 6, x: 1 },
        { delay: 3000, kind: 'weaver', pattern: 'pair' },
        { delay: 3500, kind: 'gunboat', pattern: 'single', x: 0.5, waitClear: true },
        { delay: 2500, kind: 'dart', pattern: 'column', count: 5, x: 0.2 },
        { delay: 1500, kind: 'dart', pattern: 'column', count: 5, x: 0.8 },
        { delay: 3000, kind: 'drone', pattern: 'swarm', count: 8, x: 0, waitClear: true },
        { delay: 2000, kind: 'drone', pattern: 'swarm', count: 7, x: 1 },
        { delay: 1800, kind: 'drone', pattern: 'swarm', count: 7, x: 0 },
        { delay: 3500, kind: 'gunboat', pattern: 'pair' },
        { delay: 4000, kind: 'weaver', pattern: 'line', count: 3, waitClear: true },
      ],
      [
        { delay: 3000, kind: 'dart', pattern: 'vee', count: 7, x: 0.5 },
        { delay: 3000, kind: 'drone', pattern: 'swarm', count: 8, x: 1 },
        { delay: 2500, kind: 'gunboat', pattern: 'single', x: 0.3 },
        { delay: 1000, kind: 'dart', pattern: 'line', count: 6, waitClear: true },
        { delay: 2000, kind: 'weaver', pattern: 'line', count: 3 },
        { delay: 2500, kind: 'drone', pattern: 'swarm', count: 8, x: 0 },
        { delay: 1500, kind: 'drone', pattern: 'swarm', count: 8, x: 1 },
        { delay: 3500, kind: 'gunboat', pattern: 'pair' },
        { delay: 2500, kind: 'dart', pattern: 'column', count: 6, x: 0.5 },
        { delay: 3500, kind: 'weaver', pattern: 'line', count: 4 },
        // Final wave
        { delay: 2000, kind: 'gunboat', pattern: 'line', count: 3, waitClear: true },
        { delay: 2500, kind: 'drone', pattern: 'swarm', count: 10, x: 0 },
        { delay: 1200, kind: 'drone', pattern: 'swarm', count: 10, x: 1 },
        { delay: 2000, kind: 'dart', pattern: 'vee', count: 7, x: 0.5 },
      ],
    ],
  },
  // Level 3: asteroids to dodge or break, Bombers seed mines, and the
  // Rockjaw mini boss waits at the end.
  {
    id: 'kessel',
    name: 'KESSEL ASTEROIDS',
    desc: 'ROCKS SPLIT WHEN SHOT. RAIDERS SEED MINES, AND SOMETHING BIG HIDES HERE.',
    node: 'node_rocks',
    theme: 'asteroids',
    hazards: [{ kind: 'rock', every: [3000, 5500] }],
    boss: 'rockjaw',
    segments: [
      [
        { delay: 2500, kind: 'dart', pattern: 'vee', count: 5, x: 0.5 },
        { delay: 3000, kind: 'trapper', pattern: 'single', x: 0 },
        { delay: 4000, kind: 'weaver', pattern: 'pair' },
        { delay: 3000, kind: 'dart', pattern: 'line', count: 6 },
        { delay: 3000, kind: 'bomber', pattern: 'single', x: 1 },
        { delay: 3500, kind: 'drone', pattern: 'swarm', count: 7, x: 0 },
        { delay: 3000, kind: 'gunboat', pattern: 'single', x: 0.5, waitClear: true },
        { delay: 2000, kind: 'dart', pattern: 'column', count: 6, x: 0.3 },
        { delay: 800, kind: 'dart', pattern: 'column', count: 6, x: 0.7, waitClear: true },
        { delay: 2000, kind: 'trapper', pattern: 'single', x: 0 },
        { delay: 1500, kind: 'bomber', pattern: 'single', x: 1 },
        { delay: 4000, kind: 'weaver', pattern: 'line', count: 4 },
        { delay: 3000, kind: 'gunboat', pattern: 'pair', waitClear: true },
      ],
      [
        { delay: 3500, kind: 'dart', pattern: 'vee', count: 7, x: 0.4 },
        { delay: 3000, kind: 'drone', pattern: 'swarm', count: 8, x: 1 },
        { delay: 2500, kind: 'trapper', pattern: 'single', x: 0 },
        { delay: 2500, kind: 'dart', pattern: 'line', count: 6, waitClear: true },
        { delay: 2000, kind: 'gunboat', pattern: 'line', count: 3 },
        { delay: 3500, kind: 'bomber', pattern: 'single', x: 1 },
        { delay: 1500, kind: 'weaver', pattern: 'pair' },
        { delay: 3000, kind: 'drone', pattern: 'swarm', count: 8, x: 0 },
        { delay: 1500, kind: 'drone', pattern: 'swarm', count: 8, x: 1 },
        { delay: 3000, kind: 'trapper', pattern: 'single', x: 0 },
        { delay: 1000, kind: 'dart', pattern: 'vee', count: 7, x: 0.5, waitClear: true },
      ],
    ],
  },
  // Level 4: ice shards fall, ice sheets send the ship sliding, Drillers ram
  // from the sides and Vossari Lancers fire aimed beams after a warning line.
  {
    id: 'halva',
    name: 'ICE RING OF HALVA',
    desc: 'A FROZEN RING WHERE ICE SENDS THE SHIP SLIDING. DRILLS AND SNIPERS WAIT.',
    node: 'node_ice',
    theme: 'ice',
    hazards: [{ kind: 'shard', every: [2500, 4500] }, { kind: 'patch', every: [6000, 9500] }],
    segments: [
      [
        { delay: 2500, kind: 'dart', pattern: 'vee', count: 5, x: 0.5 },
        { delay: 3000, kind: 'driller', pattern: 'single', x: 0 },
        { delay: 3000, kind: 'weaver', pattern: 'pair' },
        { delay: 3500, kind: 'lancer', pattern: 'single', x: 0.5 },
        { delay: 3000, kind: 'dart', pattern: 'line', count: 6 },
        { delay: 2500, kind: 'driller', pattern: 'single', x: 1 },
        { delay: 3000, kind: 'drone', pattern: 'swarm', count: 7, x: 0 },
        { delay: 3500, kind: 'lancer', pattern: 'pair', waitClear: true },
        { delay: 2500, kind: 'driller', pattern: 'pair' },
        { delay: 2500, kind: 'dart', pattern: 'column', count: 6, x: 0.3 },
        { delay: 800, kind: 'dart', pattern: 'column', count: 6, x: 0.7 },
        { delay: 3000, kind: 'gunboat', pattern: 'single', x: 0.5 },
        { delay: 3000, kind: 'lancer', pattern: 'single', x: 0.25 },
        { delay: 1500, kind: 'driller', pattern: 'single', x: 0, waitClear: true },
      ],
      [
        { delay: 2000, kind: 'lancer', pattern: 'pair' },
        { delay: 2500, kind: 'driller', pattern: 'single', x: 1 },
        { delay: 2500, kind: 'drone', pattern: 'swarm', count: 8, x: 1 },
        { delay: 2500, kind: 'driller', pattern: 'single', x: 0 },
        { delay: 3000, kind: 'weaver', pattern: 'line', count: 3 },
        { delay: 3500, kind: 'lancer', pattern: 'line', count: 3, waitClear: true },
        { delay: 2500, kind: 'dart', pattern: 'vee', count: 7, x: 0.5 },
        { delay: 2500, kind: 'driller', pattern: 'pair' },
        { delay: 3000, kind: 'gunboat', pattern: 'pair' },
        { delay: 3000, kind: 'lancer', pattern: 'single', x: 0.5, waitClear: true },
        // Final wave
        { delay: 2000, kind: 'driller', pattern: 'pair' },
        { delay: 1500, kind: 'lancer', pattern: 'line', count: 3 },
        { delay: 2000, kind: 'dart', pattern: 'line', count: 6 },
        { delay: 2500, kind: 'driller', pattern: 'pair' },
        { delay: 1500, kind: 'drone', pattern: 'swarm', count: 8, x: 0 },
      ],
    ],
  },
  // Level 5: the Vossari fleet. Bulwarks hide behind shields, turrets on the
  // capital ships fire in from the edges, and Admiral Kade's Dreadnought waits.
  {
    id: 'blockade',
    name: 'VOSSARI BLOCKADE',
    desc: 'THE EMPIRE\'S FLEET RINGS A FORTRESS MOON. ADMIRAL KADE COMMANDS.',
    node: 'node_moon',
    theme: 'blockade',
    hazards: [{ kind: 'turret', every: [5000, 8000] }],
    boss: 'dreadnought',
    segments: [
      [
        { delay: 2500, kind: 'dart', pattern: 'line', count: 6 },
        { delay: 3000, kind: 'lancer', pattern: 'pair' },
        { delay: 3500, kind: 'gunboat', pattern: 'single', x: 0.5 },
        { delay: 4000, kind: 'bulwark', pattern: 'single', x: 0.5, waitClear: true },
        { delay: 2500, kind: 'dart', pattern: 'vee', count: 7, x: 0.5 },
        { delay: 2500, kind: 'lancer', pattern: 'single', x: 0.2 },
        { delay: 1200, kind: 'lancer', pattern: 'single', x: 0.8 },
        { delay: 3000, kind: 'weaver', pattern: 'line', count: 4 },
        { delay: 3500, kind: 'bulwark', pattern: 'single', x: 0.3 },
        { delay: 2000, kind: 'dart', pattern: 'column', count: 6, x: 0.75, waitClear: true },
        { delay: 2500, kind: 'gunboat', pattern: 'pair' },
        { delay: 3000, kind: 'lancer', pattern: 'line', count: 3 },
        { delay: 3500, kind: 'bulwark', pattern: 'pair', waitClear: true },
      ],
      [
        { delay: 2000, kind: 'lancer', pattern: 'pair' },
        { delay: 2500, kind: 'dart', pattern: 'line', count: 6 },
        { delay: 3000, kind: 'bulwark', pattern: 'single', x: 0.5 },
        { delay: 3000, kind: 'gunboat', pattern: 'single', x: 0.2 },
        { delay: 1500, kind: 'lancer', pattern: 'single', x: 0.8, waitClear: true },
        { delay: 2500, kind: 'drone', pattern: 'swarm', count: 8, x: 1 },
        { delay: 3000, kind: 'bulwark', pattern: 'pair' },
        { delay: 3000, kind: 'lancer', pattern: 'line', count: 3, waitClear: true },
        { delay: 2000, kind: 'dart', pattern: 'vee', count: 7, x: 0.5 },
        { delay: 3000, kind: 'gunboat', pattern: 'line', count: 3 },
        { delay: 3500, kind: 'bulwark', pattern: 'single', x: 0.5 },
        { delay: 2500, kind: 'lancer', pattern: 'pair', waitClear: true },
      ],
    ],
  },
  // Act 2. Levels 6 to 8 run about half again as long as levels 1 to 5.
  // Level 6: Vossari Carriers park and launch Darts. Solar flares sweep down
  // the screen; the shadow under a shelter rock is the only safe place.
  {
    id: 'forge',
    name: 'SOLAR FORGE',
    desc: 'CLOSE ORBIT OF A STAR. FLARES SWEEP THE SCREEN; SHELTER BEHIND ROCK.',
    node: 'node_star',
    theme: 'forge',
    hazards: [{ kind: 'flare', every: [11000, 15000] }],
    segments: [
      [
        { delay: 2500, kind: 'dart', pattern: 'line', count: 6 },
        { delay: 3000, kind: 'carrier', pattern: 'single', x: 0.5 },
        { delay: 4000, kind: 'weaver', pattern: 'pair' },
        { delay: 3000, kind: 'lancer', pattern: 'single', x: 0.3, waitClear: true },
        { delay: 2000, kind: 'dart', pattern: 'vee', count: 7, x: 0.5 },
        { delay: 3000, kind: 'carrier', pattern: 'single', x: 0.25 },
        { delay: 3500, kind: 'gunboat', pattern: 'single', x: 0.75 },
        { delay: 3000, kind: 'dart', pattern: 'column', count: 6, x: 0.5, waitClear: true },
        { delay: 2000, kind: 'lancer', pattern: 'pair' },
        { delay: 3000, kind: 'carrier', pattern: 'single', x: 0.7 },
        { delay: 3500, kind: 'weaver', pattern: 'line', count: 4 },
        { delay: 3000, kind: 'dart', pattern: 'line', count: 7, waitClear: true },
        { delay: 2000, kind: 'bulwark', pattern: 'single', x: 0.5 },
        { delay: 3000, kind: 'dart', pattern: 'vee', count: 7, x: 0.3 },
        { delay: 2500, kind: 'gunboat', pattern: 'pair' },
        { delay: 3000, kind: 'carrier', pattern: 'pair', waitClear: true },
        { delay: 2000, kind: 'lancer', pattern: 'line', count: 3 },
        { delay: 3000, kind: 'dart', pattern: 'column', count: 7, x: 0.25 },
        { delay: 800, kind: 'dart', pattern: 'column', count: 7, x: 0.75, waitClear: true },
      ],
      [
        { delay: 2500, kind: 'carrier', pattern: 'single', x: 0.5 },
        { delay: 3500, kind: 'lancer', pattern: 'pair' },
        { delay: 3000, kind: 'dart', pattern: 'line', count: 7 },
        { delay: 3000, kind: 'bulwark', pattern: 'single', x: 0.3, waitClear: true },
        { delay: 2000, kind: 'carrier', pattern: 'pair' },
        { delay: 4000, kind: 'weaver', pattern: 'line', count: 4 },
        { delay: 2500, kind: 'gunboat', pattern: 'single', x: 0.5 },
        { delay: 3000, kind: 'dart', pattern: 'vee', count: 7, x: 0.5, waitClear: true },
        { delay: 2000, kind: 'lancer', pattern: 'line', count: 3 },
        { delay: 3000, kind: 'carrier', pattern: 'single', x: 0.2 },
        { delay: 1500, kind: 'carrier', pattern: 'single', x: 0.8 },
        { delay: 4000, kind: 'bulwark', pattern: 'pair', waitClear: true },
        { delay: 2000, kind: 'dart', pattern: 'line', count: 7 },
        { delay: 2500, kind: 'gunboat', pattern: 'pair' },
        { delay: 3000, kind: 'lancer', pattern: 'pair', waitClear: true },
        // Final wave
        { delay: 2000, kind: 'carrier', pattern: 'line', count: 3 },
        { delay: 3000, kind: 'dart', pattern: 'vee', count: 7, x: 0.5 },
        { delay: 2000, kind: 'lancer', pattern: 'pair' },
        { delay: 2500, kind: 'weaver', pattern: 'line', count: 4 },
      ],
    ],
  },
  // Level 7: Mine Layers seed the nebula with proximity mines, Raiders press in,
  // and lightning strikes down columns that flash first.
  {
    id: 'ember',
    name: 'EMBER NEBULA',
    desc: 'A RED NEBULA ALIVE WITH LIGHTNING. WATCH FOR THE FLASH BEFORE A STRIKE.',
    node: 'node_nebula',
    theme: 'nebula',
    hazards: [{ kind: 'lightning', every: [3500, 6000] }],
    segments: [
      [
        { delay: 2500, kind: 'dart', pattern: 'vee', count: 7, x: 0.5 },
        { delay: 3000, kind: 'minelayer', pattern: 'single', x: 0.3 },
        { delay: 3000, kind: 'weaver', pattern: 'pair' },
        { delay: 3000, kind: 'dart', pattern: 'line', count: 6 },
        { delay: 3000, kind: 'minelayer', pattern: 'single', x: 0.7 },
        { delay: 2500, kind: 'gunboat', pattern: 'single', x: 0.5, waitClear: true },
        { delay: 2000, kind: 'dart', pattern: 'column', count: 6, x: 0.2 },
        { delay: 800, kind: 'dart', pattern: 'column', count: 6, x: 0.8 },
        { delay: 3000, kind: 'bomber', pattern: 'single', x: 0 },
        { delay: 2500, kind: 'minelayer', pattern: 'pair' },
        { delay: 3500, kind: 'weaver', pattern: 'line', count: 4, waitClear: true },
        { delay: 2000, kind: 'drone', pattern: 'swarm', count: 8, x: 0 },
        { delay: 2000, kind: 'gunboat', pattern: 'pair' },
        { delay: 3500, kind: 'dart', pattern: 'vee', count: 7, x: 0.3 },
        { delay: 1500, kind: 'dart', pattern: 'vee', count: 7, x: 0.7 },
        { delay: 3000, kind: 'minelayer', pattern: 'single', x: 0.5 },
        { delay: 2500, kind: 'trapper', pattern: 'single', x: 1, waitClear: true },
        { delay: 2000, kind: 'weaver', pattern: 'pair' },
        { delay: 2000, kind: 'gunboat', pattern: 'line', count: 3 },
        { delay: 3500, kind: 'minelayer', pattern: 'pair', waitClear: true },
      ],
      [
        { delay: 2500, kind: 'dart', pattern: 'line', count: 7 },
        { delay: 2500, kind: 'minelayer', pattern: 'single', x: 0.25 },
        { delay: 1500, kind: 'minelayer', pattern: 'single', x: 0.75 },
        { delay: 3000, kind: 'gunboat', pattern: 'pair' },
        { delay: 3000, kind: 'weaver', pattern: 'line', count: 4, waitClear: true },
        { delay: 2000, kind: 'bomber', pattern: 'single', x: 0 },
        { delay: 1500, kind: 'trapper', pattern: 'single', x: 1 },
        { delay: 3000, kind: 'dart', pattern: 'vee', count: 7, x: 0.5 },
        { delay: 2500, kind: 'drone', pattern: 'swarm', count: 9, x: 1 },
        { delay: 2500, kind: 'minelayer', pattern: 'line', count: 3, waitClear: true },
        { delay: 2000, kind: 'gunboat', pattern: 'single', x: 0.2 },
        { delay: 1200, kind: 'gunboat', pattern: 'single', x: 0.8 },
        { delay: 3000, kind: 'dart', pattern: 'column', count: 7, x: 0.5 },
        { delay: 2500, kind: 'weaver', pattern: 'pair' },
        { delay: 2500, kind: 'minelayer', pattern: 'pair', waitClear: true },
        // Final wave
        { delay: 2000, kind: 'gunboat', pattern: 'line', count: 3 },
        { delay: 1500, kind: 'dart', pattern: 'line', count: 7 },
        { delay: 1500, kind: 'minelayer', pattern: 'single', x: 0.5 },
        { delay: 2000, kind: 'weaver', pattern: 'line', count: 4 },
        { delay: 2000, kind: 'dart', pattern: 'vee', count: 7, x: 0.5 },
      ],
    ],
  },
  // Level 8: Phantoms cloak between shots, Drones and Mine Layers fill the
  // relay, laser fences blink on and off, and The Watcher waits at the end.
  {
    id: 'relay',
    name: 'SILENT RELAY',
    desc: 'AN ABANDONED RELAY OF LASER FENCES. SOMETHING WATCHES, UNSEEN.',
    node: 'node_relay',
    theme: 'relay',
    hazards: [{ kind: 'fence', every: [9000, 13000] }],
    boss: 'watcher',
    segments: [
      // Starts at the old pace, then the waves come faster and grow bigger all
      // the way to The Watcher.
      ramp(1, 0.75, swell(1, 1.15, [
        { delay: 2500, kind: 'drone', pattern: 'swarm', count: 8, x: 0 },
        { delay: 3000, kind: 'phantom', pattern: 'single', x: 0.5 },
        { delay: 3500, kind: 'dart', pattern: 'vee', count: 7, x: 0.5 },
        { delay: 3000, kind: 'drone', pattern: 'swarm', count: 8, x: 1 },
        { delay: 2500, kind: 'minelayer', pattern: 'single', x: 0.3, waitClear: true },
        { delay: 2000, kind: 'phantom', pattern: 'pair' },
        { delay: 4000, kind: 'weaver', pattern: 'line', count: 4 },
        { delay: 3000, kind: 'drone', pattern: 'swarm', count: 9, x: 0 },
        { delay: 1500, kind: 'drone', pattern: 'swarm', count: 9, x: 1, waitClear: true },
        { delay: 2000, kind: 'lancer', pattern: 'single', x: 0.5 },
        { delay: 2500, kind: 'phantom', pattern: 'single', x: 0.25 },
        { delay: 2000, kind: 'phantom', pattern: 'single', x: 0.75 },
        { delay: 3500, kind: 'minelayer', pattern: 'pair', waitClear: true },
        { delay: 2000, kind: 'dart', pattern: 'line', count: 7 },
        { delay: 2500, kind: 'gunboat', pattern: 'pair' },
        { delay: 3000, kind: 'drone', pattern: 'swarm', count: 10, x: 1 },
        { delay: 3000, kind: 'phantom', pattern: 'line', count: 3, waitClear: true },
        { delay: 2000, kind: 'dart', pattern: 'vee', count: 7, x: 0.5 },
        { delay: 2500, kind: 'minelayer', pattern: 'single', x: 0.6, waitClear: true },
      ])),
      ramp(0.75, 0.5, swell(1.15, 1.4, [
        { delay: 2500, kind: 'phantom', pattern: 'pair' },
        { delay: 3000, kind: 'drone', pattern: 'swarm', count: 9, x: 0 },
        { delay: 2500, kind: 'minelayer', pattern: 'single', x: 0.7 },
        { delay: 3000, kind: 'lancer', pattern: 'pair', waitClear: true },
        { delay: 2000, kind: 'dart', pattern: 'line', count: 7 },
        { delay: 2000, kind: 'phantom', pattern: 'single', x: 0.5 },
        { delay: 3000, kind: 'drone', pattern: 'swarm', count: 10, x: 1 },
        { delay: 1500, kind: 'drone', pattern: 'swarm', count: 10, x: 0, waitClear: true },
        { delay: 2000, kind: 'gunboat', pattern: 'single', x: 0.3 },
        { delay: 1500, kind: 'minelayer', pattern: 'single', x: 0.8 },
        { delay: 3000, kind: 'phantom', pattern: 'line', count: 3 },
        { delay: 4000, kind: 'weaver', pattern: 'line', count: 4, waitClear: true },
        { delay: 2000, kind: 'bulwark', pattern: 'single', x: 0.5 },
        { delay: 2500, kind: 'dart', pattern: 'vee', count: 7, x: 0.3 },
        { delay: 2500, kind: 'phantom', pattern: 'pair' },
        { delay: 3000, kind: 'minelayer', pattern: 'pair', waitClear: true },
        { delay: 2000, kind: 'drone', pattern: 'swarm', count: 10, x: 1 },
        { delay: 2000, kind: 'lancer', pattern: 'line', count: 3, waitClear: true },
      ])),
    ],
  },
  // Level 9: the first Hollow. Spore Pods burst into seekers, infected
  // Vossari hold the colony, and spore clouds hide whatever flies inside them.
  {
    id: 'blight',
    name: 'BLIGHT COLONY',
    desc: 'AN IMPERIAL COLONY GONE WRONG. SPORE CLOUDS HIDE WHAT MOVES INSIDE.',
    node: 'node_blight',
    theme: 'blight',
    hazards: [{ kind: 'spores', every: [6000, 9000] }],
    segments: [
      [
        { delay: 2500, kind: 'spore', pattern: 'vee', count: 7, x: 0.2 },
        { delay: 2500, kind: 'lancer', pattern: 'pair' },
        { delay: 1500, kind: 'spore', pattern: 'column', count: 5, x: 0.2 },
        { delay: 2000, kind: 'spore', pattern: 'column', count: 5, x: 0.2, waitClear: true },
        { delay: 2000, kind: 'lancer', pattern: 'single', x: 0.3 },
        { delay: 2000, kind: 'spore', pattern: 'line', count: 5 },
        { delay: 2000, kind: 'bulwark', pattern: 'single', x: 0.5 },
        { delay: 3500, kind: 'lancer', pattern: 'pair', waitClear: true },
        { delay: 2500, kind: 'dart', pattern: 'line', count: 7 },
        { delay: 3000, kind: 'spore', pattern: 'line', count: 6 },
        { delay: 2500, kind: 'dart', pattern: 'vee', count: 7, x: 0.7 },
        { delay: 2500, kind: 'spore', pattern: 'line', count: 5 },
        { delay: 3000, kind: 'dart', pattern: 'column', count: 7, x: 0.6 },
        { delay: 3000, kind: 'lancer', pattern: 'pair', waitClear: true },
        { delay: 1500, kind: 'spore', pattern: 'vee', count: 5, x: 0.7 },
        { delay: 2500, kind: 'gunboat', pattern: 'single', x: 0.5 },
        { delay: 2500, kind: 'lancer', pattern: 'line', count: 3 },
        { delay: 3500, kind: 'spore', pattern: 'vee', count: 5, x: 0.2, waitClear: true },
        { delay: 2500, kind: 'weaver', pattern: 'pair' },
        { delay: 2500, kind: 'dart', pattern: 'vee', count: 7, x: 0.6, waitClear: true },
      ],
      [
        { delay: 2500, kind: 'spore', pattern: 'column', count: 5, x: 0.75 },
        { delay: 2500, kind: 'gunboat', pattern: 'single', x: 0.3 },
        { delay: 2500, kind: 'bulwark', pattern: 'single', x: 0.6 },
        { delay: 3000, kind: 'spore', pattern: 'column', count: 5, x: 0.4, waitClear: true },
        { delay: 2500, kind: 'phantom', pattern: 'single', x: 0.5 },
        { delay: 3000, kind: 'spore', pattern: 'column', count: 5, x: 0.3 },
        { delay: 3000, kind: 'phantom', pattern: 'pair' },
        { delay: 3000, kind: 'spore', pattern: 'vee', count: 5, x: 0.5 },
        { delay: 1500, kind: 'gunboat', pattern: 'pair' },
        { delay: 2500, kind: 'bulwark', pattern: 'single', x: 0.7, waitClear: true },
        { delay: 4000, kind: 'spore', pattern: 'line', count: 5 },
        { delay: 3000, kind: 'bulwark', pattern: 'single', x: 0.25 },
        { delay: 3500, kind: 'bulwark', pattern: 'pair' },
        { delay: 3500, kind: 'lancer', pattern: 'line', count: 3, waitClear: true },
        { delay: 3000, kind: 'gunboat', pattern: 'line', count: 3 },
        { delay: 3500, kind: 'spore', pattern: 'line', count: 6, waitClear: true },
        // Final wave
        { delay: 1500, kind: 'spore', pattern: 'column', count: 5, x: 0.25 },
        { delay: 2000, kind: 'bulwark', pattern: 'single', x: 0.3 },
        { delay: 1500, kind: 'dart', pattern: 'column', count: 7, x: 0.4 },
        { delay: 2000, kind: 'gunboat', pattern: 'pair' },
      ],
    ],
  },
  // Level 10: the Vossari capital. Blast doors slide shut as they scroll by,
  // defense guns fire in from the edges, and the possessed Emperor waits.
  {
    id: 'throne',
    name: 'THRONE OF VOSS',
    desc: 'THE VOSSARI CAPITAL. DOORS SLAM SHUT; THE DEFENSE GRID NEVER SLEEPS.',
    node: 'node_throne',
    theme: 'throne',
    hazards: [{ kind: 'doors', every: [9000, 12000] }, { kind: 'turret', every: [7000, 10000] }],
    boss: 'voss',
    segments: [
      [
        { delay: 2500, kind: 'tendril', pattern: 'single', x: 0.8 },
        { delay: 3000, kind: 'dart', pattern: 'vee', count: 7, x: 0.25 },
        { delay: 2500, kind: 'bulwark', pattern: 'single', x: 0.25 },
        { delay: 3500, kind: 'dart', pattern: 'vee', count: 7, x: 0.2, waitClear: true },
        { delay: 2500, kind: 'phantom', pattern: 'single', x: 0.2 },
        { delay: 3000, kind: 'lancer', pattern: 'pair' },
        { delay: 3000, kind: 'dart', pattern: 'column', count: 7, x: 0.75 },
        { delay: 3000, kind: 'lancer', pattern: 'pair' },
        { delay: 2500, kind: 'bulwark', pattern: 'single', x: 0.5 },
        { delay: 3500, kind: 'bulwark', pattern: 'single', x: 0.25, waitClear: true },
        { delay: 4000, kind: 'carrier', pattern: 'single', x: 0.6 },
        { delay: 4000, kind: 'lancer', pattern: 'pair' },
        { delay: 2500, kind: 'dart', pattern: 'vee', count: 7, x: 0.4 },
        { delay: 3000, kind: 'tendril', pattern: 'single', x: 0.8, waitClear: true },
        { delay: 3000, kind: 'dart', pattern: 'line', count: 7 },
        { delay: 3000, kind: 'carrier', pattern: 'single', x: 0.5 },
        { delay: 4000, kind: 'dart', pattern: 'column', count: 7, x: 0.2 },
        { delay: 3000, kind: 'lancer', pattern: 'single', x: 0.6, waitClear: true },
        { delay: 2500, kind: 'bulwark', pattern: 'single', x: 0.8 },
        { delay: 3500, kind: 'dart', pattern: 'column', count: 6, x: 0.6, waitClear: true },
      ],
      [
        { delay: 2500, kind: 'bulwark', pattern: 'single', x: 0.25 },
        { delay: 3500, kind: 'spore', pattern: 'line', count: 6 },
        { delay: 1500, kind: 'tendril', pattern: 'pair' },
        { delay: 2500, kind: 'lancer', pattern: 'single', x: 0.5 },
        { delay: 3000, kind: 'lancer', pattern: 'pair', waitClear: true },
        { delay: 2500, kind: 'spore', pattern: 'line', count: 5 },
        { delay: 3000, kind: 'tendril', pattern: 'pair' },
        { delay: 1500, kind: 'spore', pattern: 'vee', count: 5, x: 0.2 },
        { delay: 2000, kind: 'phantom', pattern: 'single', x: 0.75 },
        { delay: 3000, kind: 'spore', pattern: 'vee', count: 7, x: 0.25, waitClear: true },
        { delay: 2000, kind: 'lancer', pattern: 'pair' },
        { delay: 2500, kind: 'tendril', pattern: 'pair' },
        { delay: 3000, kind: 'bulwark', pattern: 'single', x: 0.8 },
        { delay: 4000, kind: 'phantom', pattern: 'pair', waitClear: true },
        { delay: 1500, kind: 'carrier', pattern: 'single', x: 0.6 },
        { delay: 3500, kind: 'phantom', pattern: 'pair' },
        { delay: 1500, kind: 'spore', pattern: 'column', count: 5, x: 0.3 },
        { delay: 2000, kind: 'carrier', pattern: 'single', x: 0.8, waitClear: true },
        { delay: 3500, kind: 'spore', pattern: 'line', count: 5 },
        { delay: 3000, kind: 'tendril', pattern: 'single', x: 0.7, waitClear: true },
      ],
    ],
  },
  // Act 3. Level 11 starts in normal space with the new allies, against Raiders
  // the Hollow has overgrown. When the vendor arrives, the rift tears open and
  // pulls the vendor and the ship in. Space rushes by inside it, thick with the
  // Hollow, until a second tear lets the ship out into Hollow space, where
  // the vendor waits. A final leg half again as long as a level 6 to 10
  // segment follows, under a purple star.
  {
    id: 'rift',
    name: 'THE RIFT',
    desc: 'A TEAR INTO ALIEN SPACE. GRAVITY BENDS SHOTS AND SHIPS. ALLIES JOIN YOU.',
    node: 'node_rift',
    theme: 'deep',
    segmentThemes: ['deep', 'rift', 'beyond'],
    segmentNames: ['NORMAL SPACE', 'THE RIFT', 'HOLLOW SPACE'],
    riftAfter: 0,
    riftExitAfter: 1,
    // No supply crates inside the rift itself: it is alien space, far from any
    // supply line. They come back once the ship is out in Hollow space.
    noCrates: [1],
    allies: 2,
    segmentHazards: [[], [{ kind: 'well', every: [7000, 10000] }], [{ kind: 'well', every: [6000, 9000] }]],
    segments: [
      [
        { delay: 2500, kind: 'cgunboat', pattern: 'single', x: 0.75 },
        { delay: 1500, kind: 'spore', pattern: 'vee', count: 7, x: 0.7 },
        { delay: 3000, kind: 'tendril', pattern: 'pair' },
        { delay: 2500, kind: 'cgunboat', pattern: 'single', x: 0.25 },
        { delay: 2000, kind: 'cweaver', pattern: 'pair', waitClear: true },
        { delay: 2000, kind: 'spore', pattern: 'column', count: 5, x: 0.4 },
        { delay: 1500, kind: 'tendril', pattern: 'single', x: 0.75 },
        { delay: 2500, kind: 'cdart', pattern: 'line', count: 6 },
        { delay: 3000, kind: 'spore', pattern: 'line', count: 5 },
        { delay: 2000, kind: 'tendril', pattern: 'pair' },
        { delay: 2500, kind: 'cgunboat', pattern: 'pair', waitClear: true },
        { delay: 1500, kind: 'cdart', pattern: 'line', count: 6 },
        { delay: 2500, kind: 'cweaver', pattern: 'pair' },
        { delay: 1500, kind: 'spore', pattern: 'vee', count: 5, x: 0.35 },
        { delay: 3000, kind: 'tendril', pattern: 'single', x: 0.6 },
        { delay: 3000, kind: 'cdart', pattern: 'column', count: 6, x: 0.2 },
        { delay: 3000, kind: 'cweaver', pattern: 'line', count: 4, waitClear: true },
        { delay: 3000, kind: 'cgunboat', pattern: 'single', x: 0.2 },
        { delay: 1500, kind: 'cweaver', pattern: 'line', count: 4 },
        { delay: 1500, kind: 'spore', pattern: 'column', count: 5, x: 0.8 },
        { delay: 3000, kind: 'tendril', pattern: 'line', count: 3 },
        { delay: 3500, kind: 'tendril', pattern: 'single', x: 0.5 },
        { delay: 3000, kind: 'tendril', pattern: 'line', count: 3, waitClear: true },
      ],
      // Inside the rift: the Hollow comes a third more often, with a few
      // Corrupted ships among them.
      shorten(0.7, [[
        { delay: 2000, kind: 'spore', pattern: 'line', count: 6 },
        { delay: 1500, kind: 'spore', pattern: 'line', count: 6 },
        { delay: 2500, kind: 'tendril', pattern: 'pair' },
        { delay: 2500, kind: 'spore', pattern: 'vee', count: 7, x: 0.3 },
        { delay: 2500, kind: 'brood', pattern: 'single', x: 0.2, waitClear: true },
        { delay: 3000, kind: 'cweaver', pattern: 'pair' },
        { delay: 3000, kind: 'tendril', pattern: 'pair' },
        { delay: 2500, kind: 'spore', pattern: 'column', count: 5, x: 0.7 },
        { delay: 3000, kind: 'tendril', pattern: 'single', x: 0.25 },
        { delay: 2500, kind: 'brood', pattern: 'single', x: 0.2 },
        { delay: 4000, kind: 'tendril', pattern: 'pair', waitClear: true },
        { delay: 1500, kind: 'clancer', pattern: 'single', x: 0.5 },
        { delay: 2500, kind: 'spore', pattern: 'line', count: 6 },
        { delay: 2500, kind: 'brood', pattern: 'single', x: 0.4 },
        { delay: 3500, kind: 'tendril', pattern: 'pair' },
        { delay: 2500, kind: 'spore', pattern: 'vee', count: 7, x: 0.6 },
        { delay: 3000, kind: 'tendril', pattern: 'pair', waitClear: true },
        { delay: 2000, kind: 'cgunboat', pattern: 'single', x: 0.3 },
        { delay: 2500, kind: 'tendril', pattern: 'line', count: 3 },
        { delay: 2500, kind: 'spore', pattern: 'column', count: 5, x: 0.75 },
        { delay: 3000, kind: 'brood', pattern: 'single', x: 0.6 },
        { delay: 3000, kind: 'tendril', pattern: 'single', x: 0.4, waitClear: true },
      ]])[0],
      // Hollow space: spores and a few Corrupted Raiders, then the Hollow
      // closing in faster and faster, and a last beat of spores and Corrupted
      // Scrap Drones.
      [
        { delay: 2000, kind: 'spore', pattern: 'line', count: 6 },
        { delay: 1200, kind: 'spore', pattern: 'column', count: 5, x: 0.25 },
        { delay: 1000, kind: 'spore', pattern: 'column', count: 5, x: 0.75 },
        { delay: 2000, kind: 'cdart', pattern: 'line', count: 4 },
        { delay: 1500, kind: 'spore', pattern: 'vee', count: 7, x: 0.5 },
        { delay: 2500, kind: 'cweaver', pattern: 'pair', waitClear: true },
        ...ramp(1, 0.6, [
          { delay: 2500, kind: 'tendril', pattern: 'single', x: 0.5 },
          { delay: 2500, kind: 'brood', pattern: 'single', x: 0.8 },
          { delay: 3000, kind: 'spore', pattern: 'column', count: 5, x: 0.2 },
          { delay: 2500, kind: 'tendril', pattern: 'single', x: 0.7 },
          { delay: 2500, kind: 'tendril', pattern: 'pair', waitClear: true },
          { delay: 2000, kind: 'spore', pattern: 'column', count: 5, x: 0.6 },
          { delay: 1500, kind: 'tendril', pattern: 'pair' },
          { delay: 3000, kind: 'tendril', pattern: 'pair' },
          { delay: 2500, kind: 'spore', pattern: 'vee', count: 7, x: 0.3, waitClear: true },
          { delay: 3000, kind: 'brood', pattern: 'single', x: 0.2 },
          { delay: 3000, kind: 'husk', pattern: 'single', x: 0.8 },
          { delay: 3500, kind: 'tendril', pattern: 'pair' },
          { delay: 2500, kind: 'husk', pattern: 'single', x: 0.5, waitClear: true },
          { delay: 3000, kind: 'brood', pattern: 'pair' },
          { delay: 3000, kind: 'tendril', pattern: 'line', count: 3 },
          { delay: 3000, kind: 'husk', pattern: 'pair' },
          { delay: 3000, kind: 'brood', pattern: 'pair' },
          { delay: 3000, kind: 'tendril', pattern: 'single', x: 0.25 },
          { delay: 3000, kind: 'spore', pattern: 'column', count: 5, x: 0.8, waitClear: true },
          { delay: 2000, kind: 'tendril', pattern: 'single', x: 0.6 },
          { delay: 2500, kind: 'brood', pattern: 'single', x: 0.7 },
          { delay: 3000, kind: 'tendril', pattern: 'pair' },
          { delay: 2500, kind: 'husk', pattern: 'single', x: 0.3 },
          { delay: 2000, kind: 'brood', pattern: 'pair', waitClear: true },
          { delay: 1500, kind: 'tendril', pattern: 'line', count: 3 },
          { delay: 1500, kind: 'husk', pattern: 'single', x: 0.5 },
          { delay: 2000, kind: 'tendril', pattern: 'pair', waitClear: true },
        ]),
        // Final beat
        { delay: 2000, kind: 'spore', pattern: 'line', count: 6 },
        { delay: 1200, kind: 'spore', pattern: 'vee', count: 7, x: 0.5 },
        { delay: 1500, kind: 'cdrone', pattern: 'swarm', count: 2, x: 0.1 },
        { delay: 800, kind: 'cdrone', pattern: 'swarm', count: 2, x: 0.9 },
      ],
    ],
  },
  // Levels 12 to 14: two legs each as long as level 11's final leg.
  // Level 12: Mimics copy your weapon and shrug it off, Husks soak up shots,
  // and coral walls grow in from the sides.
  {
    id: 'reef',
    name: 'HIVE REEF',
    desc: 'A LIVING CORAL MEGASTRUCTURE WITH WALLS THAT GROW AND CLOSE IN.',
    node: 'node_reef',
    theme: 'reef',
    allies: 2,
    hazards: [{ kind: 'wall', every: [5500, 8500] }],
    segments: [
      [
        { delay: 2500, kind: 'spore', pattern: 'line', count: 6 },
        { delay: 2500, kind: 'tendril', pattern: 'pair' },
        { delay: 1500, kind: 'spore', pattern: 'column', count: 5, x: 0.75 },
        { delay: 3000, kind: 'tendril', pattern: 'pair' },
        { delay: 2000, kind: 'husk', pattern: 'single', x: 0.3 },
        { delay: 4000, kind: 'spore', pattern: 'column', count: 5, x: 0.5, waitClear: true },
        { delay: 1500, kind: 'mimic', pattern: 'pair' },
        { delay: 1500, kind: 'tendril', pattern: 'single', x: 0.2 },
        { delay: 2500, kind: 'mimic', pattern: 'pair' },
        { delay: 2500, kind: 'spore', pattern: 'vee', count: 7, x: 0.6 },
        { delay: 2500, kind: 'spore', pattern: 'column', count: 5, x: 0.7, waitClear: true },
        { delay: 2500, kind: 'mimic', pattern: 'single', x: 0.5 },
        { delay: 2000, kind: 'tendril', pattern: 'pair' },
        { delay: 1500, kind: 'husk', pattern: 'single', x: 0.8 },
        { delay: 4000, kind: 'spore', pattern: 'column', count: 5, x: 0.2 },
        { delay: 2000, kind: 'husk', pattern: 'single', x: 0.7, waitClear: true },
        { delay: 3000, kind: 'spore', pattern: 'line', count: 5 },
        { delay: 2000, kind: 'spore', pattern: 'line', count: 6 },
        { delay: 1500, kind: 'husk', pattern: 'pair' },
        { delay: 3000, kind: 'mimic', pattern: 'single', x: 0.4 },
        { delay: 1500, kind: 'spore', pattern: 'column', count: 5, x: 0.4 },
        { delay: 3000, kind: 'mimic', pattern: 'pair', waitClear: true },
        { delay: 1500, kind: 'tendril', pattern: 'pair' },
        { delay: 3000, kind: 'husk', pattern: 'single', x: 0.3 },
        { delay: 3500, kind: 'mimic', pattern: 'single', x: 0.4 },
        { delay: 2000, kind: 'spore', pattern: 'vee', count: 7, x: 0.2 },
        { delay: 2000, kind: 'husk', pattern: 'single', x: 0.5, waitClear: true },
        { delay: 3000, kind: 'tendril', pattern: 'line', count: 3 },
        { delay: 3500, kind: 'spore', pattern: 'vee', count: 5, x: 0.6 },
        { delay: 2500, kind: 'spore', pattern: 'line', count: 6, waitClear: true },
      ],
      [
        { delay: 2500, kind: 'mimic', pattern: 'single', x: 0.5 },
        { delay: 2500, kind: 'spore', pattern: 'line', count: 6 },
        { delay: 1500, kind: 'tendril', pattern: 'pair' },
        { delay: 2500, kind: 'mimic', pattern: 'single', x: 0.3 },
        { delay: 3000, kind: 'spore', pattern: 'vee', count: 7, x: 0.5, waitClear: true },
        { delay: 2500, kind: 'mimic', pattern: 'single', x: 0.8 },
        { delay: 2500, kind: 'husk', pattern: 'single', x: 0.6 },
        { delay: 3500, kind: 'brood', pattern: 'single', x: 0.7 },
        { delay: 3500, kind: 'spore', pattern: 'column', count: 5, x: 0.4, waitClear: true },
        { delay: 3000, kind: 'mimic', pattern: 'pair' },
        { delay: 2500, kind: 'tendril', pattern: 'pair' },
        { delay: 3000, kind: 'brood', pattern: 'single', x: 0.75 },
        { delay: 3500, kind: 'tendril', pattern: 'pair' },
        { delay: 3000, kind: 'brood', pattern: 'single', x: 0.5 },
        { delay: 4000, kind: 'mimic', pattern: 'single', x: 0.75, waitClear: true },
        { delay: 2000, kind: 'spore', pattern: 'line', count: 5 },
        { delay: 2000, kind: 'husk', pattern: 'pair' },
        { delay: 3000, kind: 'mimic', pattern: 'single', x: 0.5 },
        { delay: 3000, kind: 'mimic', pattern: 'single', x: 0.25, waitClear: true },
        { delay: 2000, kind: 'spore', pattern: 'line', count: 5 },
        { delay: 2000, kind: 'husk', pattern: 'single', x: 0.8 },
        { delay: 4000, kind: 'mimic', pattern: 'single', x: 0.25 },
        { delay: 3000, kind: 'husk', pattern: 'single', x: 0.5 },
        { delay: 4000, kind: 'brood', pattern: 'pair' },
        { delay: 3000, kind: 'spore', pattern: 'line', count: 6, waitClear: true },
        { delay: 2500, kind: 'brood', pattern: 'pair', waitClear: true },
        // Final wave
        { delay: 1500, kind: 'husk', pattern: 'single', x: 0.6 },
        { delay: 2000, kind: 'brood', pattern: 'single', x: 0.3 },
        { delay: 1200, kind: 'spore', pattern: 'column', count: 5, x: 0.6 },
        { delay: 1500, kind: 'brood', pattern: 'single', x: 0.8 },
      ],
    ],
  },
  // Level 13: darkness, with only a pool of light around the ship. Brood
  // Mothers fill it with Spore Pods, and the Brood Queen waits at the end.
  {
    id: 'bloom',
    name: 'BLACK BLOOM',
    desc: 'A DARK NEBULA LIT BY GLOWING FLORA. YOU SEE ONLY WHAT YOUR LIGHTS REACH.',
    node: 'node_bloom',
    theme: 'bloom',
    allies: 2,
    dark: true,
    boss: 'queen',
    segments: [
      [
        { delay: 2500, kind: 'brood', pattern: 'single', x: 0.3 },
        { delay: 3000, kind: 'spore', pattern: 'line', count: 5 },
        { delay: 2000, kind: 'mimic', pattern: 'single', x: 0.6 },
        { delay: 3000, kind: 'brood', pattern: 'single', x: 0.5, waitClear: true },
        { delay: 4000, kind: 'spore', pattern: 'column', count: 5, x: 0.8 },
        { delay: 3000, kind: 'mimic', pattern: 'single', x: 0.25 },
        { delay: 2500, kind: 'spore', pattern: 'line', count: 5 },
        { delay: 3000, kind: 'brood', pattern: 'single', x: 0.7 },
        { delay: 3000, kind: 'brood', pattern: 'single', x: 0.2, waitClear: true },
        { delay: 3500, kind: 'brood', pattern: 'single', x: 0.75 },
        { delay: 4000, kind: 'tendril', pattern: 'pair' },
        { delay: 2000, kind: 'mimic', pattern: 'pair' },
        { delay: 3000, kind: 'spore', pattern: 'vee', count: 7, x: 0.2, waitClear: true },
        { delay: 3000, kind: 'mimic', pattern: 'pair' },
        { delay: 3000, kind: 'spore', pattern: 'vee', count: 7, x: 0.8 },
        { delay: 2500, kind: 'tendril', pattern: 'pair' },
        { delay: 2000, kind: 'brood', pattern: 'single', x: 0.4 },
        { delay: 3000, kind: 'spore', pattern: 'line', count: 5 },
        { delay: 3000, kind: 'spore', pattern: 'line', count: 5, waitClear: true },
        { delay: 1500, kind: 'brood', pattern: 'single', x: 0.4 },
        { delay: 3000, kind: 'mimic', pattern: 'line', count: 3 },
        { delay: 3000, kind: 'brood', pattern: 'pair' },
        { delay: 3000, kind: 'mimic', pattern: 'line', count: 3 },
        { delay: 4000, kind: 'spore', pattern: 'column', count: 5, x: 0.75, waitClear: true },
        { delay: 1500, kind: 'spore', pattern: 'column', count: 5, x: 0.3 },
        { delay: 3000, kind: 'spore', pattern: 'column', count: 5, x: 0.75 },
        { delay: 2500, kind: 'spore', pattern: 'column', count: 5, x: 0.4 },
        { delay: 2500, kind: 'spore', pattern: 'line', count: 6 },
        { delay: 3000, kind: 'brood', pattern: 'single', x: 0.8, waitClear: true },
        { delay: 3500, kind: 'brood', pattern: 'pair', waitClear: true },
      ],
      [
        { delay: 2500, kind: 'tendril', pattern: 'single', x: 0.2 },
        { delay: 3000, kind: 'brood', pattern: 'single', x: 0.2 },
        { delay: 3000, kind: 'brood', pattern: 'single', x: 0.6 },
        { delay: 3500, kind: 'spore', pattern: 'column', count: 5, x: 0.8 },
        { delay: 2500, kind: 'brood', pattern: 'single', x: 0.75, waitClear: true },
        { delay: 4000, kind: 'tendril', pattern: 'single', x: 0.8 },
        { delay: 3000, kind: 'husk', pattern: 'single', x: 0.2 },
        { delay: 3500, kind: 'brood', pattern: 'single', x: 0.7 },
        { delay: 3500, kind: 'tendril', pattern: 'single', x: 0.75 },
        { delay: 2500, kind: 'brood', pattern: 'single', x: 0.3, waitClear: true },
        { delay: 3500, kind: 'brood', pattern: 'single', x: 0.75 },
        { delay: 3000, kind: 'spore', pattern: 'line', count: 5 },
        { delay: 3000, kind: 'husk', pattern: 'single', x: 0.2 },
        { delay: 3500, kind: 'tendril', pattern: 'single', x: 0.3 },
        { delay: 3000, kind: 'spore', pattern: 'column', count: 5, x: 0.25, waitClear: true },
        { delay: 3000, kind: 'tendril', pattern: 'single', x: 0.25 },
        { delay: 2500, kind: 'spore', pattern: 'line', count: 5 },
        { delay: 2000, kind: 'brood', pattern: 'single', x: 0.6 },
        { delay: 4000, kind: 'tendril', pattern: 'single', x: 0.3 },
        { delay: 2500, kind: 'spore', pattern: 'column', count: 5, x: 0.25, waitClear: true },
        { delay: 3000, kind: 'brood', pattern: 'pair' },
        { delay: 3500, kind: 'husk', pattern: 'pair' },
        { delay: 3500, kind: 'tendril', pattern: 'pair' },
        { delay: 2500, kind: 'spore', pattern: 'line', count: 5 },
        { delay: 3000, kind: 'spore', pattern: 'vee', count: 7, x: 0.75 },
        { delay: 3000, kind: 'spore', pattern: 'line', count: 5, waitClear: true },
        { delay: 2500, kind: 'tendril', pattern: 'pair' },
        { delay: 2500, kind: 'spore', pattern: 'line', count: 5 },
        { delay: 2500, kind: 'brood', pattern: 'pair' },
        { delay: 3500, kind: 'tendril', pattern: 'line', count: 3, waitClear: true },
      ],
    ],
  },
  // Level 14: the living gate. Warp rings bring the Hollow in while the allied
  // fleet holds the line.
  {
    id: 'maw-gate',
    name: 'MAW GATE',
    desc: 'A VAST LIVING GATE. THE HOLLOW WARPS IN WHILE THE FLEET HOLDS THE LINE.',
    node: 'node_gate',
    theme: 'gate',
    allies: 3,
    gate: true,
    segmentNames: ['APPROACH', 'TO THE LAST GATE'],
    segmentRadio: [undefined, 'VOSS: THE LAST GATE\nOPENS ON THEIR WORLD.\nPUNCH THROUGH!'],
    // A third of the way in and just before the vendor; then after the vendor,
    // once each ring has passed, every 7 to 12 s, closing to 3 to 6 s, until
    // two thirds of the way. The last gate's three waves follow the last wave.
    warps: {
      at: [{ seg: 0, p: 0.33 }, { seg: 0, p: 0.9 }],
      every: { seg: 1, until: 2 / 3, start: [7000, 12000], end: [3000, 6000] },
    },
    // Both segments build: waves come closer together and grow as they go.
    segments: [
      swell(1, 1.45, ramp(1.05, 0.7, [
        { delay: 2500, kind: 'tendril', pattern: 'single', x: 0.2 },
        { delay: 2500, kind: 'brood', pattern: 'single', x: 0.3 },
        { delay: 3500, kind: 'husk', pattern: 'single', x: 0.25 },
        { delay: 4000, kind: 'spore', pattern: 'vee', count: 5, x: 0.2 },
        { delay: 3000, kind: 'husk', pattern: 'single', x: 0.4, waitClear: true },
        { delay: 4000, kind: 'husk', pattern: 'single', x: 0.8 },
        { delay: 4000, kind: 'mimic', pattern: 'single', x: 0.8 },
        { delay: 3000, kind: 'husk', pattern: 'single', x: 0.2 },
        { delay: 3500, kind: 'spore', pattern: 'vee', count: 5, x: 0.3 },
        { delay: 2000, kind: 'mimic', pattern: 'pair', waitClear: true },
        { delay: 3000, kind: 'tendril', pattern: 'pair' },
        { delay: 2000, kind: 'brood', pattern: 'single', x: 0.3 },
        { delay: 4000, kind: 'brood', pattern: 'single', x: 0.75 },
        { delay: 4000, kind: 'husk', pattern: 'single', x: 0.4 },
        { delay: 3000, kind: 'brood', pattern: 'single', x: 0.7, waitClear: true },
        { delay: 3000, kind: 'mimic', pattern: 'pair' },
        { delay: 2000, kind: 'spore', pattern: 'line', count: 6 },
        { delay: 3000, kind: 'tendril', pattern: 'single', x: 0.2 },
        { delay: 2000, kind: 'brood', pattern: 'single', x: 0.3 },
        { delay: 4000, kind: 'husk', pattern: 'single', x: 0.7 },
        { delay: 3500, kind: 'mimic', pattern: 'line', count: 3, waitClear: true },
        { delay: 3500, kind: 'spore', pattern: 'line', count: 6 },
        { delay: 3000, kind: 'spore', pattern: 'vee', count: 5, x: 0.25 },
        { delay: 3000, kind: 'tendril', pattern: 'line', count: 3 },
        { delay: 3000, kind: 'brood', pattern: 'single', x: 0.5 },
        { delay: 3000, kind: 'mimic', pattern: 'single', x: 0.4, waitClear: true },
        { delay: 3000, kind: 'husk', pattern: 'single', x: 0.25 },
        { delay: 4000, kind: 'mimic', pattern: 'line', count: 3 },
        { delay: 3000, kind: 'husk', pattern: 'single', x: 0.7 },
        { delay: 3500, kind: 'husk', pattern: 'single', x: 0.8, waitClear: true },
      ])),
      swell(1.15, 1.75, ramp(0.9, 0.55, [
        { delay: 2500, kind: 'tendril', pattern: 'single', x: 0.3 },
        { delay: 2000, kind: 'spore', pattern: 'vee', count: 7, x: 0.5 },
        { delay: 3000, kind: 'husk', pattern: 'single', x: 0.7 },
        { delay: 3500, kind: 'tendril', pattern: 'pair', waitClear: true },
        { delay: 2500, kind: 'brood', pattern: 'single', x: 0.6 },
        { delay: 3500, kind: 'tendril', pattern: 'pair' },
        { delay: 3000, kind: 'mimic', pattern: 'single', x: 0.2 },
        { delay: 1500, kind: 'husk', pattern: 'single', x: 0.5 },
        { delay: 3500, kind: 'mimic', pattern: 'pair' },
        { delay: 3000, kind: 'brood', pattern: 'single', x: 0.25, waitClear: true },
        { delay: 3000, kind: 'brood', pattern: 'single', x: 0.4 },
        { delay: 4000, kind: 'brood', pattern: 'single', x: 0.25 },
        { delay: 4000, kind: 'husk', pattern: 'single', x: 0.7 },
        { delay: 3000, kind: 'mimic', pattern: 'pair' },
        { delay: 2000, kind: 'husk', pattern: 'single', x: 0.4, waitClear: true },
        { delay: 4000, kind: 'spore', pattern: 'column', count: 5, x: 0.4 },
        { delay: 2500, kind: 'spore', pattern: 'vee', count: 7, x: 0.3 },
        { delay: 1500, kind: 'brood', pattern: 'pair' },
        { delay: 3000, kind: 'spore', pattern: 'vee', count: 7, x: 0.75, waitClear: true },
        { delay: 2000, kind: 'brood', pattern: 'single', x: 0.7 },
        { delay: 4000, kind: 'brood', pattern: 'single', x: 0.8 },
        { delay: 3500, kind: 'mimic', pattern: 'pair' },
        { delay: 2000, kind: 'brood', pattern: 'single', x: 0.8, waitClear: true },
        { delay: 4000, kind: 'husk', pattern: 'single', x: 0.6 },
        { delay: 3500, kind: 'mimic', pattern: 'pair' },
        { delay: 3000, kind: 'spore', pattern: 'vee', count: 5, x: 0.5, waitClear: true },
        // Final wave
        { delay: 1200, kind: 'tendril', pattern: 'line', count: 3 },
        { delay: 2000, kind: 'tendril', pattern: 'line', count: 3 },
        { delay: 1500, kind: 'brood', pattern: 'pair' },
        { delay: 2000, kind: 'spore', pattern: 'vee', count: 7, x: 0.7 },
      ])),
    ],
  },
  // Level 15: the longest run, with no vendor and no allies, in eight parts
  // that run straight into each other (see hive.ts): out of Maw Gate's vortex
  // through a great ring in a cavern, a winding tunnel with tentacles, a spore
  // cavern and the Sporeheart, a tunnel that splits and shuts its gates, the
  // storm outside, the vents back in, a nest of eggs and the twin Brood Wyrms,
  // and a short way down to the Hollow Mind's arena.
  {
    id: 'heart',
    name: 'HEART OF THE HOLLOW',
    desc: 'THE LONGEST RUN. NO VENDORS. LIVING TUNNELS, A RAGING STORM, THREE GUARDIANS AND THE MIND.',
    node: 'node_heart',
    theme: 'heart',
    vendorless: true,
    hive: true,
    segmentNames: ['RING', 'TUNNEL', 'SPORE CAVERN', 'FORKS', 'STORM', 'VENTS', 'NEST', 'TO THE MIND'],
    segmentBoss: [undefined, undefined, 'sporeheart', undefined, undefined, undefined, 'wyrm'],
    segmentRadio: [
      undefined,
      'REYES: IT\'S A PASSAGE.\nSTAY IN THE MIDDLE.',
      'REYES: SPORES. I CAN\'T\nSEE A THING IN HERE.',
      'VEX: IT SPLITS UP\nAHEAD. PICK A WAY.',
      'VEX: THIS WIND! IT\'S\nBLOWING US OFF COURSE!',
      'REYES: WE HAVE TO FIND\nANOTHER WAY BACK IN!',
      'VEX: EGGS IN THE\nGROWTH. BURN THEM.',
      'REYES: THE MIND IS\nRIGHT AHEAD. GO!',
    ],
    // The storm (winds, debris, Lancers), the vents and the spore-thick stretches
    // are run by the hive itself.
    segmentHazards: [
      [],
      [{ kind: 'tentacle', every: [6000, 9500] }],
      [{ kind: 'spores', every: [3500, 6000], ramp: 2.5 }],
      [],
      [],
      [],
      [
        { kind: 'barrier', every: [8000, 11000] }, { kind: 'growth', every: [4000, 6500] },
        // Two tentacles, each on its own timer.
        { kind: 'tentacle', every: [6000, 9500] }, { kind: 'tentacle', every: [7000, 11000] },
      ],
      [],
    ],
    boss: 'mind',
    segments: [
      // 0. The ring and the cavern.
      [
        { delay: 4000, kind: 'tendril', pattern: 'single', x: 0.5 },
        { delay: 3000, kind: 'spore', pattern: 'column', count: 3, x: 0.35 },
        { delay: 2500, kind: 'tendril', pattern: 'pair' },
        { delay: 2000, kind: 'brood', pattern: 'single', x: 0.65 },
      ],
      // 1. The tunnel, with tentacles.
      [
        { delay: 2500, kind: 'spore', pattern: 'column', count: 4, x: 0.5 },
        { delay: 3500, kind: 'tendril', pattern: 'single', x: 0.5 },
        { delay: 3500, kind: 'spore', pattern: 'column', count: 4, x: 0.3 },
        { delay: 3000, kind: 'tendril', pattern: 'single', x: 0.7 },
        { delay: 3500, kind: 'husk', pattern: 'pair' },
        { delay: 3000, kind: 'spore', pattern: 'vee', count: 5, x: 0.5 },
        { delay: 3500, kind: 'tendril', pattern: 'pair' },
        { delay: 4000, kind: 'larva', pattern: 'column', count: 6, x: 0.5 },
        { delay: 4000, kind: 'spore', pattern: 'column', count: 5, x: 0.6 },
        { delay: 3500, kind: 'tendril', pattern: 'single', x: 0.4 },
        { delay: 3000, kind: 'brood', pattern: 'single', x: 0.5 },
        { delay: 3000, kind: 'tendril', pattern: 'pair' },
        { delay: 3500, kind: 'mimic', pattern: 'single', x: 0.5 },
        { delay: 4000, kind: 'larva', pattern: 'column', count: 6, x: 0.4 },
        { delay: 3500, kind: 'husk', pattern: 'pair' },
        { delay: 3500, kind: 'tendril', pattern: 'single', x: 0.5 },
      ],
      // 2. The spore cavern, then the Sporeheart.
      [
        { delay: 2500, kind: 'spore', pattern: 'line', count: 5 },
        { delay: 3500, kind: 'mimic', pattern: 'single', x: 0.5 },
        { delay: 3000, kind: 'husk', pattern: 'single', x: 0.3 },
        { delay: 3000, kind: 'spore', pattern: 'column', count: 5, x: 0.75 },
        { delay: 3500, kind: 'tendril', pattern: 'line', count: 3 },
        { delay: 2500, kind: 'brood', pattern: 'single', x: 0.7 },
        { delay: 2500, kind: 'spore', pattern: 'vee', count: 7, x: 0.3 },
        { delay: 3500, kind: 'mimic', pattern: 'pair' },
        { delay: 3000, kind: 'husk', pattern: 'single', x: 0.7 },
        { delay: 2500, kind: 'spore', pattern: 'line', count: 6 },
        { delay: 2500, kind: 'tendril', pattern: 'pair' },
        { delay: 2000, kind: 'spore', pattern: 'vee', count: 7, x: 0.6 },
        { delay: 3000, kind: 'spore', pattern: 'line', count: 6, waitClear: true },
      ],
      // 3. The branching tunnel (hatchlings come from the hive too).
      [
        { delay: 3500, kind: 'tendril', pattern: 'single', x: 0.5 },
        { delay: 4000, kind: 'spore', pattern: 'column', count: 4, x: 0.5 },
        { delay: 4500, kind: 'husk', pattern: 'pair' },
        { delay: 4500, kind: 'tendril', pattern: 'pair' },
        { delay: 5000, kind: 'spore', pattern: 'line', count: 4 },
        { delay: 4500, kind: 'mimic', pattern: 'pair' },
        { delay: 5000, kind: 'tendril', pattern: 'pair' },
        { delay: 5000, kind: 'husk', pattern: 'pair' },
        { delay: 5000, kind: 'spore', pattern: 'line', count: 4 },
        { delay: 5000, kind: 'tendril', pattern: 'pair' },
        { delay: 5000, kind: 'brood', pattern: 'single', x: 0.5 },
        { delay: 5000, kind: 'husk', pattern: 'pair' },
        { delay: 5000, kind: 'tendril', pattern: 'pair' },
      ],
      // 4. The storm (Lancers come with it).
      [
        { delay: 3000, kind: 'husk', pattern: 'pair' },
        { delay: 3500, kind: 'tendril', pattern: 'line', count: 3 },
        { delay: 3500, kind: 'mimic', pattern: 'single', x: 0.6 },
        { delay: 3500, kind: 'spore', pattern: 'vee', count: 5, x: 0.4 },
        { delay: 3500, kind: 'brood', pattern: 'single', x: 0.3 },
        { delay: 3500, kind: 'husk', pattern: 'pair' },
        { delay: 3500, kind: 'tendril', pattern: 'pair' },
        { delay: 3500, kind: 'mimic', pattern: 'pair' },
        { delay: 3500, kind: 'spore', pattern: 'line', count: 5 },
        { delay: 3500, kind: 'husk', pattern: 'single', x: 0.5 },
        { delay: 3000, kind: 'tendril', pattern: 'line', count: 3 },
      ],
      // 5. The vents: the storm brings the rest, worse with each vent missed.
      [
        { delay: 4000, kind: 'husk', pattern: 'single', x: 0.6 },
        { delay: 5000, kind: 'tendril', pattern: 'pair' },
      ],
      // 6. The nest, then the twin Brood Wyrms.
      [
        { delay: 3000, kind: 'tendril', pattern: 'single', x: 0.5 },
        { delay: 3500, kind: 'larva', pattern: 'column', count: 5, x: 0.3 },
        { delay: 3500, kind: 'husk', pattern: 'single', x: 0.7 },
        { delay: 4000, kind: 'tendril', pattern: 'pair' },
        { delay: 4000, kind: 'brood', pattern: 'single', x: 0.5 },
        { delay: 3000, kind: 'larva', pattern: 'swarm', count: 6, x: 0.9 },
        { delay: 3500, kind: 'spore', pattern: 'line', count: 5 },
        { delay: 4000, kind: 'husk', pattern: 'single', x: 0.3 },
        { delay: 3500, kind: 'tendril', pattern: 'line', count: 3 },
        { delay: 3000, kind: 'mimic', pattern: 'pair' },
        { delay: 4000, kind: 'larva', pattern: 'column', count: 6, x: 0.7 },
        { delay: 3500, kind: 'brood', pattern: 'single', x: 0.3 },
        { delay: 4000, kind: 'tendril', pattern: 'pair' },
        { delay: 3500, kind: 'husk', pattern: 'pair' },
        { delay: 3000, kind: 'larva', pattern: 'swarm', count: 8, x: 0.1 },
      ],
      // 7. The way down to the Mind.
      [
        { delay: 2500, kind: 'tendril', pattern: 'pair' },
        { delay: 3500, kind: 'spore', pattern: 'line', count: 4 },
        { delay: 3000, kind: 'tendril', pattern: 'single', x: 0.5 },
      ],
    ],
  },
];

// How common each enemy is in a level, as 1 to 3 pips, most common first.
export function commonEnemies(l: LevelDef): [string, number][] {
  if (l.segments.length === 0) return l.enemies ?? [];
  const counts = new Map<string, number>();
  for (const w of l.segments.flat()) {
    const n = w.pattern === 'pair' ? 2 : w.count ?? 1;
    counts.set(w.kind, (counts.get(w.kind) ?? 0) + n);
  }
  const sorted = [...counts].sort((a, b) => b[1] - a[1]);
  const top = sorted[0]?.[1] ?? 1;
  return sorted.slice(0, 4).map(([k, n]) => [k, n >= top * 0.6 ? 3 : n >= top * 0.25 ? 2 : 1]);
}

// Enemies the player has flown against: everything in levels already cleared.
export function metEnemies(nextLevel: number): Set<string> {
  const met = new Set<string>();
  for (const l of LEVELS.slice(0, nextLevel - 1)) for (const w of l.segments.flat()) met.add(w.kind);
  return met;
}

// What waits at the end of a level, for the map.
export const levelEnder = (n: number) => ([3, 8, 13].includes(n) ? 'MINI BOSS' : [5, 10, 15].includes(n) ? 'BOSS' : '');
