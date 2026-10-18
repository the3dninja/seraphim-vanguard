import Phaser from 'phaser';
import { COLOR, W, H } from '../config';
import {
  DTYPE_COLOR, GEAR, ITEMS, WEAPONS, gearStats, stackLabel, type DType, type GearId, type WeaponId,
} from '../data/items';
import { ENEMY_STATS, typeMultiplier, type FoeKind } from '../data/enemies';
import { LEVELS, type BossKind, type HazardSpec, type LevelDef, type Theme, type Wave } from '../data/levels';
import { equippedGear, gearLevel, hasGear, totalMaxHealth, weaponLevel, weaponStats } from '../inventory';
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
import { starfield, text, toast } from '../ui';

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
  weak: DType[];
  resist: DType[];
  burn: number; // ms of burning left
  burnDmg: number; // damage per burn tick
  burnTick: number; // ms to the next burn tick
  stun: number; // ms stunned: no moving or firing
}

// Anything a boss class offers the scene.
interface Boss {
  update(dt: number): void;
  healthFraction(): number;
  armorFraction?(): number; // bosses with armor show it in a second bar
  aimPoint?(): { x: number; y: number } | null; // where homing missiles steer
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
interface Pop { x: number; y: number; t: number; lv: number; color: number } // a hit's flash ring, ms since the hit

const SHIP_SPEED_KEYS = 110; // px/s with keyboard
const ICE_GRIP = 2.2; // how fast the ship's speed catches up with the controls on ice (per second)
const BULWARK_SHIELD = 12;
const LANCER_WARN = 850; // ms the warning line shows before a Lancer fires
const BOSS_NAMES = {
  rockjaw: 'ROCKJAW', dreadnought: 'DREADNOUGHT', watcher: 'THE WATCHER',
  voss: 'EMPEROR VOSS', queen: 'BROOD QUEEN', mind: 'THE HOLLOW MIND',
  sporeheart: 'THE SPOREHEART', wyrm: 'THE BROOD WYRM',
  frostjaw: 'FROSTJAW', hollowwatcher: 'HOLLOW WATCHER', broodmother: 'BROOD MATRIARCH',
};
const EGG_HATCH = 5500; // ms before an egg hatches into larvae
const GEAR_KEYS = ['Q', 'E'];
const ALL_TYPES: DType[] = ['kinetic', 'laser', 'plasma', 'ion', 'explosive'];
const ARC_LIFE = 0.32; // s an Ion Arc bolt lasts, which sets its range
const FLAK_FUSE = 0.42; // s before a flak shell bursts
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
const godMode = () => new URLSearchParams(location.search).has('god');

export class GameScene extends Phaser.Scene {
  private startState!: SaveData; // what to go back to if the ship is destroyed
  state!: SaveData;
  private level!: LevelDef;
  private health = 0;
  // Where a Rewind Beacon restarts from: the level start, then each vendor stop.
  private checkpoint!: { save: SaveData; segment: number };
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
  private shotInfo = new WeakMap<object, { dmg: number; dtype: DType; blob: boolean; lv: number }>();
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
  private sideHaz!: SideHazards;

  phase: Phase = 'action';
  private segment = 0;
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
  private warps!: Warps; // Maw Gate: enemies warping in
  private warpsDone = new Set<number>(); // which one-off warp-ins have happened
  private warpIn: number | null = null; // ms to the next repeating warp-in
  private homeUntil = 0; // credits dropped before this curve toward the ship (a boss's gold)
  private pops: Pop[] = [];
  bossPull = { x: 0, y: 0 }; // px/s a boss drags the ship (the Hollow Mind's black holes)

  // Gear
  private maxHp = 5;
  private deflect = 0; // Deflector charges ready
  private deflectAt = 0; // when the next charge comes back
  private deflectRing!: Phaser.GameObjects.Image;
  private sats: Phaser.GameObjects.Image[] = [];
  private satTimer = 0;
  private gearReadyAt: Partial<Record<GearId, number>> = {}; // when active gear can be used again
  private dashing = false; // a Dodge Thrusters dash is moving the ship
  private burnUntil = 0; // Afterburner
  private rollUntil = 0; // Barrel Roll
  private antiTimer = 0; // Anti-Missile
  private volleys: number[] = []; // per weapon slot, for the Overcharger
  private lastMove = { x: 0, y: -1 }; // direction the ship last moved, for dashes and blinks
  private bossBar: Phaser.GameObjects.Graphics | null = null;
  private bossName: Phaser.GameObjects.Text | null = null;

  private fireTimers: number[] = [];
  private invulnUntil = 0;
  private shieldUntil = 0;
  private overdriveUntil = 0;
  private warpUntil = 0; // Time Warp
  private flare: Phaser.GameObjects.Image | null = null; // Decoy Flare
  private flareUntil = 0;
  private lingering = false; // level cleared: a few seconds to pick up credits
  private boostSegment = -1; // Credit Booster: the segment it boosts drops for
  private healUntil = 0; // Repair Drone
  private healAt = 0;
  private healDrone: Phaser.GameObjects.Image | null = null;

  private dragFrom: { px: number; py: number; sx: number; sy: number; tx: number; ty: number } | null = null;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;

  private hearts: Phaser.GameObjects.Image[] = [];
  private creditsText!: Phaser.GameObjects.Text;
  private itemButtons: { box: Phaser.GameObjects.Rectangle; icon: Phaser.GameObjects.Image; count: Phaser.GameObjects.Text }[] = [];
  private weaponIcons: Phaser.GameObjects.Image[] = [];
  private gearButtons: { box: Phaser.GameObjects.Rectangle; icon: Phaser.GameObjects.Image; cool: Phaser.GameObjects.Rectangle }[] = [];
  private tipsShown = new Set<string>();
  private tipFreeAt = 0; // when the tip on screen is done blinking

  constructor() { super('Game'); }

