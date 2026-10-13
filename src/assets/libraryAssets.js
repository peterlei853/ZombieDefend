/**
 * Data-driven loader for assets/library/asset-index.json.
 * Keys, origins, and sustained ranges come from the catalog — do not hard-code
 * frame sizes here. `concepts` stays out of the game load.
 */

import { stageLibraryFilter } from './petLineup.js';

export const LIBRARY_INDEX_KEY = 'asset-library-index';
const INDEX_URL = 'assets/library/asset-index.json';

/**
 * Categories the stage actually draws. Concepts are reference art only.
 * `pets` is narrowed by stageLibraryFilter to the four baby summon strips
 * and the four `ui-pet-*-head` icons. Icons (frames === 1) load with
 * `load.image`, the same path as hero weapon icons.
 * `environment` is the barricade fence posts.
 */
export const STAGE_LIBRARY_CATEGORIES = [
  'hero',
  'zombies',
  'fx',
  'backgrounds',
  'pets',
  'environment',
];

/**
 * Boss sheets, pickups, and concepts stay on disk until something spawns them.
 * Other pet forms (young / ancient, and FX this phase does not cast) stay unloaded.
 * @type {string[]}
 */
export const UNWIRED_LIBRARY_CATEGORIES = ['bosses', 'pickups', 'concepts'];

/**
 * Call in preload(). Queues textures from the index.
 * Uses a same-origin read so every sheet is in the queue before preload ends.
 * @param {Phaser.Scene} scene
 * @param {{ categories?: string[], filter?: ((asset: object) => boolean)|null }} [opts]
 */
export function preloadLibrary(scene, { categories = STAGE_LIBRARY_CATEGORIES, filter = stageLibraryFilter } = {}) {
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
 * @param {Phaser.Scene} scene
 */
export function createLibraryAnims(scene) {
  const index = readCachedIndex(scene);
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
      if (end < start || scene.anims.exists(key)) return;
      scene.anims.create({
        key,
        repeat,
        frameRate: asset.frameRate || 10,
        frames: scene.anims.generateFrameNumbers(asset.key, { start, end }),
      });
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
 * @param {{ scale?: number, depth?: number, rotation?: number, flipX?: boolean }} [opts]
 * @returns {Phaser.GameObjects.Sprite|null}
 */
export function playLibraryFx(scene, x, y, key, opts = {}) {
  if (!scene?.add?.sprite || !key || !scene.textures?.exists?.(key)) return null;
  const asset = libraryAsset(scene, key);
  const sprite = scene.add.sprite(x, y, key);
  const origin = asset?.origin ?? [0.5, 0.5];
  const ox = opts.flipX ? 1 - origin[0] : origin[0];
  sprite.setOrigin(ox, origin[1]);
  if (opts.flipX) sprite.setFlipX(true);
  if (opts.scale) sprite.setScale(opts.scale);
  if (opts.rotation) sprite.setRotation(opts.rotation);
  if (opts.depth != null) sprite.setDepth(opts.depth);
  if (scene.anims?.exists?.(key)) {
    sprite.play(key);
    const looping = asset?.loop && asset.loopFrom == null;
    if (!looping) {
      sprite.once(`animationcomplete-${key}`, () => {
        if (sprite.active) sprite.destroy();
      });
    }
  }
  return sprite;
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
