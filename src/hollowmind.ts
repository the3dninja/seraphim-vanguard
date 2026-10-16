import Phaser from 'phaser';
import { W, H } from './config';
import { bossDeath, shipIn, shotsIn } from './bossfx';
import type { GameScene } from './scenes/GameScene';
import { toast } from './ui';

const CORE_Y = 70;
const HIDE_Y = -8; // where it pulls back to between phases, mostly off screen
const EYES = 6;
const EYE_HP = 60;
const MEMBRANE = 400;
const CORE_HP = 520;
const HORROR_HP = 560;
const TOTAL = EYES * EYE_HP + MEMBRANE + CORE_HP + HORROR_HP;
const REWARD = 400;
const WALL_EVERY = 2600; // ms between tentacle walls in phase 2
const WALL_GAP = 42;
const WALL_H = 8;
const SUMMON_FOR = 7000; // ms it hides and sends minions between phases
// Phase 4, the horror.
const HOLE_EVERY = 5200; // ms between black holes
const HOLE_LIFE = 4600;
const HOLE_R = 84; // pull radius
const HOLE_EAT = 10; // shots this close vanish; the ship this close gets hurt
const WARP_EVERY = 7000; // ms between space warps
const WARP_WARN = 800;
const TEAR_LIFE = 1300;

interface Eye { img: Phaser.GameObjects.Image; hp: number; a: number }
interface TWall { y: number; gapX: number; t: number }
interface Hole { x: number; y: number; t: number }
interface Tear { x: number; y: number; t: number; fired: number }

// The Hollow Mind, the final boss (level 15). A giant brain-like core.
// Phase 1: six eyes circle it and take turns firing; the core can't be hurt
// until they're gone. Phase 2: a membrane closes over the core and walls of
// tentacles sweep down the screen with one gap each, while the core fires
// rings. Phase 3: the core is bare and fires spirals of shots. Phase 4: it
// splits open into a maw, the screen bleeds red, black holes open that drag
// the ship in and swallow shots, and space warps: it jumps to a new spot and
// tears open around the edges to fire through them. Between phases it pulls
// back off the top of the screen and sends its minions for a while; it can't
// be hurt then. Weak to plasma and explosives throughout.
export class HollowMind {
  private x = W / 2;
  private y = -40;
  private t = 0;
  private entering = true;
  private dead = false;
  private phase = 1;
  private hiding = false; // pulled back, summoning between phases
  private core: Phaser.GameObjects.Image;
  private membraneImg: Phaser.GameObjects.Image;
  private eyes: Eye[] = [];
  private membrane = MEMBRANE;
  private hp = CORE_HP;
  private horror = HORROR_HP;
  private fireIn = 800;
  private nextEye = 0;
  private walls: TWall[] = [];
  private wallIn = 1500;
  private ringIn = 2000;
  private spiral = 0;
  private spiralIn = 0;
  private fanIn = 3000;
  private summonIn = 0;
  private summoned = 0;
  private summonUntil = 0;
  // Phase 4
  private red: Phaser.GameObjects.Rectangle;
  private holes: Hole[] = [];
  private holeIn = 1500;
  private warpIn = 3500;
  private warpT = -1; // ms into a warp's warning, -1 when none is coming
  private tears: Tear[] = [];
  private teethIn = 1200;

  constructor(private g: GameScene, private onDefeated: () => void) {
    this.core = g.add.image(this.x, this.y, 'mindcore').setDepth(8);
    this.membraneImg = g.add.image(this.x, this.y, 'membrane').setDepth(8.5).setVisible(false);
    for (let i = 0; i < EYES; i++) {
      this.eyes.push({ img: g.add.image(this.x, this.y, 'eye').setDepth(8.6), hp: EYE_HP, a: (i / EYES) * Math.PI * 2 });
    }
    // The red that bleeds over the screen in phase 4: over enemies, under shots and the ship.
    this.red = g.add.rectangle(0, 0, W, H, 0x881400, 0).setOrigin(0).setDepth(4);
    g.tweens.add({
      targets: this, y: CORE_Y, duration: 2600, ease: 'Sine.easeOut', delay: 600,
      onComplete: () => { this.entering = false; g.tipOnce('eyes', 'SHOOT THE EYES'); },
    });
  }

