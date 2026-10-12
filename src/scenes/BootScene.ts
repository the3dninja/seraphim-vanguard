import Phaser from 'phaser';
import { generateArt } from '../art';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  create() {
    generateArt(this);
    this.scene.start('Title');
  }
}
