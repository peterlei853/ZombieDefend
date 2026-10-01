import { preloadPlayerAssets, registerPlayerAnims } from '../assets/playerSprites.js';

/**
 * Minimal boot / title stub.
 * Skips full LocalStorage auth — jumps straight into Stage 1 for playtest.
 * Architect can later swap this for real Title → Login → Lobby flow.
 */
export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    preloadPlayerAssets(this);
  }

  create() {
    registerPlayerAnims(this);
    const { width, height } = this.scale;

    this.add.rectangle(width / 2, height / 2, width, height, 0x0b0f14);

    this.add
      .text(width / 2, height * 0.32, 'ZombieDefend', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '36px',
        color: '#e8eef5',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height * 0.44, 'Combat vertical slice — Stage 1', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '16px',
        color: '#8fa3b8',
      })
      .setOrigin(0.5);

    // Auth stub — no real LocalStorage register/login
    const authStub = {
      loggedIn: true,
      userId: 'playtest-user',
      characterId: 'default',
    };
    this.registry.set('auth', authStub);
    this.registry.set('gold', this.registry.get('gold') ?? 0);
    this.registry.set('characterId', authStub.characterId);
    this.registry.set('stage', this.registry.get('stage') ?? 1);

    const btn = this.add
      .rectangle(width / 2, height * 0.62, 200, 48, 0x2e7d32)
      .setInteractive({ useHandCursor: true });
    const btnLabel = this.add
      .text(width / 2, height * 0.62, 'Start Stage 1', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    btn.on('pointerover', () => btn.setFillStyle(0x388e3c));
    btn.on('pointerout', () => btn.setFillStyle(0x2e7d32));
    btn.on('pointerup', () => {
      this.scene.start('StageScene', {
        stage: this.registry.get('stage') || 1,
        gold: this.registry.get('gold') || 0,
        characterId: this.registry.get('characterId') || 'default',
      });
    });

    // Also allow Enter / Space
    this.input.keyboard?.once('keydown-ENTER', () => btn.emit('pointerup'));
    this.input.keyboard?.once('keydown-SPACE', () => btn.emit('pointerup'));

    void btnLabel;
  }
}
