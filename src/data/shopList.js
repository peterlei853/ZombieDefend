/**
 * Post-clear shopping list (v0.28).
 *
 * Prices are not part of the zombie gold table. Gold leaves the purse only
 * through the `spendGold` callback (SaveManager.spendGold when that object
 * is on the registry, otherwise the run purse). This module does not touch
 * localStorage or the account schema.
 */
import { OWNED_WEAPON_ORDER, WEAPON_TRAITS } from '../assets/heroDeploy.js';

export const SHOP_WEAPON_COST = 40;
export const SHOP_UPGRADE_COST = 25;

/** Each owned-weapon rank adds this fraction of the base hit. Rank 0 is 1×. */
export const UPGRADE_DAMAGE_STEP = 0.2;

/**
 * @typedef {{ id: string, label: string, icon: string }} ShopOffer
 */

/** @type {ShopOffer[]} */
export const SHOP_OFFERS = OWNED_WEAPON_ORDER.map((id) => ({
  id,
  label: WEAPON_TRAITS[id]?.label || id,
  icon: `icon-${id}`,
}));

/**
 * @param {number} base
 * @param {number} level
 * @returns {number}
 */
export function upgradedDamage(base, level) {
  const n = Number(base);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const lv = Math.max(0, Math.floor(Number(level) || 0));
  return Math.max(1, Math.round(n * (1 + UPGRADE_DAMAGE_STEP * lv)));
}

/**
 * @param {{ ownedWeapons?: string[], upgrades?: Record<string, number>, gold?: number }} state
 * @param {'buy'|'upgrade'} kind
 * @param {string} id
 * @param {(cost: number) => { ok: boolean, reason?: string, gold?: number }} spendGold
 */
export function tryShopAction(state, kind, id, spendGold) {
  const owned = Array.isArray(state?.ownedWeapons) ? state.ownedWeapons.slice() : [];
  const upgrades = { ...(state?.upgrades || {}) };
  const gold = Number.isFinite(state?.gold) ? state.gold : 0;
  if (!id || !OWNED_WEAPON_ORDER.includes(id)) {
    return { ok: false, reason: 'missing', gold, ownedWeapons: owned, upgrades };
  }
  if (kind === 'buy') {
    if (owned.includes(id)) {
      return { ok: false, reason: 'owned', gold, ownedWeapons: owned, upgrades };
    }
    const spent = spendGold(SHOP_WEAPON_COST);
    if (!spent?.ok) {
      return { ok: false, reason: spent?.reason || 'gold', gold: spent?.gold ?? gold, ownedWeapons: owned, upgrades };
    }
    owned.push(id);
    return {
      ok: true,
      gold: spent.gold,
      ownedWeapons: owned,
      upgrades,
      purchase: `weapon:${id}`,
    };
  }
  if (kind === 'upgrade') {
    if (!owned.includes(id)) {
      return { ok: false, reason: 'unowned', gold, ownedWeapons: owned, upgrades };
    }
    const spent = spendGold(SHOP_UPGRADE_COST);
    if (!spent?.ok) {
      return { ok: false, reason: spent?.reason || 'gold', gold: spent?.gold ?? gold, ownedWeapons: owned, upgrades };
    }
    const level = (upgrades[id] || 0) + 1;
    upgrades[id] = level;
    return {
      ok: true,
      gold: spent.gold,
      ownedWeapons: owned,
      upgrades,
      level,
      purchase: `upgrade:${id}:${level}`,
    };
  }
  return { ok: false, reason: 'missing', gold, ownedWeapons: owned, upgrades };
}
