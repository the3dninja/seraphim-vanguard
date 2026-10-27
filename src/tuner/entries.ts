import { BESTIARY } from '../data/bestiary';
import { BOSS_STATS, type BossStatsKind } from '../data/bosses';
import { DTYPES, ENEMY_STATS, type FoeKind, type Taken } from '../data/enemies';
import { CRATES, GEAR, RADAR, GEAR_TUNE, GEAR_UP_COST, ITEMS, KITS, WEAPONS, WEAPON_UP_COST, type GearId, type ItemId, type KitId, type Tuned, type WeaponId } from '../data/items';

// What the Tuner can change: one card per weapon, gear, item and foe, each
// with its in-game name and description and its numbers. Numbers come in four
// kinds:
// - a pair: its value at level 1 and how much it changes each level.
//   weapons.spread.interval is WEAPONS.spread.tune.interval[0], and
//   weapons.spread.interval.perLv is [1].
// - set level by level, 1 to 5, like weapons.ion.shots.lv3.
// - one number, like items.repair.heal or enemies.dart.hp.
// - damage taken by type, in %, like enemies.dart.taken.laser.

export type TuneCat = 'weapons' | 'gear' | 'items' | 'enemies';
export const CATS: { id: TuneCat; label: string }[] = [
  { id: 'weapons', label: 'WEAPONS' },
  { id: 'gear', label: 'GEAR' },
  { id: 'items', label: 'ITEMS' },
  { id: 'enemies', label: 'FOES' },
];

// One number on its own: the object and property it lives in.
export interface FlatValue { key: string; label: string; step: number; obj: Record<string | number, number>; prop: string | number }
// A damage-taken table: the label and the table.
export interface TakenTable { key: string; label: string; taken: Taken }

export interface TuneEntry {
  cat: TuneCat;
  id: string;
  name: string;
  desc: string;
  image?: { key: string; tint?: number }; // its in-game look: a texture, tinted as in the game
  flat: FlatValue[];
  taken: TakenTable[];
  values: Record<string, Tuned>; // the live numbers the game reads: [at level 1, change per level]
  levels: Record<string, number[]>; // numbers set level by level, 1 to 5
}

