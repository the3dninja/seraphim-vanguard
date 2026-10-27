import Phaser from 'phaser';
import { COLOR, W, H } from '../config';
import {
  CRATES, DTYPE_COLOR, GEAR, ITEMS, RADAR, WEAPONS, atLv, gearStats, shotTexture, stackLabel, type DType, type GearId, type ItemId, type WeaponId,
} from '../data/items';
import { DTYPES, ENEMY_STATS, typeMultiplier, weakTo, type FoeKind, type Taken } from '../data/enemies';
import { LEVELS, REPLAY_PAY, type BossKind, type HazardSpec, type LevelDef, type Theme, type Wave } from '../data/levels';
import { extraCargo, gearLevel, hasGear, itemCap, totalMaxHealth, weaponLevel, weaponStats } from '../inventory';
import { Act3Hazards } from '../act3';
import { Dreadnought } from '../dreadnought';
import { Rockjaw } from '../rockjaw';
import { Watcher } from '../watcher';
import { Voss } from '../voss';
import { BroodQueen } from '../broodqueen';
import { HollowMind } from '../hollowmind';
import { Sporeheart } from '../sporeheart';
import { Wyrm } from '../wyrm';
import { Barriers, Tunnel } from '../heart';
import { SideHazards } from '../sidehaz';
import { Storm, stormPlan } from '../storm';
import { Treasure } from '../treasure';
import { Warps } from '../warp';
import { sideById, unlockedBy } from '../data/sides';
import { cloneSave, type SaveData } from '../save';
import { ITEM_COOLDOWN, saveTestLoadout, TEST_BUTTONS, TEST_ICONS, TEST_LEVEL, TestWaves, type TestPanel } from '../combatTest';
import { starfield, text, toast } from '../ui';
import { RAIDER_CORRUPT, SEEDED, corruptFormation, isCorrupt, setupCorrupt, updateCorrupt } from '../corrupt';

type Phase = 'action' | 'arrival' | 'vendor' | 'ready' | 'dead' | 'clear';

export interface EnemyData {
  kind: FoeKind;
  hp: number;
  t: number;
  baseX: number;
  fireIn: number;
  dir: number; // -1 or 1: which way it crosses the screen
  wait: number; // ms before it starts moving (swarm members queue up)
  stopY: number; // where a Gunboat, Lancer or Bulwark parks
  hold: number; // ms a parked Gunboat stays; ms a Driller spends lining up
  step: number; // Driller: 0 sliding in, 1 lining up, 2 ramming. Lancer: beams fired
  aim: number; // Lancer: the angle its beam is locked to. Seeker, Tendril: heading
  charge: number; // Lancer: ms of warning line left before the beam
  beam: number; // Lancer: ms the beam stays on
  shield: number; // Bulwark: shield health left
  shieldImg: Phaser.GameObjects.Image | null;
  cloaked: boolean; // Phantom: can't be hit or rammed while cloaked
  taken: Taken; // damage taken by type, in %
  burn: number; // ms of burning left
  burnDmg: number; // damage per burn tick
  burnTick: number; // ms to the next burn tick
  stun: number; // ms stunned: no moving or firing
  corrupt?: boolean; // a Corrupted ship, or a mine one laid
  leaving?: boolean; // pulling back up off the top of the screen
  back?: boolean; // already came back once after pulling back
  shown?: boolean; // has been on screen
}

// An enemy that pulled back off the top before it was killed, waiting to
// come back down: ms left, and the health it left with.
interface Returner { kind: FoeKind; hp: number; t: number }
const RETURN_AFTER: [number, number] = [8000, 12000];
// The share of the credits picked up in a run that the ship keeps if it's destroyed.
const DEATH_KEEP = 0.25;
// Gunboats and Bombers leaving down the screen stop firing at the bottom third.
const LEAVE_FIRE_STOP = (H * 2) / 3;

// Anything a boss class offers the scene.
interface Boss {
  update(dt: number): void;
  healthFraction(): number;
  armorFraction?(): number; // bosses with armor show it in a second bar
  aimPoint?(): { x: number; y: number } | null; // where homing missiles steer
  center?(): { x: number; y: number } | null; // where Bio Seeker spores cling, if not aimPoint
}

// Level hazards that live a while and are drawn every frame.
interface Strike { x: number; t: number } // lightning: ms since the column started flashing
interface Flare { rock: Phaser.Physics.Arcade.Image; t: number; sweepY: number } // ms since the rock appeared
interface Fence { y: number; t: number; posts: Phaser.GameObjects.Image[] } // t: ms into its on/off cycle
interface Zap { x1: number; y1: number; x2: number; y2: number; t: number; color: number } // a lightning line, ms left
// Wingmen. Vex fires laser bursts, the Vossari ion bolt chains between
// enemies, and the point ship lobs homing plasma that splashes.
type AllyKind = 'vex' | 'ion' | 'plasma';
interface Ally { img: Phaser.GameObjects.Image; ox: number; oy: number; fireIn: number; kind: AllyKind; burst: number }
interface Glitter { x: number; y: number; vx: number; vy: number; t: number; life: number; size: number; color: number } // a credit sparkle, ms since it began
// Credit sparkles by bar: their colors, how many, how big, and how far they fly.
const GLITTER: Record<string, { colors: number[]; n: number; size: number; speed: number }> = {
  ingot1: { colors: [0xfca044, 0xc84c0c], n: 4, size: 2, speed: 22 },
  ingot2: { colors: [0xe4e4e4, 0xbcbcbc], n: 5, size: 2, speed: 26 },
  ingot3: { colors: [0xfce0a8, 0xf8b800], n: 6, size: 2, speed: 30 },
  ingot4: { colors: [0xfce0a8, 0xf8b800], n: 10, size: 3, speed: 42 },
};
interface Pop { x: number; y: number; t: number; lv: number; color: number } // a hit's flash ring, ms since the hit
// Incendiary Ammo's smouldering flame where a shot hit, riding on `on` if set (ox, oy from it, else where it is).
interface Flame { on: Phaser.GameObjects.Sprite | null; ox: number; oy: number; t: number; life: number; lv: number }
// A Bio Seeker spore clinging to an enemy (or the boss, when `on` is null). left, tick: ms.
interface Latch { on: Phaser.Physics.Arcade.Sprite | null; ox: number; oy: number; img: Phaser.GameObjects.Image; left: number; tick: number; dps: number; lv: number }

const SHIP_SPEED_KEYS = 110; // px/s with keyboard
const REDIRECT_FULL = 20; // shots soaked up for Energy Redirect's glow at its biggest and brightest
const TAP_MOVE = 6; // px a press can move and still be a tap
const TAP_MS = 300; // ... and how long it can last
const SHOW_REDIRECT_COUNT = true;
const REDIRECT_WARN = 750; // ms at the end of Energy Redirect's gathering that its count flashes // Energy Redirect's soaked-up count over the ship
const RADAR_TEAL = '#00e8d8'; // Shot Radar's near-miss count and lines
const ICE_GRIP = 2.2; // how fast the ship's speed catches up with the controls on ice (per second)
const BULWARK_SHIELD = 12;
const COIN_FALL = 26; // px/s credits fall
const LANCER_WARN = 850; // ms the warning line shows before a Lancer fires
const BOSS_NAMES = {
  rockjaw: 'ROCKJAW', dreadnought: 'DREADNOUGHT', watcher: 'THE WATCHER',
  voss: 'EMPEROR VOSS', queen: 'BROOD QUEEN', mind: 'THE HOLLOW MIND',
  sporeheart: 'THE SPOREHEART', wyrm: 'THE BROOD WYRM',
  frostjaw: 'FROSTJAW', hollowwatcher: 'HOLLOW WATCHER', broodmother: 'BROOD MATRIARCH',
};
const EGG_HATCH = 5500; // ms before an egg hatches into larvae
// Ion Arc's numbers live in its Tuner values (WEAPONS.ion.tune).
const ion = () => WEAPONS.ion.tune!;
// s an Ion Arc bolt lasts, which sets its range.
const arcLife = (lv: number) => atLv(ion().life, lv) / 1000;
// Ion Arc's stun: ms at each level, and its chance (%) with each hit and each chain jump.
const ionStun = (lv: number) => atLv(ion().stun, lv);
const ionStunChance = (lv: number) => WEAPONS.ion.levels!.stunChance[lv - 1];
// Whether a stun with this chance (%, none = always) lands.
const rollStun = (chance: number | undefined) => chance === undefined || Math.random() * 100 < chance;
const BOMB_FUSE = 0.6; // s before a cluster bomblet goes off
// A one-line radio call as each act 3 level starts.
const RADIO: Record<number, string> = {
  9: 'REYES: THE COLONY WENT\nDARK. FIND OUT WHY.',
  10: 'REYES: THE EMPEROR IS\nINSIDE. BRING HIM BACK.',
  11: 'VEX: RAIDERS FLY WITH\nYOU NOW, PILOT.',
  12: 'VOSS: THE REEF FEEDS\nTHE HIVE. CUT THROUGH.',
  13: 'VEX: TOO DARK TO SEE.\nSTAY NEAR THE LIGHT.',
  14: 'VOSS: THE FLEET WILL\nHOLD THE GATE. GO!',
  15: 'VEX: WE\'LL HOLD THE\nGATE. GO END THIS.',
};
const STRIKE_WARN = 900; // ms a lightning column flashes before the bolt
const STRIKE_HIT = 260; // ms the bolt stays
const FLARE_WARN = 3000; // ms from the shelter rock appearing to the flare sweeping down
const FENCE_CYCLE = [1500, 450, 1100]; // ms off, warning flicker, on
const ITEM_KEYS = ['ONE', 'TWO', 'THREE'];
const TREASURE_WAIT = 3500; // ms of calm before the cargo hauler drifts in
const LINGER = 3000; // ms after a level is cleared to pick up credits by hand
const HOME_AFTER_BOSS = 5000; // ms after a boss falls that its credits curve toward the ship

// Playtest helper: add ?god to the URL and the ship can't be destroyed.
// A Trapper's net: how long it holds the ship, and how much of its speed is left.
const NET_TIME = 2200;
const TRAP_STEP = 150; // ms per Trapper pincer frame
// Lit fuses: a Trapper mine flashes this long (ms) before its net, and a Bomb
// flashes over the last this many pixels before the height where it blows.
const MINE_FLASH = 750;
const BOMB_FLASH = 54;
const BURN_WARN = 750; // ms at the end of an Afterburner burn that its enemy highlights blink
const BURN_BLINK = 94; // ms each blink is off or on
const DUDS = new Set<string>(['bomb', 'mine', 'pmine']); // an Afterburner ram smashes them without setting them off
const NET_SLOW = 0.4;
const godMode = () => new URLSearchParams(location.search).has('god');

export class GameScene extends Phaser.Scene {
  private startState!: SaveData; // what to go back to if the ship is destroyed
  state!: SaveData;
  private level!: LevelDef;
  private health = 0;
  // Where a Rewind Beacon restarts from: the level start, then each vendor stop.
  private checkpoint!: { save: SaveData; segment: number; earned: number }; // earned: credits picked up before it
  private earned = 0; // credits picked up this run
  private rewound = false;

  player!: Phaser.Physics.Arcade.Sprite;
  private bubble!: Phaser.GameObjects.Image;
  playerBullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  enemyBullets!: Phaser.Physics.Arcade.Group;
  private coins!: Phaser.Physics.Arcade.Group;
  private hazards!: Phaser.Physics.Arcade.Group;
  private patches: Phaser.GameObjects.Image[] = []; // ice sheets: harmless, but slippery
  private slide = { x: 0, y: 0 }; // ship velocity, which lags behind the controls on ice
  beams!: Phaser.GameObjects.Graphics; // Lancer and boss lasers, redrawn every frame
  sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private impact!: Phaser.GameObjects.Particles.ParticleEmitter; // shot hits, colored per hit
  private goo!: Phaser.GameObjects.Particles.ParticleEmitter; // Plasma Lobber splashes
  private blobHitAt = -1; // when a boss last took a Plasma Lobber hit, so its flash shows it
  // Each player shot's damage, type and look, kept outside the shot itself:
  // bosses read it after destroying the shot, when its data is already gone.
  // fx and incend (Incendiary Ammo's level) mirror the shot's own data.
  private shotInfo = new WeakMap<object, { dmg: number; dtype: DType; blob: boolean; lv: number; fx?: string; incend?: number }>();
  private scroll!: ReturnType<typeof starfield>;
  private scenery: Phaser.GameObjects.TileSprite | null = null;
  private planet: Phaser.GameObjects.Image | null = null;
  private theme: Theme = 'outpost';
  private dark: Phaser.GameObjects.Image | null = null; // level 13: a black screen with a hole of light at the ship
  // Level 15: the living tunnel, the walls of growth, and the spore haze.
  private tunnel: Tunnel | null = null;
  private barriers!: Barriers;
  private fog: Phaser.GameObjects.TileSprite | null = null;
  private motes: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private segBossDone = false; // this segment's mini boss is beaten
  private side: string | null = null; // the side mission being flown, if any
  private replay = false; // flying a cleared level or side mission again
  private replayLevel: number | null = null; // the cleared main level being flown again
  private test: TestWaves | null = null; // combat test mode (see combatTest.ts)
  private sideHaz!: SideHazards;

  phase: Phase = 'action';
  private segment = 0;
  private returners: Returner[] = [];
  private waveIndex = 0;
  private waveTimer = 0;
  private hazardIn: number[] = [];
  private boss: Boss | null = null;
  private storm: Storm | null = null; // Storm Eye's scripted storm
  private treasure: Treasure | null = null; // the cargo hauler at a treasure ending
  private treasureDone = false;
  private strikes: Strike[] = [];
  private flares: Flare[] = [];
  private fences: Fence[] = [];
  private flareGlow!: Phaser.GameObjects.Rectangle;
  private act3!: Act3Hazards;
  private zaps: Zap[] = [];
  private allies: Ally[] = [];
  private riftOpen = 0; // 0 to 1: how far the rift has torn open (level 11 cutscene)
  private tearOpen = 0; // 0 to 1: how far the way out of the rift has opened (level 11)
  private tearGfx: Phaser.GameObjects.Graphics | null = null;
  private nebula: Phaser.GameObjects.Image | null = null; // Hollow space's nebula, behind the planet
  private radioUntil = 0; // when the radio call on screen is gone
  private corruptSeen = false; // the allies have remarked on the Corrupted
  private warps!: Warps; // Maw Gate: enemies warping in
  private warpsDone = new Set<number>(); // which one-off warp-ins have happened
  private warpIn: number | null = null; // ms to the next repeating warp-in
  private homeUntil = 0; // credits dropped before this curve toward the ship (a boss's gold)
  private pops: Pop[] = [];
  private glitter: Glitter[] = [];
  private flames: Flame[] = [];
  private latches: Latch[] = [];
  private embers!: Phaser.GameObjects.Particles.ParticleEmitter; // Incendiary Ammo hits
  private ramGlow = new Map<Phaser.GameObjects.Sprite, Phaser.GameObjects.Image>(); // Afterburner target highlights
  bossPull = { x: 0, y: 0 }; // px/s a boss drags the ship (the Hollow Mind's black holes)
  private vortices: { x: number; y: number; t: number; life: number; pull: number; reach: number; damp: number; spread: number; hole?: boolean }[] = []; // Blink Drive's, and Shot Radar's black hole (hole: leaves the ship be, eats shots)
  private vortexPull = { x: 0, y: 0 }; // px/s they drag the ship

  // Gear
  private maxHp = 5;
  private deflect = 0; // Deflector charges ready
  private deflectAt = 0; // when the next charge comes back
  private deflectRing!: Phaser.GameObjects.Image;
  private sats: Phaser.GameObjects.Image[] = [];
  private satTimer = 0;
  // Supply crates: each gear slot's ms left until its next crate (null: not
  // started yet, for the second slot), and how long that wait was, for the HUD.
  private crateWait: (number | null)[] = [];
  private crateGap: number[] = [];
  private crates!: Phaser.Physics.Arcade.Group;
  private dashing = false; // a Dodge Thrusters dash is moving the ship
  private burnUntil = 0; // Afterburner
  private rollUntil = 0; // Barrel Roll
  // Energy Redirect: when it stops soaking up shots, what it has soaked up,
  // and the lasers already counted (by where they come from).
  private redirectUntil = 0;
  private redirectCount = 0;
  private redirectHeld = false; // gathering is over and the beam waits for a tap
  private redirectGlow!: Phaser.GameObjects.Graphics; // under the ship, growing with what it has soaked up
  private tapFrom: { id: number; x: number; y: number; t: number } | null = null; // a press that may be a tap
  private redirectLasers = new Set<string>();
  private redirectText: Phaser.GameObjects.Text | null = null;
  private nearMisses = 0; // Shot Radar: near misses since the last hit
  private nearText: Phaser.GameObjects.Text | null = null;
  private radarGfx!: Phaser.GameObjects.Graphics; // its lines, under the shots
  private radarOverdriveUntil = 0;
  private antiTimer = 0; // Anti-Missile
  private volleys: number[] = []; // per weapon slot, for the Overcharger
  private lastMove = { x: 0, y: -1 }; // direction the ship last moved, for dashes and blinks
  private bossBar: Phaser.GameObjects.Graphics | null = null;
  private bossName: Phaser.GameObjects.Text | null = null;

  private fireTimers: number[] = [];
  private invulnUntil = 0;
  private shieldUntil = 0;
  private snaredUntil = 0; // a Trapper's net mine slows the ship until then
  private netImg!: Phaser.GameObjects.Image;
  private overdriveUntil = 0;
  private warpUntil = 0; // Time Warp
  private flare: Phaser.GameObjects.Image | null = null; // Decoy Flare
  private flareUntil = 0;
  private lingering = false; // level cleared: a few seconds to pick up credits
  private healUntil = 0; // Repair Drone
  private healAt = 0;
  private healDrone: Phaser.GameObjects.Image | null = null;

  // `id` is the pointer doing the dragging, so a second finger tapping a button doesn't end it.
  private dragFrom: { id: number; px: number; py: number; sx: number; sy: number; tx: number; ty: number } | null = null;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;

  private hearts: Phaser.GameObjects.Image[] = [];
  private creditsText!: Phaser.GameObjects.Text;
  private itemButtons: { box: Phaser.GameObjects.Rectangle; icon: Phaser.GameObjects.Image; count: Phaser.GameObjects.Text; cool: Phaser.GameObjects.Rectangle }[] = [];
  private itemReadyAt: number[] = []; // per item slot, in combat test (items don't run out there)
  private weaponIcons: Phaser.GameObjects.Image[] = [];
  private gearButtons: { box: Phaser.GameObjects.Rectangle; icon: Phaser.GameObjects.Image; cool: Phaser.GameObjects.Rectangle }[] = [];
  private tipsShown = new Set<string>();
  private tipFreeAt = 0; // when the tip on screen is done blinking

  constructor() { super('Game'); }

  // `resume` comes from a Rewind Beacon: restart at a checkpoint instead of the level start.
  // `side` names a side mission to fly instead of the next level.
  // `test` flies combat test mode: no level script, waves come from its menu.
  // `replay` names a cleared level to fly again, for less pay (see REPLAY_PAY).
  // A cleared side mission is a replay too.
  init(data: { state: SaveData; resume?: { save: SaveData; segment: number; earned?: number }; side?: string; test?: boolean; replay?: number }) {
    this.startState = cloneSave(data.state);
    this.state = cloneSave(data.resume ? data.resume.save : data.state);
    this.side = data.side ?? null;
    // While replaying, the run flies as that level; the ship's real place comes back at the end.
    this.replayLevel = data.replay ?? null;
    if (this.replayLevel) this.state.level = this.replayLevel;
    this.replay = !!this.replayLevel || (!!this.side && this.startState.sides.includes(this.side));
    this.test = data.test ? new TestWaves() : null;
    this.level = this.test ? TEST_LEVEL : (this.side && sideById(this.side)) || LEVELS[this.state.level - 1];
    this.checkpoint = data.resume
      ? { save: cloneSave(data.resume.save), segment: data.resume.segment, earned: data.resume.earned ?? 0 }
      : { save: cloneSave(data.state), segment: 0, earned: 0 };
    this.earned = this.checkpoint.earned;
    this.rewound = !!data.resume;
    this.maxHp = totalMaxHealth(this.state);
    this.health = this.maxHp;
    this.phase = 'action';
    this.strikes = [];
    this.flares = [];
    this.fences = [];
    this.returners = [];
    this.glitter = [];
    this.zaps = [];
    this.allies = [];
    this.riftOpen = 0;
    this.tearOpen = 0;
    this.tearGfx = null;
    this.nebula = null;
    this.radioUntil = 0;
    this.corruptSeen = false;
    this.warpsDone = new Set();
    this.warpIn = null;
    this.homeUntil = 0;
    this.pops = [];
    this.flames = [];
    this.latches = [];
    this.ramGlow = new Map();
    this.bossPull = { x: 0, y: 0 };
    this.vortices = [];
    this.vortexPull = { x: 0, y: 0 };
    this.sats = [];
    this.satTimer = 0;
    this.deflect = 0;
    this.deflectAt = 0;
    this.crateWait = [];
    this.crateGap = [];
    this.dashing = false;
    this.burnUntil = 0;
    this.rollUntil = 0;
    this.redirectUntil = 0;
    this.redirectHeld = false;
    this.tapFrom = null;
    this.redirectText = null;
    this.nearMisses = 0;
    this.nearText = null;
    this.radarOverdriveUntil = 0;
    this.antiTimer = 0;
    this.volleys = [];
    this.lastMove = { x: 0, y: -1 };
    this.segment = this.checkpoint.segment;
    this.waveIndex = 0;
    this.waveTimer = 0;
    this.hazardIn = [];
    this.patches = [];
    this.slide = { x: 0, y: 0 };
    this.boss = null;
    this.bossBar = null;
    this.bossName = null;
    this.fireTimers = [];
    this.invulnUntil = 0;
    this.snaredUntil = 0;
    this.shieldUntil = 0;
    this.overdriveUntil = 0;
    this.warpUntil = 0;
    this.flare = null;
    this.flareUntil = 0;
    this.lingering = false;
    this.healUntil = 0;
    this.healAt = 0;
    this.healDrone = null;
    this.dragFrom = null;
    this.hearts = [];
    this.itemButtons = [];
    this.itemReadyAt = [];
    this.weaponIcons = [];
    this.gearButtons = [];
    this.tipsShown = new Set();
    this.tipFreeAt = 0;
    this.scenery = null;
    this.planet = null;
    this.dark = null;
    this.tunnel = null;
    this.fog = null;
    this.motes = null;
    this.segBossDone = false;
    this.storm = null;
    this.treasure = null;
    this.treasureDone = false;
  }

  create() {
    this.cameras.main.fadeIn(300);
    this.scroll = starfield(this);
    this.setTheme(this.segmentTheme(this.segment));
    if (this.level.storm) this.storm = new Storm(this, this.scenery ? 3 : 2);
    this.resetHazardTimers(4000);

    this.playerBullets = this.physics.add.group();
    this.hazards = this.physics.add.group();
    this.enemies = this.physics.add.group();
    this.enemyBullets = this.physics.add.group();
    this.coins = this.physics.add.group();
    this.crates = this.physics.add.group();
    this.beams = this.add.graphics().setDepth(12);
    this.radarGfx = this.add.graphics().setDepth(9.5);
    this.act3 = new Act3Hazards(this);
    this.barriers = new Barriers(this);
    this.sideHaz = new SideHazards(this);
    this.warps = new Warps(this);
    this.startTunnel(); // a Rewind Beacon can restart in the tunnel

    this.redirectGlow = this.add.graphics().setDepth(10.5).setBlendMode(Phaser.BlendModes.ADD); // over the ship; additive, so it still shows through
    this.player = this.physics.add.sprite(W / 2, H - 50, 'ship').setDepth(10);
    this.player.body!.setSize(5, 7).setOffset(4, 3); // small hitbox, NES-shooter fair
    this.bubble = this.add.image(0, 0, 'bubble').setDepth(11).setVisible(false);
    this.deflectRing = this.add.image(0, 0, 'deflect').setDepth(11).setVisible(false);
    this.netImg = this.add.image(0, 0, 'net').setDepth(11).setVisible(false);
    this.flareGlow = this.add.rectangle(0, 0, W, H, 0xf8b800, 0).setOrigin(0).setDepth(5); // under the ship and the shadow lane
    if (this.level.dark) this.dark = this.add.image(W / 2, H / 2, 'darkness').setDepth(9.6);
    this.setupGear();
    this.setupAllies();

    this.sparks = this.add.particles(0, 0, 'px', {
      speed: { min: 20, max: 90 }, lifespan: { min: 200, max: 500 }, scale: { start: 1, end: 0 },
      tint: [0xfcfcfc, 0xf8b800, 0xd82800], emitting: false,
    }).setDepth(20);
    this.impact = this.add.particles(0, 0, 'px', {
      speed: { min: 30, max: 80 }, lifespan: { min: 120, max: 300 }, scale: { start: 1, end: 0 }, emitting: false,
    }).setDepth(20);
    this.embers = this.add.particles(0, 0, 'px', {
      speed: { min: 20, max: 60 }, lifespan: { min: 200, max: 450 }, scale: { start: 1, end: 0 }, gravityY: -40,
      tint: [0xfce0a8, 0xf8b800, 0xe45c10, 0xe45c10], emitting: false,
    }).setDepth(20);
    this.goo = this.add.particles(0, 0, 'px', {
      speed: { min: 30, max: 110 }, lifespan: { min: 250, max: 520 }, scale: { start: 1, end: 0.3 }, gravityY: 60,
      tint: [0xfcfcfc, 0x58d854, 0x58d854, 0x00a800], emitting: false,
    }).setDepth(20);

    const img = (o: unknown) => o as Phaser.Physics.Arcade.Image;
    const spr = (o: unknown) => o as Phaser.Physics.Arcade.Sprite;
    this.physics.add.overlap(this.playerBullets, this.enemies, (b, e) => this.hitEnemy(img(b), spr(e)));
    this.physics.add.overlap(this.playerBullets, this.hazards, (b, h) => this.hitHazard(img(b), img(h)));
    // Wrecks and rocks stop enemy shots; falling ice shards don't.
    this.physics.add.overlap(this.enemyBullets, this.hazards, (b, h) => { if (img(h).getData('kind') !== 'shard') b.destroy(); });
    this.physics.add.overlap(this.player, this.enemyBullets, (_p, b) => this.shotHitShip(img(b)));
    this.physics.add.overlap(this.player, this.enemies, (_p, e) => this.rammed(spr(e)));
    this.physics.add.overlap(this.player, this.hazards, () => this.hurt());
    this.physics.add.overlap(this.player, this.coins, (_p, c) => this.collect(img(c)));
    this.physics.add.overlap(this.player, this.crates, (_p, c) => this.pickCrate(img(c)));

    this.setupInput();
    this.createHud();
    this.events.off('resume');
    if (this.test) { this.setupTest(); return; }

    const intro = [
      text(this, W / 2, H / 2 - 40, this.side ? 'SIDE MISSION' : `LEVEL ${this.state.level}`, this.side ? COLOR.cyan : COLOR.gray),
      text(this, W / 2, H / 2 - 26, this.level.name, COLOR.white),
    ].map((t) => t.setOrigin(0.5).setDepth(1000));
    if (this.rewound) intro.push(text(this, W / 2, H / 2 - 6, 'REWIND BEACON USED', COLOR.cyan).setOrigin(0.5).setDepth(1000));
    if (this.replay) intro.push(text(this, W / 2, H / 2 + (this.rewound ? 6 : -6), 'REPLAY: HALF CREDITS', COLOR.yellow).setOrigin(0.5).setDepth(1000));
    this.tweens.add({ targets: intro, alpha: 0, delay: 2700, duration: 400 });
    if (this.state.level === 1) this.time.delayedCall(2400, () => this.blinkTip('DRAG TO MOVE'));
    const call = this.side ? undefined : RADIO[this.state.level];
    if (call && !this.rewound) this.time.delayedCall(2300, () => this.radio(call));

    this.events.on('resume', () => this.afterVendor());
  }

