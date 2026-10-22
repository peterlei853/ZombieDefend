import BootScene from './scenes/BootScene.js';
import TitleScene from './scenes/TitleScene.js';
import PetSelectScene from './scenes/PetSelectScene.js';
import StageScene from './scenes/StageScene.js';
import ShopScene from './scenes/ShopScene.js';
import { GAME_WIDTH, GAME_HEIGHT } from './data/waves.js';

/**
 * ZombieDefend — Phaser 3 entry.
 * Boot → Title → PetSelect → Stage → Shop.
 * Auth and CharSelect are not in this build. PetSelect is the opening pet pick.
 * SaveManager is installed from Boot. Pets are not chosen on an avatar.
 * Arcade physics is off. Zombie and pet soles separate in footprints.js.
 *
 * parent: 'game-host' matches Architect shell index.html.
 */
const config = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-host',
  backgroundColor: '#0b0f14',
  scene: [BootScene, TitleScene, PetSelectScene, StageScene, ShopScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  render: {
    pixelArt: true,
    roundPixels: true,
  },
};

const game = new Phaser.Game(config);
// Hook for Architect / playtest tooling (not required at runtime)
window.__ZD_GAME = game;