// What each pair means, and how far one tap of - or + moves it. A key can be
// given for one card only as id.key. A value with `from` only starts at that
// level (0 below it); its first number is its value there.
export const PROPS: Record<string, { label: string; step: number; from?: number }> = {
  damage: { label: 'DAMAGE', step: 0.1 },
  interval: { label: 'MS BETWEEN SHOTS', step: 10 },
  angle: { label: 'SPREAD: DEGREES BETWEEN SHOTS (ONE SHOT FLIES STRAIGHT)', step: 1 },
  'side.angle': { label: 'SPREAD ON EACH SIDE: DEGREES FROM FIRST TO LAST SHOT, CENTRED ON STRAIGHT OUT', step: 1 },
  gap: { label: 'GAP BETWEEN SHOTS SIDE BY SIDE (PX)', step: 1 },
  speed: { label: 'SHOT SPEED (PX/S)', step: 10 },
  splash: { label: 'BLAST RADIUS (PX)', step: 1 },
  splashDamage: { label: 'BLAST DAMAGE TO OTHERS', step: 0.1 },
  turn: { label: 'TURN RATE (HIGHER TURNS SHARPER)', step: 0.5 },
  jumps: { label: 'CHAIN JUMPS', step: 1 },
  jumpRange: { label: 'CHAIN JUMP RANGE (PX)', step: 2 },
  jumpDamage: { label: 'CHAIN DAMAGE (0.7 = 70% OF HIT)', step: 0.05 },
  stun: { label: 'STUN MS', step: 50 },
  life: { label: 'BOLT LIFE MS (SETS RANGE)', step: 20 },
  burn: { label: 'BURN DPS (1.1 = 110% OF HIT)', step: 0.1 },
  burnTime: { label: 'BURN MS', step: 100 },
  cling: { label: 'SPORES ONE ENEMY CAN HOLD', step: 1 },
  weave: { label: 'WEAVE WIDTH (PX)', step: 1 },
  fuse: { label: 'MS UNTIL A SHELL BURSTS', step: 20 },
  shrapnel: { label: 'SHRAPNEL PIECES', step: 1 },
  shrapDamage: { label: 'SHRAPNEL DAMAGE (0.8 = 80% OF HIT)', step: 0.05 },
  // Gear
  health: { label: 'EXTRA MAX HEALTH', step: 1 },
  radius: { label: 'RADIUS (PX)', step: 2 },
  'blink.radius': { label: 'SWAP RADIUS AROUND WHERE YOU LAND (PX)', step: 1 },
  'blink.stun': { label: 'STUN MS FOR SWAPPED ENEMIES', step: 50 },
  'blink.vortex': { label: 'VORTEX MS', step: 100 },
  'blink.vortexPull': { label: 'VORTEX PULL AT ITS CORE (PX/S)', step: 5 },
  'blink.vortexReach': { label: 'VORTEX REACH (PX)', step: 2 },
  'blink.vortexDamp': { label: 'VORTEX DAMPING (HIGHER SLOWS SHOTS AND CREDITS IN IT MORE)', step: 0.25 },
  'blink.vortexSpread': { label: 'HOW FAST ENEMIES IT HELD DRIFT APART AFTER (PX/S)', step: 2 },
  pull: { label: 'PULL SPEED (PX/S)', step: 5 },
  recharge: { label: 'RECHARGE MS', step: 100 },
  'satellite.interval': { label: 'MS BETWEEN DRONE SHOTS', step: 10 },
  'satellite.damage': { label: 'DRONE SHOT DAMAGE', step: 0.05 },
  safe: { label: 'UNTOUCHABLE MS', step: 10 },
  dist: { label: 'DISTANCE (PX)', step: 1 },
  'afterburner.burn': { label: 'BOOST MS', step: 100 },
  ram: { label: 'RAM DAMAGE (KILLS ANY SHIP WITH THAT MUCH HEALTH OR LESS)', step: 1 },
  spin: { label: 'SPIN MS', step: 20 },
  'burst.shots': { label: 'SHOTS IN THE RING', step: 1 },
  'burst.damage': { label: 'DAMAGE PER SHOT', step: 0.1 },
  'burst.gap': { label: 'MS BETWEEN RINGS', step: 50 },
  'burst.bursts': { label: 'RINGS THE POD FIRES (THE LAST AS IT POPS)', step: 1 },
  'burst.blastRadius': { label: 'POP BLAST RADIUS (PX, 0 = NONE)', step: 1 },
  'burst.blastDamage': { label: 'POP BLAST DAMAGE', step: 1 },
  'burst.bombs': { label: 'CLUSTER BOMBLETS IT THROWS WHEN IT POPS', step: 1 },
  scorch: { label: 'SCORCH (0.3 = 30% OF HIT, AS PLASMA)', step: 0.05 },
  'incendiary.burn': { label: 'BURN DPS (0.4 = 40% OF HIT)', step: 0.05 },
  'shaped.splash': { label: 'EXTRA BLAST RADIUS (PX)', step: 1 },
  bonus: { label: 'BONUS VS WEAKNESSES (0.15 = +15%)', step: 0.01 },
  'redirect.collect': { label: 'MS IT SOAKS UP SHOTS', step: 100 },
  'redirect.reach': { label: 'MAGNET RADIUS: PULLS TRAVELLING SHOTS IN FROM THIS FAR (PX)', step: 2 },
  'redirect.pull': { label: 'MAGNET STRENGTH (PX/S EACH SECOND)', step: 10 },
  'redirect.damp': { label: 'DAMPING (HIGHER SLOWS THE SHOTS IT PULLS MORE)', step: 0.25 },
  mult: { label: 'BEAM DAMAGE PER SHOT SOAKED UP (EXACT, IGNORES WEAKNESS AND RESISTANCE)', step: 0.05 },
  'redirect.radius': { label: 'SHOT-WIPING BLAST RADIUS (PX)', step: 1 },
  'redirect.widthMin': { label: 'BEAM WIDTH WITH 1 SHOT SOAKED UP (PX)', step: 1 },
  'redirect.widthMax': { label: 'BEAM WIDTH WITH 20 SHOTS SOAKED UP (PX)', step: 1 },
  'redirect.glowMin': { label: 'GLOW RADIUS WITH 1 SHOT SOAKED UP (PX)', step: 0.5 },
  'redirect.glowMax': { label: 'GLOW RADIUS WITH 20 SHOTS SOAKED UP (PX)', step: 0.5 },
  'radar.lineDist': { label: 'LINE SHOWS ONCE A SHOT IS THIS CLOSE (PX)', step: 5 },
  'radar.near': { label: 'NEAR MISS: PX AROUND THE HITBOX', step: 1 },
  'rear.damage': { label: 'BACKWARD SHOT DAMAGE (0.5 = 50% OF THE WEAPON\'S)', step: 0.025 },
};

