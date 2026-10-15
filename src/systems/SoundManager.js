import { enemySfxClips, enemySfxKey } from '../data/enemyShowcase.js';

/**
 * BGM + SFX for ZombieDefend.
 * Phaser 3 `scene.sound` only — no second audio engine.
 *
 * Beds (`bgm-title`, `bgm-stage`, `bgm-shop`, `bgm-victory`) loop at 0.28.
 * Volumes match the v0.17.0 pack. Cooldowns keep auto-fire, multi-pellet
 * hits, and barricade bites from stacking into noise. Shotgun callers must
 * invoke `playWeaponShot` once per volley (WeaponSystem already returns one
 * fire per fan, not per pellet).
 *
 * Overnight ult / exp / melee clips are preloaded and exposed as play
 * helpers. Combat call sites stay with the gameplay pass; nothing here
 * starts an ultimate, drops an orb, or changes pet logic.
 */

/** @typedef {'handgun'|'shotgun'} WeaponProfile */

export const AUDIO_VOLUME = {
  bgm: 0.28,
  fire: 0.35,
  hit: 0.3,
  hurt: 0.3,
  death: 0.3,
  barricade: 0.25,
  coin: 0.3,
  ui: 0.4,
  gameOver: 0.45,
  /** Ultimate cutscene sting. */
  ult: 0.4,
  /** Pet melee, knockback, exp orbs, and evolution. */
  melee: 0.35,
  knockback: 0.35,
  expOrb: 0.35,
  evolve: 0.35,
  /** Range tell. Quieter than the hit it leads. */
  telegraph: 0.25,
};

/** Minimum gap between repeats of the same cue. Hit/hurt cap at ~8/sec. */
export const AUDIO_COOLDOWN_MS = {
  fire: 120,
  hit: 125,
  hurt: 125,
  death: 180,
  barricade: 400,
  coin: 180,
};

export const BGM_KEY = 'bgm-stage';
export const BGM_TITLE_KEY = 'bgm-title';
export const BGM_SHOP_KEY = 'bgm-shop';
export const BGM_VICTORY_KEY = 'bgm-victory';
export const BGM_FADE_MS = 700;

/** Keys match `assets/audio/<key>.mp3`. */
export const GAME_AUDIO = [
  { key: 'bgm-title', url: 'assets/audio/bgm-title.mp3' },
  { key: 'bgm-stage', url: 'assets/audio/bgm-stage.mp3' },
  { key: 'bgm-shop', url: 'assets/audio/bgm-shop.mp3' },
  { key: 'bgm-victory', url: 'assets/audio/bgm-victory.mp3' },
  { key: 'shoot-sling', url: 'assets/audio/shoot-sling.mp3' },
  { key: 'shoot-bubble', url: 'assets/audio/shoot-bubble.mp3' },
  { key: 'shoot-lightning', url: 'assets/audio/shoot-lightning.mp3' },
  { key: 'shoot-flame', url: 'assets/audio/shoot-flame.mp3' },
  { key: 'shoot-water', url: 'assets/audio/shoot-water.mp3' },
  { key: 'shoot-frost', url: 'assets/audio/shoot-frost.mp3' },
  { key: 'shoot-handgun', url: 'assets/audio/shoot-handgun.mp3' },
  { key: 'shoot-shotgun', url: 'assets/audio/shoot-shotgun.mp3' },
  { key: 'hit-impact', url: 'assets/audio/hit-impact.mp3' },
  { key: 'sfx-slash-ninja', url: 'assets/audio/sfx-slash-ninja.mp3' },
  // DoT / AoE tick scratches that pair with fx-slash-dot. Default equals take A.
  // Catalog only — gameplay wires playback later. Callers set volume (under melee).
  { key: 'sfx-slash-dot', url: 'assets/audio/sfx-slash-dot.mp3' },
  { key: 'sfx-slash-dot-a', url: 'assets/audio/sfx-slash-dot-a.mp3' },
  { key: 'sfx-slash-dot-b', url: 'assets/audio/sfx-slash-dot-b.mp3' },
  { key: 'zombie-hurt', url: 'assets/audio/zombie-hurt.mp3' },
  { key: 'zombie-death', url: 'assets/audio/zombie-death.mp3' },
  { key: 'barricade-hit', url: 'assets/audio/barricade-hit.mp3' },
  { key: 'coin-pickup', url: 'assets/audio/coin-pickup.mp3' },
  { key: 'weapon-swap', url: 'assets/audio/weapon-swap.mp3' },
  { key: 'ui-click', url: 'assets/audio/ui-click.mp3' },
  { key: 'game-over', url: 'assets/audio/game-over.mp3' },
  { key: 'ult-phoenix', url: 'assets/audio/ult-phoenix.mp3' },
  { key: 'ult-panda', url: 'assets/audio/ult-panda.mp3' },
  { key: 'ult-lion', url: 'assets/audio/ult-lion.mp3' },
  { key: 'ult-dragon', url: 'assets/audio/ult-dragon.mp3' },
  { key: 'pet-melee-hit', url: 'assets/audio/pet-melee-hit.mp3' },
  { key: 'pet-knockback', url: 'assets/audio/pet-knockback.mp3' },
  { key: 'exp-orb-drop', url: 'assets/audio/exp-orb-drop.mp3' },
  { key: 'exp-orb-pickup', url: 'assets/audio/exp-orb-pickup.mp3' },
  { key: 'pet-evolve', url: 'assets/audio/pet-evolve.mp3' },
  { key: 'skill-telegraph', url: 'assets/audio/skill-telegraph.mp3' },
];

