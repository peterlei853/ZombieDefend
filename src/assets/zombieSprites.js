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
 * Milestone 2 S4 strips live under assets/library/enemies/zombies/s4/<slug>/
 * as zombie-s4-<slug>-{walk,attack,hurt,die}. Canvas is 88×88, origin (0.5, 1),
 * facing east, 8 frames. Stage preload queues the zombies category from the
 * asset index, so the slice size stays the index cell (88), not the 84px
 * profession cell and not {@link ZOMBIE_FRAME_SIZE}.
 * v0.36.30 wires `s4-construction` and `s4-schoolgirl` (manifest groups)
 * into stages 1–3. They have walk / attack / hurt / die only: no ruleAnims,
 * so hit01 / hit02 / deathwalk and the rest fall back to those four keys.
 * There is no run strip; a runner asks for walk instead.
 * `s4-salaryman` and `s4-delivery` stay catalog-only. The S4 delivery group
 * is not the live `delivery` profession. No S4 audio is queued.
 * Variant {@link SKIN_POOLS} stay the unskinned round-robin. Early waves
 * name these ids themselves.
 */
export const S4_FRAME_SIZE = 88;

/** Spawn ids for the two wired S4 groups. Salaryman and s4-delivery are absent. */
export const S4_EARLY_SKIN_IDS = ['s4-construction', 's4-schoolgirl'];

/**
 * Library skins. `facing: 'east'` means the strip already walks toward the
 * right-hand barricade — do not setFlipX. Armored trashcan / riot have no
 * die strip; the break strip is the death. Slime-mini has no attack.
 * Bosses are listed but not pooled: no wave row spawns them.
 * @type {Record<string, { id: string, facing: 'east'|'west', actions: Record<string, string|null>, blastFx?: string }>}
 */