  healthFraction() {
    const eyes = this.eyes.reduce((n, e) => n + Math.max(0, e.hp), 0);
    return (eyes + Math.max(0, this.membrane) + Math.max(0, this.hp) + Math.max(0, this.horror)) / TOTAL;
  }

  aimPoint() {
    if (this.dead || this.hiding) return null;
    const eye = this.eyes.find((e) => e.hp > 0);
    return eye ? { x: eye.img.x, y: eye.img.y } : { x: this.x, y: this.y };
  }

  update(dt: number) {
    if (this.dead) return;
    const g = this.g;
    const ms = dt * 1000;
    this.t += ms;
    const pulse = 1 + Math.sin(this.t / (this.phase >= 3 ? 120 : 260)) * (this.phase === 4 ? 0.09 : 0.05);
    const shake = this.phase === 4 ? Math.round(Math.sin(this.t / 37) * 1.2) : 0;
    this.core.setPosition(Math.round(this.x) + shake, Math.round(this.y)).setScale(pulse);
    this.membraneImg.setPosition(this.core.x, this.core.y).setScale(pulse);
    for (const e of this.eyes) {
      e.a += dt * 0.6;
      e.img.setPosition(Math.round(this.x + Math.cos(e.a) * 44), Math.round(this.y + Math.sin(e.a) * 28));
    }
    if (this.phase === 2) this.updateWalls(dt, g.phase === 'action');
    if (this.phase === 4) this.updateHorror(dt);
    this.checkShots();
    if (this.entering) return;
    const live = g.phase === 'action';
    if (this.hiding) { this.updateSummon(dt, live); return; }
    if (shipIn(g, this.x, this.y, 18, 16)) g.hurt();

    if (this.phase === 1) {
      // The eyes take turns: one aimed shot every half second.
      this.fireIn -= ms;
      const alive = this.eyes.filter((e) => e.hp > 0);
      if (live && this.fireIn <= 0 && alive.length) {
        this.fireIn = 380 + alive.length * 25;
        const e = alive[this.nextEye++ % alive.length];
        g.enemyShoot(e.img.x, e.img.y + 4);
      }
    } else if (this.phase === 2) {
      this.ringIn -= ms;
      if (live && this.ringIn <= 0) {
        this.ringIn = 2200;
        for (let i = 0; i < 10; i++) g.enemyShoot(this.x, this.y, (i / 10) * Math.PI * 2 + this.t / 700, 50);
      }
    } else if (this.phase === 3) {
      // Bare core: two-armed spirals, and an aimed fan now and then.
      this.spiralIn -= ms;
      this.fanIn -= ms;
      if (live && this.spiralIn <= 0) {
        this.spiralIn = 150;
        this.spiral += 0.32;
        for (const arm of [0, Math.PI]) g.enemyShoot(this.x, this.y, this.spiral + arm, 58);
      }
      if (live && this.fanIn <= 0) {
        this.fanIn = 2800;
        const tg = g.aimTarget();
        const a = Phaser.Math.Angle.Between(this.x, this.y, tg.x, tg.y);
        for (const off of [-0.3, -0.15, 0, 0.15, 0.3]) g.enemyShoot(this.x, this.y + 10, a + off, 80);
      }
    } else {
      // The maw: rings of teeth with a gap to slip through, and a slow spiral.
      this.teethIn -= ms;
      this.spiralIn -= ms;
      if (live && this.teethIn <= 0) {
        this.teethIn = 1500;
        const gapAt = Phaser.Math.Angle.Between(this.x, this.y, g.player.x, g.player.y) + Phaser.Math.FloatBetween(-0.5, 0.5);
        for (let i = 0; i < 22; i++) {
          const a = (i / 22) * Math.PI * 2;
          if (Math.abs(Phaser.Math.Angle.Wrap(a - gapAt)) < 0.42) continue;
          g.enemyShoot(this.x, this.y, a, 52);
        }
      }
      if (live && this.spiralIn <= 0) {
        this.spiralIn = 260;
        this.spiral -= 0.41;
        g.enemyShoot(this.x, this.y, this.spiral, 46);
      }
    }
  }

