// Prices and stats are placeholders for playtesting, not final numbers.

export type WeaponId = 'pulse' | 'spread' | 'twin' | 'homing' | 'plasma' | 'ion' | 'wave' | 'rail' | 'flak'
  | 'side' | 'bio';
export type ItemId = 'repair' | 'shield' | 'overdrive' | 'fullrepair' | 'nova' | 'cluster' | 'emp' | 'warp'
  | 'decoy' | 'booster' | 'drone' | 'rewind';
export type GearId = 'deflector' | 'magnet' | 'plating' | 'satellite' | 'dodge' | 'blink' | 'afterburner' | 'roll'
  | 'antimissile' | 'burst' | 'incendiary' | 'ioncoat' | 'shaped' | 'overcharge' | 'scanner' | 'rear';
export type KitId = 'wkit' | 'gkit';

// Every weapon deals one damage type. Enemies take double damage from types
// they're weak to and half from types they resist.
export type DType = 'kinetic' | 'laser' | 'plasma' | 'ion' | 'explosive';
export const DTYPE_COLOR: Record<DType, number> = {
  kinetic: 0xbcbcbc, laser: 0xd82800, plasma: 0x58d854, ion: 0x3cbcfc, explosive: 0xf8b800,
};

export interface Shot { dx: number; deg: number } // x offset from the nose, degrees from straight up

// How a weapon's shots behave beyond flying straight:
// homing steers at the nearest enemy, pierce passes through enemies, arc
// chains to nearby enemies on a hit and fades at short range, wave weaves and
// passes through cover, rail charges then fires a fast piercing lance, flak
// bursts into shrapnel partway up, latch homes slowly and clings to what it
// hits, burning it, seek steers only at enemies in a cone ahead of the shot.
export type WeaponFx = 'homing' | 'pierce' | 'arc' | 'wave' | 'rail' | 'flak' | 'latch' | 'seek';

export interface WeaponDef {
  name: string;
  price: number;
  desc: string;
  icon: string;
  texture: string;
  levelTextures?: Record<number, string>; // a different shot look from that level on
  dtype: DType;
  where: 'start' | 'base' | 'level'; // Base vendor stock, or an in-level vendor exclusive
  from: number; // first level whose vendors stock it
  score: number; // how strong it is, 1 to 9: in-level vendors stock stronger things as the campaign goes on
  speed?: number; // px per second, 300 if not given
  fx?: WeaponFx;
  splash?: number; // explosive splash radius in px
  // Stats at each upgrade level, 1 to 5. Damage rises every level; levels 3
  // and 5 also bring the weapon's signature bump.
  // `splash` overrides the fixed splash radius when it grows with level.
  // `splashDamage` is what the splash does to the others it catches (half the hit if not given).
  stats: (this: WeaponDef, level: number) => {
    interval: number; shots: Shot[]; damage: number; splash?: number; splashDamage?: number; speed?: number;
  };
  // Numbers the Tuner (?tune) can change while playing, each as its value at
  // level 1 and how much it changes each level. Where a weapon has these, its
  // stats read them, so changing one changes the weapon.
  tune?: Record<string, Tuned>;
  // Numbers the Tuner sets level by level, 1 to 5. `shots` is shots per volley:
  // where a weapon has it, its shots fan out tune.angle degrees apart (one shot
  // flies straight).
  levels?: Record<string, number[]>;
}

export type Tuned = [lv1: number, perLv: number];
// A tuned number at a level. Some only start at a later level (`from`): below
// it they're 0, and the first number is their value at that level.
export const atLv = ([base, per]: Tuned, lv: number, from = 1) => (lv < from ? 0 : base + per * (lv - from));

