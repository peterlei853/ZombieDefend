/**
 * Stages 1–5 combat rows (v0.36.31).
 *
 * Barricade max HP is not in this file (1440 lives in waves.js).
 * getGoldByHP is unchanged. Gold on a row is explicit.
 *
 * v0.36.30 multiplied stages 1–3: archetype hp ×1.4, wave total ×1.35,
 * gold ×1.4, half-up. Speed, DPS, and those windows stay.
 *
 * v0.36.31 adds stage 4 by applying that same ×1.4 / ×1.35 / ×1.4 step
 * to the stage 3 rows, then +2 speed and a small DPS bump so the clear
 * is tighter than stage 3. Stage 5 is Balun: one boss at 20× the stage 4
 * wave-4 walker HP and 3× that walker's contact DPS, plus thin escorts.
 * After 90s, leftover bites do not damage the wall.
 */
import { EARLY_STAGE_POOLS, STAGE_5_ESCORTS } from './stageRoster.js';

/** Stage 4 wave 4 walker. Balun's HP and contact DPS are scaled from this. */
export const STAGE5_BOSS_BASELINE = Object.freeze({ hp: 235, dps: 14 });
export const STAGE5_BOSS_HP_MULT = 20;
export const STAGE5_BOSS_DPS_MULT = 3;
export const STAGE5_BOSS_ID = 'lava-balon';
export const STAGE5_BOSS_HP = STAGE5_BOSS_BASELINE.hp * STAGE5_BOSS_HP_MULT;
export const STAGE5_BOSS_DPS = STAGE5_BOSS_BASELINE.dps * STAGE5_BOSS_DPS_MULT;

/** @typedef {{ hp: number, speed: number, dps: number, weight?: number, variant?: string, skins: string[], gold: number }} EarlyArch */
/** @typedef {{ wave: number, startSec: number, endSec: number, total: number, archetypes: EarlyArch[] }} EarlyWave */

const S1 = EARLY_STAGE_POOLS[1];
const S2 = EARLY_STAGE_POOLS[2];
const S3 = EARLY_STAGE_POOLS[3];
const S4 = EARLY_STAGE_POOLS[4];
const S5 = STAGE_5_ESCORTS;

/** @type {Record<number, EarlyWave[]>} */
export const EARLY_STAGE_WAVES = {
  1: [
    row(1, 0, 22, 5, 34, 26, 2, 11, weightPool(S1, ['office-worker-v2'])),
    row(2, 23, 44, 7, 50, 30, 3, 14, S1),
    row(3, 45, 64, 4, 42, 28, 2, 22, S1),
    row(4, 65, 80, 5, 50, 30, 3, 25, S1),
  ],
  2: [
    row(1, 0, 20, 7, 50, 32, 4, 14, weightPool(S2, ['delivery'])),
    row(2, 21, 42, 8, 78, 36, 6, 17, S2),
    row(3, 43, 64, 8, 101, 40, 7, 22, S2),
    row(4, 65, 90, 9, 123, 42, 8, 25, S2),
  ],
  3: [
    row(1, 0, 20, 8, 67, 34, 5, 17, S3),
    row(2, 21, 42, 9, 101, 38, 7, 22, S3),
    row(3, 43, 64, 9, 134, 42, 9, 28, weightPool(S3, ['nurse'])),
    row(4, 65, 90, 11, 168, 40, 11, 34, S3),
  ],
  4: [
    row(1, 0, 20, 11, 94, 36, 7, 24, S4),
    row(2, 21, 42, 12, 141, 40, 9, 31, S4),
    row(3, 43, 64, 12, 188, 44, 12, 39, S4),
    row(4, 65, 90, 15, STAGE5_BOSS_BASELINE.hp, 42, STAGE5_BOSS_BASELINE.dps, 48, S4),
  ],
  5: [
    row(1, 0, 16, 3, 94, 36, 7, 24, S5),
    bossRow(2, 17, 55, 28),
    row(3, 40, 62, 3, 141, 40, 9, 31, S5),
    row(4, 63, 88, 2, 188, 42, 12, 39, S5),
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
/**
 * Pool plus extra copies so a profession still shows up inside a long mix.
 * @param {string[]} pool
 * @param {string[]} extra
 */
function weightPool(pool, extra) {
  return pool.concat(extra);
}

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
 * One Balun. HP is 20× the stage 4 wave-4 walker. Contact DPS is 3×.
 * Gold stays on the getGoldByHP ceiling (50) instead of a new band.
 * @param {number} wave
 * @param {number} startSec
 * @param {number} endSec
 * @param {number} speed
 */
function bossRow(wave, startSec, endSec, speed) {
  return {
    wave,
    startSec,
    endSec,
    total: 1,
    archetypes: [
      {
        hp: STAGE5_BOSS_HP,
        speed,
        dps: STAGE5_BOSS_DPS,
        weight: 1,
        variant: 'walker',
        skins: [STAGE5_BOSS_ID],
        gold: 50,
        boss: true,
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
