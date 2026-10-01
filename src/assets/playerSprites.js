/**
 * PixelLab player sheets (see assets/player/manifest.json and README.md).
 * Frames are square and pivot-centred. Do not assume a 64px body.
 */

/** Canvas size of every character sheet. */
export const PLAYER_FRAME_SIZE = 92;

/**
 * Empty pixels under the boots. Origin Y is the sole, which sits just above
 * the canvas bottom — near (0.5, 1). (0.5, 1) itself plants the transparent
 * pad on the lane and the character floats.
 */
export const PLAYER_SOLE_PAD_PX = 16;

/** Sole at (0.5, 76/92) — bottom-center of the character, not the 92px canvas center. */
export const PLAYER_ORIGIN_X = 0.5;
export const PLAYER_ORIGIN_Y =
  (PLAYER_FRAME_SIZE - PLAYER_SOLE_PAD_PX) / PLAYER_FRAME_SIZE;

/** @type {{ key: string, frames: number, frameRate: number, repeat: number }[]} */
export const PLAYER_SHEETS = [
  { key: 'player-idle', frames: 4, frameRate: 8, repeat: -1 },
  { key: 'player-walk-west', frames: 6, frameRate: 10, repeat: -1 },
  { key: 'player-walk-east', frames: 6, frameRate: 10, repeat: -1 },
  { key: 'player-walk-north', frames: 6, frameRate: 10, repeat: -1 },
  { key: 'player-walk-south', frames: 6, frameRate: 10, repeat: -1 },
  { key: 'player-handgun-shoot', frames: 4, frameRate: 14, repeat: 0 },
  { key: 'player-shotgun-recoil', frames: 6, frameRate: 12, repeat: 0 },
];

export const PLAYER_WEAPON_IMAGES = [
  { key: 'handgun', file: 'handgun.png' },
  { key: 'shotgun', file: 'shotgun.png' },
];

const ACTION_ANIMS = new Set(['player-handgun-shoot', 'player-shotgun-recoil']);

/**
 * Idle, or a cardinal walk. Depth + lateral at once keeps the west sheet
 * (the defender faces left to shoot).
 * @param {number} dy -1 north / +1 south / 0
 * @param {number} dx -1 west / +1 east / 0
 * @returns {string}
 */
export function locomotionAnimKey(dy, dx) {
  const depth = dy !== 0;
  const lateral = dx !== 0;
  if (depth && lateral) return 'player-walk-west';
  if (dx < 0) return 'player-walk-west';
  if (dx > 0) return 'player-walk-east';
  if (dy < 0) return 'player-walk-north';
  if (dy > 0) return 'player-walk-south';
  return 'player-idle';
}

/** @param {string} key */
export function isPlayerActionAnim(key) {
  return ACTION_ANIMS.has(key);
}

/**
 * Queue sheets + weapon icons. Skips keys already in the texture cache so
 * StageScene can preload safely after BootScene.
 * @param {Phaser.Scene} scene
 */
export function preloadPlayerAssets(scene) {
  const size = { frameWidth: PLAYER_FRAME_SIZE, frameHeight: PLAYER_FRAME_SIZE };
  for (const sheet of PLAYER_SHEETS) {
    if (scene.textures.exists(sheet.key)) continue;
    scene.load.spritesheet(sheet.key, `assets/player/${sheet.key}.png`, size);
  }
  for (const img of PLAYER_WEAPON_IMAGES) {
    if (scene.textures.exists(img.key)) continue;
    scene.load.image(img.key, `assets/player/${img.file}`);
  }
}

/**
 * Global anims (idempotent) and nearest-neighbor filtering for the pixel sheets.
 * @param {Phaser.Scene} scene
 */
export function registerPlayerAnims(scene) {
  const filter = globalThis.Phaser?.Textures?.FilterMode?.NEAREST;
  for (const sheet of PLAYER_SHEETS) {
    if (!scene.textures.exists(sheet.key)) continue;
    const tex = scene.textures.get(sheet.key);
    if (filter !== undefined && typeof tex.setFilter === 'function') {
      tex.setFilter(filter);
    }
    if (scene.anims.exists(sheet.key)) continue;
    scene.anims.create({
      key: sheet.key,
      frames: scene.anims.generateFrameNumbers(sheet.key, {
        start: 0,
        end: sheet.frames - 1,
      }),
      frameRate: sheet.frameRate,
      repeat: sheet.repeat,
    });
  }
  for (const img of PLAYER_WEAPON_IMAGES) {
    if (!scene.textures.exists(img.key) || filter === undefined) continue;
    const tex = scene.textures.get(img.key);
    if (typeof tex.setFilter === 'function') tex.setFilter(filter);
  }
}