export const MAX_WEAPON_LEVEL = 5;
const fan = (...degs: number[]): Shot[] => degs.map((deg) => ({ dx: 0, deg }));
// A tuned weapon's volley at a level: its shot count fanned out `angle` degrees
// apart and `gap` px apart side by side, centred on straight ahead.
const tunedFan = (def: WeaponDef, lv: number): Shot[] => {
  const n = Math.max(1, Math.round(def.levels!.shots[lv - 1]));
  const a = atLv(def.tune!.angle, lv);
  const gap = def.tune!.gap ? atLv(def.tune!.gap, lv) : 0;
  return Array.from({ length: n }, (_, i) => ({ dx: (i - (n - 1) / 2) * gap, deg: (i - (n - 1) / 2) * a }));
};
// The usual stats of a tuned weapon at a level.
function tunedStats(this: WeaponDef, lv: number) {
  const t = this.tune!;
  return {
    interval: atLv(t.interval, lv),
    shots: tunedFan(this, lv),
    damage: atLv(t.damage, lv),
    speed: atLv(t.speed, lv),
    ...(t.splash && { splash: atLv(t.splash, lv) }),
    ...(t.splashDamage && { splashDamage: atLv(t.splashDamage, lv) }),
  };
}

export interface ItemDef {
  name: string;
  price: number;
  desc: string;
  icon: string;
  cap: number; // max stack in one item slot
  rare?: boolean; // only in-level vendors stock it, and only sometimes
  score?: number; // rare items: how strong, like weapons and gear
  // What it does, as the Tuner (?tune) can change it. Times are in ms.
  tune?: Record<string, number>;
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pulse: {
    name: 'PULSE BLASTER', price: 40, score: 1, icon: 'icon_pulse', texture: 'bullet', dtype: 'kinetic', where: 'start', from: 1,
    desc: 'KINETIC. FAST STRAIGHT SHOTS. RELIABLE BUT NARROW.',
    tune: { damage: [1, 0.2], interval: [140, -15], angle: [0, 0], gap: [6, 0], speed: [300, 10] },
    levels: { shots: [1, 1, 1, 1, 2] },
    stats: tunedStats,
  },
  spread: {
    name: 'SPREAD GUN', price: 75, score: 2, icon: 'icon_spread', texture: 'pellet', dtype: 'kinetic', where: 'base', from: 1,
    desc: 'KINETIC. 3 SHOTS IN A FAN. COVERS THE SCREEN. FIRES FASTER EACH LEVEL.',
    levelTextures: { 3: 'pellet3', 5: 'pellet5' },
    tune: { damage: [1, 0.15], interval: [400, -50], angle: [14, 0], speed: [250, 0] },
    levels: { shots: [3, 3, 4, 4, 5] },
    stats: tunedStats,
  },
  twin: {
    name: 'TWIN LASER', price: 150, score: 3, icon: 'icon_twin', texture: 'laser', dtype: 'laser', where: 'level', from: 2,
    desc: 'LASER. TWO FAST PARALLEL BEAMS, 3 AT LV 3. GOOD VS LIGHT ARMOR, WEAK VS SHIELDS.',
    tune: { damage: [0.75, 0.1], interval: [170, -12.5], angle: [0, -0.5], gap: [6, 0], speed: [450, 10] },
    levels: { shots: [2, 2, 3, 3, 4] },
    stats: tunedStats,
  },
  homing: {
    name: 'HOMING MISSILES', price: 220, score: 4, icon: 'icon_homing', texture: 'missile', dtype: 'explosive', where: 'level', from: 3,
    speed: 150, fx: 'homing', splash: 15, desc: 'EXPLOSIVE. SLOW MISSILES THAT SEEK AND BLAST. LOW FIRE RATE.',
    // Damage climbs faster than other weapons (75% a level) and the blast grows.
    tune: {
      damage: [1.5, 0.25], interval: [720, -25], splash: [15, 2], splashDamage: [1, 0.25], speed: [150, 0], turn: [4, 0.5],
      angle: [70, -10],
    },
    levels: { shots: [1, 1, 2, 2, 3] },
    stats: tunedStats,
  },
  plasma: {
    name: 'PLASMA LOBBER', price: 280, score: 5, icon: 'icon_plasma', texture: 'blob', dtype: 'plasma', where: 'base', from: 4,
    fx: 'pierce', desc: 'PLASMA. BIG SLOW BLOBS THAT PIERCE. MELTS ARMOR AND THE HOLLOW.',
    tune: { damage: [2, 0.35], interval: [900, -25], angle: [16, 0], speed: [110, 0] },
    levels: { shots: [1, 1, 1, 1, 2] },
    stats: tunedStats,
  },
  ion: {
    name: 'ION ARC', price: 320, score: 6, icon: 'icon_ion', texture: 'arc', dtype: 'ion', where: 'base', from: 5,
    fx: 'arc', desc: 'ION. SHORT RANGE LIGHTNING THAT JUMPS TO 3 TARGETS. STRIPS SHIELDS. CAN STUN.',
    // Jumps, stun and bolt life are read by the game as the arcs fly (see chainArc).
    tune: {
      damage: [1, 0.25], interval: [400, -5], jumps: [0.5, 0.5], jumpRange: [30, 5], jumpDamage: [0.5, 0.25],
      stun: [250, 250], life: [400, -25], angle: [10, 0], speed: [330, 0],
    },
    levelTextures: { 3: 'arc3', 5: 'arc5' },
    levels: { shots: [1, 1, 2, 2, 3], stunChance: [30, 40, 50, 60, 75] },
    stats: tunedStats,
  },
  wave: {
    name: 'WAVE BEAM', price: 250, score: 5, icon: 'icon_wave', texture: 'wavebolt', dtype: 'laser', where: 'level', from: 6,
    fx: 'wave', desc: 'LASER. A WEAVING BEAM THAT PASSES THROUGH COVER AND WALLS.',
    // Paired beams weave opposite ways (see updateShots).
    tune: { damage: [1.3, 0.125], interval: [260, -12.5], angle: [0, 0], gap: [2, 0], speed: [240, 20], weave: [9, 1] },
    levels: { shots: [1, 1, 1, 1, 2] },
    stats: tunedStats,
  },
  rail: {
    name: 'RAIL LANCE', price: 400, score: 8, icon: 'icon_rail', texture: 'rail', dtype: 'kinetic', where: 'base', from: 7,
    fx: 'rail', desc: 'KINETIC. CHARGES, THEN FIRES A LANCE THAT PIERCES EVERYTHING. HUGE HIT.',
    tune: { damage: [7, 1.75], interval: [1300, -50], angle: [0, 0], gap: [8, 0], speed: [900, 0] },
    levels: { shots: [1, 1, 1, 1, 2] },
    stats: tunedStats,
  },
  flak: {
    name: 'FLAK CANNON', price: 270, score: 7, icon: 'icon_flak', texture: 'flak', dtype: 'explosive', where: 'level', from: 8,
    fx: 'flak', desc: 'EXPLOSIVE. SHELLS BURST INTO SHRAPNEL MID SCREEN. GREAT VS SWARMS. AT LV 5 A DIRECT HIT BURSTS TOO.',
    // The fuse, shrapnel count and shrapnel damage are read as shells burst (see flakBurst).
    tune: {
      damage: [1, 0.15], interval: [650, -22.5], angle: [20, 0], speed: [220, 0], fuse: [420, 0], shrapnel: [7, 1],
      shrapDamage: [0.8, 0],
    },
    levels: { shots: [1, 1, 1, 1, 2] },
    stats: tunedStats,
  },
  side: {
    name: 'SIDE WINDERS', price: 170, score: 3, icon: 'icon_side', texture: 'sidemissile', dtype: 'explosive', where: 'level', from: 4,
    fx: 'seek', desc: 'EXPLOSIVE. FAST LITTLE MISSILES OUT TO THE SIDES THAT SEEK ENEMIES THERE. TINY BLAST.',
    // Shots go straight out to each side: `shots` is how many a side, fanned
    // evenly across `angle` degrees centred on straight out (0 = all straight out).
    tune: { damage: [0.5, 0.05], interval: [300, 0], angle: [30, -2], speed: [260, 5], splash: [6, 1], turn: [7, 0.5] },
    levels: { shots: [1, 2, 4, 5, 7] },
    stats(lv) {
      const n = Math.max(1, Math.round(this.levels!.shots[lv - 1]));
      const a = atLv(this.tune!.angle, lv);
      const side = Array.from({ length: n }, (_, i) => 90 + (n > 1 ? a * (i / (n - 1) - 0.5) : 0));
      return { ...tunedStats.call(this, lv), shots: fan(...side.map((d) => -d).reverse(), ...side) };
    },
  },
  bio: {
    name: 'BIO SEEKER', price: 380, score: 9, icon: 'icon_bio', texture: 'sporeshot', dtype: 'plasma', where: 'base', from: 11,
    fx: 'latch', desc: 'PLASMA. SEEKING SPORES THAT CLING ON AND BURN. MORE CLING AS IT LEVELS. GREAT VS THE HOLLOW.',
    // Light hits that grow by spore count (one more each level) and a harder,
    // longer burn. Spores cling and burn (see bioLatch).
    tune: { damage: [0.5, 0.1], interval: [350, 0], burn: [2, 0.5], burnTime: [3000, 500], cling: [3, 1], angle: [24, 0], speed: [160, 0] },
    levels: { shots: [1, 2, 3, 4, 5] },
    stats: tunedStats,
  },
};

