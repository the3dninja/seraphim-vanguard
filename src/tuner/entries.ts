import { WEAPONS, type Tuned, type WeaponId } from '../data/items';

// What the Tuner can change: one card per weapon (later gear, items and
// enemies), each with its in-game name and description and the numbers in its
// `tune` record. Each stat is a pair: its value at level 1 and how much it
// changes each level. weapons.spread.interval is WEAPONS.spread.tune.interval[0],
// and weapons.spread.interval.perLv is [1].

export type TuneCat = 'weapons' | 'gear' | 'items' | 'enemies';
export const CATS: { id: TuneCat; label: string }[] = [
  { id: 'weapons', label: 'WEAPONS' },
  { id: 'gear', label: 'GEAR' },
  { id: 'items', label: 'ITEMS' },
  { id: 'enemies', label: 'FOES' },
];

export interface TuneEntry {
  cat: TuneCat;
  id: string;
  name: string;
  desc: string;
  values: Record<string, Tuned>; // the live numbers the game reads: [at level 1, change per level]
  shots?: number[]; // shots per volley at levels 1 to 5
}

// What each value means, and how far one tap of - or + moves it. A value with
// `from` only starts at that level (0 below it); its first number is its value there.
export const PROPS: Record<string, { label: string; step: number; from?: number }> = {
  damage: { label: 'DAMAGE', step: 0.1 },
  interval: { label: 'MS BETWEEN SHOTS', step: 10 },
  angle: { label: 'SPREAD: DEGREES BETWEEN SHOTS (ONE SHOT FLIES STRAIGHT)', step: 1 },
  speed: { label: 'SHOT SPEED (PX/S)', step: 10 },
  splash: { label: 'BLAST RADIUS (PX)', step: 1 },
  splashDamage: { label: 'BLAST DAMAGE TO OTHERS', step: 0.1 },
  turn: { label: 'TURN RATE (HIGHER TURNS SHARPER)', step: 0.5 },
  jumps: { label: 'CHAIN JUMPS', step: 1 },
  jumpRange: { label: 'CHAIN JUMP RANGE (PX)', step: 2 },
  jumpDamage: { label: 'CHAIN DAMAGE (0.7 = 70% OF HIT)', step: 0.05 },
  stun: { label: 'STUN MS (STARTS AT LV 3)', step: 50, from: 3 },
  life: { label: 'BOLT LIFE MS (SETS RANGE)', step: 20 },
  burn: { label: 'BURN DPS (1.1 = 110% OF HIT)', step: 0.1 },
  burnTime: { label: 'BURN MS', step: 100 },
  cling: { label: 'SPORES ONE ENEMY CAN HOLD', step: 1 },
};

export const ENTRIES: TuneEntry[] = (Object.keys(WEAPONS) as WeaponId[])
  .filter((id) => WEAPONS[id].tune)
  .map((id) => ({
    cat: 'weapons', id, name: WEAPONS[id].name, desc: WEAPONS[id].desc, values: WEAPONS[id].tune!, shots: WEAPONS[id].shotCount,
  }));

// A value's path: category.id.key for its level 1 number (or its first level's,
// see `from`), with .perLv on the end for how much it changes each level.
// Shot counts are category.id.shots.lv1 to .lv5.
export const PER_LV = '.perLv';
export const pathOf = (e: TuneEntry, key: string, i: 0 | 1) => `${e.cat}.${e.id}.${key}${i ? PER_LV : ''}`;
export const shotsPath = (e: TuneEntry, lv: number) => `${e.cat}.${e.id}.shots.lv${lv}`;

// Every number by path: the live array it sits in and where, and what it is
// (`key` is 'shots' for shot counts, with `i` the level less 1).
export interface TuneSlot { entry: TuneEntry; key: string; arr: number[]; i: number }
export const BY_PATH = new Map<string, TuneSlot>(ENTRIES.flatMap((entry) => [
  ...Object.keys(entry.values).flatMap((key) =>
    ([0, 1] as const).map((i) => [pathOf(entry, key, i), { entry, key, arr: entry.values[key], i }] as const)),
  ...(entry.shots ?? []).map((_, i) => [shotsPath(entry, i + 1), { entry, key: 'shots', arr: entry.shots!, i }] as const),
]));

// The numbers as the game ships them, taken before anything is tuned.
export const GAME_VALUES = new Map<string, number>([...BY_PATH].map(([path, { arr, i }]) => [path, arr[i]]));
