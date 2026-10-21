import {
  VOCAL_GROWL_INTERVAL_MS,
  professionVocalSlug,
} from '../data/vocalSfx.js';

/** Spread the first growl so a pack does not shout on the same frame. */
const VOCAL_GROWL_STAGGER_MS = 400;
const VOCAL_GROWL_STAGGER_SLOTS = 5;

/**
 * One growl per living zombie about every 10 seconds.
 * The first window starts 10s after that body appears, so boot is quiet.
 * Death cries are played from Zombie.takeDamage, not here.
 */
export class VocalAmbience {
  constructor() {
    /** @type {Map<object, number>} */
    this._nextAt = new Map();
  }

  /**
   * @param {{ audio?: { playProfessionGrowl?: (slug: string) => void } }|null|undefined} scene
   * @param {Array<{ alive?: boolean, skin?: { id?: string }|null }>|null|undefined} zombies
   * @param {number} nowMs
   */
  update(scene, zombies, nowMs) {
    const now = Number.isFinite(nowMs) ? nowMs : 0;
    /** @type {Set<object>} */
    const living = new Set();
    let index = 0;
    for (const zombie of zombies || []) {
      if (!zombie?.alive) continue;
      const slug = professionVocalSlug(zombie.skin?.id);
      if (!slug) continue;
      living.add(zombie);
      const phase = (index % VOCAL_GROWL_STAGGER_SLOTS) * VOCAL_GROWL_STAGGER_MS;
      index += 1;
      if (!this._nextAt.has(zombie)) {
        this._nextAt.set(zombie, now + VOCAL_GROWL_INTERVAL_MS + phase);
        continue;
      }
      const due = this._nextAt.get(zombie) ?? 0;
      if (now < due) continue;
      scene?.audio?.playProfessionGrowl?.(slug);
      this._nextAt.set(zombie, now + VOCAL_GROWL_INTERVAL_MS);
    }
    for (const zombie of this._nextAt.keys()) {
      if (!living.has(zombie)) this._nextAt.delete(zombie);
    }
  }
}