export const ITEMS: Record<ItemId, ItemDef> = {
  repair: { name: 'REPAIR KIT', price: 50, icon: 'icon_repair', cap: 3, desc: 'RESTORES 2 HEALTH.', tune: { heal: 2 } },
  shield: { name: 'SHIELD CELL', price: 75, icon: 'icon_shield', cap: 2, desc: 'BLOCKS ALL DAMAGE FOR 5 SECONDS.', tune: { time: 5000 } },
  overdrive: { name: 'OVERDRIVE CELL', price: 75, icon: 'icon_overdrive', cap: 3, desc: 'DOUBLE FIRE RATE FOR 5 SECONDS.', tune: { time: 5000, rate: 2 } },
  cluster: { name: 'CLUSTER BOMB', price: 100, icon: 'icon_cluster', cap: 2, desc: 'DROPS 10 BOMBLETS IN A CONE AHEAD. HALF DAMAGE TO BOSSES.',
    tune: { bomblets: 10, angle: 7, damage: 10, splash: 10, bossShare: 0.5 },
  },
  emp: { name: 'EMP PULSE', price: 75, icon: 'icon_emp', cap: 2, desc: 'STUNS MACHINES AND STRIPS SHIELDS ON SCREEN FOR 5 SECONDS.', tune: { stun: 5000 } },
  decoy: { name: 'DECOY FLARE', price: 75, icon: 'icon_decoy', cap: 3, desc: 'AIMED SHOTS, SEEKERS AND LUNGES CHASE THE FLARE FOR 5 SECONDS.', tune: { time: 5000 } },
  booster: { name: 'CREDIT BOOSTER', price: 75, icon: 'icon_booster', cap: 1, desc: '+50% CREDIT DROPS FOR THE REST OF THE SEGMENT.', tune: { bonus: 1.5 } },
  drone: { name: 'REPAIR DRONE', price: 125, icon: 'icon_drone', cap: 2, desc: 'HEALS 1 HEALTH EVERY 4 SECONDS FOR 20 SECONDS.',
    tune: { heal: 1, every: 4000, time: 20000 },
  },
  fullrepair: { name: 'FULL REPAIR', price: 200, score: 4, icon: 'icon_fullrepair', cap: 1, rare: true, desc: 'RESTORES ALL HEALTH.' },
  nova: { name: 'NOVA BOMB', price: 125, score: 7, icon: 'icon_nova', cap: 1, rare: true, desc: 'BLASTS EVERYTHING ON SCREEN AND CLEARS ENEMY SHOTS.', tune: { damage: 16 } },
  warp: { name: 'TIME WARP', price: 75, score: 5, icon: 'icon_warp', cap: 1, rare: true, desc: 'ENEMIES AND THEIR SHOTS MOVE AT HALF SPEED FOR 5 SECONDS.', tune: { time: 5000, slow: 0.5 } },
  rewind: {
    name: 'REWIND BEACON', price: 250, score: 9, icon: 'icon_rewind', cap: 1, rare: true,
    desc: 'IF YOUR SHIP IS DESTROYED, RESTART AT THE LAST VENDOR WITH FULL HEALTH.',
  },
};

