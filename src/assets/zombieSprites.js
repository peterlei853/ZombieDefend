import { BRUTE_SKILL_ANIM } from '../data/bruteSkill.js';

/**
 * Zombie sheets.
 *
 * Stage visuals prefer the asset library (12 groups, east-facing, feet at
 * (0.5, 1)). The legacy walker/runner/tank strips in assets/zombies/ stay
 * as a fallback and still face west — those keep setFlipX(true).
 * Combat variant (knockback) is separate from the library skin.
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

/**
 * Library skins. `facing: 'east'` means the strip already walks toward the
 * right-hand barricade — do not setFlipX. Armored trashcan / riot have no
 * die strip; the break strip is the death. Slime-mini has no attack.
 * Bosses are listed but not pooled: no wave row spawns them.
 * @type {Record<string, { id: string, facing: 'east'|'west', actions: Record<string, string|null>, blastFx?: string }>}
 */
export const ZOMBIE_LIBRARY_SKINS = {
  /** 84px profession sheets. Missing walks fall back here, never the removed 64px office group. */
  'office-worker-v2': skin('office-worker-v2', 'zombie-office-worker-v2'),
  delivery: skin('delivery', 'zombie-delivery'),
  chef: skin('chef', 'zombie-chef'),
  nurse: skin('nurse', 'zombie-nurse', { attach: 'zombie-nurse-attach' }),
  clown: skin('clown', 'zombie-clown', { death: 'zombie-clown-die1' }),
  cyborg: skin('cyborg', 'zombie-cyborg', { death: 'zombie-cyborg-die1' }),
  slime: skin('slime', 'zombie-slime', { death: 'zombie-slime-die1' }),
  'slime-mini': skin('slime-mini', 'zombie-slime-mini', {
    attack: null,
    death: 'zombie-slime-mini-die',
  }),
  exploder: skin('exploder', 'zombie-exploder', {
    death: 'zombie-exploder-die1',
    blast: 'zombie-exploder-explode',
    blastFx: 'zombie-exploder-blast',
  }),
  'riot-bare': skin('riot-bare', 'zombie-riot-bare', { death: 'zombie-riot-bare-die1' }),
  'trashcan-bare': skin('trashcan-bare', 'zombie-trashcan-bare', {
    death: 'zombie-trashcan-bare-die1',
  }),
  sprinter: skin('sprinter', 'zombie-sprinter', { death: 'zombie-sprinter-die1' }),
  brute: skin('brute', 'zombie-brute', {
    death: 'zombie-brute-die1',
    noHurtKnockback: true,
    skill: BRUTE_SKILL_ANIM,
  }),
  trashcan: skin('trashcan', 'zombie-trashcan', {
    death: 'zombie-trashcan-break',
    hurt: 'zombie-trashcan-hurt_armor',
  }),
  riot: skin('riot', 'zombie-riot', {
    death: 'zombie-riot-armor_break',
    hurt: 'zombie-riot-hurt_armor',
  }),
};

/**
 * Not spawned. Stage waves only emit walker / runner / tank.
 * Keys are ready for a later boss row: walk + attack + die, facing east, 128px.
 */
export const ZOMBIE_BOSS_SKINS = {
  'lava-balon': {
    id: 'lava-balon',
    facing: 'east',
    actions: {
      walk: 'zombie-boss-lava-walk',
      run: 'zombie-boss-lava-run',
      attack: 'zombie-boss-lava-attack',
      hurt: 'zombie-boss-lava-hurt',
      death: 'zombie-boss-lava-die1',
    },
  },
  'steel-balam': {
    id: 'steel-balam',
    facing: 'east',
    actions: {
      walk: 'zombie-boss-steel-walk',
      run: 'zombie-boss-steel-run',
      attack: 'zombie-boss-steel-attack',
      hurt: 'zombie-boss-steel-hurt',
      death: 'zombie-boss-steel-die1',
    },
  },
};

