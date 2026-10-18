export type EnemyKind = 'dart' | 'weaver' | 'gunboat' | 'drone' | 'bomber' | 'trapper' | 'driller' | 'lancer' | 'bulwark'
  | 'minelayer' | 'carrier' | 'phantom' | 'spore' | 'tendril' | 'brood' | 'mimic' | 'husk' | 'egg' | 'larva';
// line/column/vee/pair/single drop in from the top. swarm snakes in from the
// top corner on the side `x` names (under 0.5 is left) and crosses the screen.
// Drillers come in from the side `x` names instead of the top (pair = one from each side).
export type Pattern = 'line' | 'column' | 'vee' | 'pair' | 'single' | 'swarm';
export type Theme = 'outpost' | 'scrapyard' | 'asteroids' | 'ice' | 'blockade' | 'nebula' | 'forge' | 'relay'
  | 'blight' | 'throne' | 'deep' | 'rift' | 'reef' | 'bloom' | 'gate' | 'heart' | 'mist';
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
export type HazardKind = 'debris' | 'rock' | 'shard' | 'patch' | 'turret' | 'lightning' | 'flare' | 'fence'
  | 'spores' | 'doors' | 'well' | 'wall' | 'tentacle' | 'artery' | 'barrier' | 'growth'
  | 'press' | 'gust' | 'ember' | 'blackout' | 'sweep' | 'satchunk';
export type BossKind = 'rockjaw' | 'dreadnought' | 'watcher' | 'voss' | 'queen' | 'mind' | 'sporeheart' | 'wyrm'
  | 'frostjaw' | 'hollowwatcher' | 'broodmother';
// ramp: how many times as often it comes by the end of the segment as at the start.
export interface HazardSpec { kind: HazardKind; every: [number, number]; ramp?: number }

// Enemies warping into the top half of the screen (level 14): one-off warp-ins
// at points `p` (0..1) through a segment, `big` ones with twice the enemies;
// and in `every`'s segment, a warp-in every `start` ms at first, closing to
// every `end` ms, until `until` through it.
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
  allies?: number; // wingmen flying with the ship (act 3)
  dark?: boolean; // only a pool of light around the ship (level 13)
  // Level 15: segments run straight into each other with no vendor stop.
  vendorless?: boolean;
  segmentThemes?: Theme[]; // per segment, in place of `theme`
  segmentBoss?: (BossKind | undefined)[]; // a mini boss at the end of a segment
  segmentRadio?: (string | undefined)[]; // a radio call as each segment starts
  // The living tunnel: which segment flies through it, how long its narrow
  // part runs (px) and where its chambers start.
  tunnel?: { segment: number; len: number; chambers: number[] };
  warps?: WarpPlan;
  // Star map "common enemies" for levels that aren't built yet. Built levels
  // count their own wave scripts instead.
  enemies?: [string, number][];
}

// Wave scripts with every delay scaled by `k`, to the nearest 50 ms.
const shorten = (k: number, segs: Wave[][]) => segs.map((seg) => seg.map((w) => ({ ...w, delay: Math.round((w.delay * k) / 50) * 50 })));

export const isBuilt = (l: LevelDef | undefined): l is LevelDef => !!l && l.segments.length > 0;

