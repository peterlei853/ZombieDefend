import { enemySfxClips, enemySfxKey } from '../data/enemyShowcase.js';
import {
  PET_UI_SFX,
  gameplaySfxClips,
  pickVocalVariant,
  professionVocalSlug,
  vocalClipKey,
} from '../data/vocalSfx.js';

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
  // Peter-locked chiptune candidates. Catalog only — they do not replace bgm-stage.
  { key: 'bgm-stage-chiptune-G', url: 'assets/audio/bgm-stage-chiptune-G.mp3' },
  { key: 'bgm-boss-chiptune-H', url: 'assets/audio/bgm-boss-chiptune-H.mp3' },
  { key: 'shoot-sling', url: 'assets/audio/shoot-sling.mp3' },
  { key: 'shoot-bubble', url: 'assets/audio/shoot-bubble.mp3' },
  { key: 'shoot-lightning', url: 'assets/audio/shoot-lightning.mp3' },
  { key: 'shoot-flame', url: 'assets/audio/shoot-flame.mp3' },
  { key: 'shoot-water', url: 'assets/audio/shoot-water.mp3' },
  // Earlier Mega Man water charge pack. Still cataloged. Sandbox water no longer plays these.
  { key: 'sfx-water-charge-l2', url: 'assets/audio/sfx-water-charge-l2.mp3' },
  { key: 'sfx-water-charge-l3', url: 'assets/audio/sfx-water-charge-l3.mp3' },
  { key: 'sfx-water-charge-loop', url: 'assets/audio/sfx-water-charge-loop.mp3' },
  { key: 'sfx-water-release-l1', url: 'assets/audio/sfx-water-release-l1.mp3' },
  { key: 'sfx-water-release-l2', url: 'assets/audio/sfx-water-release-l2.mp3' },
  { key: 'sfx-water-release-l3', url: 'assets/audio/sfx-water-release-l3.mp3' },
  { key: 'sfx-water-impact-l1', url: 'assets/audio/sfx-water-impact-l1.mp3' },
  { key: 'sfx-water-impact-l2', url: 'assets/audio/sfx-water-impact-l2.mp3' },
  { key: 'sfx-water-impact-l3', url: 'assets/audio/sfx-water-impact-l3.mp3' },
  // Peter-approved 1-weapon ear preview. Replaces the sfx-water-* charge hooks.
  // Sandbox water preloads these. Stage / Boot / Shop stay on the audio HOLD.
  { key: 'sfx-charge-l1-blue', url: 'assets/audio/sfx-charge-l1-blue.mp3' },
  { key: 'sfx-charge-l2-yellow', url: 'assets/audio/sfx-charge-l2-yellow.mp3' },
  { key: 'sfx-charge-l3-red', url: 'assets/audio/sfx-charge-l3-red.mp3' },
  { key: 'sfx-fire-l1', url: 'assets/audio/sfx-fire-l1.mp3' },
  { key: 'sfx-fire-l2', url: 'assets/audio/sfx-fire-l2.mp3' },
  { key: 'sfx-fire-l3', url: 'assets/audio/sfx-fire-l3.mp3' },
  { key: 'sfx-hit-l1', url: 'assets/audio/sfx-hit-l1.mp3' },
  { key: 'sfx-aoe-l2-boom', url: 'assets/audio/sfx-aoe-l2-boom.mp3' },
  { key: 'sfx-white-x', url: 'assets/audio/sfx-white-x.mp3' },
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
  // Feel-booth preview cues. Key 7 stays sfx-slash-dot. Combat does not call these.
  { key: 'sfx-slash-enemy', url: 'assets/audio/sfx-slash-enemy.mp3' },
  { key: 'sfx-slash-ally', url: 'assets/audio/sfx-slash-ally.mp3' },
  { key: 'sfx-hit-fire', url: 'assets/audio/sfx-hit-fire.mp3' },
  { key: 'sfx-hit-water', url: 'assets/audio/sfx-hit-water.mp3' },
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
  { key: 'pet-summon', url: 'assets/audio/pet-summon.mp3' },
  { key: 'pet-recall', url: 'assets/audio/pet-recall.mp3' },
  { key: 'skill-telegraph', url: 'assets/audio/skill-telegraph.mp3' },
  // Enemy showcase copies. Same keys as enemySfxClips(). Catalog only —
  // feel-booth playback still loads assets/sfx/enemies.
  { key: 'sfx-enemy-office-worker-v2-hit', url: 'assets/audio/sfx-enemy-office-worker-v2-hit.mp3' },
  { key: 'sfx-enemy-office-worker-v2-hurt', url: 'assets/audio/sfx-enemy-office-worker-v2-hurt.mp3' },
  { key: 'sfx-enemy-office-worker-v2-die', url: 'assets/audio/sfx-enemy-office-worker-v2-die.mp3' },
  { key: 'sfx-enemy-delivery-hit', url: 'assets/audio/sfx-enemy-delivery-hit.mp3' },
  { key: 'sfx-enemy-delivery-hurt', url: 'assets/audio/sfx-enemy-delivery-hurt.mp3' },
  { key: 'sfx-enemy-delivery-die', url: 'assets/audio/sfx-enemy-delivery-die.mp3' },
  { key: 'sfx-enemy-chef-hit', url: 'assets/audio/sfx-enemy-chef-hit.mp3' },
  { key: 'sfx-enemy-chef-hurt', url: 'assets/audio/sfx-enemy-chef-hurt.mp3' },
  { key: 'sfx-enemy-chef-die', url: 'assets/audio/sfx-enemy-chef-die.mp3' },
  { key: 'sfx-enemy-nurse-hit', url: 'assets/audio/sfx-enemy-nurse-hit.mp3' },
  { key: 'sfx-enemy-nurse-hurt', url: 'assets/audio/sfx-enemy-nurse-hurt.mp3' },
  { key: 'sfx-enemy-nurse-die', url: 'assets/audio/sfx-enemy-nurse-die.mp3' },
  { key: 'sfx-enemy-nurse-skill-attach', url: 'assets/audio/sfx-enemy-nurse-skill-attach.mp3' },
  { key: 'sfx-enemy-brute-hit', url: 'assets/audio/sfx-enemy-brute-hit.mp3' },
  { key: 'sfx-enemy-brute-hurt', url: 'assets/audio/sfx-enemy-brute-hurt.mp3' },
  { key: 'sfx-enemy-brute-die', url: 'assets/audio/sfx-enemy-brute-die.mp3' },
  { key: 'sfx-enemy-brute-skill-hurt_heavy', url: 'assets/audio/sfx-enemy-brute-skill-hurt_heavy.mp3' },
  { key: 'sfx-enemy-brute-skill-part_break', url: 'assets/audio/sfx-enemy-brute-skill-part_break.mp3' },
  { key: 'sfx-enemy-brute-skill-blasted_back', url: 'assets/audio/sfx-enemy-brute-skill-blasted_back.mp3' },
  { key: 'sfx-enemy-brute-skill-defeated', url: 'assets/audio/sfx-enemy-brute-skill-defeated.mp3' },
  { key: 'sfx-enemy-riot-hit', url: 'assets/audio/sfx-enemy-riot-hit.mp3' },
  { key: 'sfx-enemy-riot-hurt', url: 'assets/audio/sfx-enemy-riot-hurt.mp3' },
  { key: 'sfx-enemy-riot-die', url: 'assets/audio/sfx-enemy-riot-die.mp3' },
  { key: 'sfx-enemy-riot-skill-armor_break', url: 'assets/audio/sfx-enemy-riot-skill-armor_break.mp3' },
  { key: 'sfx-enemy-trashcan-hit', url: 'assets/audio/sfx-enemy-trashcan-hit.mp3' },
  { key: 'sfx-enemy-trashcan-hurt', url: 'assets/audio/sfx-enemy-trashcan-hurt.mp3' },
  { key: 'sfx-enemy-trashcan-die', url: 'assets/audio/sfx-enemy-trashcan-die.mp3' },
  { key: 'sfx-enemy-trashcan-skill-break', url: 'assets/audio/sfx-enemy-trashcan-skill-break.mp3' },
  { key: 'sfx-enemy-trashcan-skill-panic', url: 'assets/audio/sfx-enemy-trashcan-skill-panic.mp3' },
  { key: 'sfx-enemy-sprinter-hit', url: 'assets/audio/sfx-enemy-sprinter-hit.mp3' },
  { key: 'sfx-enemy-sprinter-hurt', url: 'assets/audio/sfx-enemy-sprinter-hurt.mp3' },
  { key: 'sfx-enemy-sprinter-die', url: 'assets/audio/sfx-enemy-sprinter-die.mp3' },
  { key: 'sfx-enemy-sprinter-skill-blasted_back', url: 'assets/audio/sfx-enemy-sprinter-skill-blasted_back.mp3' },
  { key: 'sfx-enemy-sprinter-skill-tumble', url: 'assets/audio/sfx-enemy-sprinter-skill-tumble.mp3' },
  { key: 'sfx-enemy-sprinter-skill-comedic_ko', url: 'assets/audio/sfx-enemy-sprinter-skill-comedic_ko.mp3' },
  { key: 'sfx-enemy-slime-hit', url: 'assets/audio/sfx-enemy-slime-hit.mp3' },
  { key: 'sfx-enemy-slime-hurt', url: 'assets/audio/sfx-enemy-slime-hurt.mp3' },
  { key: 'sfx-enemy-slime-die', url: 'assets/audio/sfx-enemy-slime-die.mp3' },
  { key: 'sfx-enemy-slime-skill-split', url: 'assets/audio/sfx-enemy-slime-skill-split.mp3' },
  { key: 'sfx-enemy-slime-mini-hit', url: 'assets/audio/sfx-enemy-slime-mini-hit.mp3' },
  { key: 'sfx-enemy-slime-mini-hurt', url: 'assets/audio/sfx-enemy-slime-mini-hurt.mp3' },
  { key: 'sfx-enemy-slime-mini-die', url: 'assets/audio/sfx-enemy-slime-mini-die.mp3' },
  { key: 'sfx-enemy-slime-mini-skill-splatter', url: 'assets/audio/sfx-enemy-slime-mini-skill-splatter.mp3' },
  { key: 'sfx-enemy-exploder-hit', url: 'assets/audio/sfx-enemy-exploder-hit.mp3' },
  { key: 'sfx-enemy-exploder-hurt', url: 'assets/audio/sfx-enemy-exploder-hurt.mp3' },
  { key: 'sfx-enemy-exploder-die', url: 'assets/audio/sfx-enemy-exploder-die.mp3' },
  { key: 'sfx-enemy-exploder-skill-explode', url: 'assets/audio/sfx-enemy-exploder-skill-explode.mp3' },
  { key: 'sfx-enemy-cyborg-hit', url: 'assets/audio/sfx-enemy-cyborg-hit.mp3' },
  { key: 'sfx-enemy-cyborg-hurt', url: 'assets/audio/sfx-enemy-cyborg-hurt.mp3' },
  { key: 'sfx-enemy-cyborg-die', url: 'assets/audio/sfx-enemy-cyborg-die.mp3' },
  { key: 'sfx-enemy-cyborg-skill-hurt_spark', url: 'assets/audio/sfx-enemy-cyborg-skill-hurt_spark.mp3' },
  { key: 'sfx-enemy-cyborg-skill-fall', url: 'assets/audio/sfx-enemy-cyborg-skill-fall.mp3' },
  { key: 'sfx-enemy-cyborg-skill-explode', url: 'assets/audio/sfx-enemy-cyborg-skill-explode.mp3' },
  { key: 'sfx-enemy-clown-hit', url: 'assets/audio/sfx-enemy-clown-hit.mp3' },
  { key: 'sfx-enemy-clown-hurt', url: 'assets/audio/sfx-enemy-clown-hurt.mp3' },
  { key: 'sfx-enemy-clown-die', url: 'assets/audio/sfx-enemy-clown-die.mp3' },
  { key: 'sfx-enemy-clown-skill-hurt_loot', url: 'assets/audio/sfx-enemy-clown-skill-hurt_loot.mp3' },
  { key: 'sfx-enemy-clown-skill-loot_explode', url: 'assets/audio/sfx-enemy-clown-skill-loot_explode.mp3' },
  { key: 'sfx-enemy-lava-balon-hit', url: 'assets/audio/sfx-enemy-lava-balon-hit.mp3' },
  { key: 'sfx-enemy-lava-balon-hurt', url: 'assets/audio/sfx-enemy-lava-balon-hurt.mp3' },
  { key: 'sfx-enemy-lava-balon-die', url: 'assets/audio/sfx-enemy-lava-balon-die.mp3' },
  { key: 'sfx-enemy-lava-balon-skill-lava_slam', url: 'assets/audio/sfx-enemy-lava-balon-skill-lava_slam.mp3' },
  { key: 'sfx-enemy-lava-balon-skill-volcanic_breath', url: 'assets/audio/sfx-enemy-lava-balon-skill-volcanic_breath.mp3' },
  { key: 'sfx-enemy-lava-balon-skill-meteor_storm', url: 'assets/audio/sfx-enemy-lava-balon-skill-meteor_storm.mp3' },
  { key: 'sfx-enemy-lava-balon-enrage', url: 'assets/audio/sfx-enemy-lava-balon-enrage.mp3' },
  { key: 'sfx-enemy-steel-balam-hit', url: 'assets/audio/sfx-enemy-steel-balam-hit.mp3' },
  { key: 'sfx-enemy-steel-balam-hurt', url: 'assets/audio/sfx-enemy-steel-balam-hurt.mp3' },
  { key: 'sfx-enemy-steel-balam-die', url: 'assets/audio/sfx-enemy-steel-balam-die.mp3' },
  { key: 'sfx-enemy-steel-balam-skill-ground_smash', url: 'assets/audio/sfx-enemy-steel-balam-skill-ground_smash.mp3' },
  { key: 'sfx-enemy-steel-balam-skill-bio_acid_spit', url: 'assets/audio/sfx-enemy-steel-balam-skill-bio_acid_spit.mp3' },
  { key: 'sfx-enemy-steel-balam-skill-steel_whirlwind', url: 'assets/audio/sfx-enemy-steel-balam-skill-steel_whirlwind.mp3' },
  { key: 'sfx-enemy-steel-balam-enrage', url: 'assets/audio/sfx-enemy-steel-balam-enrage.mp3' },
  // v0.36.27 profession vocals + pet/UI gap-fill. See src/data/vocalSfx.js.
  ...gameplaySfxClips(),
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
 * Sandbox pet try-out loads these itself. Stage summon already calls
 * `playPetSummon`, so leaving them out of the Boot/Stage queue keeps that
 * hook silent.
 */