/** Visual pools. HP / speed / DPS stay on the wave archetype. */
const SKIN_POOLS = {
  walker: [
    'office-worker-v2',
    'clown',
    'cyborg',
    'slime',
    'slime-mini',
    'exploder',
    'riot-bare',
    'trashcan-bare',
  ],
  runner: ['sprinter', 'clown', 'office-worker-v2', 'exploder', 'cyborg'],
  tank: ['brute', 'trashcan', 'riot'],
};

/** @type {Record<string, number>} */
const skinCursor = { walker: 0, runner: 0, tank: 0 };

/**
 * @param {string} id
 * @param {string} prefix key prefix, e.g. `zombie-office-worker-v2`
 * @param {{ attack?: string|null, death?: string, hurt?: string, blast?: string, blastFx?: string, skill?: string|null, noHurtKnockback?: boolean }} [extra]
 */
function skin(id, prefix, extra = {}) {
  return {
    id,
    facing: /** @type {'east'} */ ('east'),
    blastFx: extra.blastFx || null,
    fallbackId: extra.fallbackId || null,
    /** Big body stays planted on a hurt shove. Brute only. */
    noHurtKnockback: extra.noHurtKnockback === true,
    actions: {
      walk: `${prefix}-walk`,
      run: `${prefix}-run`,
      attack: extra.attack === undefined ? `${prefix}-attack` : extra.attack,
      death: extra.death || `${prefix}-die1`,
      hurt: extra.hurt || `${prefix}-hurt`,
      blast: extra.blast || null,
      attach: extra.attach || null,
      skill: extra.skill || null,
    },
  };
}

/**
 * Water body-hit overlays from the v0.31 catalog. Play at the body center
 * on the frame before takeDamage. Other skins fall back to fx-water-impact.
 * @type {Record<string, string>}
 */
export const WATER_BODY_HIT_FX = {
  'office-worker-v2': 'fx-hit-water-office-v2',
  delivery: 'fx-hit-water-delivery',
  chef: 'fx-hit-water-chef',
  nurse: 'fx-hit-water-nurse',
};

/**
 * @param {string|null|undefined} skinId
 * @returns {string|null}
 */
export function waterBodyHitKey(skinId) {
  if (!skinId || typeof skinId !== 'string') return null;
  return WATER_BODY_HIT_FX[skinId] || null;
}

/**
 * Sling body-hit overlays. The four profession sheets match the catalog.
 * Other skins keep a PIXELLAB_HOOK name and play only when that texture
 * is loaded. office-worker-v2 uses the office-v2 suffix, same as water.
 * @type {Record<string, string>}
 */
export const SLING_BODY_HIT_FX = {
  'office-worker-v2': 'fx-hit-sling-office-v2',
  delivery: 'fx-hit-sling-delivery',
  chef: 'fx-hit-sling-chef',
  nurse: 'fx-hit-sling-nurse',
};

/**
 * @param {string|null|undefined} skinId
 * @returns {string|null}
 */
export function slingBodyHitKey(skinId) {
  if (!skinId || typeof skinId !== 'string') return null;
  if (SLING_BODY_HIT_FX[skinId]) return SLING_BODY_HIT_FX[skinId];
  // PIXELLAB_HOOK: fx-hit-sling-<skinId>
  return `fx-hit-sling-${skinId}`;
}

/**
 * Generic per-skin puff name. Water prefers waterBodyHitKey.
 * Sling prefers slingBodyHitKey.
 * PIXELLAB_HOOK: fx-hit-<skinId> for professions that do not have a
 * fx-hit-water-* sheet yet (clown, cyborg, slime, exploder, and the rest).
 * @param {string|null|undefined} skinId
 * @returns {string|null}
 */
export function zombieHitFxKey(skinId) {
  if (!skinId || typeof skinId !== 'string') return null;
  return `fx-hit-${skinId}`;
}

