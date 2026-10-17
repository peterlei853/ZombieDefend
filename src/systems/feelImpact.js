import { playLibraryFx } from '../assets/libraryAssets.js';
import { skipsHurtKnockback } from '../assets/zombieSprites.js';

/**
 * Feel-booth bullet and melee impact.
 * Live combat knockback, gold, saves, barricade physics, and the camera
 * are not touched. The camera does not shake.
 *
 * Key 1 and key 4 share a 40ms monster hitstop, a 40ms white flash
 * (applied by the caller via flashMs), and a 2px X shove along the shot
 * (player → enemy, west by default). Brute (`noHurtKnockback`) skips that
 * shove and stays planted. Key 4 also sprays 8–12 sparks.
 * Key 1 does not plan or spawn a spark, cone, crescent, or hurt sheet.
 * The hurt sheet is melee-only (`hurtStrip: true` on takeDamage).
 * Key 4 plays `fx-slash-ninja` at the body center, rotation 0, and
 * `sfx-slash-ninja` through `SoundManager.playFeelMeleeSlash`.
 * `fx-slash-overhead` stays cancelled, and a rotated `fx-slash` is not
 * a stand-in.
 * Keys 5–9 preview catalog FX at the chest (`feelBodyY`). Ally-white and
 * the DoT use NORMAL blend so the thin white stroke stays readable.
 * Red, fire, and water stay ADD. Keys 5, 6, 8, and 9 also play booth
 * preview cues (`sfx-slash-enemy`, `sfx-slash-ally`, `sfx-hit-fire`,
 * `sfx-hit-water`). Key 7 still plays `sfx-slash-dot`. Combat stays quiet.
 */

export const FEEL_HIT_FLASH_MS = 40;
export const FEEL_HIT_SHAKE_MS = 40;
export const FEEL_HIT_KNOCK_PX = 2;
export const FEEL_HIT_PARTICLE_MIN = 8;
export const FEEL_HIT_PARTICLE_MAX = 12;

/**
 * Half-angle of the old bullet spark cone, radians.
 * Key 1 does not plan or spawn it. Kept so the cancelled fan has a name.
 */
export const FEEL_RANGED_SPREAD = 0.38;
/**
 * Body-centered fan. Wider than the bullet cone so sparks cover the
 * torso and travel downward across the target. Reserved for stage melee later.
 */
export const FEEL_MELEE_SPREAD = 1.05;
/** Melee spark sector. Body center, not an overhead chop. */
export const FEEL_MELEE_SECTOR = 'body';

/**
 * Feel-booth 4 primary melee slash. Fruit Ninja diagonal, already
 * drawn TL→BR, so the pose does not rotate it. `fx-slash-overhead`
 * stays cancelled. Do not assign that key, and do not rotate `fx-slash`
 * in its place.
 */
export const FEEL_MELEE_SLASH = 'fx-slash-ninja';

/**
 * Feel-booth melee slash cue. `SoundManager.playFeelMeleeSlash` plays
 * this key at the melee volume with the hit cooldown.
 */
export const FEEL_MELEE_SLASH_SFX = 'sfx-slash-ninja';

const SPARK_COLORS = [0xfff4d2, 0xffe08a, 0xffffff, 0xffc46b];

/**
 * Inclusive 8–12. `rand` is a 0–1 sample or a function that returns one.
 * @param {number|(() => number)} [rand]
 */
export function feelParticleCount(rand = Math.random) {
  const sample = typeof rand === 'function' ? rand() : rand;
  const u = Math.min(0.999999, Math.max(0, Number.isFinite(sample) ? sample : 0));
  const span = FEEL_HIT_PARTICLE_MAX - FEEL_HIT_PARTICLE_MIN + 1;
  return FEEL_HIT_PARTICLE_MIN + Math.floor(u * span);
}

/**
 * Bullet / shove sign. Player stands east of the march, so the default
 * shot travels west.
 * @param {number} playerX
 * @param {number} enemyX
 */
export function feelImpactDirX(playerX, enemyX) {
  if (Number.isFinite(playerX) && Number.isFinite(enemyX) && playerX !== enemyX) {
    return enemyX < playerX ? -1 : 1;
  }
  return -1;
}

