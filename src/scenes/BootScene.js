import { preloadPlayerAssets, registerPlayerAnims } from '../assets/playerSprites.js';
import { preloadZombieAssets, registerZombieAnims } from '../assets/zombieSprites.js';
import { createLibraryAnims, preloadLibrary } from '../assets/libraryAssets.js';
import { preloadGameAudio } from '../systems/SoundManager.js';

/**
 * Loads the library, then hands the canvas to TitleScene.
 * Skips full LocalStorage auth — Title jumps straight into Stage 1.
 */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    preloadLibrary(this);
    preloadPlayerAssets(this);
    preloadZombieAssets(this);
    preloadGameAudio(this);
  }

  create() {
    createLibraryAnims(this);
    registerPlayerAnims(this);
    registerZombieAnims(this);

    const authStub = {
      loggedIn: true,
      userId: 'playtest-user',
      characterId: 'default',
    };
    this.registry.set('auth', authStub);
    this.registry.set('gold', this.registry.get('gold') ?? 0);
    this.registry.set('characterId', authStub.characterId);
    this.registry.set('stage', this.registry.get('stage') ?? 1);

    this.scene.start('TitleScene');
  }
}
