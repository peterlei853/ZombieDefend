import BootScene from './scenes/BootScene.js';
import StageScene from './scenes/StageScene.js';
import ShopScene from './scenes/ShopScene.js';
import { GAME_WIDTH, GAME_HEIGHT } from './data/waves.js';

/**
 * ZombieDefend — Phaser 3 entry.
 * Scenes are registered here; Architect can insert SaveManager / auth scenes later.
 *
 * parent: 'game-host' matches Architect shell index.html.
 */
const config = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-host',
  backgroundColor: '#0b0f14',
  scene: [BootScene, StageScene, ShopScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

const game = new Phaser.Game(config);
// Hook for Architect / playtest tooling (not required at runtime)
window.__ZD_GAME = game;