/**
 * 2px along X for ranged and melee. Y is not shoved.
 * @param {number} dirX
 */
export function feelKnockOffset(dirX) {
  const sign = dirX >= 0 ? 1 : -1;
  return { x: sign * FEEL_HIT_KNOCK_PX, y: 0 };
}

/**
 * Pose for feel-booth 4. Straight diagonal, rotation 0.
 * `fx-slash-overhead` and a rotated `fx-slash` are not stand-ins.
 * @returns {{ key: string, rotation: number } | null}
 */
export function feelMeleeSlashPose() {
  if (FEEL_MELEE_SLASH !== 'fx-slash-ninja') return null;
  return { key: 'fx-slash-ninja', rotation: 0 };
}

/**
 * Melee body fan only. Key 1 (ranged) returns an empty list: the yellow
 * semicircle is cancelled. Hitstop, flash, and the 2px knock stay on the caller.
 * @param {{ melee?: boolean, dirX?: number, x: number, y: number, half?: number, rand?: () => number }} opts
 */
export function planFeelParticles(opts) {
  if (!opts?.melee) return [];
  const rand = typeof opts.rand === 'function' ? opts.rand : Math.random;
  const count = feelParticleCount(rand);
  const half = Number(opts.half) > 0 ? Number(opts.half) : 18;
  /** @type {{ x: number, y: number, dx: number, dy: number, size: number, color: number, life: number }[]} */
  const dots = [];
  for (let i = 0; i < count; i++) {
    const across = rand() - 0.5;
    const along = rand();
    const ang = Math.PI / 2 + across * 2 * FEEL_MELEE_SPREAD;
    const dist = 14 + along * 26;
    dots.push({
      x: opts.x + across * 2 * half,
      y: opts.y - 4,
      dx: Math.cos(ang) * dist,
      dy: Math.sin(ang) * dist,
      size: 2 + (i % 2),
      color: SPARK_COLORS[i % SPARK_COLORS.length],
      life: 260 + Math.floor(along * 140),
    });
  }
  return dots;
}

/**
 * @param {Phaser.Scene} scene
 * @param {import('../entities/Zombie.js').Zombie} zombie
 * @param {{ melee?: boolean, dirX?: number, playerX?: number }} [opts]
 */
export function playFeelImpact(scene, zombie, opts = {}) {
  const body = zombie?.body;
  if (!scene || !body?.active) return false;
  const melee = !!opts.melee;
  const shot = Number.isFinite(opts.dirX) ? (opts.dirX >= 0 ? 1 : -1) : feelImpactDirX(opts.playerX, body.x);
  const hitX = body.x;
  const hitY = feelBodyY(zombie, body);
  if (!skipsHurtKnockback(zombie)) {
    const knock = feelKnockOffset(shot);
    body.x += knock.x;
    body.y += knock.y;
  }
  zombie._lastX = body.x;
  zombie._lastY = body.y;
  zombie._syncBars?.();
  if (melee) {
    const half = Number(zombie.displayHalf) > 0 ? zombie.displayHalf : 18;
    spawnDots(scene, body, planFeelParticles({ melee: true, dirX: shot, x: hitX, y: hitY, half }));
    spawnFeelSlash(scene, zombie, body);
    if (FEEL_MELEE_SLASH_SFX) scene.audio?.playFeelMeleeSlash?.();
  }
  shakeMonster(scene, zombie, body);
  return true;
}

/**
 * @param {Phaser.Scene} scene
 * @param {import('../entities/Zombie.js').Zombie} zombie
 * @param {Phaser.GameObjects.Sprite} body
 */
