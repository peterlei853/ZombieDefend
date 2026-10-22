import { GAME_CONFIG } from './GameConfig.js';

/**
 * Opening player hit. One crit roll, shared with the existing `crit` flag
 * on takeDamage (die-critical-hit). Crit damage is +CRIT_DAMAGE of the hit:
 * a crit deals round(hit * (1 + CRIT_DAMAGE)). 80% of a 10 attack hit is 18.
 * @param {number} amount landed damage before the roll
 * @param {() => number} [rng]
 * @param {{ critChance?: number, critDamage?: number }|null} [stats]
 * @returns {{ amount: number, crit: boolean }}
 */
export function applyPlayerCrit(amount, rng = Math.random, stats = null) {
  const base = Number(amount);
  if (!(base > 0) || !Number.isFinite(base)) return { amount: 0, crit: false };
  const table = stats || playerCombatStats();
  const chance = Number(table.critChance);
  const bonus = Number(table.critDamage);
  const crit = chance > 0 && rng() < chance;
  if (!crit) return { amount: Math.max(1, Math.round(base)), crit: false };
  const mult = 1 + (Number.isFinite(bonus) ? bonus : 0);
  return { amount: Math.max(1, Math.round(base * mult)), crit: true };
}

/** Live opening row. Shop ranks scale ATTACK before this roll. */
export function playerCombatStats() {
  const player = GAME_CONFIG.PLAYER;
  return {
    attack: player.ATTACK,
    critChance: player.CRIT_CHANCE,
    critDamage: player.CRIT_DAMAGE,
  };
}

/**
 * Stage HUD line so a clear can confirm the opening crit gate.
 * @param {{ attack?: number, critChance?: number, critDamage?: number }} [stats]
 */
export function playerCombatHudLabel(stats = playerCombatStats()) {
  const atk = Math.round(Number(stats?.attack) || 0);
  const chance = Math.round((Number(stats?.critChance) || 0) * 100);
  const bonus = Math.round((Number(stats?.critDamage) || 0) * 100);
  return `ATK ${atk}  CRIT ${chance}%  CRITDMG +${bonus}%`;
}
