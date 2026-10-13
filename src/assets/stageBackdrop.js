import { WORLD_SHIFT_X } from '../systems/DepthView.js';

/**
 * Campus plate for the fixed camera (scrollX = WORLD_SHIFT_X).
 * Layers sit above the procedural bands (depth 0–2) and below every actor.
 * Full-bleed keeps a 40×24 px margin so the plate covers the fixed view.
 * Returns false when the library textures are not in the cache.
 * @param {Phaser.Scene} scene
 * @returns {boolean}
 */
export function drawCampusBackdrop(scene) {
  if (!scene?.textures?.exists?.('bg-campus-far')) return false;
  const x0 = WORLD_SHIFT_X;

  // PIXELLAB_HOOK: campus background — assets/library/backgrounds/campus/
  if (scene.textures.exists('bg-campus-full-bleed')) {
    scene.add.image(x0 - 40, -24, 'bg-campus-full-bleed').setOrigin(0, 0).setDepth(2.5);
  }
  scene.add.image(x0, 0, 'bg-campus-far').setOrigin(0, 0).setDepth(3);
  if (scene.textures.exists('bg-campus-fire') && scene.anims?.exists?.('bg-campus-fire')) {
    scene.add.sprite(x0, 16, 'bg-campus-fire').setOrigin(0, 0).setDepth(3.5).play('bg-campus-fire');
  }
  if (scene.textures.exists('bg-campus-ground')) {
    scene.add.image(x0, 0, 'bg-campus-ground').setOrigin(0, 0).setDepth(4);
  }
  if (scene.textures.exists('bg-campus-mid')) {
    scene.add.image(x0, 0, 'bg-campus-mid').setOrigin(0, 0).setDepth(5);
  }
  if (scene.textures.exists('bg-campus-lamp') && scene.anims?.exists?.('bg-campus-lamp')) {
    const lamp = scene.add.sprite(x0 + 1090, 92, 'bg-campus-lamp');
    lamp.setOrigin(0.5, 0.5);
    lamp.setDepth(6);
    lamp.setBlendMode(Phaser.BlendModes.ADD);
    lamp.play('bg-campus-lamp');
  }
  return true;
}
