import Phaser from 'phaser';
import { COLOR, W, H } from '../config';
import { ITEMS, WEAPONS } from '../data/items';
import { LEVELS, type EnemyKind, type LevelDef, type Wave } from '../data/levels';
import { cloneSave, type SaveData } from '../save';
import { starfield, text, toast } from '../ui';

type Phase = 'action' | 'arrival' | 'vendor' | 'ready' | 'dead' | 'clear';

interface EnemyData {
  kind: EnemyKind;
  hp: number;
  t: number;
  baseX: number;
  fireIn: number;
}

const ENEMY_STATS: Record<EnemyKind, { hp: number; texture: string; dropChance: number; credits: [number, number] }> = {
  dart: { hp: 1, texture: 'dart', dropChance: 0.5, credits: [2, 4] },
  weaver: { hp: 3, texture: 'weaver', dropChance: 0.8, credits: [5, 9] },
};

const SHIP_SPEED_KEYS = 110; // px/s with keyboard
const ENEMY_BULLET_SPEED = 70; // slow and sparse in the tutorial

// Playtest helper: add ?god to the URL and the ship can't be destroyed.
const GOD_MODE = new URLSearchParams(location.search).has('god');

export class GameScene extends Phaser.Scene {
  private startState!: SaveData; // what to go back to if the ship is destroyed
  private state!: SaveData;
  private level!: LevelDef;
  private health = 0;

  private player!: Phaser.Physics.Arcade.Sprite;
  private bubble!: Phaser.GameObjects.Image;
  private playerBullets!: Phaser.Physics.Arcade.Group;
  private enemies!: Phaser.Physics.Arcade.Group;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private coins!: Phaser.Physics.Arcade.Group;
  private sparks!: Phaser.GameObjects.Particles.ParticleEmitter;
  private scroll!: ReturnType<typeof starfield>;
  private planet!: Phaser.GameObjects.Image;

  private phase: Phase = 'action';
  private segment = 0;
  private waveIndex = 0;
  private waveTimer = 0;

  private fireTimer = 0;
  private invulnUntil = 0;
  private shieldUntil = 0;
  private overdriveUntil = 0;

  private dragFrom: { px: number; py: number; sx: number; sy: number; tx: number; ty: number } | null = null;
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;