// A stack as it shows in a slot: how many against how many fit, like 1/3.
export const stackLabel = (it: { id: ItemId; count: number }) => `${it.count}/${ITEMS[it.id].cap}`;

// Upgrade Kits: sold only by in-level vendors. Each raises one weapon or one
// gear by a level. Apply right away or keep it in storage for later.
export interface KitDef { name: string; price: number; score: number; desc: string; icon: string; target: 'weapon' | 'gear' }
export const KITS: Record<KitId, KitDef> = {
  wkit: { name: 'WEAPON KIT', price: 250, score: 5, icon: 'icon_wkit', target: 'weapon', desc: 'RAISES ANY ONE WEAPON BY 1 LEVEL, UP TO 5.' },
  gkit: { name: 'GEAR KIT', price: 250, score: 6, icon: 'icon_gkit', target: 'gear', desc: 'RAISES ANY ONE GEAR BY 1 LEVEL, UP TO 5.' },
};

// Special gear sits in gear slots. Passive gear works on its own; movement and
// active gear drops in as supply crates that fire it when picked up; augments change how your
// weapons behave. Like weapons, each one is one of a kind and has levels 1 to 5.
export const MAX_GEAR_LEVEL = 5;

export interface GearDef {
  name: string;
  price: number;
  desc: string;
  icon: string;
  from: number; // first level whose vendors stock it
  where: 'base' | 'level'; // Base vendor stock, or an in-level vendor exclusive
  score: number; // how strong it is, 1 to 9 (see WeaponDef)
  levelUp: string; // what each upgrade level adds, for the Upgrade tab
  active?: boolean; // comes as supply crates in flight (see CRATES), each firing it once
}