const AUDIO_KEYS = new Set(GAME_AUDIO.map((clip) => clip.key));

/**
 * Volume for a showcase cue. Uses the existing table. Hit / hurt / die
 * match those rows. Skills use the melee row. Enrage uses the ult row.
 * @param {string} cue
 */
function enemyCueVolume(cue) {
  if (cue === 'hit') return AUDIO_VOLUME.hit;
  if (cue === 'hurt') return AUDIO_VOLUME.hurt;
  if (cue === 'die') return AUDIO_VOLUME.death;
  if (cue === 'enrage') return AUDIO_VOLUME.ult;
  return AUDIO_VOLUME.melee;
}

/**
 * @param {string} cue
 */
function enemyCueCooldown(cue) {
  if (cue === 'hit') return AUDIO_COOLDOWN_MS.hit;
  if (cue === 'hurt') return AUDIO_COOLDOWN_MS.hurt;
  if (cue === 'die') return AUDIO_COOLDOWN_MS.death;
  return 0;
}

/**
 * Library skin id (`sling`, `bubble`, …) or the handgun/shotgun profile fallback.
 * @param {{ id?: string }|null|undefined} skin
 * @param {string} [profile]
 * @returns {string}
 */
export function weaponShotKey(skin, profile) {
  const id = skin?.id;
  if (id && AUDIO_KEYS.has(`shoot-${id}`)) return `shoot-${id}`;
  return profile === 'shotgun' ? 'shoot-shotgun' : 'shoot-handgun';
}

/**
 * Queue every clip that is not already in the audio cache.
 * Safe to call from Boot and again from Stage (retry / direct start).
 * @param {Phaser.Scene} scene
 */
export function preloadGameAudio(scene) {
  const loader = scene?.load;
  if (typeof loader?.audio !== 'function') return;
  const cache = scene.cache?.audio;
  const clips = GAME_AUDIO.concat(enemySfxClips());
  for (const clip of clips) {
    if (typeof cache?.exists === 'function' && cache.exists(clip.key)) continue;
    loader.audio(clip.key, clip.url);
  }
}

export class SoundManager {
  /**
   * @param {Phaser.Scene} scene
   */
  constructor(scene) {
    this.scene = scene;
    /** @type {Map<string, number>} */
    this._nextAt = new Map();
    /** @type {Map<string, number>} */
    this._pending = new Map();
    /** @type {Phaser.Sound.BaseSound|null} */
    this._bgm = null;
    /** @type {string|null} */
    this._bgmKey = null;
    this._bgmAllowed = false;
    /** @type {Function|null} */
    this._bgmUnlock = null;
    /** @type {Function|null} */
    this._unlockFlush = null;
    /** @type {Phaser.Sound.BaseSound|null} */
    this._fireVoice = null;
    /** @type {Phaser.Sound.BaseSound|null} */
    this._enemyVoice = null;
    this._fading = false;
    this._disposed = false;
  }

