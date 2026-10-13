/**
 * Female hero loadout from assets/library/characters/hero/girl/.
 *
 * v0.27 keeps the girl on the unarmed sheets (`player-girl-idle` / walk).
 * Owned guns are front-float sprites, not held poses. SPACE still cycles the
 * highlighted gun. Every owned gun fires once the deploy one-shot finishes,
 * along the west forward ray.
 *
 * `profile` only picks the legacy shot cue (handgun vs shotgun). Damage and
 * cadence live on WEAPON_TRAITS.
 */

import {
  OWNED_WEAPON_ORDER,
  WEAPON_TRAITS,
  backKey,
  frontKey,
} from './heroDeploy.js';

export const HERO_FRAME = 92;
/** Feet at y = 76. Same sole as the legacy player sheets. */
export const HERO_ORIGIN_X = 0.5;
export const HERO_ORIGIN_Y = 76 / 92;

const CARDINALS = ['west', 'east', 'north', 'south'];

/**
 * @param {string} id
 */
function weapon(id) {
  const trait = WEAPON_TRAITS[id];
  /** @type {Record<string, string>} */
  const walks = {};
  for (const dir of CARDINALS) {
    walks[dir] = `player-girl-${id}-walk-${dir}`;
  }
  return {
    id,
    label: trait.label,
    profile: trait.profile,
    idle: `player-girl-${id}-idle`,
    fire: `player-girl-${id}-fire`,
    icon: `icon-${id}`,
    front: frontKey(id),
    back: backKey(id),
    walks,
    projectile: trait.projectile || null,
    impact: trait.impact || null,
    muzzle: null,
    fan: trait.cone || null,
    projScale: 1,
    rotate: trait.rotate !== false,
  };
}

/** Shop order: water, sling, bubble, lightning, frost, flame. */
export const HERO_WEAPONS = OWNED_WEAPON_ORDER.map((id) => weapon(id));

/**
 * Armed walk keys kept for callers that still ask. Combat pose uses
 * unarmedAnimKeys in heroDeploy.js.
 * @param {{ idle: string, walks: Record<string, string> }|null|undefined} skin
 * @param {number} dy
 * @param {number} dx
 * @returns {string[]}
 */
export function heroLocomotionKeys(skin, dy, dx) {
  if (!skin) return ['player-girl-idle', 'player-idle'];
  if (dy < 0) return [skin.walks.north, skin.idle];
  if (dy > 0) return [skin.walks.south, skin.idle];
  if (dx < 0) return [skin.walks.west, skin.idle];
  if (dx > 0) return [skin.walks.east, skin.idle];
  return [skin.idle, 'player-girl-idle'];
}

/** @param {Phaser.Scene} scene */
export function heroLibraryReady(scene) {
  return !!scene?.textures?.exists?.('player-girl-idle');
}
