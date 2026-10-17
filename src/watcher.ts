import Phaser from 'phaser';
import { W } from './config';
import { bossDeath, type BossOpts } from './bossfx';
import type { GameScene } from './scenes/GameScene';
import { toast } from './ui';

const ENTER_Y = 66;
const MAX_HP = 420;
const REWARD = 225; // credits, dropped as a shower of gold
const CLOAKED = 1500; // ms spent cloaked and moving between reveals
const SHOWN = 2600; // ms visible after each reveal
const HIT_W = 15; // half sizes of the hit box
const HIT_H = 8;
// Phase 3, the hall of mirrors.
const MIRRORS = 4; // the real one and three decoys, in a row
const SHUFFLE_EVERY = 3400; // ms between shuffles
const SHUFFLE_BLINK = 350; // ms the row is cloaked while it shuffles
const LOCK_EVERY = 520; // ms between beams, taking turns down the row
const LOCK_WARN = 620; // ms a beam's warning line shows
const BEAM_ON = 240;

interface Copy {
  img: Phaser.GameObjects.Image;
  x: number;
  real: boolean;
  slot: number; // phase 3: place in the row
  aim: number; // phase 3: the beam's angle, locked when its warning starts
  warn: number; // ms of warning left
  beam: number; // ms of beam left
}

// The Watcher, the level 8 mini boss: a cloaking Vossari spy frigate. It
// cloaks (shots pass through), moves, then decloaks alongside decoy
// afterimages. Only the real one takes damage and fires its spreads; a shot
// pops a decoy. Decoys look a shade fainter. Below two thirds health it brings
// three decoys instead of two, the decoys fire too, and it seeds mines.
// Below a third it stops hiding: the hall of mirrors. Four copies hang in a
// row that sways across the screen, taking turns to lock a beam onto the ship,
// and every few seconds they blink out and swap places.
export class Watcher {
  private y = -30;
  private t = 0; // ms into the current cloak or reveal
  private entering = true;
  private dead = false;
  private shown = true;
  private max: number;
  private hp: number;
  private copies: Copy[] = [];
  private real: Copy;
  private fired = 0; // volleys fired this reveal
  private warnedDecoy = false;
  private mirror = false; // phase 3
  private lockIn = 0;
  private nextLock = 0;
  private spreadIn = 1600;

  constructor(private g: GameScene, private onDefeated: () => void, private opts: BossOpts = {}) {
    this.max = MAX_HP * (opts.hp ?? 1);
    this.hp = this.max;
    this.real = this.copy(W / 2, true);
    g.tweens.add({
      targets: this, y: ENTER_Y, duration: 2200, ease: 'Sine.easeOut', delay: 600,
      onComplete: () => { this.entering = false; this.cloak(); },
    });
  }

  private copy(x: number, real: boolean, alpha = 1) {
    const img = this.g.add.image(x, this.y, 'watcher').setDepth(8).setAlpha(alpha);
    if (this.opts.tint) img.setTint(this.opts.tint);
    const c: Copy = { img, x, real, slot: 0, aim: 0, warn: 0, beam: 0 };
    this.copies.push(c);
    return c;
  }

  private get angry() { return this.hp <= (this.max * 2) / 3; }

  healthFraction() { return Math.max(0, this.hp) / this.max; }

  aimPoint() { return this.dead || !this.shown ? null : { x: this.real.img.x, y: this.real.img.y }; }

  private clearDecoys() {
    for (const c of this.copies) if (!c.real) this.g.tweens.add({ targets: c.img, alpha: 0, duration: 250, onComplete: () => c.img.destroy() });
    this.copies = [this.real];
  }

  private cloak() {
    this.shown = false;
    this.t = 0;
    // Decoys fade out for good; the real one keeps a faint shimmer while it moves.
    this.clearDecoys();
    this.real.x = this.real.img.x;
  }

