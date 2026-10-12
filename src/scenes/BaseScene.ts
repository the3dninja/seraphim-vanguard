import Phaser from 'phaser';
import { COLOR, W, H } from '../config';
import { LEVELS } from '../data/levels';
import { cloneSave, writeSave, type SaveData } from '../save';
import { button, starfield, text, toast } from '../ui';

// The hub between levels. Arriving here autosaves.
export class BaseScene extends Phaser.Scene {
  private state!: SaveData;
  private scroll!: ReturnType<typeof starfield>;
  private creditsText!: Phaser.GameObjects.Text;

  constructor() { super('Base'); }

  init(data: { state: SaveData }) {
    this.state = cloneSave(data.state);
  }

  create() {
    writeSave(this.state);
    this.cameras.main.fadeIn(300);
    this.scroll = starfield(this);

    text(this, W / 2, 24, 'BASE', COLOR.white, 16).setOrigin(0.5);
    const next = LEVELS[this.state.level - 1];
    text(this, W / 2, 50, `NEXT: LEVEL ${this.state.level}`, COLOR.gray).setOrigin(0.5);
    text(this, W / 2, 64, next ? next.name : 'NOT BUILT YET', COLOR.cyan).setOrigin(0.5);

    this.add.image(W / 2 - 34, 86, 'coinIcon').setOrigin(0, 0.5);
    this.creditsText = text(this, W / 2 - 26, 86, '', COLOR.yellow).setOrigin(0, 0.5);
    this.refresh();

    const bx = 30, bw = 120, bh = 24;
    button(this, bx, 110, bw, bh, 'VENDOR', () => {
      this.scene.pause();
      this.scene.launch('Vendor', {
        state: this.state,
        mode: 'base',
        from: 'Base',
        onLeave: () => { writeSave(this.state); this.refresh(); },
      });
    });
    button(this, bx, 142, bw, bh, 'SHIP', () => {
      this.scene.pause();
      this.scene.launch('Ship', {
        state: this.state,
        onLeave: () => { writeSave(this.state); this.refresh(); },
      });
    });
    button(this, bx, 174, bw, bh, 'VIEW MAP', () => toast(this, 'STAR MAP\nCOMING SOON', 260));
    button(this, bx, 214, bw, bh, 'BEGIN MISSION', () => {
      if (!next) {
        toast(this, `LEVEL ${this.state.level}\nIS NOT BUILT YET`, 260);
        return;
      }
      this.cameras.main.fadeOut(300);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Game', { state: this.state }));
    }, COLOR.yellow);

    text(this, W / 2, H - 14, 'PROGRESS SAVED', COLOR.dim).setOrigin(0.5);
  }

  private refresh() {
    this.creditsText.setText(`${this.state.credits}`);
  }

  update(_t: number, delta: number) {
    this.scroll(delta / 1000, 0.3);
  }
}
