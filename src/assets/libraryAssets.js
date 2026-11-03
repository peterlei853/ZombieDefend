/**
 * Data-driven loader for assets/library/asset-index.json.
 * Keys, origins, and sustained ranges come from the catalog — do not hard-code
 * frame sizes here. `concepts` stays out of the game load.
 */

import { stageLibraryFilter } from './petLineup.js';
import { installUiKit } from '../ui/uiKit.js';
import { demoEnemyId } from '../data/GameConfig.js';

export const LIBRARY_INDEX_KEY = 'asset-library-index';
const INDEX_URL = 'assets/library/asset-index.json';

/**
 * Categories the stage actually draws. Concepts are reference art only.
 * `pets` is narrowed by stageLibraryFilter to the baby bodies, HUD icons,
 * and the twelve cast strips plus their skill FX.
 * `environment` is the barricade fence posts.
 * `zombies` includes s4-construction and s4-schoolgirl. Those index rows
 * are already 88×88; this loader does not resize them.
 */
export const STAGE_LIBRARY_CATEGORIES = [
  'hero',
  'zombies',
  'fx',
  'backgrounds',
  'pets',
  'environment',
  'ui',
];

/**
 * Boss sheets, pickups, and concepts stay on disk until something spawns them.
 * Young / ancient idle strips stay unloaded. Their cast strips and skill FX load.
 * @type {string[]}
 */
export const UNWIRED_LIBRARY_CATEGORIES = ['bosses', 'pickups', 'concepts'];

/** Boss sheets stay unloaded until `?enemy=` names one of these. */
const BOSS_DEMO_IDS = new Set(['lava-balon', 'steel-balam']);

/**
 * Stage categories for this page load. Boss sheets join only when the
 * solo-enemy query names a boss. A normal stage does not load them.
 * @param {string} [search]
 * @returns {string[]}
 */
export function stageLibraryCategories(search) {
  const categories = STAGE_LIBRARY_CATEGORIES.slice();
  const id = demoEnemyId(search);
  if (id && BOSS_DEMO_IDS.has(id)) categories.push('bosses');
  return categories;
}

/**
 * Call in preload(). Queues textures from the index.
 * Uses a same-origin read so every sheet is in the queue before preload ends.
 * @param {Phaser.Scene} scene
 * @param {{ categories?: string[], filter?: ((asset: object) => boolean)|null }} [opts]
 */
export function preloadLibrary(scene, { categories = stageLibraryCategories(), filter = stageLibraryFilter } = {}) {
  if (!scene?.load || !scene.textures) return;
  const cached = readCachedIndex(scene);
  if (cached) {
    queueLibraryAssets(scene, cached, categories, filter);
    return;
  }
  const index = readLibraryIndexSync();
  if (index) {
    rememberIndex(scene, index);
    queueLibraryAssets(scene, index, categories, filter);
    return;
  }
  scene.load.json(LIBRARY_INDEX_KEY, INDEX_URL);
  scene.load.once(`filecomplete-json-${LIBRARY_INDEX_KEY}`, (_key, _type, data) => {
    if (!data?.assets) return;
    queueLibraryAssets(scene, data, categories, filter);
  });
}

/**
 * Call in create(). Creates `<key>` plus `<key>:start|:loop|:end` for sustained strips.
 * Idempotent. Returns the index, or null if preload did not cache it.
 * Anims with no real texture frames are removed so `play()` cannot throw on
 * `currentFrame.duration`.
 * @param {Phaser.Scene} scene
 */
export function createLibraryAnims(scene) {
  const index = readCachedIndex(scene);
  installUiKit(scene, index?.aliases);
  if (!index?.assets || !scene?.anims) return null;
  const filter = globalThis.Phaser?.Textures?.FilterMode?.NEAREST;
  for (const asset of index.assets) {
    if (!scene.textures.exists(asset.key)) continue;
    const tex = scene.textures.get(asset.key);
    if (filter !== undefined && typeof tex.setFilter === 'function') {
      tex.setFilter(filter);
    }
    if (!(asset.frames > 1)) continue;
    const make = (key, start, end, repeat) => {
      registerLibraryAnim(scene, asset.key, key, start, end, repeat, asset.frameRate);
    };
    make(asset.key, 0, asset.frames - 1, asset.loop ? -1 : 0);
    if (asset.loopFrom != null) {
      make(`${asset.key}:start`, 0, asset.loopFrom - 1, 0);
      make(`${asset.key}:loop`, asset.loopFrom, asset.loopTo, -1);
      make(`${asset.key}:end`, asset.loopTo + 1, asset.frames - 1, 0);
    }
  }
  return index;
}

/** One-shot length when a strip has no playable duration. */
export const LIBRARY_FX_FALLBACK_MS = 400;

/**
 * True when Phaser can start this anim. `anims.exists` is not enough:
 * an empty frame list still registers, and `getFirstTick` then reads
 * `currentFrame.duration` on undefined.
 * @param {{ frames?: { duration?: number }[] }|null|undefined} anim
 */