  // Between phases: it pulls back off the top of the screen and sends minions.
  private retreat() {
    const g = this.g;
    this.hiding = true;
    this.summonIn = 900;
    this.summoned = 0;
    this.summonUntil = g.time.now + SUMMON_FOR - 1000;
    g.enemyBullets.clear(true, true);
    g.tweens.add({ targets: this, y: HIDE_Y, duration: 900, ease: 'Sine.easeIn' });
    toast(g, 'IT CALLS ITS BROOD', 120, 1000);
    g.time.delayedCall(SUMMON_FOR, () => {
      if (this.dead) return;
      g.tweens.add({
        targets: this, y: CORE_Y, duration: 1200, ease: 'Sine.easeOut',
        onComplete: () => { this.hiding = false; this.toPhase(this.phase + 1); },
      });
    });
  }

  private updateSummon(dt: number, live: boolean) {
    const g = this.g;
    this.summonIn -= dt * 1000;
    if (!live || this.summonIn > 0 || g.time.now > this.summonUntil) return;
    this.summonIn = 850;
    const n = this.summoned++;
    // A Brood Mother first, then tendrils and seeker pairs in turn; the later
    // the phase, the more of them.
    if (n === 0 && this.phase >= 2) g.spawn('brood', Phaser.Math.Between(40, W - 40), -10);
    else if (n % 2) g.spawn('tendril', Phaser.Math.Between(16, W - 16), -10);
    else for (let i = 0; i < this.phase; i++) g.spawn('seeker', Phaser.Math.Between(20, W - 20), -6);
  }

  // Phase 2: walls of tentacles sweep down, each with one gap to fly through.
  private updateWalls(dt: number, live: boolean) {
    const g = this.g;
    const gfx = g.beams;
    this.wallIn -= dt * 1000;
    if (live && !this.hiding && this.wallIn <= 0) {
      this.wallIn = WALL_EVERY;
      this.walls.push({ y: this.y + 24, gapX: Phaser.Math.Between(30, W - 30), t: 0 });
    }
    for (const w of this.walls.slice()) {
      w.t += dt * 1000;
      w.y += 52 * dt;
      if (w.y > H + 10) { this.walls.splice(this.walls.indexOf(w), 1); continue; }
      const l = w.gapX - WALL_GAP / 2, r = w.gapX + WALL_GAP / 2;
      for (let x = 0; x < W; x += 4) {
        if (x + 4 > l && x < r) continue;
        const wob = Math.round(Math.sin(x * 0.2 + w.t / 120) * 2);
        gfx.fillStyle(0xa40080, 1).fillRect(x, w.y - WALL_H / 2 + wob, 4, WALL_H);
        if ((x / 4) % 3 === 0) gfx.fillStyle(0xf878f8, 1).fillRect(x + 1, w.y + wob, 2, 1);
      }
      const p = g.player;
      if (live && Math.abs(p.y - w.y) < WALL_H / 2 + 2 && (p.x < l + 3 || p.x > r - 3)) g.hurt();
    }
  }

