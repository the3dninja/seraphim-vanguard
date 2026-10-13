import Phaser from 'phaser';
import { COLOR, W, H } from '../config';
import { GEAR, ITEMS, WEAPONS, gearStats, stackLabel } from '../data/items';
import { LEVELS, type EnemyKind, type LevelDef, type Wave } from '../data/levels';
import { equippedGear, gearLevel, hasGear, totalMaxHealth, weaponStats } from '../inventory';
import { Dreadnought } from '../dreadnought';
import { Rockjaw } from '../rockjaw';
import { Watcher } from '../watcher';
import { cloneSave, type SaveData } from '../save';
import { starfield, text, toast } from '../ui';

type Phase = 'action' | 'arrival' | 'vendor' | 'ready' | 'dead' | 'clear';
// Mines are dropped by Bombers, proximity mines (pmine) by Mine Layers, and
// boulders are thrown by Rockjaw; all can be shot down.
type FoeKind = EnemyKind | 'mine' | 'pmine' | 'boulder';

interface EnemyData {
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
  aim: number; // Lancer: the angle its beam is locked to
  charge: number; // Lancer: ms of warning line left before the beam
  beam: number; // Lancer: ms the beam stays on
  shield: number; // Bulwark: shield health left
  shieldImg: Phaser.GameObjects.Image | null;
  cloaked: boolean; // Phantom: can't be hit or rammed while cloaked
}

// Level hazards that live a while and are drawn every frame.
interface Strike { x: number; t: number } // lightning: ms since the column started flashing
interface Flare { rock: Phaser.Physics.Arcade.Image; t: number; sweepY: number } // ms since the rock appeared
interface Fence { y: number; t: number; posts: Phaser.GameObjects.Image[] } // t: ms into its on/off cycle

const ENEMY_STATS: Record<FoeKind, { hp: number; texture: string; dropChance: number; credits: [number, number] }> = {
  dart: { hp: 1, texture: 'dart', dropChance: 0.5, credits: [2, 4] },
  weaver: { hp: 3, texture: 'weaver', dropChance: 0.8, credits: [5, 9] },
  drone: { hp: 1, texture: 'drone', dropChance: 0.3, credits: [1, 3] },
  gunboat: { hp: 8, texture: 'gunboat', dropChance: 0.9, credits: [10, 16] },
  bomber: { hp: 6, texture: 'bomber', dropChance: 0.9, credits: [10, 18] },
  driller: { hp: 4, texture: 'driller', dropChance: 0.6, credits: [6, 12] },
  lancer: { hp: 6, texture: 'lancer', dropChance: 0.8, credits: [8, 14] },
  bulwark: { hp: 14, texture: 'bulwark', dropChance: 0.9, credits: [18, 30] },
  minelayer: { hp: 7, texture: 'minelayer', dropChance: 0.85, credits: [8, 14] },
  carrier: { hp: 22, texture: 'carrier', dropChance: 0.95, credits: [20, 32] },
  phantom: { hp: 5, texture: 'phantom', dropChance: 0.85, credits: [9, 15] },
  mine: { hp: 1, texture: 'mine', dropChance: 0, credits: [0, 0] },
  pmine: { hp: 1, texture: 'pmine', dropChance: 0, credits: [0, 0] },
  boulder: { hp: 3, texture: 'boulder', dropChance: 0, credits: [0, 0] },
};

const SHIP_SPEED_KEYS = 110; // px/s with keyboard
const ICE_GRIP = 2.2; // how fast the ship's speed catches up with the controls on ice (per second)
const BULWARK_SHIELD = 12;
const LANCER_WARN = 850; // ms the warning line shows before a Lancer fires
const BOSS_NAMES = { rockjaw: 'ROCKJAW', dreadnought: 'DREADNOUGHT', watcher: 'THE WATCHER' };
const STRIKE_WARN = 900; // ms a lightning column flashes before the bolt
const STRIKE_HIT = 260; // ms the bolt stays
const FLARE_WARN = 3000; // ms from the shelter rock appearing to the flare sweeping down
const FENCE_CYCLE = [1500, 450, 1100]; // ms off, warning flicker, on
const ITEM_KEYS = ['ONE', 'TWO', 'THREE'];