/** Last resort when the requested profession strip is not loaded. */
export const SPAWN_FALLBACK_SKIN = 'office-worker-v2';

/**
 * The removed 64px group. `zombie-office-worker-v2-*` does not match this.
 * @param {string|null|undefined} key
 */
export function isRetiredOfficeKey(key) {
  return typeof key === 'string' && key.startsWith('zombie-office-') && !key.startsWith('zombie-office-worker-v2-');
}

/**
 * Preferred library skin, then that skin's fallback, then office-worker-v2.
 * Retired `zombie-office-*` keys are skipped even if a caller still names them.
 * Returns null when no live walk/run strip is registered.
 * @param {Phaser.Scene} scene
 * @param {string|null|undefined} skinId
 * @param {string} variant
 */
/**
 * Library skin or a boss skin. Waves only pass library ids.
 * @param {string|null|undefined} id
 */
export function zombieSkinDef(id) {
  if (!id) return null;
  return ZOMBIE_LIBRARY_SKINS[id] || ZOMBIE_BOSS_SKINS[id] || null;
}

/**
 * Hurt shove is skipped for a big body. Only the brute catalog sets
 * `noHurtKnockback`. Stage `applyKnockback` and the feel-booth 2px X
 * shove both read this. Pet slides do not.
 * @param {{ noHurtKnockback?: boolean, skin?: { id?: string, noHurtKnockback?: boolean }|null, skinId?: string }|null|undefined} zombie
 */
export function skipsHurtKnockback(zombie) {
  if (!zombie) return false;
  if (zombie.noHurtKnockback === true) return true;
  const skin = zombie.skin;
  if (skin && typeof skin === 'object' && skin.noHurtKnockback === true) return true;
  const id = (skin && typeof skin === 'object' && skin.id) || zombie.skinId;
  return zombieSkinDef(id)?.noHurtKnockback === true;
}

export function resolveSpawnSkin(scene, skinId, variant) {
  /** @type {string[]} */
  const chain = [];
  const push = (id) => {
    if (!id || chain.includes(id)) return;
    chain.push(id);
  };
  push(skinId);
  push(zombieSkinDef(skinId)?.fallbackId);
  push(SPAWN_FALLBACK_SKIN);
  for (const id of chain) {
    const def = zombieSkinDef(id);
    if (!def) continue;
    const walk = zombieActionKey(def, variant, 'walk');
    if (!walk || isRetiredOfficeKey(walk)) continue;
    if (scene?.textures?.exists?.(walk) && scene?.anims?.exists?.(walk)) return def;
  }
  return null;
}

/**
 * Next library skin for a combat variant. Round-robin so a walker wave
 * shows the whole walker pool before repeating.
 * @param {string} variant
 */
export function takeZombieSkin(variant) {
  const pool = SKIN_POOLS[variant] || SKIN_POOLS.walker;
  const cursor = skinCursor[variant] || 0;
  skinCursor[variant] = cursor + 1;
  const id = pool[cursor % pool.length];
  return ZOMBIE_LIBRARY_SKINS[id];
}

/**
 * Library action key, or null when that strip does not exist for the skin.
 * Runners play `run` for the walk slot. Legacy fallback is `zombie-${variant}-${action}`.
 * @param {{ actions?: Record<string, string|null> }|null|undefined} skinDef
 * @param {string} variant
 * @param {'walk'|'attack'|'stumble'|'death'|'hurt'|'blast'|'skill'} action
 * @returns {string|null}
 */
export function zombieActionKey(skinDef, variant, action) {
  if (skinDef?.actions) {
    if (action === 'walk' && variant === 'runner' && skinDef.actions.run) {
      return skinDef.actions.run;
    }
    if (action === 'stumble') return skinDef.actions.stumble || null;
    return skinDef.actions[action] || null;
  }
  if (action === 'blast' || action === 'hurt' || action === 'skill') return null;
  return zombieSheetKey(variant, action);
}
