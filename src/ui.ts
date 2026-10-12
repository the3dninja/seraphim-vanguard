import Phaser from 'phaser';
import { COLOR, FONT, W, H } from './config';

export function text(scene: Phaser.Scene, x: number, y: number, str: string, color = COLOR.white, size = 8) {
  return scene.add.text(x, y, str, { fontFamily: FONT, fontSize: `${size}px`, color, lineSpacing: 3 });
}

export interface Button extends Phaser.GameObjects.Container {
  setEnabled(on: boolean): Button;
  setLabel(label: string): Button;
}

// A bordered NES-style button. Fires on release so a drag that ends elsewhere doesn't click.
export function button(
  scene: Phaser.Scene, x: number, y: number, w: number, h: number, label: string,
  onClick: () => void, color = COLOR.white,
): Button {
  const c = scene.add.container(x, y) as Button;
  const border = scene.add.rectangle(0, 0, w, h, Phaser.Display.Color.HexStringToColor(color).color).setOrigin(0);
  const fill = scene.add.rectangle(1, 1, w - 2, h - 2, 0x000000).setOrigin(0);
  const t = text(scene, Math.round(w / 2), Math.round(h / 2), label, color).setOrigin(0.5);
  c.add([border, fill, t]);
  c.setSize(w, h);
  border.setInteractive({ useHandCursor: true });
  let enabled = true;
  let pressed = false;
  border.on('pointerdown', () => { if (enabled) { pressed = true; fill.setFillStyle(0x3c3c3c); } });
  border.on('pointerout', () => { pressed = false; fill.setFillStyle(0x000000); });
  border.on('pointerup', () => {
    fill.setFillStyle(0x000000);
    if (enabled && pressed) onClick();
    pressed = false;
  });
  c.setEnabled = (on: boolean) => {
    enabled = on;
    c.setAlpha(on ? 1 : 0.35);
    return c;
  };
  c.setLabel = (s: string) => { t.setText(s); return c; };
  return c;
}

// A short message in the middle of the screen that fades away.
export function toast(scene: Phaser.Scene, msg: string, y = H / 2 - 20, ms = 1600) {
  const t = text(scene, W / 2, y, msg, COLOR.yellow).setOrigin(0.5).setDepth(1000);
  t.setAlign('center');
  scene.tweens.add({ targets: t, alpha: 0, delay: ms, duration: 300, onComplete: () => t.destroy() });
  return t;
}

// A modal question with up to three answers. Blocks taps on everything behind it.
export function ask(scene: Phaser.Scene, question: string, answers: string[], onAnswer: (i: number) => void) {
  const layer = scene.add.container(0, 0).setDepth(2000);
  const shade = scene.add.rectangle(0, 0, W, H, 0x000000, 0.75).setOrigin(0).setInteractive();
  const panel = scene.add.rectangle(8, H / 2 - 50, W - 16, 100, 0xfcfcfc).setOrigin(0);
  const inner = scene.add.rectangle(9, H / 2 - 49, W - 18, 98, 0x000000).setOrigin(0);
  const q = text(scene, W / 2, H / 2 - 42, question).setOrigin(0.5, 0).setAlign('center');
  q.setWordWrapWidth(W - 32);
  layer.add([shade, panel, inner, q]);
  const bw = Math.floor((W - 32 - (answers.length - 1) * 6) / answers.length);
  answers.forEach((a, i) => {
    layer.add(button(scene, 16 + i * (bw + 6), H / 2 + 18, bw, 20, a, () => {
      layer.destroy();
      onAnswer(i);
    }));
  });
  return layer;
}

// Two scrolling star layers, shared by every screen.
export function starfield(scene: Phaser.Scene) {
  const far = scene.add.tileSprite(0, 0, W, H, 'stars-far').setOrigin(0);
  const near = scene.add.tileSprite(0, 0, W, H, 'stars-near').setOrigin(0);
  return (dt: number, speed = 1) => {
    far.tilePositionY -= 6 * speed * dt;
    near.tilePositionY -= 18 * speed * dt;
  };
}
