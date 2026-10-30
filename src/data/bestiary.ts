import type { SaveData } from '../save';
import { BOSS_STATS } from './bosses';
import { ENEMY_STATS, resists, weakTo, type FoeKind } from './enemies';
import type { DType } from './items';
import { LEVELS, metEnemies, type BossKind, type LevelDef } from './levels';
import { SIDES } from './sides';

// The Bestiary at Base: every enemy and boss, grouped by faction in the order
// the story meets them. An entry stays a ? until the player has faced it.
export interface BeastEntry {
  id: FoeKind | BossKind; // also the key kills and sightings are counted under
  name: string;
  texture: string;
  tint?: number;
  boss?: 'BOSS' | 'MINI BOSS';
  weak: DType[];
  resist: DType[];
  desc: string;
}

export interface BeastCategory { name: string; entries: BeastEntry[] }

const foe = (id: FoeKind, name: string, desc: string): BeastEntry => {
  const s = ENEMY_STATS[id];
  return { id, name, texture: s.texture, weak: weakTo(s.taken), resist: resists(s.taken), desc };
};

// A boss shows what its main part takes (the first damage table).
const boss = (id: BossKind, name: string, texture: string, kind: 'BOSS' | 'MINI BOSS', desc: string, tint?: number): BeastEntry => {
  const taken = Object.values(BOSS_STATS[id].taken)[0];
  return { id, name, texture, tint, boss: kind, weak: weakTo(taken), resist: resists(taken), desc };
};

