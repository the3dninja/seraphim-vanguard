import Phaser from 'phaser';
import '@fontsource/press-start-2p/latin-400.css';
import { W, H, FONT } from './config';
import { BootScene } from './scenes/BootScene';
import { TitleScene } from './scenes/TitleScene';
import { GameScene } from './scenes/GameScene';
import { VendorScene } from './scenes/VendorScene';
import { BaseScene } from './scenes/BaseScene';

function start() {
  new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: W,
    height: H,
    backgroundColor: '#000000',
    pixelArt: true,
    roundPixels: true,
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    physics: { default: 'arcade', arcade: { debug: false } },
    input: { activePointers: 2 },
    scene: [BootScene, TitleScene, GameScene, VendorScene, BaseScene],
  });
}

// Text is drawn with the pixel font, so wait for it before the first scene draws.
document.fonts.load(`8px ${FONT}`).then(start, start);
