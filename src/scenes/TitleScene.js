import { APP_VERSION } from '../data/GameConfig.js';
import { SoundManager } from '../systems/SoundManager.js';
import { createLibraryAnims } from '../assets/libraryAssets.js';
import {
  FONT_HUD,
  FONT_INK,
  FONT_TINY,
  INK_TINT,
  UI,
  addKitImage,
  addKitText,
  addParchmentButton,
  addTitleBackdrop,
} from '../ui/uiKit.js';

/**
 * Title / start screen.
 * Backdrop is `ui-title-bg-clean` (688×384): hero, pets, and the logo, with
 * no baked NEW/LOAD/SCOREBOARD and no v0.21 footer. `ui-title-bg-clean-hd`
 * is the 1280×720 fallback. START stays a separate parchment button.
 * TITLE_BG_ALIAS (`bg-title-zombie-vs-buddy`) is only the older fallback.
 */
export default class TitleScene extends Phaser.Scene {
  constructor() {
    super('TitleScene');
  }

  create() {
    createLibraryAnims(this);
    const { width, height } = this.scale;

    if (!addTitleBackdrop(this, width, height)) {
      if (this.textures.exists('bg-campus-night-full')) {
        this.add.image(0, 0, 'bg-campus-night-full').setOrigin(0, 0);
        this.add.rectangle(width / 2, height / 2, width, height, 0x070b10, 0.5);
      } else {
        this.add.rectangle(width / 2, height / 2, width, height, 0x0b0f14);
      }
    }

    // Sit the card over the painted button row so the splash logo stays visible.
    const cardY = Math.round(height * 0.66);
    addKitImage(this, width / 2, cardY, UI.dialog, { depth: 2 });

    // Dialog header is navy; the body is parchment. Outlined/cream on the
    // header, ink on the body, parchment button in the lower band.
    addKitText(this, width / 2, cardY - 72, 'ZombieDefend', {
      font: FONT_HUD,
      size: 32,
      depth: 4,
    });
    addKitText(this, width / 2, cardY - 36, `v${APP_VERSION}`, {
      font: FONT_TINY,
      size: 16,
      depth: 4,
    });
    addKitText(this, width / 2, cardY + 16, 'STAGE 1', {
      font: FONT_INK,
      size: 16,
      tint: INK_TINT,
      color: '#2a2118',
      depth: 4,
    });

    const startStage = () => {
      this.audio?.playUiClick();
      this.scene.start('StageScene', {
        stage: this.registry.get('stage') || 1,
        gold: this.registry.get('gold') || 0,
        characterId: this.registry.get('characterId') || 'default',
      });
    };

    addKitImage(this, width / 2 - 100, cardY + 72, UI.ready, { depth: 4 });
    const btn = addParchmentButton(this, width / 2, cardY + 72, 'START', startStage, {
      scale: 2,
      depth: 4,
    });

    this.audio = new SoundManager(this);
    this.events.once('shutdown', () => {
      this.audio?.dispose();
      this.audio = null;
    });

    this.input.keyboard?.once('keydown-ENTER', startStage);
    this.input.keyboard?.once('keydown-SPACE', startStage);

    void btn;
  }
}