  /**
   * Looping bed. Replaces whatever bed is playing. No-op until the cache
   * has the clip. Waits out a locked context.
   * Title uses `bgm-title`. Shop uses `bgm-shop`. Stage uses `bgm-stage`.
   * Victory uses `bgm-victory`.
   * @param {string} [key]
   */
  startBgm(key = BGM_KEY) {
    if (this._disposed) return;
    if (this._bgmAllowed && this._bgmKey === key && this._bgm && !this._fading) return;
    this._bgmAllowed = true;
    this._bgmKey = key;
    const sound = this._sound();
    if (!sound || !this._cached(key)) return;
    const begin = () => {
      this._bgmUnlock = null;
      if (this._disposed || !this._bgmAllowed || this._bgmKey !== key) return;
      this._stopBgmNow();
      try {
        const bgm = sound.add(key, { loop: true, volume: AUDIO_VOLUME.bgm });
        bgm?.play?.();
        this._bgm = bgm || null;
        this._bgmKey = key;
      } catch (_) {
        this._bgm = null;
      }
    };
    if (sound.locked) {
      this._clearBgmUnlock();
      this._bgmUnlock = begin;
      sound.once?.('unlocked', this._bgmUnlock);
      return;
    }
    begin();
  }

  /** Looping stage bed. */
  startStageBgm() {
    this.startBgm(BGM_KEY);
  }

  /** Title / splash menu bed. */
  startTitleBgm() {
    this.startBgm(BGM_TITLE_KEY);
  }

  /** Shop bed. Char-select should call this too when that scene exists. */
  startShopBgm() {
    this.startBgm(BGM_SHOP_KEY);
  }

  /**
   * Duck the bed to silence. Cancels a pending unlock start so Game Over
   * cannot be followed by the loop fading in late.
   * @param {number} [durationMs]
   */
  fadeBgm(durationMs = BGM_FADE_MS) {
    this._bgmAllowed = false;
    this._bgmKey = null;
    this._clearBgmUnlock();
    const bgm = this._bgm;
    if (!bgm) return;
    if (bgm.isPlaying === false) {
      this._stopBgmNow();
      return;
    }
    if (this._fading) return;
    this._fading = true;
    const from = Number.isFinite(bgm.volume) ? bgm.volume : AUDIO_VOLUME.bgm;
    const duration = Math.max(1, durationMs);
    const start = Date.now();
    const step = () => {
      if (this._bgm !== bgm) return;
      const t = Math.min(1, (Date.now() - start) / duration);
      this._setVolume(bgm, from * (1 - t));
      if (t >= 1) {
        this._stopBgmNow();
        return;
      }
      const timer = this.scene?.time;
      if (typeof timer?.delayedCall === 'function') timer.delayedCall(40, step);
    };
    step();
  }

  /** Hard stop. Used on scene shutdown so Shop / retry do not keep the loop. */
  stopBgm() {
    this._bgmAllowed = false;
    this._bgmKey = null;
    this._clearBgmUnlock();
    this._stopBgmNow();
  }

  /**
   * One shot for the whole volley. `profile` is what WeaponSystem actually fired
   * (`handgun` or `shotgun`) when no library skin is loaded.
   * The previous fire voice is stopped so a 500ms cadence cannot layer 522ms clips.
   * @param {{ id?: string }|null|undefined} skin
   * @param {string} [profile]
   */
  playWeaponShot(skin, profile) {
    if (!this._passCooldown('weapon-fire', AUDIO_COOLDOWN_MS.fire)) return;
    this._stopFireVoice();
    const node = this._cue(weaponShotKey(skin, profile), AUDIO_VOLUME.fire);
    this._fireVoice = node;
  }

  playHitImpact() {
    this._cue('hit-impact', AUDIO_VOLUME.hit, AUDIO_COOLDOWN_MS.hit);
  }

  /**
   * Feel-booth melee slash. Crisp whoosh + cut at the melee volume.
   * Gameplay owns when booth key 4 calls this.
   */
  playFeelMeleeSlash() {
    this._cue('sfx-slash-ninja', AUDIO_VOLUME.melee, AUDIO_COOLDOWN_MS.hit);
  }

  playZombieHurt() {
    this._cue('zombie-hurt', AUDIO_VOLUME.hurt, AUDIO_COOLDOWN_MS.hurt);
  }

  playZombieDeath() {
    this._cue('zombie-death', AUDIO_VOLUME.death, AUDIO_COOLDOWN_MS.death);
  }

