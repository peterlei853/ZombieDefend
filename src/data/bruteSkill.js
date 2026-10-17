/**
 * Brute skill v2 ground smash.
 *
 * Catalog primary key `zombie-brute-skill_ground_smash` (alias
 * `zombie-brute-skill`): 17×132 @ 10 fps, once, east, feet origin.
 * Texture cells are 0-based, matching the manifest `timing` block.
 * Phaser's `AnimationFrame.index` is that cell plus one — the same
 * index the attack strips have used since v0.36.3.
 *
 * Shock FX `fx-brute-skill-shock` is a 10-frame grid. Its origin is the
 * dust anchor (58, 32) on the 116×77 cell. Spawn that point on the
 * brute's feet (body origin y = 1) at catalog frame 8.
 *
 * The damage frame is catalog cell 13. `lateAttackFrame(17)` is Phaser
 * index 14, which is that same cell: about 80% of the 17-frame strip.
 * The 8-frame attack sheets stay on Phaser index 7. This file does not
 * move them.
 */

/** Catalog strip. Feel booth key 3 and the live stage cast both play this. */
export const BRUTE_SKILL_ANIM = 'zombie-brute-skill_ground_smash';

/** Foot shock. Anchor on the brute's feet, not the chest. */
export const BRUTE_SKILL_FX = 'fx-brute-skill-shock';

/**
 * 0-based texture cell that starts the shock. Phaser index is 9.
 * Manifest `timing.impactFrame`.
 */
export const BRUTE_SKILL_FX_CELL = 8;

/**
 * 0-based texture cell that applies the smash. Phaser index is 14.
 * Manifest `timing.gameplayHitFrame` (~80% of 17 frames).
 */
export const BRUTE_SKILL_HIT_CELL = 13;

/**
 * Canvas px from the feet. A melee touch is the scaled 96px frame's
 * half-width: at the near lane that is `96 * SCALE_NEAR * LAYOUT_SCALE / 2`
 * ≈ 88px. 320 is more than three times that touch.
 *
 * The feel-booth hold places the body `layoutPx(72)` west of the halt
 * (`contactX − displayHalf`). The hero stands `layoutPx(32)` east of
 * `barricadeXAtY`, and the post contact face is one post-width west of
 * that anchor. Near-lane that distance is about 302px, so 320 still
 * reaches the hero on the booth hold.
 */
export const BRUTE_GROUND_SMASH_RADIUS = 320;

/**
 * Barricade HP removed once, on the hit frame, when the post face on
 * this lane is inside the radius. Wave contact DPS keeps ticking on its
 * own. WAVE_DEFS is not edited.
 */
export const BRUTE_GROUND_SMASH_DAMAGE = 36;

/** Seconds from one live cast to the next. The booth key ignores this. */
export const BRUTE_GROUND_SMASH_COOLDOWN = 5;

/**
 * Phaser `AnimationFrame.index` for a 0-based catalog cell.
 * Cell 0 is index 1. Cell 13 is index 14.
 * @param {number} cell
 */
export function bruteSkillPhaserIndex(cell) {
  const n = Number(cell);
  if (!Number.isInteger(n) || n < 0) return 1;
  return n + 1;
}

/**
 * @param {number} ax
 * @param {number} ay
 * @param {number} bx
 * @param {number} by
 * @param {number} [radius]
 */
export function pointInBruteSmash(ax, ay, bx, by, radius = BRUTE_GROUND_SMASH_RADIUS) {
  if (!Number.isFinite(ax) || !Number.isFinite(ay)) return false;
  if (!Number.isFinite(bx) || !Number.isFinite(by)) return false;
  const r = Number(radius);
  if (!(r > 0)) return false;
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy <= r * r;
}
