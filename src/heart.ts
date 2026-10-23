import Phaser from 'phaser';
import { W, H, SHIP_MAX_Y } from './config';
import type { GameScene } from './scenes/GameScene';
import { BOSS_STATS } from './data/bosses';

// Level 15's living tunnel and organic barriers, drawn every frame.

const SPEED = 30; // px per second the tunnel and barriers scroll
const OPEN = W / 2 + 12; // half width when the tunnel is fully open
const NARROW = 34; // half width in the narrow stretches
const CHAMBER = 68; // half width inside a chamber
const EASE = 240; // px over which the tunnel narrows at the start and widens at the end
const CHAMBER_LEN = 280;
const SWAY = 30; // how far the narrow stretches wind left and right

const smooth = (t: number) => { const k = Phaser.Math.Clamp(t, 0, 1); return k * k * (3 - 2 * k); };

// The tunnel: flesh walls close in from both sides, wind back and forth,
// open into chambers now and then, and widen out again at the end. Track
// position u runs along the tunnel; a screen row y shows u = scrolled - y.
export class Tunnel {
  private s = 0; // px scrolled since the tunnel began
  private t = 0;
  private gfx: Phaser.GameObjects.Graphics;

  // `len` is how long the narrow part runs, `chambers` where each chamber starts.
  constructor(private g: GameScene, private len: number, private chambers: number[]) {
    this.gfx = g.add.graphics();
  }

  // Under everything that flies: put the walls just above the scenery.
  sink(index: number) { this.g.children.moveTo(this.gfx, index); }

  // Done once the whole screen has opened out again.
  get done() { return this.s - H > this.len + EASE; }

  private chamberness(u: number) {
    let k = 0;
    for (const c of this.chambers) {
      const into = u - c;
      if (into < -60 || into > CHAMBER_LEN + 60) continue;
      k = Math.max(k, smooth((into + 60) / 60) * smooth((CHAMBER_LEN + 60 - into) / 60));
    }
    return k;
  }

  // The tunnel's center and half width at track position u.
  profile(u: number) {
    const closed = smooth(u / EASE) * smooth((this.len + EASE - u) / EASE);
    const ch = this.chamberness(u);
    const half = Phaser.Math.Linear(OPEN, Phaser.Math.Linear(NARROW, CHAMBER, ch), closed) + Math.sin(this.t / 260 + u / 40) * 1.5 * closed;
    const cx = W / 2 + Math.sin(u / 150) * SWAY * closed * (1 - ch);
    return { cx, half };
  }

  // Where row y's walls are.
  at(y: number) {
    const { cx, half } = this.profile(this.s - y);
    return { l: cx - half, r: cx + half, cx, half };
  }

  // An x for something entering at the top, from 0 to 1 across the tunnel.
  mapX(x01: number, y: number) {
    const { cx, half } = this.at(y);
    return cx + (x01 - 0.5) * 2 * Math.max(4, half - 10);
  }

  update(dt: number, moving: boolean) {
    const g = this.g;
    if (moving) this.s += SPEED * dt;
    this.t += dt * 1000;
    const gfx = this.gfx;
    gfx.clear();
    for (let y = -2; y < H + 3; y += 3) {
      const u = this.s - y;
      const { l, r } = this.at(y);
      if (l <= -2 && r >= W + 2) continue;
      const rib = Math.floor(u / 8) % 2 === 0;
      for (const [x0, x1, edge] of [[0, l, l], [r, W, r]]) {
        if (x1 <= x0) continue;
        gfx.fillStyle(rib ? 0x4c0010 : 0x3c000c, 1).fillRect(x0, y, x1 - x0, 3);
        // A glistening edge, and veins running through the flesh.
        gfx.fillStyle(0xd82800, 1).fillRect(edge === l ? l - 2 : r, y, 2, 3);
        gfx.fillStyle(0xfc7460, 0.8).fillRect(edge === l ? l - 1 : r, y, 1, Math.floor(u / 3) % 3 === 0 ? 3 : 1);
        const vx = edge === l ? l - 8 - Math.round(Math.sin(u / 23) * 4) : r + 6 + Math.round(Math.sin(u / 19) * 4);
        if (vx > x0 && vx < x1) gfx.fillStyle(0x881400, 1).fillRect(vx, y, 1, 3);
      }
    }
    if (g.phase !== 'action') return;
    // Shots hitting the walls stop (the Wave Beam passes through).
    for (const group of [g.playerBullets, g.enemyBullets]) {
      for (const b of group.getChildren().slice() as Phaser.Physics.Arcade.Image[]) {
        if (!b.active || b.getData('fx') === 'wave') continue;
        const { l, r } = this.at(b.y);
        if (b.x < l - 1 || b.x > r + 1) { if (group === g.playerBullets) g.tink(b.x, b.y); b.destroy(); }
      }
    }
    // The walls hurt and shove the ship back toward the middle.
    const p = g.player;
    const { l, r } = this.at(p.y);
    if (p.x - 4 < l || p.x + 4 > r) {
      g.hurt();
      p.x = Phaser.Math.Clamp(p.x, l + 6, r - 6);
    }
  }

  destroy() { this.gfx.destroy(); }
}