  /**
   * Per-enemy showcase cue. `cue` is `hit`, `hurt`, `die`, `enrage`, or
   * `skill-<name>`. Missing clips stay silent. Does not change BGM or
   * the shared volume table. Normal waves keep playZombieHurt / playZombieDeath.
   * @param {string} id
   * @param {string} cue
   */
  playEnemyCue(id, cue) {
    if (this._disposed || !id || !cue) return null;
    const key = enemySfxKey(id, cue);
    if (!this._passCooldown(key, enemyCueCooldown(cue))) return null;
    this._stopEnemyVoice();
    const node = this._playNowOrPending(key, enemyCueVolume(cue));
    if (node) this._enemyVoice = node;
    return node;
  }

  playBarricadeHit() {
    this._cue('barricade-hit', AUDIO_VOLUME.barricade, AUDIO_COOLDOWN_MS.barricade);
  }

  playCoin() {
    this._cue('coin-pickup', AUDIO_VOLUME.coin, AUDIO_COOLDOWN_MS.coin);
  }

  playWeaponSwap() {
    this._cue('weapon-swap', AUDIO_VOLUME.ui);
  }

  playUiClick() {
    this._cue('ui-click', AUDIO_VOLUME.ui);
  }

  /**
   * Portrait summon pop. No clip is packed yet — the scale punch carries it.
   * Drop `pet-summon` into the audio cache later and this starts playing.
   */
  playPetSummon() {
    this._cueOptional('pet-summon', AUDIO_VOLUME.ui);
  }

  /** Pet HP hit zero and the portrait went grey. */
  playPetDeath() {
    this._cueOptional('pet-death', AUDIO_VOLUME.death);
  }

  /** Revive cooldown finished; the portrait is summonable again. */
  playPetReviveReady() {
    this._cueOptional('pet-revive', AUDIO_VOLUME.ui);
  }

  /**
   * Ultimate cutscene sting. `role` is phoenix, panda, lion, or dragon.
   * A full `ult-*` key is accepted. Unknown roles stay silent.
   * @param {string|{ id?: string }|null|undefined} role
   */
  playUlt(role) {
    const raw = typeof role === 'string' ? role : role?.id;
    if (!raw) return;
    const id = raw.startsWith('ult-') ? raw.slice(4) : raw;
    const key = `ult-${id}`;
    if (!AUDIO_KEYS.has(key)) return;
    this._cue(key, AUDIO_VOLUME.ult);
  }

  playUltPhoenix() {
    this.playUlt('phoenix');
  }

  playUltPanda() {
    this.playUlt('panda');
  }

  playUltLion() {
    this.playUlt('lion');
  }

  playUltDragon() {
    this.playUlt('dragon');
  }

  playPetMeleeHit() {
    this._cue('pet-melee-hit', AUDIO_VOLUME.melee, AUDIO_COOLDOWN_MS.hit);
  }

  playPetKnockback() {
    this._cue('pet-knockback', AUDIO_VOLUME.knockback, AUDIO_COOLDOWN_MS.hit);
  }

  playExpOrbDrop() {
    this._cue('exp-orb-drop', AUDIO_VOLUME.expOrb, AUDIO_COOLDOWN_MS.coin);
  }

  playExpOrbPickup() {
    this._cue('exp-orb-pickup', AUDIO_VOLUME.expOrb, AUDIO_COOLDOWN_MS.coin);
  }

  playPetEvolve() {
    this._cue('pet-evolve', AUDIO_VOLUME.evolve);
  }

  playSkillTelegraph() {
    this._cue('skill-telegraph', AUDIO_VOLUME.telegraph);
  }

  /** Fail sting plus BGM fade. Combat tails are cut so they do not sit on the sting. */
  playGameOver() {
    this._stopFireVoice();
    this.fadeBgm();
    this._cue('game-over', AUDIO_VOLUME.gameOver);
  }

  /**
   * Stage clear. Stops the stage bed, then loops `bgm-victory` until the
   * scene shuts down (Shop starts its own bed after the clear hold).
   */
  playVictory() {
    this._stopFireVoice();
    this.stopBgm();
    this.startBgm(BGM_VICTORY_KEY);
  }

  /** Stop the bed and drop unlock hooks. One-shots already queued still flush. */
  dispose() {
    this._disposed = true;
    this.stopBgm();
    this._stopFireVoice();
    this._stopEnemyVoice();
  }

