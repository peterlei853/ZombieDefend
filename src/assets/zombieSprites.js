/**
 * PixelLab zombie sheets — 64×64, west-facing, foot pivot (0.5, 1.0).
 * The nine strips live in assets/zombies/ (walker / runner / tank ×
 * walk 6×64, attack 4×64, stumble 4×64). Optional `{prefix}-death` is
 * not in that pack. If a death texture is already cached, it still registers.
 * A missing walk texture keeps the colored-square placeholder.
 */

/** Canvas size of every zombie sheet. */
export const ZOMBIE_FRAME_SIZE = 64;

/** Foot pivot. The lane Y is the sole, matching the asset manifest. */
export const ZOMBIE_ORIGIN_X = 0.5;
export const ZOMBIE_ORIGIN_Y = 1;

export const ZOMBIE_VARIANTS = ['walker', 'runner', 'tank'];

/**
 * Walk loops (6 frames). Attack is the barricade lunge (4 frames, once).
 * Stumble loops (4 frames) while HP is critical. Death is optional.
 * @type {{ action: string, frames: number, frameRate: number, repeat: number, required: boolean }[]}
 */
export const ZOMBIE_ACTIONS = [
  { action: 'walk', frames: 6, frameRate: 10, repeat: -1, required: true },
  { action: 'attack', frames: 4, frameRate: 12, repeat: 0, required: true },
  { action: 'stumble', frames: 4, frameRate: 8, repeat: -1, required: true },
  { action: 'death', frames: 0, frameRate: 8, repeat: 0, required: false },
];

/**
 * @param {string} variant
 * @param {string} action
 */
export function zombieSheetKey(variant, action) {
  return `zombie-${variant}-${action}`;
}

/**
 * @param {string} variant
 * @param {string} action
 */
export function zombieSheetUrl(variant, action) {
  return `assets/zombies/${zombieSheetKey(variant, action)}.png`;
}

/**
 * @param {Phaser.Scene} scene
 * @param {string} variant
 * @param {string} action
 */
export function hasZombieAnim(scene, variant, action) {
  const key = zombieSheetKey(variant, action);
  return !!scene?.anims?.exists?.(key);
}

/**
 * Queue the nine merged strips. Skips cached keys so StageScene can preload
 * after BootScene. Death is not fetched; a missing optional strip must
 * not 404 on boot.
 * @param {Phaser.Scene} scene
 */
export function preloadZombieAssets(scene) {
  if (!scene?.load?.spritesheet || !scene.textures) return;
  const size = { frameWidth: ZOMBIE_FRAME_SIZE, frameHeight: ZOMBIE_FRAME_SIZE };
  for (const variant of ZOMBIE_VARIANTS) {
    for (const action of ZOMBIE_ACTIONS) {
      const key = zombieSheetKey(variant, action.action);
      if (scene.textures.exists(key)) continue;
      if (!action.required) continue;
      const url = zombieSheetUrl(variant, action.action);
      if (action.action === 'attack') {
        // PIXELLAB_HOOK: attack sheet — assets/zombies/{prefix}-attack.png, 4×64 west, barricade lunge
      }
      scene.load.spritesheet(key, url, size);
    }
  }
}

/**
 * Idempotent anim registry. Walk uses 6 frames, attack and stumble 4,
 * capped by however many frames the texture actually contains.
 * @param {Phaser.Scene} scene
 */
export function registerZombieAnims(scene) {
  if (!scene?.anims || !scene.textures) return;
  const filter = globalThis.Phaser?.Textures?.FilterMode?.NEAREST;
  for (const variant of ZOMBIE_VARIANTS) {
    for (const action of ZOMBIE_ACTIONS) {
      const key = zombieSheetKey(variant, action.action);
      if (!scene.textures.exists(key) || scene.anims.exists(key)) continue;
      const tex = scene.textures.get(key);
      if (filter !== undefined && typeof tex.setFilter === 'function') {
        tex.setFilter(filter);
      }
      const available = textureFrameCount(tex);
      const count = action.frames > 0 ? Math.min(action.frames, available) : available;
      if (count <= 0) continue;
      scene.anims.create({
        key,
        frames: scene.anims.generateFrameNumbers(key, { start: 0, end: count - 1 }),
        frameRate: action.frameRate,
        repeat: action.repeat,
      });
    }
  }
}

/** @param {Phaser.Textures.Texture} tex */
function textureFrameCount(tex) {
  const names = typeof tex?.getFrameNames === 'function' ? tex.getFrameNames() : [];
  return names.filter((name) => name !== '__BASE').length;
}