  // Phase 4: the red pulse, black holes and space warps.
  private updateHorror(dt: number) {
    const g = this.g;
    const gfx = g.beams;
    const ms = dt * 1000;
    const live = g.phase === 'action' && !this.hiding && !this.entering;
    const p = g.player;
    this.red.setFillStyle(0x881400, 0.16 + Math.sin(this.t / 300) * 0.07);

    // Black holes: grow, drag the ship and shots in, swallow shots, then
    // collapse into a ring of shots.
    this.holeIn -= ms;
    if (live && this.holeIn <= 0 && this.holes.length < 2) {
      this.holeIn = HOLE_EVERY;
      const away = p.x < W / 2 ? 1 : -1; // not right on top of the ship
      this.holes.push({ x: Phaser.Math.Clamp(p.x + away * Phaser.Math.Between(30, 70), 24, W - 24), y: Phaser.Math.Between(120, 210), t: 0 });
      g.tipOnce('hole', 'BLACK HOLES PULL\nYOU IN. FLY AWAY!');
    }
    let pullX = 0, pullY = 0;
    for (const h of this.holes.slice()) {
      h.t += ms;
      const grow = Math.min(1, h.t / 600) * (h.t > HOLE_LIFE - 300 ? Math.max(0, (HOLE_LIFE - h.t) / 300) : 1);
      // A swirl of dots around a black core with a white rim.
      for (let ring = 0; ring < 4; ring++) {
        const r = (14 + ring * 11) * grow;
        const n = 10 + ring * 5;
        const spin = (h.t / 1000) * (4 - ring * 0.7);
        for (let i = 0; i < n; i++) {
          const a = spin + (i / n) * Math.PI * 2;
          gfx.fillStyle(ring === 0 ? 0xfcfcfc : ring === 1 ? 0xfc7460 : 0xd82800, 1 - ring * 0.2)
            .fillRect(Math.round(h.x + Math.cos(a) * r), Math.round(h.y + Math.sin(a) * r * 0.85), ring < 2 ? 2 : 1, 1);
        }
      }
      gfx.fillStyle(0x000000, 0.55).fillCircle(h.x, h.y, 17 * grow);
      gfx.fillStyle(0x000000, 1).fillCircle(h.x, h.y, 9 * grow);
      gfx.lineStyle(1, 0xfcfcfc, 0.9).strokeCircle(h.x, h.y, 9 * grow);
      gfx.lineStyle(1, 0xd82800, 0.7).strokeCircle(h.x, h.y, 11 * grow + Math.sin(h.t / 90));
      const d = Phaser.Math.Distance.Between(p.x, p.y, h.x, h.y);
      if (d < HOLE_R && d > 1) {
        const f = 62 * grow * (1 - d / HOLE_R) + 12 * grow;
        pullX += ((h.x - p.x) / d) * f;
        pullY += ((h.y - p.y) / d) * f;
      }
      if (live && d < HOLE_EAT * grow) g.hurt();
      for (const group of [g.playerBullets, g.enemyBullets]) {
        for (const b of group.getChildren().slice() as Phaser.Physics.Arcade.Image[]) {
          if (!b.body) continue;
          const bd = Phaser.Math.Distance.Between(b.x, b.y, h.x, h.y);
          if (bd < HOLE_EAT * grow) { b.destroy(); continue; }
          if (bd > HOLE_R) continue;
          const f = 300 * grow * (1 - bd / HOLE_R) * dt;
          b.body.velocity.x += ((h.x - b.x) / bd) * f;
          b.body.velocity.y += ((h.y - b.y) / bd) * f;
        }
      }
      if (h.t >= HOLE_LIFE) {
        this.holes.splice(this.holes.indexOf(h), 1);
        g.sparks.explode(16, h.x, h.y);
        if (live) for (let i = 0; i < 10; i++) g.enemyShoot(h.x, h.y, (i / 10) * Math.PI * 2, 48);
      }
    }
    g.bossPull = { x: pullX, y: pullY };

    // Space warps: the screen ripples, then it jumps somewhere new and tears
    // open space around the edges, which fire at the ship.
    this.warpIn -= ms;
    if (live && this.warpIn <= 0 && this.warpT < 0) { this.warpT = 0; this.warpIn = WARP_EVERY; }
    if (this.warpT >= 0) {
      this.warpT += ms;
      if (Math.floor(this.warpT / 80) % 2 === 0) {
        for (let y = 0; y < H; y += 6) {
          const off = Math.sin(y / 14 + this.warpT / 60) * 4;
          gfx.fillStyle(0x9878f8, 0.25).fillRect(off < 0 ? 0 : W - off * 2, y, Math.abs(off) * 2, 2);
        }
      }
      if (this.warpT >= WARP_WARN) {
        this.warpT = -1;
        g.cameras.main.flash(180, 120, 60, 200);
        g.cameras.main.shake(250, 0.006);
        g.sparks.explode(20, this.x, this.y);
        this.x = Phaser.Math.Between(40, W - 40);
        for (let i = 0; i < 3; i++) {
          const left = i % 2 === 0;
          this.tears.push({ x: left ? 10 : W - 10, y: Phaser.Math.Between(90, H - 70), t: -i * 220, fired: 0 });
        }
        g.tipOnce('warp', 'SPACE TEARS OPEN.\nWATCH THE EDGES');
      }
    }
    for (const tr of this.tears.slice()) {
      tr.t += ms;
      if (tr.t < 0) continue;
      const open = Math.min(1, tr.t / 300) * (tr.t > TEAR_LIFE - 250 ? Math.max(0, (TEAR_LIFE - tr.t) / 250) : 1);
      const len = 22 * open;
      for (const [w, c] of [[4, 0x6844fc], [2, 0xd800cc], [1, 0xfcfcfc]] as const) {
        gfx.fillStyle(c, 1);
        for (let k = -len / 2; k < len / 2; k += 2) gfx.fillRect(tr.x - w / 2 + Math.sin(k * 0.6 + tr.t / 50) * 2, tr.y + k, w, 2);
      }
      // Four aimed shots, a beat apart, once it's open.
      if (live && tr.t > 350 + tr.fired * 160 && tr.fired < 4) {
        tr.fired++;
        g.enemyShoot(tr.x, tr.y, undefined, 70);
      }
      if (tr.t >= TEAR_LIFE) this.tears.splice(this.tears.indexOf(tr), 1);
    }
  }

