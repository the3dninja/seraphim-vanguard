import Phaser from 'phaser';
import { W, H } from './config';
import type { GameScene } from './scenes/GameScene';
import { BOSS_STATS } from './data/bosses';

// Level 15's organic barriers, drawn every frame.

const SPEED = 30; // px per second barriers scroll, with the hive's walls

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

  // Across [x0, x1] (the open stretch between the hive's walls), or a short piece of it.
  spawn(full: boolean, x0 = 0, x1 = W) {
    const g = this.g;
    const n = Math.max(2, Math.round((x1 - x0) / CELL_W));
    const cw = (x1 - x0) / n;
    let from = 0, to = n;
    if (!full) {
      const len = Phaser.Math.Between(2, 3);
      from = Phaser.Math.Between(0, Math.max(0, n - len));
      to = Math.min(n, from + len);
    }
    const cells: Cell[] = [];
    for (let i = from; i < to; i++) cells.push({ x0: Math.round(x0 + i * cw), x1: Math.round(x0 + (i + 1) * cw), hp: S.hp.cell });
    const b = { y: -CELL_H, cells, t: 0 };
    this.list.push(b);
    // Eggs ride on top of some cells.
    for (const c of cells) if (Math.random() < (full ? 0.25 : 0.4)) g.spawnEgg((c.x0 + c.x1) / 2, b.y - 8, SPEED);
    g.tipOnce('barrier', full ? 'SHOOT A WAY\nTHROUGH THE GROWTH' : 'GROWTHS BLOCK\nTHE WAY');
  }

  clear() { this.list = []; this.gfx.clear(); }

  // Whether a point is inside a live barrier cell.
  solidAt(x: number, y: number) {
    return this.list.some((b) => Math.abs(y - b.y) < CELL_H / 2 && b.cells.some((c) => x > c.x0 && x < c.x1));
  }

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
          if (p.y > H - 30) { p.y = H - 30; g.hurt(); }
        }
      }
    }
  }

  destroy() { this.gfx.destroy(); }
}
