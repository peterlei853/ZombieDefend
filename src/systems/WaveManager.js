import { WAVE_DEFS, STAGE_DURATION } from '../data/waves.js';

/**
 * Spreads spawn events across each wave window and tracks remaining-to-spawn.
 * StageScene owns living zombies; WaveManager only schedules spawn intents.
 */
export class WaveManager {
  /**
   * @param {object} [opts]
   * @param {typeof WAVE_DEFS} [opts.waveDefs]
   * @param {number} [opts.duration]
   */
  constructor(opts = {}) {
    this.waveDefs = opts.waveDefs || WAVE_DEFS;
    this.duration = opts.duration ?? STAGE_DURATION;
    this.elapsed = 0;
    this.finished = false;
    /** @type {{ time: number, archetype: object, wave: number }[]} */
    this.queue = [];
    this.spawnedCount = 0;
    this.totalPlanned = 0;
    this._buildQueue();
  }

  _buildQueue() {
    this.queue = [];
    for (const def of this.waveDefs) {
      const span = Math.max(0.05, def.endSec - def.startSec);
      for (let i = 0; i < def.total; i++) {
        // Spread evenly; slight jitter so packs aren't perfectly synced
        const t = def.startSec + ((i + 0.5) / def.total) * span;
        const jitter = (Math.random() - 0.5) * (span / def.total) * 0.6;
        const time = Math.min(def.endSec - 0.01, Math.max(def.startSec, t + jitter));
        this.queue.push({
          time,
          wave: def.wave,
          archetype: this._pickArchetype(def.archetypes),
        });
      }
    }
    this.queue.sort((a, b) => a.time - b.time);
    this.totalPlanned = this.queue.length;
  }

  _pickArchetype(archetypes) {
    if (!archetypes || archetypes.length === 0) {
      return { hp: 40, speed: 40, dps: 12 };
    }
    const totalWeight = archetypes.reduce((s, a) => s + (a.weight || 1), 0);
    let roll = Math.random() * totalWeight;
    for (const a of archetypes) {
      roll -= a.weight || 1;
      if (roll <= 0) return { ...a };
    }
    return { ...archetypes[archetypes.length - 1] };
  }

  /**
   * Advance timer; return spawn intents whose time has elapsed.
   * @param {number} deltaSec
   * @returns {{ time: number, archetype: object, wave: number }[]}
   */
  update(deltaSec) {
    if (this.finished) return [];
    this.elapsed += deltaSec;
    const due = [];
    while (this.queue.length > 0 && this.queue[0].time <= this.elapsed) {
      due.push(this.queue.shift());
      this.spawnedCount += 1;
    }
    if (this.elapsed >= this.duration && this.queue.length === 0) {
      this.finished = true;
    }
    return due;
  }

  getCurrentWave() {
    const t = this.elapsed;
    let current = 1;
    for (const def of this.waveDefs) {
      if (t >= def.startSec) current = def.wave;
    }
    return current;
  }

  getRemainingToSpawn() {
    return this.queue.length;
  }

  getElapsed() {
    return this.elapsed;
  }

  isTimeUp() {
    return this.elapsed >= this.duration;
  }

  reset() {
    this.elapsed = 0;
    this.finished = false;
    this.spawnedCount = 0;
    this._buildQueue();
  }
}
