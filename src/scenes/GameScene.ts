import Phaser from 'phaser';
import { COLOR, W, H } from '../config';
import { ITEMS, WEAPONS } from '../data/items';
import { LEVELS, type EnemyKind, type HazardKind, type LevelDef, type Wave } from '../data/levels';
import { weaponStats } from '../inventory';
import { Rockjaw } from '../rockjaw';
import { cloneSave, type SaveData } from '../save';
import { starfield, text, toast } from '../ui';

type Phase = 'action' | 'arrival' | 'vendor' | 'ready' | 'dead' | 'clear';
// Mines are dropped by Bombers and boulders are thrown by Rockjaw; both can be shot down.
type FoeKind = EnemyKind | 'mine' | 'boulder';

interface EnemyData {
  kind: FoeKind;
  hp: number;
  t: number;
  baseX: number;
  fireIn: number;
  dir: number; // -1 or 1: which way it crosses the screen
  wait: number; // ms before it starts moving (swarm members queue up)
  stopY: number; // where a Gunboat parks
  hold: number; // ms a parked Gunboat stays
}

const ENEMY_STATS: Record<FoeKind, { hp: number; texture: string; dropChance: number; credits: [number, number] }> = {
  dart: { hp: 1, texture: 'dart', dropChance: 0.5, credits: [2, 4] },
  weaver: { hp: 3, texture: 'weaver', dropChance: 0.8, credits: [5, 9] },
  drone: { hp: 1, texture: 'drone', dropChance: 0.3, credits: [1, 3] },
  gunboat: { hp: 8, texture: 'gunboat', dropChance: 0.9, credits: [10, 16] },
  bomber: { hp: 6, texture: 'bomber', dropChance: 0.9, credits: [10, 18] },
  mine: { hp: 1, texture: 'mine', dropChance: 0, credits: [0, 0] },
  boulder: { hp: 3, texture: 'boulder', dropChance: 0, credits: [0, 0] },
};

