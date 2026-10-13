export type EnemyKind = 'dart' | 'weaver' | 'gunboat' | 'drone' | 'bomber';
// line/column/vee/pair/single drop in from the top. swarm snakes in from the
// top corner on the side `x` names (under 0.5 is left) and crosses the screen.
export type Pattern = 'line' | 'column' | 'vee' | 'pair' | 'single' | 'swarm';
export type Theme = 'outpost' | 'scrapyard' | 'asteroids';
export type HazardKind = 'debris' | 'rock';
export type BossKind = 'rockjaw';

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
  hazard?: { kind: HazardKind; every: [number, number] }; // ms between hazards during action
  boss?: BossKind; // fought after the last segment
  segments: Wave[][]; // a vendor stop sits between each pair of segments; empty = not built yet
  // Star map "common enemies" for levels that aren't built yet. Built levels
  // count their own wave scripts instead.
  enemies?: [string, number][];
}

export const isBuilt = (l: LevelDef | undefined): l is LevelDef => !!l && l.segments.length > 0;

// Shorthand for unbuilt levels on the map: name, description, picture, enemies.
const planned = (name: string, desc: string, node: string, enemies: [string, number][]): LevelDef =>
  ({ name, desc, node, theme: 'outpost', segments: [], enemies });

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
  // Level 2: Scrap Drones swarm in from the sides, Gunboats park and fire
  // spreads, and drifting wreckage soaks up shots from both sides.
  {
    name: 'SCRAPYARD BELT',
    desc: 'A GRAVEYARD OF WRECKS THAT BLOCK SHOTS. SALVAGE SWARMS AND ARMED HAULERS.',
    node: 'node_scrap',
    theme: 'scrapyard',
    hazard: { kind: 'debris', every: [5000, 8000] },
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
      ],
      [
        { delay: 2000, kind: 'drone', pattern: 'swarm', count: 7, x: 1 },
        { delay: 1800, kind: 'drone', pattern: 'swarm', count: 7, x: 0 },
        { delay: 3500, kind: 'gunboat', pattern: 'pair' },
        { delay: 4000, kind: 'weaver', pattern: 'line', count: 3 },
        { delay: 3000, kind: 'dart', pattern: 'vee', count: 7, x: 0.5 },
        { delay: 3000, kind: 'drone', pattern: 'swarm', count: 8, x: 1 },
        { delay: 2500, kind: 'gunboat', pattern: 'single', x: 0.3 },
        { delay: 1000, kind: 'dart', pattern: 'line', count: 6, waitClear: true },
      ],
      [
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
    hazard: { kind: 'rock', every: [3000, 5500] },
    boss: 'rockjaw',
    segments: [
      [
        { delay: 2500, kind: 'dart', pattern: 'vee', count: 5, x: 0.5 },
        { delay: 3000, kind: 'bomber', pattern: 'single', x: 0 },
        { delay: 4000, kind: 'weaver', pattern: 'pair' },
        { delay: 3000, kind: 'dart', pattern: 'line', count: 6 },
        { delay: 3000, kind: 'bomber', pattern: 'single', x: 1 },
        { delay: 3500, kind: 'drone', pattern: 'swarm', count: 7, x: 0 },
        { delay: 3000, kind: 'gunboat', pattern: 'single', x: 0.5, waitClear: true },
        { delay: 2000, kind: 'dart', pattern: 'column', count: 6, x: 0.3 },
        { delay: 800, kind: 'dart', pattern: 'column', count: 6, x: 0.7, waitClear: true },
      ],
      [
        { delay: 2000, kind: 'bomber', pattern: 'single', x: 0 },
        { delay: 1500, kind: 'bomber', pattern: 'single', x: 1 },
        { delay: 4000, kind: 'weaver', pattern: 'line', count: 4 },
        { delay: 3000, kind: 'gunboat', pattern: 'pair' },
        { delay: 3500, kind: 'dart', pattern: 'vee', count: 7, x: 0.4 },
        { delay: 3000, kind: 'drone', pattern: 'swarm', count: 8, x: 1 },
        { delay: 2500, kind: 'bomber', pattern: 'single', x: 0 },
        { delay: 2500, kind: 'dart', pattern: 'line', count: 6, waitClear: true },
      ],
      [
        { delay: 2000, kind: 'gunboat', pattern: 'line', count: 3 },
        { delay: 3500, kind: 'bomber', pattern: 'single', x: 1 },
        { delay: 1500, kind: 'weaver', pattern: 'pair' },
        { delay: 3000, kind: 'drone', pattern: 'swarm', count: 8, x: 0 },
        { delay: 1500, kind: 'drone', pattern: 'swarm', count: 8, x: 1 },
        { delay: 3000, kind: 'bomber', pattern: 'single', x: 0 },
        { delay: 1000, kind: 'dart', pattern: 'vee', count: 7, x: 0.5, waitClear: true },
      ],
    ],
  },
  planned('ICE RING OF HALVA', 'A FROZEN RING WHERE ICE SENDS THE SHIP SLIDING. DRILLS AND SNIPERS WAIT.',
    'node_ice', [['driller', 3], ['lancer', 2], ['dart', 1]]),
  planned('VOSSARI BLOCKADE', 'THE EMPIRE\'S FLEET RINGS A FORTRESS MOON. ADMIRAL KADE COMMANDS.',
    'node_moon', [['lancer', 3], ['bulwark', 2], ['gunboat', 1]]),
  planned('EMBER NEBULA', 'A RED NEBULA ALIVE WITH LIGHTNING. WATCH FOR THE FLASH BEFORE A STRIKE.',
    'node_nebula', [['minelayer', 3], ['gunboat', 2], ['dart', 2]]),
  planned('SOLAR FORGE', 'CLOSE ORBIT OF A STAR. FLARES SWEEP THE SCREEN; SHELTER BEHIND ROCK.',
    'node_star', [['carrier', 3], ['dart', 3], ['lancer', 1]]),
  planned('SILENT RELAY', 'AN ABANDONED RELAY OF LASER FENCES. SOMETHING WATCHES, UNSEEN.',
    'node_relay', [['phantom', 3], ['drone', 2], ['minelayer', 1]]),
  planned('BLIGHT COLONY', 'AN IMPERIAL COLONY GONE WRONG. SPORE CLOUDS HIDE WHAT MOVES INSIDE.',
    'node_blight', [['spore', 3], ['lancer', 2], ['bulwark', 1]]),
  planned('THRONE OF VOSS', 'THE VOSSARI CAPITAL. DOORS SLAM SHUT; THE DEFENSE GRID NEVER SLEEPS.',
    'node_throne', [['bulwark', 3], ['tendril', 2], ['phantom', 1]]),
  planned('THE RIFT', 'A TEAR INTO ALIEN SPACE. GRAVITY BENDS SHOTS AND SHIPS. ALLIES JOIN YOU.',
    'node_rift', [['tendril', 3], ['spore', 3], ['brood', 1]]),
  planned('HIVE REEF', 'A LIVING CORAL MEGASTRUCTURE WITH WALLS THAT GROW AND CLOSE IN.',
    'node_reef', [['mimic', 3], ['husk', 2], ['spore', 2]]),
  planned('BLACK BLOOM', 'A DARK NEBULA LIT BY GLOWING FLORA. YOU SEE ONLY WHAT YOUR LIGHTS REACH.',
    'node_bloom', [['brood', 3], ['spore', 3], ['tendril', 1]]),
  planned('MAW GATE', 'A VAST LIVING GATE. TENTACLES SWEEP IN WHILE THE FLEET HOLDS THE LINE.',
    'node_gate', [['husk', 3], ['mimic', 2], ['brood', 2]]),
  planned('HEART OF THE HOLLOW', 'INSIDE THE HIVE MIND. NO VENDORS. NO ALLIES. END THIS.',
    'node_heart', [['tendril', 3], ['husk', 3], ['brood', 2]]),
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
