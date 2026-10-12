/**
 * Female hero loadout from assets/library/characters/hero/girl/.
 *
 * SPACE cycles these six skins. `profile` picks the existing GameConfig
 * weapon (handgun = one slug, shotgun = the pellet fan). Damage, fire rate,
 * knockback, and range stay on those two profiles.
 *
 * Sheets face west (toward the left-hand march) except walk-east/north/south,
 * which stay as authored. Feet origin matches the 92px library frame.
 */

export const HERO_FRAME = 92;
/** Feet at y = 76. Same sole as the legacy player sheets. */
export const HERO_ORIGIN_X = 0.5;
export const HERO_ORIGIN_Y = 76 / 92;

const CARDINALS = ['west', 'east', 'north', 'south'];

/**
 * @param {string} id
 * @param {string} label
 * @param {'handgun'|'shotgun'} profile
 * @param {object} fx
 */
function weapon(id, label, profile, fx) {
  /** @type {Record<string, string>} */
  const walks = {};
  for (const dir of CARDINALS) {
    walks[dir] = `player-girl-${id}-walk-${dir}`;
  }
  return {
    id,
    label,
    profile,
    idle: `player-girl-${id}-idle`,
    fire: `player-girl-${id}-fire`,
    icon: `icon-${id}`,
    walks,
    ...fx,
  };
}

/**
 * Order alternates profiles so the first SPACE press is still
 * single-shot → spread, matching the old handgun / shotgun swap.
 * @type {ReturnType<typeof weapon>[]}
 */
export const HERO_WEAPONS = [
  weapon('sling', 'Sling', 'handgun', {
    projectile: 'fx-sling-pellet',
    impact: 'fx-sling-impact',
    muzzle: null,
    fan: null,
    projScale: 1.35,
    rotate: true,
  }),
  weapon('bubble', 'Bubble', 'shotgun', {
    projectile: 'fx-bubble-proj-s',
    projectileAlts: ['fx-bubble-proj-s', 'fx-bubble-proj-m', 'fx-bubble-proj-l'],
    impact: 'fx-bubble-pop',
    muzzle: 'fx-bubble-muzzle',
    fan: null,
    projScale: 1.15,
    rotate: false,
  }),
  weapon('lightning', 'Lightning', 'handgun', {
    projectile: 'fx-lightning-bolt',
    impact: 'fx-lightning-impact',
    muzzle: 'fx-lightning-muzzle',
    fan: null,
    projScale: 1,
    rotate: true,
  }),
  weapon('flame', 'Flame', 'shotgun', {
    projectile: 'fx-flame-smoke',
    impact: 'fx-flame-impact',
    muzzle: 'fx-flame-muzzle',
    fan: 'fx-flame-cone',
    projScale: 0.5,
    rotate: false,
  }),
  weapon('water', 'Water', 'handgun', {
    projectile: 'fx-water-stream',
    impact: 'fx-water-impact',
    muzzle: 'fx-water-muzzle',
    fan: null,
    projScale: 0.75,
    rotate: true,
  }),
  weapon('frost', 'Frost', 'shotgun', {
    // 16px crystal. projScale 0.5 was only to shrink the 64px beam.
    projectile: 'fx-frost-pellet',
    impact: 'fx-frost-impact',
    muzzle: 'fx-frost-muzzle',
    fan: null,
    projScale: 1,
    rotate: true,
  }),
];

/**
 * Armed walk, or the weapon idle when the lane axis is quiet.
 * North / south sheets are never mirrored.
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
  return !!scene?.textures?.exists?.(HERO_WEAPONS[0].idle);
}