  /**
   * @param {string} key
   * @param {number} volume
   * @param {number} [cooldownMs]
   */
  _cue(key, volume, cooldownMs = 0) {
    if (this._disposed) return null;
    if (!this._passCooldown(key, cooldownMs)) return null;
    return this._playNowOrPending(key, volume);
  }

  /**
   * Play only when this key is actually cached. Missing pet cues stay silent.
   * `_cached` reports true when the scene has no audio cache API, so a key
   * that was never queued must not be sent to the mixer.
   * @param {string} key
   * @param {number} volume
   */
  _cueOptional(key, volume) {
    if (AUDIO_KEYS.has(key)) return this._cue(key, volume);
    const exists = this.scene?.cache?.audio?.exists;
    if (typeof exists !== 'function' || !exists.call(this.scene.cache.audio, key)) return null;
    return this._cue(key, volume);
  }

  /**
   * @param {string} key
   * @param {number} volume
   */
  _playNowOrPending(key, volume) {
    const sound = this._sound();
    if (!sound || !this._cached(key)) return null;
    if (sound.locked) {
      this._pending.set(key, volume);
      if (!this._unlockFlush) {
        this._unlockFlush = () => {
          this._unlockFlush = null;
          const queued = this._pending;
          this._pending = new Map();
          for (const [k, vol] of queued) this._emit(k, vol);
        };
        sound.once?.('unlocked', this._unlockFlush);
      }
      return null;
    }
    return this._emit(key, volume);
  }

  /**
   * @param {string} key
   * @param {number} volume
   */
  _emit(key, volume) {
    const sound = this._sound();
    if (!sound || !this._cached(key)) return null;
    try {
      if (typeof sound.add === 'function') {
        const node = sound.add(key, { volume, loop: false });
        if (!node) return null;
        node.once?.('complete', () => {
          if (this._fireVoice === node) this._fireVoice = null;
          try {
            node.destroy?.();
          } catch (_) {
            /* already destroyed */
          }
        });
        node.play?.();
        return node;
      }
      sound.play(key, { volume });
      return null;
    } catch (_) {
      return null;
    }
  }

  /**
   * @param {string} bucket
   * @param {number} ms
   */
  _passCooldown(bucket, ms) {
    if (!(ms > 0)) return true;
    const now = this._now();
    const nextAt = this._nextAt.get(bucket) || 0;
    if (now < nextAt) return false;
    this._nextAt.set(bucket, now + ms);
    return true;
  }

  _now() {
    const t = this.scene?.time?.now;
    if (Number.isFinite(t)) return t;
    return Date.now();
  }

  _sound() {
    const sound = this.scene?.sound;
    if (!sound || sound.mute) return null;
    return sound;
  }

  /**
   * @param {string} key
   */
  _cached(key) {
    const exists = this.scene?.cache?.audio?.exists;
    if (typeof exists !== 'function') return true;
    try {
      return !!exists.call(this.scene.cache.audio, key);
    } catch (_) {
      return false;
    }
  }

  _clearBgmUnlock() {
    if (!this._bgmUnlock) return;
    try {
      this.scene?.sound?.off?.('unlocked', this._bgmUnlock);
    } catch (_) {
      /* listener already gone */
    }
    this._bgmUnlock = null;
  }

  _stopBgmNow() {
    this._fading = false;
    const bgm = this._bgm;
    this._bgm = null;
    if (!bgm) return;
    try {
      bgm.stop?.();
    } catch (_) {
      /* already stopped */
    }
    try {
      bgm.destroy?.();
    } catch (_) {
      /* already destroyed */
    }
  }

  _stopEnemyVoice() {
    const node = this._enemyVoice;
    this._enemyVoice = null;
    if (!node) return;
    try {
      node.stop?.();
    } catch (_) {
      /* already stopped */
    }
    try {
      node.destroy?.();
    } catch (_) {
      /* already destroyed */
    }
  }

  _stopFireVoice() {
    const node = this._fireVoice;
    this._fireVoice = null;
    if (!node) return;
    try {
      node.stop?.();
    } catch (_) {
      /* already stopped */
    }
    try {
      node.destroy?.();
    } catch (_) {
      /* already destroyed */
    }
  }

  /**
   * @param {Phaser.Sound.BaseSound} node
   * @param {number} volume
   */
  _setVolume(node, volume) {
    if (!node) return;
    if (typeof node.setVolume === 'function') node.setVolume(volume);
    else node.volume = volume;
  }
}