// Numbers set level by level: what each means, the lowest and highest it can
// be, and which stat it sits under on the card (shots go at the top, others
// without `after` at the bottom). A key can be given for one card only as id.key.
export const LEVEL_PROPS: Record<string, { label: string; min: number; max: number; whole?: boolean; after?: string }> = {
  shots: { label: 'SHOTS PER VOLLEY', min: 1, max: 20, whole: true },
  'side.shots': { label: 'SHOTS PER SIDE', min: 1, max: 10, whole: true },
  stunChance: { label: 'STUN CHANCE % PER HIT AND PER CHAIN JUMP', min: 0, max: 100, after: 'stun' },
  hits: { label: 'HITS ABSORBED', min: 0, max: 10, whole: true },
  drones: { label: 'DRONES', min: 0, max: 4, whole: true },
  targets: { label: 'SHOTS DOWN THIS MANY AT ONCE', min: 1, max: 5, whole: true },
  'incendiary.burnTime': { label: 'BURN MS (0 = NO BURN, JUST THE SCORCH)', min: 0, max: 20000 },
  every: { label: 'A CHARGED SHOT EVERY N VOLLEYS', min: 1, max: 20, whole: true },
};
export const propOf = (e: TuneEntry, key: string) => PROPS[`${e.id}.${key}`] ?? PROPS[key] ?? { label: key.toUpperCase(), step: 1 };
export const levelPropOf = (e: TuneEntry, key: string) =>
  LEVEL_PROPS[`${e.id}.${key}`] ?? LEVEL_PROPS[key] ?? { label: key.toUpperCase(), min: 0, max: Infinity };

// What each item number means, and its step.
const ITEM_PROPS: Record<string, { label: string; step: number }> = {
  heal: { label: 'HEALTH RESTORED', step: 1 },
  time: { label: 'LASTS MS', step: 500 },
  rate: { label: 'FIRE RATE MULTIPLIER', step: 0.1 },
  bomblets: { label: 'BOMBLETS', step: 1 },
  angle: { label: 'DEGREES BETWEEN BOMBLETS', step: 1 },
  damage: { label: 'DAMAGE', step: 1 },
  'nova.damage': { label: 'DAMAGE TO EVERYTHING ON SCREEN', step: 1 },
  splash: { label: 'BLAST RADIUS (PX)', step: 1 },
  bossShare: { label: 'SHARE OF DAMAGE TO BOSSES (0.5 = HALF)', step: 0.05 },
  stun: { label: 'STUN MS', step: 250 },
  bonus: { label: 'CREDIT MULTIPLIER (1.5 = +50%)', step: 0.1 },
  every: { label: 'MS BETWEEN HEALS', step: 250 },
  slow: { label: 'ENEMY SPEED (0.5 = HALF)', step: 0.05 },
};