  // `resume` comes from a Rewind Beacon: restart at a checkpoint instead of the level start.
  // `side` names a side mission to fly instead of the next level.
  init(data: { state: SaveData; resume?: { save: SaveData; segment: number }; side?: string }) {
    this.startState = cloneSave(data.state);
    this.state = cloneSave(data.resume ? data.resume.save : data.state);
    this.side = data.side ?? null;
    this.level = (this.side && sideById(this.side)) || LEVELS[this.state.level - 1];
    this.checkpoint = data.resume ? { save: cloneSave(data.resume.save), segment: data.resume.segment } : { save: cloneSave(data.state), segment: 0 };
    this.rewound = !!data.resume;
    this.maxHp = totalMaxHealth(this.state);
    this.health = this.maxHp;
    this.phase = 'action';
    this.strikes = [];
    this.flares = [];
    this.fences = [];
    this.zaps = [];
    this.allies = [];
    this.riftOpen = 0;
    this.warpsDone = new Set();
    this.warpIn = null;
    this.homeUntil = 0;
    this.pops = [];
    this.bossPull = { x: 0, y: 0 };
    this.sats = [];
    this.satTimer = 0;
    this.deflect = 0;
    this.deflectAt = 0;
    this.gearReadyAt = {};
    this.dashing = false;
    this.burnUntil = 0;
    this.rollUntil = 0;
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
    this.shieldUntil = 0;
    this.overdriveUntil = 0;
    this.warpUntil = 0;
    this.flare = null;
    this.flareUntil = 0;
    this.boostSegment = -1;
    this.lingering = false;
    this.healUntil = 0;
    this.healAt = 0;
    this.healDrone = null;
    this.dragFrom = null;
    this.hearts = [];
    this.itemButtons = [];
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
    const inRift = this.level.riftAfter !== undefined && this.segment > this.level.riftAfter;
    this.setTheme(inRift ? 'rift' : this.segmentTheme(this.segment));
    if (this.level.storm) this.storm = new Storm(this, this.scenery ? 3 : 2);
    this.resetHazardTimers(4000);

    this.playerBullets = this.physics.add.group();
    this.hazards = this.physics.add.group();
    this.enemies = this.physics.add.group();
    this.enemyBullets = this.physics.add.group();
    this.coins = this.physics.add.group();
    this.beams = this.add.graphics().setDepth(12);
    this.act3 = new Act3Hazards(this);
    this.barriers = new Barriers(this);
    this.sideHaz = new SideHazards(this);
    this.warps = new Warps(this);
    this.startTunnel(); // a Rewind Beacon can restart in the tunnel

    this.player = this.physics.add.sprite(W / 2, H - 50, 'ship').setDepth(10);
    this.player.body!.setSize(5, 7).setOffset(4, 3); // small hitbox, NES-shooter fair
    this.bubble = this.add.image(0, 0, 'bubble').setDepth(11).setVisible(false);
    this.deflectRing = this.add.image(0, 0, 'deflect').setDepth(11).setVisible(false);
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

    this.setupInput();
    this.createHud();

    const intro = [
      text(this, W / 2, H / 2 - 40, this.side ? 'SIDE MISSION' : `LEVEL ${this.state.level}`, this.side ? COLOR.cyan : COLOR.gray),
      text(this, W / 2, H / 2 - 26, this.level.name, COLOR.white),
    ].map((t) => t.setOrigin(0.5).setDepth(1000));
    if (this.rewound) intro.push(text(this, W / 2, H / 2 - 6, 'REWIND BEACON USED', COLOR.cyan).setOrigin(0.5).setDepth(1000));
    this.tweens.add({ targets: intro, alpha: 0, delay: 2700, duration: 400 });
    if (this.state.level === 1) this.time.delayedCall(2400, () => this.blinkTip('DRAG TO MOVE'));
    const call = this.side ? undefined : RADIO[this.state.level];
    if (call && !this.rewound) this.time.delayedCall(2300, () => this.radio(call));
    if (equippedGear(this.state).some((g) => GEAR[g].active)) this.time.delayedCall(3000, () => this.tipOnce('gearbtn', 'TAP A GEAR BUTTON\nTO USE IT'));

    this.events.off('resume');
    this.events.on('resume', () => this.afterVendor());
  }

  // Scenery and a planet for the level's locale. Level 11 switches to the rift
  // partway through. With `fade` (ms) the old scenery fades out as the new one
  // fades in, so nothing goes black (level 15's legs).
  private setTheme(theme: Theme, fade = 0) {
    this.theme = theme;
    const old = [this.scenery, this.planet, this.fog].filter((o): o is NonNullable<typeof o> => !!o);
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
    // Just above the two star layers, under everything that flies.
    if (this.scenery) this.children.moveTo(this.scenery, 2);
    if (this.planet) this.children.moveTo(this.planet, this.scenery ? 3 : 2);
    if (fade) {
      for (const o of [this.scenery, this.planet, this.fog]) {
        if (!o) continue;
        const a = o.alpha;
        o.setAlpha(0);
        this.tweens.add({ targets: o, alpha: a, duration: fade });
      }
    }
  }

