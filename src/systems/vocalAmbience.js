import {
  VOCAL_GROWL_INTERVAL_MS,
  professionVocalSlug,
} from '../data/vocalSfx.js';

/**
 * One growl per living profession every 10 seconds.
 * The first window starts 10s after that profession appears, so boot is quiet.
 * Death cries are played from Zombie.takeDamage, not here.
 */
export class VocalAmbience {
  constructor() {
    /** @type {Map<string, number>} */
    this._nextAt = new Map();
  }

  /**
   * @param {{ audio?: { playProfessionGrowl?: (slug: string) => void } }|null|undefined} scene
   * @param {Array<{ alive?: boolean, skin?: { id?: string }|null }>|null|undefined} zombies
   * @param {number} nowMs
   */
  update(scene, zombies, nowMs) {
    const now = Number.isFinite(nowMs) ? nowMs : 0;
    /** @type {Set<string>} */
    const living = new Set();
    for (const zombie of zombies || []) {
      if (!zombie?.alive) continue;
      const slug = professionVocalSlug(zombie.skin?.id);
      if (slug) living.add(slug);
    }
    for (const slug of living) {
      if (!this._nextAt.has(slug)) {
        this._nextAt.set(slug, now + VOCAL_GROWL_INTERVAL_MS);
        continue;
      }
      const due = this._nextAt.get(slug) ?? 0;
      if (now < due) continue;
      scene?.audio?.playProfessionGrowl?.(slug);
      this._nextAt.set(slug, now + VOCAL_GROWL_INTERVAL_MS);
    }
  }
}
