/**
 * Pure layout for the sandbox weapon try-out.
 * No Phaser, no mounts, no saves. Stage combat does not import this.
 */

import { MUZZLE_WEST_FRAC, OWNED_WEAPON_ORDER, WEAPON_TRAITS } from '../assets/heroDeploy.js';

export const SANDBOX_WEAPONS = OWNED_WEAPON_ORDER.slice();

/** Authored front-float frame. Every `player-girl-front-*` strip is this square. */
export const SANDBOX_FLOAT_FRAME = 56;

/**
 * Frame px from the hero's feet. Negative X is west (in front).
 * Negative Y is up the body, so the gun sits at the chest instead of the boots.
 * The try-out multiplies by the hero display scale, the same way HeroFloats does.
 */
export const SANDBOX_FLOAT_OFFSET = { x: -46, y: -42 };

/** Durable dummy so several hits stay readable. Not a wave-table HP. */
export const SANDBOX_TARGET_HP = 360;

/**
 * Query `?weapon=` wins. A `#sling` hash is the fallback because `serve`
 * redirects `weapons.html?weapon=sling` to `/sandbox/weapons` and drops
 * the query, while the browser keeps the hash. GitHub Pages keeps the query.
 * @param {string} [search]
 * @param {string} [hash]
 * @returns {string}
 */
export function sandboxWeaponFromSearch(search, hash) {
  try {
    const id = (new URLSearchParams(search || '').get('weapon') || '').trim().toLowerCase();
    if (SANDBOX_WEAPONS.includes(id)) return id;
    const hashed = String(hash || '').replace(/^#/, '').trim().toLowerCase();
    if (SANDBOX_WEAPONS.includes(hashed)) return hashed;
  } catch (_) {
    /* a bad query still opens water */
  }
  return 'water';
}

/**
 * @param {number} heroX
 * @param {number} heroY
 * @param {number} scale
 */
export function sandboxFloatOrigin(heroX, heroY, scale) {
  const s = Math.abs(scale) > 0 ? Math.abs(scale) : 1;
  return {
    x: heroX + SANDBOX_FLOAT_OFFSET.x * s,
    y: heroY + SANDBOX_FLOAT_OFFSET.y * s,
    scale: s,
  };
}

/**
 * West muzzle, the same fraction of the catalog frame HeroFloats uses.
 * @param {{ x: number, y: number, scale: number }} origin
 * @param {number} [frame]
 */
export function sandboxMuzzle(origin, frame = SANDBOX_FLOAT_FRAME) {
  const width = frame > 0 ? frame : SANDBOX_FLOAT_FRAME;
  return {
    x: origin.x - width * origin.scale * MUZZLE_WEST_FRAC,
    y: origin.y,
  };
}

/** @param {string} id */
export function sandboxWeaponLabel(id) {
  const trait = WEAPON_TRAITS[id];
  if (!trait) return id;
  if (trait.continuous) {
    return `${trait.label} · floating ${SANDBOX_FLOAT_FRAME}×${SANDBOX_FLOAT_FRAME} · ${trait.cone} · burn ${trait.burnFx}`;
  }
  const hit = id === 'water' ? 'fx-lightning-impact' : trait.impact;
  return `${trait.label} · floating ${SANDBOX_FLOAT_FRAME}×${SANDBOX_FLOAT_FRAME} · ${trait.projectile} · hit ${hit}`;
}