  private hearts: Phaser.GameObjects.Image[] = [];
  private creditsText!: Phaser.GameObjects.Text;
  private itemIcon!: Phaser.GameObjects.Image;
  private itemCount!: Phaser.GameObjects.Text;
  private itemButton!: Phaser.GameObjects.Rectangle;
  private weaponIcon!: Phaser.GameObjects.Image;
  private shownCoinTip = false;

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
    this.fireTimer = 0;
    this.invulnUntil = 0;
    this.shieldUntil = 0;
    this.overdriveUntil = 0;
    this.dragFrom = null;
    this.hearts = [];
    this.shownCoinTip = false;
  }

  create() {
    this.cameras.main.fadeIn(300);
    this.scroll = starfield(this);
    this.planet = this.add.image(132, 60, 'planet');

    this.playerBullets = this.physics.add.group();
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

    this.physics.add.overlap(this.playerBullets, this.enemies, (b, e) => this.hitEnemy(b as Phaser.Physics.Arcade.Image, e as Phaser.Physics.Arcade.Sprite));
    this.physics.add.overlap(this.player, this.enemyBullets, (_p, b) => { b.destroy(); this.hurt(); });
    this.physics.add.overlap(this.player, this.enemies, (_p, e) => { this.killEnemy(e as Phaser.Physics.Arcade.Sprite, false); this.hurt(); });
    this.physics.add.overlap(this.player, this.coins, (_p, c) => this.collect(c as Phaser.Physics.Arcade.Image));

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
    kb.on('keydown-SPACE', () => this.useItem());
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
    this.creditsText = text(this, W - 14, 4, '', COLOR.yellow).setOrigin(1, 0).setDepth(900);

    // Weapon readout bottom left, item button bottom right (big enough for a thumb).
    this.weaponIcon = this.add.image(10, H - 12, WEAPONS[this.state.weapon].icon).setDepth(900);
    this.itemButton = this.add.rectangle(W - 34, H - 26, 30, 22, 0x000000).setOrigin(0).setDepth(900)
      .setStrokeStyle(1, 0xfcfcfc).setInteractive();
    this.itemButton.on('pointerdown', () => this.useItem());
    this.itemIcon = this.add.image(W - 26, H - 15, 'icon_repair').setDepth(901);
    this.itemCount = text(this, W - 18, H - 19, '', COLOR.white).setDepth(901);
    this.refreshHud();
  }

  private refreshHud() {
    this.hearts.forEach((h, i) => {
      h.setVisible(i < this.state.maxHealth);
      h.setTexture(i < this.health ? 'heart' : 'heartEmpty');
    });
    this.creditsText.setText(`${this.state.credits}`);
    this.weaponIcon.setTexture(WEAPONS[this.state.weapon].icon);
    const item = this.state.item;
    this.itemIcon.setVisible(!!item);
    this.itemCount.setText(item ? `${item.count}` : '');
    if (item) this.itemIcon.setTexture(ITEMS[item.id].icon);
    this.itemButton.setStrokeStyle(1, item ? 0xfcfcfc : 0x3c3c3c);
  }

  private blinkTip(msg: string) {
    const t = text(this, W / 2, H / 2 + 30, msg, COLOR.yellow).setOrigin(0.5).setDepth(1000);
    this.tweens.add({ targets: t, alpha: 0.2, yoyo: true, repeat: 3, duration: 300, onComplete: () => t.destroy() });
  }

  // --- Items ---------------------------------------------------------------

  private useItem() {
    const item = this.state.item;
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
    if (item.count <= 0) this.state.item = null;
    this.refreshHud();
  }

  // --- Waves -----------------------------------------------------------------

  private runWaves(dt: number) {
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
    }
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number) {
    const stats = ENEMY_STATS[kind];
    const e = this.enemies.create(x, y, stats.texture) as Phaser.Physics.Arcade.Sprite;
    const data: EnemyData = { kind, hp: stats.hp, t: 0, baseX: x, fireIn: Phaser.Math.Between(900, 2200) };
    e.setData('e', data);
    // Weaver sine amplitude has to stay on screen.
    if (kind === 'weaver') data.baseX = Phaser.Math.Clamp(x, 34, W - 34);
  }

  private updateEnemies(dt: number) {
    for (const obj of this.enemies.getChildren().slice()) {
      const e = obj as Phaser.Physics.Arcade.Sprite;
      const d = e.getData('e') as EnemyData;
      d.t += dt;
      if (d.kind === 'dart') {
        e.y += 72 * dt;
      } else {
        e.y += 34 * dt;
        e.x = d.baseX + Math.sin(d.t * 2.4) * 28;
        d.fireIn -= dt * 1000;
        if (d.fireIn <= 0 && e.y > 10 && e.y < H * 0.6 && this.phase === 'action') {
          d.fireIn = Phaser.Math.Between(1800, 2800);
          this.enemyShoot(e.x, e.y + 4);
        }
      }
      if (e.y > H + 16) e.destroy();
    }
  }

  private enemyShoot(x: number, y: number) {
    const b = this.enemyBullets.create(x, y, 'ebullet') as Phaser.Physics.Arcade.Image;
    b.body!.setCircle(1.5, 0.5, 0.5);
    const angle = Phaser.Math.Angle.Between(x, y, this.player.x, this.player.y);
    this.physics.velocityFromRotation(angle, ENEMY_BULLET_SPEED, b.body!.velocity as Phaser.Math.Vector2);
  }

  // --- Combat ----------------------------------------------------------------

  private autoFire(dt: number) {
    const weapon = WEAPONS[this.state.weapon];
    const interval = this.time.now < this.overdriveUntil ? weapon.interval / 2 : weapon.interval;
    this.fireTimer -= dt * 1000;
    if (this.fireTimer > 0) return;
    this.fireTimer = interval;
    for (const deg of weapon.angles) {
      const b = this.playerBullets.create(this.player.x, this.player.y - 7, weapon.texture) as Phaser.Physics.Arcade.Image;
      b.setData('dmg', weapon.damage);
      const rad = Phaser.Math.DegToRad(deg - 90);
      b.setVelocity(Math.cos(rad) * 300, Math.sin(rad) * 300);
    }
  }

  private hitEnemy(b: Phaser.Physics.Arcade.Image, e: Phaser.Physics.Arcade.Sprite) {
    if (!b.active || !e.active) return;
    b.destroy();
    const d = e.getData('e') as EnemyData;
    d.hp -= (b.getData('dmg') as number) ?? 1;
    if (d.hp <= 0) {
      this.killEnemy(e, true);
    } else {
      e.setTintFill(0xffffff);
      this.time.delayedCall(50, () => e.active && e.clearTint());
    }
  }

  private killEnemy(e: Phaser.Physics.Arcade.Sprite, drop: boolean) {
    if (!e.active) return;
    const d = e.getData('e') as EnemyData;
    this.sparks.explode(10, e.x, e.y);
    const stats = ENEMY_STATS[d.kind];
    if (drop && Math.random() < stats.dropChance) this.dropCoin(e.x, e.y, Phaser.Math.Between(...stats.credits));
    e.destroy();
  }

  private dropCoin(x: number, y: number, value: number) {
    const key = value >= 10 ? 'coin3' : value >= 5 ? 'coin2' : 'coin1';
    const c = this.coins.create(x, y, key) as Phaser.Physics.Arcade.Image;
    c.setData('v', value);
    c.setVelocity(Phaser.Math.Between(-10, 10), 26);
    c.body!.setSize(c.width + 6, c.height + 6); // generous pickup radius
    if (this.state.level === 1 && !this.shownCoinTip) {
      this.shownCoinTip = true;
      this.blinkTip('SHIPS DROP CREDITS');
    }
  }

  private collect(c: Phaser.Physics.Arcade.Image) {
    if (!c.active) return;
    this.state.credits += c.getData('v') as number;
    c.destroy();
    this.refreshHud();
    this.creditsText.setScale(1.3);
    this.tweens.add({ targets: this.creditsText, scale: 1, duration: 150 });
  }

  private hurt() {
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

  // --- Segments, vendor stops, level end ------------------------------------

  private endSegment() {
    if (this.segment < this.level.segments.length - 1) this.vendorArrival();
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
      this.phase = 'action';
    });
  }

  private levelClear() {
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
    this.scroll(dt, this.phase === 'arrival' ? 0.4 : 1);
    this.planet.y += 1.2 * dt;

    if (this.phase === 'action') {
      this.keyboardMove(dt);
      this.touchMove(dt);
      this.autoFire(dt);
      this.runWaves(dt);
    }
    this.updateEnemies(dt);

    // Blink while invulnerable after a hit; show the bubble while shielded.
    const now = this.time.now;
    if (this.phase === 'action' || this.phase === 'ready') {
      this.player.setVisible(now >= this.invulnUntil || Math.floor(now / 80) % 2 === 0);
    }
    this.bubble.setVisible(this.phase === 'action' && now < this.shieldUntil && (this.shieldUntil - now > 1000 || Math.floor(now / 100) % 2 === 0));
    this.bubble.setPosition(this.player.x, this.player.y);

    for (const group of [this.playerBullets, this.enemyBullets, this.coins]) {
      for (const o of group.getChildren().slice() as Phaser.Physics.Arcade.Image[]) {
        if (o.y < -10 || o.y > H + 10 || o.x < -10 || o.x > W + 10) o.destroy();
      }
    }
  }
}