export function libraryAnimReady(anim) {
  const frames = anim?.frames;
  if (!Array.isArray(frames) || frames.length === 0) return false;
  const first = frames[0];
  if (!first) return false;
  if (first.duration != null && !Number.isFinite(first.duration)) return false;
  return true;
}

/**
 * Milliseconds to hold a still when playback cannot start.
 * Prefers a finite positive anim duration, then frame count / frame rate.
 * @param {{ duration?: number, frameRate?: number, frames?: unknown[] }|null|undefined} anim
 * @param {{ frameRate?: number, frames?: number }|null|undefined} [asset]
 */
export function libraryFxDuration(anim, asset) {
  const fromAnim = anim?.duration;
  if (Number.isFinite(fromAnim) && fromAnim > 0) return fromAnim;
  const frameCount = Array.isArray(anim?.frames) && anim.frames.length
    ? anim.frames.length
    : (Number.isFinite(asset?.frames) && asset.frames > 0 ? asset.frames : 4);
  const rate = Number.isFinite(anim?.frameRate) && anim.frameRate > 0
    ? anim.frameRate
    : (Number.isFinite(asset?.frameRate) && asset.frameRate > 0 ? asset.frameRate : 10);
  const ms = (frameCount / rate) * 1000;
  return Number.isFinite(ms) && ms > 0 ? ms : LIBRARY_FX_FALLBACK_MS;
}

/**
 * Play a library strip. Missing, empty, or throwing anims hold frame 0.
 * Never throws.
 * @param {Phaser.GameObjects.Sprite} sprite
 * @param {string} key
 * @param {Phaser.Scene} scene
 * @returns {boolean} true when `sprite.play` started
 */
export function playLibraryAnim(sprite, key, scene) {
  if (!sprite || typeof sprite.play !== 'function' || !key) return false;
  const anims = scene?.anims;
  const known = typeof anims?.exists === 'function' && anims.exists(key);
  if (!known) {
    holdLibraryFrame(sprite);
    return false;
  }
  // Managers without `get` (older tests) cannot be inspected. Play inside
  // try/catch. A real empty Phaser anim has `get` and is refused first.
  if (typeof anims.get === 'function' && !libraryAnimReady(lookupLibraryAnim(scene, key))) {
    holdLibraryFrame(sprite);
    return false;
  }
  try {
    sprite.play(key);
    return true;
  } catch (_) {
    try {
      sprite.anims?.stop?.();
    } catch (_) {
      /* already stopped */
    }
    holdLibraryFrame(sprite);
    return false;
  }
}

/** @param {Phaser.Scene} scene @param {string} key */
export function libraryAsset(scene, key) {
  const index = readCachedIndex(scene);
  return index?.assets?.find((asset) => asset.key === key) ?? null;
}

/**
 * One-shot (or looping) library FX at a world point.
 * Origin comes from the index. West-facing muzzle art uses origin x = 1
 * (the nozzle); pass flipX only when the owner is mirrored, and mirror ox.
 * Looping strips are left playing — the caller destroys them.
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 * @param {string} key
 * @param {{ scale?: number, depth?: number, rotation?: number, flipX?: boolean, origin?: [number, number] }} [opts]
 * @returns {Phaser.GameObjects.Sprite|null}
 */
export function playLibraryFx(scene, x, y, key, opts = {}) {
  if (!scene?.add?.sprite || !key || !scene.textures?.exists?.(key)) return null;
  let sprite = null;
  try {
    const asset = libraryAsset(scene, key);
    sprite = scene.add.sprite(x, y, key);
    const catalogOrigin = asset?.origin ?? [0.5, 0.5];
    const override = opts.origin;
    const origin = Array.isArray(override) && override.length >= 2 ? override : catalogOrigin;
    const originX = Number.isFinite(Number(origin[0])) ? Number(origin[0]) : 0.5;
    const originY = Number.isFinite(Number(origin[1])) ? Number(origin[1]) : 0.5;
    const ox = opts.flipX ? 1 - originX : originX;
    sprite.setOrigin(ox, originY);
    if (opts.flipX) sprite.setFlipX(true);
    if (opts.scale) sprite.setScale(opts.scale);
    if (opts.rotation) sprite.setRotation(opts.rotation);
    if (opts.depth != null) sprite.setDepth(opts.depth);
    const played = playLibraryAnim(sprite, key, scene);
    const looping = !!(asset?.loop && asset.loopFrom == null);
    if (played && !looping) {
      sprite.once(`animationcomplete-${key}`, () => {
        if (sprite.active) sprite.destroy();
      });
    } else if (!played && !looping) {
      const ms = libraryFxDuration(lookupLibraryAnim(scene, key), asset);
      scene.time?.delayedCall?.(ms, () => {
        if (sprite?.active) sprite.destroy();
      });
    }
    return sprite;
  } catch (_) {
    try {
      sprite?.destroy?.();
    } catch (_) {
      /* sprite never attached */
    }
    return null;
  }
}

/**
 * Rotation so a strip whose rest pose faces `facing` points along (vx, vy).
 * West art points along -X at rotation 0.
 * @param {number} vx
 * @param {number} vy
 * @param {string|null|undefined} facing
 */
