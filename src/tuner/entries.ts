import { WEAPONS, type WeaponId } from '../data/items';

// What the Tuner can change: one card per weapon (later gear, items and
// enemies), each with its in-game name and description and the numbers in its
// `tune` record. A value's path is category.id.key, like weapons.spread.interval,
// which is also where it lives in the code (WEAPONS.spread.tune.interval).

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
  values: Record<string, number>; // the live numbers the game reads
}

// What each value means, and how far one tap of - or + moves it.
// "LV" values count from level 1 up to 5.
export const PROPS: Record<string, { label: string; step: number }> = {
  damage: { label: 'DAMAGE AT LV 1', step: 0.1 },
  growth: { label: 'DAMAGE GAIN PER LV (0.25 = +25%)', step: 0.05 },
  interval: { label: 'MS BETWEEN SHOTS', step: 10 },
  interval3: { label: 'MS BETWEEN SHOTS FROM LV 3', step: 10 },
  interval4: { label: 'MS BETWEEN SHOTS FROM LV 4', step: 10 },
  faster: { label: 'MS FASTER EACH LV', step: 5 },
  angle: { label: 'SPREAD ANGLE (DEGREES)', step: 1 },
  speed: { label: 'SHOT SPEED (PX/S)', step: 10 },
  splash: { label: 'BLAST RADIUS AT LV 1 (PX)', step: 1 },
  splashGain: { label: 'BLAST PX ADDED PER LV', step: 1 },
  turn: { label: 'TURN RATE (HIGHER TURNS SHARPER)', step: 0.5 },
  jumps: { label: 'CHAIN JUMPS', step: 1 },
  jumpRange: { label: 'CHAIN JUMP RANGE (PX)', step: 2 },
  jumpDamage: { label: 'CHAIN DAMAGE (0.7 = 70% OF HIT)', step: 0.05 },
  stun: { label: 'STUN MS AT LV 3', step: 50 },
  stunGain: { label: 'STUN MS ADDED PER LV AFTER 3', step: 25 },
  life: { label: 'BOLT LIFE MS (SETS RANGE)', step: 20 },
  burn: { label: 'BURN DPS (1.1 = 110% OF HIT)', step: 0.1 },
  burnTime: { label: 'BURN MS (BEFORE LV BONUS)', step: 100 },
  burnGain: { label: 'BURN MS ADDED PER LV', step: 100 },
  cling: { label: 'SPORES PER ENEMY (PLUS LV)', step: 1 },
};

export const ENTRIES: TuneEntry[] = (Object.keys(WEAPONS) as WeaponId[])
  .filter((id) => WEAPONS[id].tune)
  .map((id) => ({ cat: 'weapons', id, name: WEAPONS[id].name, desc: WEAPONS[id].desc, values: WEAPONS[id].tune! }));

export const pathOf = (e: TuneEntry, key: string) => `${e.cat}.${e.id}.${key}`;

// Every value by path, with the entry and key it belongs to.
export const BY_PATH = new Map<string, { entry: TuneEntry; key: string }>(
  ENTRIES.flatMap((entry) => Object.keys(entry.values).map((key) => [pathOf(entry, key), { entry, key }] as const)),
);

// The values as the game ships them, taken before anything is tuned.
export const GAME_VALUES = new Map<string, number>([...BY_PATH].map(([path, { entry, key }]) => [path, entry.values[key]]));
