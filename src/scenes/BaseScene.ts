import Phaser from 'phaser';
import { COLOR, W, H } from '../config';
import { LEVELS, isBuilt } from '../data/levels';
import { unreadFoes } from '../data/bestiary';
import { sideById, unbeatenSides } from '../data/sides';
import type { Pick } from './MapScene';
import { cloneSave, writeSave, type SaveData } from '../save';
import { button, starfield, text, toast } from '../ui';

// Playtest helper: ?side=ID flies that side mission once, straight from Base.
let sideJumpDone = false;

// The hub between levels: your ship in the middle (tap it to outfit), Shop,
// Map, Foes and Options in the corners, and Launch below. Arriving here autosaves.
export class BaseScene extends Phaser.Scene {
  private state!: SaveData;
  private scroll!: ReturnType<typeof starfield>;
  private creditsText!: Phaser.GameObjects.Text;
  private coin!: Phaser.GameObjects.Image;
  // Back from a level that unlocked side missions: show the star map briefly, announcing them.
  private toMap = false;
  private unlocked: string[] = [];
  // A side mission or cleared level picked on the map, flown instead of the next level.
  private pick: Pick | null = null;
  private nextLabel!: Phaser.GameObjects.Text;
  private nextName!: Phaser.GameObjects.Text;
  private nextNote!: Phaser.GameObjects.Text;
  private foesIcon!: Phaser.GameObjects.Image;
  private foesBlink: Phaser.Tweens.Tween | null = null;

  constructor() { super('Base'); }

  init(data: { state: SaveData; toMap?: boolean; unlocked?: string[] }) {
    this.state = cloneSave(data.state);
    this.toMap = !!data.toMap;
    this.unlocked = data.unlocked ?? [];
    this.pick = null;
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

    text(this, 8, 10, 'BASE', COLOR.white, 16);
    this.coin = this.add.image(0, 18, 'coinIcon').setOrigin(0, 0.5);
    this.creditsText = text(this, W - 8, 18, '', COLOR.yellow).setOrigin(1, 0.5);
    this.refresh();
    this.nextLabel = text(this, W / 2, 40, '', COLOR.gray).setOrigin(0.5);
    this.nextName = text(this, W / 2, 52, '', COLOR.cyan).setOrigin(0.5);
    this.nextNote = text(this, W / 2, 63, '', COLOR.yellow).setOrigin(0.5);
    this.showNext();

    // Your ship in the middle, on a glowing pad: tap it to outfit it.
    const cx = W / 2, cy = 136;
    this.add.ellipse(cx, cy + 34, 92, 22, 0x0058f8, 0.35);
    this.add.ellipse(cx, cy + 34, 70, 14, 0x3cbcfc, 0.35);
    const ship = this.add.image(cx, cy, 'shipLarge').setScale(2);
    this.tweens.add({ targets: ship, y: cy - 3, yoyo: true, repeat: -1, duration: 900, ease: 'Sine.easeInOut' });
    text(this, cx, cy + 46, 'SHIP').setOrigin(0.5);
    const pad = this.add.zone(cx, cy + 8, 84, 88).setInteractive({ useHandCursor: true });
    let pressed = false;
    pad.on('pointerdown', () => { pressed = true; ship.setTint(0xbcbcbc); });
    pad.on('pointerout', () => { pressed = false; ship.clearTint(); });
    pad.on('pointerup', () => {
      ship.clearTint();
      if (!pressed) return;
      pressed = false;
      this.scene.pause();
      this.scene.launch('Ship', {
        state: this.state,
        onLeave: () => { writeSave(this.state); this.refresh(); },
      });
    });

    // The other rooms, one picture tile in each corner.
    this.tile(30, 88, 'iconShop', 'SHOP', () => {
      this.scene.pause();
      this.scene.launch('Vendor', {
        state: this.state,
        mode: 'base',
        from: 'Base',
        onLeave: () => { writeSave(this.state); this.refresh(); },
      });
    });
    this.tile(W - 30, 88, 'iconMap', 'MAP', () => this.openMap());
    this.foesBlink = null;
    this.foesIcon = this.tile(30, 196, 'iconFoes', 'FOES', () => {
      this.scene.pause();
      this.scene.launch('Bestiary', { state: this.state, onLeave: () => { writeSave(this.state); this.blinkFoes(); } });
    });
    this.blinkFoes();
    this.tile(W - 30, 196, 'iconGear', 'OPTIONS', () => toast(this, 'OPTIONS COMING SOON', 233), 2);

    button(this, 14, 246, W - 28, 34, '', () => this.launch(), COLOR.yellow);
    this.add.image(36, 263, 'ship');
    text(this, W / 2 + 12, 263, 'LAUNCH', COLOR.yellow, 16).setOrigin(0.5);

    const open = unbeatenSides(this.state).length;
    if (open) text(this, W / 2, 292, `${open} SIDE MISSION${open > 1 ? 'S' : ''} OPEN`, COLOR.cyan).setOrigin(0.5);

    text(this, W / 2, H - 14, 'PROGRESS SAVED', COLOR.dim).setOrigin(0.5);

    if (this.toMap) this.openMap(this.unlocked, true);

    const jump = new URLSearchParams(location.search).get('side');
    if (jump && sideById(jump) && !sideJumpDone) {
      sideJumpDone = true;
      this.time.delayedCall(400, () => this.fly({ side: jump }));
    }
  }