const SHIP_SPEED_KEYS = 110; // px/s with keyboard
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
  sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private scroll!: ReturnType<typeof starfield>;
  private scenery: Phaser.GameObjects.TileSprite | null = null;
  private planet: Phaser.GameObjects.Image | null = null;

  phase: Phase = 'action';
  private segment = 0;
  private waveIndex = 0;
  private waveTimer = 0;
  private hazardIn = 0;
  private boss: Rockjaw | null = null;
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
  private tipsShown = new Set<string>();

  constructor() { super('Game'); }

  init(data: { state: SaveData }) {
    this.startState = cloneSave(data.state);
    this.state = cloneSave(data.state);
    this.level = LEVELS[this.state.level - 1];
    this.health = this.state.maxHealth;
    this.phase = 'action';
    this.segment = 0;
    this.waveIndex = 0;
    this.waveTimer = 0;
    this.hazardIn = 4000;
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
    this.tipsShown = new Set();
    this.scenery = null;
    this.planet = null;
  }

  create() {
    this.cameras.main.fadeIn(300);
    this.scroll = starfield(this);
    if (this.level.theme === 'outpost') this.planet = this.add.image(132, 60, 'planet');
    else this.scenery = this.add.tileSprite(0, 0, W, H, `scenery_${this.level.theme}`).setOrigin(0);

    this.playerBullets = this.physics.add.group();
    this.hazards = this.physics.add.group();
    this.enemies = this.physics.add.group();
    this.enemyBullets = this.physics.add.group();
    this.coins = this.physics.add.group();

    this.player = this.physics.add.sprite(W / 2, H - 50, 'ship').setDepth(10);
    this.player.body!.setSize(5, 7).setOffset(4, 3); // small hitbox, NES-shooter fair
    this.bubble = this.add.image(0, 0, 'bubble').setDepth(11).setVisible(false);

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
    this.physics.add.overlap(this.player, this.enemies, (_p, e) => { this.killEnemy(spr(e), false); this.hurt(); });
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
    // flies toward that target at keyboard speed (see touchMove).
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

  private keyboardMove(dt: number) {
    const k = this.keys;
    const dx = (k.right.isDown || k.d.isDown ? 1 : 0) - (k.left.isDown || k.a.isDown ? 1 : 0);
    const dy = (k.down.isDown || k.s.isDown ? 1 : 0) - (k.up.isDown || k.w.isDown ? 1 : 0);
    if (!dx && !dy) return;
    this.dragFrom = null;
    this.player.x = Phaser.Math.Clamp(this.player.x + dx * SHIP_SPEED_KEYS * dt, 6, W - 6);
    this.player.y = Phaser.Math.Clamp(this.player.y + dy * SHIP_SPEED_KEYS * dt, 24, H - 30);
  }

  // Fly toward the drag target at keyboard speed, landing exactly on it once
  // it's within one frame's step so the ship doesn't jitter around it.
  private touchMove(dt: number) {
    if (!this.dragFrom) return;
    const dx = this.dragFrom.tx - this.player.x;
    const dy = this.dragFrom.ty - this.player.y;
    const dist = Math.hypot(dx, dy);
    const step = SHIP_SPEED_KEYS * dt;
    if (dist <= step) {
      this.player.setPosition(this.dragFrom.tx, this.dragFrom.ty);
    } else {
      this.player.x += (dx / dist) * step;
      this.player.y += (dy / dist) * step;
    }
  }

  // --- HUD ---------------------------------------------------------------

  private createHud() {
    for (let i = 0; i < 10; i++) this.hearts.push(this.add.image(6 + i * 9, 8, 'heart').setOrigin(0, 0.5).setDepth(900));
    this.add.image(W - 6, 8, 'coinIcon').setOrigin(1, 0.5).setDepth(900);
    this.creditsText = text(this, W - 16, 4, '', COLOR.yellow).setOrigin(1, 0).setDepth(900);

    // Weapon readout bottom left, one item button per slot bottom right (big enough for a thumb).
    this.state.weapons.forEach((_w, i) => this.weaponIcons.push(this.add.image(10 + i * 12, H - 12, 'icon_pulse').setDepth(900)));
    const slots = this.state.items.length;
    this.state.items.forEach((_it, i) => {
      const x = W - 34 - (slots - 1 - i) * 33; // slot 1 on the left, like the Ship screen
      const box = this.add.rectangle(x, H - 26, 30, 22, 0x000000).setOrigin(0).setDepth(900)
        .setStrokeStyle(1, 0xfcfcfc).setInteractive();
      box.on('pointerdown', () => this.useItem(i));
      const icon = this.add.image(x + 8, H - 15, 'icon_repair').setDepth(901);
      const count = text(this, x + 16, H - 19, '', COLOR.white).setDepth(901);
      this.itemButtons.push({ box, icon, count });
    });
    this.refreshHud();
  }

  private refreshHud() {
    this.hearts.forEach((h, i) => {
      h.setVisible(i < this.state.maxHealth);
      h.setTexture(i < this.health ? 'heart' : 'heartEmpty');
    });
    this.creditsText.setText(`${this.state.credits}`);
    this.state.weapons.forEach((w, i) => this.weaponIcons[i].setVisible(!!w).setTexture(w ? WEAPONS[w].icon : 'icon_pulse'));
    this.state.items.forEach((item, i) => {
      const b = this.itemButtons[i];
      b.icon.setVisible(!!item);
      b.count.setText(item ? `${item.count}` : '');
      if (item) b.icon.setTexture(ITEMS[item.id].icon);
      b.box.setStrokeStyle(1, item ? 0xfcfcfc : 0x3c3c3c);
    });
  }

  private blinkTip(msg: string) {
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
      if (this.health >= this.state.maxHealth) { toast(this, 'HEALTH IS FULL', H / 2 + 30, 600); return; }
      this.health = Math.min(this.state.maxHealth, this.health + 2);
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
    };
    e.setData('e', data);
    // Weaver sine amplitude has to stay on screen.
    if (kind === 'weaver') data.baseX = Phaser.Math.Clamp(x, 34, W - 34);
    if (kind === 'gunboat') data.fireIn = 700;
    if (kind === 'bomber') { data.fireIn = 900; e.x = x < W / 2 ? 24 : W - 24; }
    if (kind === 'mine') { data.fireIn = 2200; e.body!.setCircle(3.5); }
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
        case 'boulder':
          e.rotation += dt * 2;
          break;
      }
      if (e.y > H + 16 || e.x < -24 || e.x > W + 24) e.destroy();
    }
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

  private runHazards(dt: number) {
    const hz = this.level.hazard;
    if (!hz || this.boss) return;
    this.hazardIn -= dt * 1000;
    if (this.hazardIn > 0) return;
    this.hazardIn = Phaser.Math.Between(...hz.every);
    this.spawnHazard(hz.kind, Phaser.Math.Between(16, W - 16), -14);
  }

  private spawnHazard(kind: HazardKind | 'pebble', x: number, y: number) {
    const tex = kind === 'debris' ? Phaser.Utils.Array.GetRandom(['debris1', 'debris2']) : kind;
    const h = this.hazards.create(x, y, tex) as Phaser.Physics.Arcade.Image;
    h.setData('kind', kind);
    if (kind === 'debris') {
      h.setVelocity(Phaser.Math.Between(-6, 6), Phaser.Math.Between(20, 28));
      h.body!.setSize(h.width - 6, h.height - 4);
      if (this.state.level === 2) this.tipOnce('debris', 'WRECKS BLOCK SHOTS');
    } else {
      h.setData('hp', kind === 'rock' ? 6 : 2);
      h.setVelocity(Phaser.Math.Between(-10, 10), Phaser.Math.Between(30, 45));
      h.setAngularVelocity(Phaser.Math.Between(-60, 60));
      h.body!.setCircle(kind === 'rock' ? 7 : 3, kind === 'rock' ? 2 : 1, kind === 'rock' ? 1 : 1);
      if (kind === 'rock' && this.state.level === 3) this.tipOnce('rock', 'SHOOT ROCKS OR DODGE');
    }
    return h;
  }

  private hitHazard(b: Phaser.Physics.Arcade.Image, h: Phaser.Physics.Arcade.Image) {
    if (!b.active || !h.active) return;
    b.destroy();
    if (h.getData('kind') === 'debris') { this.tink(b.x, b.y); return; }
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
    b.destroy();
    const d = e.getData('e') as EnemyData;
    d.hp -= (b.getData('dmg') as number) ?? 1;
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

  hurt() {
    if (this.phase !== 'action' || GOD_MODE) return;
    const now = this.time.now;
    if (now < this.invulnUntil || now < this.shieldUntil) return;
    this.health--;
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
    this.boss = new Rockjaw(this, () => this.bossDefeated());
    this.bossBar = this.add.graphics().setDepth(900);
    this.bossName = text(this, W / 2, 28, 'ROCKJAW', COLOR.red).setOrigin(0.5, 0).setDepth(900);
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
    this.time.delayedCall(1800, () => {
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

  // The station drifts in, the ship lines up, barrel-rolls and flies in.
  private vendorArrival() {
    this.phase = 'arrival';
    this.dragFrom = null;
    this.enemyBullets.clear(true, true);
    this.gatherCoins(() => {
      if (this.state.level === 1 && this.segment === 0) this.blinkTip('VENDOR AHEAD');
      const station = this.add.image(W / 2, -20, 'station').setAlpha(0.55).setScale(1.6).setDepth(5);
      this.tweens.add({ targets: this.player, x: W / 2, y: H * 0.64, duration: 1400, ease: 'Sine.easeInOut' });
      this.tweens.add({
        targets: station, y: H / 2, duration: 4200, ease: 'Linear',
        onComplete: () => {
          this.tweens.chain({
            targets: this.player,
            tweens: [
              { scaleX: -1, duration: 160, yoyo: true, repeat: 1 },
              { y: station.y, scale: 0.15, alpha: 0.5, duration: 700, ease: 'Quad.easeIn' },
            ],
            onComplete: () => {
              this.cameras.main.fadeOut(350);
              this.cameras.main.once('camerafadeoutcomplete', () => {
                station.destroy();
                this.hazards.clear(true, true);
                this.phase = 'vendor';
                this.scene.pause();
                this.scene.launch('Vendor', { state: this.state, mode: 'level', from: 'Game', onLeave: () => {} });
              });
            },
          });
        },
      });
    });
  }

  private afterVendor() {
    if (this.phase !== 'vendor') return;
    this.phase = 'ready';
    this.player.setPosition(W / 2, H - 50).setScale(1).setAlpha(1);
    this.refreshHud();
    this.cameras.main.fadeIn(350);
    const ready = text(this, W / 2, H / 2, 'READY', COLOR.white).setOrigin(0.5).setDepth(1000);
    this.tweens.add({ targets: ready, alpha: 0.2, yoyo: true, repeat: 2, duration: 220 });
    this.time.delayedCall(1500, () => {
      ready.destroy();
      this.segment++;
      this.waveIndex = 0;
      this.waveTimer = 0;
      this.hazardIn = 3000;
      this.phase = 'action';
    });
  }

  private levelClear() {
    if (this.phase !== 'action') return;
    this.phase = 'clear';
    this.enemyBullets.clear(true, true);
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

    if (this.phase === 'action') {
      this.keyboardMove(dt);
      this.touchMove(dt);
      this.autoFire(dt);
      this.runWaves(dt);
      this.runHazards(dt);
    }
    this.updateEnemies(dt);
    this.boss?.update(dt);
    this.drawBossBar();

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