const SANDBOX_PET_PREVIEW_AUDIO = new Set(['pet-summon', 'pet-recall']);

/** Basenames of the approved 1-weapon ear preview. GAME_AUDIO key = filename without .mp3. */
export const WATER_EAR_PREVIEW_KEYS = Object.freeze([
  'sfx-charge-l1-blue',
  'sfx-charge-l2-yellow',
  'sfx-charge-l3-red',
  'sfx-fire-l1',
  'sfx-fire-l2',
  'sfx-fire-l3',
  'sfx-hit-l1',
  'sfx-aoe-l2-boom',
  'sfx-white-x',
]);

/**
 * Charge / fire / hit / boom / white-X levels for sandbox and stage `?weapon=water`.
 * Charge stays inside 0.28–0.32. White X stays at 0.26 so the 0.2s tick is not harsh.
 */
export const WATER_EAR_VOLUME = Object.freeze({
  chargeL1: 0.28,
  chargeL2: 0.3,
  chargeL3: 0.32,
  fireL1: 0.28,
  fireL2: 0.32,
  fireL3: 0.36,
  hitL1: 0.3,
  aoeL2: 0.38,
  whiteX: 0.26,
});

/** Collapse same-frame white X marks. The 200ms damage tick still gets through. */
const WATER_EAR_WHITE_X_COOLDOWN_MS = 140;

