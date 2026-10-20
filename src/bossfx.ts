import Phaser from 'phaser';
import type { BossStatsKind } from './data/bosses';
import type { GameScene } from './scenes/GameScene';

// The end of a boss: a string of blasts over its body, then a shower of gold.
// `hide` runs at the last blast, to remove the sprites.
export function bossDeath(g: GameScene, x: number, y: number, w: number, h: number, reward: number, hide: () => void, blasts = 9) {
  let n = 0;
  g.time.addEvent({
    delay: 140, repeat: blasts - 1, callback: () => {
      g.sparks.explode(12, x + Phaser.Math.Between(-w, w), y + Phaser.Math.Between(-h, h));
      g.cameras.main.shake(80, 0.008);
      if (++n === blasts) {
        for (let i = 0; i < reward / 25; i++) g.dropCoin(x, y, 25, Phaser.Math.Between(-35, 35), Phaser.Math.Between(10, 45));
        g.sparks.explode(40, x, y);
        hide();
      }
    },
  });
}

// Player shots inside a box around (x, y), for bosses to test hits against.
export function shotsIn(g: GameScene, x: number, y: number, hw: number, hh: number) {
  return (g.playerBullets.getChildren() as Phaser.Physics.Arcade.Image[])
    .filter((o) => o.active && Math.abs(o.x - x) <= hw && Math.abs(o.y - y) <= hh);
}

// Whether the ship is inside a box around (x, y).
export const shipIn = (g: GameScene, x: number, y: number, hw: number, hh: number) =>
  Math.abs(g.player.x - x) < hw && Math.abs(g.player.y - y) < hh;

// Side missions bring back a mini boss in a new color, with more or less health.
// skin: the body's texture. shards: Frostjaw sheds and fires ice shards.
// `stats` names the BOSS_STATS entry for a boss's health and damage taken.
export interface BossOpts { tint?: number; stats?: BossStatsKind; skin?: string; shards?: boolean }
