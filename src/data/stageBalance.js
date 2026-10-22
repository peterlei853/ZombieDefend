/**
 * Stages 1–3 combat rows for the 3-loop test (v0.36.27).
 *
 * Stage 4+ keeps WAVE_DEFS. Barricade max HP is not in this file.
 * Pools are data: append a catalog id when a new early-stage monster
 * is wired. Do not treat today's four professions as a permanent lock.
 *
 * Gold on a row overrides getGoldByHP for that spawn. The global table
 * still serves stage 4+.
 *
 * Opening player attack is 10 (~14.7 DPS if they tap L1 on the 680ms
 * water cadence) plus one pet normal attack (~14 DPS). Stage 1 waves
 * 3–4 are a short late pack: 3 then 4 bodies, and the last spawn is at
 * 80s so the pack can die before the clock. Stage 2 wants the pet.
 * Stage 3 is the tight clear. After 90s, leftover bites do not damage
 * the wall.
 */

/** @typedef {{ hp: number, speed: number, dps: number, weight?: number, variant?: string, skins: string[], gold: number }} EarlyArch */
/** @typedef {{ wave: number, startSec: number, endSec: number, total: number, archetypes: EarlyArch[] }} EarlyWave */

/** @type {Record<number, EarlyWave[]>} */
export const EARLY_STAGE_WAVES = {
  1: [
    row(1, 0, 22, 4, 24, 26, 2, 8, ['office-worker-v2', 'office-worker-v2', 'delivery', 'chef']),
    row(2, 23, 44, 5, 36, 30, 3, 10, ['office-worker-v2', 'delivery', 'chef']),
    row(3, 45, 64, 3, 30, 28, 2, 16, ['office-worker-v2', 'delivery', 'chef']),
    row(4, 65, 80, 4, 36, 30, 3, 18, ['office-worker-v2', 'delivery', 'chef']),
  ],
  2: [
    row(1, 0, 20, 5, 36, 32, 4, 10, ['office-worker-v2', 'delivery', 'delivery', 'chef']),
    row(2, 21, 42, 6, 56, 36, 6, 12, ['office-worker-v2', 'delivery', 'chef']),
    row(3, 43, 64, 6, 72, 40, 7, 16, ['delivery', 'chef', 'chef']),
    row(4, 65, 90, 7, 88, 42, 8, 18, ['office-worker-v2', 'delivery', 'chef']),
  ],
  3: [
    row(1, 0, 20, 6, 48, 34, 5, 12, ['office-worker-v2', 'delivery', 'chef', 'nurse']),
    row(2, 21, 42, 7, 72, 38, 7, 16, ['office-worker-v2', 'delivery', 'chef', 'nurse']),
    row(3, 43, 64, 7, 96, 42, 9, 20, ['delivery', 'chef', 'nurse', 'nurse']),
    row(4, 65, 90, 8, 120, 40, 11, 24, ['office-worker-v2', 'delivery', 'chef', 'nurse']),
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