export const ZOMBIE_LIBRARY_SKINS = {
  /** 84px profession sheets. Missing walks fall back here, never the removed 64px office group.
   * v0.36.25 plays `ruleAnims`: walk-normal / walk-tiremove, hurt-normal,
   * hit01 / hit02, and the death gates. Legacy walk/hurt/die1 still share
   * those sheets. Office hit02 is the true 16-frame strip. Chef die2 is
   * the v2 faceplant and is the normal02 slot. */
  'office-worker-v2': skin('office-worker-v2', 'zombie-office-worker-v2', {
    ruleAnims: true,
    ruleAnimKeys: { hit02: 'zombie-office-worker-v2-hit02' },
  }),
  delivery: skin('delivery', 'zombie-delivery', { ruleAnims: true }),
  chef: skin('chef', 'zombie-chef', {
    ruleAnims: true,
    // PIXELLAB_HOOK: normal02 slot plays the v2 faceplant, not the v1 kneel sheet.
    ruleAnimKeys: { dieNormal02: 'zombie-chef-die2' },
  }),
  nurse: skin('nurse', 'zombie-nurse', {
    attach: 'zombie-nurse-attach',
    ruleAnims: true,
  }),
  /** 88×88. Walk / attack / hurt / die only. Missing rule strips fall back. */
  's4-construction': s4PartialSkin('s4-construction'),
  's4-schoolgirl': s4PartialSkin('s4-schoolgirl'),
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
  brute: skin('brute', 'zombie-brute', { death: 'zombie-brute-die1', noHurtKnockback: true }),
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

/** The four profession groups that received the 2026-10-20 rule-anim strips. */
export const PROFESSION_RULE_GROUPS = ['office-worker-v2', 'delivery', 'chef', 'nurse'];

/**
 * PixelLab rule-anim keys for one profession prefix (`zombie-chef`).
 * v0.36.25 Stage plays these keys. Legacy walk / hurt / die1
 * still share Walk-normal, Hurt-normal, and Die-normal01.
 * Office hit02 is `zombie-office-worker-v2-hit02` (16×84). The
 * pull-weapon strip stays cataloged as `…-hit02-normal` and is not
 * the bite. Chef's normal02 slot is `zombie-chef-die2` (v2 faceplant).
 * @param {string} prefix
 * @param {Partial<ReturnType<typeof professionRuleAnims>>|null} [overrides]
 */
export function professionRuleAnims(prefix, overrides = null) {
  const rules = {
    walkNormal: `${prefix}-walk-normal`,
    walkTire: `${prefix}-walk-tiremove`,
    hurtNormal: `${prefix}-hurt-normal`,
    hit01: `${prefix}-hit01-normal`,
    hit02: `${prefix}-hit02-normal`,
    dieNormal01: `${prefix}-die-normal01`,
    dieNormal02: `${prefix}-die-normal02`,
    dieDeathwalk: `${prefix}-die-deathwalk`,
    dieCriticalHit: `${prefix}-die-critical-hit`,
    dieDisappear: `${prefix}-die-disappear`,
  };
  if (overrides) Object.assign(rules, overrides);
  return rules;
}

/**
 * @param {string} id
 * @param {string} prefix key prefix, e.g. `zombie-office-worker-v2`
 * @param {{ attack?: string|null, death?: string, hurt?: string, run?: string|null, blast?: string, blastFx?: string, ruleAnims?: boolean, hit02Alias?: boolean, ruleAnimKeys?: object, frameWidth?: number, frameHeight?: number }} [extra]
 */
function skin(id, prefix, extra = {}) {
  return {
    id,
    facing: /** @type {'east'} */ ('east'),
    blastFx: extra.blastFx || null,
    fallbackId: extra.fallbackId || null,
    /** Big body stays planted on a hurt shove. Brute only. */
    noHurtKnockback: extra.noHurtKnockback === true,
    /** True only when hit02 is still the pull-weapon ALIAS. Office is not. */
    hit02Alias: extra.hit02Alias === true,
    /** Authored cell when the catalog grew past 64. Loader still slices from the index. */
    frameWidth: extra.frameWidth || null,
    frameHeight: extra.frameHeight || null,
    ruleAnims: extra.ruleAnims ? professionRuleAnims(prefix, extra.ruleAnimKeys || null) : null,
    actions: {
      walk: `${prefix}-walk`,
      run: Object.prototype.hasOwnProperty.call(extra, 'run') ? extra.run : `${prefix}-run`,
      attack: extra.attack === undefined ? `${prefix}-attack` : extra.attack,
      death: extra.death || `${prefix}-die1`,
      // PIXELLAB_HOOK: die1 shares Die-normal01. Chef die2 is the v2 faceplant
      // and is the normal02 slot (`ruleAnimKeys.dieNormal02`). The other
      // professions still share die2 with Die-normal02.
      // v0.36.25 death selection uses ruleAnims (crit / L3 / 10-45-45), not this list.
      deaths: extra.deaths || [`${prefix}-die1`, `${prefix}-die2`],
      // PIXELLAB_HOOK: `{prefix}-hurt`. Office Hurt-normal is 5 frames @ 10.
      // Delivery, chef, and nurse Hurt-normal stay 4 frames @ 10.
      hurt: extra.hurt || `${prefix}-hurt`,
      blast: extra.blast || null,
      attach: extra.attach || null,
    },
  };
}

/**
 * S4 group with only walk / attack / hurt / die. Id matches the manifest
 * `group` (`s4-construction`, `s4-schoolgirl`) and the catalog key prefix
 * `zombie-<id>-*`. Die is `die`, not `die1`. No rule-anim map.
 * @param {'s4-construction'|'s4-schoolgirl'} id
 */
function s4PartialSkin(id) {
  const prefix = `zombie-${id}`;
  return skin(id, prefix, {
    run: null,
    death: `${prefix}-die`,
    deaths: [`${prefix}-die`],
    frameWidth: S4_FRAME_SIZE,
    frameHeight: S4_FRAME_SIZE,
  });
}

/** Walk speed while a hurt strip is playing. Half of the march speed. v0.36.25 keeps this. */
export const ZOMBIE_HURT_SPEED_MUL = 0.5;

/**
 * v0.36.25 profession walk gate. HP at or above this plays walk-normal
 * at the wave speed. HP under this plays walk-tiremove at
 * {@link ZOMBIE_TIRE_SPEED_MUL}. Absolute HP, not the 30% critical ratio.
 */
export const ZOMBIE_TIRE_HP = 30;
/** TireMove march speed. −70% of the wave speed. The hurt half stacks on top. */
export const ZOMBIE_TIRE_SPEED_MUL = 0.3;
/** Hurt window stays 400ms (a 4-frame beat at 10 fps). Office Hurt-normal is 5 frames and uses this same window. */
export const ZOMBIE_HURT_MS = 400;

/**
 * Death strips this skin may play. `deaths` is die1 + die2 when the
 * catalog has both. A custom primary (armor break) is included by the caller
 * when it is not already in the list.
 * @param {{ actions?: { deaths?: string[], death?: string } }|null|undefined} skinDef
 * @returns {string[]}
 */
export function zombieDeathKeys(skinDef) {
  const listed = skinDef?.actions?.deaths;
  if (Array.isArray(listed) && listed.length) return listed.filter((key) => !!key);
  const one = skinDef?.actions?.death;
  return one ? [one] : [];
}

/**
 * @param {string[]} keys ready anim keys
 * @param {() => number} [rng] returns a number in [0, 1)
 * @returns {string|null}
 */
export function pickDeathKey(keys, rng = Math.random) {
  if (!Array.isArray(keys) || keys.length === 0) return null;
  const roll = Number(rng());
  const u = Number.isFinite(roll) ? roll : 0;
  const i = Math.min(keys.length - 1, Math.max(0, Math.floor(u * keys.length)));
  return keys[i];
}

/**
 * v0.36.25 Peter death gates for one profession `ruleAnims` map.
 * Crit kill → die-critical-hit. Water L3 (`charge` ≥ 3) → die-disappear.
 * Otherwise die-deathwalk 10% / die-normal01 45% / die-normal02 45%.
 * Crit wins when both flags are set. A missing strip is skipped and the
 * remaining weights are renormalized. Null when none of those keys are ready.
 * @param {{ dieCriticalHit?: string, dieDisappear?: string, dieDeathwalk?: string, dieNormal01?: string, dieNormal02?: string }|null|undefined} ruleAnims
 * @param {{ crit?: boolean, charge?: number }|null|undefined} cause
 * @param {(key: string) => boolean} ready
 * @param {() => number} [rng]
 * @returns {string|null}
 */
export function pickProfessionDeathKey(ruleAnims, cause, ready, rng = Math.random) {
  if (!ruleAnims || typeof ready !== 'function') return null;
  const playable = (key) => typeof key === 'string' && !!key && ready(key);
  if (cause?.crit === true && playable(ruleAnims.dieCriticalHit)) return ruleAnims.dieCriticalHit;
  const charge = Number(cause?.charge);
  if (charge >= 3 && playable(ruleAnims.dieDisappear)) return ruleAnims.dieDisappear;
  /** @type {[string, number][]} */
  const rows = [
    [ruleAnims.dieDeathwalk, 0.1],
    [ruleAnims.dieNormal01, 0.45],
    [ruleAnims.dieNormal02, 0.45],
  ].filter((row) => playable(row[0]));
  if (!rows.length) return null;
  const total = rows.reduce((sum, row) => sum + row[1], 0);
  let roll = Number(rng());
  if (!Number.isFinite(roll) || roll < 0) roll = 0;
  if (roll >= 1) roll = 0.999999;
  let acc = 0;
  for (const [key, weight] of rows) {
    acc += weight / total;
    if (roll < acc) return key;
  }
  return rows[rows.length - 1][0];
}

/**
 * Barricade / player bite. `[0, 0.5)` is hit01, `[0.5, 1)` is hit02.
 * Office hit02 is `zombie-office-worker-v2-hit02`, not the pull-weapon alias.
 * @param {{ hit01?: string, hit02?: string }|null|undefined} ruleAnims
 * @param {() => number} [rng]
 * @returns {string|null}
 */
export function pickProfessionAttackKey(ruleAnims, rng = Math.random) {
  if (!ruleAnims) return null;
  const hit01 = ruleAnims.hit01 || null;
  const hit02 = ruleAnims.hit02 || null;
  if (!hit01 && !hit02) return null;
  const roll = Number(rng());
  const u = Number.isFinite(roll) ? roll : 0;
  if (u < 0.5) return hit01 || hit02;
  return hit02 || hit01;
}

/**
 * walk-normal at HP ≥ {@link ZOMBIE_TIRE_HP}, otherwise walk-tiremove.
 * @param {{ walkNormal?: string, walkTire?: string }|null|undefined} ruleAnims
 * @param {number} hp
 * @returns {string|null}
 */
export function professionLocomotionKey(ruleAnims, hp) {
  if (!ruleAnims) return null;
  const tired = Number(hp) < ZOMBIE_TIRE_HP;
  const key = tired ? ruleAnims.walkTire : ruleAnims.walkNormal;
  return key || null;
}

/**
 * Wave speed, or that speed ×0.3 while HP is under the tire gate.
 * Does not apply the 30% critical-HP ratio. Callers multiply the hurt half separately.
 * @param {number} speed
 * @param {number} hp
 */
export function tireMoveSpeed(speed, hp) {
  const base = Number(speed);
  const march = Number.isFinite(base) ? base : 0;
  if (Number(hp) < ZOMBIE_TIRE_HP) return march * ZOMBIE_TIRE_SPEED_MUL;
  return march;
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
 * @param {'walk'|'attack'|'stumble'|'death'|'hurt'|'blast'} action
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
  if (action === 'blast' || action === 'hurt') return null;
  return zombieSheetKey(variant, action);
}
