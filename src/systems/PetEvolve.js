import { PET_LINEUP } from '../assets/petLineup.js';

/** EXP to reach tier 2. Tier 1 starts at 0. */
export const T2_COST = 40;
/** Additional EXP to reach tier 3 after tier 2. Cumulative from 0 is T2+T3. */
export const T3_COST = 80;
/** One pet to tier 3. Shared by the whole stage drop. */
export const STAGE_EXP_CAP = T2_COST + T3_COST;
const CLAMP_AT = 2 / 3;

/**
 * Per-stage pet EXP and tier. Never writes SaveManager or localStorage.
 * Tier 2 at 40, tier 3 at 120 cumulative. Past 2/3 stage progress the
 * remaining orb budget is whatever is left under STAGE_EXP_CAP.
 */
export class PetEvolve {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    this.resetStage();
  }

  /** All pets exp=0, tier=1. Rebuilds the drop budget. */
  resetStage() {
    this.dropped = 0;
    this.progress = 0;
    /** @type {Record<string, { exp: number, tier: 1|2|3 }>} */
    this._pets = {};
    for (const pet of PET_LINEUP) this._pets[pet.id] = { exp: 0, tier: 1 };
  }

  /**
   * @param {number} p 0..1 stage time or wave progress
   */
  notifyStageProgress(p) {
    const n = Number(p);
    this.progress = Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;
  }

  /**
   * EXP still allowed to spawn. Infinite before the two-thirds mark.
   * @returns {number}
   */
  getRemainingBudget() {
    if (this.progress < CLAMP_AT) return Number.POSITIVE_INFINITY;
    return Math.max(0, STAGE_EXP_CAP - this.dropped);
  }

  /**
   * Grant up to `amount` from the stage drop budget and record it.
   * Before 2/3 progress the drop is not clamped. At or after 2/3,
   * remaining is max(0, STAGE_EXP_CAP - alreadyDropped).
   * @param {number} amount
   * @returns {number}
   */
  requestDrop(amount) {
    const want = Math.max(0, Math.floor(Number(amount) || 0));
    if (want <= 0) return 0;
    let grant = want;
    if (this.progress >= CLAMP_AT) {
      grant = Math.min(want, Math.max(0, STAGE_EXP_CAP - this.dropped));
    }
    this.dropped += grant;
    return grant;
  }

  /**
   * @param {string} petId
   * @param {number} amount
   * @returns {{ tier: 1|2|3, exp: number, leveled: boolean }}
   */
  addExp(petId, amount) {
    const pet = this._ensure(petId);
    if (!pet) return { tier: 1, exp: 0, leveled: false };
    const add = Math.max(0, Math.floor(Number(amount) || 0));
    const before = pet.tier;
    pet.exp += add;
    pet.tier = tierFromExp(pet.exp);
    const leveled = pet.tier > before;
    if (leveled) {
      this.scene?.events?.emit?.('pet:evolved', { petId, tier: pet.tier });
      this.scene?.audio?.playPetEvolve?.();
    }
    return { tier: pet.tier, exp: pet.exp, leveled };
  }

  /** @param {string} petId @returns {1|2|3} */
  getTier(petId) {
    return this._pets[petId]?.tier ?? 1;
  }

  /** @param {string} petId */
  getExp(petId) {
    return this._pets[petId]?.exp ?? 0;
  }

  /** Ultimate is tier 3 only. */
  canUseUlt(petId) {
    return this.getTier(petId) === 3;
  }

  /**
   * Fill of the current tier, 0..1. Tier 3 stays full.
   * @param {string} petId
   */
  expRatio(petId) {
    const exp = this.getExp(petId);
    const tier = this.getTier(petId);
    if (tier >= 3) return 1;
    if (tier >= 2) return clamp01((exp - T2_COST) / T3_COST);
    return clamp01(exp / T2_COST);
  }

  /** @param {string} petId */
  _ensure(petId) {
    if (!petId) return null;
    if (!this._pets[petId]) this._pets[petId] = { exp: 0, tier: 1 };
    return this._pets[petId];
  }
}

/** @param {number} exp @returns {1|2|3} */
export function tierFromExp(exp) {
  const n = Number(exp) || 0;
  if (n >= T2_COST + T3_COST) return 3;
  if (n >= T2_COST) return 2;
  return 1;
}

/** @param {number} value */
function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