export const GEAR: Record<GearId, GearDef> = {
  plating: {
    name: 'HULL PLATING', price: 400, score: 4, icon: 'icon_plating', from: 6, where: 'base',
    desc: '+2 MAX HEALTH ON TOP OF HULL UPGRADES.', levelUp: '+1 MAX HEALTH.',
  },
  magnet: {
    name: 'CREDIT MAGNET', price: 300, score: 3, icon: 'icon_magnet', from: 6, where: 'base',
    desc: 'PULLS IN CREDITS FROM A WIDE RADIUS.', levelUp: 'A WIDER, STRONGER PULL.',
  },
  deflector: {
    name: 'DEFLECTOR', price: 450, score: 6, icon: 'icon_deflector', from: 6, where: 'level',
    desc: 'ABSORBS 1 HIT, THEN RECHARGES IN 8 SECONDS.', levelUp: 'FASTER RECHARGE. 2 HITS AT LV 3, 3 AT LV 5.',
  },
  satellite: {
    name: 'SATELLITE', price: 600, score: 7, icon: 'icon_satellite', from: 6, where: 'level',
    desc: 'A MINI DRONE CIRCLES YOU AND FIRES SMALL SHOTS.', levelUp: 'FASTER FIRE. 2 DRONES AT LV 3, 3 AT LV 5.',
  },
  dodge: {
    name: 'DODGE THRUSTERS', price: 350, score: 5, icon: 'icon_dodge', from: 9, where: 'base', active: true,
    desc: 'SUPPLY CRATES: A QUICK DASH THE WAY YOU ARE MOVING, UNTOUCHABLE FOR A MOMENT.', levelUp: 'LONGER SAFE TIME.',
  },
  blink: {
    name: 'BLINK DRIVE', price: 500, score: 7, icon: 'icon_blink', from: 9, where: 'level', active: true,
    desc: 'SUPPLY CRATES: TELEPORT A SHORT WAY THE WAY YOU ARE MOVING. PASSES THROUGH WALLS.', levelUp: 'A LONGER JUMP.',
  },
  afterburner: {
    name: 'AFTERBURNER', price: 380, score: 5, icon: 'icon_afterburner', from: 9, where: 'base', active: true,
    desc: 'SUPPLY CRATES: A SPEED BOOST. RAMMING LIGHT ENEMIES WHILE IT BURNS DESTROYS THEM.', levelUp: 'LONGER BURN, HARDER RAM. RAMS BIG SHIPS AT LV 5.',
  },
  roll: {
    name: 'BARREL ROLL', price: 420, score: 7, icon: 'icon_roll', from: 10, where: 'level', active: true,
    desc: 'SUPPLY CRATES: A SPIN THAT SENDS ENEMY SHOTS BACK THE WAY THEY CAME.', levelUp: 'A LONGER SPIN.',
  },
  burst: {
    name: '360 BURST', price: 450, score: 7, icon: 'icon_burst', from: 10, where: 'level', active: true,
    desc: 'SUPPLY CRATES: FIRES A RING OF SHOTS IN EVERY DIRECTION.', levelUp: 'MORE SHOTS, HITTING HARDER.',
  },
  antimissile: {
    name: 'ANTI-MISSILE', price: 500, score: 8, icon: 'icon_antimissile', from: 9, where: 'base',
    desc: 'A TURRET THAT SHOOTS DOWN ENEMY SHOTS AND SEEKERS NEAR YOU, LEVEL AND AHEAD FIRST.', levelUp: 'FASTER, WIDER. ARCS ON TO A 2ND AT LV 3, A 3RD AT LV 5.',
  },
  incendiary: {
    name: 'INCENDIARY AMMO', price: 400, score: 6, icon: 'icon_incendiary', from: 9, where: 'base',
    desc: 'AUGMENT. KINETIC SHOTS GLOW HOT, SCORCH WHAT THEY HIT AND SET IT BURNING.', levelUp: 'HOTTER, AND IT BURNS LONGER.',
  },
  ioncoat: {
    name: 'ION COATING', price: 450, score: 7, icon: 'icon_ioncoat', from: 9, where: 'level',
    desc: 'AUGMENT. LASER WEAPONS DEAL ION DAMAGE, SO THEY BREAK SHIELDS, AND STUN BRIEFLY.', levelUp: 'A LONGER STUN EACH LEVEL.',
  },
  shaped: {
    name: 'SHAPED CHARGES', price: 420, score: 6, icon: 'icon_shaped', from: 10, where: 'base',
    desc: 'AUGMENT. EXPLOSIVE WEAPONS IGNORE RESISTANCE.', levelUp: 'BIGGER SPLASH.',
  },
  overcharge: {
    name: 'OVERCHARGER', price: 550, score: 9, icon: 'icon_overcharge', from: 11, where: 'level',
    desc: 'AUGMENT. EVERY 6TH VOLLEY IS A CHARGED SHOT WITH TRIPLE DAMAGE.', levelUp: 'EVERY 5TH AT LV 3, EVERY 4TH AT LV 5.',
  },
  rear: {
    name: 'REAR GUARD', price: 320, score: 4, icon: 'icon_rear', from: 6, where: 'level',
    desc: 'THE WEAPON IN THE SAME NUMBERED SLOT ALSO FIRES BACKWARD.', levelUp: 'THE BACKWARD SHOTS HIT HARDER.',
  },
  scanner: {
    name: 'TARGET SCANNER', price: 300, score: 5, icon: 'icon_scanner', from: 9, where: 'base',
    desc: 'AUGMENT. SHOWS WHAT EACH ENEMY IS WEAK TO, AND +15% DAMAGE VS WEAKNESSES.', levelUp: 'A BIGGER BONUS.',
  },
};

