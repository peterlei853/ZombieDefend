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
  { key: 'player-handgun-aim-walk-west', frames: 6, frameRate: 10, repeat: -1 },
  { key: 'player-handgun-aim-walk-east', frames: 6, frameRate: 10, repeat: -1 },
  { key: 'player-handgun-aim-walk-north', frames: 6, frameRate: 10, repeat: -1 },
  { key: 'player-handgun-aim-walk-south', frames: 6, frameRate: 10, repeat: -1 },
  { key: 'player-shotgun-hold-walk-west', frames: 6, frameRate: 10, repeat: -1 },
  { key: 'player-shotgun-hold-walk-east', frames: 6, frameRate: 10, repeat: -1 },
  { key: 'player-shotgun-hold-walk-north', frames: 6, frameRate: 10, repeat: -1 },
  { key: 'player-shotgun-hold-walk-south', frames: 6, frameRate: 10, repeat: -1 },
  { key: 'player-shotgun-fire-recoil', frames: 6, frameRate: 12, repeat: 0 },
];

export const PLAYER_WEAPON_IMAGES = [
  { key: 'handgun', file: 'handgun.png' },
  { key: 'shotgun', file: 'shotgun.png' },
];

/** Prefer this one-shot over `player-shotgun-recoil` when the sheet loaded. */
export const SHOTGUN_FIRE_RECOIL_KEY = 'player-shotgun-fire-recoil';

/** Armed walks. Keys match the 6-frame PixelLab strips. */
export const HANDGUN_AIM_WALK = {
  west: 'player-handgun-aim-walk-west',
  east: 'player-handgun-aim-walk-east',
  north: 'player-handgun-aim-walk-north',
  south: 'player-handgun-aim-walk-south',
};

export const SHOTGUN_HOLD_WALK = {
  west: 'player-shotgun-hold-walk-west',
  east: 'player-shotgun-hold-walk-east',
  north: 'player-shotgun-hold-walk-north',
  south: 'player-shotgun-hold-walk-south',
};

const ACTION_ANIMS = new Set([
  'player-handgun-shoot',
  'player-shotgun-recoil',
  SHOTGUN_FIRE_RECOIL_KEY,
]);

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

/** @param {string|null|undefined} key */
export function isShotgunRecoilAnim(key) {
  return key === SHOTGUN_FIRE_RECOIL_KEY || key === SHOTGUN_RECOIL_KEY;
}

/**
 * Fire anim for a shotgun volley. The newer west fire-recoil sheet wins
 * when it is registered; the older recoil sheet remains the fallback.
 * @param {Phaser.Scene} scene
 * @returns {string}
 */
export function preferredShotgunRecoilKey(scene) {
  if (scene?.anims?.exists?.(SHOTGUN_FIRE_RECOIL_KEY)) return SHOTGUN_FIRE_RECOIL_KEY;
  return SHOTGUN_RECOIL_KEY;
}

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
  SHOTGUN_FIRE_RECOIL_KEY,
  SHOTGUN_HOLD_KEY,
  ...Object.values(HANDGUN_AIM_WALK),
  ...Object.values(SHOTGUN_HOLD_WALK),
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
 * Armed walk strips for a stance, or null when the defender is unarmed.
 * @param {'handgun'|'shotgun'|null|undefined} stance
 */
function walkSetForStance(stance) {
  if (stance === 'shotgun') return SHOTGUN_HOLD_WALK;
  if (stance === 'handgun') return HANDGUN_AIM_WALK;
  return null;
}

/**
 * Idle, or a cardinal walk. Lane input (W/S, joystick Y) uses north/south
 * and is never mirrored — those sheets stay as authored. West/east are used
 * only when the lane axis is idle. In a weapon stance the armed walk is
 * first, then `player-walk-up` / `down`, then the unarmed cardinal sheet.
 * @param {number} dy -1 up / +1 down / 0
 * @param {number} dx -1 west / +1 east / 0
 * @param {'handgun'|'shotgun'|null} [stance]
 * @returns {string[]}
 */
export function locomotionAnimCandidates(dy, dx, stance = null) {
  const walks = walkSetForStance(stance);
  if (dy < 0) return [walks?.north, 'player-walk-up', 'player-walk-north'].filter(Boolean);
  if (dy > 0) return [walks?.south, 'player-walk-down', 'player-walk-south'].filter(Boolean);
  if (dx < 0) return [walks?.west, 'player-walk-west'].filter(Boolean);
  if (dx > 0) return [walks?.east, 'player-walk-east'].filter(Boolean);
  return ['player-idle'];
}

/**
 * First locomotion key. Callers should still fall through the candidate list
 * when that key was not registered.
 * @param {number} dy
 * @param {number} dx
 * @param {'handgun'|'shotgun'|null} [stance]
 * @returns {string}
 */
export function locomotionAnimKey(dy, dx, stance = null) {
  return locomotionAnimCandidates(dy, dx, stance)[0];
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
 * Also registers walk-up/down aliases (unarmed north/south until a weapon
 * stance retargets them). Stance keys prefer a real `player-handgun-aim` /
 * `player-shotgun-hold` sheet and otherwise hold one frame of the shoot /
 * recoil sheet. Walk and fire-recoil strips register with the other sheets.
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
 * up/down sheet, or a previous call) unless `replace` is set.
 * @param {Phaser.Scene} scene
 * @param {string} key
 * @param {string} sourceKey
 * @param {{ replace?: boolean }} [opts]
 */
function registerAnimAlias(scene, key, sourceKey, opts = {}) {
  if (!scene?.anims) return;
  if (scene.anims.exists(key)) {
    if (!opts.replace) return;
    const textureKey = scene.anims.get(key)?.frames?.[0]?.textureKey;
    if (textureKey === sourceKey) return;
    if (typeof scene.anims.remove === 'function') scene.anims.remove(key);
  }
  if (!scene.anims.exists(sourceKey)) return;
  const meta = PLAYER_SHEETS.find((sheet) => sheet.key === sourceKey);
  if (!meta || !scene.textures.exists(sourceKey)) return;
  if (scene.anims.exists(key)) return;
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

/**
 * Point `player-walk-up` / `player-walk-down` at the equipped weapon's
 * north / south walk. Falls back to the unarmed cardinal sheets when the
 * armed strip is not registered.
 * @param {Phaser.Scene} scene
 * @param {'handgun'|'shotgun'} stance
 */
export function applyWeaponWalkAliases(scene, stance) {
  const walks = walkSetForStance(stance);
  if (!walks) return;
  const pairs = [
    { key: 'player-walk-up', source: walks.north, fallback: 'player-walk-north' },
    { key: 'player-walk-down', source: walks.south, fallback: 'player-walk-south' },
  ];
  for (const pair of pairs) {
    const source = scene?.anims?.exists?.(pair.source) ? pair.source : pair.fallback;
    registerAnimAlias(scene, pair.key, source, { replace: true });
  }
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
