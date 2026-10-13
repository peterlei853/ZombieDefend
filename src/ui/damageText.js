import { HUD_DEPTH, LAYOUT_SCALE, layoutPx } from '../systems/DepthView.js';
import { GAME_CONFIG } from '../data/GameConfig.js';

/** Combat floating-number colors. */
export const DAMAGE_COLORS = {
  handgun: '#00ffff',
  shotgun: '#ffaa00',
  pet: '#aa00ff',
  phoenix: '#ffb74d',
  panda: '#c5e1a5',
  lion: '#ffe082',
  dragon: '#80deea',
  barricade: '#ff0000',
};

/**
 * Positive integer damage, or 0 when nothing should print.
 * @param {number} damage
 * @returns {number}
 */
function roundedDamage(damage) {
  const amount = Math.round(Number(damage));
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  return amount;
}

/**
 * Integer shown as `-N`. Non-positive and non-finite values print nothing.
 * Amounts above JUICE.DAMAGE_TEXT_MAX are clamped so one label cannot
 * read as `-1000`. Combat HP is not touched here.
 * @param {number} damage
 * @returns {number}
 */
export function damageReadoutAmount(damage) {
  const amount = roundedDamage(damage);
  if (amount <= 0) return 0;
  const cap = GAME_CONFIG.JUICE.DAMAGE_TEXT_MAX;
  if (Number.isFinite(cap) && cap > 0) return Math.min(cap, amount);
  return amount;
}

/**
 * Live floaters that can still absorb another hit. Keyed by scene so a
 * retry cannot update a label from the previous run.
 * @type {WeakMap<object, Map<string, ReadoutEntry>>}
 */
const readoutsByScene = new WeakMap();

/**
 * @typedef {object} ReadoutEntry
 * @property {Phaser.GameObjects.Text} text
 * @property {number} total Unclamped sum. The label prints the capped amount.
 * @property {number} openedAt
 * @property {number} anchorY
 * @property {number} gen
 * @property {Phaser.Tweens.Tween|null} tween
 */

/**
 * @param {Phaser.Scene} scene
 * @returns {Map<string, ReadoutEntry>}
 */
function readoutBucket(scene) {
  let bucket = readoutsByScene.get(scene);
  if (!bucket) {
    bucket = new Map();
    readoutsByScene.set(scene, bucket);
    scene.events?.once?.('shutdown', () => {
      bucket.clear();
      readoutsByScene.delete(scene);
    });
  }
  return bucket;
}

/**
 * @param {Phaser.Scene} scene
 * @returns {number}
 */
function readoutNow(scene) {
  const t = scene?.time?.now;
  if (Number.isFinite(t)) return t;
  return Date.now();
}

/**
 * @param {string|number|null|undefined} coalesceKey
 * @param {string} color
 * @returns {string|null}
 */
function mergeKey(coalesceKey, color) {
  if (coalesceKey == null || coalesceKey === '') return null;
  return `${color || '#ffffff'}|${coalesceKey}`;
}

/**
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 * @param {number} amount Already clamped.
 * @param {string} color
 */
function createLabel(scene, x, y, amount, color) {
  return scene.add
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
}

/**
 * Rise and fade. A later hit in the same window restarts this tween so the
 * summed total stays readable, but a stale onComplete cannot destroy it.
 * @param {Phaser.Scene} scene
 * @param {Phaser.GameObjects.Text} text
 * @param {number} anchorY
 * @param {ReadoutEntry} entry
 */
function playFloat(scene, text, anchorY, entry) {
  const juice = GAME_CONFIG.JUICE;
  const gen = (entry.gen || 0) + 1;
  entry.gen = gen;
  entry.tween?.stop?.();
  entry.tween = null;
  if (scene.tweens.killTweensOf) scene.tweens.killTweensOf(text);
  if (typeof text.setAlpha === 'function') text.setAlpha(1);
  entry.tween = scene.tweens.add({
    targets: text,
    y: anchorY - juice.DAMAGE_TEXT_FLOAT_PX * LAYOUT_SCALE,
    alpha: 0,
    duration: juice.DAMAGE_TEXT_DURATION_MS,
    ease: 'Quad.easeOut',
    onComplete: () => {
      if (entry.gen !== gen) return;
      entry.tween = null;
      if (text.active) text.destroy();
    },
  });
}

/**
 * Bold damage readout at world (x, y). Floats up JUICE.DAMAGE_TEXT_FLOAT_PX
 * field px (scaled) and fades over JUICE.DAMAGE_TEXT_DURATION_MS, then destroys.
 * `damage` is a positive amount; the label is shown as `-N`.
 *
 * Each shotgun pellet is 10 and already under the cap, but a fan used to
 * spawn one label per pellet. Knockback steps the body about one digit
 * between those labels, so the staggered `-10`s read as `-100` / `-1000` /
 * `-10000`. `coalesceKey` (a zombie id) folds hits of the same color into
 * one capped label for JUICE.DAMAGE_TEXT_MERGE_MS. Barricade bites omit the
 * key so each red number stays its own popup.
 *
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 * @param {number} damage
 * @param {string} color CSS color, e.g. `#ff0000`
 * @param {string|number|null} [coalesceKey]
 * @returns {Phaser.GameObjects.Text|null}
 */
export function showDamageText(scene, x, y, damage, color, coalesceKey = null) {
  const incoming = roundedDamage(damage);
  if (!scene || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  if (incoming <= 0) return null;

  const tint = color || '#ffffff';
  const shown = damageReadoutAmount(incoming);
  const key = mergeKey(coalesceKey, tint);
  const mergeMs = GAME_CONFIG.JUICE.DAMAGE_TEXT_MERGE_MS;
  const canMerge = !!(key && Number.isFinite(mergeMs) && mergeMs > 0);

  if (canMerge) {
    const bucket = readoutBucket(scene);
    const now = readoutNow(scene);
    const existing = bucket.get(key);
    if (existing?.text?.active && now - existing.openedAt <= mergeMs) {
      existing.total += incoming;
      existing.text.setText(`-${damageReadoutAmount(existing.total)}`);
      playFloat(scene, existing.text, existing.anchorY, existing);
      return existing.text;
    }

    const text = createLabel(scene, x, y, shown, tint);
    /** @type {ReadoutEntry} */
    const entry = {
      text,
      total: incoming,
      openedAt: now,
      anchorY: y,
      gen: 0,
      tween: null,
    };
    bucket.set(key, entry);
    text.once?.('destroy', () => {
      if (bucket.get(key) === entry) bucket.delete(key);
    });
    playFloat(scene, text, y, entry);
    return text;
  }

  const text = createLabel(scene, x, y, shown, tint);
  playFloat(scene, text, y, {
    text,
    total: incoming,
    openedAt: 0,
    anchorY: y,
    gen: 0,
    tween: null,
  });
  return text;
}
