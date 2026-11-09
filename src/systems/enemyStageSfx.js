import { enemySkillStrips } from '../data/enemyShowcase.js';

/**
 * Stage skill casts for bosses that bring a packed skill strip.
 * Balun is `lava-balon`. Balam is `steel-balam`. A later stage that
 * reuses Balun (S5) uses that same id and these same per-skill cues.
 * There is no second Balun clip. Brute's ground smash stays on its
 * skill strip (`skill-ground_smash`); the feel booth already plays
 * that strip, and this caster does not add smash damage.
 * Casting does not change HP, gold, or position.
 */
export const STAGE_SKILL_CAST_IDS = Object.freeze(['lava-balon', 'steel-balam']);

/** Quiet after spawn so the first bite is not a skill. */
export const STAGE_SKILL_FIRST_MS = 2400;

/** Gap before the same body tries another strip. */
export const STAGE_SKILL_GAP_MS = 5200;

/** One skill voice at a time. */
export const STAGE_SKILL_SOUND_GAP_MS = 900;

/**
 * Catalog cue for a living body. False when that key is not in GAME_AUDIO.
 * @param {{ playEnemyCue?: (id: string, cue: string) => boolean }|null|undefined} audio
 * @param {{ alive?: boolean, skin?: { id?: string }|null }|null|undefined} zombie
 * @param {string} cue
 * @returns {boolean}
 */
export function playLivingEnemyCue(audio, zombie, cue) {
  if (!zombie?.alive || !zombie.skin?.id || !cue) return false;
  return !!audio?.playEnemyCue?.(zombie.skin.id, cue);
}

/**
 * @param {string|null|undefined} id
 * @returns {boolean}
 */
export function stageSkillCaster(id) {
  return !!id && STAGE_SKILL_CAST_IDS.includes(id);
}

/**
 * Next skill row for a living stage boss, or null when this id does not cast.
 * `due === null` arms the first cast and does not play. While another skill
 * voice is still inside the gap, the body waits until that gate opens.
 * @param {string|null|undefined} id
 * @param {number} cursor
 * @param {number} now
 * @param {number|null|undefined} due
 * @param {number} [soundGate]
 * @param {number} [phase]
 * @returns {{ wait: boolean, cursor: number, due: number, row: { anim: string, cue: string }|null, sound: boolean, soundGate: number }|null}
 */
export function stageSkillCast(id, cursor, now, due, soundGate = 0, phase = 0) {
  if (!stageSkillCaster(id)) return null;
  const list = enemySkillStrips(id).filter((row) => row?.anim && row?.cue);
  if (!list.length) return null;
  const at = Number.isFinite(due) ? due : null;
  const current = Number.isInteger(cursor) && cursor >= 0 ? cursor : 0;
  const slot = Math.abs(Math.floor(Number(phase) || 0)) % 4;
  if (at == null) {
    return {
      wait: true,
      cursor: current,
      due: now + STAGE_SKILL_FIRST_MS + slot * 350,
      row: null,
      sound: false,
      soundGate: Number.isFinite(soundGate) ? soundGate : 0,
    };
  }
  if (now < at) return null;
  const gate = Number.isFinite(soundGate) ? soundGate : 0;
  if (now < gate) {
    // A full gap, not the gate instant, so a pack does not chain every voice.
    return {
      wait: true,
      cursor: current,
      due: now + STAGE_SKILL_GAP_MS + slot * 350,
      row: null,
      sound: false,
      soundGate: gate,
    };
  }
  const row = list[current % list.length];
  return {
    wait: false,
    cursor: current + 1,
    due: now + STAGE_SKILL_GAP_MS,
    row,
    sound: true,
    soundGate: now + STAGE_SKILL_SOUND_GAP_MS,
  };
}

/**
 * One stage skill step. `state` is the scene's timer maps. Playing a strip
 * does not change HP, gold, or position; the caller owns those.
 * @param {{ due?: WeakMap<object, number>, cursor?: WeakMap<object, number>, soundGate?: number }|null|undefined} state
 * @param {{ alive?: boolean, id?: number, skin?: { id?: string }|null, holdSkillStrip?: (key: string|null) => void, playShowcaseStrip?: (key: string) => boolean }|null|undefined} zombie
 * @param {number} now
 * @param {{ playEnemyCue?: (id: string, cue: string) => boolean }|null|undefined} audio
 */
export function tickStageSkill(state, zombie, now, audio) {
  const dueMap = state?.due instanceof WeakMap ? state.due : new WeakMap();
  const cursorMap = state?.cursor instanceof WeakMap ? state.cursor : new WeakMap();
  const soundGate = Number.isFinite(state?.soundGate) ? state.soundGate : 0;
  /** @type {{ due: WeakMap<object, number>, cursor: WeakMap<object, number>, soundGate: number }} */
  const next = { due: dueMap, cursor: cursorMap, soundGate };
  if (!zombie?.alive || !zombie.skin?.id) return next;
  const due = dueMap.has(zombie) ? dueMap.get(zombie) : null;
  const decision = stageSkillCast(
    zombie.skin.id,
    cursorMap.get(zombie) || 0,
    now,
    due,
    soundGate,
    zombie.id || 0,
  );
  if (!decision) return next;
  cursorMap.set(zombie, decision.cursor);
  dueMap.set(zombie, decision.due);
  if (decision.wait || !decision.row) return next;
  if (decision.sound) next.soundGate = decision.soundGate;
  zombie.holdSkillStrip?.(decision.row.anim);
  const played = zombie.playShowcaseStrip?.(decision.row.anim);
  if (!played) zombie.holdSkillStrip?.(null);
  if (decision.sound && decision.row.cue) playLivingEnemyCue(audio, zombie, decision.row.cue);
  return next;
}