  // Decloak at a new spot with decoys at other spots, spread across the screen.
  private reveal() {
    const g = this.g;
    this.shown = true;
    this.t = 0;
    this.fired = 0;
    const n = (this.angry ? 3 : 2) + 1;
    const spots = Phaser.Utils.Array.Shuffle(Array.from({ length: n }, (_v, i) => 22 + ((i + 0.5) / n) * (W - 44)));
    this.real.x = spots[0];
    this.real.img.setPosition(spots[0], this.y).setAlpha(1);
    g.flash(this.real.img);
    for (const x of spots.slice(1)) g.flash(this.copy(x, false, 0.78).img);
    if (this.angry) for (let i = 0; i < 2; i++) g.spawnEnemy('pmine', Phaser.Math.Between(20, W - 20), this.y + 10);
    g.tipOnce('watcher', 'FIND THE REAL ONE');
  }

  // Phase 3 begins: the row of mirrors forms.
  private startMirror() {
    const g = this.g;
    this.mirror = true;
    this.shown = true;
    g.enemyBullets.clear(true, true);
    g.cameras.main.flash(250, 160, 200, 252);
    toast(g, 'HALL OF MIRRORS', 120, 1000);
    this.clearDecoys();
    for (let i = 1; i < MIRRORS; i++) this.copy(this.real.img.x, false, 0.78);
    this.shuffle();
    this.lockIn = 900;
  }

  // Every copy blinks out and comes back in a new place in the row. Popped
  // decoys come back too.
  private shuffle() {
    const g = this.g;
    this.t = 0;
    while (this.copies.length < MIRRORS) this.copy(this.real.img.x, false, 0.78);
    const slots = Phaser.Utils.Array.Shuffle([...Array(MIRRORS).keys()]);
    this.copies.forEach((c, i) => { c.slot = slots[i]; c.warn = 0; c.beam = 0; });
    g.spawnEnemy('pmine', Phaser.Math.Between(20, W - 20), this.y + 10);
  }

  private rowX(slot: number) {
    const sway = Math.sin(this.g.time.now / 900) * 18;
    return ((slot + 0.5) / MIRRORS) * (W - 24) + 12 + sway;
  }

  update(dt: number) {
    if (this.dead) return;
    const g = this.g;
    const bob = Math.sin(g.time.now / 400) * 3;
    for (const c of this.copies) c.img.setPosition(Math.round(c.x), Math.round(this.y + bob));
    this.checkShots();
    if (this.entering) return;

    this.t += dt * 1000;
    if (this.mirror) { this.updateMirror(dt); return; }
    if (!this.shown) {
      // Cloaked: slide toward the ship's side of the screen, barely visible.
      this.real.x += Phaser.Math.Clamp(g.player.x - this.real.x, -40 * dt, 40 * dt);
      this.real.img.setAlpha(Math.floor(this.t / 50) % 7 === 0 ? 0.25 : 0.06);
      if (this.t >= CLOAKED) this.reveal();
      return;
    }
    this.checkRam();
    // Decoys flicker now and then, which gives them away to a sharp eye.
    for (const c of this.copies) if (!c.real) c.img.setAlpha(Math.floor((this.t + c.x * 7) / 90) % 9 === 0 ? 0.4 : 0.78);
    if (g.phase === 'action') {
      const volleys = [500, 1700];
      if (this.fired < volleys.length && this.t >= volleys[this.fired]) {
        this.fired++;
        const a = Phaser.Math.Angle.Between(this.real.x, this.y, g.player.x, g.player.y);
        const spread = this.angry ? [-0.5, -0.25, 0, 0.25, 0.5] : [-0.25, 0, 0.25];
        for (const off of spread) g.enemyShoot(this.real.x, this.y + 8, a + off);
        if (this.angry && this.fired === 1) for (const c of this.copies) if (!c.real) g.enemyShoot(c.x, this.y + 8);
      }
    }
    if (this.t >= SHOWN) this.cloak();
  }