function shakeMonster(scene, zombie, body) {
  if (!scene?.time?.delayedCall || !body.active) return;
  const token = (zombie._feelShakeToken || 0) + 1;
  zombie._feelShakeToken = token;
  const homeX = body.x;
  const homeY = body.y;
  const anims = body.anims;
  const prevScale = typeof anims?.timeScale === 'number' ? anims.timeScale : 1;
  if (anims) anims.timeScale = 0;
  const kick = (x, y, restore) => {
    if (zombie._feelShakeToken !== token || !body.active) return;
    body.x = homeX + x;
    body.y = homeY + y;
    zombie._lastX = body.x;
    zombie._lastY = body.y;
    if (restore && anims) anims.timeScale = prevScale || 1;
    zombie._syncBars?.();
  };
  kick(2, -1, false);
  scene.time.delayedCall(FEEL_HIT_SHAKE_MS / 2, () => kick(-2, 1, false));
  scene.time.delayedCall(FEEL_HIT_SHAKE_MS, () => kick(0, 0, true));
}

/**
 * @param {Phaser.Scene} scene
 * @param {Phaser.GameObjects.Sprite} body
 * @param {{ x: number, y: number, dx: number, dy: number, size: number, color: number, life: number }[]} dots
 */
function spawnDots(scene, body, dots) {
  if (!scene.add?.rectangle || !scene.tweens?.add) return;
  const depth = (body.depth || 0) + 8;
  for (const dot of dots) {
    const size = Math.max(2, dot.size);
    const rect = scene.add.rectangle(dot.x, dot.y, size, size, dot.color, 1);
    rect.setDepth(depth);
    scene.tweens.add({
      targets: rect,
      x: dot.x + dot.dx,
      y: dot.y + dot.dy,
      scaleX: 0.2,
      scaleY: 0.2,
      alpha: 0,
      duration: dot.life,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        if (rect.active) rect.destroy();
      },
    });
  }
}

/**
 * @param {Phaser.Scene} scene
 * @param {import('../entities/Zombie.js').Zombie} zombie
 * @param {Phaser.GameObjects.Sprite} body
 */
function spawnFeelSlash(scene, zombie, body) {
  const pose = feelMeleeSlashPose();
  if (!pose?.key) return null;
  const ready = !!(scene.textures?.exists?.(pose.key) || scene.anims?.exists?.(pose.key));
  if (!ready) return null;
  const scale = Math.abs(body.scaleX || zombie.scale || 1) || 1;
  const sprite = playLibraryFx(scene, body.x, feelBodyY(zombie, body), pose.key, {
    scale,
    depth: (body.depth || 0) + 6,
    rotation: pose.rotation,
  });
  applyFeelBlend(sprite, 'ADD');
  return sprite;
}

/**
 * Slash and spark anchor. Prefer the chest; fall back to the body sprite.
 * @param {import('../entities/Zombie.js').Zombie} zombie
 * @param {Phaser.GameObjects.Sprite} body
 */
function feelBodyY(zombie, body) {
  if (Number.isFinite(zombie?.bodyCenterY)) return zombie.bodyCenterY;
  return body?.y;
}

/**
 * Feel-booth preview of this wave's cataloged FX.
 * Keys 5–9 call `playFeelWaveFx`. Key 4 stays `fx-slash-ninja`.
 * No damage, gold, save, or barricade write. After the sprite spawns,
 * each preview plays its booth cue: key 5 `sfx-slash-enemy`, key 6
 * `sfx-slash-ally`, key 7 the cataloged `sfx-slash-dot` default, key 8
 * `sfx-hit-fire`, and key 9 `sfx-hit-water`. Combat does not call these.
 * Every preview, including the red slash, is anchored on `feelBodyY`
 * (the chest), the same point as fire and water.
 */
export const FEEL_WAVE_DEMOS = [
  { id: 'enemy-red', key: 'fx-slash-enemy-red', kind: 'slash' },
  { id: 'ally-white', key: 'fx-slash-ally-white', kind: 'slash' },
  { id: 'dot', key: 'fx-slash-dot', kind: 'dot' },
  { id: 'fire', key: 'fx-hit-fire', kind: 'bullet' },
  { id: 'water', key: 'fx-hit-water', kind: 'bullet' },
];

/**
 * On-screen height of the unit the slash should match.
 * Prefers the sprite's display height, then frame height × scale.
 * @param {{ body?: { displayHeight?: number, frame?: { height?: number }, scaleX?: number, scaleY?: number }, scale?: number }} zombie
 */
