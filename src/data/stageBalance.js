/**
 * Stages 1–3 combat rows for the 3-loop test (v0.36.30).
 *
 * Stage 4+ keeps WAVE_DEFS. Barricade max HP is not in this file
 * (1440 lives in waves.js). Pools are data: append a catalog id when a
 * new early-stage monster is wired.
 *
 * v0.36.30 multiplies every archetype hp by 1.4 and every wave total by
 * 1.35, both rounded half-up. Speed, DPS, and the time windows stay.
 * Gold on a row overrides getGoldByHP and is the previous payout × 1.4
 * (half-up) so gold-per-HP does not fall. The global table still serves
 * stage 4+.
 *
 * Each wave's skins list keeps the profession mix and appends
 * s4-construction and s4-schoolgirl so those two actually spawn.
 *
 * Opening player attack is 10 plus one pet normal attack. Stage 1's
 * last spawn is still at 80s. Stage 3 stays the tight clear. After 90s,
 * leftover bites do not damage the wall.
 */

/** @typedef {{ hp: number, speed: number, dps: number, weight?: number, variant?: string, skins: string[], gold: number }} EarlyArch */
/** @typedef {{ wave: number, startSec: number, endSec: number, total: number, archetypes: EarlyArch[] }} EarlyWave */

const S4_SKINS = ['s4-construction', 's4-schoolgirl'];

/** @type {Record<number, EarlyWave[]>} */
export const EARLY_STAGE_WAVES = {
  1: [
    row(1, 0, 22, 5, 34, 26, 2, 11, ['office-worker-v2', 'office-worker-v2', 'delivery', 'chef', ...S4_SKINS]),
    row(2, 23, 44, 7, 50, 30, 3, 14, ['office-worker-v2', 'delivery', 'chef', ...S4_SKINS]),
    row(3, 45, 64, 4, 42, 28, 2, 22, ['office-worker-v2', 'delivery', 'chef', ...S4_SKINS]),
    row(4, 65, 80, 5, 50, 30, 3, 25, ['office-worker-v2', 'delivery', 'chef', ...S4_SKINS]),
  ],
  2: [
    row(1, 0, 20, 7, 50, 32, 4, 14, ['office-worker-v2', 'delivery', 'delivery', 'chef', ...S4_SKINS]),
    row(2, 21, 42, 8, 78, 36, 6, 17, ['office-worker-v2', 'delivery', 'chef', ...S4_SKINS]),
    row(3, 43, 64, 8, 101, 40, 7, 22, ['delivery', 'chef', 'chef', ...S4_SKINS]),
    row(4, 65, 90, 9, 123, 42, 8, 25, ['office-worker-v2', 'delivery', 'chef', ...S4_SKINS]),
  ],
  3: [
    row(1, 0, 20, 8, 67, 34, 5, 17, ['office-worker-v2', 'delivery', 'chef', 'nurse', ...S4_SKINS]),
    row(2, 21, 42, 9, 101, 38, 7, 22, ['office-worker-v2', 'delivery', 'chef', 'nurse', ...S4_SKINS]),
    row(3, 43, 64, 9, 134, 42, 9, 28, ['delivery', 'chef', 'nurse', 'nurse', ...S4_SKINS]),
    row(4, 65, 90, 11, 168, 40, 11, 34, ['office-worker-v2', 'delivery', 'chef', 'nurse', ...S4_SKINS]),
  ],
};

/**
 * @param {number} wave
 * @param {number} startSec
 * @param {number} endSec
 * @param {number} total
 * @param {number} hp
 * @param {number} speed
 * @param {number} dps
 * @param {number} gold
 * @param {string[]} skins
 * @returns {EarlyWave}
 */
function row(wave, startSec, endSec, total, hp, speed, dps, gold, skins) {
  return {
    wave,
    startSec,
    endSec,
    total,
    archetypes: [
      {
        hp,
        speed,
        dps,
        weight: 1,
        variant: 'walker',
        skins: skins.slice(),
        gold,
      },
    ],
  };
}

/**
 * Deep copy so a spawn cannot edit the table.
 * @param {number} stage
 * @returns {EarlyWave[]}
 */
export function earlyWaveDefs(stage) {
  const table = EARLY_STAGE_WAVES[stage];
  if (!table) return [];
  return table.map((def) => ({
    wave: def.wave,
    startSec: def.startSec,
    endSec: def.endSec,
    total: def.total,
    archetypes: def.archetypes.map((arch) => ({
      ...arch,
      skins: arch.skins.slice(),
    })),
  }));
}

/**
 * One line per wave for the balance note. Counts are exact.
 * @param {number} stage
 */
export function stageBalanceRows(stage) {
  return (EARLY_STAGE_WAVES[stage] || []).map((def) => {
    const arch = def.archetypes[0];
    return {
      stage,
      wave: def.wave,
      window: `${def.startSec}–${def.endSec}s`,
      count: def.total,
      hp: arch.hp,
      speed: arch.speed,
      dps: arch.dps,
      gold: arch.gold,
      skins: arch.skins.join(', '),
    };
  });
}