// Playtest helper: add ?god to the URL and the ship can't be destroyed.
const GOD_MODE = new URLSearchParams(location.search).has('god');

export class GameScene extends Phaser.Scene {
  private startState!: SaveData; // what to go back to if the ship is destroyed
  state!: SaveData;
  private level!: LevelDef;
  private health = 0;

  player!: Phaser.Physics.Arcade.Sprite;
  private bubble!: Phaser.GameObjects.Image;
  playerBullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private coins!: Phaser.Physics.Arcade.Group;
  private hazards!: Phaser.Physics.Arcade.Group;
  private patches: Phaser.GameObjects.Image[] = []; // ice sheets: harmless, but slippery
  private slide = { x: 0, y: 0 }; // ship velocity, which lags behind the controls on ice
  beams!: Phaser.GameObjects.Graphics; // Lancer and boss lasers, redrawn every frame
  sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private scroll!: ReturnType<typeof starfield>;
  private scenery: Phaser.GameObjects.TileSprite | null = null;
  private planet: Phaser.GameObjects.Image | null = null;

  phase: Phase = 'action';
  private segment = 0;
  private waveIndex = 0;
  private waveTimer = 0;
  private hazardIn: number[] = [];
  private boss: Rockjaw | Dreadnought | Watcher | null = null;
  private strikes: Strike[] = [];
  private flares: Flare[] = [];
  private fences: Fence[] = [];
  private flareGlow!: Phaser.GameObjects.Rectangle;

  // Gear
  private maxHp = 5;
  private deflect = 0; // Deflector charges ready
  private deflectAt = 0; // when the next charge comes back
  private deflectRing!: Phaser.GameObjects.Image;
  private sats: Phaser.GameObjects.Image[] = [];
  private satTimer = 0;
  private bossBar: Phaser.GameObjects.Graphics | null = null;
  private bossName: Phaser.GameObjects.Text | null = null;

  private fireTimers: number[] = [];
  private invulnUntil = 0;
  private shieldUntil = 0;
  private overdriveUntil = 0;

  private dragFrom: { px: number; py: number; sx: number; sy: number; tx: number; ty: number } | null = null;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;

  private hearts: Phaser.GameObjects.Image[] = [];
  private creditsText!: Phaser.GameObjects.Text;
  private itemButtons: { box: Phaser.GameObjects.Rectangle; icon: Phaser.GameObjects.Image; count: Phaser.GameObjects.Text }[] = [];
  private weaponIcons: Phaser.GameObjects.Image[] = [];
  private gearIcons: Phaser.GameObjects.Image[] = [];
  private tipsShown = new Set<string>();
  private tipFreeAt = 0; // when the tip on screen is done blinking

  constructor() { super('Game'); }

  init(data: { state: SaveData }) {
    this.startState = cloneSave(data.state);
    this.state = cloneSave(data.state);
    this.level = LEVELS[this.state.level - 1];
    this.maxHp = totalMaxHealth(this.state);
    this.health = this.maxHp;
    this.phase = 'action';
    this.strikes = [];
    this.flares = [];
    this.fences = [];
    this.sats = [];
    this.satTimer = 0;
    this.deflect = 0;
    this.deflectAt = 0;
    this.segment = 0;
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
    this.dragFrom = null;
    this.hearts = [];
    this.itemButtons = [];
    this.weaponIcons = [];
    this.gearIcons = [];
    this.tipsShown = new Set();
    this.tipFreeAt = 0;
    this.scenery = null;
    this.planet = null;
  }

