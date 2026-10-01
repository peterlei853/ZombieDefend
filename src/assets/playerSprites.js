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
 * West-facing PixelLab stance sheets. Used when `assets/player/<key>.png`
 * is present. Until then, a single frame of the shoot / recoil sheet holds
 * the same pose.
 */
export const HANDGUN_AIM_KEY = 'player-handgun-aim';
export const HANDGUN_AIM_TEXTURE = 'player-handgun-shoot';
export const HANDGUN_AIM_FRAME = 2;

export const SHOTGUN_HOLD_KEY = 'player-shotgun-hold';
export const SHOTGUN_HOLD_TEXTURE = 'player-shotgun-recoil';
export const SHOTGUN_HOLD_FRAME = 0;
export const SHOTGUN_RECOIL_KEY = 'player-shotgun-recoil';

/**
 * Optional stance strips. `frameRate` applies when the sheet has more than
 * one frame; a single frame just holds.
 * @type {{ key: string, fallbackTexture: string, fallbackFrame: number, frameRate: number }[]}
 */
const STANCE_SHEETS = [
  {
    key: HANDGUN_AIM_KEY,
    fallbackTexture: HANDGUN_AIM_TEXTURE,
    fallbackFrame: HANDGUN_AIM_FRAME,
    frameRate: 8,
  },
  {
    key: SHOTGUN_HOLD_KEY,
    fallbackTexture: SHOTGUN_HOLD_TEXTURE,
    fallbackFrame: SHOTGUN_HOLD_FRAME,
    frameRate: 8,
  },
];

/** Sheets that already draw the gun, so the weapon prop must hide. */
const WEAPON_DRAWN_ANIMS = new Set([
  'player-handgun-shoot',
  HANDGUN_AIM_KEY,
  SHOTGUN_RECOIL_KEY,
  SHOTGUN_HOLD_KEY,
]);

/**
 * Lane keys alias the north/south sheets. A real `player-walk-up` texture
 * would register first and this list would not replace it.
 */
const WALK_ALIASES = [
  { key: 'player-walk-up', source: 'player-walk-north' },
  { key: 'player-walk-down', source: 'player-walk-south' },
];

/**
 * Idle, or a cardinal walk. Depth + lateral at once keeps the west sheet
 * (the defender faces left to shoot). W/S prefer up/down, then north/south.
 * @param {number} dy -1 up / +1 down / 0
 * @param {number} dx -1 west / +1 east / 0
 * @returns {string[]}
 */
export function locomotionAnimCandidates(dy, dx) {
  const depth = dy !== 0;
  const lateral = dx !== 0;
  if (depth && lateral) return ['player-walk-west'];
  if (dx < 0) return ['player-walk-west'];
  if (dx > 0) return ['player-walk-east'];
  if (dy < 0) return ['player-walk-up', 'player-walk-north'];
  if (dy > 0) return ['player-walk-down', 'player-walk-south'];
  return ['player-idle'];
}

/**
 * First locomotion key. Callers should still fall through the candidate list
 * when that key was not registered.
 * @param {number} dy
 * @param {number} dx
 * @returns {string}
 */
export function locomotionAnimKey(dy, dx) {
  return locomotionAnimCandidates(dy, dx)[0];
}

/** @param {string|null|undefined} key */
export function animDrawsWeapon(key) {
  return WEAPON_DRAWN_ANIMS.has(key);
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
  for (const stance of STANCE_SHEETS) {
    if (scene.textures.exists(stance.key)) continue;
    const url = `assets/player/${stance.key}.png`;
    if (!probeAsset(url)) continue;
    scene.load.spritesheet(stance.key, url, size);
  }
}

/**
 * True when the stance png is already on the server. A missing sheet is a
 * miss, not a loader error, so BootScene still reaches the stage.
 * @param {string} url
 */
function probeAsset(url) {
  if (typeof XMLHttpRequest === 'undefined') return false;
  try {
    const xhr = new XMLHttpRequest();
    const probeUrl = `${url}${url.includes('?') ? '&' : '?'}probe=${Date.now()}`;
    xhr.open('HEAD', probeUrl, false);
    xhr.send(null);
    return xhr.status >= 200 && xhr.status < 300;
  } catch (_) {
    return false;
  }
}