  private checkShots() {
    const g = this.g;
    if (this.entering) return;
    if (this.phase === 1 && !this.hiding) {
      for (const e of this.eyes) {
        if (e.hp <= 0) continue;
        for (const o of shotsIn(g, e.img.x, e.img.y, 6, 6)) {
          o.destroy();
          e.hp -= g.shotDamage(o, ['plasma', 'explosive'], ['kinetic']);
          g.flash(e.img);
          if (e.hp <= 0) {
            g.sparks.explode(14, e.img.x, e.img.y);
            e.img.setVisible(false);
            break;
          }
        }
      }
      if (this.eyes.every((e) => e.hp <= 0)) { this.retreat(); return; }
    }
    for (const o of shotsIn(g, this.x, this.y, 20, 18)) {
      if (this.dead) return;
      o.destroy();
      if (this.phase === 1 || this.hiding) { g.tink(o.x, o.y); continue; }
      const dmg = g.shotDamage(o, ['plasma', 'explosive'], ['kinetic']);
      if (this.phase === 2) {
        this.membrane -= dmg;
        g.flash(this.membraneImg);
        if (this.membrane <= 0) { this.membraneImg.setVisible(false); this.walls = []; this.retreat(); return; }
      } else if (this.phase === 3) {
        this.hp -= dmg;
        g.flash(this.core);
        if (this.hp <= 0) { this.retreat(); return; }
      } else {
        this.horror -= dmg;
        g.flash(this.core);
        if (this.horror <= 0) { this.defeat(); return; }
      }
    }
  }

  private toPhase(n: number) {
    const g = this.g;
    this.phase = n;
    g.cameras.main.shake(500, 0.008);
    g.sparks.explode(20, this.x, this.y);
    if (n === 2) {
      this.membraneImg.setVisible(true).setScale(0.2);
      toast(g, 'FLY THROUGH THE GAPS', 120, 1000);
    } else if (n === 3) {
      g.enemyBullets.clear(true, true);
      toast(g, 'THE CORE IS EXPOSED!', 120, 1000);
    } else {
      // The horror: it splits open into a maw.
      this.core.setTexture('mindmaw');
      g.cameras.main.flash(500, 136, 20, 0);
      g.cameras.main.shake(900, 0.012);
      this.teethIn = 1600;
      this.spiralIn = 900;
      toast(g, 'IT OPENS ITS MAW', 120, 1200);
      g.radio('VEX: WHAT IS THAT?!\nDON\'T LOOK AT IT!');
    }
  }

  private defeat() {
    const g = this.g;
    this.dead = true;
    this.holes = [];
    this.tears = [];
    g.bossPull = { x: 0, y: 0 };
    g.enemyBullets.clear(true, true);
    g.cameras.main.flash(800, 252, 252, 252);
    g.tweens.add({ targets: this.red, alpha: 0, duration: 1500 });
    bossDeath(g, this.x, this.y, 22, 18, REWARD, () => {
      this.core.destroy();
      this.membraneImg.destroy();
      this.eyes.forEach((e) => e.img.destroy());
    }, 16);
    this.onDefeated();
  }
}
