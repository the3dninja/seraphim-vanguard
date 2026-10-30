import Phaser from 'phaser';
import { generateArt } from '../art';
import { loadPortraits } from '../portraits';

export class BootScene extends Phaser.Scene {
  constructor() { super('Boot'); }

  preload() {
    loadPortraits(this);
  }

  create() {
    generateArt(this);
    this.scene.start('Title');
  }
}
