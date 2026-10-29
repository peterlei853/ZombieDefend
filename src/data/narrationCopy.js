/**
 * Locked player-facing lines (Traditional Chinese).
 * Toasts read these strings. Combat tables, gold, and barricade HP do not.
 *
 * The outpost name is copy-only. No toast speaks it: nothing on screen
 * names the base, and the hero stays unnamed.
 */
import { petSelectById } from './petSelectRoster.js';

export const NARRATION = {
  /** Title, once per page load. */
  disaster: '城市被『未完成的加班契約』拖進長夜。',
  /** Soft base name. Not spoken. Do not invent a hero name beside it. */
  baseName: '東側街口據點',
  /** Stage create. */
  stageOpen: '從左邊來了……別讓它們碰到牆。',
  /** First successful GO! this stage. */
  go: '上！',
  /** Each Back! */
  back: '回來。',
  /** Clear, before the shop. */
  tide: '潮退了。先換彈。',
  /** Barricade red-fill cut. Once, and not on the killing blow. */
  wall: '牆撐不住了！',
  /** Game-over card. */
  gameOver: '圍棚破了。',
  /** Title after a stage-3 clear returns home. */
  nightClose: '今晚先到這。',
  /** Stage 3 clear only. Same toast as the tide line. */
  rumble: '圍棚另一側傳來轟鳴……',
  /** Wave 3 start. Any stage that reaches wave 3. */
  wave3: '第 3 波警報',
  /** Once, on the first wave ≥ 3 whose pool includes the nurse. */
  nurse: '護士也混進來了……',
};

/**
 * Matches `hpFillKey('barricade')`: ratio ≤ 0.25 is the red / low fill.
 * That is the wall's existing danger cut (~20%).
 */
export const WALL_DANGER_RATIO = 0.25;

/** Catalog skin id. Not a new spawn. */
export const NURSE_SKIN = 'nurse';

/** Nurse line waits until this wave even if an earlier pool already lists her. */
export const NURSE_MIN_WAVE = 3;

/** Registry flag. Title sets it the first time the disaster line is shown. */
export const DISASTER_SEEN_KEY = 'narrationDisasterSeen';

/**
 * PetSelect confirm. Names come from the roster (`labelZh`).
 * No catchphrase. Unknown ids say nothing.
 * @param {unknown} petId
 * @returns {string|null}
 */
export function departLine(petId) {
  const name = petSelectById(petId)?.labelZh;
  if (!name) return null;
  return `走吧，${name}。`;
}

/**
 * Chinese line under the existing WAVE banner.
 * Wave 3 uses the locked alarm. Other waves keep the short count.
 * @param {number} wave
 * @returns {string}
 */
export function waveCallout(wave) {
  const n = Math.floor(Number(wave));
  if (n === 3) return NARRATION.wave3;
  if (n >= 1) return `第${n}波`;
  return '';
}

/**
 * First wave at or after `minWave` whose archetype skins include the nurse.
 * Earlier waves that already list her are skipped (prefer wave 3+).
 * @param {Array<{ wave?: number, archetypes?: Array<{ skins?: string[] }> }>|null|undefined} waveDefs
 * @param {number} [minWave]
 * @returns {number|null}
 */
export function nurseWaveFromDefs(waveDefs, minWave = NURSE_MIN_WAVE) {
  if (!Array.isArray(waveDefs)) return null;
  const floor = Math.floor(Number(minWave) || NURSE_MIN_WAVE);
  for (const def of waveDefs) {
    const wave = Math.floor(Number(def?.wave));
    if (!(wave >= floor)) continue;
    const arches = def?.archetypes || [];
    for (const arch of arches) {
      const skins = arch?.skins;
      if (Array.isArray(skins) && skins.includes(NURSE_SKIN)) return wave;
    }
  }
  return null;
}

/**
 * True when the wall is hurt but still standing, at or under the danger cut.
 * A killing blow (hp ≤ 0) is the game-over line, not this one.
 * @param {number} hp
 * @param {number} maxHp
 * @param {number} [ratio]
 * @returns {boolean}
 */
export function wallInDanger(hp, maxHp, ratio = WALL_DANGER_RATIO) {
  if (!(maxHp > 0) || !(hp > 0)) return false;
  const cut = Number(ratio);
  if (!(cut > 0)) return false;
  return hp / maxHp <= cut;
}