const price = (obj: { price: number }): FlatValue =>
  ({ key: 'price', label: 'PRICE (CREDITS)', step: 5, obj: obj as unknown as Record<string, number>, prop: 'price' });
// Base vendor upgrade costs, level 2 to 5, under the price.
const upCosts = (costs: number[]): FlatValue[] => costs.map((_, i) =>
  ({ key: `cost${i + 2}`, label: `UPGRADE COST TO LV ${i + 2} (CREDITS)`, step: 25, obj: costs as unknown as Record<number, number>, prop: i }));
const words = (k: string) => k.replace(/([A-Z])/g, ' $1').toUpperCase();
const TAKEN_LABEL = 'DAMAGE TAKEN % BY TYPE (100 NORMAL, 200 DOUBLE, 50 HALF, 0 IMMUNE)';

const weapons: TuneEntry[] = (Object.keys(WEAPONS) as WeaponId[]).map((id) => ({
  cat: 'weapons', id, name: WEAPONS[id].name, desc: WEAPONS[id].desc, image: { key: WEAPONS[id].icon }, flat: [price(WEAPONS[id]), ...upCosts(WEAPON_UP_COST[id])], taken: [],
  values: WEAPONS[id].tune ?? {}, levels: WEAPONS[id].levels ?? {},
}));

// Shot Radar's rewards, the same at every level.
const RADAR_LABELS: Record<keyof typeof RADAR, [string, number]> = {
  lines: ['PREVIEW LINES (1 = ENABLED, 0 = DISABLED)', 1], linesFrom: ['LINES SHOW FROM LV', 1], colorFrom: ['LINES TURN TEAL / RED FROM LV', 1],
  speedPer: ['SPEED PER NEAR MISS (0.01 = +1%)', 0.005], speedCap: ['MOST EXTRA SPEED (0.5 = +50%)', 0.05],
  creditsEvery: ['CREDITS EVERY N NEAR MISSES', 1], credits: ['CREDITS THE FIRST TIME', 1], creditsStep: ['CREDITS MORE EACH TIME AFTER', 1],
  burstEvery: ['360 BURST EVERY N', 1], burstStep: ['BURST A LEVEL STRONGER EVERY N AFTER THE FIRST', 1],
  overdriveEvery: ['OVERDRIVE EVERY N', 1], invulnEvery: ['INVULNERABLE EVERY N', 1], invulnMs: ['INVULNERABLE MS', 250],
  holeEvery: ['BLACK HOLE EVERY N', 1], holeMs: ['BLACK HOLE MS', 250], holeReach: ['BLACK HOLE REACH (PX)', 10], holePull: ['BLACK HOLE PULL ON ENEMIES (PX/S, SHOTS 6X)', 5],
};
const radarFlats: FlatValue[] = (Object.keys(RADAR) as (keyof typeof RADAR)[]).map((k) =>
  ({ key: k, label: RADAR_LABELS[k][0], step: RADAR_LABELS[k][1], obj: RADAR, prop: k }));

const gear: TuneEntry[] = (Object.keys(GEAR) as GearId[]).map((id) => ({
  cat: 'gear', id, name: GEAR[id].name, desc: `${GEAR[id].desc} EACH LEVEL: ${GEAR[id].levelUp}`, image: { key: GEAR[id].icon }, flat: [price(GEAR[id]), ...upCosts(GEAR_UP_COST[id]), ...(id === 'radar' ? radarFlats : [])], taken: [],
  values: GEAR_TUNE[id].tune, levels: GEAR_TUNE[id].levels ?? {},
}));

