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
  stats: (this: WeaponDef, level: number) => { interval: number; shots: Shot[]; damage: number; splash?: number; speed?: number };
  // Numbers the Tuner (?tune) can change while playing. Where a weapon has
  // these, its stats read them, so changing one changes the weapon.
  tune?: Record<string, number>;
}

export const MAX_WEAPON_LEVEL = 5;
const levelDamage = (base: number, level: number) => base * (1 + 0.25 * (level - 1));
const fan = (...degs: number[]): Shot[] => degs.map((deg) => ({ dx: 0, deg }));

export interface ItemDef {
  name: string;
  price: number;
  desc: string;
  icon: string;
  cap: number; // max stack in one item slot
  rare?: boolean; // only in-level vendors stock it, and only sometimes
  score?: number; // rare items: how strong, like weapons and gear
}

export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pulse: {
    name: 'PULSE BLASTER', price: 40, score: 1, icon: 'icon_pulse', texture: 'bullet', dtype: 'kinetic', where: 'start', from: 1,
    desc: 'KINETIC. FAST STRAIGHT SHOTS. RELIABLE BUT NARROW.',
    stats: (lv) => ({
      interval: lv >= 3 ? 115 : 140,
      shots: lv >= 5 ? [{ dx: -3, deg: 0 }, { dx: 3, deg: 0 }] : fan(0),
      damage: levelDamage(1, lv),
    }),
  },
  spread: {
    name: 'SPREAD GUN', price: 60, score: 2, icon: 'icon_spread', texture: 'pellet', dtype: 'kinetic', where: 'base', from: 1,
    desc: 'KINETIC. 3 SHOTS IN A FAN. COVERS THE SCREEN. FIRES FASTER EACH LEVEL.',
    tune: { damage: 1, growth: 0.25, interval: 340, faster: 30, angle: 14, speed: 300 },
    stats(lv) {
      const t = this.tune!;
      return {
        interval: t.interval - (lv - 1) * t.faster,
        shots: lv >= 5 ? fan(-2 * t.angle, -t.angle, 0, t.angle, 2 * t.angle) : fan(-t.angle, 0, t.angle),
        damage: t.damage * (1 + t.growth * (lv - 1)),
        speed: t.speed,
      };
    },
  },
  twin: {
    name: 'TWIN LASER', price: 150, score: 3, icon: 'icon_twin', texture: 'laser', dtype: 'laser', where: 'level', from: 2,
    speed: 440, desc: 'LASER. TWO FAST PARALLEL BEAMS. GOOD VS LIGHT ARMOR, WEAK VS SHIELDS.',
    stats: (lv) => ({
      interval: lv >= 3 ? 140 : 170,
      shots: lv >= 5 ? [{ dx: -7, deg: -3 }, { dx: -3, deg: 0 }, { dx: 3, deg: 0 }, { dx: 7, deg: 3 }]
        : [{ dx: -3, deg: 0 }, { dx: 3, deg: 0 }],
      damage: levelDamage(0.8, lv),
    }),
  },
  homing: {
    name: 'HOMING MISSILES', price: 220, score: 4, icon: 'icon_homing', texture: 'missile', dtype: 'explosive', where: 'level', from: 3,
    speed: 150, fx: 'homing', splash: 12, desc: 'EXPLOSIVE. SLOW MISSILES THAT SEEK AND BLAST. LOW FIRE RATE.',
    // Damage climbs faster than other weapons (75% a level) and the blast grows.
    tune: { damage: 2.5, growth: 0.75, interval: 720, interval3: 620, splash: 12, splashGain: 3, speed: 150, turn: 4 },
    stats(lv) {
      const t = this.tune!;
      return {
        interval: lv >= 3 ? t.interval3 : t.interval,
        shots: lv >= 5 ? fan(-30, 0, 30) : lv >= 3 ? fan(-25, 25) : fan(0),
        damage: t.damage * (1 + t.growth * (lv - 1)),
        splash: t.splash + (lv - 1) * t.splashGain,
        speed: t.speed,
      };
    },
  },
  plasma: {
    name: 'PLASMA LOBBER', price: 280, score: 5, icon: 'icon_plasma', texture: 'blob', dtype: 'plasma', where: 'base', from: 4,
    speed: 110, fx: 'pierce', desc: 'PLASMA. BIG SLOW BLOBS THAT PIERCE. MELTS ARMOR AND THE HOLLOW.',
    stats: (lv) => ({
      interval: lv >= 3 ? 760 : 900,
      shots: lv >= 5 ? fan(-8, 8) : fan(0),
      damage: levelDamage(3, lv),
    }),
  },
  ion: {
    name: 'ION ARC', price: 320, score: 6, icon: 'icon_ion', texture: 'arc', dtype: 'ion', where: 'base', from: 5,
    speed: 330, fx: 'arc', desc: 'ION. SHORT RANGE LIGHTNING THAT JUMPS TO 3 TARGETS. STRIPS SHIELDS. STUNS FROM LV 3.',
    // Jumps, stun and bolt life are read by the game as the arcs fly (see chainArc).
    tune: {
      damage: 1.4, growth: 0.25, interval: 300, interval3: 240, jumps: 2, jumpRange: 46, jumpDamage: 0.7,
      stun: 300, stunGain: 150, life: 320,
    },
    stats(lv) {
      const t = this.tune!;
      return {
        interval: lv >= 3 ? t.interval3 : t.interval,
        shots: lv >= 5 ? fan(-10, 0, 10) : fan(0),
        damage: t.damage * (1 + t.growth * (lv - 1)),
      };
    },
  },
  wave: {
    name: 'WAVE BEAM', price: 250, score: 5, icon: 'icon_wave', texture: 'wavebolt', dtype: 'laser', where: 'level', from: 6,
    speed: 240, fx: 'wave', desc: 'LASER. A WEAVING BEAM THAT PASSES THROUGH COVER AND WALLS.',
    stats: (lv) => ({
      interval: lv >= 3 ? 210 : 260,
      shots: lv >= 5 ? [{ dx: -1, deg: 0 }, { dx: 1, deg: 0 }] : fan(0),
      damage: levelDamage(1.3, lv),
    }),
  },
  rail: {
    name: 'RAIL LANCE', price: 400, score: 8, icon: 'icon_rail', texture: 'rail', dtype: 'kinetic', where: 'base', from: 7,
    speed: 900, fx: 'rail', desc: 'KINETIC. CHARGES, THEN FIRES A LANCE THAT PIERCES EVERYTHING. HUGE HIT.',
    stats: (lv) => ({
      interval: lv >= 3 ? 1100 : 1300,
      shots: lv >= 5 ? [{ dx: -4, deg: 0 }, { dx: 4, deg: 0 }] : fan(0),
      damage: levelDamage(7, lv),
    }),
  },
  flak: {
    name: 'FLAK CANNON', price: 270, score: 7, icon: 'icon_flak', texture: 'flak', dtype: 'explosive', where: 'level', from: 8,
    speed: 220, fx: 'flak', desc: 'EXPLOSIVE. SHELLS BURST INTO SHRAPNEL MID SCREEN. GREAT VS SWARMS. AT LV 5 A DIRECT HIT BURSTS TOO.',
    stats: (lv) => ({
      interval: lv >= 3 ? 560 : 650,
      shots: lv >= 5 ? fan(-6, 6) : fan(0),
      damage: levelDamage(1, lv),
    }),
  },
  side: {
    name: 'SIDE WINDERS', price: 170, score: 3, icon: 'icon_side', texture: 'sidemissile', dtype: 'explosive', where: 'level', from: 4,
    speed: 260, fx: 'seek', desc: 'EXPLOSIVE. FAST LITTLE MISSILES OUT TO THE SIDES THAT SEEK ENEMIES THERE. TINY BLAST.',
    stats: (lv) => ({
      interval: lv >= 3 ? 260 : 300,
      shots: lv >= 5 ? fan(-90, -60, 60, 90) : fan(-90, 90),
      damage: levelDamage(1, lv),
      splash: 5 + lv,
    }),
  },
  bio: {
    name: 'BIO SEEKER', price: 380, score: 9, icon: 'icon_bio', texture: 'sporeshot', dtype: 'plasma', where: 'base', from: 11,
    speed: 160, fx: 'latch', desc: 'PLASMA. SEEKING SPORES THAT CLING ON AND BURN. MORE CLING AS IT LEVELS. GREAT VS THE HOLLOW.',
    // Grows faster than other weapons: 35% more damage a level, a second spore
    // at level 3 and a third at level 5. Spores cling and burn (see bioLatch).
    tune: { damage: 1.1, growth: 0.35, interval: 500, interval3: 440, interval4: 400, burn: 1.1, burnTime: 1500, burnGain: 500, cling: 1 },
    stats(lv) {
      const t = this.tune!;
      return {
        interval: lv >= 4 ? t.interval4 : lv >= 3 ? t.interval3 : t.interval,
        shots: lv >= 5 ? fan(-16, 0, 16) : lv >= 3 ? fan(-10, 10) : fan(0),
        damage: t.damage * (1 + t.growth * (lv - 1)),
      };
    },
  },
};