export const BESTIARY: BeastCategory[] = [
  {
    name: 'RAIDERS',
    entries: [
      foe('dart', 'DART', 'A RAIDER SCOUT. FAST AND FRAIL, IT COMES IN NUMBERS. ONE GOOD HIT BRINGS IT DOWN.'),
      foe('weaver', 'WEAVER', 'A RAIDER FIGHTER THAT SWINGS SIDE TO SIDE AS IT COMES DOWN THE SCREEN.'),
      foe('gunboat', 'GUNBOAT', 'A RAIDER GUN PLATFORM. IT PARKS ON THE SCREEN AND FIRES SPREADS UNTIL IT SINKS.'),
      foe('bomber', 'BOMBER', 'A HEAVY RAIDER BOMBER. ITS BOMBS FALL FASTER AND FASTER AND BURST WIDE. SHOOT THEM FROM AFAR.'),
      foe('trapper', 'TRAPPER', 'A RAIDER HAULER THAT HUGS THE EDGE AND SEEDS NET MINES. A NET SLOWS YOUR SHIP.'),
    ],
  },
  {
    name: 'DRONE SWARM',
    entries: [
      foe('drone', 'SCRAP DRONE', 'SALVAGE DRONES GONE FERAL. THEY SNAKE IN BY THE DOZEN AND POP AT A TOUCH.'),
      foe('driller', 'DRILLER', 'A MINING DRONE. IT LINES UP FROM THE SIDE, THEN RAMS STRAIGHT ACROSS.'),
      foe('minelayer', 'MINE LAYER', 'A SWARM HAULER THAT SEEDS PROXIMITY MINES. THEY BURST WHEN YOU GET CLOSE.'),
    ],
  },
  {
    name: 'TALUS BEASTS',
    entries: [
      boss('rockjaw', 'ROCKJAW', 'rockjaw', 'MINI BOSS',
        'A LIVING ASTEROID OF THE TALUS BELT. BREAK OFF ITS THREE ARMOR PLATES TO REACH THE CORE.'),
      boss('frostjaw', 'FROSTJAW', 'frostjaw', 'MINI BOSS',
        'ROCKJAW\'S ICY KIN, DEEP IN THE GLACIER VAULT. TOUGHER, AND IT SHEDS SHARDS OF ICE.'),
    ],
  },
  {
    name: 'VESPARAN EMPIRE',
    entries: [
      foe('lancer', 'LANCER', 'A VESPARAN STRIKE SHIP. A LINE BLINKS WHERE ITS BEAM WILL FIRE. GET OUT OF IT.'),
      foe('bulwark', 'BULWARK', 'A VESPARAN GUARD SHIP BEHIND A SHIELD THAT SOAKS UP SHOTS UNTIL IT BREAKS.'),
      foe('carrier', 'CARRIER', 'A VESPARAN CARRIER. IT PARKS AND LAUNCHES DARTS, FOUR AT A TIME.'),
      foe('phantom', 'PHANTOM', 'A VESPARAN STEALTH SHIP. SHOTS PASS THROUGH IT WHILE CLOAKED. HIT IT AS IT FIRES.'),
      boss('dreadnought', 'DREADNOUGHT', 'dread', 'BOSS',
        'ADMIRAL KADE\'S FLAGSHIP. DESTROY ITS FOUR TURRETS, THEN HIT THE BRIDGE WHILE ITS SHIELD IS DOWN.'),
      boss('watcher', 'THE WATCHER', 'watcher', 'MINI BOSS',
        'A VESPARAN SPY FRIGATE. IT HIDES AMONG DECOYS, AND ONLY THE REAL ONE TAKES DAMAGE.'),
      boss('voss', 'EMPEROR VESPAR', 'vossship', 'BOSS',
        'THE EMPEROR, POSSESSED. BREAK HIS SHIELD AND HULL, AND THE HOLLOW PARASITE INSIDE TEARS FREE.'),
    ],
  },
  {
    name: 'THE HOLLOW',
    entries: [
      foe('spore', 'SPORE POD', 'A DRIFTING HOLLOW POD. SHOOT IT DOWN AND IT BURSTS INTO SEEKERS.'),
      foe('seeker', 'SEEKER', 'A TINY HOLLOW HUNTER THAT SPILLS FROM PODS AND HUSKS. FRAIL, BUT IT NEVER STOPS.'),
      foe('tendril', 'TENDRIL', 'A LASHING HOLLOW CREATURE.'),
      foe('brood', 'BROODLING', 'A HULKING HOLLOW BEAST OF ALIEN SPACE. ION BARELY SCRATCHES IT.'),
      foe('husk', 'HUSK', 'A HOLLOWED SHELL, ARMORED AND SLOW. WHEN IT FALLS, SEEKERS SPILL OUT.'),
      foe('mimic', 'MIMIC', 'IT WEARS YOUR SHIP\'S SHAPE, AND SHRUGS OFF WHATEVER YOUR FIRST WEAPON DEALS.'),
      foe('egg', 'EGG', 'A HOLLOW EGG. BURN IT BEFORE IT HATCHES, OR THREE LARVAE CRAWL OUT.'),
      foe('larva', 'LARVA', 'A FRESH HATCHLING. WEAK ALONE, BUT THEY COME IN THREES.'),
      boss('queen', 'BROOD QUEEN', 'queen', 'MINI BOSS',
        'THE MOTHER OF BLACK BLOOM. SHE LAYS PODS AND CHARGES, AND HEALS IF YOU STOP HITTING HER.'),
      boss('hollowwatcher', 'HOLLOW WATCHER', 'watcher', 'MINI BOSS',
        'A WATCHER TAKEN BY THE HOLLOW. THE SAME TRICKS, AND FAR HARDER TO KILL.', 0xd800cc),
      boss('broodmother', 'BROOD MATRIARCH', 'queen', 'MINI BOSS',
        'AN ELDER BROOD QUEEN, SLOW TO DIE AND QUICK TO HEAL.', 0x58d854),
      boss('sporeheart', 'THE SPOREHEART', 'sporeheart', 'MINI BOSS',
        'A GIANT POD DEEP IN THE HIVE. SHOOT OFF ITS PETALS, THEN HIT THE CORE WHILE IT\'S OPEN.'),
      boss('wyrm', 'THE BROOD WYRMS', 'wyrmhead', 'MINI BOSS',
        'GREAT SERPENTS OF THE HIVE, A PAIR. ONLY THE HEADS CAN KILL THEM. ONE LAYS EGGS AND DIVES, THE PURPLE ONE SPITS RINGS AND LASHES ACROSS. KILL ONE AND THE OTHER RAGES.'),
      boss('mind', 'THE HOLLOW MIND', 'mindcore', 'BOSS',
        'THE WILL BEHIND THE HOLLOW. SHOOT ITS EYES, BREAK ITS MEMBRANE AND BURN ITS CORE.'),
    ],
  },
  {
    name: 'THE CORRUPTED',
    entries: [
      foe('cdart', 'CORRUPTED DART', 'A DART OVERGROWN BY THE HOLLOW. IT MEANDERS DOWN SLOWLY AND FIRES BACK NOW.'),
      foe('cweaver', 'CORRUPTED WEAVER', 'IT SWINGS WIDER AND LURCHES AS IT GOES, FIRING FANS OF THREE.'),
      foe('cgunboat', 'CORRUPTED GUNBOAT', 'IT PARKS AND TAKES TURNS: A WIDE FAN OF SHOTS, THEN A RING. SEEKERS SPILL OUT WHEN IT FALLS.'),
      foe('cbomber', 'CORRUPTED BOMBER', 'IT HUNTS YOU CLOSELY, DROPPING THREE BOMBS AT A TIME AND SPRAYING SHOTS BETWEEN.'),
      foe('ctrapper', 'CORRUPTED TRAPPER', 'IT BOBS AS IT CROSSES, SEEDING NET MINES THAT THROW SHOTS AS THEY BURST.'),
      foe('cdrone', 'CORRUPTED DRONE', 'A SCRAP DRONE GONE WILDER STILL. IT SNAKES WIDE AND TAKES POTSHOTS.'),
      foe('cdriller', 'CORRUPTED DRILLER', 'IT RAMS ACROSS SPRAYING SHOTS UP AND DOWN, THEN TURNS FOR A SECOND RUN.'),
      foe('cminelayer', 'CORRUPTED MINE LAYER', 'SIX MINES INSTEAD OF FOUR, EACH BURSTING INTO MORE SHOTS, AND IT FIRES BACK.'),
      foe('clancer', 'CORRUPTED LANCER', 'THREE WARNING LINES IN A FAN, THEN THREE BEAMS. FIND THE GAP.'),
      foe('cbulwark', 'CORRUPTED BULWARK', 'A TOUGHER SHIELD, AND FANS OF FIVE SHOTS FROM BEHIND IT.'),
      foe('ccarrier', 'CORRUPTED CARRIER', 'IT LAUNCHES CORRUPTED DARTS, THEN A RING OF SHOTS AS IT BACKS AWAY.'),
      foe('cphantom', 'CORRUPTED PHANTOM', 'IT CLOAKS LIKE A PHANTOM, BUT FIRES FANS OF SHOTS EACH TIME IT SHOWS ITSELF.'),
    ],
  },
];

// Everything the player has faced. Sightings are logged in flight; saves from
// before the Bestiary fill in from the levels and side missions already beaten.
export function discovered(state: SaveData): Set<string> {
  const seen = new Set<string>([...state.seen, ...Object.keys(state.kills), ...metEnemies(state.level)]);
  const beaten: LevelDef[] = [...LEVELS.slice(0, state.level - 1), ...SIDES.filter((s) => state.sides.includes(s.id))];
  for (const l of beaten) {
    for (const w of l.segments.flat()) seen.add(w.kind);
    if (l.boss) seen.add(l.boss);
    for (const b of l.segmentBoss ?? []) if (b) seen.add(b);
  }
  if (seen.has('spore') || seen.has('husk')) seen.add('seeker');
  if (seen.has('egg')) seen.add('larva');
  return seen;
}

// Discovered entries the player hasn't looked at in the Bestiary yet.
export function unreadFoes(state: SaveData): string[] {
  const known = [...discovered(state)];
  state.read ??= known;
  const read = new Set(state.read);
  return known.filter((id) => !read.has(id) && BESTIARY.some((c) => c.entries.some((e) => e.id === id)));
}