  // Scenery and a planet for the level's locale. Level 11 switches to the rift
  // partway through. With `fade` (ms) the old scenery fades out as the new one
  // fades in, so nothing goes black (level 15's legs).
  private setTheme(theme: Theme, fade = 0) {
    this.theme = theme;
    const old = [this.scenery, this.planet, this.fog, this.nebula].filter((o): o is NonNullable<typeof o> => !!o);
    if (fade) {
      this.tweens.add({ targets: old, alpha: 0, duration: fade, onComplete: () => old.forEach((o) => o.destroy()) });
      const motes = this.motes;
      motes?.stop();
      if (motes) this.time.delayedCall(9000, () => motes.destroy());
    } else {
      old.forEach((o) => o.destroy());
      this.motes?.destroy();
    }
    this.scenery = null;
    this.planet = null;
    this.fog = null;
    this.nebula = null;
    this.motes = null;
    if (theme === 'mist') {
      // A haze over the action (under shots and the ship), and spores drifting through it.
      this.fog = this.add.tileSprite(0, 0, W, H, 'fog').setOrigin(0).setDepth(9.55).setAlpha(0.15);
      this.motes = this.add.particles(0, 0, 'px', {
        x: { min: 0, max: W }, y: -4, lifespan: 9000, speedY: { min: 14, max: 30 }, speedX: { min: -6, max: 6 },
        alpha: { start: 0.8, end: 0.2 }, tint: [0xb8f818, 0x58d854, 0xfce0a8, 0x9878f8], frequency: 90,
      }).setDepth(9.5);
    }
    if (theme !== 'outpost' && theme !== 'deep') this.scenery = this.add.tileSprite(0, 0, W, H, `scenery_${theme}`).setOrigin(0);
    if (theme === 'outpost') this.planet = this.add.image(132, 60, 'planet');
    if (theme === 'blockade') this.planet = this.add.image(40, 70, 'moon');
    if (theme === 'forge') this.planet = this.add.image(150, -6, 'sun').setAlpha(0.85);
    if (theme === 'blight') this.planet = this.add.image(140, 40, 'blightworld').setAlpha(0.8);
    // Hollow space, out of the rift: a weird purple star before a nebula.
    if (theme === 'beyond') {
      this.nebula = this.add.image(112, 70, 'hollownebula').setAlpha(0.9);
      this.planet = this.add.image(40, 96, 'purplestar');
    }
    // Just above the two star layers, under everything that flies.
    let depth = 2;
    for (const o of [this.scenery, this.nebula, this.planet]) if (o) this.children.moveTo(o, depth++);
    if (fade) {
      for (const o of [this.scenery, this.planet, this.fog, this.nebula]) {
        if (!o) continue;
        const a = o.alpha;
        o.setAlpha(0);
        this.tweens.add({ targets: o, alpha: a, duration: fade });
      }
    }
  }

  // How many times as fast as usual the background (and the rift's gravity
  // wells, twice as fast) go by.
  get rush() {
    return this.theme === 'rift' ? 3 : 1;
  }

  // The scenery for a segment: level 15 and the rift change it as they go.
  private segmentTheme(seg: number): Theme {
    return this.level.segmentThemes?.[seg] ?? this.level.theme;
  }

  // Level 15's living tunnel, when this segment flies through it.
  private startTunnel() {
    const t = this.level.tunnel;
    this.tunnel?.destroy();
    this.tunnel = null;
    if (!t || t.segment !== this.segment) return;
    this.tunnel = new Tunnel(this, t.len, t.chambers);
    this.tunnel.sink(this.scenery ? 3 : 2);
  }

  // A line from an ally or Base, at the top of the screen.
  radio(msg: string) {
    this.radioUntil = this.time.now + 4500;
    const t = text(this, W / 2, 34, msg, COLOR.cyan).setOrigin(0.5, 0).setAlign('center').setDepth(1000);
    this.tweens.add({ targets: t, alpha: 0, delay: 4100, duration: 400, onComplete: () => t.destroy() });
  }

  // --- Input -------------------------------------------------------------

