import { HUD_DEPTH, LAYOUT_SCALE, layoutPx } from '../systems/DepthView.js';
import { GAME_CONFIG } from '../data/GameConfig.js';

/** Combat floating-number colors. */
export const DAMAGE_COLORS = {
  handgun: '#00ffff',
  shotgun: '#ffaa00',
  pet: '#aa00ff',
  barricade: '#ff0000',
};

/**
 * Bold damage readout at world (x, y). Floats up JUICE.DAMAGE_TEXT_FLOAT_PX
 * field px (scaled) and fades over JUICE.DAMAGE_TEXT_DURATION_MS, then destroys.
 * `damage` is a positive amount; the label is shown as `-N`.
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 * @param {number} damage
 * @param {string} color CSS color, e.g. `#ff0000`
 * @returns {Phaser.GameObjects.Text|null}
 */
export function showDamageText(scene, x, y, damage, color) {
  const amount = Math.round(Number(damage));
  if (!scene || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const text = scene.add
    .text(x, y, `-${amount}`, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: `${layoutPx(18)}px`,
      fontStyle: 'bold',
      color: color || '#ffffff',
      stroke: '#14080a',
      strokeThickness: layoutPx(3),
    })
    .setOrigin(0.5, 0.5)
    .setDepth(HUD_DEPTH + 40);

  const juice = GAME_CONFIG.JUICE;
  scene.tweens.add({
    targets: text,
    y: y - juice.DAMAGE_TEXT_FLOAT_PX * LAYOUT_SCALE,
    alpha: 0,
    duration: juice.DAMAGE_TEXT_DURATION_MS,
    ease: 'Quad.easeOut',
    onComplete: () => {
      if (text.active) text.destroy();
    },
  });

  return text;
}