// What each gear does at a level, 1 to 5, as the Tuner (?tune) can change it:
// `tune` numbers are [at level 1, change per level], `levels` numbers are set
// level by level. Read by the game while flying. Durations are in ms.
export const GEAR_TUNE: Record<GearId, { tune: Record<string, Tuned>; levels?: Record<string, number[]> }> = {
  plating: { tune: { health: [2, 1] } },
  magnet: { tune: { radius: [44, 8], pull: [85, 15] } },
  deflector: { tune: { recharge: [8000, -1000] }, levels: { hits: [1, 1, 2, 2, 3] } },
  satellite: { tune: { interval: [650, -50], damage: [1, 0.15] }, levels: { drones: [1, 1, 2, 2, 3] } },
  dodge: { tune: { safe: [500, 50], dist: [42, 0] } },
  blink: { tune: { dist: [50, 5] } },
  afterburner: { tune: { burn: [2200, 400], ram: [3, 1] } },
  roll: { tune: { spin: [600, 120] } },
  burst: { tune: { shots: [12, 2], damage: [1, 0.2] } },
  antimissile: { tune: { interval: [900, -75], radius: [45, 5] }, levels: { targets: [1, 1, 2, 2, 3] } },
  // Scorch is extra plasma damage on the hit (a share of it); a burn time of 0 means no burn.
  incendiary: { tune: { scorch: [0.5, 0.25], burn: [0.5, 0.25] }, levels: { burnTime: [500, 1000, 2000, 3000, 4000] } },
  ioncoat: { tune: { stun: [300, 300] } },
  shaped: { tune: { splash: [6, 3] } },
  overcharge: { tune: {}, levels: { every: [6, 6, 5, 5, 4] } },
  scanner: { tune: { bonus: [0.15, 0.05] } },
  rear: { tune: { damage: [0.5, 0.125] } }, // share of the paired weapon's damage
};

