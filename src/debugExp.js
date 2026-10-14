import { PET_LINEUP } from './assets/petLineup.js';
import { T2_COST, T3_COST } from './systems/PetEvolve.js';

/**
 * Playtest shortcut for tier 2 then tier 3. Off unless the page URL has
 * `debugExp=1`. Does not change orb yield. Separate from `?petHurt=1` / H,
 * `?petLowHp=1` / L, and `?debugBgm=1` / V.
 * @param {string} [search]
 */
export function debugExpEnabled(search) {
  const raw = search ?? (typeof location !== 'undefined' ? location.search : '');
  const q = new URLSearchParams(raw || '');
  return q.get('debugExp') === '1';
}

/**
 * EXP still needed to land on the next tier. 0 once tier 3 is reached.
 * @param {number} exp
 */
export function expToNextTier(exp) {
  const n = Math.max(0, Math.floor(Number(exp) || 0));
  const cap = T2_COST + T3_COST;
  if (n >= cap) return 0;
  if (n >= T2_COST) return cap - n;
  return T2_COST - n;
}

/**
 * Grant the next tier (40, then 120) through PetEvolve.addExp.
 * Field pets when any are out; otherwise every pet, so the next summon
 * is already evolved. Never writes a save.
 * @param {{ getExp?: (id: string) => number, addExp?: (id: string, amount: number) => unknown }|null} evolve
 * @param {string[]} [fieldIds]
 */
export function grantDebugExp(evolve, fieldIds) {
  if (!evolve?.addExp || !evolve.getExp) return false;
  const ids = Array.isArray(fieldIds) && fieldIds.length
    ? fieldIds
    : PET_LINEUP.map((pet) => pet.id);
  let changed = false;
  for (const id of ids) {
    const need = expToNextTier(evolve.getExp(id));
    if (!(need > 0)) continue;
    evolve.addExp(id, need);
    changed = true;
  }
  return changed;
}
