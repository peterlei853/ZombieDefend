/**
 * Minimal Shop stub — Architect will expand with real inventory / upgrades.
 * Receives { stage, gold, characterId } from StageScene on win.
 */
import {
  FONT_HUD,
  FONT_INK,
  FONT_TINY_INK,
  INK_TINT,
  UI,
  addKitImage,
  addKitText,
  addParchmentButton,
} from '../ui/uiKit.js';

export default class ShopScene extends Phaser.Scene {
  constructor() {
    super('ShopScene');
  }

  init(data) {
    this.stage = data?.stage ?? this.registry.get('stage') ?? 1;
    this.gold = data?.gold ?? this.registry.get('gold') ?? 0;
    this.characterId = data?.characterId ?? this.registry.get('characterId') ?? 'default';

    this.registry.set('stage', this.stage);
    this.registry.set('gold', this.gold);
    this.registry.set('characterId', this.characterId);
  }

  create() {
    const { width, height } = this.scale;
    if (this.textures.exists('bg-campus-night-full')) {
      this.add.image(0, 0, 'bg-campus-night-full').setOrigin(0, 0);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x121820);
    }
    this.add.rectangle(width / 2, height / 2, width, height, 0x070b10, 0.55);
    addKitImage(this, width / 2, height / 2, UI.dialog, { depth: 2 });

    const cx = width / 2;
    const cy = height / 2;
    addKitText(this, cx, cy - 72, 'SHOP', {
      font: FONT_HUD,
      size: 32,
      depth: 4,
    });
    addKitText(this, cx, cy - 36, `STAGE ${this.stage}`, {
      font: FONT_HUD,
      size: 16,
      depth: 4,
    });
    addKitText(this, cx, cy + 14, `GOLD ${this.gold}`, {
      font: FONT_INK,
      size: 16,
      tint: INK_TINT,
      color: '#2a2118',
      depth: 4,
    });
    const id = String(this.characterId ?? '');
    addKitText(this, cx, cy + 36, `ID ${id}`, {
      font: FONT_TINY_INK,
      size: 16,
      tint: INK_TINT,
      color: '#3a2c1c',
      depth: 4,
      system: /[^A-Za-z0-9 .]/.test(id),
    });
    addKitText(this, cx, cy + 56, 'Shop items stub', {
      system: true,
      size: 14,
      color: '#3a2c1c',
      depth: 4,
    });

    addParchmentButton(this, cx, cy + 96, 'NEXT', () => {
      const nextStage = this.stage + 1;
      this.registry.set('stage', nextStage);
      this.scene.start('StageScene', {
        stage: nextStage,
        gold: this.gold,
        characterId: this.characterId,
      });
    }, { scale: 2, depth: 4 });
  }
}