  // What Launch flies: the next level, or whatever was left picked on the map.
  private showNext() {
    const p = this.pick;
    const side = p?.side ? sideById(p.side) : undefined;
    const replay = !!p && (side ? this.state.sides.includes(side.id) : p.level! < this.state.level);
    if (side) {
      this.nextLabel.setText(replay ? 'REPLAY: SIDE MISSION' : 'NEXT: SIDE MISSION');
      this.nextName.setText(side.name);
    } else {
      const n = p?.level ?? this.state.level;
      const l = LEVELS[n - 1];
      const done = n > LEVELS.length;
      this.nextLabel.setText(`${replay ? 'REPLAY' : 'NEXT'}: LEVEL ${n}`);
      this.nextName.setText(isBuilt(l) ? l.name : done ? 'CAMPAIGN COMPLETE' : 'NOT BUILT YET');
    }
    this.nextLabel.setColor(side ? COLOR.cyan : COLOR.gray);
    this.nextName.setColor(side ? COLOR.white : COLOR.cyan);
    this.nextNote.setText(replay ? 'HALF CREDITS' : '');
  }

  private openMap(unlocked: string[] = [], announce = false) {
    this.scene.pause();
    this.scene.launch('Map', {
      state: this.state, unlocked, announce, pick: this.pick,
      onLeave: () => {},
      onPick: (pick: Pick | null) => { this.pick = pick; this.showNext(); },
      onLaunch: (pick: Pick) => this.fly(pick),
    });
  }

  // The next level, or what was picked on the map.
  private launch() {
    if (this.pick) { this.fly(this.pick); return; }
    const next = LEVELS[this.state.level - 1];
    if (!isBuilt(next)) {
      const done = this.state.level > LEVELS.length;
      toast(this, done ? 'THE HOLLOW IS GONE.\nTHE GALAXY IS SAFE.' : `LEVEL ${this.state.level}\nIS NOT BUILT YET`, 260);
      return;
    }
    this.fly();
  }

  // A cleared level is flown as a replay.
  private fly(pick?: Pick) {
    const side = pick?.side;
    const replay = pick?.level && pick.level < this.state.level ? pick.level : undefined;
    this.cameras.main.fadeOut(300);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Game', { state: this.state, side, replay }));
  }

  // A 34px picture button with its name underneath. Returns the picture.
  private tile(x: number, y: number, icon: string, label: string, onClick: () => void, scale = 1) {
    button(this, x - 17, y - 17, 34, 34, '', onClick);
    const img = this.add.image(x, y, icon).setScale(scale);
    text(this, x, y + 20, label).setOrigin(0.5, 0);
    return img;
  }

  // The Foes picture flashes while the Bestiary has entries not looked at yet.
  private blinkFoes() {
    const fresh = unreadFoes(this.state).length > 0;
    if (fresh && !this.foesBlink) {
      this.foesBlink = this.tweens.add({ targets: this.foesIcon, alpha: 0.15, yoyo: true, repeat: -1, duration: 300 });
    } else if (!fresh && this.foesBlink) {
      this.foesBlink.remove();
      this.foesBlink = null;
      this.foesIcon.setAlpha(1);
    }
  }

  private refresh() {
    this.creditsText.setText(`${this.state.credits}`);
    this.coin.setX(this.creditsText.x - this.creditsText.width - 9);
  }

  update(_t: number, delta: number) {
    this.scroll(delta / 1000, 0.3);
  }
}
