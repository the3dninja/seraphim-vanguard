import Phaser from 'phaser';
import { COLOR, W, H } from '../config';
import { clearSave, loadSave, newSave } from '../save';
import { ask, button, starfield, text } from '../ui';
import { testSave } from '../combatTest';
import { fitScene } from '../screen';
import { editorEnabled, editorLink, openEditor } from '../editor';

let testJumpDone = false; // ?test opens combat test once; quitting it comes back here
let editJumpDone = false; // ?edit opens the Level Editor once

export class TitleScene extends Phaser.Scene {
  private scroll!: ReturnType<typeof starfield>;

  private openEditorNow = false;

  constructor() { super('Title'); }

  // `editor`: back from an editor playtest, so the editor opens again.
  init(data: { editor?: boolean }) {
    this.openEditorNow = !!data?.editor || (editorLink() && !editJumpDone);
    editJumpDone = editJumpDone || this.openEditorNow;
  }

  create() {
    fitScene(this, 10000);
    this.cameras.main.fadeIn(300);
    this.scroll = starfield(this);
    this.add.image(150, 44, 'planet');

    text(this, W / 2, 90, 'SERAPHIM', COLOR.white, 16).setOrigin(0.5);
    text(this, W / 2, 112, 'VANGUARD', COLOR.cyan, 16).setOrigin(0.5);
    const ship = this.add.image(W / 2, 170, 'ship').setScale(2);
    this.tweens.add({ targets: ship, y: 165, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });

    // ?test: combat test mode, straight away the first time, then from a button.
    if (new URLSearchParams(location.search).has('test')) {
      if (!testJumpDone && !this.openEditorNow) {
        testJumpDone = true;
        this.scene.start('Game', { state: testSave(), test: true });
        return;
      }
      button(this, 30, 270, 120, 22, 'COMBAT TEST', () => this.go('Game', { state: testSave(), test: true }), COLOR.yellow);
    }

    const save = loadSave();
    if (save) {
      button(this, 30, 210, 120, 22, 'CONTINUE', () => this.go('Base', { state: save }));
      button(this, 30, 240, 120, 22, 'NEW GAME', () => {
        ask(this, 'START OVER?\nYOUR SAVE WILL BE ERASED.', ['YES', 'NO'], (i) => {
          if (i === 0) {
            clearSave();
            this.go('Game', { state: newSave() });
          }
        });
      }, COLOR.gray);
    } else {
      button(this, 30, 220, 120, 22, 'START', () => this.go('Game', { state: newSave() }));
    }

    // ?edit or ?test: the Level Editor, from a button (and straight away with ?edit, or back from a playtest).
    const test = new URLSearchParams(location.search).has('test');
    if (editorEnabled()) button(this, 30, test ? 296 : 270, 120, 22, 'LEVEL EDITOR', () => openEditor(), COLOR.cyan);
    if (!editorEnabled() || !test) text(this, W / 2, H - 14, 'V0.1 PROTOTYPE', COLOR.dim).setOrigin(0.5);
    if (this.openEditorNow) this.time.delayedCall(0, () => openEditor());
  }

  private go(scene: string, data: object) {
    this.cameras.main.fadeOut(250);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(scene, data));
  }

  update(_t: number, delta: number) {
    this.scroll(delta / 1000);
  }
}
