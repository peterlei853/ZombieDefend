import { HUD_DEPTH } from '../systems/DepthView.js';

/** Combat floating-number colors. */
export const DAMAGE_COLORS = {
  handgun: '#00ffff',
  shotgun: '#ffaa00',
  pet: '#aa00ff',
  barricade: '#ff0000',
};

/**
 * Bold damage readout at world (x, y). Floats up 30px and fades over 0.6s, then destroys.
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
      fontSize: '18px',
      fontStyle: 'bold',
      color: color || '#ffffff',
      stroke: '#14080a',
      strokeThickness: 3,
    })
    .setOrigin(0.5, 0.5)
    .setDepth(HUD_DEPTH + 40);

  scene.tweens.add({
    targets: text,
    y: y - 30,
    alpha: 0,
    duration: 600,
    ease: 'Quad.easeOut',
    onComplete: () => {
      if (text.active) text.destroy();
    },
  });

  return text;
}
