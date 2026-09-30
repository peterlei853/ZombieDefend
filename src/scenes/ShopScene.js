/**
 * Minimal Shop stub — Architect will expand with real inventory / upgrades.
 * Receives { stage, gold, characterId } from StageScene on win.
 */
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
    this.add.rectangle(width / 2, height / 2, width, height, 0x121820);

    this.add
      .text(width / 2, height * 0.22, `Shop ${this.stage}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '32px',
        color: '#ffd54f',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.36, `Gold: ${this.gold}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '20px',
        color: '#e8eef5',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.46, `Character: ${this.characterId}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '14px',
        color: '#8fa3b8',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.54, '(Shop items stub — Architect will wire SaveManager)', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '12px',
        color: '#607080',
      })
      .setOrigin(0.5);

    const btn = this.add
      .rectangle(width / 2, height * 0.7, 220, 48, 0x1565c0)
      .setInteractive({ useHandCursor: true });
    this.add
      .text(width / 2, height * 0.7, 'Next Stage', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    btn.on('pointerover', () => btn.setFillStyle(0x1976d2));
    btn.on('pointerout', () => btn.setFillStyle(0x1565c0));
    btn.on('pointerup', () => {
      const nextStage = this.stage + 1;
      this.registry.set('stage', nextStage);
      this.scene.start('StageScene', {
        stage: nextStage,
        gold: this.gold,
        characterId: this.characterId,
      });
    });
  }
}
