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
 * Integer shown as `-N`. Non-positive and non-finite values print nothing.
 * Amounts above JUICE.DAMAGE_TEXT_MAX are clamped so a stalled queue cannot
 * read as `-1000`. Combat HP is not touched here.
 * @param {number} damage
 * @returns {number}
 */
export function damageReadoutAmount(damage) {
  const amount = Math.round(Number(damage));
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const cap = GAME_CONFIG.JUICE.DAMAGE_TEXT_MAX;
  if (Number.isFinite(cap) && cap > 0) return Math.min(cap, amount);
  return amount;
}

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
  const amount = damageReadoutAmount(damage);
  if (!scene || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (amount <= 0) return null;

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