export function feelUnitDisplayHeight(zombie) {
  const body = zombie?.body;
  const shown = Math.abs(Number(body?.displayHeight) || 0);
  if (shown > 0) return shown;
  const frameH = Math.abs(Number(body?.frame?.height) || 0);
  const scale = Math.abs(Number(body?.scaleY) || Number(body?.scaleX) || Number(zombie?.scale) || 0);
  if (frameH > 0 && scale > 0) return frameH * scale;
  return 0;
}

/** Drawn above the body and the HP bar (depth bias 2). */
export const FEEL_WAVE_DEPTH_BIAS = 8;

/**
 * Ally-white and the DoT are thin white. ADD drops the near-black outline
 * and blows the stroke out on the bright lane, so those two use NORMAL.
 * The red slash, fire, and water stay ADD.
 * @param {string} id
 * @returns {'NORMAL'|'ADD'}
 */
export function feelWaveBlendName(id) {
  if (id === 'ally-white' || id === 'dot') return 'NORMAL';
  return 'ADD';
}

/**
 * @param {Phaser.GameObjects.Sprite|null|undefined} sprite
 * @param {'NORMAL'|'ADD'} name
 */
function applyFeelBlend(sprite, name) {
  const modes = globalThis.Phaser?.BlendModes;
  if (!sprite || !modes || typeof sprite.setBlendMode !== 'function') return;
  const mode = name === 'NORMAL' ? modes.NORMAL : modes.ADD;
  if (mode == null) return;
  sprite.setBlendMode(mode);
}

/**
 * Faction slashes: `unitDisplayHeight / 128`.
 * DoT tick: half of that. Bullet hits stay at 1 (the authored 24×24 sheet, already drawn left → right).
 * @param {'slash'|'dot'|'bullet'} kind
 * @param {number} unitDisplayHeight
 */
export function feelWaveScale(kind, unitDisplayHeight) {
  const height = Number(unitDisplayHeight);
  const slash = height > 0 ? height / 128 : 1;
  if (kind === 'dot') return slash * 0.5;
  if (kind === 'bullet') return 1;
  return slash;
}

/**
 * Spawn one cataloged wave FX at the body center. Does not move the body
 * or apply damage. After the sprite spawns, play the booth cue for that
 * id: `enemy-red` → `playFeelEnemySlash`, `ally-white` → `playFeelAllySlash`,
 * `dot` → `playFeelDotTick` (`sfx-slash-dot`), `fire` → `playFeelFireHit`,
 * `water` → `playFeelWaterHit`.
 * @param {Phaser.Scene} scene
 * @param {import('../entities/Zombie.js').Zombie} zombie
 * @param {string} id `enemy-red`, `ally-white`, `dot`, `fire`, or `water`
 * @returns {Phaser.GameObjects.Sprite|null}
 */
export function playFeelWaveFx(scene, zombie, id) {
  const spec = FEEL_WAVE_DEMOS.find((row) => row.id === id);
  const body = zombie?.body;
  if (!scene || !spec || !body?.active) return null;
  const ready = !!(scene.textures?.exists?.(spec.key) || scene.anims?.exists?.(spec.key));
  if (!ready) return null;
  const scale = feelWaveScale(spec.kind, feelUnitDisplayHeight(zombie));
  const sprite = playLibraryFx(scene, body.x, feelBodyY(zombie, body), spec.key, {
    scale,
    depth: (body.depth || 0) + FEEL_WAVE_DEPTH_BIAS,
  });
  applyFeelBlend(sprite, feelWaveBlendName(spec.id));
  if (sprite && typeof sprite.setAlpha === 'function') sprite.setAlpha(1);
  if (sprite && spec.id === 'enemy-red') scene.audio?.playFeelEnemySlash?.();
  if (sprite && spec.id === 'ally-white') scene.audio?.playFeelAllySlash?.();
  if (sprite && spec.kind === 'dot') scene.audio?.playFeelDotTick?.();
  if (sprite && spec.id === 'fire') scene.audio?.playFeelFireHit?.();
  if (sprite && spec.id === 'water') scene.audio?.playFeelWaterHit?.();
  return sprite;
}