// Supply crates: each equipped active gear drops in as a crate, one every
// `every` ms give or take up to `vary` ms. With two, the second slot's first
// crate comes halfway through the first slot's second wait, so they stay apart.
// A level can switch them off for a segment (LevelDef.noCrates).
export const CRATES = { every: 12000, vary: 3000 };
// The light color on each crate, from its gear's icon.
export const CRATE_ACCENT: Partial<Record<GearId, string>> = { dodge: 'C', blink: 'P', afterburner: 'O', roll: 'C', burst: 'Y' };

// A gear's numbers at a level, by name. Counts are rounded to whole numbers.
const GEAR_COUNTS = new Set(['health', 'hits', 'drones', 'shots', 'targets', 'every']);
function gearAt(id: GearId, lv: number) {
  const g = GEAR_TUNE[id];
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(g.tune)) out[k] = atLv(v, lv);
  for (const [k, v] of Object.entries(g.levels ?? {})) out[k] = v[Math.min(v.length, Math.max(1, lv)) - 1];
  for (const k of Object.keys(out)) if (GEAR_COUNTS.has(k)) out[k] = Math.round(out[k]);
  return out;
}
const gs = <K extends string>(id: GearId) => (lv: number) => gearAt(id, lv) as Record<K, number>;

export const gearStats = {
  plating: gs<'health'>('plating'),
  magnet: gs<'radius' | 'pull'>('magnet'),
  deflector: gs<'hits' | 'recharge'>('deflector'),
  satellite: gs<'drones' | 'interval' | 'damage'>('satellite'),
  dodge: gs<'safe' | 'dist'>('dodge'),
  blink: gs<'dist'>('blink'),
  afterburner: gs<'burn' | 'ram'>('afterburner'),
  roll: gs<'spin'>('roll'),
  burst: gs<'shots' | 'damage'>('burst'),
  antimissile: gs<'interval' | 'radius' | 'targets'>('antimissile'),
  incendiary: gs<'scorch' | 'burn' | 'burnTime'>('incendiary'),
  ioncoat: gs<'stun'>('ioncoat'),
  shaped: gs<'splash'>('shaped'),
  overcharge: gs<'every'>('overcharge'),
  scanner: gs<'bonus'>('scanner'),
  rear: gs<'damage'>('rear'),
};

// A weapon's shot look at a level.
export function shotTexture(def: WeaponDef, lv: number) {
  let tex = def.texture;
  for (const [from, t] of Object.entries(def.levelTextures ?? {})) if (lv >= Number(from)) tex = t;
  return tex;
}

export const isWeapon = (id: string): id is WeaponId => id in WEAPONS;
export const isItem = (id: string): id is ItemId => id in ITEMS;
export const isGear = (id: string): id is GearId => id in GEAR;
export const isKit = (id: string): id is KitId => id in KITS;

export function defOf(id: string): { name: string; price: number; desc: string; icon: string } {
  return isWeapon(id) ? WEAPONS[id] : isGear(id) ? GEAR[id] : isKit(id) ? KITS[id] : ITEMS[id as ItemId];
}

// What kind of thing an id is, for the vendor's list: a word (9 letters at
// most, to clear the Sell tab's buttons) and its color.
export function kindOf(id: string): { label: string; color: string } {
  if (isWeapon(id)) return { label: 'WEAPON', color: '#fc7460' };
  if (isGear(id)) return { label: GEAR[id].desc.startsWith('AUGMENT') ? 'AUGMENT' : 'GEAR', color: '#9878f8' };
  if (isKit(id)) return { label: 'UPGRADE', color: '#f8b800' };
  return { label: ITEMS[id as ItemId]?.rare ? 'RARE ITEM' : 'ITEM', color: '#58d854' };
}

// How strong an id is, 1 to 9. Common consumables count as 1.
export function scoreOf(id: string) {
  if (isWeapon(id)) return WEAPONS[id].score;
  if (isGear(id)) return GEAR[id].score;
  if (isKit(id)) return KITS[id].score;
  return ITEMS[id as ItemId]?.score ?? 1;
}