  create() {
    this.cameras.main.fadeIn(300);
    this.scroll = starfield(this);
    const theme = this.level.theme;
    if (theme !== 'outpost') this.scenery = this.add.tileSprite(0, 0, W, H, `scenery_${theme}`).setOrigin(0);
    if (theme === 'outpost') this.planet = this.add.image(132, 60, 'planet');
    if (theme === 'blockade') this.planet = this.add.image(40, 70, 'moon');
    if (theme === 'forge') this.planet = this.add.image(150, -6, 'sun').setAlpha(0.85);
    this.resetHazardTimers(4000);

    this.playerBullets = this.physics.add.group();
    this.hazards = this.physics.add.group();
    this.enemies = this.physics.add.group();
    this.enemyBullets = this.physics.add.group();
    this.coins = this.physics.add.group();
    this.beams = this.add.graphics().setDepth(12);

    this.player = this.physics.add.sprite(W / 2, H - 50, 'ship').setDepth(10);
    this.player.body!.setSize(5, 7).setOffset(4, 3); // small hitbox, NES-shooter fair
    this.bubble = this.add.image(0, 0, 'bubble').setDepth(11).setVisible(false);
    this.deflectRing = this.add.image(0, 0, 'deflect').setDepth(11).setVisible(false);
    this.flareGlow = this.add.rectangle(0, 0, W, H, 0xf8b800, 0).setOrigin(0).setDepth(5); // under the ship and the shadow lane
    this.setupGear();

    this.sparks = this.add.particles(0, 0, 'px', {
      speed: { min: 20, max: 90 }, lifespan: { min: 200, max: 500 }, scale: { start: 1, end: 0 },
      tint: [0xfcfcfc, 0xf8b800, 0xd82800], emitting: false,
    }).setDepth(20);

    const img = (o: unknown) => o as Phaser.Physics.Arcade.Image;
    const spr = (o: unknown) => o as Phaser.Physics.Arcade.Sprite;
    this.physics.add.overlap(this.playerBullets, this.enemies, (b, e) => this.hitEnemy(img(b), spr(e)));
    this.physics.add.overlap(this.playerBullets, this.hazards, (b, h) => this.hitHazard(img(b), img(h)));
    this.physics.add.overlap(this.enemyBullets, this.hazards, (b) => b.destroy());
    this.physics.add.overlap(this.player, this.enemyBullets, (_p, b) => { b.destroy(); this.hurt(); });
    this.physics.add.overlap(this.player, this.enemies, (_p, e) => {
      if ((spr(e).getData('e') as EnemyData).cloaked) return;
      this.killEnemy(spr(e), false);
      this.hurt();
    });
    this.physics.add.overlap(this.player, this.hazards, () => this.hurt());
    this.physics.add.overlap(this.player, this.coins, (_p, c) => this.collect(img(c)));

    this.setupInput();
    this.createHud();

    const intro = [
      text(this, W / 2, H / 2 - 40, `LEVEL ${this.state.level}`, COLOR.gray),
      text(this, W / 2, H / 2 - 26, this.level.name, COLOR.white),
    ].map((t) => t.setOrigin(0.5).setDepth(1000));
    this.tweens.add({ targets: intro, alpha: 0, delay: 1800, duration: 400 });
    if (this.state.level === 1) this.time.delayedCall(2400, () => this.blinkTip('DRAG TO MOVE'));

    this.events.off('resume');
    this.events.on('resume', () => this.afterVendor());
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
      if (!this.dragFrom || !p.isDown || this.phase !== 'action') return;
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
  }

  // How far the controls ask the ship to move this frame: keyboard first, then
  // the drag target. Touch flies toward the target at keyboard speed, landing
  // exactly on it once it's within one frame's step so the ship doesn't jitter.
  private wantedStep(dt: number) {
    const k = this.keys;
    const kx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    const ky = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    if (kx || ky) {
      this.dragFrom = null;
      return { x: kx * SHIP_SPEED_KEYS * dt, y: ky * SHIP_SPEED_KEYS * dt };
    }
    if (!this.dragFrom) return { x: 0, y: 0 };
    const dx = this.dragFrom.tx - this.player.x;
    const dy = this.dragFrom.ty - this.player.y;
    const dist = Math.hypot(dx, dy);
    const step = SHIP_SPEED_KEYS * dt;
    if (dist <= step) return { x: dx, y: dy };
    return { x: (dx / dist) * step, y: (dy / dist) * step };
  }