const WATER_EAR_CHARGE = Object.freeze({
  1: { key: 'sfx-charge-l1-blue', volume: WATER_EAR_VOLUME.chargeL1 },
  2: { key: 'sfx-charge-l2-yellow', volume: WATER_EAR_VOLUME.chargeL2 },
  3: { key: 'sfx-charge-l3-red', volume: WATER_EAR_VOLUME.chargeL3 },
});

const WATER_EAR_FIRE = Object.freeze({
  1: { key: 'sfx-fire-l1', volume: WATER_EAR_VOLUME.fireL1 },
  2: { key: 'sfx-fire-l2', volume: WATER_EAR_VOLUME.fireL2 },
  3: { key: 'sfx-fire-l3', volume: WATER_EAR_VOLUME.fireL3 },
});

/**
 * @param {number} tier
 * @returns {1|2|3}
 */
function waterEarLevel(tier) {
  if (tier >= 3) return 3;
  if (tier >= 2) return 2;
  return 1;
}

/**
 * Queue every clip that is not already in the audio cache.
 * Safe to call from Boot and again from Stage (retry / direct start).
 * The nine 1-weapon ear-preview keys are on this queue so main Stage
 * `?weapon=water` hears them. Sandbox passes `{ sandbox: true }` and
 * loads the same list.
 * @param {Phaser.Scene} scene
 * @param {{ sandbox?: boolean }} [_options]
 */