export const ITEMS: Record<ItemId, ItemDef> = {
  repair: { name: 'REPAIR KIT', price: 15, icon: 'icon_repair', cap: 3, desc: 'RESTORES 2 HEALTH.' },
  shield: { name: 'SHIELD CELL', price: 30, icon: 'icon_shield', cap: 2, desc: 'BLOCKS ALL DAMAGE FOR 5 SECONDS.' },
  overdrive: { name: 'OVERDRIVE CELL', price: 20, icon: 'icon_overdrive', cap: 3, desc: 'DOUBLE FIRE RATE FOR 8 SECONDS.' },
  cluster: { name: 'CLUSTER BOMB', price: 45, icon: 'icon_cluster', cap: 2, desc: 'DROPS 5 HEAVY BOMBLETS IN A CONE AHEAD. HALF DAMAGE TO BOSSES.' },
  emp: { name: 'EMP PULSE', price: 50, icon: 'icon_emp', cap: 2, desc: 'STUNS MACHINES AND STRIPS SHIELDS ON SCREEN FOR 3 SECONDS.' },
  decoy: { name: 'DECOY FLARE', price: 25, icon: 'icon_decoy', cap: 3, desc: 'AIMED SHOTS, SEEKERS AND LUNGES CHASE THE FLARE FOR 5 SECONDS.' },
  booster: { name: 'CREDIT BOOSTER', price: 60, icon: 'icon_booster', cap: 1, desc: '+50% CREDIT DROPS FOR THE REST OF THE SEGMENT.' },
  drone: { name: 'REPAIR DRONE', price: 55, icon: 'icon_drone', cap: 2, desc: 'HEALS 1 HEALTH EVERY 4 SECONDS FOR 20 SECONDS.' },
  fullrepair: { name: 'FULL REPAIR', price: 90, score: 4, icon: 'icon_fullrepair', cap: 1, rare: true, desc: 'RESTORES ALL HEALTH.' },
  nova: { name: 'NOVA BOMB', price: 120, score: 7, icon: 'icon_nova', cap: 1, rare: true, desc: 'BLASTS EVERYTHING ON SCREEN AND CLEARS ENEMY SHOTS.' },
  warp: { name: 'TIME WARP', price: 100, score: 5, icon: 'icon_warp', cap: 1, rare: true, desc: 'ENEMIES AND THEIR SHOTS MOVE AT HALF SPEED FOR 4 SECONDS.' },
  rewind: {
    name: 'REWIND BEACON', price: 400, score: 9, icon: 'icon_rewind', cap: 1, rare: true,
    desc: 'IF YOUR SHIP IS DESTROYED, RESTART AT THE LAST VENDOR WITH FULL HEALTH.',
  },
};