  // On ice the ship's speed only slowly catches up with the controls, so it
  // drifts on after letting go and swings past where it was aimed.
  private move(dt: number) {
    if (dt <= 0) return;
    const want = this.wantedStep(dt);
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

    // Weapon readout bottom left with gear above it, one item button per slot
    // bottom right (big enough for a thumb), each showing its stack like 1/3.
    this.state.weapons.forEach((_w, i) => this.weaponIcons.push(this.add.image(10 + i * 12, H - 12, 'icon_pulse').setDepth(900)));
    for (let i = 0; i < 2; i++) this.gearIcons.push(this.add.image(10 + i * 12, H - 24, 'icon_plating').setDepth(900).setAlpha(0.8));
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
    const gear = equippedGear(this.state);
    this.gearIcons.forEach((g, i) => g.setVisible(!!gear[i]).setTexture(gear[i] ? GEAR[gear[i]].icon : 'icon_plating'));
    this.state.items.forEach((item, i) => {
      const b = this.itemButtons[i];
      b.icon.setVisible(!!item);
      b.count.setText(item ? stackLabel(item) : '');
      if (item) b.icon.setTexture(ITEMS[item.id].icon);
      b.box.setStrokeStyle(1, item ? 0xfcfcfc : 0x3c3c3c);
    });
  }

  // Tips take turns, so two that come up together don't print over each other.
  private blinkTip(msg: string) {
    const wait = this.tipFreeAt - this.time.now;
    if (wait > 0) {
      this.tipFreeAt += 2500;
      this.time.delayedCall(wait, () => this.showTip(msg));
      return;
    }
    this.tipFreeAt = this.time.now + 2500;
    this.showTip(msg);
  }

  private showTip(msg: string) {
    const t = text(this, W / 2, H / 2 + 30, msg, COLOR.yellow).setOrigin(0.5).setDepth(1000);
    t.setAlign('center');
    this.tweens.add({ targets: t, alpha: 0.2, yoyo: true, repeat: 3, duration: 300, onComplete: () => t.destroy() });
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
    if (item.id === 'repair') {
      if (this.health >= this.maxHp) { toast(this, 'HEALTH IS FULL', H / 2 + 30, 600); return; }
      this.health = Math.min(this.maxHp, this.health + 2);
    } else if (item.id === 'shield') {
      this.shieldUntil = this.time.now + 5000;
    } else if (item.id === 'overdrive') {
      this.overdriveUntil = this.time.now + 8000;
    }
    item.count--;
    if (item.count <= 0) this.state.items[slot] = null;
    this.refreshHud();
  }

  // --- Waves -----------------------------------------------------------------