export function preloadGameAudio(scene, _options = {}) {
  const loader = scene?.load;
  if (typeof loader?.audio !== 'function') return;
  const cache = scene.cache?.audio;
  // Showcase keys are listed twice: GAME_AUDIO (assets/audio) and
  // enemySfxClips() (assets/sfx/enemies). Queue the live URL once so the
  // catalog copy does not race the feel-booth cue.
  const liveByKey = new Map(enemySfxClips().map((clip) => [clip.key, clip]));
  const seen = new Set();
  const clips = [];
  for (const clip of GAME_AUDIO.concat(enemySfxClips())) {
    if (seen.has(clip.key)) continue;
    seen.add(clip.key);
    clips.push(liveByKey.get(clip.key) || clip);
  }
  for (const clip of clips) {
    if (SANDBOX_PET_PREVIEW_AUDIO.has(clip.key)) continue;
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

  /**
   * PIXELLAB_HOOK: 1-weapon ear preview while SPACE is held.
   * L1 blue under 1.8s, L2 yellow from 1.8s, L3 red from 4s.
   * One voice. Entering the next tier stops the previous charge.
   * The clips are rises, not loops, so a held tier does not restart.
   * @param {number} tier
   */
  syncWaterCharge(tier) {
    if (this._disposed) return;
    const row = WATER_EAR_CHARGE[waterEarLevel(tier)];
    if (this._waterRiseKey === row.key) return;
    this._stopWaterRise();
    this._waterRiseKey = row.key;
    this._waterRise = this._addWaterNode(row.key, row.volume, false);
    if (!this._waterRise) this._waterRiseKey = null;
  }

  /** Hard cut. Release and a cancelled hold both stop the charge voice. */
  stopWaterChargeLoop() {
    this._stopWaterRise();
  }

  /**
   * Stop the charge voice and play the fire cue for this tier.
   * @param {number} tier
   */
  playWaterRelease(tier) {
    const row = WATER_EAR_FIRE[waterEarLevel(tier)];
    this.stopWaterChargeLoop();
    this._cue(row.key, row.volume);
  }

  /** L1 enemy hit. Lightning VFX stays with the caller. */
  playWaterHitL1() {
    this._cue('sfx-hit-l1', WATER_EAR_VOLUME.hitL1);
  }

  /** L2 first opaque contact. The caller plays this once per shot. */
  playWaterAoeBoom() {
    this._cue('sfx-aoe-l2-boom', WATER_EAR_VOLUME.aoeL2);
  }

  /**
   * White X tick. Volume stays at 0.26. A short cooldown keeps several
   * bodies marked on the same frame from stacking into one harsh hit.
   */
  playWaterWhiteX() {
    this._cue('sfx-white-x', WATER_EAR_VOLUME.whiteX, WATER_EAR_WHITE_X_COOLDOWN_MS);
  }

  _stopWaterRise() {
    this._stopWaterNode(this._waterRise);
    this._waterRise = null;
    this._waterRiseKey = null;
  }

  /**
   * @param {string} key
   * @param {number} volume
   * @param {boolean} loop
   */
  _addWaterNode(key, volume, loop) {
    const sound = this._sound();
    if (!sound || !this._cached(key) || sound.locked) return null;
    try {
      if (typeof sound.add === 'function') {
        const node = sound.add(key, { volume, loop: !!loop });
        if (!node) return null;
        node.play?.();
        return node;
      }
      sound.play(key, { volume, loop: !!loop });
      return { loose: true, key };
    } catch (_) {
      return null;
    }
  }

  /** @param {Phaser.Sound.BaseSound|{ loose?: boolean, key?: string }|null|undefined} node */
  _stopWaterNode(node) {
    if (!node) return;
    if (node.loose) {
      try {
        this.scene?.sound?.stopByKey?.(node.key);
      } catch (_) {
        /* already stopped */
      }
      return;
    }
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

  /**
   * Feel-booth DoT tick. Plays the default `sfx-slash-dot` (take A) already
   * cataloged with the audio pack. Volume stays under melee. Not a combat hook.
   */
  playFeelDotTick() {
    this._cue('sfx-slash-dot', 0.28);
  }

  /**
   * Feel-booth enemy slash for key 5. Pairs `fx-slash-enemy-red` with
   * `sfx-slash-enemy`. Preview only. Not a combat hook.
   */
  playFeelEnemySlash() {
    this._cue('sfx-slash-enemy', 0.3, AUDIO_COOLDOWN_MS.hit);
  }

  /**
   * Feel-booth ally slash for key 6. Pairs `fx-slash-ally-white` with
   * `sfx-slash-ally`. Preview only. Not a combat hook.
   */
  playFeelAllySlash() {
    this._cue('sfx-slash-ally', 0.3, AUDIO_COOLDOWN_MS.hit);
  }

  /**
   * Feel-booth fire hit for key 8. Pairs `fx-hit-fire` with `sfx-hit-fire`.
   * Preview only. Not a combat hook.
   */
  playFeelFireHit() {
    this._cue('sfx-hit-fire', 0.28, AUDIO_COOLDOWN_MS.hit);
  }

  /**
   * Feel-booth water hit for key 9. Pairs `fx-hit-water` with `sfx-hit-water`.
   * Preview only. Not a combat hook.
   */
  playFeelWaterHit() {
    this._cue('sfx-hit-water', 0.28, AUDIO_COOLDOWN_MS.hit);
  }

  playZombieHurt() {
    this._cue('zombie-hurt', AUDIO_VOLUME.hurt, AUDIO_COOLDOWN_MS.hurt);
  }

  playZombieDeath() {
    this._cue('zombie-death', AUDIO_VOLUME.death, AUDIO_COOLDOWN_MS.death);
  }

  /**
   * Profession death cry. Picks sfx-<slug>-death-a or b.
   * Returns false when this skin has no vocal slug so the generic cry can play.
   * @param {string|null|undefined} skinId
   * @returns {boolean}
   */
  playProfessionDeath(skinId) {
    const slug = professionVocalSlug(skinId);
    if (!slug) return false;
    const key = vocalClipKey(slug, 'death', pickVocalVariant());
    this._cue(key, AUDIO_VOLUME.death, AUDIO_COOLDOWN_MS.death);
    return true;
  }

  /**
   * Ambient growl. Caller waits ~10s per slug. Picks a|b.
   * @param {string} slug
   */
  playProfessionGrowl(slug) {
    if (!slug) return;
    const key = vocalClipKey(slug, 'growl', pickVocalVariant());
    this._cue(key, AUDIO_VOLUME.hurt, 0);
  }

  /** Pet normal attack. ~0.55s. */
  playPetBasicAttack() {
    this._cue(PET_UI_SFX.basicAttack, AUDIO_VOLUME.melee, 200);
  }

  /** GO! recalled → sent. ~0.38s. */
  playPetGo() {
    this._cue(PET_UI_SFX.go, AUDIO_VOLUME.ui, 120);
  }

  /** Back! sent → recalled. ~0.38s. */
  playPetBack() {
    this._cue(PET_UI_SFX.back, AUDIO_VOLUME.ui, 120);
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
   * Sandbox try-out send. Plays only when the scene cached `pet-summon`.
   * Stage does not preload that clip, so the portrait summon hook stays silent.
   */
  playPetSummon() {
    this._cueOptional('pet-summon', AUDIO_VOLUME.ui);
  }

  /** Sandbox try-out recall. Same cache rule and ui volume as summon. */
  playPetRecall() {
    this._cueOptional('pet-recall', AUDIO_VOLUME.ui);
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
    this.stopWaterChargeLoop();
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
