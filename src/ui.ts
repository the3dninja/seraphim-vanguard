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

// A modal list to pick one of several things (each with an icon), or cancel
// (answers -1). Blocks taps on everything behind it.
export function choose(scene: Phaser.Scene, title: string, options: { label: string; icon: string }[], onPick: (i: number) => void) {
  const layer = scene.add.container(0, 0).setDepth(2000);
  const rowH = 20;
  const shown = options.slice(0, 8);
  const h = 34 + shown.length * rowH + 26;
  const top = Math.round(H / 2 - h / 2);
  const shade = scene.add.rectangle(0, 0, W, H, 0x000000, 0.75).setOrigin(0).setInteractive();
  const panel = scene.add.rectangle(8, top, W - 16, h, 0xfcfcfc).setOrigin(0);
  const inner = scene.add.rectangle(9, top + 1, W - 18, h - 2, 0x000000).setOrigin(0);
  const q = text(scene, W / 2, top + 8, title).setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(W - 32);
  layer.add([shade, panel, inner, q]);
  const done = (i: number) => { layer.destroy(); onPick(i); };
  shown.forEach((o, i) => {
    const y = top + 28 + i * rowH;
    layer.add(button(scene, 14, y, W - 28, rowH - 3, '', () => done(i)));
    layer.add(scene.add.image(24, y + (rowH - 3) / 2, o.icon));
    layer.add(text(scene, 33, y + 5, o.label));
  });
  layer.add(button(scene, 14, top + h - 24, W - 28, 18, 'CANCEL', () => done(-1), COLOR.gray));
  return layer;
}

// Damage type words in a description, in their type's color.
const TYPE_WORDS: Record<string, string> = {
  KINETIC: '#bcbcbc', LASER: '#d82800', PLASMA: '#58d854', ION: '#3cbcfc', EXPLOSIVE: '#f8b800',
};

// Wrapped text with each damage type named in it (LASER, ION...) in that
// type's color. The font is monospaced, so words are laid out by character.
export function richText(scene: Phaser.Scene, x: number, y: number, str: string, width: number, color = COLOR.white, size = 8) {
  const c = scene.add.container(x, y);
  const perLine = Math.max(1, Math.floor(width / size));
  const lines: string[][] = [];
  for (const para of str.split('\n')) {
    let line: string[] = [];
    let len = 0;
    for (const word of para.split(' ').filter(Boolean)) {
      if (len && len + 1 + word.length > perLine) { lines.push(line); line = []; len = 0; }
      line.push(word);
      len += (len ? 1 : 0) + word.length;
    }
    lines.push(line);
  }
  lines.forEach((words, row) => {
    // Runs of words in one color, each drawn as one text from its first word's column.
    let col = 0;
    let run: { str: string; color: string; col: number } | null = null;
    const flush = () => { if (run) c.add(text(scene, run.col * size, row * (size + 3), run.str, run.color, size)); };
    for (const word of words) {
      const wc = TYPE_WORDS[word.replace(/[^A-Z]/g, '')] ?? color;
      if (run && run.color === wc) run.str += ` ${word}`;
      else { flush(); run = { str: word, color: wc, col }; }
      col += word.length + 1;
    }
    flush();
  });
  return c;
}
