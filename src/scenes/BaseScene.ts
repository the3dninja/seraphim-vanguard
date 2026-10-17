import Phaser from 'phaser';
import { COLOR, W, H } from '../config';
import { LEVELS, isBuilt } from '../data/levels';
import { closesSystem, sideById, unbeatenSides } from '../data/sides';
import { cloneSave, writeSave, type SaveData } from '../save';
import { button, starfield, text, toast } from '../ui';

// Playtest helper: ?side=ID flies that side mission once, straight from Base.
let sideJumpDone = false;

// The hub between levels. Arriving here autosaves.
export class BaseScene extends Phaser.Scene {
  private state!: SaveData;
  private scroll!: ReturnType<typeof starfield>;
  private creditsText!: Phaser.GameObjects.Text;
  // Back from a mission: open the star map, flagging newly unlocked side missions.
  private toMap = false;
  private unlocked: string[] = [];

  constructor() { super('Base'); }

  init(data: { state: SaveData; toMap?: boolean; unlocked?: string[] }) {
    this.state = cloneSave(data.state);
    this.toMap = !!data.toMap;
    this.unlocked = data.unlocked ?? [];
    // Playtest helpers: ?rich tops credits up to 5000, ?level=N jumps to level N.
    const params = new URLSearchParams(location.search);
    if (params.has('rich')) this.state.credits = Math.max(this.state.credits, 5000);
    const jump = Number(params.get('level'));
    if (isBuilt(LEVELS[jump - 1])) this.state.level = jump;
  }

  create() {
    writeSave(this.state);
    this.cameras.main.fadeIn(300);
    this.scroll = starfield(this);

    text(this, W / 2, 24, 'BASE', COLOR.white, 16).setOrigin(0.5);
    const next = LEVELS[this.state.level - 1];
    text(this, W / 2, 50, `NEXT: LEVEL ${this.state.level}`, COLOR.gray).setOrigin(0.5);
    const done = this.state.level > LEVELS.length;
    text(this, W / 2, 64, isBuilt(next) ? next.name : done ? 'CAMPAIGN COMPLETE' : 'NOT BUILT YET', COLOR.cyan).setOrigin(0.5);

    this.add.image(W / 2 - 34, 86, 'coinIcon').setOrigin(0, 0.5);
    this.creditsText = text(this, W / 2 - 26, 86, '', COLOR.yellow).setOrigin(0, 0.5);
    this.refresh();
    const open = unbeatenSides(this.state).length;
    if (open) text(this, W / 2, 98, `${open} SIDE MISSION${open > 1 ? 'S' : ''} OPEN`, COLOR.cyan).setOrigin(0.5);

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
    button(this, bx, 174, bw, bh, 'VIEW MAP', () => this.openMap());
    button(this, bx, 214, bw, bh, 'BEGIN MISSION', () => this.launch(), COLOR.yellow);

    text(this, W / 2, H - 14, 'PROGRESS SAVED', COLOR.dim).setOrigin(0.5);

    if (this.toMap) this.openMap(this.unlocked);

    const jump = new URLSearchParams(location.search).get('side');
    if (jump && sideById(jump) && !sideJumpDone) {
      sideJumpDone = true;
      this.time.delayedCall(400, () => this.fly(jump));
    }
  }

  private openMap(unlocked: string[] = []) {
    this.scene.pause();
    this.scene.launch('Map', { state: this.state, unlocked, onLeave: () => {}, onLaunch: (side?: string) => this.launch(side) });
  }

  // The next level, or a side mission. Flying the last level of a system
  // with side missions still open asks first, since they close behind you.
  private launch(side?: string) {
    if (side) { this.fly(side); return; }
    const next = LEVELS[this.state.level - 1];
    if (!isBuilt(next)) {
      const done = this.state.level > LEVELS.length;
      toast(this, done ? 'THE HOLLOW IS GONE.\nTHE GALAXY IS SAFE.' : `LEVEL ${this.state.level}\nIS NOT BUILT YET`, 260);
      return;
    }
    const left = unbeatenSides(this.state).length;
    if (closesSystem(this.state.level) && left) this.confirm(left);
    else this.fly();
  }

  private fly(side?: string) {
    this.cameras.main.fadeOut(300);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Game', { state: this.state, side }));
  }

  // "Side missions are still open. Fly on anyway?"
  private confirm(left: number) {
    const box = this.add.container(0, 0).setDepth(100);
    box.add(this.add.rectangle(0, 0, W, H, 0x000000, 0.85).setOrigin(0).setInteractive());
    box.add(this.add.rectangle(10, 92, W - 20, 132, 0xfcfcfc).setOrigin(0));
    box.add(this.add.rectangle(11, 93, W - 22, 130, 0x000000).setOrigin(0));
    box.add(text(this, W / 2, 104, 'FLY ON?', COLOR.yellow).setOrigin(0.5, 0));
    const msg = left > 1 ? `${left} SIDE MISSIONS ARE STILL OPEN.` : 'A SIDE MISSION IS STILL OPEN.';
    box.add(text(this, W / 2, 122, `${msg} THEY CLOSE ONCE YOU LEAVE THIS SYSTEM.`, COLOR.white)
      .setOrigin(0.5, 0).setAlign('center').setWordWrapWidth(W - 36));
    box.add(button(this, 20, 190, 64, 22, 'STAY', () => box.destroy(), COLOR.cyan));
    box.add(button(this, 92, 190, 68, 22, 'FLY ON', () => { box.destroy(); this.fly(); }, COLOR.yellow));
  }

  private refresh() {
    this.creditsText.setText(`${this.state.credits}`);
  }

  update(_t: number, delta: number) {
    this.scroll(delta / 1000, 0.3);
  }
}