  private updateMirror(dt: number) {
    const g = this.g;
    const ms = dt * 1000;
    const live = g.phase === 'action';
    const blinking = this.t < SHUFFLE_BLINK;
    this.shown = !blinking;
    for (const c of this.copies) {
      // Glide to its place in the swaying row.
      c.x += Phaser.Math.Clamp(this.rowX(c.slot) - c.x, -160 * dt, 160 * dt);
      if (blinking) c.img.setAlpha(Math.floor(this.t / 50) % 3 === 0 ? 0.3 : 0.05);
      else if (c.real) c.img.setAlpha(1);
      else c.img.setAlpha(Math.floor((this.t + c.slot * 300) / 90) % 9 === 0 ? 0.4 : 0.78);
      // Beams: a blinking line locked on the ship, then the beam itself.
      const nose = { x: c.img.x, y: c.img.y + 8 };
      if (c.warn > 0) {
        c.warn -= ms;
        if (Math.floor(c.warn / 90) % 2 === 0) g.drawBeam(nose.x, nose.y, c.aim, 1, 0x3cbcfc, 0.7);
        if (c.warn <= 0) c.beam = BEAM_ON;
      } else if (c.beam > 0) {
        c.beam -= ms;
        g.drawBeam(nose.x, nose.y, c.aim, 3, 0x0058f8);
        if (live && g.beamHits(nose.x, nose.y, c.aim, 2.5)) g.hurt();
      }
    }
    if (blinking) return;
    this.checkRam();
    // Copies take turns to lock on, down the row and back.
    this.lockIn -= ms;
    if (live && this.lockIn <= 0) {
      this.lockIn = LOCK_EVERY;
      const order = [...this.copies].sort((a, b) => a.slot - b.slot);
      const c = order[this.nextLock++ % order.length];
      if (c.warn <= 0 && c.beam <= 0) {
        const tg = g.aimTarget(false);
        c.aim = Phaser.Math.Angle.Between(c.img.x, c.img.y + 8, tg.x, tg.y);
        c.warn = LOCK_WARN;
      }
    }
    this.spreadIn -= ms;
    if (live && this.spreadIn <= 0) {
      this.spreadIn = 1700;
      const a = Phaser.Math.Angle.Between(this.real.x, this.y, g.player.x, g.player.y);
      for (const off of [-0.3, 0, 0.3]) g.enemyShoot(this.real.x, this.y + 8, a + off);
    }
    if (this.t >= SHUFFLE_EVERY) this.shuffle();
  }

  // Shots pass through while it's cloaked. Visible: the real one takes damage
  // and a decoy pops.
  private checkShots() {
    const g = this.g;
    if (!this.shown || this.entering) return;
    for (const o of g.playerBullets.getChildren().slice() as Phaser.Physics.Arcade.Image[]) {
      if (this.dead) return;
      if (!o.active) continue;
      const c = this.copies.find((k) => Math.abs(o.x - k.img.x) <= HIT_W && Math.abs(o.y - k.img.y) <= HIT_H);
      if (!c) continue;
      o.destroy();
      if (!c.real) {
        g.sparks.explode(8, c.img.x, c.img.y);
        c.img.destroy();
        this.copies.splice(this.copies.indexOf(c), 1);
        if (!this.warnedDecoy) { this.warnedDecoy = true; toast(g, 'DECOY!', 120, 600); }
        continue;
      }
      this.hp -= g.shotDamage(o, ['ion'], []);
      g.flash(c.img);
      if (this.hp <= 0) { this.defeat(); return; }
      if (!this.mirror && this.hp <= this.max / 3) { this.startMirror(); return; }
    }
  }

  // Flying into the real frigate hurts.
  private checkRam() {
    const p = this.g.player;
    if (Math.abs(p.x - this.real.img.x) < HIT_W - 2 && Math.abs(p.y - this.real.img.y) < HIT_H - 1) this.g.hurt();
  }

  private defeat() {
    const g = this.g;
    this.dead = true;
    for (const c of this.copies) if (!c.real) c.img.destroy();
    const { x, y } = this.real.img;
    bossDeath(g, x, y, 16, 8, REWARD, () => this.real.img.destroy());
    this.onDefeated();
  }
}