interface Cell { x0: number; x1: number; hp: number }
interface Barrier { y: number; cells: Cell[]; t: number }

const CELL_W = 30;
const CELL_H = 12;
const S = BOSS_STATS.barrier; // cell health and damage taken, live from the Tuner

// Organic barriers: rows of fleshy cells that drift down and block the way.
// Each cell takes a couple of seconds of fire to burst. A full barrier spans
// the screen; a growth is a short piece of two or three cells. Cells push the
// ship down, and hurt it if they pin it to the bottom. Some carry eggs.
export class Barriers {
  private list: Barrier[] = [];
  private gfx: Phaser.GameObjects.Graphics;

  constructor(private g: GameScene) {
    this.gfx = g.add.graphics().setDepth(9.5); // over enemies, under shots and the ship
  }

  spawn(full: boolean) {
    const g = this.g;
    const n = W / CELL_W;
    let from = 0, to = n;
    if (!full) {
      const len = Phaser.Math.Between(2, 3);
      from = Phaser.Math.Between(0, n - len);
      to = from + len;
    }
    const cells: Cell[] = [];
    for (let i = from; i < to; i++) cells.push({ x0: i * CELL_W, x1: (i + 1) * CELL_W, hp: S.hp.cell });
    const b = { y: -CELL_H, cells, t: 0 };
    this.list.push(b);
    // Eggs ride on top of some cells.
    for (const c of cells) if (Math.random() < (full ? 0.25 : 0.4)) g.spawnEgg((c.x0 + c.x1) / 2, b.y - 8, SPEED);
    g.tipOnce('barrier', full ? 'SHOOT A WAY\nTHROUGH THE GROWTH' : 'GROWTHS BLOCK\nTHE WAY');
  }

  clear() { this.list = []; this.gfx.clear(); }

  update(dt: number) {
    const g = this.g;
    const gfx = this.gfx;
    gfx.clear();
    const live = g.phase === 'action';
    const p = g.player;
    for (const b of this.list.slice()) {
      b.y += SPEED * dt;
      b.t += dt * 1000;
      b.cells = b.cells.filter((c) => c.hp > 0);
      if (b.y > H + CELL_H || b.cells.length === 0) { this.list.splice(this.list.indexOf(b), 1); continue; }
      for (const c of b.cells) {
        const hurt = 1 - c.hp / S.hp.cell;
        const wob = Math.sin(b.t / 300 + c.x0) * 1;
        const top = b.y - CELL_H / 2 + wob;
        gfx.fillStyle(0x6c0c3c, 1).fillRoundedRect(c.x0 + 1, top, c.x1 - c.x0 - 2, CELL_H, 4);
        gfx.fillStyle(hurt > 0.6 ? 0x881400 : 0xa40080, 1).fillRoundedRect(c.x0 + 3, top + 2, c.x1 - c.x0 - 6, CELL_H - 5, 3);
        gfx.fillStyle(0xf878f8, 1).fillRect(c.x0 + 5, top + 3, 4, 1);
        // Cracks spread as it takes damage.
        if (hurt > 0.3) gfx.fillStyle(0x1c0004, 1).fillRect(c.x0 + 10, top + 3, 1, 5).fillRect(c.x0 + 11, top + 6, 4, 1);
        if (hurt > 0.6) gfx.fillStyle(0x1c0004, 1).fillRect(c.x0 + 19, top + 2, 1, 6).fillRect(c.x0 + 15, top + 5, 4, 1);
      }
      const cellAt = (x: number, y: number) => (Math.abs(y - b.y) <= CELL_H / 2 + 1 ? b.cells.find((c) => x >= c.x0 && x < c.x1) : undefined);
      // Shots: player shots wear cells down, enemy shots just stop.
      for (const s of g.playerBullets.getChildren().slice() as Phaser.Physics.Arcade.Image[]) {
        if (!s.active) continue;
        const c = cellAt(s.x, s.y);
        if (!c) continue;
        c.hp -= g.typedDamage((s.getData('dmg') as number) ?? 1, s.getData('dtype') ?? 'kinetic', S.taken.body);
        g.tink(s.x, s.y);
        s.destroy();
        if (c.hp <= 0) {
          g.sparks.explode(10, (c.x0 + c.x1) / 2, b.y);
          if (Math.random() < 0.3) g.dropCoin((c.x0 + c.x1) / 2, b.y, Phaser.Math.Between(4, 9));
        }
      }
      for (const s of g.enemyBullets.getChildren().slice() as Phaser.Physics.Arcade.Image[]) if (cellAt(s.x, s.y)) s.destroy();
      // A cell shoves the ship out of it (down, unless the ship came from
      // above), and hurts it if it's pinned against the bottom.
      const touching = Math.abs(p.y - b.y) < CELL_H / 2 + 5 && b.cells.some((c) => p.x + 4 > c.x0 && p.x - 4 < c.x1);
      if (live && touching) {
        if (p.y < b.y - 2) p.y = b.y - CELL_H / 2 - 6;
        else {
          p.y = b.y + CELL_H / 2 + 6;
          if (p.y > SHIP_MAX_Y) { p.y = SHIP_MAX_Y; g.hurt(); }
        }
      }
    }
  }

  destroy() { this.gfx.destroy(); }
}