// Supply crates, the way usable gear comes in flight: how often they drop, for all of them.
const crates: TuneEntry = {
  cat: 'gear', id: 'crates', name: 'SUPPLY CRATES', image: { key: 'crate_afterburner' }, taken: [], values: {}, levels: {},
  desc: 'USABLE GEAR DROPS IN AS CRATES THAT FIRE IT WHEN PICKED UP. A SECOND USABLE GEAR STARTS HALF A WAIT LATER.',
  flat: [
    { key: 'every', label: 'MS BETWEEN CRATES (EACH GEAR)', step: 500, obj: CRATES, prop: 'every' },
    { key: 'vary', label: 'RANDOM OFFSET MS (EACH WAIT, UP TO THIS EITHER WAY)', step: 250, obj: CRATES, prop: 'vary' },
    { key: 'speed', label: 'FALL SPEED (PX/S)', step: 1, obj: CRATES, prop: 'speed' },
  ],
};

const items: TuneEntry[] = [
  ...(Object.keys(ITEMS) as ItemId[]).map((id): TuneEntry => {
    const def = ITEMS[id];
    const tune = def.tune ?? {};
    return {
      cat: 'items', id, name: def.name, desc: def.desc, image: { key: def.icon }, taken: [], values: {}, levels: {},
      flat: [price(def), ...Object.keys(tune).map((key) => ({
        key, ...(ITEM_PROPS[`${id}.${key}`] ?? ITEM_PROPS[key] ?? { label: key.toUpperCase(), step: 1 }), obj: tune, prop: key,
      }))],
    };
  }),
  ...(Object.keys(KITS) as KitId[]).map((id): TuneEntry => ({
    cat: 'items', id, name: KITS[id].name, desc: KITS[id].desc, image: { key: KITS[id].icon }, flat: [price(KITS[id])], taken: [], values: {}, levels: {},
  })),
];

// Names and write-ups from the Bestiary, plus the shot-down hazards it leaves out.
const BEAST = new Map(BESTIARY.flatMap((c) => c.entries).map((b) => [b.id as string, b]));
const EXTRA: Record<string, { name: string; desc: string; texture?: string; tint?: number }> = {
  mine: { name: 'NET MINE', desc: 'DROPPED BY TRAPPERS. A NET SLOWS YOUR SHIP.' },
  bomb: { name: 'BOMB', desc: 'DROPPED BY BOMBERS.' },
  pmine: { name: 'PROXIMITY MINE', desc: 'SEEDED BY MINE LAYERS. BURSTS WHEN YOU GET CLOSE.' },
  boulder: { name: 'BOULDER', desc: 'THROWN BY ROCKJAW.' },
  barrier: { name: 'HIVE BARRIER CELL', texture: 'barriercell', desc: 'THE FLESHY CELLS OF THE ORGANIC BARRIERS IN THE HIVE.' },
  cargo: { name: 'CARGO HAULER', texture: 'cargoship', desc: 'THE DERELICT HAULER OF A TREASURE ENDING. BREAK IT OPEN FOR CREDITS.' },
};
const named = (id: string) => {
  const b: { name: string; desc: string; texture?: string; tint?: number } = BEAST.get(id) ?? EXTRA[id] ?? { name: id.toUpperCase(), desc: '' };
  return { name: b.name, desc: b.desc, image: b.texture ? { key: b.texture, tint: b.tint } : undefined };
};

const foes: TuneEntry[] = (Object.keys(ENEMY_STATS) as FoeKind[]).map((id) => {
  const s = ENEMY_STATS[id];
  const flat: FlatValue[] = [{ key: 'hp', label: 'HEALTH', step: 0.5, obj: s as unknown as Record<string, number>, prop: 'hp' }];
  if (s.dropChance || s.credits[1]) {
    flat.push(
      { key: 'dropChance', label: 'DROP CHANCE (0.5 = 50%)', step: 0.05, obj: s as unknown as Record<string, number>, prop: 'dropChance' },
      { key: 'creditsMin', label: 'CREDITS DROPPED: LEAST', step: 1, obj: s.credits as unknown as Record<number, number>, prop: 0 },
      { key: 'creditsMax', label: 'CREDITS DROPPED: MOST', step: 1, obj: s.credits as unknown as Record<number, number>, prop: 1 },
    );
  }
  if (s.mimic) {
    flat.push(
      { key: 'mimicOwn', label: 'DAMAGE TAKEN % FROM YOUR FIRST WEAPON\'S TYPE', step: 10, obj: s.mimic, prop: 'own' },
      { key: 'mimicOthers', label: 'DAMAGE TAKEN % FROM EVERY OTHER TYPE', step: 10, obj: s.mimic, prop: 'others' },
    );
  }
  return {
    cat: 'enemies', id, ...named(id), image: { key: s.texture }, flat, taken: s.mimic ? [] : [{ key: 'taken', label: TAKEN_LABEL, taken: s.taken }], values: {}, levels: {},
  };
});