/**
 * Global anims (idempotent) and nearest-neighbor filtering for the pixel sheets.
 * This is the animation registry — there is no AnimationManager module.
 * Also registers walk-up/down aliases. Stance keys prefer a real
 * `player-handgun-aim` / `player-shotgun-hold` sheet and otherwise hold one
 * frame of the shoot / recoil sheet.
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
  for (const alias of WALK_ALIASES) {
    registerAnimAlias(scene, alias.key, alias.source);
  }
  for (const stance of STANCE_SHEETS) {
    registerStanceAnim(scene, stance, filter);
  }
  for (const img of PLAYER_WEAPON_IMAGES) {
    if (!scene.textures.exists(img.key) || filter === undefined) continue;
    const tex = scene.textures.get(img.key);
    if (typeof tex.setFilter === 'function') tex.setFilter(filter);
  }
}

/**
 * `player-walk-up` / `player-walk-down` play the north / south frames when
 * those are the only sheets. Skips a key that was already created (a real
 * up/down sheet, or a previous call).
 * @param {Phaser.Scene} scene
 * @param {string} key
 * @param {string} sourceKey
 */
function registerAnimAlias(scene, key, sourceKey) {
  if (!scene?.anims || scene.anims.exists(key)) return;
  if (!scene.anims.exists(sourceKey)) return;
  const meta = PLAYER_SHEETS.find((sheet) => sheet.key === sourceKey);
  if (!meta || !scene.textures.exists(sourceKey)) return;
  scene.anims.create({
    key,
    frames: scene.anims.generateFrameNumbers(sourceKey, {
      start: 0,
      end: meta.frames - 1,
    }),
    frameRate: meta.frameRate,
    repeat: meta.repeat,
  });
}

function textureHasFrame(tex, frame) {
  if (!tex) return false;
  if (typeof tex.has === 'function' && (tex.has(frame) || tex.has(String(frame)))) return true;
  const names = typeof tex.getFrameNames === 'function' ? tex.getFrameNames() : [];
  return names.includes(frame) || names.includes(String(frame));
}

/**
 * Prefer the PixelLab stance strip when that texture loaded. Otherwise hold
 * one frame of the fallback sheet. A previously registered fallback is
 * replaced once the real texture exists.
 * @param {Phaser.Scene} scene
 * @param {{ key: string, fallbackTexture: string, fallbackFrame: number, frameRate: number }} stance
 * @param {number|undefined} filter
 */
function registerStanceAnim(scene, stance, filter) {
  const { key, fallbackTexture, fallbackFrame, frameRate } = stance;
  if (!scene?.anims) return;
  if (scene.textures?.exists?.(key)) {
    const tex = scene.textures.get(key);
    if (filter !== undefined && typeof tex.setFilter === 'function') {
      tex.setFilter(filter);
    }
    const count = textureFrameCount(tex);
    if (count > 0) {
      const existing = scene.anims.exists(key) ? scene.anims.get(key) : null;
      const textureKey = existing?.frames?.[0]?.textureKey;
      if (textureKey === key && existing.frames.length === count) return;
      if (existing && typeof scene.anims.remove === 'function') {
        scene.anims.remove(key);
      }
      if (!scene.anims.exists(key)) {
        scene.anims.create({
          key,
          frames: scene.anims.generateFrameNumbers(key, { start: 0, end: count - 1 }),
          frameRate: count > 1 ? frameRate : 1,
          repeat: -1,
        });
      }
      return;
    }
  }
  registerStillAnim(scene, key, fallbackTexture, fallbackFrame);
}

function textureFrameCount(tex) {
  const names = typeof tex?.getFrameNames === 'function' ? tex.getFrameNames() : [];
  return names.filter((name) => name !== '__BASE').length;
}

/**
 * Loop a single existing frame. Missing texture or frame is a no-op.
 * @param {Phaser.Scene} scene
 * @param {string} key
 * @param {string} textureKey
 * @param {number} frame
 */
function registerStillAnim(scene, key, textureKey, frame) {
  if (!scene?.anims || scene.anims.exists(key)) return;
  if (!scene.textures?.exists?.(textureKey)) return;
  const tex = scene.textures.get(textureKey);
  if (!textureHasFrame(tex, frame)) return;
  scene.anims.create({
    key,
    frames: [{ key: textureKey, frame }],
    frameRate: 1,
    repeat: -1,
  });
}
