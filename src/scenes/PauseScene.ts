import Phaser from 'phaser';
import { COLOR, W, H } from '../config';
import { ask, button, text } from '../ui';
import { fitScene, pointerAt } from '../screen';
import { cheats, cheatsEnabled, unlockAllLevels } from '../cheats';
import { openTuner, tunerEnabled } from '../tuner';

interface PauseData {
  test: boolean; // combat test: aborting goes back to the title, and there's no level to skip through
  abortNote: string; // what aborting costs, for its prompt
  resume: () => void;
  abort: () => void;
  quit: () => void; // to the title, when the page can't close itself
  skipTo: (at: number) => void; // reloads the level this far through it (0 to 1)
  edit?: () => void; // a Level Editor playtest: back to the editor (in place of abort and quit)
}

type Panel = 'main' | 'options' | 'cheats';

const hexNum = (c: string) => Phaser.Display.Color.HexStringToColor(c).color;
const BW = 120; // menu button width
const BX = (W - BW) / 2;

// The pause menu, over the paused Game scene: Resume, Abort Mission, Options
// and Quit, and the Cheat Menu below them when cheats are on (see cheats.ts).
export class PauseScene extends Phaser.Scene {
  private d!: PauseData;
  private panel!: Phaser.GameObjects.Container;
  private skipAt = 0.5; // the Skip To Location slider, kept while the menu is open
  private dragSlider: ((p: Phaser.Input.Pointer) => void) | null = null;

  constructor() { super('Pause'); }

  init(data: PauseData) {
    this.d = data;
    this.dragSlider = null;
  }