  private runWaves(dt: number) {
    if (this.boss) return;
    const waves = this.level.segments[this.segment];
    const wave = waves[this.waveIndex];
    if (!wave) {
      if (this.enemies.countActive() === 0) this.endSegment();
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
    const cx = (w.x ?? 0.5) * W;
    switch (w.pattern) {
      case 'single':
        this.spawnEnemy(w.kind, cx, -10);
        break;
      case 'pair':
        this.spawnEnemy(w.kind, W * 0.3, -10);
        this.spawnEnemy(w.kind, W * 0.7, -10);
        break;
      case 'line':
        for (let i = 0; i < n; i++) this.spawnEnemy(w.kind, ((i + 0.5) / n) * (W - 20) + 10, -10);
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
    const e = this.enemies.create(x, y, stats.texture) as Phaser.Physics.Arcade.Sprite;
    const data: EnemyData = {
      kind, hp: stats.hp, t: 0, baseX: x, fireIn: Phaser.Math.Between(900, 2200),
      dir: x < W / 2 ? 1 : -1, wait: 0, stopY: Phaser.Math.Between(46, 80), hold: 5000,
      step: 0, aim: 0, charge: 0, beam: 0, shield: 0, shieldImg: null, cloaked: false,
    };
    e.setData('e', data);
    // Weaver sine amplitude has to stay on screen.
    if (kind === 'weaver') data.baseX = Phaser.Math.Clamp(x, 34, W - 34);
    if (kind === 'gunboat') data.fireIn = 700;
    if (kind === 'bomber') { data.fireIn = 900; e.x = x < W / 2 ? 24 : W - 24; }
    if (kind === 'mine') { data.fireIn = 2200; e.body!.setCircle(3.5); }
    if (kind === 'pmine') e.body!.setCircle(3.5);
    if (kind === 'minelayer') {
      data.baseX = Phaser.Math.Clamp(x, 44, W - 44);
      data.stopY = Phaser.Math.Between(40, 90);
      data.fireIn = 1100;
      if (this.state.level === 6) this.tipOnce('pmine', 'MINES BURST WHEN\nYOU GET CLOSE');
    }
    if (kind === 'carrier') {
      data.stopY = Phaser.Math.Between(38, 58);
      data.fireIn = 500;
      data.hold = 1400;
      if (this.state.level === 7) this.tipOnce('carrier', 'CARRIERS LAUNCH DARTS');
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

  private bulletSpeed() {
    return 70 + (this.state.level - 1) * 5; // slow and sparse early on
  }

  private updateEnemies(dt: number) {
    const firing = this.phase === 'action';
    for (const obj of this.enemies.getChildren().slice()) {
      const e = obj as Phaser.Physics.Arcade.Sprite;
      const d = e.getData('e') as EnemyData;
      if (d.wait > 0) { d.wait -= dt * 1000; continue; }
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
          // Fly in, park, fire 3-shot spreads, then move on.
          if (e.y < d.stopY && d.hold > 0) e.y += 50 * dt;
          else if (d.hold > 0) {
            d.hold -= dt * 1000;
            if (d.fireIn <= 0 && firing) {
              d.fireIn = 1500;
              const a = Phaser.Math.Angle.Between(e.x, e.y, this.player.x, this.player.y);
              for (const off of [-0.28, 0, 0.28]) this.enemyShoot(e.x, e.y + 6, a + off);
            }
          } else e.y += 40 * dt;
          break;
        case 'bomber':
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
        d.aim = Phaser.Math.Angle.Between(nose.x, nose.y, this.player.x, this.player.y);
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

  // A straight laser from (x, y) at `angle` to the edge of the screen.
  drawBeam(x: number, y: number, angle: number, width: number, color: number, alpha = 1) {
    const len = 420;
    const g = this.beams;
    g.lineStyle(width, color, alpha);
    g.lineBetween(x, y, x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    if (width > 1) {
      g.lineStyle(1, 0xfcfcfc, alpha);
      g.lineBetween(x, y, x + Math.cos(angle) * len, y + Math.sin(angle) * len);
    }
  }

  // Whether the ship is within `reach` px of a beam's center line.
  beamHits(x: number, y: number, angle: number, reach: number) {
    const px = this.player.x - x, py = this.player.y - y;
    const along = px * Math.cos(angle) + py * Math.sin(angle);
    if (along < 0) return false;
    return Math.abs(-px * Math.sin(angle) + py * Math.cos(angle)) <= reach;
  }

  // Fires at `angle`, or at the player if no angle is given.
  enemyShoot(x: number, y: number, angle?: number, speed = this.bulletSpeed()) {
    const b = this.enemyBullets.create(x, y, 'ebullet') as Phaser.Physics.Arcade.Image;
    b.body!.setCircle(1.5, 0.5, 0.5);
    const a = angle ?? Phaser.Math.Angle.Between(x, y, this.player.x, this.player.y);
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

  private resetHazardTimers(first: number) {
    this.hazardIn = (this.level.hazards ?? []).map((_hz, i) => first + i * 2500);
  }

  private runHazards(dt: number) {
    if (this.boss) return;
    (this.level.hazards ?? []).forEach((hz, i) => {
      this.hazardIn[i] -= dt * 1000;
      if (this.hazardIn[i] > 0) return;
      this.hazardIn[i] = Phaser.Math.Between(...hz.every);
      if (hz.kind === 'patch') this.spawnPatch();
      else if (hz.kind === 'turret') this.edgeTurret();
      else if (hz.kind === 'lightning') this.spawnStrike();
      else if (hz.kind === 'flare') this.spawnFlare();
      else if (hz.kind === 'fence') this.spawnFence();
      else this.spawnHazard(hz.kind, Phaser.Math.Between(16, W - 16), -14);
    });
  }

  private spawnHazard(kind: 'debris' | 'rock' | 'shard' | 'pebble' | 'shelter', x: number, y: number) {
    const tex = kind === 'debris' ? Phaser.Utils.Array.GetRandom(['debris1', 'debris2']) : kind;
    const h = this.hazards.create(x, y, tex) as Phaser.Physics.Arcade.Image;
    h.setData('kind', kind);
    if (kind === 'shelter') {
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
    if (this.state.level === 6) this.tipOnce('lightning', 'MOVE WHEN A\nCOLUMN FLASHES');
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
          if (this.state.level === 7) this.tipOnce('flare', 'FLARE COMING!\nHIDE UNDER THE ROCK');
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
  }

  private hitHazard(b: Phaser.Physics.Arcade.Image, h: Phaser.Physics.Arcade.Image) {
    if (!b.active || !h.active) return;
    b.destroy();
    if (h.getData('kind') === 'debris' || h.getData('kind') === 'shelter') { this.tink(b.x, b.y); return; }
    const hp = (h.getData('hp') as number) - ((b.getData('dmg') as number) ?? 1);
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
      this.dropCoin(h.x, h.y, Phaser.Math.Between(1, 3));
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

    // Deflector: charges come back one at a time.
    if (hasGear(s, 'deflector')) {
      const st = gearStats.deflector(gearLevel(s, 'deflector'));
      if (this.deflect < st.hits && now >= this.deflectAt) {
        this.deflect++;
        if (this.deflect < st.hits) this.deflectAt = now + st.recharge;
      }
      this.deflectRing.setVisible(flying && this.deflect > 0 && this.player.visible)
        .setPosition(this.player.x, this.player.y).setAlpha(this.deflect > 1 ? 0.8 : 0.45);
    }

    // Credit Magnet: drops inside the radius drift to the ship.
    if (hasGear(s, 'magnet') && this.phase === 'action') {
      const st = gearStats.magnet(gearLevel(s, 'magnet'));
      for (const c of this.coins.getChildren() as Phaser.Physics.Arcade.Image[]) {
        if (!c.body?.enable) continue;
        const dist = Phaser.Math.Distance.Between(c.x, c.y, this.player.x, this.player.y);
        if (dist > st.radius) continue;
        const a = Phaser.Math.Angle.Between(c.x, c.y, this.player.x, this.player.y);
        c.setVelocity(Math.cos(a) * st.pull, Math.sin(a) * st.pull);
      }
    }

    // Satellites circle the ship and fire straight up.
    if (this.sats.length) {
      const st = gearStats.satellite(gearLevel(s, 'satellite'));
      this.sats.forEach((sat, i) => {
        const a = (now / 1000) * 3 + (i * Math.PI * 2) / this.sats.length;
        sat.setPosition(this.player.x + Math.cos(a) * 15, this.player.y + Math.sin(a) * 11);
        sat.setVisible(flying && this.player.scale === 1);
      });
      this.satTimer -= dt * 1000;
      if (this.phase === 'action' && this.satTimer <= 0) {
        this.satTimer = st.interval;
        for (const sat of this.sats) {
          const b = this.playerBullets.create(sat.x, sat.y - 3, 'satshot') as Phaser.Physics.Arcade.Image;
          b.setData('dmg', st.damage);
          b.setVelocity(0, -260);
        }
      }
    }
  }

  // --- Combat ----------------------------------------------------------------

  private autoFire(dt: number) {
    const fast = this.time.now < this.overdriveUntil;
    this.state.weapons.forEach((id, slot) => {
      if (!id) return;
      const stats = weaponStats(this.state, id);
      this.fireTimers[slot] = (this.fireTimers[slot] ?? 0) - dt * 1000;
      if (this.fireTimers[slot] > 0) return;
      this.fireTimers[slot] = fast ? stats.interval / 2 : stats.interval;
      for (const shot of stats.shots) {
        const b = this.playerBullets.create(this.player.x + shot.dx, this.player.y - 7, WEAPONS[id].texture) as Phaser.Physics.Arcade.Image;
        b.setData('dmg', stats.damage);
        const rad = Phaser.Math.DegToRad(shot.deg - 90);
        b.setVelocity(Math.cos(rad) * 300, Math.sin(rad) * 300);
      }
    });
  }

  flash(o: Phaser.GameObjects.Image | Phaser.GameObjects.Sprite) {
    o.setTintFill(0xffffff);
    this.time.delayedCall(50, () => o.active && o.clearTint());
  }

  // A shot that can't hurt what it hit: a small gray spark.
  tink(x: number, y: number) {
    this.sparks.explode(2, x, y);
  }

  private hitEnemy(b: Phaser.Physics.Arcade.Image, e: Phaser.Physics.Arcade.Sprite) {
    if (!b.active || !e.active) return;
    const d = e.getData('e') as EnemyData;
    if (d.cloaked) return; // shots pass through a cloaked Phantom
    b.destroy();
    const dmg = (b.getData('dmg') as number) ?? 1;
    // A Bulwark's shield takes shots from below until it breaks.
    if (d.shieldImg && b.y > e.y) {
      d.shield -= dmg;
      if (d.shield > 0) { this.flash(d.shieldImg); this.tink(b.x, b.y); return; }
      this.sparks.explode(12, d.shieldImg.x, d.shieldImg.y);
      d.shieldImg.destroy();
      d.shieldImg = null;
      return;
    }
    d.hp -= dmg;
    if (d.hp <= 0) this.killEnemy(e, true);
    else this.flash(e);
  }

  private killEnemy(e: Phaser.Physics.Arcade.Sprite, drop: boolean) {
    if (!e.active) return;
    const d = e.getData('e') as EnemyData;
    this.sparks.explode(10, e.x, e.y);
    const stats = ENEMY_STATS[d.kind];
    if (drop && Math.random() < stats.dropChance) this.dropCoin(e.x, e.y, Phaser.Math.Between(...stats.credits));
    e.destroy();
  }

  // Credits drop as metal bars: bronze, silver, gold, and a stack of gold for big ones.
  dropCoin(x: number, y: number, value: number, vx = Phaser.Math.Between(-10, 10), vy = 26) {
    const key = value >= 25 ? 'ingot4' : value >= 10 ? 'ingot3' : value >= 5 ? 'ingot2' : 'ingot1';
    const c = this.coins.create(x, y, key) as Phaser.Physics.Arcade.Image;
    c.setData('v', value);
    c.setData('key', key);
    c.setData('glint', Phaser.Math.Between(0, 2000));
    c.setVelocity(vx, vy);
    c.body!.setSize(c.width + 6, c.height + 6); // generous pickup radius
    if (this.state.level === 1) this.tipOnce('coin', 'SHIPS DROP CREDITS');
    return c;
  }

  private collect(c: Phaser.Physics.Arcade.Image) {
    if (!c.active) return;
    this.state.credits += c.getData('v') as number;
    c.destroy();
    this.refreshHud();
    this.creditsText.setScale(1.3);
    this.tweens.add({ targets: this.creditsText, scale: 1, duration: 150 });
  }

  // Most hits cost 1 health; big ones like the Dreadnought's laser cost 2.
  hurt(amount = 1) {
    if (this.phase !== 'action' || GOD_MODE) return;
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
    this.time.delayedCall(900, () => {
      text(this, W / 2, H / 2 - 16, 'SHIP DESTROYED', COLOR.red).setOrigin(0.5).setDepth(1000);
      text(this, W / 2, H / 2 + 2, 'RETURNING TO BASE', COLOR.gray).setOrigin(0.5).setDepth(1000);
    });
    // Credits and items earned this level are lost; replay from the start.
    this.time.delayedCall(3000, () => this.leaveTo('Base', this.startState));
  }

  // --- Boss ------------------------------------------------------------------

  private startBoss() {
    const warn = text(this, W / 2, H / 2 - 30, 'WARNING', COLOR.red, 16).setOrigin(0.5).setDepth(1000);
    this.tweens.add({ targets: warn, alpha: 0.1, yoyo: true, repeat: 4, duration: 250, onComplete: () => warn.destroy() });
    const kind = this.level.boss!;
    const done = () => this.bossDefeated();
    this.boss = kind === 'dreadnought' ? new Dreadnought(this, done) : kind === 'watcher' ? new Watcher(this, done) : new Rockjaw(this, done);
    this.bossBar = this.add.graphics().setDepth(900);
    this.bossName = text(this, W / 2, 28, BOSS_NAMES[kind], COLOR.red).setOrigin(0.5, 0).setDepth(900);
  }

  private drawBossBar() {
    const g = this.bossBar;
    if (!g || !this.boss) return;
    g.clear();
    const w = 110;
    g.fillStyle(0x3c3c3c).fillRect(W / 2 - w / 2 - 1, 19, w + 2, 6);
    g.fillStyle(0x000000).fillRect(W / 2 - w / 2, 20, w, 4);
    g.fillStyle(0xd82800).fillRect(W / 2 - w / 2, 20, Math.ceil(w * this.boss.healthFraction()), 4);
  }

  private bossDefeated() {
    this.bossBar?.destroy();
    this.bossName?.destroy();
    this.bossBar = null;
    this.enemyBullets.clear(true, true);
    // Wait for the gold to drop before gathering it up.
    this.time.delayedCall(this.level.boss === 'dreadnought' ? 3600 : 1800, () => {
      this.boss = null;
      this.levelClear();
    });
  }

  // --- Segments, vendor stops, level end ------------------------------------

  private endSegment() {
    if (this.segment < this.level.segments.length - 1) this.vendorArrival();
    else if (this.level.boss) this.startBoss();
    else this.levelClear();
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

  // The station drifts in and keeps scrolling. The ship lines up, barrel-rolls,
  // and starts sinking toward the station partway through its last roll, timed
  // so the station passes right under it as it bottoms out.
  private vendorArrival() {
    this.phase = 'arrival';
    this.dragFrom = null;
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
              this.hazards.clear(true, true);
              this.clearTimedHazards();
              this.patches.forEach((pt) => pt.destroy());
              this.patches = [];
              this.phase = 'vendor';
              this.scene.pause();
              this.scene.launch('Vendor', { state: this.state, mode: 'level', from: 'Game', onLeave: () => {} });
            });
          },
        });
      });
    });
  }

  private afterVendor() {
    if (this.phase !== 'vendor') return;
    this.phase = 'ready';
    this.player.setPosition(W / 2, H - 50).setScale(1).setAlpha(1);
    this.slide = { x: 0, y: 0 };
    // Gear may have changed at the vendor.
    this.maxHp = totalMaxHealth(this.state);
    this.health = Math.min(this.health, this.maxHp);
    this.setupGear();
    this.refreshHud();
    this.cameras.main.fadeIn(350);
    const ready = text(this, W / 2, H / 2, 'READY', COLOR.white).setOrigin(0.5).setDepth(1000);
    this.tweens.add({ targets: ready, alpha: 0.2, yoyo: true, repeat: 2, duration: 220 });
    this.time.delayedCall(1500, () => {
      ready.destroy();
      this.segment++;
      this.waveIndex = 0;
      this.waveTimer = 0;
      this.resetHazardTimers(3000);
      this.phase = 'action';
    });
  }

  private levelClear() {
    if (this.phase !== 'action') return;
    this.phase = 'clear';
    this.enemyBullets.clear(true, true);
    this.clearTimedHazards();
    this.gatherCoins(() => {
      text(this, W / 2, H / 2 - 16, `LEVEL ${this.state.level} CLEAR`, COLOR.yellow).setOrigin(0.5).setDepth(1000);
      text(this, W / 2, H / 2 + 2, 'RETURNING TO BASE', COLOR.gray).setOrigin(0.5).setDepth(1000);
      this.tweens.add({ targets: this.player, y: -30, duration: 1400, delay: 900, ease: 'Quad.easeIn' });
      this.state.level++;
      this.time.delayedCall(2800, () => this.leaveTo('Base', this.state));
    });
  }

  private leaveTo(scene: string, state: SaveData) {
    this.cameras.main.fadeOut(400);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene, { state }));
  }

  // --- Frame -------------------------------------------------------------------

  update(_t: number, delta: number) {
    const dt = Math.min(delta, 50) / 1000;
    const speed = this.phase === 'arrival' ? 0.4 : 1;
    this.scroll(dt, speed);
    if (this.scenery) this.scenery.tilePositionY -= 11 * speed * dt;
    if (this.planet) this.planet.y += 1.2 * dt;
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
    }
    this.updateEnemies(dt);
    this.boss?.update(dt);
    this.drawBossBar();
    this.updateStrikes(dt);
    this.updateFlares(dt);
    this.updateFences(dt);
    this.updateGear(dt);

    // Blink while invulnerable after a hit; show the bubble while shielded.
    const now = this.time.now;
    if (this.phase === 'action' || this.phase === 'ready') {
      this.player.setVisible(now >= this.invulnUntil || Math.floor(now / 80) % 2 === 0);
    }
    this.bubble.setVisible(this.phase === 'action' && now < this.shieldUntil && (this.shieldUntil - now > 1000 || Math.floor(now / 100) % 2 === 0));
    this.bubble.setPosition(this.player.x, this.player.y);

    // Bars catch the light now and then.
    for (const c of this.coins.getChildren() as Phaser.Physics.Arcade.Image[]) {
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
