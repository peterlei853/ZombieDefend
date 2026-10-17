import { APP_VERSION, debugPetSkillEnabled, demoEnemyId, demoWeaponId, petHurtDebugRequested, petLowHpDebugRequested } from '../data/GameConfig.js';
import { STAGE_COUNT, stageFromQuery } from '../data/stageRoster.js';
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
 * is the 1280×720 fallback. Stages 1–5 are parchment buttons. START
 * launches stage 1, or `?stage=N` when that query is a real stage.
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
    addKitText(this, width / 2, cardY - 4, 'STAGE', {
      font: FONT_INK,
      size: 16,
      tint: INK_TINT,
      color: '#2a2118',
      depth: 4,
    });

    const defaultStage = stageFromQuery() || 1;
    let left = false;
    const startStage = (stage) => {
      if (left) return;
      left = true;
      const n = Math.min(STAGE_COUNT, Math.max(1, Math.floor(Number(stage) || defaultStage)));
      this.audio?.playUiClick();
      this.registry.set('stage', n);
      this.scene.start('StageScene', {
        stage: n,
        gold: this.registry.get('gold') || 0,
        characterId: this.registry.get('characterId') || 'default',
      });
    };

    // One button per stage. Scale 1 keeps five 73px parchments inside the dialog.
    const btnW = 73;
    const gap = 12;
    const rowY = cardY + 32;
    const total = STAGE_COUNT * btnW + (STAGE_COUNT - 1) * gap;
    let x = width / 2 - total / 2 + btnW / 2;
    for (let stage = 1; stage <= STAGE_COUNT; stage += 1) {
      addParchmentButton(this, x, rowY, String(stage), () => startStage(stage), {
        scale: 1,
        depth: 4,
      });
      x += btnW + gap;
    }

    const startY = cardY + 96;
    addKitImage(this, width / 2 - 100, startY, UI.ready, { depth: 4 });
    const btn = addParchmentButton(this, width / 2, startY, 'START', () => startStage(defaultStage), {
      scale: 2,
      depth: 4,
    });

    this.audio = new SoundManager(this);
    this.events.once('shutdown', () => {
      this.audio?.dispose();
      this.audio = null;
    });
    this.audio.startTitleBgm();

    this.input.keyboard?.once('keydown-ENTER', () => startStage(defaultStage));
    this.input.keyboard?.once('keydown-SPACE', () => startStage(defaultStage));
    const digitCodes = ['ONE', 'TWO', 'THREE', 'FOUR', 'FIVE'];
    digitCodes.forEach((code, index) => {
      this.input.keyboard?.once(`keydown-${code}`, () => startStage(index + 1));
    });
    if (petHurtDebugRequested() || petLowHpDebugRequested() || demoWeaponId() || debugPetSkillEnabled() || demoEnemyId()) {
      this.time.delayedCall(0, () => startStage(defaultStage));
    }

    void btn;
  }
}