  create() {
    fitScene(this);
    // Shade over the game and the HUD in the strips around it, taking every tap.
    this.add.rectangle(-1000, -1000, W + 2000, H + 2000, 0x000000, 0.8).setOrigin(0).setInteractive();
    this.panel = this.add.container(0, 0);
    this.show('main');
    this.input.keyboard?.on('keydown-ESC', () => this.d.resume());
    this.input.keyboard?.on('keydown-P', () => this.d.resume());
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { if (p.isDown) this.dragSlider?.(p); });
    this.input.on('pointerup', () => { this.dragSlider = null; });
  }

  private show(p: Panel) {
    this.panel.removeAll(true);
    if (p === 'main') this.mainPanel();
    else if (p === 'options') this.optionsPanel();
    else this.cheatsPanel();
  }

  private add2<T extends Phaser.GameObjects.GameObject>(o: T) {
    this.panel.add(o);
    return o;
  }

  private mainPanel() {
    this.add2(text(this, W / 2, 64, 'PAUSED', COLOR.white, 16).setOrigin(0.5));
    this.add2(button(this, BX, 100, BW, 22, 'RESUME', () => this.d.resume()));
    // An editor playtest has nothing to abort or quit: only the way back, and the playtesting tools.
    const edit = this.d.edit;
    if (edit) {
      this.add2(button(this, BX, 130, BW, 22, 'CHEAT MENU', () => this.show('cheats'), COLOR.yellow));
      this.add2(button(this, 16, 160, W - 32, 22, 'RETURN TO EDITOR', () => edit(), COLOR.cyan));
      if (tunerEnabled()) this.add2(button(this, BX, 206, BW, 22, 'TUNER', () => openTuner(), COLOR.yellow));
      return;
    }
    this.add2(button(this, BX, 130, BW, 22, 'ABORT MISSION', () => {
      ask(this, `ABORT MISSION?\n${this.d.abortNote}`, ['ABORT', 'NO'], (i) => { if (i === 0) this.d.abort(); });
    }));
    this.add2(button(this, BX, 160, BW, 22, 'OPTIONS', () => this.show('options')));
    this.add2(button(this, BX, 190, BW, 22, 'QUIT', () => {
      ask(this, 'QUIT THE GAME?\nTHIS MISSION WON\'T\nBE SAVED.', ['QUIT', 'NO'], (i) => { if (i === 0) this.quit(); });
    }));
    if (cheatsEnabled()) this.add2(button(this, BX, 236, BW, 22, 'CHEAT MENU', () => this.show('cheats'), COLOR.yellow));
    if (tunerEnabled()) this.add2(button(this, BX, 266, BW, 22, 'TUNER', () => openTuner(), COLOR.yellow));
  }

  // Browsers only let a page close itself in some cases (like an installed
  // app on Android). Otherwise the title screen is as far as it can go.
  private quit() {
    window.close();
    setTimeout(() => this.d.quit(), 300);
  }

  private optionsPanel() {
    this.add2(text(this, W / 2, 64, 'OPTIONS', COLOR.white, 16).setOrigin(0.5));
    this.add2(text(this, W / 2, 130, 'NOTHING TO SET\nUP YET', COLOR.gray).setOrigin(0.5).setAlign('center'));
    this.add2(button(this, BX, 190, BW, 22, 'BACK', () => this.show('main'), COLOR.gray));
  }

  private cheatsPanel() {
    this.add2(text(this, W / 2, 20, 'CHEAT MENU', COLOR.yellow, 8).setOrigin(0.5, 0));
    const boxes: (() => void)[] = [];
    const check = (y: number, label: string, get: () => boolean, set: (on: boolean) => void) => {
      const hit = this.add2(this.add.rectangle(12, y - 3, W - 24, 16, 0x000000, 0).setOrigin(0).setInteractive({ useHandCursor: true }));
      this.add2(this.add.rectangle(16, y, 10, 10, 0x000000).setOrigin(0).setStrokeStyle(1, 0xfcfcfc));
      const mark = this.add2(this.add.rectangle(18, y + 2, 6, 6, 0xf8b800).setOrigin(0));
      this.add2(text(this, 32, y + 1, label));
      const draw = () => mark.setVisible(get());
      boxes.push(draw);
      hit.on('pointerup', () => { set(!get()); boxes.forEach((b) => b()); });
      draw();
    };
    // God Mode and Demigod Mode can't both be on.
    check(42, 'GOD MODE', () => cheats.god, (on) => { cheats.god = on; if (on) cheats.demigod = false; });
    check(60, 'DEMIGOD MODE', () => cheats.demigod, (on) => { cheats.demigod = on; if (on) cheats.god = false; });
    check(78, 'INFINITE ITEMS', () => cheats.infiniteItems, (on) => { cheats.infiniteItems = on; });

    this.add2(text(this, 16, 102, 'GAME SPEED'));
    const speeds = [1, 2, 4] as const;
    const speedButtons = speeds.map((s, i) => this.add2(button(this, 16 + i * 52, 114, 44, 18, `${s}X`, () => {
      cheats.speed = s;
      paintSpeeds();
    })));
    const paintSpeeds = () => speedButtons.forEach((b, i) => b.setAlpha(cheats.speed === speeds[i] ? 1 : 0.4));
    paintSpeeds();

    const label = this.add2(text(this, 16, 146, ''));
    const at = this.add2(text(this, W - 16, 146, '', COLOR.yellow).setOrigin(1, 0));
    this.slider(162, () => this.skipAt, (v) => { this.skipAt = v; at.setText(v.toFixed(1)); });
    label.setText(this.d.test ? 'SKIP TO: NO LEVEL' : 'SKIP TO:');
    at.setText(this.d.test ? '' : this.skipAt.toFixed(1));
    this.add2(button(this, 16, 184, W - 32, 18, 'RELOAD THERE', () => this.d.skipTo(this.skipAt))).setEnabled(!this.d.test);

    if (!this.d.edit) this.add2(button(this, 16, 220, W - 32, 18, 'UNLOCK ALL LEVELS', () => {
      ask(this, 'UNLOCK ALL LEVELS?\nTHIS CHANGES YOUR\nSAVE FOR GOOD.', ['YES', 'NO'], (i) => {
        if (i !== 0) return;
        unlockAllLevels();
        ask(this, 'ALL LEVELS ARE\nOPEN ON THE MAP\nAT BASE.', ['OK'], () => {});
      });
    }, COLOR.red));

    this.add2(button(this, BX, 280, BW, 22, 'BACK', () => this.show('main'), COLOR.gray));
  }

  // A slider from 0 to 1 in steps of 0.1: tap or drag along it.
  private slider(y: number, get: () => number, set: (v: number) => void) {
    const x0 = 22;
    const len = W - 44;
    this.add2(this.add.rectangle(x0, y, len, 2, 0x7c7c7c).setOrigin(0, 0.5));
    for (let i = 0; i <= 10; i++) {
      this.add2(this.add.rectangle(x0 + (len * i) / 10, y, 1, i % 5 ? 4 : 7, 0x7c7c7c).setOrigin(0.5));
    }
    const knob = this.add2(this.add.rectangle(0, y, 6, 12, hexNum(COLOR.yellow)).setOrigin(0.5));
    const place = () => knob.setX(x0 + len * get());
    place();
    if (this.d.test) { knob.setVisible(false); return; }
    const hit = this.add2(this.add.rectangle(x0 - 8, y - 10, len + 16, 20, 0x000000, 0).setOrigin(0).setInteractive({ useHandCursor: true }));
    const to = (p: Phaser.Input.Pointer) => {
      const v = Phaser.Math.Clamp(Math.round(((pointerAt(p).x - x0) / len) * 10) / 10, 0, 1);
      set(v);
      place();
    };
    hit.on('pointerdown', (p: Phaser.Input.Pointer) => { this.dragSlider = to; to(p); });
  }
}