// A stack as it shows in a slot: how many against how many fit, like 1/3.
export const stackLabel = (it: { id: ItemId; count: number }) => `${it.count}/${ITEMS[it.id].cap}`;

// Upgrade Kits: sold only by in-level vendors. Each raises one weapon or one
// gear by a level. Apply right away or keep it in storage for later.
export interface KitDef { name: string; price: number; score: number; desc: string; icon: string; target: 'weapon' | 'gear' }
export const KITS: Record<KitId, KitDef> = {
  wkit: { name: 'WEAPON KIT', price: 220, score: 5, icon: 'icon_wkit', target: 'weapon', desc: 'RAISES ANY ONE WEAPON BY 1 LEVEL, UP TO 5.' },
  gkit: { name: 'GEAR KIT', price: 260, score: 6, icon: 'icon_gkit', target: 'gear', desc: 'RAISES ANY ONE GEAR BY 1 LEVEL, UP TO 5.' },
};

// Special gear sits in gear slots. Passive gear works on its own; movement and
// active gear has a button in flight and a cooldown; augments change how your
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
  active?: boolean; // has a button in flight
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
    desc: 'ABSORBS 1 HIT, THEN RECHARGES IN 8 SECONDS.', levelUp: 'FASTER RECHARGE. 2 HITS AT LV 3.',
  },
  satellite: {
    name: 'SATELLITE', price: 600, score: 7, icon: 'icon_satellite', from: 6, where: 'level',
    desc: 'A MINI DRONE CIRCLES YOU AND FIRES SMALL SHOTS.', levelUp: 'FASTER FIRE. 2 DRONES AT LV 5.',
  },
  dodge: {
    name: 'DODGE THRUSTERS', price: 350, score: 5, icon: 'icon_dodge', from: 9, where: 'base', active: true,
    desc: 'TAP: A QUICK DASH THE WAY YOU ARE MOVING, UNTOUCHABLE FOR A MOMENT.', levelUp: 'SHORTER COOLDOWN, LONGER SAFE TIME.',
  },
  blink: {
    name: 'BLINK DRIVE', price: 500, score: 7, icon: 'icon_blink', from: 9, where: 'level', active: true,
    desc: 'TAP: TELEPORT A SHORT WAY THE WAY YOU ARE MOVING. PASSES THROUGH WALLS.', levelUp: 'LONGER JUMP, SHORTER COOLDOWN.',
  },
  afterburner: {
    name: 'AFTERBURNER', price: 380, score: 5, icon: 'icon_afterburner', from: 9, where: 'base', active: true,
    desc: 'TAP: A SPEED BOOST. RAMMING LIGHT ENEMIES WHILE IT BURNS DESTROYS THEM.', levelUp: 'LONGER BURN, HARDER RAM. RAMS BIG SHIPS AT LV 5.',
  },
  roll: {
    name: 'BARREL ROLL', price: 420, score: 7, icon: 'icon_roll', from: 10, where: 'level', active: true,
    desc: 'TAP: A SPIN THAT SENDS ENEMY SHOTS BACK THE WAY THEY CAME.', levelUp: 'LONGER SPIN, SHORTER COOLDOWN.',
  },
  burst: {
    name: '360 BURST', price: 450, score: 7, icon: 'icon_burst', from: 10, where: 'level', active: true,
    desc: 'TAP: FIRES A RING OF SHOTS IN EVERY DIRECTION.', levelUp: 'MORE SHOTS, SHORTER COOLDOWN.',
  },
  antimissile: {
    name: 'ANTI-MISSILE', price: 500, score: 8, icon: 'icon_antimissile', from: 9, where: 'base',
    desc: 'A TURRET THAT SHOOTS DOWN ENEMY SHOTS AND SEEKERS NEAR YOU, LEVEL AND AHEAD FIRST.', levelUp: 'FASTER, WIDER. ARCS ON TO A 2ND AT LV 5.',
  },
  incendiary: {
    name: 'INCENDIARY AMMO', price: 400, score: 6, icon: 'icon_incendiary', from: 9, where: 'base',
    desc: 'AUGMENT. KINETIC SHOTS GLOW HOT AND SCORCH WHAT THEY HIT. FROM LV 3 THEY SET IT BURNING.', levelUp: 'HOTTER. BURNS AT LV 3, LONGER AT 4 AND 5.',
  },
  ioncoat: {
    name: 'ION COATING', price: 450, score: 7, icon: 'icon_ioncoat', from: 9, where: 'level',
    desc: 'AUGMENT. LASER WEAPONS DEAL ION DAMAGE, SO THEY BREAK SHIELDS.', levelUp: 'ADDS A BRIEF STUN, LONGER EACH LEVEL.',
  },
  shaped: {
    name: 'SHAPED CHARGES', price: 420, score: 6, icon: 'icon_shaped', from: 10, where: 'base',
    desc: 'AUGMENT. EXPLOSIVE WEAPONS IGNORE RESISTANCE.', levelUp: 'BIGGER SPLASH.',
  },
  overcharge: {
    name: 'OVERCHARGER', price: 550, score: 9, icon: 'icon_overcharge', from: 11, where: 'level',
    desc: 'AUGMENT. EVERY 5TH VOLLEY IS A CHARGED SHOT WITH TRIPLE DAMAGE.', levelUp: 'EVERY 4TH AT LV 3, EVERY 3RD AT LV 5.',
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

// What each gear does at a level, 1 to 5. Read by the game while flying.
// Cooldowns and durations are in ms.
export const gearStats = {
  plating: (lv: number) => ({ health: 1 + lv }),
  magnet: (lv: number) => ({ radius: 36 + lv * 8, pull: 70 + lv * 15 }),
  deflector: (lv: number) => ({ hits: lv >= 3 ? 2 : 1, recharge: 8000 - (lv - 1) * 1000 }),
  satellite: (lv: number) => ({ drones: lv >= 5 ? 2 : 1, interval: 650 - (lv - 1) * 70, damage: 0.5 + (lv - 1) * 0.15 }),
  dodge: (lv: number) => ({ cooldown: 3000 - (lv - 1) * 300, safe: 350 + lv * 60, dist: 42 }),
  blink: (lv: number) => ({ cooldown: 4200 - (lv - 1) * 400, dist: 44 + lv * 6 }),
  afterburner: (lv: number) => ({ cooldown: 5500 - (lv - 1) * 300, burn: 1800 + lv * 300, ram: 2 + lv }),
  roll: (lv: number) => ({ cooldown: 3600 - (lv - 1) * 250, spin: 520 + lv * 80 }),
  burst: (lv: number) => ({ cooldown: 5000 - (lv - 1) * 500, shots: 12 + (lv - 1) * 2, damage: 1 + (lv - 1) * 0.2 }),
  antimissile: (lv: number) => ({ interval: 900 - (lv - 1) * 120, radius: 40 + lv * 4, targets: lv >= 5 ? 2 : 1 }),
  // Levels 1 and 2 scorch (extra plasma damage on the hit); from 3 the hit also burns, longer each level.
  incendiary: (lv: number) => ({ scorch: 0.2 + lv * 0.1, burn: 0.3 + lv * 0.1, burnTime: lv >= 3 ? 1000 + (lv - 2) * 1000 : 0 }),
  ioncoat: (lv: number) => ({ stun: (lv - 1) * 150 }),
  shaped: (lv: number) => ({ splash: lv * 2 }),
  overcharge: (lv: number) => ({ every: lv >= 5 ? 3 : lv >= 3 ? 4 : 5 }),
  scanner: (lv: number) => ({ bonus: 0.15 + (lv - 1) * 0.05 }),
  rear: (lv: number) => ({ damage: 0.5 + (lv - 1) * 0.125 }), // share of the paired weapon's damage
};

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
