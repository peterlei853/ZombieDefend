import { GAME_WIDTH } from '../data/waves.js';
import { HORIZON_Y, WORLD_SHIFT_X } from '../systems/DepthView.js';

/**
 * Outdoor plates from the Nov 17 leftover set. Interiors stay cataloged.
 * The cycle does not include the five already-cataloged M2 plates.
 * PIXELLAB_HOOK: bg-m2-* — extra sky options, not a campus replacement.
 */
export const M2_SKY_CYCLE = Object.freeze([
  'bg-m2-campus-night',
  'bg-m2-residential-street',
  'bg-m2-night-apartments',
  'bg-m2-crane-skyline',
  'bg-m2-rooftop-night',
]);

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

/**
 * One extra 320×180 plate in the sky band, chosen by stage.
 * Campus ground layers (depth 4 and 5) stay on top of this strip.
 * Does not replace bg-campus-* or the five cataloged M2 plates.
 * @param {Phaser.Scene} scene
 * @param {number} [stage]
 * @returns {boolean}
 */
export function drawExtraM2Sky(scene, stage) {
  if (!scene?.add?.image || !scene.textures?.exists) return false;
  const ready = M2_SKY_CYCLE.filter((key) => scene.textures.exists(key));
  if (!ready.length) return false;
  const n = Math.max(1, Math.floor(Number(stage) || 1));
  const key = ready[(n - 1) % ready.length];
  scene.add
    .image(WORLD_SHIFT_X, 0, key)
    .setOrigin(0, 0)
    .setDepth(3.2)
    .setDisplaySize(GAME_WIDTH, HORIZON_Y);
  return true;
}