export function aimRotation(vx, vy, facing) {
  const aim = Math.atan2(vy, vx);
  if (facing === 'west') return aim - Math.PI;
  return aim;
}

/**
 * @param {Phaser.Scene} scene
 * @param {object} index
 * @param {string[]} categories
 * @param {((asset: object) => boolean)|null} filter
 */
function queueLibraryAssets(scene, index, categories, filter) {
  for (const asset of index.assets || []) {
    if (!categories.includes(asset.category)) continue;
    if (filter && !filter(asset)) continue;
    if (!asset?.key || !asset.path) continue;
    if (scene.textures.exists(asset.key)) continue;
    const sheet = asset.frames > 1 || asset.type === 'spritesheet' || asset.type === 'fx';
    if (sheet) {
      scene.load.spritesheet(asset.key, asset.path, {
        frameWidth: asset.frameWidth,
        frameHeight: asset.frameHeight,
      });
    } else {
      scene.load.image(asset.key, asset.path);
    }
  }
}

/** @param {Phaser.Scene} scene */
function readCachedIndex(scene) {
  const cache = scene?.cache?.json;
  if (!cache?.exists?.(LIBRARY_INDEX_KEY)) return null;
  return cache.get(LIBRARY_INDEX_KEY);
}

/** @param {Phaser.Scene} scene @param {object} index */
function rememberIndex(scene, index) {
  const cache = scene?.cache?.json;
  if (!cache || cache.exists?.(LIBRARY_INDEX_KEY)) return;
  cache.add(LIBRARY_INDEX_KEY, index);
}

/**
 * Register only frames the texture actually has. Drops an existing empty anim
 * so a later ready sheet can recreate it.
 * @param {Phaser.Scene} scene
 * @param {string} textureKey
 * @param {string} key
 * @param {number} start
 * @param {number} end
 * @param {number} repeat
 * @param {number|null|undefined} frameRate
 */
function registerLibraryAnim(scene, textureKey, key, start, end, repeat, frameRate) {
  if (!scene?.anims || end < start) return;
  const frames = libraryFrameList(scene, textureKey, start, end);
  const existing = lookupLibraryAnim(scene, key);
  if (frames.length === 0) {
    removeLibraryAnim(scene, key);
    return;
  }
  if (libraryAnimReady(existing) && existing.frames.length === frames.length) return;
  removeLibraryAnim(scene, key);
  if (scene.anims.exists?.(key)) return;
  const rate = Number.isFinite(frameRate) && frameRate > 0 ? frameRate : 10;
  try {
    scene.anims.create({ key, repeat, frameRate: rate, frames });
  } catch (_) {
    removeLibraryAnim(scene, key);
  }
}

/**
 * @param {Phaser.Scene} scene
 * @param {string} textureKey
 * @param {number} start
 * @param {number} end
 */
function libraryFrameList(scene, textureKey, start, end) {
  const tex = scene.textures?.exists?.(textureKey) ? scene.textures.get(textureKey) : null;
  const frames = [];
  for (let i = start; i <= end; i++) {
    if (textureHasFrame(tex, i)) frames.push({ key: textureKey, frame: i });
  }
  return frames;
}

/** @param {Phaser.Textures.Texture|null|undefined} tex @param {number} frame */
function textureHasFrame(tex, frame) {
  if (!tex) return false;
  if (typeof tex.has === 'function' && (tex.has(frame) || tex.has(String(frame)))) return true;
  const names = typeof tex.getFrameNames === 'function' ? tex.getFrameNames() : [];
  return names.includes(frame) || names.includes(String(frame));
}

/** @param {Phaser.Scene} scene @param {string} key */
function lookupLibraryAnim(scene, key) {
  const anims = scene?.anims;
  if (!anims || typeof anims.exists !== 'function' || !anims.exists(key)) return null;
  try {
    return typeof anims.get === 'function' ? anims.get(key) : null;
  } catch (_) {
    return null;
  }
}

/** @param {Phaser.Scene} scene @param {string} key */
function removeLibraryAnim(scene, key) {
  const anims = scene?.anims;
  if (!anims || typeof anims.exists !== 'function' || !anims.exists(key)) return;
  if (typeof anims.remove !== 'function') return;
  try {
    anims.remove(key);
  } catch (_) {
    /* leave the key; play paths still refuse it */
  }
}

/** @param {Phaser.GameObjects.Sprite} sprite */
function holdLibraryFrame(sprite) {
  if (typeof sprite.setFrame !== 'function') return;
  try {
    sprite.setFrame(0);
  } catch (_) {
    try {
      sprite.setFrame('__BASE');
    } catch (_) {
      /* texture has no still; the sprite stays as created */
    }
  }
}

function readLibraryIndexSync() {
  if (typeof XMLHttpRequest === 'undefined') return null;
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', INDEX_URL, false);
    xhr.send(null);
    if (xhr.status && (xhr.status < 200 || xhr.status >= 300)) return null;
    if (!xhr.responseText) return null;
    return JSON.parse(xhr.responseText);
  } catch (_) {
    return null;
  }
}
