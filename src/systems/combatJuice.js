import { GAME_CONFIG } from '../data/GameConfig.js';
import { depthFromY, LAYOUT_SCALE } from './DepthView.js';

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function between(min, max) {
  const math = globalThis.Phaser?.Math;
  if (math?.Between) return math.Between(min, max);
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * Brief combat hitch. StageScene multiplies its own delta by the scale
 * returned from tickHitlag; tweens and sprite anims dip for the same window.
 * The timer is real time, so a timescale of ~0 does not freeze the restore.
 * @param {Phaser.Scene} scene
 */
export function beginHitlag(scene) {
  if (!scene) return;
  const juice = GAME_CONFIG.JUICE;
  const now = nowMs();
  if (!scene._hitlagUntil || now >= scene._hitlagUntil) {
    scene._hitlagPrevTweens = scene.tweens?.timeScale ?? 1;
    scene._hitlagPrevAnims = scene.anims?.globalTimeScale ?? 1;
  }
  const until = now + juice.HITLAG_MS;
  scene._hitlagUntil = Math.max(scene._hitlagUntil || 0, until);
  if (scene.tweens) scene.tweens.timeScale = juice.HITLAG_SCALE;
  if (scene.anims) scene.anims.globalTimeScale = juice.HITLAG_SCALE;
}

/**
 * Call once per StageScene update, before gameplay uses `delta`.
 * @param {Phaser.Scene} scene
 * @returns {number} multiplier for this frame's delta (1 when no hitch is active)
 */
export function tickHitlag(scene) {
  if (!scene?._hitlagUntil) return 1;
  if (nowMs() >= scene._hitlagUntil) {
    scene._hitlagUntil = 0;
    if (scene.tweens) scene.tweens.timeScale = scene._hitlagPrevTweens ?? 1;
    if (scene.anims) scene.anims.globalTimeScale = scene._hitlagPrevAnims ?? 1;
    return 1;
  }
  return GAME_CONFIG.JUICE.HITLAG_SCALE;
}

/** Stronger than the per-volley shotgun shake. @param {Phaser.Scene} scene */
export function shakeOverkill(scene) {
  const cam = scene?.cameras?.main;
  if (!cam?.shake || scene.ended) return;
  const juice = GAME_CONFIG.JUICE;
  cam.shake(juice.SCREEN_SHAKE_OVERKILL_MS, juice.SCREEN_SHAKE_OVERKILL);
}

const BLOOD_COLORS = [0xc62828, 0x43a047, 0x7cb342, 0x8e1b1b];
const FRAGMENT_COLORS = [0xe53935, 0x2e7d32, 0x8bc34a, 0xb71c1c, 0xff7043];

/**
 * Green and red specks drifting up from a normal kill.
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 */
export function spawnBlood(scene, x, y) {
  if (!scene?.add?.rectangle || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const juice = GAME_CONFIG.JUICE;
  const tweens = scene.tweens;
  if (!tweens?.add) return;
  for (let i = 0; i < juice.BLOOD_COUNT; i++) {
    const size = Math.max(2, Math.round((2 + (i % 2)) * LAYOUT_SCALE));
    const drop = scene.add.rectangle(x, y, size, size, BLOOD_COLORS[i % BLOOD_COLORS.length]);
    drop.setDepth(depthFromY(y, 8));
    const dx = (Math.random() * 18 - 10) * LAYOUT_SCALE;
    const dy = -((0.55 + Math.random() * 0.45) * juice.BLOOD_UP_PX) * LAYOUT_SCALE;
    tweens.add({
      targets: drop,
      x: x + dx,
      y: y + dy,
      alpha: 0,
      duration: juice.BLOOD_MS,
      ease: 'Quad.easeOut',
      onComplete: () => {
        if (drop.active) drop.destroy();
      },
    });
  }
}

/**
 * 4–6 pixel chunks for a shotgun / overkill kill. Biased left and up,
 * away from the barricade the zombie was facing.
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 */
export function spawnFragments(scene, x, y) {
  if (!scene?.add?.rectangle || !Number.isFinite(x) || !Number.isFinite(y)) return;
  const juice = GAME_CONFIG.JUICE;
  const tweens = scene.tweens;
  if (!tweens?.add) return;
  const count = between(juice.FRAGMENT_MIN, juice.FRAGMENT_MAX);
  for (let i = 0; i < count; i++) {
    const size = Math.max(3, Math.round(between(3, 6) * LAYOUT_SCALE));
    const frag = scene.add.rectangle(x, y, size, size, FRAGMENT_COLORS[i % FRAGMENT_COLORS.length]);
    frag.setDepth(depthFromY(y, 12));
    const dx = (-between(12, 34) + between(0, 8)) * LAYOUT_SCALE;
    const dy = (-between(10, 28) + between(0, 6)) * LAYOUT_SCALE;
    tweens.add({
      targets: frag,
      x: x + dx,
      y: y + dy,
      angle: between(-240, 240),
      alpha: 0,
      duration: juice.FRAGMENT_MS,
      ease: 'Quad.easeOut',
      onComplete: () => {
        if (frag.active) frag.destroy();
      },
    });
  }
}