  // The scenery for a segment: level 15 changes it as it goes.
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
      this.dragFrom = { px: p.x, py: p.y, sx: x, sy: y, tx: x, ty: y };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.dragFrom || !p.isDown || (this.phase !== 'action' && !this.lingering)) return;
      this.dragFrom.tx = Phaser.Math.Clamp(this.dragFrom.sx + (p.x - this.dragFrom.px), 6, W - 6);
      this.dragFrom.ty = Phaser.Math.Clamp(this.dragFrom.sy + (p.y - this.dragFrom.py), 24, H - 30);
    });
    const release = () => { this.dragFrom = null; };
    this.input.on('pointerup', release);
    this.input.on('pointerupoutside', release);

    const kb = this.input.keyboard!;
    this.keys = kb.addKeys({
      up: 'UP', down: 'DOWN', left: 'LEFT', right: 'RIGHT', w: 'W', a: 'A', s: 'S', d: 'D',
    }) as GameScene['keys'];
    // Space uses the first loaded item slot; 1, 2 and 3 pick a slot.
    kb.on('keydown-SPACE', () => this.useItem(this.state.items.findIndex((it) => !!it)));
    ITEM_KEYS.forEach((k, i) => kb.on(`keydown-${k}`, () => this.useItem(i)));
    // Q and E use active gear in gear slots 1 and 2.
    GEAR_KEYS.forEach((k, i) => kb.on(`keydown-${k}`, () => this.useGear(i)));
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
    mx += pull.x + wind.x + this.bossPull.x * dt;
    my += pull.y + this.bossPull.y * dt;
    const nx = Phaser.Math.Clamp(this.player.x + mx, 6, W - 6);
    const ny = Phaser.Math.Clamp(this.player.y + my, 24, H - 30);
    // Sliding into the edge of the screen stops the slide that way.
    if (nx !== this.player.x + mx) this.slide.x = 0;
    if (ny !== this.player.y + my) this.slide.y = 0;
    this.player.setPosition(nx, ny);
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

    // Bottom left: one button per gear slot (active gear is tapped, passive
    // gear just shows), with the weapon readout above. Bottom right: one item
    // button per slot (big enough for a thumb), each showing its stack like 1/3.
    const wy = this.state.gear.length ? H - 36 : H - 12;
    this.state.weapons.forEach((_w, i) => this.weaponIcons.push(this.add.image(10 + i * 12, wy, 'icon_pulse').setDepth(900)));
    this.state.gear.forEach((_g, i) => {
      const x = 4 + i * 24;
      const box = this.add.rectangle(x, H - 26, 22, 22, 0x000000).setOrigin(0).setDepth(900).setInteractive();
      box.on('pointerdown', () => this.useGear(i));
      const cool = this.add.rectangle(x + 1, H - 5, 20, 0, 0x3c3c3c).setOrigin(0, 1).setDepth(901);
      const icon = this.add.image(x + 11, H - 15, 'icon_plating').setDepth(902);
      this.gearButtons.push({ box, icon, cool });
    });
    const slots = this.state.items.length;
    this.state.items.forEach((_it, i) => {
      const x = W - 42 - (slots - 1 - i) * 42; // slot 1 on the left, like the Ship screen
      const box = this.add.rectangle(x, H - 26, 39, 22, 0x000000).setOrigin(0).setDepth(900)
        .setStrokeStyle(1, 0xfcfcfc).setInteractive();
      box.on('pointerdown', () => this.useItem(i));
      const icon = this.add.image(x + 7, H - 15, 'icon_repair').setDepth(901);
      const count = text(this, x + 13, H - 19, '', COLOR.white).setDepth(901);
      this.itemButtons.push({ box, icon, count });
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
      b.count.setText(item ? stackLabel(item) : '');
      if (item) b.icon.setTexture(ITEMS[item.id].icon);
      b.box.setStrokeStyle(1, item ? 0xfcfcfc : 0x3c3c3c);
    });
  }

  // Active gear buttons fill with gray while they cool down.
  private drawGearCooldowns() {
    const now = this.time.now;
    this.state.gear.forEach((g, i) => {
      const b = this.gearButtons[i];
      if (!b) return;
      if (!g || !GEAR[g].active) { b.cool.setSize(20, 0); return; }
      const cd = (gearStats[g] as (lv: number) => { cooldown: number })(gearLevel(this.state, g)).cooldown;
      const left = Math.max(0, (this.gearReadyAt[g] ?? 0) - now);
      b.cool.setSize(20, Math.round((left / cd) * 20)); // origin at the bottom, so it shrinks downward
      b.icon.setAlpha(left > 0 ? 0.45 : 1);
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
    if (this.tipsShown.has(key)) return;
    this.tipsShown.add(key);
    this.blinkTip(msg);
  }

  // --- Items ---------------------------------------------------------------

  private useItem(slot: number) {
    const item = this.state.items[slot];
    if (!item || this.phase !== 'action') return;
    const now = this.time.now;
    switch (item.id) {
      case 'repair':
      case 'fullrepair':
        if (this.health >= this.maxHp) { toast(this, 'HEALTH IS FULL', H / 2 + 30, 600); return; }
        this.health = item.id === 'repair' ? Math.min(this.maxHp, this.health + 2) : this.maxHp;
        break;
      case 'shield': this.shieldUntil = now + 5000; break;
      case 'overdrive': this.overdriveUntil = now + 8000; break;
      case 'nova': this.nova(); break;
      case 'cluster':
        for (let i = 0; i < 5; i++) {
          const b = this.shot(this.player.x, this.player.y - 6, 'bomblet', -30 + i * 15, 160, 4, 'explosive');
          b.setData('fx', 'bomb').setData('splash', 18);
        }
        break;
      case 'emp': this.emp(); break;
      case 'warp':
        this.warpUntil = now + 4000;
        this.cameras.main.flash(200, 60, 60, 160);
        break;
      case 'decoy':
        this.flare?.destroy();
        this.flare = this.add.image(this.player.x, this.player.y - 10, 'flare').setDepth(9.8);
        this.flareUntil = now + 5000;
        break;
      case 'booster':
        this.boostSegment = this.segment;
        toast(this, 'DOUBLE CREDITS!', H / 2 + 30, 900);
        break;
      case 'drone':
        this.healUntil = now + 20000;
        this.healAt = now + 4000;
        this.healDrone ??= this.add.image(0, 0, 'healdrone').setDepth(10);
        break;
      case 'rewind':
        toast(this, 'IT WORKS BY ITSELF\nIF YOUR SHIP IS DESTROYED', H / 2 + 30, 1200);
        return;
    }
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
      this.damageEnemy(e, 12, null);
    }
  }

  // EMP Pulse: a ring sweeps out; machines stop for 3 s, shields drop and Phantoms decloak.
  private emp() {
    const ring = this.add.circle(this.player.x, this.player.y, 4).setStrokeStyle(2, 0x3cbcfc).setDepth(12);
    this.tweens.add({ targets: ring, scale: 60, alpha: 0, duration: 450, onComplete: () => ring.destroy() });
    for (const e of this.enemies.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
      const d = e.getData('e') as EnemyData;
      if (ENEMY_STATS[d.kind].organic) continue;
      d.stun = 3000;
      if (d.shieldImg) { d.shieldImg.destroy(); d.shieldImg = null; d.shield = 0; }
      if (d.cloaked) { d.cloaked = false; d.hold = 3000; e.setAlpha(1); }
    }
  }

  // --- Active gear --------------------------------------------------------------

  private useGear(slot: number) {
    const id = this.state.gear[slot];
    if (!id || !GEAR[id].active || this.phase !== 'action') return;
    const now = this.time.now;
    if (now < (this.gearReadyAt[id] ?? 0)) return;
    const lv = gearLevel(this.state, id);
    const p = this.player;
    const dir = this.lastMove;
    switch (id) {
      case 'dodge': {
        const st = gearStats.dodge(lv);
        this.gearReadyAt[id] = now + st.cooldown;
        this.invulnUntil = Math.max(this.invulnUntil, now + st.safe);
        this.dashing = true;
        this.dragFrom = null;
        const to = { x: Phaser.Math.Clamp(p.x + dir.x * st.dist, 6, W - 6), y: Phaser.Math.Clamp(p.y + dir.y * st.dist, 24, H - 30) };
        for (let i = 0; i < 3; i++) {
          const ghost = this.add.image(p.x + (to.x - p.x) * i / 3, p.y + (to.y - p.y) * i / 3, 'ship').setAlpha(0.4).setDepth(9);
          this.tweens.add({ targets: ghost, alpha: 0, duration: 250, delay: i * 40, onComplete: () => ghost.destroy() });
        }
        this.tweens.add({ targets: p, x: to.x, y: to.y, duration: 120, ease: 'Quad.easeOut', onComplete: () => { this.dashing = false; } });
        break;
      }
      case 'blink': {
        const st = gearStats.blink(lv);
        this.gearReadyAt[id] = now + st.cooldown;
        this.sparks.explode(10, p.x, p.y);
        this.dragFrom = null;
        p.setPosition(Phaser.Math.Clamp(p.x + dir.x * st.dist, 6, W - 6), Phaser.Math.Clamp(p.y + dir.y * st.dist, 24, H - 30));
        this.invulnUntil = Math.max(this.invulnUntil, now + 250);
        this.flash(p);
        break;
      }
      case 'afterburner': {
        const st = gearStats.afterburner(lv);
        this.gearReadyAt[id] = now + st.cooldown + st.burn;
        this.burnUntil = now + st.burn;
        break;
      }
      case 'roll': {
        const st = gearStats.roll(lv);
        this.gearReadyAt[id] = now + st.cooldown + st.spin;
        this.rollUntil = now + st.spin;
        break;
      }
      case 'burst': {
        const st = gearStats.burst(lv);
        this.gearReadyAt[id] = now + st.cooldown;
        for (let i = 0; i < st.shots; i++) this.shot(p.x, p.y, 'pellet', (i / st.shots) * 360, 220, st.damage, 'kinetic');
        break;
      }
    }
  }

  // --- Waves -----------------------------------------------------------------

  private runWaves(dt: number) {
    if (this.boss || this.treasure) return;
    const waves = this.level.segments[this.segment];
    const wave = waves[this.waveIndex];
    if (!wave) {
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

  private spawnWave(w: Wave) {
    const n = w.count ?? 1;
    // In the tunnel, positions across the screen become positions across the tunnel.
    const tx = (x: number) => (this.tunnel ? this.tunnel.mapX(x / W, 0) : x);
    const cx = tx((w.x ?? 0.5) * W);
    switch (w.pattern) {
      case 'single':
        this.spawnEnemy(w.kind, cx, -10);
        break;
      case 'pair':
        this.spawnEnemy(w.kind, tx(W * 0.3), -10);
        this.spawnEnemy(w.kind, tx(W * 0.7), -10);
        break;
      case 'line':
        for (let i = 0; i < n; i++) this.spawnEnemy(w.kind, tx(((i + 0.5) / n) * (W - 20) + 10), -10);
        break;
      case 'column':
        for (let i = 0; i < n; i++) this.spawnEnemy(w.kind, cx, -10 - i * 16);
        break;
      case 'vee':
        for (let i = 0; i < n; i++) {
          const side = i - (n - 1) / 2;
          this.spawnEnemy(w.kind, Phaser.Math.Clamp(cx + side * 16, 8, W - 8), -10 - Math.abs(side) * 12);
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
      weak: stats.weak, resist: stats.resist, burn: 0, burnDmg: 0, burnTick: 0, stun: 0,
    };
    e.setData('e', data);
    this.setupHollow(e, data);
    // Weaver sine amplitude has to stay on screen.
    if (kind === 'weaver') data.baseX = Phaser.Math.Clamp(x, 34, W - 34);
    if (kind === 'gunboat') data.fireIn = 700;
    if (kind === 'raiderlayer') { data.fireIn = 900; e.x = x < W / 2 ? 24 : W - 24; }
    if (kind === 'bomber') {
      e.x = Phaser.Math.Clamp(x, 24, W - 24);
      data.stopY = Phaser.Math.Between(36, 60);
      data.hold = 6000;
      data.fireIn = 900;
      this.tipOnce('bomb', 'BOMBS BURST WIDE\nSHOOT THEM FROM AFAR');
    }
    if (kind === 'bomb') data.aim = 24; // fall speed
    if (kind === 'mine') { data.fireIn = 2200; e.body!.setCircle(3.5); }
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
        d.resist = [own];
        d.weak = ALL_TYPES.filter((t) => t !== own);
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

  private bulletSpeed() {
    return 70 + (this.state.level - 1) * 5; // slow and sparse early on
  }

  private updateEnemies(dt: number) {
    const firing = this.phase === 'action';
    for (const obj of this.enemies.getChildren().slice()) {
      const e = obj as Phaser.Physics.Arcade.Sprite;
      const d = e.getData('e') as EnemyData;
      if (d.wait > 0) { d.wait -= dt * 1000; continue; }
      if (this.tickStatus(e, d, dt)) continue;
      if (d.stun > 0) continue;
      d.t += dt;
      d.fireIn -= dt * 1000;
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
        case 'gunboat':
          // Fly in, park, fire a 4-shot spread (one from each gun tip), then move on.
          if (e.y < d.stopY && d.hold > 0) e.y += 50 * dt;
          else if (d.hold > 0) {
            d.hold -= dt * 1000;
            if (d.fireIn <= 0 && firing) {
              d.fireIn = 1500;
              const tg = this.aimTarget();
              const a = Phaser.Math.Angle.Between(e.x, e.y, tg.x, tg.y);
              // Gun tips: the outer pair reach one pixel lower than the inner pair.
              for (const g of [{ dx: -5, dy: 5, off: -0.3 }, { dx: -3, dy: 4, off: -0.1 }, { dx: 3, dy: 4, off: 0.1 }, { dx: 5, dy: 5, off: 0.3 }])
                this.enemyShoot(e.x + g.dx, e.y + g.dy, a + g.off);
            }
          } else e.y += 40 * dt;
          break;
        case 'bomber':
          // Sinks to its height, edges toward the ship dropping a bomb from under
          // each wing, then flies on down.
          if (e.y < d.stopY && d.hold > 0) e.y += 34 * dt;
          else if (d.hold > 0) {
            d.hold -= dt * 1000;
            e.x += Phaser.Math.Clamp(this.player.x - e.x, -10, 10) * dt;
            if (d.fireIn <= 0 && firing) {
              d.fireIn = 2000;
              this.spawnEnemy('bomb', e.x - 7, e.y + 9);
              this.spawnEnemy('bomb', e.x + 7, e.y + 9);
            }
          } else e.y += 30 * dt;
          break;
        case 'bomb':
          // Falls straight down, slow at first and faster and faster.
          d.aim = Math.min(140, d.aim + 35 * dt);
          e.y += d.aim * dt;
          e.setTexture(Math.floor(d.t * 6) % 2 ? 'bombLit' : 'bomb');
          break;
        case 'raiderlayer':
          // Drop to bombing height, then cross the screen laying mines.
          if (e.y < 44) e.y += 40 * dt;
          else {
            e.x += d.dir * 26 * dt;
            if (d.fireIn <= 0 && firing && e.x > 8 && e.x < W - 8) {
              d.fireIn = 1700;
              this.spawnEnemy('mine', e.x, e.y + 6);
            }
          }
          break;
        case 'mine':
          // Drift down blinking, then burst into a ring of shots, sooner if the ship comes close.
          e.y += 26 * dt;
          e.setTexture(Math.floor(d.t * (d.fireIn < 700 ? 12 : 4)) % 2 ? 'mineLit' : 'mine');
          if (firing && (d.fireIn <= 0 || Phaser.Math.Distance.Between(e.x, e.y, this.player.x, this.player.y) < 22)) {
            for (let i = 0; i < 6; i++) this.enemyShoot(e.x, e.y, (i / 6) * Math.PI * 2 + 0.3, 55);
            this.sparks.explode(6, e.x, e.y);
            e.destroy();
            continue;
          }
          break;
        case 'pmine':
          // Drifts with the nebula until the ship comes close, then arms and bursts.
          e.y += 14 * dt;
          if (d.charge > 0) {
            d.charge -= dt * 1000;
            e.setTexture(Math.floor(d.t * 14) % 2 ? 'pmineLit' : 'pmine');
            if (d.charge <= 0 && firing) {
              for (let i = 0; i < 8; i++) this.enemyShoot(e.x, e.y, (i / 8) * Math.PI * 2, 60);
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
            if (d.hold <= 0) e.y -= 24 * dt;
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
      if (e.y > H + 16 || e.x < -24 || e.x > W + 24 || e.y < -40) e.destroy();
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
      if (e.y < -20) { e.destroy(); return true; }
      return false;
    }
    if (e.y < d.stopY) { e.y += 45 * dt; return false; }
    const nose = { x: e.x, y: e.y + 7 };
    if (d.beam > 0) {
      d.beam -= ms;
      this.drawBeam(nose.x, nose.y, d.aim, 3, 0xd800cc);
      if (firing && this.beamHits(nose.x, nose.y, d.aim, 2.5)) this.hurt();
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
      if (d.step >= 3) { e.y -= 50 * dt; return; }
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

  private clearTimedHazards() {
    this.strikes = [];
    this.flares = [];
    this.fences.forEach((f) => f.posts.forEach((p) => p.destroy()));
    this.fences = [];
    this.flareGlow.setFillStyle(0xf8b800, 0);
    this.act3.clear();
    this.barriers.clear();
    this.sideHaz.clear();
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
  private setupGear() {
    const s = this.state;
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

  private updateGear(dt: number) {
    const s = this.state;
    const now = this.time.now;
    const flying = this.phase === 'action' || this.phase === 'ready';
    const p = this.player;

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

    // Anti-Missile: zaps the nearest enemy shots or seekers.
    if (hasGear(s, 'antimissile') && this.phase === 'action') {
      const st = gearStats.antimissile(gearLevel(s, 'antimissile'));
      this.antiTimer -= dt * 1000;
      if (this.antiTimer <= 0) {
        const near = (o: Phaser.GameObjects.Image) => Phaser.Math.Distance.Between(o.x, o.y, p.x, p.y);
        const seekers = (this.enemies.getChildren() as Phaser.Physics.Arcade.Sprite[]).filter((e) => (e.getData('e') as EnemyData).kind === 'seeker');
        const targets = [...(this.enemyBullets.getChildren() as Phaser.GameObjects.Image[]), ...seekers]
          .filter((o) => near(o) < st.radius).sort((a, b) => near(a) - near(b)).slice(0, st.targets);
        if (targets.length) this.antiTimer = st.interval;
        for (const o of targets) {
          this.zaps.push({ x1: p.x, y1: p.y, x2: o.x, y2: o.y, t: 90, color: 0xfcfcfc });
          this.sparks.explode(3, o.x, o.y);
          o.destroy();
        }
      }
    }

    // Repair Drone: heals 1 every 4 s while it lasts.
    if (this.healDrone) {
      const a = now / 300;
      this.healDrone.setPosition(p.x + Math.cos(a) * 12, p.y - 10 + Math.sin(a) * 3).setVisible(flying);
      if (now >= this.healUntil) { this.healDrone.destroy(); this.healDrone = null; }
      else if (now >= this.healAt && this.phase === 'action') {
        this.healAt = now + 4000;
        if (this.health < this.maxHp) { this.health++; this.refreshHud(); this.flash(this.healDrone); }
      }
    }

    // Afterburner flame and Barrel Roll spin.
    if (now < this.burnUntil && flying) this.beams.fillStyle(Math.floor(now / 50) % 2 ? 0xf8b800 : 0xd82800, 1).fillRect(p.x - 2, p.y + 7, 4, 4 + Math.floor(now / 40) % 3);
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
      this.shot(x, y - 6, 'allyplasma', 0, 190, 1.8, 'plasma').setData('fx', 'homing').setData('splash', 10).setScale(1.3);
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

  private autoFire(dt: number) {
    const s = this.state;
    const fast = this.time.now < this.overdriveUntil;
    s.weapons.forEach((id, slot) => {
      if (!id) return;
      const def = WEAPONS[id];
      const stats = weaponStats(s, id);
      const lv = weaponLevel(s, id);
      this.fireTimers[slot] = (this.fireTimers[slot] ?? 0) - dt * 1000;
      // The Rail Lance glows at the nose while it charges.
      if (def.fx === 'rail' && this.fireTimers[slot] < 380 && this.fireTimers[slot] > 0) {
        const k = 1 - this.fireTimers[slot] / 380;
        this.beams.fillStyle(0xa4e4fc, 0.5 + k * 0.5).fillCircle(this.player.x, this.player.y - 8, 1 + k * 2);
      }
      if (this.fireTimers[slot] > 0) return;
      this.fireTimers[slot] = fast ? stats.interval / 2 : stats.interval;
      // The Overcharger makes every few volleys a charged one.
      this.volleys[slot] = (this.volleys[slot] ?? 0) + 1;
      const charged = hasGear(s, 'overcharge') && this.volleys[slot] % gearStats.overcharge(gearLevel(s, 'overcharge')).every === 0;
      const dtype = this.weaponType(id);
      const burn = def.fx === 'burn' ? stats.damage * 0.7
        : dtype === 'kinetic' && hasGear(s, 'incendiary') ? gearStats.incendiary(gearLevel(s, 'incendiary')).burn : 0;
      const stun = def.dtype === 'laser' && hasGear(s, 'ioncoat') ? gearStats.ioncoat(gearLevel(s, 'ioncoat')).stun : def.fx === 'arc' ? 300 : 0;
      stats.shots.forEach((sh, i) => {
        const back = Math.abs(sh.deg) > 90;
        const b = this.shot(this.player.x + sh.dx, this.player.y + (back ? 7 : -7), def.texture, sh.deg, def.speed ?? 300,
          stats.damage * (charged ? 3 : 1), dtype, lv);
        b.setData('fx', def.fx);
        if (def.splash) b.setData('splash', def.splash + (hasGear(s, 'shaped') ? gearStats.shaped(gearLevel(s, 'shaped')).splash : 0));
        if (burn) b.setData('burn', burn);
        if (stun) b.setData('stun', stun);
        if (def.fx === 'pierce' || def.fx === 'rail') b.setData('hits', new Set());
        if (def.fx === 'wave') b.setData('ox', b.x).setData('phase', i % 2 ? Math.PI : 0);
        if (charged) b.setScale(1.6).setTint(0xfcfcfc);
      });
      if (def.fx === 'rail') {
        this.zaps.push({ x1: this.player.x, y1: this.player.y - 8, x2: this.player.x, y2: -10, t: 110, color: 0xa4e4fc });
      }
    });
  }

  // Shots that steer, weave, burst or fade as they fly.
  private updateShots(dt: number) {
    for (const b of this.playerBullets.getChildren().slice() as Phaser.Physics.Arcade.Image[]) {
      if (!b.active || !b.body) continue;
      const t = (b.getData('t') as number ?? 0) + dt;
      b.setData('t', t);
      switch (b.getData('fx')) {
        case 'homing':
        case 'burn': {
          // Missiles and Bio Seeker spores turn toward the nearest enemy.
          const tg = this.nearestTarget(b.x, b.y);
          if (!tg) break;
          const v = b.body.velocity;
          const speed = Math.hypot(v.x, v.y);
          const a = Phaser.Math.Angle.RotateTo(Math.atan2(v.y, v.x), Phaser.Math.Angle.Between(b.x, b.y, tg.x, tg.y),
            (b.getData('fx') === 'homing' ? 4 : 2) * dt);
          b.setVelocity(Math.cos(a) * speed, Math.sin(a) * speed);
          b.setRotation(a + Math.PI / 2);
          break;
        }
        case 'wave':
          b.x = (b.getData('ox') as number) + Math.sin(t * 14 + (b.getData('phase') as number)) * 9;
          break;
        case 'arc':
          if (t > ARC_LIFE) b.destroy();
          else b.setAlpha(Math.floor(t * 40) % 2 ? 1 : 0.6);
          break;
        case 'flak':
          if (t > FLAK_FUSE) {
            const dmg = (b.getData('dmg') as number) * 0.8;
            for (let i = 0; i < 7; i++) {
              const p = this.shot(b.x, b.y, 'shrap', -60 + i * 20, 200, dmg, 'explosive', this.shotInfo.get(b)?.lv);
              p.setData('fx', 'shrap');
            }
            this.sparks.explode(5, b.x, b.y);
            b.destroy();
          }
          break;
        case 'shrap':
          if (t > 0.35) b.destroy();
          break;
        case 'bomb':
          if (t > BOMB_FUSE) this.blast(b);
          break;
      }
    }
  }

  // Where a missile should head: the nearest enemy that can be hit, or the boss.
  private nearestTarget(x: number, y: number) {
    let best: { x: number; y: number } | null = null;
    let bestD = 160;
    for (const e of this.enemies.getChildren() as Phaser.Physics.Arcade.Sprite[]) {
      const d = e.getData('e') as EnemyData;
      if (d.cloaked || e.y < 0 || ['mine', 'bomb', 'pmine', 'boulder'].includes(d.kind)) continue;
      const dist = Phaser.Math.Distance.Between(x, y, e.x, e.y);
      if (dist < bestD) { bestD = dist; best = e; }
    }
    return best ?? this.boss?.aimPoint?.() ?? null;
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
  typedDamage(dmg: number, dtype: DType | null, weak: DType[], resist: DType[]) {
    if (!dtype) return dmg;
    let m = typeMultiplier(dtype, weak, resist);
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

  // What a player shot does to a boss part with these weaknesses.
  shotDamage(b: Phaser.GameObjects.Image, weak: DType[], resist: DType[]) {
    if (this.plasmaSplash(b)) this.blobHitAt = this.time.now;
    this.hitFx(b);
    const info = this.shotInfo.get(b);
    return this.typedDamage(info?.dmg ?? 1, info?.dtype ?? 'kinetic', weak, resist);
  }

  private hitEnemy(b: Phaser.Physics.Arcade.Image, e: Phaser.Physics.Arcade.Sprite) {
    if (!b.active || !e.active) return;
    const d = e.getData('e') as EnemyData;
    if (d.cloaked) return; // shots pass through a cloaked Phantom
    // Piercing shots hit each enemy once and fly on.
    const hits = b.getData('hits') as Set<unknown> | undefined;
    if (hits) {
      if (hits.has(e)) return;
      hits.add(e);
    } else if (b.getData('fx') === 'bomb') {
      this.blast(b);
      return;
    } else b.destroy();
    const dtype = (b.getData('dtype') as DType) ?? 'kinetic';
    const dmg = (b.getData('dmg') as number) ?? 1;
    // A Bulwark's shield takes shots from below until it breaks. Ion breaks it fast.
    if (d.shieldImg && b.y > e.y) {
      d.shield -= dmg * (dtype === 'ion' ? 3 : 1);
      if (d.shield > 0) { this.flash(d.shieldImg); this.tink(b.x, b.y); return; }
      this.sparks.explode(12, d.shieldImg.x, d.shieldImg.y);
      d.shieldImg.destroy();
      d.shieldImg = null;
      return;
    }
    const stun = b.getData('stun') as number | undefined;
    if (stun && !ENEMY_STATS[d.kind].organic) d.stun = Math.max(d.stun, stun);
    const burn = b.getData('burn') as number | undefined;
    if (burn) { d.burn = 2000; d.burnDmg = burn; d.burnTick = Math.min(d.burnTick || 400, 400); }
    const dead = this.damageEnemy(e, dmg, dtype);
    this.hitFx(b);
    if (this.plasmaSplash(b, (b.x + e.x) / 2, (b.y + e.y) / 2) && !dead) this.plasmaFlash(e);
    if (b.getData('fx') === 'arc' || b.getData('chain')) this.chainArc(e, dmg, dtype);
    if (b.getData('splash')) this.splash(e.x, e.y, b.getData('splash') as number, dmg / 2, dtype, dead ? null : e);
  }

  // Returns true if the hit killed it.
  private damageEnemy(e: Phaser.Physics.Arcade.Sprite, dmg: number, dtype: DType | null) {
    if (!e.active) return true;
    const d = e.getData('e') as EnemyData;
    d.hp -= this.typedDamage(dmg, dtype, d.weak, d.resist);
    if (d.hp <= 0) { this.killEnemy(e, true); return true; }
    this.flash(e);
    return false;
  }

  // Explosive splash: everything else within `r` takes `dmg`.
  private splash(x: number, y: number, r: number, dmg: number, dtype: DType, skip: unknown) {
    const ring = this.add.circle(x, y, r, 0xf8b800, 0.35).setDepth(12);
    this.tweens.add({ targets: ring, alpha: 0, duration: 160, onComplete: () => ring.destroy() });
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

  // Ion Arc: lightning jumps from the target to the two nearest enemies.
  private chainArc(from: Phaser.Physics.Arcade.Sprite, dmg: number, dtype: DType) {
    let at = { x: from.x, y: from.y };
    const done = new Set<unknown>([from]);
    for (let jump = 0; jump < 2; jump++) {
      const next = (this.enemies.getChildren() as Phaser.Physics.Arcade.Sprite[])
        .filter((o) => o.active && !done.has(o) && !(o.getData('e') as EnemyData).cloaked
          && Phaser.Math.Distance.Between(at.x, at.y, o.x, o.y) < 46)
        .sort((a, b) => Phaser.Math.Distance.Between(at.x, at.y, a.x, a.y) - Phaser.Math.Distance.Between(at.x, at.y, b.x, b.y))[0];
      if (!next) return;
      done.add(next);
      this.zaps.push({ x1: at.x, y1: at.y, x2: next.x, y2: next.y, t: 120, color: DTYPE_COLOR.ion });
      at = { x: next.x, y: next.y };
      const d = next.getData('e') as EnemyData;
      if (!ENEMY_STATS[d.kind].organic) d.stun = Math.max(d.stun, 300);
      this.damageEnemy(next, dmg * 0.7, dtype);
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
      if (d.cloaked || !d.weak.length) continue;
      d.weak.slice(0, 4).forEach((t, i) => {
        this.beams.fillStyle(DTYPE_COLOR[t], 1).fillRect(Math.round(e.x - d.weak.length * 2 + i * 4), Math.round(e.y - e.height / 2 - 4), 3, 2);
      });
    }
  }

  private killEnemy(e: Phaser.Physics.Arcade.Sprite, drop: boolean) {
    if (!e.active) return;
    const d = e.getData('e') as EnemyData;
    this.sparks.explode(10, e.x, e.y);
    const stats = ENEMY_STATS[d.kind];
    this.state.kills[d.kind] = (this.state.kills[d.kind] ?? 0) + 1;
    if (drop && Math.random() < stats.dropChance) this.dropCoin(e.x, e.y, Phaser.Math.Between(...stats.credits));
    const { x, y } = e;
    e.destroy();
    // Spore Pods and Husks burst into seekers when shot down.
    if (drop && d.kind === 'spore') for (let i = 0; i < 3; i++) this.spawnEnemy('seeker', x + (i - 1) * 4, y);
    if (drop && d.kind === 'husk') for (let i = 0; i < 2; i++) this.spawnEnemy('seeker', x + (i ? 5 : -5), y);
    if (d.kind === 'bomb') this.bombBurst(x, y);
  }

  // A Bomb going off, shot or rammed: the blast hurts the ship if it is close.
  private bombBurst(x: number, y: number) {
    const r = 22;
    const ring = this.add.circle(x, y, r, 0xfc7460, 0.45).setDepth(12);
    this.tweens.add({ targets: ring, alpha: 0, scale: 1.15, duration: 220, onComplete: () => ring.destroy() });
    this.sparks.explode(14, x, y);
    if (Phaser.Math.Distance.Between(x, y, this.player.x, this.player.y) <= r) this.hurt();
  }

  // Credits drop as metal bars: bronze, silver, gold, and a stack of gold for big ones.
  // Act 3 drops are worth a little more, and a Credit Booster adds half again.
  dropCoin(x: number, y: number, value: number, vx = Phaser.Math.Between(-10, 10), vy = 26) {
    if (this.state.level >= 9) value = Math.round(value * (1 + (this.state.level - 8) * 0.06));
    if (this.boostSegment === this.segment) value = Math.round(value * 1.5);
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
    c.destroy();
    this.refreshHud();
    this.creditsText.setScale(1.3);
    this.tweens.add({ targets: this.creditsText, scale: 1, duration: 150 });
  }

  // An enemy shot reaching the ship. A Barrel Roll sends it back as the ship's own.
  private shotHitShip(b: Phaser.Physics.Arcade.Image) {
    if (!b.active) return;
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
  // the ram can finish) are smashed without a scratch.
  private rammed(e: Phaser.Physics.Arcade.Sprite) {
    const d = e.getData('e') as EnemyData;
    if (d.cloaked) return;
    if (this.time.now < this.burnUntil) {
      const ram = gearStats.afterburner(gearLevel(this.state, 'afterburner')).ram;
      if (ENEMY_STATS[d.kind].light || d.hp <= ram) { this.killEnemy(e, true); return; }
    }
    this.killEnemy(e, false);
    this.hurt();
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
        this.cameras.main.once('camerafadeoutcomplete', () => this.scene.restart({ state: start, resume: { save, segment: this.checkpoint.segment }, side: this.side ?? undefined }));
      });
      return;
    }
    this.time.delayedCall(900, () => {
      text(this, W / 2, H / 2 - 16, 'SHIP DESTROYED', COLOR.red).setOrigin(0.5).setDepth(1000);
      text(this, W / 2, H / 2 + 2, 'RETURNING TO BASE', COLOR.gray).setOrigin(0.5).setDepth(1000);
    });
    // Credits and items earned this level are lost; replay from the start.
    this.time.delayedCall(3000, () => this.leaveTo('Base', this.startState));
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
      queen: () => new BroodQueen(this, done, { hp: 4 }),
      mind: () => new HollowMind(this, done),
      sporeheart: () => new Sporeheart(this, done),
      wyrm: () => new Wyrm(this, done),
      // 1.8x Rockjaw, then half again for the armor and the core alike.
      frostjaw: () => new Rockjaw(this, done, { skin: 'frostjaw', hp: 2.7, shards: true }),
      hollowwatcher: () => new Watcher(this, done, { tint: 0xd800cc, hp: 5.2 }),
      broodmother: () => new BroodQueen(this, done, { tint: 0x58d854, hp: 8.8 }),
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
    this.checkpoint = { save: cloneSave(this.state), segment: next };
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
        this.setTheme('rift');
        this.player.setAngle(0).setScale(1).setAlpha(1).setPosition(W / 2, H - 50);
        this.allies.forEach((a) => a.img.setPosition(this.player.x + a.ox, H + 20));
        this.cameras.main.fadeIn(600);
        this.time.delayedCall(700, () => this.radio('VEX: WE FOLLOWED YOU\nIN. STAY CLOSE, PILOT.'));
        this.startNextSegment();
      });
    });
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
    this.setupGear();
    this.refreshHud();
    // A Rewind Beacon would restart from here.
    this.checkpoint = { save: cloneSave(this.state), segment: this.segment + 1 };
    this.cameras.main.fadeIn(350);
    this.startNextSegment();
  }

  private levelClear(skipLinger = false) {
    if (this.phase !== 'action') return;
    this.phase = 'clear';
    this.player.setVisible(true);
    this.enemyBullets.clear(true, true);
    this.clearTimedHazards();
    const last = !this.side && this.state.level === LEVELS.length;
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
    if (!this.state.seen.includes(kind)) this.state.seen.push(kind);
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
    const edt = slow ? dt / 2 : dt;
    this.scroll(dt, speed);
    if (this.scenery) this.scenery.tilePositionY -= 11 * speed * dt;
    if (this.planet) this.planet.y += 1.2 * dt;
    if (this.fog) { this.fog.tilePositionY -= 6 * dt; this.fog.tilePositionX += 2 * dt; }
    for (const p of this.patches.slice()) {
      p.y += 30 * speed * dt;
      if (p.y > H + 30) { p.destroy(); this.patches.splice(this.patches.indexOf(p), 1); }
    }
    this.beams.clear();

    if (this.phase === 'action') {
      this.move(dt);
      this.autoFire(dt);
      this.runWaves(dt);
      this.runHazards(dt);
      this.runWarps(dt);
    } else if (this.lingering) this.move(dt);
    this.updateShots(dt);
    this.updateEnemies(edt);
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
    this.updateAllies(dt);
    this.drawZaps(dt);
    this.drawPops(dt);
    this.drawScanner();
    this.drawRift();
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