  private setupInput() {
    // Relative drag: the finger moves a target by however far it moves, so the
    // finger can be anywhere on screen and never covers the ship. The ship then
    // flies toward that target at keyboard speed (see wantedStep).
    this.input.on('pointerdown', (p: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[]) => {
      if (over.length > 0) return; // tapped a button
      const { x, y } = this.player;
      this.dragFrom = { id: p.id, px: p.x, py: p.y, sx: x, sy: y, tx: x, ty: y };
      this.tapFrom = { id: p.id, x: p.x, y: p.y, t: this.time.now };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragFrom || p.id !== this.dragFrom.id || !p.isDown || (this.phase !== 'action' && !this.lingering)) return;
      this.dragFrom.tx = Phaser.Math.Clamp(this.dragFrom.sx + (p.x - this.dragFrom.px), 6, W - 6);
      this.dragFrom.ty = Phaser.Math.Clamp(this.dragFrom.sy + (p.y - this.dragFrom.py), 24, H - 30);
    });
    const release = (p: Phaser.Input.Pointer) => { if (p.id === this.dragFrom?.id) this.dragFrom = null; };
    // A tap (a quick press that barely moves, not on a button) fires a held Energy Redirect beam.
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      const t = this.tapFrom;
      this.tapFrom = null;
      if (!t || t.id !== p.id) return;
      if (Phaser.Math.Distance.Between(t.x, t.y, p.x, p.y) > TAP_MOVE || this.time.now - t.t > TAP_MS) return;
      if (this.redirectHeld && this.phase === 'action') this.fireRedirect();
    });
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({
      up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', w: 'W', a: 'A', s: 'S', d: 'D',
    }) as GameScene['keys'];
    // Space uses the first loaded item slot; 1, 2 and 3 pick a slot.
    kb.on('keydown-SPACE', () => this.useItem(this.state.items.findIndex((it) => !!it)));
    ITEM_KEYS.forEach((k, i) => kb.on(`keydown-${k}`, () => this.useItem(i)));
  }

  // Moves the drag along with a ship that jumped (Dodge Thrusters, Blink Drive),
  // so a finger still down keeps steering from where the ship landed.
  private shiftDrag(dx: number, dy: number) {
    const d = this.dragFrom;
    if (!d) return;
    d.sx += dx; d.sy += dy;
    d.tx = Phaser.Math.Clamp(d.tx + dx, 6, W - 6);
    d.ty = Phaser.Math.Clamp(d.ty + dy, 24, H - 30);
  }

  // How far the controls ask the ship to move this frame: keyboard first, then
  // the drag target. Touch flies toward the target at keyboard speed, landing
  // exactly on it once it's within one frame's step so the ship doesn't jitter.
  private wantedStep(dt: number) {
    const k = this.keys;
    const kx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    const ky = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    // The Afterburner speeds the ship up while it burns.
    const speed = SHIP_SPEED_KEYS * (this.time.now < this.burnUntil ? 1.8 : 1);
    if (kx || ky) {
      this.dragFrom = null;
      const n = kx && ky ? Math.SQRT1_2 : 1;
      return { x: kx * n * speed * dt, y: ky * n * speed * dt };
    }
    if (!this.dragFrom) return { x: 0, y: 0 };
    const dx = this.dragFrom.tx - this.player.x;
    const dy = this.dragFrom.ty - this.player.y;
    const dist = Math.hypot(dx, dy);
    const step = speed * dt;
    if (dist <= step) return { x: dx, y: dy };
    return { x: (dx / dist) * step, y: (dy / dist) * step };
  }

  // On ice the ship's speed only slowly catches up with the controls, so it
  // drifts on after letting go and swings past where it was aimed.
  private move(dt: number) {
    if (dt <= 0 || this.dashing) return;
    const want = this.wantedStep(dt);
    if (this.time.now < this.snaredUntil) { want.x *= NET_SLOW; want.y *= NET_SLOW; }
    const k = this.speedK();
    want.x *= k;
    want.y *= k;
    const wl = Math.hypot(want.x, want.y);
    if (wl > 0.01) this.lastMove = { x: want.x / wl, y: want.y / wl };
    let mx = want.x, my = want.y;
    if (this.onIce()) {
      if (this.state.level === 4) this.tipOnce('ice', 'ICE MAKES YOU SLIDE');
      const grip = Math.min(1, ICE_GRIP * dt);
      this.slide.x += (want.x / dt - this.slide.x) * grip;
      this.slide.y += (want.y / dt - this.slide.y) * grip;
      mx = this.slide.x * dt;
      my = this.slide.y * dt;
    } else {
      this.slide = { x: want.x / dt, y: want.y / dt };
    }
    // Gravity wells drag the ship toward them.
    const pull = this.act3.pull(dt);
    const wind = this.sideHaz.pull(dt);
    mx += pull.x + wind.x + (this.bossPull.x + this.vortexPull.x) * dt;
    my += pull.y + (this.bossPull.y + this.vortexPull.y) * dt;
    const nx = Phaser.Math.Clamp(this.player.x + mx, 6, W - 6);
    const ny = Phaser.Math.Clamp(this.player.y + my, 24, H - 30);
    // Sliding into the edge of the screen stops the slide that way.
    if (nx !== this.player.x + mx) this.slide.x = 0;
    if (ny !== this.player.y + my) this.slide.y = 0;
    this.player.setPosition(nx, ny);
  }

  // Gear that changes the ship's speed: items carried beyond their caps slow it.
  // Shot Radar's near misses speed it up.
  private speedK() {
    const extra = extraCargo(this.state);
    const k = extra ? Math.max(0.2, 1 - extra * gearStats.cargo(gearLevel(this.state, 'cargo')).slow) : 1;
    return hasGear(this.state, 'radar') ? k * (1 + Math.min(RADAR.speedCap, this.nearMisses * RADAR.speedPer)) : k;
  }

  private onIce() {
    const { x, y } = this.player;
    return this.patches.some((p) => ((x - p.x) / (p.displayWidth / 2 - 1)) ** 2 + ((y - p.y) / (p.displayHeight / 2 - 1)) ** 2 <= 1);
  }

  // --- HUD ---------------------------------------------------------------

  private createHud() {
    // Ten hearts to a row; Hull Plating can add a second row.
    for (let i = 0; i < 16; i++) {
      this.hearts.push(this.add.image(6 + (i % 10) * 9, 8 + Math.floor(i / 10) * 8, 'heart').setOrigin(0, 0.5).setDepth(900));
    }
    this.add.image(W - 6, 8, 'coinIcon').setOrigin(1, 0.5).setDepth(900);
    this.creditsText = text(this, W - 16, 4, '', COLOR.yellow).setOrigin(1, 0).setDepth(900);

    // Bottom left: one box per gear slot (active gear fills with gray until
    // its next supply crate), with the weapon readout above. Bottom right: one item
    // button per slot (big enough for a thumb), each showing its stack like 1/3.
    const wy = this.state.gear.length ? H - 36 : H - 12;
    this.state.weapons.forEach((_w, i) => this.weaponIcons.push(this.add.image(10 + i * 12, wy, 'icon_pulse').setDepth(900)));
    this.state.gear.forEach((_g, i) => {
      const x = 4 + i * 24;
      const box = this.add.rectangle(x, H - 26, 22, 22, 0x000000).setOrigin(0).setDepth(900);
      const cool = this.add.rectangle(x + 1, H - 5, 20, 0, 0x3c3c3c).setOrigin(0, 1).setDepth(901);
      const icon = this.add.image(x + 11, H - 15, 'icon_plating').setDepth(902);
      this.gearButtons.push({ box, icon, cool });
    });
    const slots = this.state.items.length;
    // Combat test's items never run out, so their buttons drop the count and
    // narrow to leave room for the test buttons.
    const iw = this.test ? 22 : 39;
    this.state.items.forEach((_it, i) => {
      const x = W - iw - 3 - (slots - 1 - i) * (iw + 3); // slot 1 on the left, like the Ship screen
      const box = this.add.rectangle(x, H - 26, iw, 22, 0x000000).setOrigin(0).setDepth(900)
        .setStrokeStyle(1, 0xfcfcfc).setInteractive();
      box.on('pointerdown', () => this.useItem(i));
      const cool = this.add.rectangle(x + 1, H - 5, iw - 2, 0, 0x3c3c3c).setOrigin(0, 1).setDepth(900.5);
      const icon = this.add.image(x + (this.test ? 11 : 7), H - 15, 'icon_repair').setDepth(901);
      const count = text(this, x + 13, H - 19, '', COLOR.white).setDepth(901);
      this.itemButtons.push({ box, icon, count, cool });
    });
    this.refreshHud();
  }

  private refreshHud() {
    this.hearts.forEach((h, i) => {
      h.setVisible(i < this.maxHp);
      h.setTexture(i < this.health ? 'heart' : 'heartEmpty');
    });
    this.creditsText.setText(`${this.state.credits}`);
    this.state.weapons.forEach((w, i) => this.weaponIcons[i].setVisible(!!w).setTexture(w ? WEAPONS[w].icon : 'icon_pulse'));
    this.state.gear.forEach((g, i) => {
      const b = this.gearButtons[i];
      if (!b) return;
      b.icon.setVisible(!!g);
      if (g) b.icon.setTexture(GEAR[g].icon);
      b.box.setStrokeStyle(1, g && GEAR[g].active ? 0xfcfcfc : 0x3c3c3c);
    });
    this.state.items.forEach((item, i) => {
      const b = this.itemButtons[i];
      b.icon.setVisible(!!item);
      b.count.setText(item && !this.test ? stackLabel(item, itemCap(this.state, item.id)) : '');
      if (item) b.icon.setTexture(ITEMS[item.id].icon);
      b.box.setStrokeStyle(1, item ? 0xfcfcfc : 0x3c3c3c);
    });
  }

  // Active gear buttons (and combat test's item buttons) fill with gray while they cool down.
  private drawGearCooldowns() {
    const now = this.time.now;
    if (this.test) {
      this.state.items.forEach((it, i) => {
        const b = this.itemButtons[i];
        const left = it ? Math.max(0, (this.itemReadyAt[i] ?? 0) - now) : 0;
        b.cool.setSize(b.box.width - 2, it ? Math.round((left / ITEM_COOLDOWN[it.id]) * 20) : 0);
        b.icon.setAlpha(left > 0 ? 0.45 : 1);
      });
    }
    // Active gear: how much of the wait for its next supply crate is left.
    this.state.gear.forEach((g, i) => {
      const b = this.gearButtons[i];
      if (!b) return;
      if (!g || !GEAR[g].active) { b.cool.setSize(20, 0); return; }
      const wait = this.crateWait[i];
      const left = wait == null ? 1 : Math.max(0, wait) / (this.crateGap[i] || 1);
      b.cool.setSize(20, Math.round(left * 20)); // origin at the bottom, so it shrinks downward
    });
  }

  // Tips take turns, so two that come up together don't print over each other.
  private blinkTip(msg: string) {
    const wait = this.tipFreeAt - this.time.now;
    if (wait > 0) {
      this.tipFreeAt += 3750;
      this.time.delayedCall(wait, () => this.showTip(msg));
      return;
    }
    this.tipFreeAt = this.time.now + 3750;
    this.showTip(msg);
  }

  private showTip(msg: string) {
    const t = text(this, W / 2, H / 2 + 30, msg, COLOR.yellow).setOrigin(0.5).setDepth(1000);
    t.setAlign('center');
    this.tweens.add({ targets: t, alpha: 0.2, yoyo: true, repeat: 3, duration: 450, onComplete: () => t.destroy() });
  }

  // Show a tip the first time something happens in a level.
  tipOnce(key: string, msg: string) {
    if (this.test || this.tipsShown.has(key)) return;
    this.tipsShown.add(key);
    this.blinkTip(msg);
  }

  // --- Items ---------------------------------------------------------------

  private useItem(slot: number) {
    const item = this.state.items[slot];
    if (!item || this.phase !== 'action') return;
    const now = this.time.now;
    if (this.test && now < (this.itemReadyAt[slot] ?? 0)) return;
    switch (item.id) {
      case 'repair':
      case 'fullrepair':
        if (this.health >= this.maxHp) { toast(this, 'HEALTH IS FULL', H / 2 + 30, 600); return; }
        this.health = item.id === 'repair' ? Math.min(this.maxHp, this.health + Math.round(ITEMS.repair.tune!.heal)) : this.maxHp;
        break;
      case 'shield': this.shieldUntil = now + ITEMS.shield.tune!.time; break;
      case 'overdrive': this.overdriveUntil = now + ITEMS.overdrive.tune!.time; break;
      case 'nova': this.nova(); break;
      case 'cluster': {
        const t = ITEMS.cluster.tune!;
        const n = Math.max(1, Math.round(t.bomblets));
        for (let i = 0; i < n; i++) {
          const b = this.shot(this.player.x, this.player.y - 6, 'bomblet', (i - (n - 1) / 2) * t.angle, 160, t.damage, 'explosive');
          this.setFx(b, 'bomb').setData('splash', t.splash);
        }
        break;
      }
      case 'emp': this.emp(); break;
      case 'warp':
        this.warpUntil = now + ITEMS.warp.tune!.time;
        this.cameras.main.flash(200, 60, 60, 160);
        break;
      case 'decoy':
        this.flare?.destroy();
        this.flare = this.add.image(this.player.x, this.player.y - 10, 'flare').setDepth(9.8);
        this.flareUntil = now + ITEMS.decoy.tune!.time;
        break;
      case 'drone':
        this.healUntil = now + ITEMS.drone.tune!.time;
        this.healAt = now + ITEMS.drone.tune!.every;
        this.healDrone ??= this.add.image(0, 0, 'healdrone').setDepth(10);
        break;
      case 'rewind':
        toast(this, 'IT WORKS BY ITSELF\nIF YOUR SHIP IS DESTROYED', H / 2 + 30, 1200);
        return;
    }
    if (this.test) { this.itemReadyAt[slot] = now + ITEM_COOLDOWN[item.id]; this.refreshHud(); return; }
    item.count--;
    if (item.count <= 0) this.state.items[slot] = null;
    this.refreshHud();
  }

  // Nova Bomb: a white flash that hits every enemy on screen and wipes out enemy shots.
  private nova() {
    this.cameras.main.flash(350, 252, 252, 252);
    this.enemyBullets.clear(true, true);
    for (const e of this.enemies.getChildren().slice() as Phaser.Physics.Arcade.Sprite[]) {
      if (e.y < -10) continue;
      this.damageEnemy(e, ITEMS.nova.tune!.damage, null);
    }
  }

  // EMP Pulse: a ring sweeps out; machines stop for 3 s, shields drop and Phantoms decloak.
  private emp() {
    const ring = this.add.circle(this.player.x, this.player.y, 4).setStrokeStyle(2, 0x3cbcfc).setDepth(12);
    this.tweens.add({ targets: ring, scale: 60, alpha: 0, duration: 450, onComplete: () => ring.destroy() });
    for (const e of this.enemies.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
      const d = e.getData('e') as EnemyData;
      if (ENEMY_STATS[d.kind].organic) continue;
      d.stun = ITEMS.emp.tune!.stun;
      if (d.shieldImg) { d.shieldImg.destroy(); d.shieldImg = null; d.shield = 0; }
      if (d.cloaked) { d.cloaked = false; d.hold = 3000; e.setAlpha(1); }
    }
  }

  // --- Active gear --------------------------------------------------------------

  // Each equipped active gear drops in as supply crates on its own timer (see
  // CRATES). The first slot's starts with the segment; the second's first
  // crate comes halfway through the first slot's second wait, then it runs on
  // its own. Called at the start and after a vendor stop, with setupGear.
  private resetCrates(levelStart: boolean) {
    this.crateWait = this.state.gear.map(() => null);
    this.crateGap = this.state.gear.map(() => 0);
    const first = this.state.gear.findIndex((g) => g && GEAR[g].active);
    // The first crate of a level comes in half the usual wait.
    if (first >= 0) this.crateGap[first] = this.crateWait[first] = this.crateTime() / (levelStart ? 2 : 1);
  }

  private crateTime() {
    return Math.max(500, CRATES.every + Phaser.Math.Between(-CRATES.vary, CRATES.vary));
  }

  // Blink Drive's portal: overlapping purple-blue discs and a ring, the size of
  // the swap, that open out and fade.
  private portal(x: number, y: number, r: number) {
    const discs = [[0x6844fc, 0.45, 1], [0x9878f8, 0.4, 0.75], [0x3cbcfc, 0.35, 0.5], [0x0058f8, 0.5, 0.25]] as const;
    const c = this.add.container(x, y, [
      ...discs.map(([color, a, k]) => this.add.circle(0, 0, r * k, color, a)),
      this.add.circle(0, 0, r, 0x000000, 0).setStrokeStyle(1, 0xa4e4fc, 0.9),
    ]).setDepth(5).setScale(0.3); // under ships, shots and credits
    // Starts fading the moment it is fully open.
    this.tweens.add({ targets: c, scale: 1, duration: 100, ease: 'Quad.easeOut' });
    this.tweens.add({ targets: c, alpha: 0, delay: 100, duration: 220, onComplete: () => c.destroy() });
  }

  // A sparkle and a small white ring opening from the middle, where something
  // left and where it arrived.
  private blinkSpark(...pts: number[]) {
    for (let i = 0; i < pts.length; i += 2) {
      const [x, y] = [pts[i], pts[i + 1]];
      const s = this.add.image(x, y, 'sparkle').setDepth(13);
      this.tweens.add({ targets: s, alpha: 0, scale: 0.4, angle: 45, duration: 300, onComplete: () => s.destroy() });
      const ring = this.add.circle(x, y, 1, 0x000000, 0).setStrokeStyle(1, 0xfcfcfc).setDepth(13);
      this.tweens.add({ targets: ring, radius: 6, alpha: 0, duration: 220, onComplete: () => ring.destroy() });
    }
  }

  // Blink Drive's vortex, left where the ship blinked from: like a gravity well
  // but stronger, it drags everything in play toward it (the ship, enemies,
  // shots, credits, rocks and wrecks, but not bosses or gear crates) for a couple of seconds.
  private updateVortices(dt: number) {
    const gfx = this.beams;
    const p = this.player;
    this.vortexPull = { x: 0, y: 0 };
    const caught = new Set<Phaser.GameObjects.GameObject>(); // credits a vortex holds this frame
    for (const v of this.vortices.slice()) {
      v.t += dt * 1000;
      if (v.t >= v.life) { this.vortices.splice(this.vortices.indexOf(v), 1); continue; }
      // Grows in, then collapses at the end.
      const k = Math.min(1, v.t / 250) * Math.min(1, (v.life - v.t) / 300);
      // Swirling rings of dots in purples and blues, faster toward the core.
      const ringGap = (v.hole ? 60 : v.reach) / 5; // a black hole reaches past its rings
      for (let ring = 0; ring < 4; ring++) {
        const r = (ringGap * 0.6 + ring * ringGap) * k;
        const n = 8 + ring * 4;
        const spin = -(v.t / 1000) * (5 - ring * 0.9);
        for (let i = 0; i < n; i++) {
          const a = spin + (i / n) * Math.PI * 2;
          gfx.fillStyle([0xa4e4fc, 0x9878f8, 0x6844fc, 0x0058f8][ring], 1 - ring * 0.2)
            .fillRect(Math.round(v.x + Math.cos(a) * r), Math.round(v.y + Math.sin(a) * r * 0.85), ring < 2 ? 2 : 1, 1);
        }
      }
      const core = v.hole ? 9 : 5;
      gfx.fillStyle(0x000000, 0.6).fillCircle(v.x, v.y, core * k); // see-through, over whatever it holds
      gfx.lineStyle(1, 0xa4e4fc, 0.9).strokeCircle(v.x, v.y, core * k);
      // How hard it drags at a distance, in px/s.
      const force = (d: number) => (d > v.reach || d < 1 ? 0 : v.pull * k * (1 - d / v.reach));
      const dp = Phaser.Math.Distance.Between(p.x, p.y, v.x, v.y);
      if (!v.hole) {
        this.vortexPull.x += ((v.x - p.x) / dp) * force(dp) || 0;
        this.vortexPull.y += ((v.y - p.y) / dp) * force(dp) || 0;
      }
      for (const e of this.enemies.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
        const d = Phaser.Math.Distance.Between(e.x, e.y, v.x, v.y);
        if (d <= v.reach) { caught.add(e); e.setData('spread', v.spread); }
        const f = force(d) * dt;
        if (!f) continue;
        const mx = ((v.x - e.x) / d) * f, my = ((v.y - e.y) / d) * f;
        e.setPosition(e.x + mx, e.y + my);
        const ed = e.getData('e') as EnemyData;
        ed.baseX += mx;
        ed.stopY += my;
      }
      // Rocks and wrecks drift toward it like ships. Gear crates don't.
      for (const o of this.hazards.getChildren() as Phaser.Physics.Arcade.Image[]) {
        const d = Phaser.Math.Distance.Between(o.x, o.y, v.x, v.y);
        const f = force(d) * dt;
        if (!f) continue;
        const mx = ((v.x - o.x) / d) * f, my = ((v.y - o.y) / d) * f;
        o.x += mx;
        o.y += my;
      }
      // Enemy shots and credits bend toward it, and are slowed inside it so
      // they don't slingshot out. The player's own shots aren't touched.
      const slow = Math.exp(-v.damp * k * dt);
      for (const group of [this.enemyBullets, this.coins]) {
        for (const o of group.getChildren() as Phaser.Physics.Arcade.Image[]) {
          if (!o.body) continue;
          const d = Phaser.Math.Distance.Between(o.x, o.y, v.x, v.y);
          const f = force(d) * 6 * dt;
          if (!f) continue;
          // A black hole swallows the shots it pulls in.
          if (v.hole && group === this.enemyBullets && d < 5) { o.destroy(); continue; }
          if (group === this.enemyBullets && o.getData('vSpeed') == null) o.setData('vSpeed', o.body.velocity.length());
          o.body.velocity.x = (o.body.velocity.x + ((v.x - o.x) / d) * f) * slow;
          o.body.velocity.y = (o.body.velocity.y + ((v.y - o.y) / d) * f) * slow;
          // An enemy shot never quite stops (1 px/s at least), so it keeps a heading to speed back up along.
          if (group === this.enemyBullets && o.body.velocity.length() < 1) {
            if (o.body.velocity.length() < 0.01) o.body.velocity.set(0, 1);
            else o.body.velocity.setLength(1);
          }
          caught.add(o);
          o.setData('relT', 0);
          if (group === this.coins) o.setData('swirled', true);
        }
      }
    }
    // Once out of its pull (or it is gone), enemy shots get back up to the
    // speed they had before over a second, going the way they now point.
    for (const b of this.enemyBullets.getChildren() as Phaser.Physics.Arcade.Image[]) {
      const was = b.getData('vSpeed') as number | undefined;
      if (was == null || caught.has(b) || !b.body) continue;
      if ((b.getData('heldAt') ?? -9) >= this.game.loop.frame - 1) continue; // Energy Redirect still has it
      if (b.getData('relT') === 0) b.setData('relFrom', b.body.velocity.length());
      const t = Math.min(1, (b.getData('relT') as number) + dt);
      b.setData('relT', t);
      const want = Phaser.Math.Linear(b.getData('relFrom') as number, was, t);
      if (b.body.velocity.length() > 0.01) b.body.velocity.setLength(want);
      if (t >= 1) b.setData('vSpeed', null);
    }
    // Enemies it swapped move at half speed while it holds them; once out of
    // its reach (or it is gone) they get back to full speed over a second.
    for (const e of this.enemies.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
      const k = e.getData('slowK') as number | undefined;
      if (k == null) continue;
      if (caught.has(e)) { e.setData('slowK', 0.5); continue; }
      const next = k + 0.5 * dt;
      e.setData('slowK', next >= 1 ? null : next);
    }
    // Enemies a vortex has held, once out of its reach (or it is gone), slowly
    // drift apart from any enemy they overlap, so they don't stay bunched up.
    const foes = this.enemies.getChildren() as Phaser.Physics.Arcade.Sprite[];
    for (const e of foes) {
      const speed = e.getData('spread') as number | undefined;
      if (!speed || caught.has(e) || !e.active) continue;
      let px = 0, py = 0;
      for (const o of foes) {
        if (o === e || !o.active) continue;
        const gap = (e.displayWidth + o.displayWidth + e.displayHeight + o.displayHeight) / 4;
        const d = Phaser.Math.Distance.Between(e.x, e.y, o.x, o.y);
        if (d >= gap) continue;
        // Right on top of each other: part sideways, a random way.
        const ux = d > 0.5 ? (e.x - o.x) / d : Math.random() < 0.5 ? -1 : 1, uy = d > 0.5 ? (e.y - o.y) / d : 0;
        px += ux * (1 - d / gap);
        py += uy * (1 - d / gap);
      }
      const len = Math.hypot(px, py);
      if (len < 0.001) continue;
      const step = speed * Math.min(1, len) * dt;
      const mx = (px / len) * step, my = (py / len) * step;
      e.setPosition(e.x + mx, e.y + my);
      const ed = e.getData('e') as EnemyData;
      ed.baseX += mx;
      ed.stopY += my;
    }
    // Once out of reach (or the vortex is gone), credits soon lose their
    // sideways speed and settle back to falling straight down at the usual rate.
    const settle = 1 - Math.exp(-5 * dt);
    for (const c of this.coins.getChildren() as Phaser.Physics.Arcade.Image[]) {
      if (!c.getData('swirled') || caught.has(c) || !c.body?.enable || c.getData('home')) continue;
      const vel = c.body.velocity;
      vel.x += (0 - vel.x) * settle;
      vel.y += (COIN_FALL - vel.y) * settle;
      if (Math.abs(vel.x) < 1 && Math.abs(vel.y - COIN_FALL) < 1) { c.setVelocity(0, COIN_FALL); c.setData('swirled', false); }
    }
  }

  // Whether a point is inside level walls: the tunnel's, blast doors, coral,
  // barrier cells, or a rock, wreck or other hazard.
  private solidAt(x: number, y: number) {
    if (this.tunnel) {
      const { l, r } = this.tunnel.at(y);
      if (x < l || x > r) return true;
    }
    if (this.act3.solidAt(x, y) || this.barriers.solidAt(x, y)) return true;
    return (this.hazards.getChildren() as Phaser.Physics.Arcade.Image[]).some((h) => h.active
      && Math.abs(h.x - x) < h.displayWidth / 2 && Math.abs(h.y - y) < h.displayHeight / 2);
  }

  private updateCrates(dt: number) {
    for (const c of this.crates.getChildren() as Phaser.Physics.Arcade.Image[]) {
      if (c.y > H + 10) { c.destroy(); continue; }
      c.x = c.getData('x') + Math.sin(this.time.now / 500 + c.getData('x')) * 3;
      // Its red lights blink.
      const id = c.getData('gear') as GearId;
      c.setTexture(Math.floor(this.time.now / 300) % 2 ? `crate_${id}_off` : `crate_${id}`);
    }
    if (this.phase !== 'action' || this.level.noCrates?.includes(this.segment)) return;
    const slots = this.state.gear.flatMap((g, i) => (g && GEAR[g].active ? [i] : []));
    slots.forEach((slot, k) => {
      const wait = this.crateWait[slot];
      if (wait == null) return;
      this.crateWait[slot] = wait - dt * 1000;
      if (this.crateWait[slot]! > 0) return;
      this.dropCrate(this.state.gear[slot]!);
      const next = this.crateTime();
      this.crateGap[slot] = this.crateWait[slot] = next;
      const second = slots[1];
      if (k === 0 && second !== undefined && this.crateWait[second] == null) this.crateGap[second] = this.crateWait[second] = next / 2;
    });
  }

  private dropCrate(id: GearId) {
    const x = Phaser.Math.Between(24, W - 24);
    const c = this.crates.create(x, -10, `crate_${id}`) as Phaser.Physics.Arcade.Image;
    c.setDepth(9).setData('gear', id).setData('x', x).setVelocityY(CRATES.speed);
    this.tipOnce('crate', 'GRAB SUPPLY CRATES\nTO USE YOUR GEAR');
  }

  private pickCrate(c: Phaser.Physics.Arcade.Image) {
    if (!c.active || this.phase !== 'action') return;
    const id = c.getData('gear') as GearId;
    c.destroy();
    this.sparks.explode(8, c.x, c.y);
    if (hasGear(this.state, id)) this.fireGear(id);
  }

  // What an active gear does when its crate is picked up.
  private fireGear(id: GearId) {
    const now = this.time.now;
    const lv = gearLevel(this.state, id);
    const p = this.player;
    const dir = this.lastMove;
    switch (id) {
      case 'dodge': {
        const st = gearStats.dodge(lv);
        this.invulnUntil = Math.max(this.invulnUntil, now + st.safe);
        this.dashing = true;
        const from = { x: p.x, y: p.y };
        const to = { x: Phaser.Math.Clamp(p.x + dir.x * st.dist, 6, W - 6), y: Phaser.Math.Clamp(p.y + dir.y * st.dist, 24, H - 30) };
        for (let i = 0; i < 3; i++) {
          const ghost = this.add.image(p.x + (to.x - p.x) * i / 3, p.y + (to.y - p.y) * i / 3, 'ship').setAlpha(0.4).setDepth(9);
          this.tweens.add({ targets: ghost, alpha: 0, duration: 250, delay: i * 40, onComplete: () => ghost.destroy() });
        }
        this.tweens.add({ targets: p, x: to.x, y: to.y, duration: 120, ease: 'Quad.easeOut', onComplete: () => { this.dashing = false; this.shiftDrag(to.x - from.x, to.y - from.y); } });
        break;
      }
      case 'blink': {
        // To the middle (the tunnel's middle, in the tunnel), as far above the
        // HUD as the swap reaches, and whatever is near the landing spot (enemies,
        // their shots, credits) swaps to where the ship was, keeping its offset and
        // carrying straight on (the vortex there pulls it back in). Enemies can be
        // stunned (0 ms unless tuned). What lands off screen or in level walls is
        // destroyed, with no credits.
        const st = gearStats.blink(lv);
        const from = { x: p.x, y: p.y };
        const ty = H - 26 - st.radius;
        const to = { x: this.tunnel ? this.tunnel.at(ty).cx : W / 2, y: ty };
        const near = (o: Phaser.GameObjects.Components.Transform) => Phaser.Math.Distance.Between(o.x, o.y, to.x, to.y) <= st.radius;
        const foes = (this.enemies.getChildren() as Phaser.Physics.Arcade.Sprite[]).filter((e) => e.active && near(e));
        const loose = [...this.enemyBullets.getChildren(), ...this.coins.getChildren()]
          .filter((o) => o.active && near(o as Phaser.Physics.Arcade.Image)) as Phaser.Physics.Arcade.Image[];
        this.portal(from.x, from.y, st.radius);
        this.portal(to.x, to.y, st.radius);
        this.blinkSpark(from.x, from.y, to.x, to.y);
        p.setPosition(to.x, to.y);
        this.shiftDrag(p.x - from.x, p.y - from.y);
        this.vortices.push({ x: from.x, y: from.y, t: 0, life: st.vortex, pull: st.vortexPull, reach: st.vortexReach, damp: st.vortexDamp, spread: st.vortexSpread });
        this.invulnUntil = Math.max(this.invulnUntil, now + st.safe);
        const dx = from.x - to.x, dy = from.y - to.y;
        const lost = (x: number, y: number) => x < 0 || x > W || y < 0 || y > H || this.solidAt(x, y);
        for (const e of foes) {
          this.blinkSpark(e.x, e.y, e.x + dx, e.y + dy);
          if (lost(e.x + dx, e.y + dy)) { this.killEnemy(e, false); continue; }
          e.setPosition(e.x + dx, e.y + dy);
          const d = e.getData('e') as EnemyData;
          d.baseX += dx;
          d.stopY += dy;
          d.stun = Math.max(d.stun, st.stun);
          e.setData('slowK', 0.5); // half speed while the vortex holds it (see updateVortices)
        }
        for (const o of loose) {
          this.blinkSpark(o.x, o.y, o.x + dx, o.y + dy);
          if (lost(o.x + dx, o.y + dy)) { o.destroy(); continue; }
          o.setPosition(o.x + dx, o.y + dy);
        }
        break;
      }
      case 'afterburner': {
        const st = gearStats.afterburner(lv);
        this.burnUntil = now + st.burn;
        break;
      }
      case 'roll': {
        const st = gearStats.roll(lv);
        this.rollUntil = now + st.spin;
        break;
      }
      case 'redirect': {
        // A beam still held from the last crate goes off at once.
        if (this.redirectHeld) this.fireRedirect();
        if (this.redirectUntil === 0) { this.redirectCount = 0; this.redirectLasers.clear(); }
        this.redirectUntil = now + gearStats.redirect(lv).collect;
        break;
      }
      case 'burst': {
        // A pod left where the ship is, completely still: it fires a ring at once,
        // more rings a beat apart, and the last as it pops, with a blast and
        // cluster bomblets at higher levels.
        const st = gearStats.burst(lv);
        const pod = this.add.image(p.x, p.y, 'burstpod').setDepth(9);
        const ring = () => { for (let i = 0; i < st.shots; i++) this.shot(pod.x, pod.y, 'pellet', (i / st.shots) * 360, 220, st.damage, 'kinetic'); };
        if (st.bursts > 1) ring();
        for (let k = 1; k < st.bursts - 1; k++) this.time.delayedCall(k * st.gap, () => { if (pod.active) ring(); });
        // The last ring fires as it pops.
        this.time.delayedCall((st.bursts - 1) * st.gap, () => {
          if (!pod.active) return;
          ring();
          const { x, y } = pod;
          pod.destroy();
          this.sparks.explode(12, x, y);
          if (st.blastRadius > 0) this.splash(x, y, st.blastRadius, st.blastDamage, 'explosive', null);
          const t = ITEMS.cluster.tune!;
          for (let i = 0; i < st.bombs; i++) {
            this.setFx(this.shot(x, y, 'bomblet', (i / st.bombs) * 360, 160, t.damage, 'explosive'), 'bomb').setData('splash', t.splash);
          }
        });
        break;
      }
    }
  }

  // --- Waves -----------------------------------------------------------------

  private runWaves(dt: number) {
    if (this.boss || this.treasure) return;
    this.tickReturners(dt);
    const waves = this.level.segments[this.segment];
    const wave = waves[this.waveIndex];
    if (!wave) {
      // The segment can't end with ships still due back: hurry them in.
      if (this.returners.length) {
        if (this.enemies.countActive() === 0) this.returners.forEach((r) => { r.t = Math.min(r.t, 1500); });
        return;
      }
      // In the tunnel, fly on until it opens out again. Level 15's legs flow
      // straight on without waiting for the screen to clear, unless a boss is next.
      const last = this.segment >= this.level.segments.length - 1;
      const flows = this.level.vendorless && !last && !this.level.segmentBoss?.[this.segment];
      if ((flows || this.enemies.countActive() === 0) && (!this.tunnel || this.tunnel.done)) {
        this.tunnel?.destroy();
        this.tunnel = null;
        this.endSegment();
      }
      return;
    }
    if (wave.waitClear && this.enemies.countActive() > 0) return;
    this.waveTimer += dt * 1000;
    if (this.waveTimer >= wave.delay) {
      this.spawnWave(wave);
      this.waveIndex++;
      this.waveTimer = 0;
    }
  }

  // An enemy pulling back off the top: the first time, it comes back down a
  // few seconds later with the health it had left. The second time it leaves
  // down the screen instead (see updateEnemies).
  retreat(e: Phaser.Physics.Arcade.Sprite) {
    const d = e.getData('e') as EnemyData;
    if (!d.back && this.phase === 'action') {
      this.returners.push({ kind: d.kind, hp: d.hp, t: Phaser.Math.Between(...RETURN_AFTER) });
    }
    e.destroy();
  }

  private tickReturners(dt: number) {
    if (this.phase !== 'action') return;
    for (const r of this.returners.slice()) {
      r.t -= dt * 1000;
      if (r.t > 0) continue;
      this.returners.splice(this.returners.indexOf(r), 1);
      const e = this.spawnEnemy(r.kind, Phaser.Math.Between(20, W - 20), -10);
      const d = e.getData('e') as EnemyData;
      d.hp = r.hp;
      d.back = true;
    }
  }

  private spawnWave(w: Wave) {
    const n = w.count ?? 1;
    // In the tunnel, positions across the screen become positions across the tunnel.
    const tx = (x: number) => (this.tunnel ? this.tunnel.mapX(x / W, 0) : x);
    const cx = tx((w.x ?? 0.5) * W);
    // Corrupted ships fly their own take on each formation.
    const put = (i: number, x: number, y: number) => {
      const p = isCorrupt(w.kind) ? corruptFormation(w.pattern, i, n, x, y) : { x, y };
      this.spawnEnemy(w.kind, p.x, p.y);
    };
    switch (w.pattern) {
      case 'single':
        put(0, cx, -10);
        break;
      case 'pair':
        put(0, tx(W * 0.3), -10);
        put(1, tx(W * 0.7), -10);
        break;
      case 'line':
        for (let i = 0; i < n; i++) put(i, tx(((i + 0.5) / n) * (W - 20) + 10), -10);
        break;
      case 'column':
        for (let i = 0; i < n; i++) put(i, cx, -10 - i * 16);
        break;
      case 'vee':
        for (let i = 0; i < n; i++) {
          const side = i - (n - 1) / 2;
          put(i, Phaser.Math.Clamp(cx + side * 16, 8, W - 8), -10 - Math.abs(side) * 12);
        }
        break;
      case 'swarm':
        // Single file from the top corner, each one setting off a beat after the last.
        for (let i = 0; i < n; i++) {
          const e = this.spawnEnemy(w.kind, cx < W / 2 ? 14 : W - 14, -8);
          const d = e.getData('e') as EnemyData;
          d.dir = cx < W / 2 ? 1 : -1;
          d.wait = i * 170;
        }
        break;
    }
  }

  spawnEnemy(kind: FoeKind, x: number, y: number) {
    const stats = ENEMY_STATS[kind];
    this.sighted(kind);
    const e = this.enemies.create(x, y, stats.texture) as Phaser.Physics.Arcade.Sprite;
    const data: EnemyData = {
      kind, hp: stats.hp, t: 0, baseX: x, fireIn: Phaser.Math.Between(900, 2200),
      dir: x < W / 2 ? 1 : -1, wait: 0, stopY: Phaser.Math.Between(46, 80), hold: 5000,
      step: 0, aim: 0, charge: 0, beam: 0, shield: 0, shieldImg: null, cloaked: false,
      taken: stats.taken, burn: 0, burnDmg: 0, burnTick: 0, stun: 0,
    };
    e.setData('e', data);
    this.setupHollow(e, data);
    if (isCorrupt(kind)) {
      setupCorrupt(this, e, data);
      this.corruptCall(kind);
    }
    // Weaver sine amplitude has to stay on screen.
    if (kind === 'weaver') data.baseX = Phaser.Math.Clamp(x, 34, W - 34);
    if (kind === 'gunboat') data.fireIn = 700;
    if (kind === 'trapper') { data.fireIn = 900; data.aim = 1e9; e.x = x < W / 2 ? 24 : W - 24; }
    if (kind === 'bomber') {
      e.x = Phaser.Math.Clamp(x, 24, W - 24);
      data.stopY = Phaser.Math.Between(36, 60);
      data.hold = 6000;
      data.fireIn = 900;
      this.tipOnce('bomb', 'BOMBS BURST WIDE\nSHOOT THEM FROM AFAR');
    }
    if (kind === 'bomb') {
      data.aim = 24; // fall speed
      data.hold = Phaser.Math.Between(Math.round(H / 3), H - 24); // where it blows if it gets past the ship
    }
    if (kind === 'mine') e.body!.setCircle(3.5);
    if (kind === 'pmine') e.body!.setCircle(3.5);
    if (kind === 'minelayer') {
      data.baseX = Phaser.Math.Clamp(x, 44, W - 44);
      data.stopY = Phaser.Math.Between(40, 90);
      data.fireIn = 1100;
      if (this.state.level === 7) this.tipOnce('pmine', 'MINES BURST WHEN\nYOU GET CLOSE');
    }
    if (kind === 'carrier') {
      data.stopY = Phaser.Math.Between(38, 58);
      data.fireIn = 500;
      data.hold = 1400;
      if (this.state.level === 6) this.tipOnce('carrier', 'CARRIERS LAUNCH DARTS');
    }
    if (kind === 'phantom') {
      data.cloaked = true;
      data.hold = 1500;
      data.stopY = Phaser.Math.Between(44, 110);
      e.setAlpha(0.1);
      if (this.state.level === 8) this.tipOnce('phantom', 'PHANTOMS CAN ONLY\nBE HIT WHEN SEEN');
    }
    if (kind === 'driller') {
      // Slides in from the side, somewhere in the lower half where the ship flies.
      e.setPosition(x < W / 2 ? -8 : W + 8, Phaser.Math.Between(Math.round(H * 0.4), Math.round(H * 0.72)));
      e.setFlipX(data.dir < 0);
      data.hold = 900;
      if (this.state.level === 4) this.tipOnce('driller', 'DRILLERS RAM\nFROM THE SIDES');
    }
    if (kind === 'lancer') data.fireIn = Phaser.Math.Between(300, 900);
    if (kind === 'bulwark') {
      data.stopY = Phaser.Math.Between(60, 84);
      data.fireIn = 1400;
      data.shield = BULWARK_SHIELD;
      data.shieldImg = this.add.image(x, y + 9, 'bshield').setDepth(e.depth + 1);
      e.once('destroy', () => data.shieldImg?.destroy());
      if (this.state.level === 5) this.tipOnce('bulwark', 'BREAK THE SHIELD\nTO HIT THE HULL');
    }
    return e;
  }

  // The first Corrupted ship of a flight gets a word from the allies.
  private corruptCall(kind: string) {
    if (this.test || this.corruptSeen || this.state.level !== 11 || this.side) return;
    this.corruptSeen = true;
    const msg = RAIDER_CORRUPT.has(kind) ? 'VEX: THOSE WERE RAIDERS.\nSOMETHING ATE THEM.' : 'REYES: THAT SHIP IS\nCOVERED IN GROWTHS!';
    this.time.delayedCall(Math.max(600, this.radioUntil - this.time.now + 200), () => this.radio(msg));
  }

  // --- The Hollow (levels 9 to 15) ------------------------------------------

  private setupHollow(e: Phaser.Physics.Arcade.Sprite, d: EnemyData) {
    const lv = this.state.level;
    switch (d.kind) {
      case 'spore':
        d.baseX = Phaser.Math.Clamp(e.x, 16, W - 16);
        e.body!.setCircle(4, 1, 1);
        if (lv === 9) this.tipOnce('spore', 'SPORE PODS BURST\nINTO SEEKERS');
        break;
      case 'seeker':
        d.aim = Math.PI / 2 + Phaser.Math.FloatBetween(-1, 1);
        e.body!.setCircle(2, 0.5, 0.5);
        break;
      case 'tendril':
        d.stopY = Phaser.Math.Between(40, 100);
        if (lv === 10) this.tipOnce('tendril', 'TENDRILS LUNGE\nAT WHERE YOU ARE');
        break;
      case 'brood':
        d.stopY = Phaser.Math.Between(46, 70);
        d.baseX = Phaser.Math.Clamp(e.x, 40, W - 40);
        d.fireIn = 1600;
        if (lv === 11) this.tipOnce('brood', 'BROOD MOTHERS HEAL.\nKILL THEM FAST');
        break;
      case 'mimic': {
        // It shrugs off whatever the ship's first weapon deals.
        const w = this.state.weapons[0];
        const own = w ? this.weaponType(w) : 'kinetic';
        const m = ENEMY_STATS.mimic.mimic!;
        d.taken = Object.fromEntries(DTYPES.map((t) => [t, t === own ? m.own : m.others])) as Taken;
        d.stopY = Phaser.Math.Between(40, 64);
        d.hold = 7000;
        d.fireIn = 900;
        if (lv === 12) this.tipOnce('mimic', 'MIMICS SHRUG OFF\nYOUR FIRST WEAPON');
        break;
      }
      case 'husk':
        d.stopY = Phaser.Math.Between(50, 90);
        d.fireIn = 1500;
        break;
      case 'egg':
        d.aim = 26;
        d.hold = EGG_HATCH;
        break;
      case 'larva':
        d.aim = Math.PI / 2 + Phaser.Math.FloatBetween(-1.2, 1.2);
        d.hold = 200;
        e.body!.setCircle(3, 0.5, 0.5);
        break;
    }
  }

  // Returns true if the enemy is gone.
  private updateHollow(e: Phaser.Physics.Arcade.Sprite, d: EnemyData, dt: number, firing: boolean) {
    const ms = dt * 1000;
    switch (d.kind) {
      case 'spore':
        // Drifts down, wobbling.
        e.y += 20 * dt;
        e.x = d.baseX + Math.sin(d.t * 1.7 + d.baseX) * 10;
        break;
      case 'seeker': {
        // Homes in for a few seconds, then flies on straight.
        if (d.t < 3.2) {
          const tg = this.aimTarget(false);
          const want = Phaser.Math.Angle.Between(e.x, e.y, tg.x, tg.y);
          d.aim = Phaser.Math.Angle.RotateTo(d.aim, want, 2.6 * dt);
        }
        e.x += Math.cos(d.aim) * 58 * dt;
        e.y += Math.sin(d.aim) * 58 * dt;
        e.setTexture(Math.floor(d.t * 8) % 2 ? 'seeker' : 'seekerLit');
        if (d.t > 7) { e.destroy(); return true; }
        break;
      }
      case 'tendril':
        // Drops in, locks onto the ship's spot with a flickering line, then lunges down it.
        if (d.step === 0) {
          e.y += 60 * dt;
          if (e.y >= d.stopY) {
            d.step = 1;
            d.hold = 700;
            const tg = this.aimTarget(false);
            d.aim = Phaser.Math.Angle.Between(e.x, e.y, tg.x, tg.y);
          }
        } else if (d.step === 1) {
          d.hold -= ms;
          e.x += Math.floor(d.t * 30) % 2 ? 0.5 : -0.5;
          if (Math.floor(d.hold / 90) % 2 === 0) {
            this.beams.lineStyle(1, 0xd800cc, 0.5);
            this.beams.lineBetween(e.x, e.y, e.x + Math.cos(d.aim) * 400, e.y + Math.sin(d.aim) * 400);
          }
          if (d.hold <= 0) d.step = 2;
        } else {
          e.x += Math.cos(d.aim) * 230 * dt;
          e.y += Math.sin(d.aim) * 230 * dt;
          e.setRotation(d.aim - Math.PI / 2);
        }
        break;
      case 'brood':
        // Hovers, heals itself, and lays Spore Pods; after five it sinks away.
        e.y += (e.y < d.stopY ? 22 : d.step >= 5 ? 14 : 3) * dt;
        e.x = d.baseX + Math.sin(d.t * 0.6) * 30;
        d.hp = Math.min(ENEMY_STATS.brood.hp, d.hp + 1.2 * dt);
        if (d.fireIn <= 0 && firing && d.step < 5 && e.y > 20) {
          d.fireIn = 2400;
          d.step++;
          this.spawnEnemy('spore', e.x, e.y + 10);
        }
        break;
      case 'mimic':
        // Mirrors the ship across the screen and fires the ship's own pattern back down.
        if (e.y < d.stopY) e.y += 50 * dt;
        else {
          d.hold -= ms;
          if (d.hold <= 0) e.y += 50 * dt;
          e.x += Phaser.Math.Clamp(W - this.player.x - e.x, -70 * dt, 70 * dt);
          const w = this.state.weapons[0];
          if (d.fireIn <= 0 && firing && w && d.hold > 0) {
            d.fireIn = 1000;
            for (const sh of WEAPONS[w].stats(1).shots.slice(0, 3)) {
              this.enemyShoot(e.x - sh.dx, e.y + 6, Math.PI / 2 - Phaser.Math.DegToRad(sh.deg), this.bulletSpeed() + 20);
            }
          }
        }
        break;
      case 'egg':
        // Drifts down with the growth it was laid on, pulsing faster, then hatches.
        e.y += d.aim * dt;
        d.hold -= ms;
        e.setTexture(Math.floor(d.t * (d.hold < 1500 ? 10 : 2)) % 2 ? 'eggLit' : 'egg');
        e.setScale(d.hold < 1500 ? 1 + Math.sin(d.t * 30) * 0.08 : 1);
        if (d.hold <= 0 && firing) {
          for (let i = 0; i < 3; i++) this.spawnEnemy('larva', e.x + (i - 1) * 5, e.y);
          this.goo.explode(10, e.x, e.y);
          e.destroy();
          return true;
        }
        break;
      case 'larva': {
        // Skitters toward the ship in jerky darts, then gives up and wanders off.
        if (d.t < 8) {
          d.hold -= ms;
          if (d.hold <= 0) {
            d.hold = Phaser.Math.Between(260, 520);
            const tg = this.aimTarget(false);
            d.aim = Phaser.Math.Angle.Between(e.x, e.y, tg.x, tg.y) + Phaser.Math.FloatBetween(-0.7, 0.7);
          }
        }
        const sp = 40 + (d.hold % 260) / 3;
        e.x += Math.cos(d.aim) * sp * dt;
        e.y += Math.sin(d.aim) * sp * dt;
        e.setTexture(Math.floor(d.t * 10) % 2 ? 'larvaLit' : 'larva');
        if (d.t > 12) { e.destroy(); return true; }
        break;
      }
      case 'husk':
        // Lumbers in and fires bursts of three aimed shots.
        e.y += (e.y < d.stopY ? 24 : 6) * dt;
        if (d.fireIn <= 0 && firing && e.y > 16) {
          if (d.charge <= 0) d.charge = 3;
          d.charge--;
          d.fireIn = d.charge > 0 ? 150 : 2100;
          this.enemyShoot(e.x, e.y + 8);
        }
        break;
    }
    return false;
  }

  // Burning and stuns, ticked for every enemy each frame. Returns true if the burn killed it.
  private tickStatus(e: Phaser.Physics.Arcade.Sprite, d: EnemyData, dt: number) {
    const ms = dt * 1000;
    if (d.stun > 0) {
      d.stun -= ms;
      if (d.stun > 0) e.setTint(Math.floor(this.time.now / 90) % 2 ? 0x3cbcfc : 0xffffff);
      else e.clearTint();
    }
    if (d.burn > 0) {
      d.burn -= ms;
      d.burnTick -= ms;
      if (d.burnTick <= 0) {
        d.burnTick = 400;
        this.sparks.explode(2, e.x, e.y);
        if (this.damageEnemy(e, d.burnDmg, 'plasma')) return true;
      }
    }
    return false;
  }

  bulletSpeed() {
    return 70 + (this.state.level - 1) * 5; // slow and sparse early on
  }

  private updateEnemies(full: number) {
    const firing = this.phase === 'action';
    for (const obj of this.enemies.getChildren().slice()) {
      const e = obj as Phaser.Physics.Arcade.Sprite;
      const d = e.getData('e') as EnemyData;
      if (d.wait > 0) { d.wait -= full * 1000; continue; }
      if (this.tickStatus(e, d, full)) continue;
      // Slowed (Blink Drive's swap): it moves, and fires, at that share of its speed.
      const dt = full * ((e.getData('slowK') as number | null) ?? 1);
      if (d.stun > 0) continue;
      d.t += dt;
      d.fireIn -= dt * 1000;
      const y0 = e.y;
      switch (d.kind) {
        case 'dart':
          e.y += 72 * dt;
          break;
        case 'weaver':
          e.y += 34 * dt;
          e.x = d.baseX + Math.sin(d.t * 2.4) * 28;
          if (d.fireIn <= 0 && e.y > 10 && e.y < H * 0.6 && firing) {
            d.fireIn = Phaser.Math.Between(1800, 2800);
            this.enemyShoot(e.x, e.y + 4);
          }
          break;
        case 'drone':
          // Snake across and down the screen.
          e.y += 52 * dt;
          e.x = d.baseX + d.dir * d.t * 42 + Math.sin(d.t * 3.6) * 12 * d.dir;
          break;
        case 'gunboat': {
          // Fly in, park, fire a 4-shot spread (one from each gun tip), then pull
          // back up off the top, still firing on the way (or down, the second time).
          if (e.y < d.stopY && d.hold > 0) e.y += 50 * dt;
          else if (d.hold > 0) d.hold -= dt * 1000;
          else { e.y -= 40 * dt; d.leaving = true; }
          const parked = e.y >= d.stopY || d.leaving;
          if (parked && d.fireIn <= 0 && firing && e.y > 6 && e.y < LEAVE_FIRE_STOP) {
            d.fireIn = 2500;
            const tg = this.aimTarget();
            const a = Phaser.Math.Angle.Between(e.x, e.y, tg.x, tg.y);
            // Gun tips: the inner pair reach one pixel lower than the outer pair.
            for (const g of [{ dx: -5, dy: 4, off: -0.3 }, { dx: -3, dy: 5, off: -0.1 }, { dx: 3, dy: 5, off: 0.1 }, { dx: 5, dy: 4, off: 0.3 }])
              this.enemyShoot(e.x + g.dx, e.y + g.dy, a + g.off);
          }
          break;
        }
        case 'bomber': {
          // Sinks to its height, edges toward the ship dropping a bomb from under
          // each wing, then pulls back up off the top, still dropping bombs (or
          // down, the second time).
          if (e.y < d.stopY && d.hold > 0) e.y += 34 * dt;
          else if (d.hold > 0) {
            d.hold -= dt * 1000;
            e.x += Phaser.Math.Clamp(this.player.x - e.x, -10, 10) * dt;
          } else { e.y -= 30 * dt; d.leaving = true; }
          const parked = e.y >= d.stopY || d.leaving;
          if (parked && d.fireIn <= 0 && firing && e.y > 6 && e.y < LEAVE_FIRE_STOP) {
            d.fireIn = 2000;
            this.spawnEnemy('bomb', e.x - 7, e.y + 9);
            this.spawnEnemy('bomb', e.x + 7, e.y + 9);
          }
          break;
        }
        case 'bomb':
          // Falls straight down, slow at first and faster and faster. Like a depth
          // charge it blows at the ship's height while it is above the ship;
          // otherwise at a height picked when it was dropped. It flashes faster
          // and faster over the last stretch, and once flashing its height is set.
          d.aim = Math.min(70, d.aim + 35 * dt);
          e.y += d.aim * dt;
          if (!d.charge) {
            // Past the ship already: if its own height is gone by too, pick a new one below.
            if (e.y >= this.player.y && d.hold < e.y + BOMB_FLASH) {
              d.hold = Phaser.Math.Between(Math.round(e.y + BOMB_FLASH), Math.max(Math.round(e.y + BOMB_FLASH), H - 24));
            }
            const at = e.y < this.player.y ? this.player.y : d.hold;
            // Bombs dropped together blow a moment apart.
            if (at - e.y < BOMB_FLASH) { d.charge = 1; d.stopY = at + Phaser.Math.Between(-4, 12); }
          }
          if (d.charge && e.y >= d.stopY && firing) { this.bombBurst(e.x, e.y); e.destroy(); continue; }
          e.setTexture(d.charge && this.fuseLit(d, dt, 1 - (d.stopY - e.y) / BOMB_FLASH, 0.5) ? 'bombLit' : 'bomb');
          break;
        case 'trapper':
          // Drop to bombing height, then cross the screen laying mines. Its pincers
          // open (frames 2, 3) just before each mine and close again just after.
          d.aim += dt * 1000; // time since the last mine
          e.setTexture(Math.min(d.fireIn, d.aim) < TRAP_STEP ? 'trapper3' : Math.min(d.fireIn, d.aim) < TRAP_STEP * 2 ? 'trapper2' : 'trapper');
          if (e.y < 44) e.y += 40 * dt;
          else {
            e.x += d.dir * 26 * dt;
            if (d.fireIn <= 0 && firing && e.x > 8 && e.x < W - 8) {
              d.fireIn = 1700;
              d.aim = 0;
              this.spawnEnemy('mine', e.x, e.y + 7); // between the open pincers
            }
          }
          break;
        case 'mine':
          // Net mine: drifts down blinking until it leaves the screen. When the
          // ship comes close, it flashes faster and faster, then throws out an
          // energy net. A ship inside the net is slowed for a while.
          e.y += 26 * dt;
          if (d.charge <= 0 && firing && Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y) < 66) d.charge = MINE_FLASH;
          if (d.charge > 0) {
            d.charge -= dt * 1000;
            e.setTexture(this.fuseLit(d, dt, 1 - d.charge / MINE_FLASH) ? 'mineLit' : 'mine');
            if (d.charge <= 0 && firing) {
              this.netBurst(e.x, e.y);
              if (d.corrupt) for (let i = 0; i < 6; i++) this.enemyShoot(e.x, e.y, (i / 6) * Math.PI * 2 + Math.PI / 6, 60);
              e.destroy();
              continue;
            }
          } else e.setTexture(Math.floor(d.t * 4) % 2 ? 'mineLit' : 'mine');
          break;
        case 'pmine':
          // Drifts with the nebula until the ship comes close, then arms and bursts.
          e.y += 14 * dt;
          if (d.charge > 0) {
            d.charge -= dt * 1000;
            e.setTexture(Math.floor(d.t * 14) % 2 ? 'pmineLit' : 'pmine');
            if (d.charge <= 0 && firing) {
              const n = d.corrupt ? 12 : 8;
              for (let i = 0; i < n; i++) this.enemyShoot(e.x, e.y, (i / n) * Math.PI * 2, 60);
              this.sparks.explode(8, e.x, e.y);
              e.destroy();
              continue;
            }
          } else {
            e.setTexture(Math.floor(d.t * 2) % 2 ? 'pmineLit' : 'pmine');
            if (firing && Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y) < 30) d.charge = 500;
          }
          break;
        case 'minelayer':
          // Sinks to its height weaving side to side, seeds four mines, then sinks on.
          e.y += (e.y < d.stopY ? 34 : d.step >= 4 ? 28 : 5) * dt;
          e.x = d.baseX + Math.sin(d.t * 1.1) * 38;
          if (d.fireIn <= 0 && firing && e.y > 20 && d.step < 4) {
            d.fireIn = 1500;
            d.step++;
            this.spawnEnemy('pmine', e.x, e.y + 6);
          }
          break;
        case 'carrier':
          // Parks, launches four Darts from its bay, then backs off the screen.
          if (d.step < 4) {
            if (e.y < d.stopY) e.y += 30 * dt;
            else if (d.fireIn <= 0 && firing) {
              d.fireIn = 650;
              this.spawnEnemy('dart', e.x + (d.step % 2 ? 7 : -7), e.y + 8);
              d.step++;
            }
          } else {
            d.hold -= dt * 1000;
            if (d.hold <= 0) { e.y -= 24 * dt; d.leaving = true; }
          }
          break;
        case 'phantom':
          this.updatePhantom(e, d, dt, firing);
          break;
        case 'boulder':
          e.rotation += dt * 2;
          break;
        case 'driller':
          if (this.updateDriller(e, d, dt)) continue;
          break;
        case 'lancer':
          if (this.updateLancer(e, d, dt, firing)) continue;
          break;
        case 'spore':
        case 'seeker':
        case 'tendril':
        case 'brood':
        case 'mimic':
        case 'husk':
        case 'egg':
        case 'larva':
          if (this.updateHollow(e, d, dt, firing)) continue;
          break;
        default:
          if (isCorrupt(d.kind) && updateCorrupt(this, e, d, dt, firing)) continue;
          break;
        case 'bulwark':
          // Lumbers down to its spot, fires aimed pairs, then creeps on down.
          e.y += (e.y < d.stopY ? 28 : 7) * dt;
          if (d.fireIn <= 0 && firing && e.y > 20) {
            d.fireIn = 2000;
            this.enemyShoot(e.x - 5, e.y + 8);
            this.enemyShoot(e.x + 5, e.y + 8);
          }
          d.shieldImg?.setPosition(e.x, e.y + 9);
          break;
      }
      // Back for the second time, it leaves down the screen instead of up.
      if (d.back && d.leaving && e.y < y0) e.y = y0 + (y0 - e.y);
      if (d.leaving && e.y < -20) this.retreat(e);
      // Ships waiting in a column or vee above the top aren't culled before they come on.
      else if (e.y > H + 16 || e.x < -24 || e.x > W + 24 || (e.y < -40 && d.shown)) e.destroy();
      else if (e.y >= 0) d.shown = true;
    }
  }

  // Driller: slides in from its side, lines up with the ship (shaking, its drill
  // flickering), then rams straight across. Returns true if it left the screen.
  private updateDriller(e: Phaser.Physics.Arcade.Sprite, d: EnemyData, dt: number) {
    const edge = d.dir > 0 ? 12 : W - 12;
    if (d.step === 0) {
      e.x += d.dir * 50 * dt;
      if ((d.dir > 0 && e.x >= edge) || (d.dir < 0 && e.x <= edge)) { e.x = edge; d.step = 1; }
    } else if (d.step === 1) {
      d.hold -= dt * 1000;
      const gap = this.player.y - e.y;
      e.y += Phaser.Math.Clamp(gap, -45 * dt, 45 * dt);
      e.x = edge + (Math.floor(d.t * 30) % 2 ? 1 : -1);
      if (Math.floor(d.t * 12) % 2) e.setTintFill(0xfc7460);
      else e.clearTint();
      if (d.hold <= 0) { d.step = 2; e.clearTint(); }
    } else {
      e.x += d.dir * 170 * dt;
    }
    if ((d.dir > 0 && e.x > W + 20) || (d.dir < 0 && e.x < -20)) { e.destroy(); return true; }
    return false;
  }

  // Lancer: parks, locks onto where the ship is with a blinking warning line,
  // then fires a beam down that line. After three beams it pulls back up.
  private updateLancer(e: Phaser.Physics.Arcade.Sprite, d: EnemyData, dt: number, firing: boolean) {
    const ms = dt * 1000;
    if (d.step >= 3 && d.charge <= 0 && d.beam <= 0) {
      e.y -= 40 * dt;
      d.leaving = true;
      return false;
    }
    if (e.y < d.stopY) { e.y += 45 * dt; return false; }
    const nose = { x: e.x, y: e.y + 7 };
    if (d.beam > 0) {
      d.beam -= ms;
      this.drawBeam(nose.x, nose.y, d.aim, 3, 0xd800cc);
      if (firing && this.laserHits(nose.x, nose.y, d.aim, 2.5)) this.hurt();
      if (d.beam <= 0) { d.step++; d.fireIn = 1600; }
    } else if (d.charge > 0) {
      d.charge -= ms;
      if (Math.floor(d.charge / 90) % 2 === 0) this.drawBeam(nose.x, nose.y, d.aim, 1, 0xf878f8, 0.7);
      if (d.charge <= 0) d.beam = 320;
    } else {
      // Drift toward the ship between shots.
      e.x += Phaser.Math.Clamp(this.player.x - e.x, -18 * dt, 18 * dt);
      if (d.fireIn <= 0 && firing) {
        const tg = this.aimTarget(false);
        d.aim = Phaser.Math.Angle.Between(nose.x, nose.y, tg.x, tg.y);
        d.charge = LANCER_WARN;
        if (this.state.level === 4) this.tipOnce('lancer', 'DODGE THE LINE');
      }
    }
    return false;
  }

  // Phantom: slips into place cloaked (shots pass through it), decloaks, fires
  // three aimed shots, then cloaks and moves again. After three rounds it leaves.
  private updatePhantom(e: Phaser.Physics.Arcade.Sprite, d: EnemyData, dt: number, firing: boolean) {
    d.hold -= dt * 1000;
    if (d.cloaked) {
      e.setAlpha(Math.floor(d.t * 20) % 6 === 0 ? 0.3 : 0.1);
      if (d.step >= 3) { e.y -= 50 * dt; d.leaving = true; return; }
      e.y += Phaser.Math.Clamp(d.stopY - e.y, -45 * dt, 45 * dt);
      e.x += Phaser.Math.Clamp(d.baseX - e.x, -60 * dt, 60 * dt);
      if (d.hold <= 0) {
        d.cloaked = false;
        d.hold = 1500;
        d.fireIn = 450;
        d.charge = 3; // shots left this round
        e.setAlpha(1);
        this.flash(e);
      }
      return;
    }
    if (d.fireIn <= 0 && d.charge > 0 && firing) {
      d.charge--;
      d.fireIn = 170;
      this.enemyShoot(e.x, e.y + 5);
    }
    if (d.hold <= 0) {
      d.cloaked = true;
      d.step++;
      d.hold = 1500;
      d.baseX = Phaser.Math.Clamp(this.player.x + Phaser.Math.Between(-50, 50), 14, W - 14);
      d.stopY = Phaser.Math.Between(44, 110);
    }
  }

  // A straight laser from (x, y) at `angle`, to the edge of the screen unless
  // `len` cuts it short.
  drawBeam(x: number, y: number, angle: number, width: number, color: number, alpha = 1, len = 420) {
    const g = this.beams;
    g.lineStyle(width, color, alpha);
    g.lineBetween(x, y, x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    if (width > 1) {
      g.lineStyle(1, 0xfcfcfc, alpha);
      g.lineBetween(x, y, x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    }
  }

  // Whether an enemy laser from (x, y) hits the ship. Energy Redirect soaks it
  // up instead, counting each laser (by where it comes from) once.
  laserHits(x: number, y: number, angle: number, reach: number, len = Infinity) {
    if (!this.beamHits(x, y, angle, reach, len)) return false;
    if (this.time.now >= this.redirectUntil) return true;
    const key = `${Math.round(x / 4)},${Math.round(y / 4)}`;
    if (!this.redirectLasers.has(key)) { this.redirectLasers.add(key); this.soak(this.player.x, this.player.y - 4); }
    return false;
  }

  // Whether the ship is within `reach` px of a beam's center line.
  beamHits(x: number, y: number, angle: number, reach: number, len = Infinity) {
    const px = this.player.x - x, py = this.player.y - y;
    const along = px * Math.cos(angle) + py * Math.sin(angle);
    if (along < 0 || along > len) return false;
    return Math.abs(-px * Math.sin(angle) + py * Math.cos(angle)) <= reach;
  }

  // How far a beam from (x, y) at `angle` gets before a wreck stops it.
  beamStop(x: number, y: number, angle: number) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let best = 420;
    for (const h of this.hazards.getChildren() as Phaser.Physics.Arcade.Image[]) {
      if (!h.active || h.getData('kind') !== 'debris' || !h.body) continue;
      // Ray against the wreck's box (slab method).
      const b = h.body;
      let t0 = 0, t1 = best;
      for (const [o, d, lo, hi] of [[x, dx, b.x, b.x + b.width], [y, dy, b.y, b.y + b.height]]) {
        if (Math.abs(d) < 1e-6) { if (o < lo || o > hi) { t0 = Infinity; break; } continue; }
        const a = (lo - o) / d, c = (hi - o) / d;
        t0 = Math.max(t0, Math.min(a, c));
        t1 = Math.min(t1, Math.max(a, c));
      }
      if (t0 <= t1 && t0 < best) best = t0;
    }
    return best;
  }

  // What aimed enemy shots go for: a Decoy Flare while one burns, sometimes
  // an ally wingman (they draw some fire), otherwise the ship.
  aimTarget(spread = true): { x: number; y: number } {
    if (this.flare && this.time.now < this.flareUntil) return this.flare;
    const allies = this.allies.filter((a) => a.img.visible);
    if (spread && allies.length && Math.random() < 0.25) return Phaser.Utils.Array.GetRandom(allies).img;
    return this.player;
  }

  // Fires at `angle`, or at the player (see aimTarget) if no angle is given.
  enemyShoot(x: number, y: number, angle?: number, speed = this.bulletSpeed()) {
    const b = this.enemyBullets.create(x, y, 'ebullet') as Phaser.Physics.Arcade.Image;
    b.setDepth(9.8); // shows over spore clouds and the dark
    b.body!.setCircle(1.5, 0.5, 0.5);
    const tg = angle === undefined ? this.aimTarget() : null;
    const a = angle ?? Phaser.Math.Angle.Between(x, y, tg!.x, tg!.y);
    this.physics.velocityFromRotation(a, speed, b.body!.velocity as Phaser.Math.Vector2);
  }

  // Thrown by Rockjaw: a breakable rock aimed at the ship.
  throwBoulder(x: number, y: number) {
    const e = this.spawnEnemy('boulder', x, y);
    e.body!.setCircle(6, 1, 1);
    const a = Phaser.Math.Angle.Between(x, y, this.player.x, this.player.y) + Phaser.Math.FloatBetween(-0.15, 0.15);
    this.physics.velocityFromRotation(a, 58, e.body!.velocity as Phaser.Math.Vector2);
  }

  // --- Hazards ---------------------------------------------------------------

  // This segment's hazards: its own list if the level has one per segment.
  private hazardList(): HazardSpec[] {
    return this.level.segmentHazards?.[this.segment] ?? this.level.hazards ?? [];
  }

  // How far through this segment's waves the level is, 0..1, by their delays.
  private segProgress() {
    const waves = this.level.segments[this.segment] ?? [];
    const total = waves.reduce((n, w) => n + w.delay, 0);
    if (this.waveIndex >= waves.length || total <= 0) return 1;
    let done = Math.min(this.waveTimer, waves[this.waveIndex].delay);
    for (let i = 0; i < this.waveIndex; i++) done += waves[i].delay;
    return done / total;
  }

  private stormNow() {
    const total = (this.level.segments[this.segment] ?? []).reduce((n, w) => n + w.delay, 0);
    return stormPlan(this.segment, this.segProgress(), total);
  }

  // Storm Eye's storm sets off the same lightning and embers as the hazard timers.
  stormStrike() { this.spawnStrike(); }
  stormEmber() { this.sideHaz.spawn('ember'); }

  hasHazard(kind: string) {
    return this.hazardList().some((hz) => hz.kind === kind);
  }

  private resetHazardTimers(first: number) {
    this.hazardIn = this.hazardList().map((_hz, i) => first + i * 2500);
  }

  private runHazards(dt: number) {
    if (this.boss && !this.level.bossHazards) return;
    if (this.storm) { this.storm.run(dt, this.stormNow()); return; }
    this.hazardList().forEach((hz, i) => {
      this.hazardIn[i] -= dt * 1000;
      if (this.hazardIn[i] > 0) return;
      // A ramping hazard comes more and more often through the segment.
      this.hazardIn[i] = Phaser.Math.Between(...hz.every) / (1 + ((hz.ramp ?? 1) - 1) * this.segProgress());
      if (hz.kind === 'patch') this.spawnPatch();
      else if (hz.kind === 'turret') this.edgeTurret();
      else if (hz.kind === 'lightning') this.spawnStrike();
      else if (hz.kind === 'flare') this.spawnFlare();
      else if (hz.kind === 'fence') this.spawnFence();
      else if (hz.kind === 'debris' || hz.kind === 'satchunk' || hz.kind === 'rock' || hz.kind === 'shard') this.spawnHazard(hz.kind, Phaser.Math.Between(16, W - 16), -14);
      else if (hz.kind === 'barrier' || hz.kind === 'growth') this.barriers.spawn(hz.kind === 'barrier');
      else if (['press', 'gust', 'ember', 'blackout', 'sweep'].includes(hz.kind)) this.sideHaz.spawn(hz.kind);
      else this.act3.spawn(hz.kind);
    });
  }

  // Maw Gate: enemies warp into the top half at set points through a segment,
  // and every so often through part of one (see LevelDef.warps).
  private runWarps(dt: number) {
    const plan = this.level.warps;
    if (!plan || this.boss) return;
    const prog = this.segProgress();
    plan.at.forEach((w, i) => {
      if (w.seg !== this.segment || this.warpsDone.has(i) || prog < w.p) return;
      this.warpsDone.add(i);
      this.warps.open(w.big ? 8 : 4, !!w.big);
    });
    const ev = plan.every;
    if (!ev || ev.seg !== this.segment || prog >= ev.until) return;
    // The gap shrinks from `start` to `end` as the run goes on.
    const gap = () => Phaser.Math.Linear(Phaser.Math.Between(...ev.start), Phaser.Math.Between(...ev.end), prog / ev.until);
    if (this.warpIn === null) { this.warpIn = gap(); return; }
    this.warpIn -= dt * 1000;
    if (this.warpIn > 0) return;
    this.warpIn = gap();
    this.warps.open(4, false);
  }

  private spawnHazard(kind: 'debris' | 'satchunk' | 'rock' | 'shard' | 'pebble' | 'shelter', x: number, y: number) {
    const tex = kind === 'debris' ? Phaser.Utils.Array.GetRandom(['debris1', 'debris2'])
      : kind === 'satchunk' ? Phaser.Utils.Array.GetRandom(['satchunk1', 'satchunk2']) : kind;
    const h = this.hazards.create(x, y, tex) as Phaser.Physics.Arcade.Image;
    // Satellite chunks act like wrecks: they block shots and searchlights.
    h.setData('kind', kind === 'satchunk' ? 'debris' : kind);
    if (kind === 'satchunk') {
      // Slow, so there's time to tuck in under one when a searchlight swings.
      h.setScale(1.5).setVelocity(Phaser.Math.Between(-4, 4), Phaser.Math.Between(14, 19));
      h.body!.setSize(h.width - 4, h.height - 2);
    } else if (kind === 'shelter') {
      // A big rock that can't be broken: its shadow is the shelter from a flare.
      h.setVelocity(0, 30);
      h.body!.setCircle(12, h.width / 2 - 12, h.height / 2 - 12);
    } else if (kind === 'debris') {
      h.setVelocity(Phaser.Math.Between(-6, 6), Phaser.Math.Between(20, 28));
      h.body!.setSize(h.width - 6, h.height - 4);
      if (this.state.level === 2) this.tipOnce('debris', 'WRECKS BLOCK SHOTS');
    } else if (kind === 'shard') {
      // Falls fast and slanted; one shot shatters it.
      h.setData('hp', 1);
      h.setVelocity(Phaser.Math.Between(-18, 18), Phaser.Math.Between(70, 95));
      h.setRotation(Math.atan2(h.body!.velocity.y, h.body!.velocity.x) - Math.PI / 2);
      h.body!.setSize(3, 6);
    } else {
      h.setData('hp', kind === 'rock' ? 6 : 2);
      h.setVelocity(Phaser.Math.Between(-10, 10), Phaser.Math.Between(30, 45));
      h.setAngularVelocity(Phaser.Math.Between(-60, 60));
      h.body!.setCircle(kind === 'rock' ? 7 : 3, kind === 'rock' ? 2 : 1, kind === 'rock' ? 1 : 1);
      if (kind === 'rock' && this.state.level === 3) this.tipOnce('rock', 'SHOOT ROCKS OR DODGE');
    }
    return h;
  }

  // An ice shard thrown or shed by Frostjaw, flying at (vx, vy) px/s.
  iceShard(x: number, y: number, vx: number, vy: number) {
    const h = this.spawnHazard('shard', x, y);
    h.setVelocity(vx, vy);
    h.setRotation(Math.atan2(vy, vx) - Math.PI / 2);
    return h;
  }

  // An ice sheet drifting down with the ring. Drawn under everything that flies.
  private spawnPatch() {
    this.patches.push(this.add.image(Phaser.Math.Between(30, W - 30), -20, 'icepatch').setDepth(1).setAlpha(0.6));
  }

  // A capital ship gun leans in from one edge, blinks, fires a burst at the
  // ship, and pulls back. It can't be shot.
  private edgeTurret() {
    const left = Math.random() < 0.5;
    const y = Phaser.Math.Between(70, H - 90);
    const out = left ? -6 : W + 6;
    const t = this.add.image(out, y, 'eturret').setFlipX(!left).setDepth(9);
    if (this.state.level === 5) this.tipOnce('turret', 'WATCH THE EDGES');
    this.tweens.chain({
      targets: t,
      tweens: [
        { x: left ? 4 : W - 4, duration: 350, ease: 'Quad.easeOut' },
        { alpha: 0.3, duration: 110, yoyo: true, repeat: 3 },
        {
          alpha: 1, duration: 520, onStart: () => {
            for (let i = 0; i < 3; i++) {
              this.time.delayedCall(i * 170, () => {
                if (t.active && this.phase === 'action') this.enemyShoot(t.x + (left ? 6 : -6), t.y);
              });
            }
          },
        },
        { x: out, duration: 400, ease: 'Quad.easeIn' },
      ],
      onComplete: () => t.destroy(),
    });
  }

  // Lightning: a column flashes, then a bolt strikes down it. Often it picks
  // the ship's column, so standing still isn't safe.
  private spawnStrike() {
    const near = Math.random() < 0.6;
    const x = near ? Phaser.Math.Clamp(this.player.x + Phaser.Math.Between(-12, 12), 10, W - 10) : Phaser.Math.Between(10, W - 10);
    this.strikes.push({ x, t: 0 });
    if (this.state.level === 7) this.tipOnce('lightning', 'MOVE WHEN A\nCOLUMN FLASHES');
  }

  private updateStrikes(dt: number) {
    const g = this.beams;
    for (const st of this.strikes.slice()) {
      st.t += dt * 1000;
      if (st.t < STRIKE_WARN) {
        if (Math.floor(st.t / 110) % 2 === 0) g.fillStyle(0xfc7460, 0.22).fillRect(st.x - 6, 0, 12, H);
        continue;
      }
      if (st.t > STRIKE_WARN + STRIKE_HIT) { this.strikes.splice(this.strikes.indexOf(st), 1); continue; }
      // A jagged bolt, redrawn every frame so it crackles.
      let x = st.x;
      for (const [w, col] of [[3, 0xf8b800], [1, 0xfcfcfc]] as const) {
        g.lineStyle(w, col, 1);
        x = st.x;
        g.beginPath();
        g.moveTo(x, 0);
        for (let y = 12; y <= H; y += 12) { x = st.x + Phaser.Math.Between(-4, 4); g.lineTo(x, y); }
        g.strokePath();
      }
      if (this.phase === 'action' && Math.abs(this.player.x - st.x) < 6) this.hurt();
    }
  }

  // Solar flare: a shelter rock drifts in first, then the flare sweeps down the
  // screen. Anywhere but the shadow straight under the rock gets burned.
  private spawnFlare() {
    const rock = this.spawnHazard('shelter', Phaser.Math.Between(40, W - 40), -16);
    this.flares.push({ rock, t: 0, sweepY: -20 });
  }

  private inShadow(rock: Phaser.Physics.Arcade.Image, x: number, y: number) {
    return rock.active && y > rock.y && Math.abs(x - rock.x) < rock.width / 2 - 4;
  }

  private updateFlares(dt: number) {
    const g = this.beams;
    let glow = 0;
    for (const f of this.flares.slice()) {
      f.t += dt * 1000;
      const r = f.rock;
      const half = r.width / 2 - 4;
      if (f.t > 900 && f.sweepY < H && r.active) {
        // The shadow: a dark lane under the rock, where the flare can't reach.
        g.fillStyle(0x000000, 0.45).fillRect(r.x - half, r.y + 6, half * 2, H - r.y);
      }
      if (f.t < FLARE_WARN) {
        if (f.t > 900) {
          glow = Math.max(glow, 0.06 + 0.06 * Math.sin(f.t / 70));
          if (this.state.level === 6) this.tipOnce('flare', 'FLARE COMING!\nHIDE UNDER THE ROCK');
        }
        continue;
      }
      f.sweepY += 240 * dt;
      glow = Math.max(glow, 0.18);
      // The flare front: a band of fire with a gap where the rock's shadow is.
      const y = f.sweepY;
      for (const [hh, col, a] of [[16, 0xd82800, 0.5], [8, 0xf8b800, 0.8], [3, 0xfcfcfc, 1]] as const) {
        g.fillStyle(col, a);
        if (r.active && y > r.y) {
          g.fillRect(0, y - hh / 2, r.x - half, hh);
          g.fillRect(r.x + half, y - hh / 2, W - r.x - half, hh);
        } else g.fillRect(0, y - hh / 2, W, hh);
      }
      if (this.phase === 'action' && Math.abs(this.player.y - y) < 7 && !this.inShadow(r, this.player.x, this.player.y)) this.hurt();
      if (f.sweepY > H + 12) this.flares.splice(this.flares.indexOf(f), 1);
    }
    this.flareGlow.setFillStyle(0xf8b800, glow);
  }

  // Laser fence: two posts at the screen edges scroll down with a beam between
  // them that blinks off, flickers a warning, then switches on. Cross while it's off.
  private spawnFence() {
    const posts = [this.add.image(3, -6, 'fencepost').setDepth(9), this.add.image(W - 3, -6, 'fencepost').setDepth(9).setFlipX(true)];
    this.fences.push({ y: -6, t: 0, posts });
    if (this.state.level === 8) this.tipOnce('fence', 'CROSS THE FENCE\nWHEN IT IS OFF');
  }

  private updateFences(dt: number) {
    const g = this.beams;
    const [off, warn, on] = FENCE_CYCLE;
    for (const f of this.fences.slice()) {
      f.y += 30 * dt;
      f.t = (f.t + dt * 1000) % (off + warn + on);
      f.posts.forEach((p) => p.setY(f.y));
      if (f.y > H + 10) {
        f.posts.forEach((p) => p.destroy());
        this.fences.splice(this.fences.indexOf(f), 1);
        continue;
      }
      if (f.t < off) {
        g.fillStyle(0x3c3c3c, 1);
        for (let x = 6; x < W - 6; x += 4) g.fillRect(x, f.y, 1, 1);
      } else if (f.t < off + warn) {
        if (Math.floor(f.t / 60) % 2) g.fillStyle(0xd82800, 0.8).fillRect(6, f.y, W - 12, 1);
      } else {
        g.fillStyle(0xd82800, 0.7).fillRect(6, f.y - 1, W - 12, 3);
        g.fillStyle(0xfcfcfc, 1).fillRect(6, f.y, W - 12, 1);
        if (this.phase === 'action' && Math.abs(this.player.y - f.y) < 4) this.hurt();
      }
    }
  }

  private clearTimedHazards(keepScenery = false) {
    this.strikes = [];
    this.flares = [];
    this.fences.forEach((f) => f.posts.forEach((p) => p.destroy()));
    this.fences = [];
    this.flareGlow.setFillStyle(0xf8b800, 0);
    this.act3.clear();
    this.barriers.clear();
    this.sideHaz.clear(keepScenery);
    this.warps.clear();
  }

  private hitHazard(b: Phaser.Physics.Arcade.Image, h: Phaser.Physics.Arcade.Image) {
    if (!b.active || !h.active || b.getData('fx') === 'wave') return; // the Wave Beam passes through cover
    const dmg = (b.getData('dmg') as number) ?? 1;
    b.destroy();
    this.plasmaSplash(b);
    if (h.getData('kind') === 'debris' || h.getData('kind') === 'shelter') { this.tink(b.x, b.y); return; }
    const hp = (h.getData('hp') as number) - dmg;
    h.setData('hp', hp);
    if (hp > 0) { this.flash(h); return; }
    this.sparks.explode(8, h.x, h.y);
    if (h.getData('kind') === 'rock') {
      // Big rocks split into two small ones that fan apart.
      for (const side of [-1, 1]) {
        const p = this.spawnHazard('pebble', h.x + side * 4, h.y);
        p.setVelocity(side * Phaser.Math.Between(18, 30), (h.body!.velocity.y ?? 30) + 6);
      }
    } else if (Math.random() < 0.15) {
      this.dropCoin(h.x, h.y, Phaser.Math.Between(2, 3));
    }
    h.destroy();
  }

  // --- Gear ------------------------------------------------------------------

  // Called at the start and again after a vendor stop, where gear may have changed.
  private setupGear(levelStart = true) {
    const s = this.state;
    this.resetCrates(levelStart);
    this.sats.forEach((sat) => sat.destroy());
    this.sats = [];
    this.deflect = 0;
    this.deflectRing.setVisible(false);
    if (hasGear(s, 'deflector')) this.deflect = gearStats.deflector(gearLevel(s, 'deflector')).hits;
    if (hasGear(s, 'satellite')) {
      const n = gearStats.satellite(gearLevel(s, 'satellite')).drones;
      for (let i = 0; i < n; i++) this.sats.push(this.add.image(0, 0, 'sat').setDepth(10));
    }
  }

  // Energy Redirect: while it soaks, travelling enemy shots near the ship bend
  // in toward it, and a pink ring and a count show around the ship. Then it lets
  // go: a beam straight up hurting everything in its path by the count times
  // `mult`, exactly, and a blast that wipes enemy shots around the ship.
  private updateRedirect(dt: number) {
    this.drawRedirectGlow();
    if (!this.redirectUntil) return;
    const st = gearStats.redirect(gearLevel(this.state, 'redirect'));
    const p = this.player;
    if (this.time.now < this.redirectUntil && this.phase === 'action') {
      for (const b of this.enemyBullets.getChildren() as Phaser.Physics.Arcade.Image[]) {
        if (!b.body) continue;
        const d = Phaser.Math.Distance.Between(b.x, b.y, p.x, p.y);
        if (d > st.reach || d < 1) continue;
        // Damped like a vortex, so pulled shots don't slingshot past; once free they
        // get their speed back over a second (see updateVortices).
        if (b.getData('vSpeed') == null) b.setData('vSpeed', b.body.velocity.length());
        const slow = Math.exp(-st.damp * dt);
        b.body.velocity.x = (b.body.velocity.x + ((p.x - b.x) / d) * st.pull * dt) * slow;
        b.body.velocity.y = (b.body.velocity.y + ((p.y - b.y) / d) * st.pull * dt) * slow;
        if (b.body.velocity.length() < 1) b.body.velocity.setLength(1);
        b.setData('relT', 0).setData('heldAt', this.game.loop.frame);
      }
      const k = (this.time.now % 400) / 400;
      this.beams.lineStyle(1, 0xf878f8, 0.6 * (1 - k)).strokeCircle(p.x, p.y, 8 + k * 6);
      this.beams.lineStyle(1, 0xf878f8, 0.15).strokeCircle(p.x, p.y, st.reach);
      // The soaked-up count over the ship, flashing over the last REDIRECT_WARN ms.
      if (SHOW_REDIRECT_COUNT) {
        this.redirectText ??= text(this, 0, 0, '', '#f878f8').setOrigin(0.5, 1).setDepth(20);
        const left = this.redirectUntil - this.time.now;
        this.redirectText.setText(`${this.redirectCount}`).setPosition(p.x, p.y - 10)
          .setVisible(left > REDIRECT_WARN || Math.floor(left / 90) % 2 === 0);
      }
      return;
    }
    // Gathering is over: a blast wipes the enemy shots around the ship right
    // away, and whatever it soaked up is held until a tap fires the beam.
    this.redirectUntil = 0;
    this.redirectText?.destroy();
    this.redirectText = null;
    if (this.phase !== 'action') return;
    // A filled pink disc the size of the blast pulses out once, and each shot it
    // clears pops into small pink bits. It clears the whole radius at once, and
    // any shot that touches the disc while it shows.
    const disc = this.add.circle(p.x, p.y, st.radius, 0xf878f8, 0.5).setDepth(12).setScale(0.5);
    const wipe = (r: number) => {
      this.impact.setParticleTint([0xfcfcfc, 0xf878f8, 0xf878f8]);
      for (const b of this.enemyBullets.getChildren().slice() as Phaser.Physics.Arcade.Image[]) {
        const c = b.body ? b.body.center : b;
        if (Phaser.Math.Distance.Between(c.x, c.y, disc.x, disc.y) <= r + 1.5) { this.impact.explode(5, c.x, c.y); b.destroy(); }
      }
    };
    wipe(st.radius);
    const sweep = () => { if (disc.alpha > 0.15) wipe(Math.max(st.radius, st.radius * disc.scale)); };
    this.tweens.chain({ targets: disc, tweens: [
      { scale: 1.08, duration: 110, ease: 'Quad.easeOut', onUpdate: sweep },
      { scale: 1, alpha: 0, duration: 170, ease: 'Quad.easeIn', onUpdate: sweep },
    ], onComplete: () => disc.destroy() });
    this.redirectHeld = this.redirectCount > 0;
    if (this.redirectHeld) this.tipOnce('redirectTap', 'TAP TO FIRE');
  }

  // A soft pink glow under the ship, faint and half its size at first, growing
  // and brightening with each shot soaked up to its fullest at REDIRECT_FULL,
  // bright in the middle and fading out. It pulses, faster while held.
  private drawRedirectGlow() {
    const g = this.redirectGlow;
    g.clear();
    if ((!this.redirectUntil && !this.redirectHeld) || this.phase !== 'action') return;
    const st = gearStats.redirect(gearLevel(this.state, 'redirect'));
    const f = this.redirectFill();
    const pulse = 1 + 0.12 * Math.sin(this.time.now / (this.redirectHeld ? 90 : 160));
    const r = Phaser.Math.Linear(st.glowMin, st.glowMax, f) * pulse;
    const a = 0.15 + f * 0.45;
    const { x, y } = this.player;
    const RINGS = 10;
    for (let i = 0; i < RINGS; i++) {
      const k = 1 - i / RINGS; // outer to inner
      g.fillStyle(0xf878f8, a * 0.22).fillCircle(x, y, r * k);
    }
    g.fillStyle(0xfcfcfc, a * 0.6).fillCircle(x, y, Math.max(1.5, r * 0.25));
  }

  // How far Energy Redirect's count is from 1 shot (0) to REDIRECT_FULL (1), for its glow and beam.
  private redirectFill() {
    return Phaser.Math.Clamp((this.redirectCount - 1) / (REDIRECT_FULL - 1), 0, 1);
  }

  // Lets the held Energy Redirect go: the beam straight up.
  private fireRedirect() {
    this.redirectHeld = false;
    const st = gearStats.redirect(gearLevel(this.state, 'redirect'));
    const p = this.player;
    // The beam.
    const dmg = this.redirectCount * st.mult;
    if (dmg <= 0) return;
    const x = p.x, top = p.y - 6, w = Phaser.Math.Linear(st.widthMin, st.widthMax, this.redirectFill()), core = Math.max(1, Math.round(w * 0.375));
    const beam = this.add.graphics().setDepth(12);
    beam.fillStyle(0xf878f8, 0.7).fillRect(x - w / 2, 0, w, top);
    beam.fillStyle(0xfcfcfc, 1).fillRect(x - core / 2, 0, core, top);
    this.tweens.add({ targets: beam, alpha: 0, duration: 350, onComplete: () => beam.destroy() });
    for (const e of this.enemies.getChildren().slice() as Phaser.Physics.Arcade.Sprite[]) {
      if (!e.active || e.y > top || e.y < -10 || Math.abs(e.x - x) > w / 2 + e.displayWidth / 2) continue;
      this.damageEnemy(e, dmg, null);
    }
    // Bosses take it from a fast shot up the same line (see shotDamage); other enemies let it pass.
    if (this.boss) this.setFx(this.shot(x, top, 'bullet', 0, 1800, dmg, 'kinetic'), 'redirect').setVisible(false);
  }

  // A shot or laser soaked up by Energy Redirect.
  private soak(x: number, y: number) {
    this.redirectCount++;
    this.impact.setParticleTint([0xfcfcfc, 0xf878f8, 0xf878f8]);
    this.impact.explode(3, x, y);
  }

  // Shot Radar. A line ahead of each enemy shot flying straight, once it is
  // close; a near miss is a shot that came within `near` px of the hitbox and
  // went on by without hitting. They add up to rewards until a hit.
  private updateRadar() {
    const g = this.radarGfx;
    g.clear();
    if (!hasGear(this.state, 'radar') || this.phase !== 'action') { this.nearText?.setVisible(false); return; }
    const lv = gearLevel(this.state, 'radar');
    const st = gearStats.radar(lv);
    const p = this.player;
    // The near-miss count rides below the ship, small.
    this.nearText ??= text(this, 0, 0, '0', RADAR_TEAL, 6).setOrigin(0.5, 0).setDepth(20);
    this.nearText.setVisible(true).setPosition(p.x, p.y + 8);
    const lines = RADAR.lines > 0 && lv >= RADAR.linesFrom;
    // The hitbox, and a shot's reach (its radius) beyond it.
    const hb = p.body as Phaser.Physics.Arcade.Body;
    const cx = hb.center.x, cy = hb.center.y, hw = hb.halfWidth, hh = hb.halfHeight;
    const SHOT_R = 1.5;
    const boxDist = (x: number, y: number) => Math.hypot(Math.max(0, Math.abs(x - cx) - hw), Math.max(0, Math.abs(y - cy) - hh));
    for (const b of this.enemyBullets.getChildren() as Phaser.Physics.Arcade.Image[]) {
      if (!b.active || !b.body) continue;
      const bx = b.body.center.x, by = b.body.center.y;
      const d = boxDist(bx, by);
      // Near-miss bookkeeping: inside the zone it's pending; leaving it without a hit counts.
      if (d <= SHOT_R) b.setData('nearHit', true);
      else if (d <= SHOT_R + st.near) b.setData('nearIn', true);
      else if (b.getData('nearIn') && !b.getData('nearHit') && !b.getData('nearDone')) {
        b.setData('nearDone', true);
        this.nearMiss();
      }
      // The line: only for a shot flying straight (the same heading as last frame, not in a vortex).
      const v = b.body.velocity;
      const speed = v.length();
      const head = Math.atan2(v.y, v.x);
      const last = b.getData('radarHead') as number | undefined;
      b.setData('radarHead', head);
      if (!lines || last === undefined || speed < 1 || b.getData('vSpeed') != null) continue;
      if (Math.abs(Phaser.Math.Angle.Wrap(head - last)) > 0.002) continue;
      if (Phaser.Math.Distance.Between(bx, by, cx, cy) > st.lineDist) continue;
      const ux = v.x / speed, uy = v.y / speed;
      let color = 0xfcfcfc, alpha = 0.15;
      if (lv >= RADAR.colorFrom) {
        // Closest the shot comes to the hitbox along its path ahead.
        const along = Math.max(0, (cx - bx) * ux + (cy - by) * uy);
        let best = Infinity;
        for (let t = Math.max(0, along - 12); t <= along + 12; t += 0.5) best = Math.min(best, boxDist(bx + ux * t, by + uy * t));
        if (best <= SHOT_R) { color = 0xd82800; alpha = 0.25; }
        else if (best <= SHOT_R + st.near) { color = 0x00e8d8; alpha = 0.25; }
      }
      const len = 400;
      g.lineStyle(1, color, alpha).lineBetween(bx, by, bx + ux * len, by + uy * len);
    }
  }

  private nearMiss() {
    const n = ++this.nearMisses;
    const now = this.time.now;
    const p = this.player;
    if (this.nearText) {
      this.nearText.setText(`${n}`).setScale(1.3);
      this.tweens.add({ targets: this.nearText, scale: 1, duration: 150 });
    }
    const say = (msg: string) => {
      const t = text(this, p.x, p.y - 14, msg, RADAR_TEAL).setOrigin(0.5).setDepth(950);
      this.tweens.add({ targets: t, y: t.y - 12, alpha: 0, duration: 900, onComplete: () => t.destroy() });
    };
    if (n % RADAR.creditsEvery === 0) {
      let v = RADAR.credits + (n / RADAR.creditsEvery - 1) * RADAR.creditsStep;
      if (this.replay) v = Math.max(1, Math.round(v * REPLAY_PAY));
      this.state.credits += v;
      this.earned += v;
      this.sparkle(p.x, p.y, 'ingot3');
      this.refreshHud();
      say(`+${v}`);
    }
    // A 360 burst from the ship itself (no pod), as strong as that gear's level.
    if (n >= RADAR.burstEvery && n % RADAR.burstEvery === 0) {
      const lv = Math.min(5, 1 + Math.floor((n - RADAR.burstEvery) / RADAR.burstStep));
      this.radarBurst(lv);
    }
    if (n % RADAR.overdriveEvery === 0) { this.radarOverdriveUntil = now + ITEMS.overdrive.tune!.time; say('OVERDRIVE'); }
    if (n % RADAR.invulnEvery === 0) { this.invulnUntil = Math.max(this.invulnUntil, now + RADAR.invulnMs); say('INVULNERABLE'); }
    if (n % RADAR.holeEvery === 0) {
      this.vortices.push({ x: W / 2, y: H / 2, t: 0, life: RADAR.holeMs, pull: RADAR.holePull, reach: RADAR.holeReach, damp: 1.5, spread: 16, hole: true });
      say('BLACK HOLE');
    }
  }

  private resetNearMisses() {
    this.nearMisses = 0;
    this.nearText?.setText('0');
  }

  // Shot Radar's 360 burst: the 360 Burst pod's rings at a level, fired from wherever the ship is.
  private radarBurst(lv: number) {
    const st = gearStats.burst(lv);
    const p = this.player;
    const ring = () => {
      if (this.phase !== 'action') return;
      for (let i = 0; i < st.shots; i++) this.shot(p.x, p.y, 'pellet', (i / st.shots) * 360, 220, st.damage, 'kinetic');
    };
    ring();
    for (let k = 1; k < st.bursts; k++) this.time.delayedCall(k * st.gap, ring);
    this.time.delayedCall((st.bursts - 1) * st.gap, () => {
      if (this.phase !== 'action') return;
      if (st.blastRadius > 0) this.splash(p.x, p.y, st.blastRadius, st.blastDamage, 'explosive', null);
      const t = ITEMS.cluster.tune!;
      for (let i = 0; i < st.bombs; i++) {
        this.setFx(this.shot(p.x, p.y, 'bomblet', (i / st.bombs) * 360, 160, t.damage, 'explosive'), 'bomb').setData('splash', t.splash);
      }
    });
  }

  private updateGear(dt: number) {
    const s = this.state;
    const now = this.time.now;
    const flying = this.phase === 'action' || this.phase === 'ready';
    const p = this.player;
    // A net flickers out over its last half second.
    const net = this.snaredUntil - now;
    this.netImg.setVisible(flying && net > 0 && p.visible && (net > 500 || Math.floor(now / 80) % 2 === 0))
      .setPosition(p.x, p.y);

    // Deflector: charges come back one at a time.
    if (hasGear(s, 'deflector')) {
      const st = gearStats.deflector(gearLevel(s, 'deflector'));
      if (this.deflect < st.hits && now >= this.deflectAt) {
        this.deflect++;
        if (this.deflect < st.hits) this.deflectAt = now + st.recharge;
      }
      this.deflectRing.setVisible(flying && this.deflect > 0 && p.visible)
        .setPosition(p.x, p.y).setAlpha(this.deflect > 1 ? 0.8 : 0.45);
    }

    // Credit Magnet: drops inside the radius drift to the ship.
    if (hasGear(s, 'magnet') && this.phase === 'action') {
      const st = gearStats.magnet(gearLevel(s, 'magnet'));
      for (const c of this.coins.getChildren() as Phaser.Physics.Arcade.Image[]) {
        if (!c.body?.enable) continue;
        const dist = Phaser.Math.Distance.Between(c.x, c.y, p.x, p.y);
        if (dist > st.radius) continue;
        const a = Phaser.Math.Angle.Between(c.x, c.y, p.x, p.y);
        c.setVelocity(Math.cos(a) * st.pull, Math.sin(a) * st.pull);
      }
    }

    // Satellites circle the ship and fire straight up.
    if (this.sats.length) {
      const st = gearStats.satellite(gearLevel(s, 'satellite'));
      this.sats.forEach((sat, i) => {
        const a = (now / 1000) * 3 + (i * Math.PI * 2) / this.sats.length;
        sat.setPosition(p.x + Math.cos(a) * 15, p.y + Math.sin(a) * 11);
        sat.setVisible(flying && p.scale === 1);
      });
      this.satTimer -= dt * 1000;
      if (this.phase === 'action' && this.satTimer <= 0) {
        this.satTimer = st.interval;
        for (const sat of this.sats) this.shot(sat.x, sat.y - 3, 'satshot', 0, 260, st.damage, 'kinetic');
      }
    }

    // Anti-Missile: zaps an enemy shot or seeker, picking ones level with the
    // ship and ahead of it well before ones behind. At level 5 the zap arcs on
    // from the first to the nearest other one.
    if (hasGear(s, 'antimissile') && this.phase === 'action') {
      const st = gearStats.antimissile(gearLevel(s, 'antimissile'));
      this.antiTimer -= dt * 1000;
      if (this.antiTimer <= 0) {
        const seekers = (this.enemies.getChildren() as Phaser.Physics.Arcade.Sprite[]).filter((e) => (e.getData('e') as EnemyData).kind === 'seeker');
        const all = [...(this.enemyBullets.getChildren() as Phaser.GameObjects.Image[]), ...seekers]
          .filter((o) => o.active && Phaser.Math.Distance.Between(o.x, o.y, p.x, p.y) < st.radius);
        // Lower is sooner: sideways distance counts as is, ahead a little more, behind three times.
        const rank = (o: Phaser.GameObjects.Image) => Math.abs(o.x - p.x) + (o.y < p.y ? (p.y - o.y) * 1.3 : (o.y - p.y) * 3);
        const first = all.sort((a, b) => rank(a) - rank(b))[0];
        if (first) {
          this.antiTimer = st.interval;
          const chain = [first];
          if (st.targets > 1) {
            const dist = (o: Phaser.GameObjects.Image) => Phaser.Math.Distance.Between(o.x, o.y, first.x, first.y);
            const second = all.filter((o) => o !== first && dist(o) < st.radius).sort((a, b) => dist(a) - dist(b))[0];
            if (second) chain.push(second);
          }
          let from = { x: p.x, y: p.y };
          for (const o of chain) {
            this.zaps.push({ x1: from.x, y1: from.y, x2: o.x, y2: o.y, t: 90, color: 0xfcfcfc });
            this.sparks.explode(3, o.x, o.y);
            from = { x: o.x, y: o.y };
            o.destroy();
          }
        }
      }
    }

    // Repair Drone: heals 1 every 4 s while it lasts.
    if (this.healDrone) {
      const a = now / 300;
      this.healDrone.setPosition(p.x + Math.cos(a) * 12, p.y - 10 + Math.sin(a) * 3).setVisible(flying);
      if (now >= this.healUntil) { this.healDrone.destroy(); this.healDrone = null; }
      else if (now >= this.healAt && this.phase === 'action') {
        this.healAt = now + ITEMS.drone.tune!.every;
        if (this.health < this.maxHp) {
          this.health = Math.min(this.maxHp, this.health + Math.round(ITEMS.drone.tune!.heal));
          this.refreshHud();
          this.flash(this.healDrone);
        }
      }
    }

    // Afterburner flame, a little bigger each level, and Barrel Roll spin.
    if (now < this.burnUntil && flying) {
      const lv = Math.max(1, gearLevel(this.state, 'afterburner'));
      const fw = Math.round(4 + (lv - 1) * 0.5), fh = Math.round(4 + (lv - 1) * 1.5) + Math.floor(now / 40) % 3;
      this.beams.fillStyle(Math.floor(now / 50) % 2 ? 0xf8b800 : 0xd82800, 1).fillRect(Math.round(p.x - fw / 2), p.y + 7, fw, fh);
    }
    if (now < this.rollUntil) p.setScale(Math.cos(((this.rollUntil - now) / 260) * Math.PI * 2), 1);
    else if (this.phase === 'action' && p.scaleX !== 1 && p.scaleY === 1) p.setScale(1);

    this.drawGearCooldowns();
  }

  // --- Allies (levels 11 to 14) ------------------------------------------------

  // Wingmen fly in formation off the ship's wings and fire with it: Vex the
  // Raider fires laser bursts, freed Vossari fire chaining ion bolts and
  // homing plasma. A third flies point, ahead of the ship, so it stays clear
  // of the item bar. They stay with the ship through vendor stops and level ends.
  private setupAllies() {
    const n = this.level.allies ?? 0;
    const slots: [string, number, number, AllyKind][] = [['vex', -24, 10, 'vex'], ['ally', 24, 10, 'ion'], ['ally2', 0, -26, 'plasma']];
    for (const [tex, ox, oy, kind] of slots.slice(0, n)) {
      const img = this.add.image(this.player.x + ox, H + 20, tex).setDepth(9.9);
      this.allies.push({ img, ox, oy, fireIn: Phaser.Math.Between(200, 600), kind, burst: 0 });
    }
  }

  // Each wingman's own gun.
  private allyFire(a: Ally) {
    const { x, y } = a.img;
    if (a.kind === 'vex') {
      // Bursts of three lasers, fanning a little.
      if (a.burst <= 0) a.burst = 3;
      a.burst--;
      a.fireIn = a.burst > 0 ? 90 : 1000;
      this.shot(x, y - 6, 'laser', (1 - a.burst) * 4, 400, 0.6, 'laser');
    } else if (a.kind === 'ion') {
      // A bolt that stuns and jumps on to two more enemies.
      a.fireIn = 800;
      this.shot(x, y - 6, 'allyion', 0, 300, 0.9, 'ion').setData('chain', true).setData('stun', 300);
    } else {
      // A slow homing blob that splashes.
      a.fireIn = 1200;
      this.setFx(this.shot(x, y - 6, 'allyplasma', 0, 190, 1.8, 'plasma'), 'homing').setData('splash', 10).setScale(1.3);
    }
  }

  private updateAllies(dt: number) {
    const p = this.player;
    // Through a vendor stop, the rift and a level end they copy the ship's
    // moves: the line-up, the barrel rolls, the sink and the climb away.
    const escort = this.phase === 'arrival' || this.phase === 'clear';
    const flying = escort || this.phase === 'action' || this.phase === 'ready';
    for (const a of this.allies) {
      a.img.setVisible(flying);
      if (!flying) { a.img.setPosition(p.x + a.ox, H + 20); continue; }
      let tx = Phaser.Math.Clamp(p.x + a.ox, 8, W - 8);
      let ty = Phaser.Math.Clamp(p.y + a.oy, 30, H - 20);
      if (escort) {
        // Closing in as the ship shrinks into the station, and no clamping, so they can leave the screen.
        const sc = Math.abs(p.scaleY);
        tx = p.x + a.ox * sc;
        ty = p.y + a.oy * sc;
        a.img.setScale(p.scaleX, p.scaleY).setAlpha(p.alpha).setAngle(p.angle);
      } else if (a.img.scaleY !== 1 || a.img.alpha !== 1) a.img.setScale(1).setAlpha(1).setAngle(0);
      const k = Math.min(1, (escort ? 8 : 3) * dt);
      a.img.x += (tx - a.img.x) * k;
      a.img.y += (ty - a.img.y) * k;
      a.fireIn -= dt * 1000;
      if (this.phase === 'action' && a.fireIn <= 0) this.allyFire(a);
      // Enemy shots that hit a wingman are soaked up.
      for (const b of this.enemyBullets.getChildren().slice() as Phaser.GameObjects.Image[]) {
        if (Math.abs(b.x - a.img.x) < 5 && Math.abs(b.y - a.img.y) < 5) { b.destroy(); this.flash(a.img); }
      }
    }
  }

  // --- Combat ----------------------------------------------------------------

  // A weapon's damage type after augments: Ion Coating turns lasers to ion.
  weaponType(id: WeaponId): DType {
    const t = WEAPONS[id].dtype;
    return t === 'laser' && hasGear(this.state, 'ioncoat') ? 'ion' : t;
  }

  // One player shot. `deg` is degrees from straight up.
  // `lv` is the weapon's level, which sets how hard its hits look.
  private shot(x: number, y: number, texture: string, deg: number, speed: number, dmg: number, dtype: DType, lv = 1) {
    const b = this.playerBullets.create(x, y, texture) as Phaser.Physics.Arcade.Image;
    b.setData('dmg', dmg).setData('dtype', dtype).setData('t', 0);
    this.shotInfo.set(b, { dmg, dtype, blob: texture === 'blob', lv });
    const rad = Phaser.Math.DegToRad(deg - 90);
    b.setVelocity(Math.cos(rad) * speed, Math.sin(rad) * speed);
    b.setRotation(Phaser.Math.DegToRad(deg));
    return b;
  }

  // A shot's special behavior, kept in its data and in shotInfo (for bosses,
  // which read it after destroying the shot).
  private setFx(b: Phaser.Physics.Arcade.Image, fx: string) {
    const info = this.shotInfo.get(b);
    if (info) info.fx = fx;
    return b.setData('fx', fx);
  }

  private autoFire(dt: number) {
    const s = this.state;
    // An Overdrive Cell and Shot Radar's overdrive each multiply the fire rate, so together they stack.
    const rate = ITEMS.overdrive.tune!.rate;
    const fast = (this.time.now < this.overdriveUntil ? rate : 1) * (this.time.now < this.radarOverdriveUntil ? rate : 1);
    s.weapons.forEach((id, slot) => {
      if (!id) return;
      const def = WEAPONS[id];
      const stats = weaponStats(s, id);
      const lv = weaponLevel(s, id);
      this.fireTimers[slot] = (this.fireTimers[slot] ?? 0) - dt * 1000;
      // Rear Guard in the gear slot of the same number fires a copy backward.
      const rear = s.gear[slot] === 'rear' ? gearStats.rear(gearLevel(s, 'rear')).damage : 0;
      // The Rail Lance glows at the nose while it charges.
      if (def.fx === 'rail' && this.fireTimers[slot] < 380 && this.fireTimers[slot] > 0) {
        const k = 1 - this.fireTimers[slot] / 380;
        this.beams.fillStyle(0xa4e4fc, 0.5 + k * 0.5).fillCircle(this.player.x, this.player.y - 8, 1 + k * 2);
        if (rear) this.beams.fillCircle(this.player.x, this.player.y + 8, 1 + k * 2);
      }
      if (this.fireTimers[slot] > 0) return;
      this.fireTimers[slot] = stats.interval / fast;
      // The Overcharger makes every few volleys a charged one.
      this.volleys[slot] = (this.volleys[slot] ?? 0) + 1;
      const charged = hasGear(s, 'overcharge') && this.volleys[slot] % gearStats.overcharge(gearLevel(s, 'overcharge')).every === 0;
      const dtype = this.weaponType(id);
      const incend = dtype === 'kinetic' && hasGear(s, 'incendiary') ? gearLevel(s, 'incendiary') : 0;
      // Ion Arc stuns from level 3, longer at 4 and 5; Ion Coating stuns with lasers.
      const stun = def.dtype === 'laser' && hasGear(s, 'ioncoat') ? gearStats.ioncoat(gearLevel(s, 'ioncoat')).stun
        : def.fx === 'arc' ? ionStun(lv) : 0;
      const splash = stats.splash ?? def.splash;
      const volley = (deg: number, dx: number, i: number, dmg: number) => {
        // Shots leave from the nose, or the tail if they fly backward. Side
        // Winders all leave from the ship's middle, so each side fans from one point.
        const dy = def.fx === 'seek' ? 0 : Math.abs(deg) > 90 ? 7 : -7;
        const b = this.shot(this.player.x + dx, this.player.y + dy, shotTexture(def, lv), deg, stats.speed ?? def.speed ?? 300, dmg, dtype, lv);
        if (def.fx) this.setFx(b, def.fx);
        if (splash) b.setData('splash', splash + (hasGear(s, 'shaped') ? gearStats.shaped(gearLevel(s, 'shaped')).splash : 0));
        if (stats.splashDamage) b.setData('splashDmg', stats.splashDamage * (charged ? 3 : 1));
        if (incend) { b.setData('incend', incend); this.shotInfo.get(b)!.incend = incend; }
        if (stun) b.setData('stun', stun);
        if (stun && def.fx === 'arc') b.setData('stunChance', ionStunChance(lv));
        if (def.fx === 'pierce' || def.fx === 'rail') b.setData('hits', new Set());
        if (def.fx === 'wave') b.setData('ox', b.x).setData('phase', i % 2 ? Math.PI : 0);
        if (def.fx === 'arc') b.setData('life', arcLife(lv));
        if (def.fx === 'seek') b.setData('dir', Phaser.Math.DegToRad(deg - 90));
        if (charged) b.setScale(1.6).setTint(0xfcfcfc);
      };
      const dmg = stats.damage * (charged ? 3 : 1);
      stats.shots.forEach((sh, i) => {
        volley(sh.deg, sh.dx, i, dmg);
        if (rear) volley(180 - sh.deg, -sh.dx, i, dmg * rear);
      });
      if (def.fx === 'rail') {
        this.zaps.push({ x1: this.player.x, y1: this.player.y - 8, x2: this.player.x, y2: -10, t: 110, color: 0xa4e4fc });
        if (rear) this.zaps.push({ x1: this.player.x, y1: this.player.y + 8, x2: this.player.x, y2: H + 10, t: 110, color: 0xa4e4fc });
      }
    });
  }

  // Shots that steer, weave, burst or fade as they fly.
  private updateShots(dt: number) {
    for (const b of this.playerBullets.getChildren().slice() as Phaser.Physics.Arcade.Image[]) {
      if (!b.active || !b.body) continue;
      const t = (b.getData('t') as number ?? 0) + dt;
      b.setData('t', t);
      // Incendiary Ammo: a few hot pixels glow at the nose, more each level.
      const incend = b.getData('incend') as number | undefined;
      if (incend) this.drawGlow(b, incend);
      switch (b.getData('fx')) {
        case 'homing':
        case 'latch': {
          // Missiles and Bio Seeker spores turn toward the nearest enemy.
          const tg = this.nearestTarget(b.x, b.y);
          if (tg) this.steer(b, tg, (b.getData('fx') === 'homing' ? atLv(WEAPONS.homing.tune!.turn, this.shotInfo.get(b)?.lv ?? 1) : 2) * dt);
          break;
        }
        case 'seek': {
          // Side Winder missiles only chase enemies in a cone off their own side.
          const tg = this.nearestTarget(b.x, b.y, b.getData('dir') as number, 0.8);
          if (tg) this.steer(b, tg, atLv(WEAPONS.side.tune!.turn, this.shotInfo.get(b)?.lv ?? 1) * dt);
          break;
        }
        case 'wave':
          b.x = (b.getData('ox') as number) + Math.sin(t * 14 + (b.getData('phase') as number)) * atLv(WEAPONS.wave.tune!.weave, this.shotInfo.get(b)?.lv ?? 1);
          break;
        case 'arc':
          if (t > ((b.getData('life') as number) ?? arcLife(1))) b.destroy();
          else b.setAlpha(Math.floor(t * 40) % 2 ? 1 : 0.6);
          break;
        case 'flak':
          if (t * 1000 > atLv(WEAPONS.flak.tune!.fuse, this.shotInfo.get(b)?.lv ?? 1)) this.flakBurst(b, null);
          break;
        case 'shrap':
          if (t > 0.35) b.destroy();
          break;
        case 'tick':
          if (t > 0.05) b.destroy();
          break;
        case 'bomb':
          if (t > BOMB_FUSE) this.blast(b);
          break;
      }
    }
  }

  // Where a missile should head: the nearest enemy that can be hit, or the boss.
  // With `dir` (radians), only targets within `cone` radians either side of it count.
  private nearestTarget(x: number, y: number, dir?: number, cone = Math.PI) {
    const inCone = (tx: number, ty: number) =>
      dir === undefined || Math.abs(Phaser.Math.Angle.Wrap(Phaser.Math.Angle.Between(x, y, tx, ty) - dir)) <= cone;
    let best: { x: number; y: number } | null = null;
    let bestD = 160;
    for (const e of this.enemies.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
      const d = e.getData('e') as EnemyData;
      if (d.cloaked || e.y < 0 || ['mine', 'bomb', 'pmine', 'boulder'].includes(d.kind)) continue;
      const dist = Phaser.Math.Distance.Between(x, y, e.x, e.y);
      if (dist < bestD && inCone(e.x, e.y)) { bestD = dist; best = e; }
    }
    const boss = this.boss?.aimPoint?.() ?? null;
    return best ?? (boss && inCone(boss.x, boss.y) ? boss : null);
  }

  // Turns a shot toward a target by up to `turn` radians, keeping its speed.
  private steer(b: Phaser.Physics.Arcade.Image, tg: { x: number; y: number }, turn: number) {
    const v = b.body!.velocity;
    const speed = Math.hypot(v.x, v.y);
    const a = Phaser.Math.Angle.RotateTo(Math.atan2(v.y, v.x), Phaser.Math.Angle.Between(b.x, b.y, tg.x, tg.y), turn);
    b.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed);
    b.setRotation(a + Math.PI / 2);
  }

  // A Flak Cannon shell bursting into shrapnel, fanned around the way it was
  // flying. Shrapnel skips `ignore`, the enemy a direct hit already struck.
  private flakBurst(b: Phaser.Physics.Arcade.Image, ignore: unknown) {
    const lv = this.shotInfo.get(b)?.lv ?? 1;
    const t = WEAPONS.flak.tune!;
    const dmg = (b.getData('dmg') as number) * atLv(t.shrapDamage, lv);
    const v = b.body!.velocity;
    const heading = Phaser.Math.RadToDeg(Math.atan2(v.y, v.x)) + 90;
    // 120 degrees of shrapnel, spaced evenly.
    const n = Math.max(1, Math.round(atLv(t.shrapnel, lv)));
    for (let i = 0; i < n; i++) {
      const p = this.shot(b.x, b.y, 'shrap', heading + (n > 1 ? -60 + (i * 120) / (n - 1) : 0), 200, dmg, 'explosive', lv);
      this.setFx(p, 'shrap');
      if (ignore) p.setData('ignore', ignore);
    }
    this.sparks.explode(5, b.x, b.y);
    b.destroy();
  }

  // Incendiary Ammo's glow: 1 to 4 hot pixels just ahead of the shot, flickering.
  private drawGlow(b: Phaser.Physics.Arcade.Image, lv: number) {
    const v = b.body!.velocity;
    const sp = Math.hypot(v.x, v.y) || 1;
    const ux = v.x / sp, uy = v.y / sp;
    const nose = b.displayHeight / 2;
    const n = 1 + Math.floor((lv + 1) / 2) + (lv >= 5 ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const c = i === 0 ? 0xfce0a8 : Math.random() < 0.5 ? 0xf8b800 : 0xe45c10;
      const side = i === 0 ? 0 : (i % 2 ? 1 : -1);
      const px = b.x + ux * (nose - (i > 0 ? 1 : 0)) - uy * side;
      const py = b.y + uy * (nose - (i > 0 ? 1 : 0)) + ux * side;
      this.beams.fillStyle(c, i === 0 ? 1 : 0.6 + Math.random() * 0.4).fillRect(Math.round(px), Math.round(py), 1, 1);
    }
  }

  flash(o: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite) {
    if (this.blobHitAt === this.time.now) { this.plasmaFlash(o); return; }
    o.setTintFill(0xffffff);
    this.time.delayedCall(50, () => o.active && this.restTint(o));
  }

  // Back to normal after a flash: no tint, or a side mission boss's own color.
  restTint(o: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite) {
    const base = o.getData('baseTint') as number | undefined;
    if (base) o.setTint(base);
    else o.clearTint();
  }

  // A Plasma Lobber hit: the target flashes white and green a few times.
  private plasmaFlash(o: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite) {
    [0xffffff, 0x58d854, 0xffffff, 0x58d854].forEach((c, i) => this.time.delayedCall(i * 45, () => o.active && o.setTintFill(c)));
    this.time.delayedCall(180, () => o.active && this.restTint(o));
  }

  // Green goo spraying off whatever a Plasma Lobber blob hits.
  private plasmaSplash(b: Phaser.GameObjects.Image, x = b.x, y = b.y) {
    if (!this.shotInfo.get(b)?.blob) return false;
    this.goo.explode(9, x, y);
    return true;
  }

  // A shot that can't hurt what it hit: a small gray spark.
  tink(x: number, y: number) {
    this.sparks.explode(2, x, y);
  }

  // Damage after weaknesses and resistances, Shaped Charges and the Target Scanner.
  // The Nullifier sets all of that aside for its own flat boost.
  typedDamage(dmg: number, dtype: DType | null, taken: Taken) {
    if (!dtype) return dmg;
    if (hasGear(this.state, 'nullifier')) return dmg * gearStats.nullifier(gearLevel(this.state, 'nullifier')).damage;
    let m = typeMultiplier(dtype, taken);
    if (m < 1 && dtype === 'explosive' && hasGear(this.state, 'shaped')) m = 1;
    if (m > 1 && hasGear(this.state, 'scanner')) m *= 1 + gearStats.scanner(gearLevel(this.state, 'scanner')).bonus;
    return dmg * m;
  }

  // A hit's impact: sparks in the shot's damage color, more and faster as the
  // weapon levels up, and from level 2 a flash ring that grows with it.
  private hitFx(b: Phaser.GameObjects.Image) {
    const info = this.shotInfo.get(b);
    const lv = info?.lv ?? 1;
    const color = DTYPE_COLOR[info?.dtype ?? 'kinetic'];
    this.impact.setParticleTint([0xfcfcfc, color, color]);
    this.impact.setParticleSpeed(20 + lv * 14, 50 + lv * 26);
    this.impact.explode(1 + lv * 2, b.x, b.y);
    if (lv >= 2 && this.pops.length < 40) this.pops.push({ x: b.x, y: b.y, t: 0, lv, color });
  }

  // Sparkles where a credit is picked up, in its metal, more and bigger for a pile.
  private sparkle(x: number, y: number, key: string) {
    const st = GLITTER[key] ?? GLITTER.ingot1;
    for (let i = 0; i < st.n; i++) {
      const a = (i / st.n) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.4, 0.4);
      const sp = st.speed * Phaser.Math.FloatBetween(0.5, 1);
      this.glitter.push({
        x: x + Phaser.Math.Between(-2, 2), y: y + Phaser.Math.Between(-2, 2), vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        t: -i * 25, life: Phaser.Math.Between(320, 480), size: st.size, color: st.colors[i % st.colors.length],
      });
    }
  }

  // Each sparkle is a little four-point star that swells, twinkles and shrinks away.
  private drawGlitter(dt: number) {
    const g = this.beams;
    for (const s of this.glitter.slice()) {
      s.t += dt * 1000;
      if (s.t < 0) continue;
      if (s.t >= s.life) { this.glitter.splice(this.glitter.indexOf(s), 1); continue; }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.92;
      s.vy *= 0.92;
      const k = s.t / s.life;
      const arm = Math.round(s.size * Math.sin(k * Math.PI));
      if (Math.floor(s.t / 60) % 3 === 2) continue; // twinkle
      const x = Math.round(s.x), y = Math.round(s.y);
      g.fillStyle(s.color, 1).fillRect(x - arm, y, arm * 2 + 1, 1).fillRect(x, y - arm, 1, arm * 2 + 1);
      if (s.size >= 3 && arm >= 2) g.fillStyle(0xfcfcfc, 1).fillRect(x - 1, y - 1, 3, 3);
      else g.fillStyle(0xfcfcfc, 1).fillRect(x, y, 1, 1);
    }
  }

  private drawPops(dt: number) {
    const g = this.beams;
    for (const p of this.pops.slice()) {
      p.t += dt * 1000;
      const life = 60 + p.lv * 25;
      if (p.t >= life) { this.pops.splice(this.pops.indexOf(p), 1); continue; }
      const k = p.t / life;
      const r = 1.5 + p.lv * 1.4 * (0.4 + k);
      g.lineStyle(p.lv >= 5 ? 2 : 1, p.color, 1 - k).strokeCircle(p.x, p.y, r);
      if (p.lv >= 4 && k < 0.5) g.fillStyle(0xfcfcfc, 1 - k * 2).fillCircle(p.x, p.y, p.lv - 2.5);
    }
  }

  // What a player shot does to a boss part that takes damage like this.
  shotDamage(b: Phaser.GameObjects.Image, taken: Taken) {
    const info = this.shotInfo.get(b);
    const fx = info?.fx;
    if (fx === 'redirect') return info!.dmg; // exactly what Energy Redirect soaked up
    if (fx !== 'tick') {
      if (this.plasmaSplash(b)) this.blobHitAt = this.time.now;
      this.hitFx(b);
      this.incendHit(b, null);
      if (fx === 'latch') this.bioLatch(null, b);
    }
    // Cluster bomblets hit bosses half as hard as other enemies.
    const dmg = (info?.dmg ?? 1) * (fx === 'bomb' ? ITEMS.cluster.tune!.bossShare : 1) + this.scorch(b);
    return this.typedDamage(dmg, info?.dtype ?? 'kinetic', taken);
  }

  private hitEnemy(b: Phaser.Physics.Arcade.Image, e: Phaser.Physics.Arcade.Sprite) {
    if (!b.active || !e.active) return;
    const d = e.getData('e') as EnemyData;
    if (d.cloaked) return; // shots pass through a cloaked Phantom
    const fx = b.getData('fx');
    if (fx === 'tick' || fx === 'redirect' || b.getData('ignore') === e) return; // Bio Seeker boss ticks; Energy Redirect's boss shot; flak shrapnel past its first target
    const lv = this.shotInfo.get(b)?.lv ?? 1;
    const dtype = (b.getData('dtype') as DType) ?? 'kinetic';
    let dmg = (b.getData('dmg') as number) ?? 1;
    // A Flak Cannon shell hit before it bursts: harder each level, with a small
    // blast that grows. At level 5 it bursts there, sparing the enemy it hit.
    if (fx === 'flak') {
      dmg *= 1 + 0.25 * (lv - 1);
      const ring = this.add.circle(b.x, b.y, 2 + lv, 0xf8b800, 0.6).setDepth(12);
      this.tweens.add({ targets: ring, alpha: 0, scale: 1.4, duration: 100 + lv * 20, onComplete: () => ring.destroy() });
      this.sparks.explode(2 + lv, b.x, b.y);
    }
    // What the hit does beyond its damage, read before the shot is destroyed
    // below (destroying it clears its data).
    const splash = b.getData('splash') as number | undefined;
    const splashDmg = b.getData('splashDmg') as number | undefined;
    const stun = b.getData('stun') as number | undefined;
    const stunChance = b.getData('stunChance') as number | undefined;
    const incend = b.getData('incend') as number | undefined;
    const chain = fx === 'arc' || !!b.getData('chain');
    // Piercing shots hit each enemy once and fly on.
    const hits = b.getData('hits') as Set<unknown> | undefined;
    if (hits) {
      if (hits.has(e)) return;
      hits.add(e);
    } else if (fx === 'bomb') {
      this.blast(b);
      return;
    } else if (fx === 'flak' && lv >= 5) this.flakBurst(b, e);
    else b.destroy();
    dmg += this.scorch(b);
    // A Bulwark's shield takes shots from below until it breaks. Ion breaks it fast.
    if (d.shieldImg && b.y > e.y) {
      d.shield -= dmg * (dtype === 'ion' ? 3 : 1);
      if (d.shield > 0) { this.flash(d.shieldImg); this.tink(b.x, b.y); return; }
      this.sparks.explode(12, d.shieldImg.x, d.shieldImg.y);
      d.shieldImg.destroy();
      d.shieldImg = null;
      return;
    }
    if (stun && !ENEMY_STATS[d.kind].organic && rollStun(stunChance)) d.stun = Math.max(d.stun, stun);
    if (incend) {
      const st = gearStats.incendiary(incend);
      if (st.burnTime) { d.burn = Math.max(d.burn, st.burnTime); d.burnDmg = st.burn; d.burnTick = Math.min(d.burnTick || 400, 400); }
    }
    const dead = this.damageEnemy(e, dmg, dtype);
    this.hitFx(b);
    this.incendHit(b, dead ? null : e);
    if (fx === 'latch' && !dead) this.bioLatch(e, b);
    if (this.plasmaSplash(b, (b.x + e.x) / 2, (b.y + e.y) / 2) && !dead) this.plasmaFlash(e);
    if (chain) this.chainArc(e, dmg, dtype, stun ?? 0, lv, stunChance);
    if (splash) this.splash(e.x, e.y, splash, splashDmg ?? dmg / 2, dtype, dead ? null : e);
  }

  // Incendiary Ammo's scorch: extra damage on each hit, as plasma's share of it.
  private scorch(b: Phaser.GameObjects.Image) {
    const lv = this.shotInfo.get(b)?.incend;
    return lv ? gearStats.incendiary(lv).scorch : 0;
  }

  // Incendiary Ammo's hit: embers fly out and a small flame smoulders where
  // it hit, riding along on `on` if the enemy lived. More of both each level.
  private incendHit(b: Phaser.GameObjects.Image, on: Phaser.GameObjects.Sprite | null) {
    const lv = this.shotInfo.get(b)?.incend;
    if (!lv) return;
    this.embers.setParticleSpeed(20 + lv * 8, 40 + lv * 16);
    this.embers.explode(2 + lv * 2, b.x, b.y);
    if (this.flames.length < 30) {
      this.flames.push({ on, ox: on ? b.x - on.x : b.x, oy: on ? b.y - on.y : b.y, t: 0, life: 250 + lv * 120, lv });
    }
  }

  private drawFlames(dt: number) {
    const g = this.beams;
    for (const f of this.flames.slice()) {
      f.t += dt * 1000;
      if (f.t >= f.life || (f.on && !f.on.active)) { this.flames.splice(this.flames.indexOf(f), 1); continue; }
      const x = Math.round(f.on ? f.on.x + f.ox : f.ox);
      const y = Math.round(f.on ? f.on.y + f.oy : f.oy);
      const k = 1 - f.t / f.life;
      const h = Math.max(1, Math.round((1 + f.lv * 0.6) * k + Math.random()));
      g.fillStyle(0xe45c10, 0.9 * k).fillRect(x - 1, y - h + 1, 3, h);
      g.fillStyle(0xf8b800, k).fillRect(x, y - h, 1, h);
      if (f.lv >= 3) g.fillStyle(0xfce0a8, k).fillRect(x, y - Math.floor(h / 2), 1, 1);
    }
  }

  // Bio Seeker: a spore that hits clings on and burns for a while. Each enemy
  // (or the boss, null) holds level + 1 at most (the Tuner's cling);
  // another knocks the oldest off.
  private bioLatch(e: Phaser.Physics.Arcade.Sprite | null, b: Phaser.GameObjects.Image) {
    const info = this.shotInfo.get(b);
    const lv = info?.lv ?? 1;
    const anchor = e ?? this.bossAnchor();
    if (!anchor) return;
    const mine = this.latches.filter((l) => l.on === e);
    const t = WEAPONS.bio.tune!;
    if (mine.length >= Math.round(atLv(t.cling, lv))) this.dropLatch(mine[0]);
    const img = this.add.image(b.x, b.y, 'sporeshot').setDepth(11).setTint(0x58d854);
    this.latches.push({
      on: e, ox: b.x - anchor.x, oy: b.y - anchor.y, img, left: atLv(t.burnTime, lv), tick: 250,
      dps: (info?.dmg ?? 1) * atLv(t.burn, lv), lv,
    });
  }

  private bossAnchor() {
    return this.boss?.aimPoint?.() ?? this.boss?.center?.() ?? null;
  }

  private dropLatch(l: Latch) {
    this.latches.splice(this.latches.indexOf(l), 1);
    this.goo.explode(3, l.img.x, l.img.y);
    l.img.destroy();
  }

  private updateLatches(dt: number) {
    for (const l of this.latches.slice()) {
      const anchor = l.on ? (l.on.active ? l.on : null) : this.bossAnchor();
      l.left -= dt * 1000;
      if (!anchor || l.left <= 0) { this.dropLatch(l); continue; }
      l.img.setPosition(anchor.x + l.ox, anchor.y + l.oy).setAlpha(l.left < 400 ? 0.5 : 0.75 + Math.sin(l.left / 60) * 0.25);
      l.tick -= dt * 1000;
      if (l.tick > 0) continue;
      l.tick += 250;
      if (l.on) this.damageEnemy(l.on, l.dps * 0.25, 'plasma');
      else {
        // Bosses take hits through their own shot checks: a still, unseen shot
        // where the spore clings, gone next frame if nothing takes it.
        const t = this.shot(l.img.x, l.img.y, 'px', 0, 0, l.dps * 0.25, 'plasma', 1).setVisible(false);
        this.setFx(t, 'tick');
      }
    }
  }

  // Returns true if the hit killed it.
  private damageEnemy(e: Phaser.Physics.Arcade.Sprite, dmg: number, dtype: DType | null) {
    if (!e.active) return true;
    const d = e.getData('e') as EnemyData;
    d.hp -= this.typedDamage(dmg, dtype, d.taken);
    if (d.hp <= 0) { this.killEnemy(e, true); return true; }
    this.flash(e);
    return false;
  }

  // Explosive splash: everything else within `r` takes `dmg`.
  private splash(x: number, y: number, r: number, dmg: number, dtype: DType, skip: unknown) {
    // A glow that reaches exactly as far as the blast: faint at the edge,
    // stepping brighter toward a hot center.
    const glow = this.add.graphics({ x, y }).setDepth(12);
    glow.fillStyle(0xf8b800, 0.14).fillCircle(0, 0, r);
    glow.fillStyle(0xf8b800, 0.14).fillCircle(0, 0, r * 0.72);
    glow.fillStyle(0xfce0a8, 0.18).fillCircle(0, 0, r * 0.46);
    glow.fillStyle(0xfcfcfc, 0.25).fillCircle(0, 0, r * 0.22);
    this.tweens.add({ targets: glow, alpha: 0, duration: 260, onComplete: () => glow.destroy() });
    for (const o of this.enemies.getChildren().slice() as Phaser.Physics.Arcade.Sprite[]) {
      if (o === skip || !o.active || (o.getData('e') as EnemyData).cloaked) continue;
      if (Phaser.Math.Distance.Between(x, y, o.x, o.y) <= r) this.damageEnemy(o, dmg, dtype);
    }
  }

  // A cluster bomblet going off where it is.
  private blast(b: Phaser.Physics.Arcade.Image) {
    const { x, y } = b;
    const dmg = b.getData('dmg') as number;
    const r = (b.getData('splash') as number) ?? 16;
    b.destroy();
    this.sparks.explode(8, x, y);
    this.splash(x, y, r, dmg, 'explosive', null);
  }

  // Ion Arc: lightning jumps from the target to the nearest enemies (two unless tuned).
  private chainArc(from: Phaser.Physics.Arcade.Sprite, dmg: number, dtype: DType, stun: number, lv: number, stunChance?: number) {
    let at = { x: from.x, y: from.y };
    const done = new Set<unknown>([from]);
    const t = ion();
    const [jumps, jumpRange, jumpDamage] = [Math.round(atLv(t.jumps, lv)), atLv(t.jumpRange, lv), atLv(t.jumpDamage, lv)];
    for (let jump = 0; jump < jumps; jump++) {
      const next = (this.enemies.getChildren() as Phaser.Physics.Arcade.Sprite[])
        .filter((o) => o.active && !done.has(o) && !(o.getData('e') as EnemyData).cloaked
          && Phaser.Math.Distance.Between(at.x, at.y, o.x, o.y) < jumpRange)
        .sort((a, b) => Phaser.Math.Distance.Between(at.x, at.y, a.x, a.y) - Phaser.Math.Distance.Between(at.x, at.y, b.x, b.y))[0];
      if (!next) return;
      done.add(next);
      this.zaps.push({ x1: at.x, y1: at.y, x2: next.x, y2: next.y, t: 120, color: DTYPE_COLOR.ion });
      at = { x: next.x, y: next.y };
      const d = next.getData('e') as EnemyData;
      if (stun && !ENEMY_STATS[d.kind].organic && rollStun(stunChance)) d.stun = Math.max(d.stun, stun);
      this.damageEnemy(next, dmg * jumpDamage, dtype);
    }
  }

  // Lightning lines (Ion Arc, Anti-Missile, Rail Lance), fading out.
  private drawZaps(dt: number) {
    const g = this.beams;
    for (const z of this.zaps.slice()) {
      z.t -= dt * 1000;
      if (z.t <= 0) { this.zaps.splice(this.zaps.indexOf(z), 1); continue; }
      g.lineStyle(z.color === 0xa4e4fc ? 3 : 1, z.color, 1);
      const mx = (z.x1 + z.x2) / 2 + Phaser.Math.Between(-3, 3), my = (z.y1 + z.y2) / 2 + Phaser.Math.Between(-3, 3);
      g.beginPath();
      g.moveTo(z.x1, z.y1);
      g.lineTo(mx, my);
      g.lineTo(z.x2, z.y2);
      g.strokePath();
    }
  }

  // The Target Scanner tags each enemy with a dot per weakness, in that damage type's color.
  private drawScanner() {
    if (!hasGear(this.state, 'scanner') || this.phase !== 'action') return;
    for (const e of this.enemies.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
      const d = e.getData('e') as EnemyData;
      const weak = weakTo(d.taken);
      if (d.cloaked || !weak.length) continue;
      weak.slice(0, 4).forEach((t, i) => {
        this.beams.fillStyle(DTYPE_COLOR[t], 1).fillRect(Math.round(e.x - weak.length * 2 + i * 4), Math.round(e.y - e.height / 2 - 4), 3, 2);
      });
    }
  }

  private killEnemy(e: Phaser.Physics.Arcade.Sprite, drop: boolean, dud = false) {
    if (!e.active) return;
    const d = e.getData('e') as EnemyData;
    this.sparks.explode(10, e.x, e.y);
    const stats = ENEMY_STATS[d.kind];
    if (!this.test) this.state.kills[d.kind] = (this.state.kills[d.kind] ?? 0) + 1;
    if (drop && Math.random() < stats.dropChance) this.dropCoin(e.x, e.y, Math.round(Phaser.Math.FloatBetween(...stats.credits)));
    const { x, y } = e;
    e.destroy();
    // Spore Pods and Husks burst into seekers when shot down.
    if (drop && d.kind === 'spore') for (let i = 0; i < 3; i++) this.spawnEnemy('seeker', x + (i - 1) * 4, y);
    if (drop && (d.kind === 'husk' || SEEDED.has(d.kind))) for (let i = 0; i < 2; i++) this.spawnEnemy('seeker', x + (i ? 5 : -5), y);
    if (d.kind === 'bomb' && !dud) this.bombBurst(x, y);
  }

  // A lit fuse's flashing, which quickens from 5 to 25 flashes a second (times
  // `rate`) as `k` runs from 0 to 1. Returns whether this frame shows lit.
  private fuseLit(d: EnemyData, dt: number, k: number, rate = 1) {
    d.step += dt * rate * (5 + 20 * Phaser.Math.Clamp(k, 0, 1));
    return Math.floor(d.step * 2) % 2 === 1;
  }

  // A Trapper's net mine going off: an energy net that snares the ship if it is close.
  private netBurst(x: number, y: number) {
    const r = 39;
    const ring = this.add.circle(x, y, 4, 0x3cbcfc, 0).setStrokeStyle(1, 0xa4e4fc).setDepth(12);
    this.tweens.add({ targets: ring, radius: r, alpha: 0, duration: 260, onComplete: () => ring.destroy() });
    this.sparks.explode(6, x, y);
    if (this.phase !== 'action' || godMode()) return;
    if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) > r) return;
    this.snaredUntil = this.time.now + NET_TIME;
    this.tipOnce('net', 'NETS SLOW YOUR SHIP');
  }

  // A Bomb going off when shot or on its fuse: the blast hurts the ship if it
  // is close, unless the Afterburner is burning.
  private bombBurst(x: number, y: number) {
    const r = 28;
    const ring = this.add.circle(x, y, r, 0xfc7460, 0.45).setDepth(12);
    this.tweens.add({ targets: ring, alpha: 0, scale: 1.15, duration: 220, onComplete: () => ring.destroy() });
    this.sparks.explode(14, x, y);
    if (this.time.now < this.burnUntil) return;
    if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) <= r) this.hurt();
  }

  // Credits drop as metal bars: bronze, silver, gold, and a stack of gold for big ones.
  // Act 3 drops are worth a little more, and a Credit Booster adds a share.
  dropCoin(x: number, y: number, value: number, vx = Phaser.Math.Between(-10, 10), vy = COIN_FALL) {
    if (this.state.level >= 9) value = Math.round(value * (1 + (this.state.level - 8) * 0.06));
    if (hasGear(this.state, 'booster')) value = Math.round(value * gearStats.booster(gearLevel(this.state, 'booster')).bonus);
    if (this.replay) value = Math.max(1, Math.round(value * REPLAY_PAY));
    const key = value >= 25 ? 'ingot4' : value >= 10 ? 'ingot3' : value >= 5 ? 'ingot2' : 'ingot1';
    const c = this.coins.create(x, y, key) as Phaser.Physics.Arcade.Image;
    c.setData('v', value);
    c.setData('key', key);
    c.setData('glint', Phaser.Math.Between(0, 2000));
    c.setDepth(9.7); // shows in the dark
    c.setVelocity(vx, vy);
    c.body!.setSize(c.width + 6, c.height + 6); // generous pickup radius
    if (this.time.now < this.homeUntil) c.setData('home', true);
    if (this.state.level === 1) this.tipOnce('coin', 'SHIPS DROP CREDITS');
    return c;
  }

  // A credit curving toward the ship: it keeps its momentum, turns harder the
  // closer it gets (so it can't circle the ship), and speeds up as it goes.
  private homeCoin(c: Phaser.Physics.Arcade.Image, dt: number) {
    if (!c.body?.enable) return;
    const p = this.player;
    const dx = p.x - c.x, dy = p.y - c.y;
    const dist = Math.max(1, Math.hypot(dx, dy));
    const v = c.body.velocity;
    const speed = Math.min(240, Math.max(Math.hypot(v.x, v.y), 20) + 110 * dt);
    let a = Math.atan2(dy, dx);
    if (dist > 12) a = Phaser.Math.Angle.RotateTo(Math.atan2(v.y, v.x), a, (1.2 + (1.8 * speed) / dist) * dt);
    c.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed);
  }

  private collect(c: Phaser.Physics.Arcade.Image) {
    if (!c.active) return;
    this.state.credits += c.getData('v') as number;
    this.earned += c.getData('v') as number;
    this.sparkle(c.x, c.y, c.getData('key') as string);
    c.destroy();
    this.refreshHud();
    this.creditsText.setScale(1.3);
    this.tweens.add({ targets: this.creditsText, scale: 1, duration: 150 });
  }

  // An enemy shot reaching the ship. A Barrel Roll sends it back as the ship's own.
  private shotHitShip(b: Phaser.Physics.Arcade.Image) {
    if (!b.active) return;
    if (this.time.now < this.redirectUntil) { this.soak(b.x, b.y); b.destroy(); return; }
    // A level 5 Afterburner burns through enemy shots.
    if (this.time.now < this.burnUntil && gearLevel(this.state, 'afterburner') >= 5) {
      this.sparks.explode(3, b.x, b.y);
      b.destroy();
      return;
    }
    if (this.time.now < this.rollUntil) {
      const v = b.body!.velocity;
      this.shot(b.x, b.y, 'pellet', Phaser.Math.RadToDeg(Math.atan2(-v.y, -v.x)) + 90, 240, 1.5, 'kinetic');
      b.destroy();
      return;
    }
    b.destroy();
    this.hurt();
  }

  // Flying into an enemy. While the Afterburner burns, light enemies (or any
  // the ram can finish) are smashed without a scratch, and bombs and mines
  // are smashed without going off.
  private rammed(e: Phaser.Physics.Arcade.Sprite) {
    const d = e.getData('e') as EnemyData;
    if (d.cloaked) return;
    if (this.time.now < this.burnUntil && this.canRam(d)) { this.killEnemy(e, true, true); return; }
    this.killEnemy(e, false);
    this.hurt();
  }

  // Whether an Afterburner ram destroys this enemy: light ones, bombs and mines,
  // ones with little health left, and from level 5 any of them (bosses aren't
  // enemies here).
  private canRam(d: EnemyData) {
    const lv = gearLevel(this.state, 'afterburner');
    return lv >= 5 || ENEMY_STATS[d.kind].light || DUDS.has(d.kind) || d.hp <= gearStats.afterburner(lv).ram;
  }

  // While the Afterburner burns, a see-through teal layer over every enemy a
  // ram would destroy, and orange over the rest. It blinks over the last
  // stretch of the burn as a warning.
  private drawRamGlow() {
    const left = this.burnUntil - this.time.now;
    const on = left > 0 && this.phase === 'action';
    const blink = left < BURN_WARN && Math.floor(left / BURN_BLINK) % 2 === 1;
    for (const [e, glow] of this.ramGlow) {
      if (on && e.active) continue;
      glow.destroy();
      this.ramGlow.delete(e);
    }
    if (!on) return;
    for (const e of this.enemies.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
      const d = e.getData('e') as EnemyData;
      let glow = this.ramGlow.get(e);
      if (!glow) {
        glow = this.add.image(e.x, e.y, e.texture.key, e.frame.name).setDepth(e.depth + 0.1);
        this.ramGlow.set(e, glow);
      }
      glow.setTexture(e.texture.key, e.frame.name).setPosition(e.x, e.y).setFlip(e.flipX, e.flipY)
        .setRotation(e.rotation).setScale(e.scaleX, e.scaleY).setVisible(e.visible && !d.cloaked && !blink)
        .setTintFill(this.canRam(d) ? 0x00e8d8 : 0xe45c10).setAlpha(0.75);
    }
  }

  // Most hits cost 1 health; big ones like the Dreadnought's laser cost 2.
  hurt(amount = 1) {
    if (this.phase !== 'action' || godMode()) return;
    const now = this.time.now;
    if (now < this.invulnUntil || now < this.shieldUntil) return;
    if (this.deflect > 0) {
      // The Deflector takes the whole hit, then starts recharging.
      const st = gearStats.deflector(gearLevel(this.state, 'deflector'));
      if (this.deflect === st.hits) this.deflectAt = now + st.recharge;
      this.deflect--;
      this.invulnUntil = now + 700;
      this.sparks.explode(10, this.player.x, this.player.y);
      this.flash(this.deflectRing);
      return;
    }
    this.health = Math.max(0, this.health - amount);
    this.invulnUntil = now + 1200;
    this.resetNearMisses();
    this.cameras.main.shake(120, 0.01);
    this.refreshHud();
    if (this.health <= 0) this.die();
  }

  private die() {
    this.phase = 'dead';
    this.sparks.explode(40, this.player.x, this.player.y);
    this.player.setVisible(false);
    this.bubble.setVisible(false);
    this.sats.forEach((sat) => sat.setVisible(false));
    // Combat test: demigod. Blow up, then come straight back with full health.
    if (this.test) {
      this.time.delayedCall(900, () => {
        this.health = this.maxHp;
        this.invulnUntil = this.time.now + 1500;
        this.phase = 'action';
        this.player.setVisible(true);
        this.sats.forEach((sat) => sat.setVisible(true));
        this.refreshHud();
      });
      return;
    }
    // A Rewind Beacon in an item slot restarts from the last vendor stop instead.
    if (this.state.items.some((it) => it?.id === 'rewind')) {
      const save = cloneSave(this.checkpoint.save);
      const start = cloneSave(this.startState);
      for (const s of [save, start]) {
        this.keepLog(s);
        const i = s.items.findIndex((it) => it?.id === 'rewind');
        if (i >= 0 && --s.items[i]!.count <= 0) s.items[i] = null;
      }
      this.time.delayedCall(900, () => {
        text(this, W / 2, H / 2 - 16, 'REWIND BEACON', COLOR.cyan).setOrigin(0.5).setDepth(1000);
        text(this, W / 2, H / 2 + 2, 'BACK TO THE LAST VENDOR', COLOR.gray).setOrigin(0.5).setDepth(1000);
      });
      this.time.delayedCall(2600, () => {
        this.cameras.main.fadeOut(400);
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.restart({ state: start, resume: { save, segment: this.checkpoint.segment, earned: this.checkpoint.earned }, side: this.side ?? undefined, replay: this.replayLevel ?? undefined }));
      });
      return;
    }
    // Items bought and all but a share of the credits picked up this run are
    // lost (DEATH_KEEP); replay from the start.
    const kept = Math.floor(this.earned * DEATH_KEEP);
    const back = cloneSave(this.startState);
    back.credits += kept;
    this.time.delayedCall(900, () => {
      text(this, W / 2, H / 2 - 16, 'SHIP DESTROYED', COLOR.red).setOrigin(0.5).setDepth(1000);
      text(this, W / 2, H / 2 + 2, 'RETURNING TO BASE', COLOR.gray).setOrigin(0.5).setDepth(1000);
      if (kept > 0) text(this, W / 2, H / 2 + 20, `KEPT ${kept} CREDITS`, COLOR.yellow).setOrigin(0.5).setDepth(1000);
    });
    this.time.delayedCall(3000, () => this.leaveTo('Base', back));
  }

  // --- Combat test --------------------------------------------------------------

  // The swords button (waves) and the ship button (equipment) each pause and
  // open the test menu (TestMenuScene) on their panel; the same buttons there
  // switch panels or resume.
  private setupTest() {
    const { y, size } = TEST_BUTTONS;
    (['waves', 'ship'] as TestPanel[]).forEach((panel) => {
      const x = TEST_BUTTONS.x[panel];
      this.add.rectangle(x, y, size, size, 0x000000).setOrigin(0).setDepth(900).setStrokeStyle(1, 0xfcfcfc)
        .setInteractive({ useHandCursor: true }).on('pointerdown', () => this.openTestMenu(panel));
      this.add.image(x + size / 2, y + size / 2, TEST_ICONS[panel]).setDepth(901).setTintFill(0xf8b800);
    });
    this.time.delayedCall(600, () => this.blinkTip('SWORDS: PICK WAVES\nSHIP: PICK LOADOUT'));
  }

  private openTestMenu(panel: TestPanel) {
    if (this.scene.isPaused()) return;
    this.dragFrom = null;
    this.scene.pause();
    this.scene.launch('TestMenu', {
      panel,
      waves: this.test,
      state: this.state,
      equip: (slot: number, id: WeaponId) => this.testEquip(slot, id),
      equipGear: (slot: number, id: GearId) => this.testEquipGear(slot, id),
      equipItem: (slot: number, id: ItemId) => this.testEquipItem(slot, id),
      setLevel: (id: WeaponId, lv: number) => { this.state.weaponLevels[id] = lv; this.fireTimers = []; this.volleys = []; saveTestLoadout(this.state); },
      setGearLevel: (id: GearId, lv: number) => { this.state.gearLevels[id] = lv; this.testGearChanged(); },
      resume: () => { this.scene.stop('TestMenu'); this.scene.resume(); },
      quit: () => { this.scene.stop('TestMenu'); this.scene.start('Title'); },
    });
  }

  // Puts a weapon in a slot. If the other slot has it, the two swap; picking
  // the slot it's already in empties that slot (slot 1 always keeps one).
  private testEquip(slot: number, id: WeaponId) {
    const w = this.state.weapons;
    const other = 1 - slot;
    if (w[slot] === id) { if (slot === 1) w[1] = null; }
    else {
      if (w[other] === id) w[other] = w[slot];
      w[slot] = id;
      if (!w[0]) { w[0] = w[1]; w[1] = null; }
    }
    this.fireTimers = [];
    this.volleys = [];
    this.refreshHud();
    saveTestLoadout(this.state);
  }

  // Gear goes in either slot the same way, and either slot can be emptied.
  private testEquipGear(slot: number, id: GearId) {
    const g = this.state.gear;
    const other = 1 - slot;
    if (g[slot] === id) g[slot] = null;
    else {
      if (g[other] === id) g[other] = g[slot];
      g[slot] = id;
    }
    this.testGearChanged();
  }

  private testGearChanged() {
    this.maxHp = totalMaxHealth(this.state); // Hull Plating
    this.health = this.maxHp;
    this.setupGear();
    this.refreshHud();
    saveTestLoadout(this.state);
  }

  // Items fill their slot with a full stack, and don't run out in test mode.
  private testEquipItem(slot: number, id: ItemId) {
    const it = this.state.items;
    const other = it.findIndex((x) => x?.id === id);
    if (other === slot) it[slot] = null;
    else {
      if (other >= 0) it[other] = it[slot];
      it[slot] = { id, count: itemCap(this.state, id) };
    }
    this.itemReadyAt = [];
    this.refreshHud();
    saveTestLoadout(this.state);
  }

  // --- Boss ------------------------------------------------------------------

  private startBoss(kind: BossKind = this.level.boss!) {
    const warn = text(this, W / 2, H / 2 - 30, 'WARNING', COLOR.red, 16).setOrigin(0.5).setDepth(1000);
    this.tweens.add({ targets: warn, alpha: 0.1, yoyo: true, repeat: 4, duration: 250, onComplete: () => warn.destroy() });
    const done = () => this.bossDefeated(kind);
    this.sighted(kind);
    const make: Record<BossKind, () => Boss> = {
      rockjaw: () => new Rockjaw(this, done),
      dreadnought: () => new Dreadnought(this, done),
      watcher: () => new Watcher(this, done),
      voss: () => new Voss(this, done),
      queen: () => new BroodQueen(this, done),
      mind: () => new HollowMind(this, done),
      sporeheart: () => new Sporeheart(this, done),
      wyrm: () => new Wyrm(this, done),
      frostjaw: () => new Rockjaw(this, done, { skin: 'frostjaw', stats: 'frostjaw', shards: true }),
      hollowwatcher: () => new Watcher(this, done, { tint: 0xd800cc, stats: 'hollowwatcher' }),
      broodmother: () => new BroodQueen(this, done, { tint: 0x58d854, stats: 'broodmother' }),
    };
    this.boss = make[kind]();
    this.bossBar = this.add.graphics().setDepth(900);
    this.bossName = text(this, W / 2, this.boss.armorFraction ? 31 : 28, BOSS_NAMES[kind], COLOR.red).setOrigin(0.5, 0).setDepth(900);
    // The dark lifts a little for the Brood Queen.
    if (this.dark) this.tweens.add({ targets: this.dark, scale: 1.7, alpha: 0.8, duration: 1500 });
  }

  private drawBossBar() {
    const g = this.bossBar;
    if (!g || !this.boss) return;
    g.clear();
    const w = 110;
    g.fillStyle(0x3c3c3c).fillRect(W / 2 - w / 2 - 1, 19, w + 2, 6);
    g.fillStyle(0x000000).fillRect(W / 2 - w / 2, 20, w, 4);
    g.fillStyle(0xd82800).fillRect(W / 2 - w / 2, 20, Math.ceil(w * this.boss.healthFraction()), 4);
    // Armor: a thinner blue bar under the health bar.
    const armor = this.boss.armorFraction?.();
    if (armor === undefined) return;
    g.fillStyle(0x3c3c3c).fillRect(W / 2 - w / 2 - 1, 25, w + 2, 4);
    g.fillStyle(0x000000).fillRect(W / 2 - w / 2, 26, w, 2);
    g.fillStyle(0x3cbcfc).fillRect(W / 2 - w / 2, 26, Math.ceil(w * armor), 2);
  }

  private bossDefeated(kind: BossKind) {
    this.state.kills[kind] = (this.state.kills[kind] ?? 0) + 1;
    this.bossBar?.destroy();
    this.bossName?.destroy();
    this.bossBar = null;
    this.bossPull = { x: 0, y: 0 };
    this.enemyBullets.clear(true, true);
    this.homeUntil = this.time.now + HOME_AFTER_BOSS; // its gold pops out and curves in
    const big = ['dreadnought', 'voss', 'mind'].includes(kind);
    const midLevel = this.segment < this.level.segments.length - 1;
    // Wait for the gold to drop before gathering it up.
    this.time.delayedCall(big ? 3600 : 1800, () => {
      this.boss = null;
      if (midLevel) { this.segBossDone = true; this.endSegment(); } else this.levelClear();
    });
  }

  // Lets boss classes spawn ordinary enemies (Spore Pods, seekers).
  spawn(kind: FoeKind, x: number, y: number) {
    return this.spawnEnemy(kind, x, y);
  }

  // An egg drifting down at `speed` px/s, hatching into larvae unless it's burned first.
  spawnEgg(x: number, y: number, speed: number) {
    const e = this.spawnEnemy('egg', x, y);
    const d = e.getData('e') as EnemyData;
    d.aim = speed;
    d.hold = EGG_HATCH;
    this.tipOnce('egg', 'BURN THE EGGS\nBEFORE THEY HATCH');
    return e;
  }

  // --- Segments, vendor stops, level end ------------------------------------

  private endSegment() {
    if (this.phase !== 'action') return;
    const midBoss = this.level.segmentBoss?.[this.segment];
    if (this.level.riftAfter === this.segment) this.riftSequence();
    else if (this.level.riftExitAfter === this.segment) this.riftExit();
    else if (this.segment < this.level.segments.length - 1) {
      if (midBoss && !this.segBossDone) this.startBoss(midBoss);
      else if (this.level.vendorless) this.flowOn();
      else this.vendorArrival();
    } else if (this.level.boss) this.startBoss();
    else if (this.level.treasure && !this.treasureDone) this.startTreasure();
    else this.levelClear();
  }

  // A treasure ending: a cargo hauler drifts in to be broken open. Left alone,
  // it breaks up on its own and the credits are gathered in at once.
  private startTreasure() {
    this.treasureDone = true;
    this.time.delayedCall(TREASURE_WAIT, () => this.blinkTip('BREAK OPEN THE\nCARGO FOR TREASURE'));
    this.treasure = new Treasure(this, this.level.treasure!, TREASURE_WAIT, (byShip) => {
      this.treasure = null;
      this.levelClear(!byShip);
    });
  }

  // Level 15: no vendor between segments. The next leg starts at once, with
  // everything on screen carried over, and new scenery fades in over the old.
  private flowOn() {
    const next = this.segment + 1;
    // A Rewind Beacon would restart from here.
    this.checkpoint = { save: cloneSave(this.state), segment: next, earned: this.earned };
    if (this.segmentTheme(next) !== this.theme) this.setTheme(this.segmentTheme(next), 2500);
    this.beginSegment();
  }

  private gatherCoins(then: () => void) {
    const coins = this.coins.getChildren().slice() as Phaser.Physics.Arcade.Image[];
    if (coins.length === 0) { then(); return; }
    coins.forEach((c) => {
      c.body!.enable = false;
      this.tweens.add({ targets: c, x: this.player.x, y: this.player.y, duration: 500, ease: 'Quad.easeIn', onComplete: () => this.collect(c) });
    });
    this.time.delayedCall(550, then);
  }

  // Everything that shouldn't carry over into a vendor stop or the rift.
  private clearForCutscene() {
    this.hazards.clear(true, true);
    this.clearTimedHazards();
    this.patches.forEach((pt) => pt.destroy());
    this.patches = [];
  }

  // The station drifts in and keeps scrolling. The ship lines up, barrel-rolls,
  // and starts sinking toward the station partway through its last roll, timed
  // so the station passes right under it as it bottoms out.
  private vendorArrival() {
    this.phase = 'arrival';
    this.dragFrom = null;
    this.player.setVisible(true); // it may have been mid-blink from a hit
    this.enemyBullets.clear(true, true);
    this.gatherCoins(() => {
      if (this.state.level === 1) this.blinkTip('VENDOR AHEAD');
      const shipY = Math.round(H * 0.62);
      const speed = 0.044; // px per ms the station scrolls
      const station = this.add.image(W / 2, -20, 'station').setAlpha(0.55).setScale(1.6).setDepth(5);
      this.tweens.add({ targets: station, y: H + 40, duration: (H + 60) / speed, ease: 'Linear' });
      this.tweens.add({ targets: this.player, x: W / 2, y: shipY, duration: 1400, ease: 'Sine.easeInOut' });

      const ROLL = 340; // ms per barrel roll
      const ROLLS = 2;
      const SINK_AT = 380; // the sink starts this far into the rolls
      const SINK = 1150;
      const total = SINK_AT + SINK;
      const meet = (shipY + 20) / speed; // when the station's center reaches the ship
      this.time.delayedCall(meet - total, () => {
        const p = { t: 0 };
        this.tweens.add({
          targets: p, t: total, duration: total, ease: 'Linear',
          onUpdate: () => {
            const roll = p.t < ROLL * ROLLS ? Math.cos((p.t / ROLL) * Math.PI * 2) : 1;
            const k = Phaser.Math.Clamp((p.t - SINK_AT) / SINK, 0, 1);
            const sink = k * k;
            const scale = 1 - 0.85 * sink;
            this.player.setScale(scale * roll, scale).setAlpha(1 - 0.5 * sink);
          },
          onComplete: () => {
            this.cameras.main.fadeOut(350);
            this.cameras.main.once('camerafadeoutcomplete', () => {
              this.tweens.killTweensOf(station);
              station.destroy();
              this.clearForCutscene();
              this.phase = 'vendor';
              this.scene.pause();
              const repair = {
                health: () => this.health,
                max: this.maxHp,
                heal: (n: number) => { this.health = Math.min(this.maxHp, this.health + n); },
              };
              const first = !this.side && this.state.level === 1 && this.segment === 0;
              this.scene.launch('Vendor', { state: this.state, mode: 'level', from: 'Game', onLeave: () => {}, repair, first });
            });
          },
        });
      });
    });
  }

  // Level 11: the vendor arrives as usual but stops a little above the ship.
  // Then the rift tears open above them both and pulls them in, and the next
  // segment starts inside alien space.
  private riftSequence() {
    this.phase = 'arrival';
    this.dragFrom = null;
    this.player.setVisible(true);
    this.enemyBullets.clear(true, true);
    this.gatherCoins(() => {
      this.clearForCutscene();
      const shipY = Math.round(H * 0.62);
      const stopY = shipY - 52;
      const station = this.add.image(W / 2, -20, 'station').setAlpha(0.55).setScale(1.6).setDepth(5);
      this.tweens.add({ targets: this.player, x: W / 2, y: shipY, duration: 1400, ease: 'Sine.easeInOut' });
      this.tweens.add({
        targets: station, y: stopY, duration: 3600, ease: 'Sine.easeOut',
        onComplete: () => this.time.delayedCall(500, () => this.openRift(station, shipY)),
      });
    });
  }

  private openRift(station: Phaser.GameObjects.Image, shipY: number) {
    const riftY = 58;
    this.radio('REYES: WHAT IS THAT?!');
    this.cameras.main.shake(2600, 0.004);
    this.tweens.add({ targets: this, riftOpen: 1, duration: 1500, ease: 'Quad.easeIn' });
    // Pulled in: the station first, then the ship, spinning down into the tear.
    this.time.delayedCall(1700, () => {
      this.tweens.add({ targets: station, x: W / 2, y: riftY, scale: 0, angle: 540, alpha: 0.2, duration: 1100, ease: 'Quad.easeIn' });
      this.tweens.add({ targets: this.player, x: W / 2 + 8, y: shipY - 20, duration: 300, ease: 'Sine.easeIn' });
      this.time.delayedCall(450, () => {
        this.tweens.add({ targets: this.player, x: W / 2, y: riftY, scale: 0.1, angle: 720, duration: 1250, ease: 'Quad.easeIn' });
      });
    });
    this.time.delayedCall(3500, () => {
      this.cameras.main.flash(500, 252, 252, 252);
      this.cameras.main.fadeOut(500, 0, 0, 0);
      this.cameras.main.once('camerafadeoutcomplete', () => {
        station.destroy();
        this.riftOpen = 0;
        this.setTheme(this.segmentTheme(this.segment + 1));
        this.player.setAngle(0).setScale(1).setAlpha(1).setPosition(W / 2, H - 50);
        this.allies.forEach((a) => a.img.setPosition(this.player.x + a.ox, H + 20));
        this.cameras.main.fadeIn(600);
        this.time.delayedCall(700, () => this.radio('VEX: WE FOLLOWED YOU\nIN. STAY CLOSE, PILOT.'));
        this.startNextSegment();
      });
    });
  }

  // Level 11, through the rift: a dimmer tear opens ahead of the ship and
  // keeps opening until it's bigger than the screen, then the rift fades into
  // Hollow space and the vendor arrives.
  private riftExit() {
    this.phase = 'arrival';
    this.dragFrom = null;
    this.player.setVisible(true);
    this.enemyBullets.clear(true, true);
    this.gatherCoins(() => {
      this.clearForCutscene();
      this.tweens.add({ targets: this.player, x: W / 2, y: Math.round(H * 0.7), duration: 1400, ease: 'Sine.easeInOut' });
      this.time.delayedCall(800, () => this.radio('VEX: ANOTHER TEAR!\nPUNCH THROUGH IT!'));
      this.cameras.main.shake(4200, 0.003);
      this.tweens.add({
        targets: this, tearOpen: 1, delay: 1200, duration: 3600, ease: 'Quad.easeIn',
        onComplete: () => {
          // Past the edges of the screen now: the dark beyond fades into Hollow space.
          this.tearOpen = 0;
          this.tearGfx?.clear();
          const dark = this.add.rectangle(0, 0, W, H, 0x0c0814).setOrigin(0).setDepth(4.5);
          this.setTheme(this.segmentTheme(this.segment + 1));
          this.tweens.add({
            targets: dark, alpha: 0, duration: 1800,
            onComplete: () => {
              dark.destroy();
              this.radio('REYES: WE\'RE OUT. BUT\nTHIS ISN\'T OUR SPACE.');
              this.time.delayedCall(1800, () => this.vendorArrival());
            },
          });
        },
      });
    });
  }

  // The way out of the rift: a lens of dim purple around the dark beyond,
  // drawn under the ship, that swells from a slit to past the screen's edges.
  private drawTear() {
    if (this.tearOpen <= 0) return;
    if (!this.tearGfx) this.tearGfx = this.add.graphics().setDepth(4.5);
    const g = this.tearGfx.clear();
    const k = this.tearOpen;
    const cy = H * 0.36;
    const hw = 12 + k * W;
    const hh = 1 + k * k * H * 1.7;
    for (const [m, col] of [[1.12, 0x3c1c7c], [1.05, 0xa40080], [1, 0x0c0814]] as const) {
      g.fillStyle(col, 1);
      for (let x = -hw * m; x <= hw * m; x += 2) {
        const h = Math.max(0, hh * m * (1 - (x / (hw * m)) ** 2) + Phaser.Math.Between(-1, 1));
        g.fillRect(W / 2 + x, cy - h / 2 + Math.sin(x * 0.25) * 2, 2, h);
      }
    }
    // Specks of the far side showing through.
    for (let i = 0; i < 10 * k; i++) {
      const x = W / 2 + Phaser.Math.FloatBetween(-0.6, 0.6) * hw, y = cy + Phaser.Math.FloatBetween(-0.3, 0.3) * hh;
      g.fillStyle(Math.random() < 0.5 ? 0x58d854 : 0x9878f8, 0.7).fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  }

  // The tear: a jagged, crackling slash that widens as `riftOpen` goes 0 to 1.
  private drawRift() {
    if (this.riftOpen <= 0) return;
    const g = this.beams;
    const cy = 58;
    const half = this.riftOpen * (W / 2 - 10);
    const tall = this.riftOpen * 16;
    for (const [k, col] of [[1.6, 0x6844fc], [1, 0xd800cc], [0.45, 0xfcfcfc]] as const) {
      g.fillStyle(col, 1);
      for (let x = -half; x <= half; x += 2) {
        const taper = 1 - (x / Math.max(half, 1)) ** 2;
        const h = Math.max(0, tall * taper * k + Phaser.Math.Between(-1, 1));
        g.fillRect(W / 2 + x, cy - h / 2 + Math.sin(x * 0.3) * 2, 2, h);
      }
    }
    // Streaks of light pulled toward the tear.
    for (let i = 0; i < 6 * this.riftOpen; i++) {
      const x = Phaser.Math.Between(0, W), y = Phaser.Math.Between(cy + 20, H);
      g.lineStyle(1, 0x9878f8, 0.6).lineBetween(x, y, x + (W / 2 - x) * 0.1, y - 10);
    }
  }

  // Back from the vendor or out of the rift: ready, then the next segment.
  private startNextSegment() {
    const ready = text(this, W / 2, H / 2, 'READY', COLOR.white).setOrigin(0.5).setDepth(1000);
    this.tweens.add({ targets: ready, alpha: 0.2, yoyo: true, repeat: 2, duration: 220 });
    this.phase = 'ready';
    this.time.delayedCall(1500, () => {
      ready.destroy();
      this.beginSegment();
    });
  }

  private beginSegment() {
    this.segment++;
    this.waveIndex = 0;
    this.waveTimer = 0;
    this.segBossDone = false;
    this.warpIn = null;
    this.resetHazardTimers(3000);
    this.startTunnel();
    const call = this.level.segmentRadio?.[this.segment];
    if (call) this.radio(call);
    this.phase = 'action';
  }

  private afterVendor() {
    if (this.phase !== 'vendor') return;
    this.player.setPosition(W / 2, H - 50).setScale(1).setAlpha(1);
    this.allies.forEach((a) => a.img.setPosition(this.player.x + a.ox, this.player.y + a.oy).setScale(1).setAlpha(1));
    this.slide = { x: 0, y: 0 };
    // Gear may have changed at the vendor.
    this.maxHp = totalMaxHealth(this.state);
    this.health = Math.min(this.health, this.maxHp);
    this.setupGear(false);
    this.refreshHud();
    // A Rewind Beacon would restart from here.
    this.checkpoint = { save: cloneSave(this.state), segment: this.segment + 1, earned: this.earned };
    this.cameras.main.fadeIn(350);
    this.startNextSegment();
  }

  private levelClear(skipLinger = false) {
    if (this.phase !== 'action') return;
    this.phase = 'clear';
    this.player.setVisible(true);
    this.enemyBullets.clear(true, true);
    this.clearTimedHazards(true);
    const last = !this.side && !this.replay && this.state.level === LEVELS.length;
    // Loose credits curve in toward the ship (see homeCoin) for a few seconds,
    // or until they're all picked up, before the rest are gathered in.
    if (skipLinger) { this.endLevel(last); return; }
    this.lingering = true;
    const start = this.time.now;
    const check = this.time.addEvent({
      delay: 100, loop: true, callback: () => {
        const t = this.time.now - start;
        if (t < LINGER && (t < 1000 || this.coins.countActive() > 0)) return;
        check.remove();
        this.lingering = false;
        this.dragFrom = null;
        this.endLevel(last);
      },
    });
  }

  private endLevel(last: boolean) {
    this.gatherCoins(() => {
      if (last) { this.ending(); return; }
      if (this.side) {
        // Side missions don't move the ship on: back to Base, one more beaten.
        text(this, W / 2, H / 2 - 16, 'SIDE MISSION CLEAR', COLOR.yellow).setOrigin(0.5).setDepth(1000);
        text(this, W / 2, H / 2 + 2, 'RETURNING TO BASE', COLOR.gray).setOrigin(0.5).setDepth(1000);
        this.tweens.add({ targets: this.player, y: -30, duration: 1400, delay: 900, ease: 'Quad.easeIn' });
        if (!this.state.sides.includes(this.side)) this.state.sides.push(this.side);
        this.time.delayedCall(2800, () => this.leaveTo('Base', this.state));
        return;
      }
      text(this, W / 2, H / 2 - 16, `LEVEL ${this.state.level} CLEAR`, COLOR.yellow).setOrigin(0.5).setDepth(1000);
      text(this, W / 2, H / 2 + 2, 'RETURNING TO BASE', COLOR.gray).setOrigin(0.5).setDepth(1000);
      this.tweens.add({ targets: this.player, y: -30, duration: 1400, delay: 900, ease: 'Quad.easeIn' });
      if (this.replay) {
        // A replay doesn't move the ship on, or open anything new.
        this.state.level = this.startState.level;
        this.time.delayedCall(2800, () => this.leaveTo('Base', this.state));
        return;
      }
      const unlocked = unlockedBy(this.state.level);
      this.state.level++;
      this.time.delayedCall(2800, () => this.leaveTo('Base', this.state, unlocked.length > 0, unlocked));
    });
  }

  // The end of the game: the Hollow Mind is gone. A few lines of story, then Base.
  private ending() {
    this.tweens.add({ targets: this.player, y: -30, duration: 1800, delay: 600, ease: 'Quad.easeIn' });
    const lines = [
      ['THE HOLLOW IS DEFEATED', COLOR.yellow],
      ['', COLOR.white],
      ['THE HIVE FALLS SILENT.', COLOR.white],
      ['THE RIFT CLOSES BEHIND', COLOR.white],
      ['ONE SMALL SHIP.', COLOR.white],
      ['', COLOR.white],
      ['VEX: KNEW YOU\'D MAKE IT.', COLOR.cyan],
      ['VOSS: THE EMPIRE OWES', COLOR.cyan],
      ['YOU EVERYTHING, PILOT.', COLOR.cyan],
      ['', COLOR.white],
      ['THANKS FOR PLAYING', COLOR.gray],
    ] as const;
    lines.forEach(([l, c], i) => {
      const t = text(this, W / 2, 90 + i * 13, l, c).setOrigin(0.5).setDepth(1000).setAlpha(0);
      this.tweens.add({ targets: t, alpha: 1, delay: 1200 + i * 450, duration: 400 });
    });
    this.state.level++;
    this.time.delayedCall(1200 + lines.length * 450 + 3500, () => this.leaveTo('Base', this.state));
  }

  // The Bestiary's log: a sighting the first time each kind shows up.
  private sighted(kind: string) {
    if (!this.test && !this.state.seen.includes(kind)) this.state.seen.push(kind);
  }

  // Kills and sightings stick even when the ship is lost or rewinds.
  private keepLog(s: SaveData) {
    s.kills = { ...this.state.kills };
    s.seen = [...this.state.seen];
  }

  // Every mission ends back at the Base menu. A level that unlocks side missions
  // first shows the star map for a moment, announcing them.
  private leaveTo(scene: string, state: SaveData, toMap = false, unlocked: string[] = []) {
    this.keepLog(state);
    this.cameras.main.fadeOut(400);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene, { state, toMap, unlocked }));
  }

  // Level 14: the allied fleet's battle with the gate, far behind the action.
  private drawFleetBattle() {
    if (this.theme !== 'gate' || Math.random() > 0.08) return;
    const y = Phaser.Math.Between(20, H - 60);
    const left = Math.random() < 0.5;
    const line = this.add.rectangle(left ? 0 : W, y, Phaser.Math.Between(30, 70), 1, Math.random() < 0.5 ? 0x3cbcfc : 0xd82800, 0.5)
      .setOrigin(left ? 0 : 1, 0.5);
    this.children.moveTo(line, this.scenery ? 3 : 2);
    this.tweens.add({ targets: line, x: left ? W : 0, alpha: 0, duration: 500, onComplete: () => line.destroy() });
  }

  // --- Frame -------------------------------------------------------------------

  update(_t: number, delta: number) {
    const dt = Math.min(delta, 50) / 1000;
    const now = this.time.now;
    const speed = this.phase === 'arrival' ? 0.4 : 1;
    // Time Warp: enemies, their shots and hazards run at half speed.
    const slow = now < this.warpUntil;
    const edt = slow ? dt * ITEMS.warp.tune!.slow : dt;
    // Inside the rift, space rushes by three times as fast.
    const rush = this.rush;
    this.scroll(dt, speed * rush);
    if (this.scenery) this.scenery.tilePositionY -= 11 * speed * rush * dt;
    if (this.planet) this.planet.y += 1.2 * dt;
    if (this.nebula) this.nebula.y += 0.7 * dt;
    if (this.fog) { this.fog.tilePositionY -= 6 * dt; this.fog.tilePositionX += 2 * dt; }
    for (const p of this.patches.slice()) {
      p.y += 30 * speed * dt;
      if (p.y > H + 30) { p.destroy(); this.patches.splice(this.patches.indexOf(p), 1); }
    }
    this.beams.clear();

    if (this.phase === 'action') {
      this.move(dt);
      this.autoFire(dt);
      if (this.test) { this.test.update(dt, (w) => this.spawnWave(w)); this.tickReturners(dt); }
      else {
        this.runWaves(dt);
        this.runHazards(dt);
        this.runWarps(dt);
      }
    } else if (this.lingering) this.move(dt);
    this.updateShots(dt);
    this.updateEnemies(edt);
    this.updateVortices(edt);
    this.boss?.update(edt);
    this.treasure?.update(edt);
    this.storm?.draw(dt, this.stormNow());
    this.drawBossBar();
    this.updateStrikes(edt);
    this.updateFlares(edt);
    this.updateFences(edt);
    this.act3.update(edt);
    if (this.tunnel) {
      this.tunnel.update(edt, this.phase === 'action' || this.phase === 'ready');
      // Enemies keep inside the tunnel too.
      for (const o of this.enemies.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
        if (o.y < 0) continue;
        const { l, r } = this.tunnel.at(o.y);
        if (r - l > 16) o.x = Phaser.Math.Clamp(o.x, l + 7, r - 7);
      }
    }
    this.barriers.update(edt);
    this.sideHaz.update(edt);
    this.warps.update(edt);
    this.updateGear(dt);
    this.updateRedirect(dt);
    this.updateRadar();
    this.updateCrates(dt);
    this.updateAllies(dt);
    this.drawZaps(dt);
    this.drawPops(dt);
    this.drawGlitter(dt);
    this.drawFlames(dt);
    this.updateLatches(edt);
    this.drawRamGlow();
    this.drawScanner();
    this.drawRift();
    this.drawTear();
    this.drawFleetBattle();
    if (slow) {
      // Undo half of each enemy shot's and hazard's movement this frame.
      for (const group of [this.enemyBullets, this.hazards]) {
        for (const o of group.getChildren() as Phaser.Physics.Arcade.Image[]) {
          if (!o.body) continue;
          o.x -= o.body.velocity.x * dt / 2;
          o.y -= o.body.velocity.y * dt / 2;
        }
      }
    }

    // Decoy Flare: drifts up slowly and sputters out.
    if (this.flare) {
      this.flare.y -= 10 * dt;
      this.flare.setAlpha(Math.floor(now / 70) % 2 ? 1 : 0.6);
      if (now >= this.flareUntil) { this.flare.destroy(); this.flare = null; }
    }
    this.dark?.setPosition(this.player.x, this.player.y);

    // Blink while invulnerable after a hit; show the bubble while shielded.
    if (this.phase === 'action' || this.phase === 'ready') {
      this.player.setVisible(now >= this.invulnUntil || Math.floor(now / 80) % 2 === 0);
    }
    this.bubble.setVisible(this.phase === 'action' && now < this.shieldUntil && (this.shieldUntil - now > 1000 || Math.floor(now / 100) % 2 === 0));
    this.bubble.setPosition(this.player.x, this.player.y);

    // Bars catch the light now and then. At a level end, and after a boss, they curve to the ship.
    for (const c of this.coins.getChildren() as Phaser.Physics.Arcade.Image[]) {
      if (this.phase === 'clear' || c.getData('home')) this.homeCoin(c, dt);
      const shine = (now + (c.getData('glint') as number)) % 1600 < 120;
      c.setTexture(shine ? `${c.getData('key')}_glint` : c.getData('key'));
    }

    for (const group of [this.playerBullets, this.enemyBullets, this.coins, this.hazards]) {
      for (const o of group.getChildren().slice() as Phaser.Physics.Arcade.Image[]) {
        if (o.y < -24 || o.y > H + 24 || o.x < -24 || o.x > W + 24) o.destroy();
      }
    }
  }
}