// Boss parts: health as hp (one part) or partHp, damage taken as taken (one
// table) or partTaken.
const bosses: TuneEntry[] = (Object.keys(BOSS_STATS) as BossStatsKind[]).map((id) => {
  const s = BOSS_STATS[id];
  const parts = Object.keys(s.hp);
  const tables = Object.keys(s.taken);
  return {
    cat: 'enemies', id, ...named(id), values: {}, levels: {},
    flat: parts.map((p) => ({
      key: parts.length > 1 ? `${p}Hp` : 'hp', label: parts.length > 1 ? `HEALTH: ${words(p)}` : 'HEALTH', step: 5, obj: s.hp, prop: p,
    })),
    taken: tables.map((p) => ({
      key: tables.length > 1 ? `${p}Taken` : 'taken', label: tables.length > 1 ? `DAMAGE TAKEN % BY TYPE: ${words(p)}` : TAKEN_LABEL, taken: s.taken[p],
    })),
  };
});

export const ENTRIES: TuneEntry[] = [...weapons, crates, ...gear, ...items, ...foes, ...bosses];

// A number's path: category.id.key, then .perLv for a pair's change each level,
// .lv1 to .lv5 for a number set level by level, or the damage type for damage taken.
export const PER_LV = '.perLv';
export const pathOf = (e: TuneEntry, key: string, i: 0 | 1) => `${e.cat}.${e.id}.${key}${i ? PER_LV : ''}`;
export const levelPath = (e: TuneEntry, key: string, lv: number) => `${e.cat}.${e.id}.${key}.lv${lv}`;
export const flatPath = (e: TuneEntry, key: string) => `${e.cat}.${e.id}.${key}`;

// Every number by path: the live object it sits in and where, and what it is.
// For pairs `i` is 0 for level 1 and 1 per level; for numbers set level by
// level it's the level less 1.
export interface TuneSlot {
  entry: TuneEntry;
  key: string;
  kind: 'pair' | 'level' | 'flat' | 'taken';
  obj: Record<string | number, number>;
  prop: string | number;
  i: number;
  label?: string; // flat values and damage-taken tables
}
export const BY_PATH = new Map<string, TuneSlot>(ENTRIES.flatMap((entry) => [
  ...entry.flat.map((f) => [flatPath(entry, f.key), { entry, key: f.key, kind: 'flat', obj: f.obj, prop: f.prop, i: 0, label: f.label }] as const),
  ...entry.taken.flatMap((t) => DTYPES.map((d) =>
    [`${flatPath(entry, t.key)}.${d}`, { entry, key: t.key, kind: 'taken', obj: t.taken, prop: d, i: 0, label: t.label }] as const)),
  ...Object.keys(entry.values).flatMap((key) =>
    ([0, 1] as const).map((i) => [pathOf(entry, key, i), { entry, key, kind: 'pair', obj: entry.values[key] as number[], prop: i, i }] as const)),
  ...Object.entries(entry.levels).flatMap(([key, arr]) =>
    arr.map((_, i) => [levelPath(entry, key, i + 1), { entry, key, kind: 'level', obj: arr, prop: i, i }] as const)),
] as [string, TuneSlot][]));

// The numbers as the game ships them, taken before anything is tuned.
export const GAME_VALUES = new Map<string, number>([...BY_PATH].map(([path, { obj, prop }]) => [path, obj[prop]]));
