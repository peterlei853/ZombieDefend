import { preloadPlayerAssets, registerPlayerAnims } from '../assets/playerSprites.js';
import { preloadZombieAssets, registerZombieAnims } from '../assets/zombieSprites.js';
import { createLibraryAnims, preloadLibrary } from '../assets/libraryAssets.js';
import { SaveManager } from '../data/SaveManager.js';
import { spriteKeyForPet } from '../data/petSelectRoster.js';
import { preloadGameAudio } from '../systems/SoundManager.js';
import { GO_BACK_HUD_HOOK } from '../ui/goBackHudHook.js';

/**
 * Loads the library, then hands the canvas to TitleScene.
 * Title opens PetSelect before Stage. Auth and CharSelect are not in this build.
 * SaveManager restores selectedPetId for the playtest user.
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

    const save = new SaveManager();
    save.bind(authStub.userId);
    const selectedPetId = save.getSelectedPetId();
    this.registry.set('saveManager', save);
    this.registry.set('selectedPetId', selectedPetId);
    this.registry.set('selectedPetSpriteKey', spriteKeyForPet(selectedPetId));
    // PIXELLAB_HOOK: GO! / Back! art keys. Gameplay owns the press.
    this.registry.set('goBackHudHook', GO_BACK_HUD_HOOK);

    this.scene.start('TitleScene');
  }
}