export const LEVELS: LevelDef[] = [
  // Level 1, the tutorial: Darts and Weavers only, slow sparse bullets.
  {
    name: 'OUTPOST RUN',
    desc: 'HOME SYSTEM PATROL. RAIDER SCOUTS PROBE THE OUTPOST. A GOOD PLACE TO LEARN.',
    node: 'node_gas',
    theme: 'outpost',
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
    name: 'SILENT RELAY',
    desc: 'AN ABANDONED RELAY OF LASER FENCES. SOMETHING WATCHES, UNSEEN.',
    node: 'node_relay',
    theme: 'relay',
    hazards: [{ kind: 'fence', every: [9000, 13000] }],
    boss: 'watcher',
    segments: [
      [
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
      ],
      [
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
      ],
    ],
  },
  // Level 9: the first Hollow. Spore Pods burst into seekers, infected
  // Vossari hold the colony, and spore clouds hide whatever flies inside them.
  {
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
  // Act 3. Level 11 starts in normal space with the new allies. When the
  // vendor arrives, the rift tears open and pulls the vendor and the ship in.
  // A shorter leg inside alien space follows, then the vendor stop, then a
  // final leg half again as long as a level 6 to 10 segment.
  {
    name: 'THE RIFT',
    desc: 'A TEAR INTO ALIEN SPACE. GRAVITY BENDS SHOTS AND SHIPS. ALLIES JOIN YOU.',
    node: 'node_rift',
    theme: 'deep',
    riftAfter: 0,
    allies: 2,
    segmentHazards: [[], [{ kind: 'well', every: [7000, 10000] }], [{ kind: 'well', every: [6000, 9000] }]],
    segments: [
      [
        { delay: 2500, kind: 'gunboat', pattern: 'single', x: 0.75 },
        { delay: 1500, kind: 'spore', pattern: 'vee', count: 7, x: 0.7 },
        { delay: 3000, kind: 'tendril', pattern: 'pair' },
        { delay: 2500, kind: 'gunboat', pattern: 'single', x: 0.25 },
        { delay: 2000, kind: 'weaver', pattern: 'pair', waitClear: true },
        { delay: 2000, kind: 'spore', pattern: 'column', count: 5, x: 0.4 },
        { delay: 2500, kind: 'dart', pattern: 'line', count: 6 },
        { delay: 3000, kind: 'spore', pattern: 'line', count: 5 },
        { delay: 2000, kind: 'tendril', pattern: 'pair' },
        { delay: 2500, kind: 'gunboat', pattern: 'pair', waitClear: true },
        { delay: 1500, kind: 'dart', pattern: 'line', count: 6 },
        { delay: 2500, kind: 'weaver', pattern: 'pair' },
        { delay: 3000, kind: 'tendril', pattern: 'single', x: 0.6 },
        { delay: 3000, kind: 'dart', pattern: 'column', count: 6, x: 0.2 },
        { delay: 3000, kind: 'weaver', pattern: 'line', count: 4, waitClear: true },
        { delay: 3000, kind: 'gunboat', pattern: 'single', x: 0.2 },
        { delay: 1500, kind: 'weaver', pattern: 'line', count: 4 },
        { delay: 3000, kind: 'tendril', pattern: 'line', count: 3 },
        { delay: 3500, kind: 'tendril', pattern: 'single', x: 0.5 },
        { delay: 3000, kind: 'tendril', pattern: 'line', count: 3, waitClear: true },
      ],
      [
        { delay: 2000, kind: 'spore', pattern: 'line', count: 6 },
        { delay: 1500, kind: 'spore', pattern: 'line', count: 6 },
        { delay: 2500, kind: 'tendril', pattern: 'pair' },
        { delay: 2500, kind: 'spore', pattern: 'vee', count: 7, x: 0.3 },
        { delay: 2500, kind: 'brood', pattern: 'single', x: 0.2, waitClear: true },
        { delay: 3500, kind: 'tendril', pattern: 'pair' },
        { delay: 3000, kind: 'tendril', pattern: 'pair' },
        { delay: 3000, kind: 'tendril', pattern: 'single', x: 0.25 },
        { delay: 2500, kind: 'brood', pattern: 'single', x: 0.2 },
        { delay: 4000, kind: 'tendril', pattern: 'pair', waitClear: true },
        { delay: 1500, kind: 'brood', pattern: 'single', x: 0.4 },
        { delay: 3500, kind: 'tendril', pattern: 'pair' },
        { delay: 3000, kind: 'tendril', pattern: 'pair' },
        { delay: 3000, kind: 'tendril', pattern: 'single', x: 0.4, waitClear: true },
      ],
      [
        { delay: 2500, kind: 'tendril', pattern: 'single', x: 0.5 },
        { delay: 2500, kind: 'brood', pattern: 'single', x: 0.8 },
        { delay: 3000, kind: 'spore', pattern: 'column', count: 5, x: 0.2 },
        { delay: 2500, kind: 'tendril', pattern: 'single', x: 0.7 },
        { delay: 3000, kind: 'spore', pattern: 'column', count: 5, x: 0.75 },
        { delay: 2500, kind: 'tendril', pattern: 'pair', waitClear: true },
        { delay: 2000, kind: 'spore', pattern: 'column', count: 5, x: 0.6 },
        { delay: 1500, kind: 'tendril', pattern: 'pair' },
        { delay: 3000, kind: 'tendril', pattern: 'pair' },
        { delay: 2500, kind: 'spore', pattern: 'vee', count: 5, x: 0.5 },
        { delay: 2500, kind: 'spore', pattern: 'vee', count: 7, x: 0.3, waitClear: true },
        { delay: 3000, kind: 'spore', pattern: 'line', count: 6 },
        { delay: 3000, kind: 'brood', pattern: 'single', x: 0.2 },
        { delay: 3000, kind: 'husk', pattern: 'single', x: 0.8 },
        { delay: 4000, kind: 'tendril', pattern: 'pair' },
        { delay: 2500, kind: 'husk', pattern: 'single', x: 0.5, waitClear: true },
        { delay: 3000, kind: 'brood', pattern: 'pair' },
        { delay: 3500, kind: 'tendril', pattern: 'line', count: 3 },
        { delay: 3000, kind: 'husk', pattern: 'pair' },
        { delay: 3500, kind: 'brood', pattern: 'pair' },
        { delay: 3500, kind: 'tendril', pattern: 'single', x: 0.25 },
        { delay: 3000, kind: 'spore', pattern: 'column', count: 5, x: 0.8, waitClear: true },
        { delay: 2000, kind: 'tendril', pattern: 'single', x: 0.6 },
        { delay: 2500, kind: 'brood', pattern: 'single', x: 0.7 },
        { delay: 3500, kind: 'tendril', pattern: 'single', x: 0.6 },
        { delay: 2000, kind: 'brood', pattern: 'pair', waitClear: true },
        // Final wave
        { delay: 1500, kind: 'tendril', pattern: 'single', x: 0.2 },
        { delay: 1500, kind: 'husk', pattern: 'single', x: 0.5 },
        { delay: 2000, kind: 'spore', pattern: 'line', count: 6 },
        { delay: 1200, kind: 'tendril', pattern: 'pair' },
      ],
    ],
  },
  // Levels 12 to 14: two legs each as long as level 11's final leg.
  // Level 12: Mimics copy your weapon and shrug it off, Husks soak up shots,
  // and coral walls grow in from the sides.
  {
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
  // Level 14: the living gate. Tentacles sweep in from the sides while the
  // allied fleet holds the line.
  {
    name: 'MAW GATE',
    desc: 'A VAST LIVING GATE. TENTACLES SWEEP IN WHILE THE FLEET HOLDS THE LINE.',
    node: 'node_gate',
    theme: 'gate',
    allies: 3,
    hazards: [{ kind: 'tentacle', every: [5000, 8000] }],
    // A third of the way in and just before the vendor; then after the vendor
    // every 15 to 25 s, closing to 10 to 15 s, until two thirds of the way,
    // and a last big warp-in at seven eighths.
    warps: {
      at: [{ seg: 0, p: 0.33 }, { seg: 0, p: 0.9 }, { seg: 1, p: 0.875, big: true }],
      every: { seg: 1, until: 2 / 3, start: [15000, 25000], end: [10000, 15000] },
    },
    segments: [
      [
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
      ],
      [
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
      ],
    ],
  },
  // Level 15: the longest run, with no vendor and no allies, in five legs
  // that run straight into each other. The heart, then a living tunnel that
  // winds through chambers, then spore haze and the Sporeheart, then a nest of
  // growths and eggs and the Brood Wyrm, and a last stretch to the Hollow Mind.
  {
    name: 'HEART OF THE HOLLOW',
    desc: 'THE LONGEST RUN. NO VENDORS. A LIVING TUNNEL, TWO GUARDIANS AND THE MIND.',
    node: 'node_heart',
    theme: 'heart',
    vendorless: true,
    segmentThemes: ['heart', 'heart', 'mist', 'mist', 'heart'],
    segmentBoss: [undefined, undefined, 'sporeheart', 'wyrm'],
    segmentRadio: [
      undefined,
      'REYES: IT\'S A PASSAGE.\nSTAY IN THE MIDDLE.',
      'REYES: SPORES. I CAN\'T\nSEE A THING IN HERE.',
      'VEX: EGGS IN THE\nGROWTH. BURN THEM.',
      'REYES: THE MIND IS\nRIGHT AHEAD. GO!',
    ],
    tunnel: { segment: 1, len: 2040, chambers: [480, 1040, 1600] },
    segmentHazards: [
      [
        { kind: 'artery', every: [6000, 9000] }, { kind: 'tentacle', every: [9000, 13000] },
        { kind: 'wall', every: [11000, 15000] }, { kind: 'well', every: [14000, 19000] },
      ],
      [],
      [{ kind: 'spores', every: [5000, 8000] }, { kind: 'tentacle', every: [10000, 14000] }, { kind: 'well', every: [13000, 18000] }],
      [{ kind: 'barrier', every: [9000, 12000] }, { kind: 'growth', every: [4500, 7000] }],
      [{ kind: 'artery', every: [5000, 8000] }, { kind: 'tentacle', every: [8000, 12000] }, { kind: 'wall', every: [10000, 14000] }],
    ],
    boss: 'mind',
    // Each leg runs 15% shorter than its waves as written.
    segments: shorten(0.85, [
      [
        { delay: 2500, kind: 'tendril', pattern: 'pair' },
        { delay: 2500, kind: 'tendril', pattern: 'single', x: 0.75 },
        { delay: 1500, kind: 'brood', pattern: 'single', x: 0.8 },
        { delay: 4000, kind: 'tendril', pattern: 'single', x: 0.4, waitClear: true },
        { delay: 2500, kind: 'spore', pattern: 'column', count: 5, x: 0.3 },
        { delay: 2500, kind: 'brood', pattern: 'single', x: 0.75 },
        { delay: 4000, kind: 'mimic', pattern: 'single', x: 0.8 },
        { delay: 2500, kind: 'husk', pattern: 'single', x: 0.3 },
        { delay: 4000, kind: 'husk', pattern: 'single', x: 0.8 },
        { delay: 3000, kind: 'tendril', pattern: 'pair', waitClear: true },
        { delay: 3000, kind: 'brood', pattern: 'single', x: 0.3 },
        { delay: 4000, kind: 'mimic', pattern: 'pair' },
        { delay: 1500, kind: 'spore', pattern: 'column', count: 5, x: 0.5 },
        { delay: 2500, kind: 'brood', pattern: 'single', x: 0.2 },
        { delay: 3500, kind: 'mimic', pattern: 'pair', waitClear: true },
        { delay: 2500, kind: 'husk', pattern: 'single', x: 0.6 },
        { delay: 3500, kind: 'mimic', pattern: 'single', x: 0.75 },
        { delay: 3000, kind: 'husk', pattern: 'single', x: 0.3 },
        { delay: 3500, kind: 'tendril', pattern: 'single', x: 0.3 },
        { delay: 2500, kind: 'brood', pattern: 'single', x: 0.2, waitClear: true },
        { delay: 3000, kind: 'spore', pattern: 'line', count: 5 },
        { delay: 3000, kind: 'husk', pattern: 'single', x: 0.4 },
        { delay: 4000, kind: 'mimic', pattern: 'single', x: 0.5 },
        { delay: 2000, kind: 'tendril', pattern: 'pair', waitClear: true },
      ],
      [
        { delay: 3000, kind: 'spore', pattern: 'column', count: 4, x: 0.5 },
        { delay: 4000, kind: 'tendril', pattern: 'single', x: 0.5 },
        { delay: 4000, kind: 'spore', pattern: 'column', count: 4, x: 0.3 },
        { delay: 3000, kind: 'tendril', pattern: 'single', x: 0.7 },
        { delay: 4000, kind: 'husk', pattern: 'pair' },
        { delay: 3000, kind: 'spore', pattern: 'vee', count: 5, x: 0.5 },
        { delay: 4000, kind: 'tendril', pattern: 'pair' },
        { delay: 5000, kind: 'larva', pattern: 'column', count: 6, x: 0.5 },
        { delay: 5000, kind: 'spore', pattern: 'column', count: 5, x: 0.6 },
        { delay: 4000, kind: 'tendril', pattern: 'single', x: 0.4 },
        { delay: 3000, kind: 'brood', pattern: 'single', x: 0.5 },
        { delay: 3000, kind: 'tendril', pattern: 'pair' },
        { delay: 4000, kind: 'mimic', pattern: 'single', x: 0.5 },
        { delay: 5000, kind: 'larva', pattern: 'column', count: 6, x: 0.4 },
        { delay: 4000, kind: 'spore', pattern: 'column', count: 5, x: 0.5 },
        { delay: 4000, kind: 'tendril', pattern: 'single', x: 0.5 },
        { delay: 1500, kind: 'husk', pattern: 'pair' },
        { delay: 3000, kind: 'larva', pattern: 'line', count: 5 },
        { delay: 3000, kind: 'brood', pattern: 'single', x: 0.5 },
        { delay: 4000, kind: 'tendril', pattern: 'pair' },
        { delay: 5000, kind: 'larva', pattern: 'column', count: 6, x: 0.6 },
        { delay: 4000, kind: 'spore', pattern: 'vee', count: 5, x: 0.5 },
        { delay: 4000, kind: 'tendril', pattern: 'single', x: 0.5 },
        { delay: 4000, kind: 'spore', pattern: 'column', count: 5, x: 0.4 },
      ],
      [
        { delay: 3000, kind: 'spore', pattern: 'line', count: 5 },
        { delay: 3500, kind: 'mimic', pattern: 'single', x: 0.5 },
        { delay: 3000, kind: 'husk', pattern: 'single', x: 0.3 },
        { delay: 3000, kind: 'spore', pattern: 'column', count: 5, x: 0.75 },
        { delay: 3500, kind: 'tendril', pattern: 'line', count: 3, waitClear: true },
        { delay: 2500, kind: 'brood', pattern: 'single', x: 0.7 },
        { delay: 2500, kind: 'spore', pattern: 'vee', count: 7, x: 0.3 },
        { delay: 3500, kind: 'mimic', pattern: 'pair' },
        { delay: 3000, kind: 'husk', pattern: 'single', x: 0.7, waitClear: true },
        { delay: 2500, kind: 'tendril', pattern: 'pair' },
        { delay: 1500, kind: 'spore', pattern: 'column', count: 5, x: 0.2 },
        { delay: 2500, kind: 'husk', pattern: 'pair' },
        { delay: 3500, kind: 'larva', pattern: 'swarm', count: 6, x: 0.1 },
        { delay: 2000, kind: 'larva', pattern: 'swarm', count: 6, x: 0.9 },
        { delay: 3000, kind: 'brood', pattern: 'pair', waitClear: true },
        { delay: 2500, kind: 'mimic', pattern: 'line', count: 3, waitClear: true },
      ],
      [
        { delay: 3000, kind: 'tendril', pattern: 'single', x: 0.5 },
        { delay: 3500, kind: 'larva', pattern: 'column', count: 5, x: 0.3 },
        { delay: 3500, kind: 'husk', pattern: 'single', x: 0.7 },
        { delay: 4000, kind: 'tendril', pattern: 'pair' },
        { delay: 4000, kind: 'brood', pattern: 'single', x: 0.5, waitClear: true },
        { delay: 3000, kind: 'larva', pattern: 'swarm', count: 6, x: 0.9 },
        { delay: 3500, kind: 'spore', pattern: 'line', count: 5 },
        { delay: 4000, kind: 'husk', pattern: 'single', x: 0.3 },
        { delay: 3500, kind: 'tendril', pattern: 'line', count: 3, waitClear: true },
        { delay: 3000, kind: 'mimic', pattern: 'pair' },
        { delay: 4000, kind: 'larva', pattern: 'column', count: 6, x: 0.7 },
        { delay: 3500, kind: 'brood', pattern: 'single', x: 0.3 },
        { delay: 4000, kind: 'tendril', pattern: 'pair' },
        { delay: 3500, kind: 'husk', pattern: 'pair', waitClear: true },
        { delay: 3000, kind: 'larva', pattern: 'swarm', count: 8, x: 0.1 },
        { delay: 3000, kind: 'tendril', pattern: 'single', x: 0.6, waitClear: true },
      ],
      [
        { delay: 3000, kind: 'husk', pattern: 'pair' },
        { delay: 4000, kind: 'spore', pattern: 'column', count: 5, x: 0.3 },
        { delay: 2500, kind: 'tendril', pattern: 'line', count: 3 },
        { delay: 3000, kind: 'spore', pattern: 'vee', count: 7, x: 0.6 },
        { delay: 3000, kind: 'husk', pattern: 'single', x: 0.5, waitClear: true },
        { delay: 3500, kind: 'husk', pattern: 'pair' },
        { delay: 3000, kind: 'tendril', pattern: 'line', count: 3 },
        { delay: 3000, kind: 'brood', pattern: 'single', x: 0.7 },
        { delay: 3000, kind: 'tendril', pattern: 'pair' },
        { delay: 2500, kind: 'husk', pattern: 'single', x: 0.6, waitClear: true },
        { delay: 3000, kind: 'tendril', pattern: 'line', count: 3 },
        { delay: 3000, kind: 'spore', pattern: 'vee', count: 7, x: 0.25 },
      ],
    ]),
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
