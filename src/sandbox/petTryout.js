/**
 * Sandbox pet try-out. StageScene never starts this scene.
 *
 * Plays catalog appearance, sleep, claw, skill, skill-aoe, and
 * evolve-from-baby strips, plus fx-pet-* from PET_SKILL_SPECS.
 * Stage combat keeps the baby field set (idle / move / skill / hurt / sleep).
 */

import {
  aimRotation,
  createLibraryAnims,
  libraryAsset,
  playLibraryAnim,
  playLibraryFx,
  preloadLibrary,
} from '../assets/libraryAssets.js';
import { PET_ELEMENT_TINT, PET_LINEUP } from '../assets/petLineup.js';
import { petSkillKey, petSkillSpec } from '../assets/petSkills.js';
import { GAME_HEIGHT, GAME_WIDTH } from '../data/waves.js';
import { LAYOUT_SCALE } from '../systems/DepthView.js';
import { SoundManager } from '../systems/SoundManager.js';

export const TRYOUT_PETS = ['dragon', 'phoenix', 'panda', 'lion'];
export const TRYOUT_FORMS = ['baby', 'young', 'ancient'];

const TRYOUT_ACTIONS = new Set([
  'appearance',
  'claw',
  // PIXELLAB_HOOK: Wave2 pet-*-baby-attack loads here beside claw. attack() still plays claw.
  'attack',
  'skill',
  'skill-aoe',
  'idle',
  'sleep',
  'sleep-start',
  'evolve-from-baby',
]);

const PET_X = 900;
const BED_X = 1020;
const DUMMY_X = 460;
const GROUND_Y = 520;
const BODY_PX = { baby: 150, young: 186, ancient: 228 };

/** @param {string} id @param {string} form @param {string} action */
export function tryoutStrip(id, form, action) {
  return `pet-${id}-${form}-${action}`;
}

/** @param {string} id */
export function tryoutEvolveFx(id) {
  return `fx-pet-${id}-evolve`;
}

/**
 * Pets category only. Appearance, claw, skill-aoe, and evolve-from-baby
 * are included here and stay outside stageLibraryFilter.
 * @param {{ category?: string, key?: string }} asset
 */
export function sandboxPetFilter(asset) {
  if (!asset || asset.category !== 'pets') return false;
  const key = String(asset.key || '');
  if (/^fx-pet-(dragon|phoenix|panda|lion)-/.test(key)) return true;
  const match = key.match(/^pet-(dragon|phoenix|panda|lion)-(baby|young|ancient)-(.+)$/);
  if (!match) return false;
  return TRYOUT_ACTIONS.has(match[3]);
}

/** @param {string} form */
function formIndex(form) {
  const index = TRYOUT_FORMS.indexOf(form);
  return index < 0 ? 0 : index;
}

/** @param {string} search */
export function tryoutPetFromSearch(search) {
  try {
    const id = new URLSearchParams(search || '').get('pet');
    if (TRYOUT_PETS.includes(id)) return id;
  } catch (_) {
    /* ignore a bad query */
  }
  return 'dragon';
}

/**
 * @param {Phaser.Scene} scene
 * @param {string} key
 * @param {string} form
 */
function bodyScale(scene, key, form) {
  const height = libraryAsset(scene, key)?.frameHeight || 48;
  const target = BODY_PX[form] || BODY_PX.baby;
  return target / height;
}

/**
 * Ground-ring width tracks the form body. The old 360/frameWidth sheet
 * stood on the pet as a poster.
 * @param {string} form
 * @param {number} frameWidth
 */
export function groundRingScale(form, frameWidth) {
  const body = BODY_PX[form] || BODY_PX.baby;
  const width = frameWidth > 0 ? frameWidth : 85;
  return (body * 1.5) / width;
}

/** @type {Map<string, number>} */
const paintedBottomCache = new Map();

/**
 * Lowest opaque row as a fraction of frame height. Appearance and
 * skill-aoe sheets pad under the painted feet, so catalog origin y = 1
 * plants the empty margin on the lane.
 * @param {Phaser.Scene} scene
 * @param {string} key
 */
function paintedBottom(scene, key) {
  if (paintedBottomCache.has(key)) return paintedBottomCache.get(key);
  let fraction = 1;
  try {
    const texture = scene.textures.get(key);
    const source = texture?.getSourceImage?.();
    const names = texture?.getFrameNames?.() || [];
    const frames = names.length ? names.map((name) => texture.get(name)) : [texture.get()];
    let lowest = 0;
    let height = 1;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    for (const frame of frames) {
      const fw = frame?.width || 0;
      const fh = frame?.height || 0;
      if (!fw || !fh || !ctx || !source) continue;
      height = fh;
      canvas.width = fw;
      canvas.height = fh;
      ctx.clearRect(0, 0, fw, fh);
      ctx.drawImage(source, frame.cutX || 0, frame.cutY || 0, fw, fh, 0, 0, fw, fh);
      const data = ctx.getImageData(0, 0, fw, fh).data;
      for (let y = fh - 1; y >= 0; y -= 1) {
        let hit = false;
        const row = y * fw * 4;
        for (let x = 0; x < fw; x += 1) {
          if (data[row + x * 4 + 3] > 16) {
            hit = true;
            break;
          }
        }
        if (hit) {
          if (y + 1 > lowest) lowest = y + 1;
          break;
        }
      }
    }
    if (height > 0 && lowest > 0) fraction = lowest / height;
  } catch (_) {
    fraction = 1;
  }
  paintedBottomCache.set(key, fraction);
  return fraction;
}

/**
 * @param {{ x: number, y: number, scaleY?: number, scaleX?: number }} sprite
 * @param {number} frameX
 * @param {number} frameY
 */
function framePoint(sprite, frameX, frameY) {
  const scale = Math.abs(sprite?.scaleY || sprite?.scaleX || 1);
  return { x: (sprite?.x ?? 0) + frameX * scale, y: (sprite?.y ?? 0) + frameY * scale };
}

export default class PetTryoutScene extends Phaser.Scene {
  constructor() {
    super('PetTryout');
  }

  preload() {
    preloadLibrary(this, { categories: ['pets'], filter: sandboxPetFilter });
    this.load.audio('pet-melee-hit', 'assets/audio/pet-melee-hit.mp3');
    this.load.audio('pet-knockback', 'assets/audio/pet-knockback.mp3');
    this.load.audio('pet-evolve', 'assets/audio/pet-evolve.mp3');
    this.load.audio('pet-summon', 'assets/audio/pet-summon.mp3');
    this.load.audio('pet-recall', 'assets/audio/pet-recall.mp3');
    this.load.audio('skill-telegraph', 'assets/audio/skill-telegraph.mp3');
  }

  create() {
    createLibraryAnims(this);
    this.audio = new SoundManager(this);
    this.petId = tryoutPetFromSearch(globalThis.location?.search || '');
    this.form = 'baby';
    this.out = false;
    this.token = 0;
    /** @type {Phaser.GameObjects.GameObject[]} */
    this.live = [];
    /** @type {{ sprite: Phaser.GameObjects.Sprite, x: number, y: number, vx: number, vy: number, life: number, kind: string, impact?: string, scale: number, groundY?: number, stopX?: number }[]} */
    this.movers = [];
    this.struck = false;
    this._drawLane();
    this._makeDummy();
    const bootKey = tryoutStrip(this.petId, 'baby', 'sleep');
    if (!this.textures.exists(bootKey) && !this.textures.exists(tryoutStrip(this.petId, 'baby', 'idle'))) {
      this._status('Pet strips did not load. Hard-refresh this page from the sandbox hub.');
      this._publish();
      return;
    }
    this.pet = this.add.sprite(PET_X, GROUND_Y, this.textures.exists(bootKey) ? bootKey : tryoutStrip(this.petId, 'baby', 'idle'));
    this.pet.setDepth(12);
    this.zzz = this.add.text(BED_X, GROUND_Y - 200, 'z z z', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '22px',
      color: '#9eb0c8',
    }).setOrigin(0.5).setDepth(40).setVisible(false);
    this.caption = this.add.text(28, 22, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      color: '#e6ebf2',
    }).setDepth(40);
    this._showSleep(this.token);
    this._bindApi();
    this._status(`${this._name()} is asleep. Press 1 to send out.`);
  }

  /**
   * @param {number} _time
   * @param {number} delta
   */
  update(_time, delta) {
    const dt = Number.isFinite(delta) ? delta : 0;
    const sec = dt / 1000;
    const next = [];
    for (const mover of this.movers) {
      if (!mover.sprite?.active) continue;
      mover.x += mover.vx * sec;
      mover.y += mover.vy * sec;
      mover.sprite.x = mover.x;
      mover.sprite.y = mover.y;
      mover.life -= dt;
      const landed = mover.kind === 'rain'
        ? mover.y >= (mover.groundY ?? GROUND_Y)
        : mover.x <= (mover.stopX ?? DUMMY_X);
      if (mover.life <= 0 || landed) {
        if (landed && mover.impact) {
          const hitY = mover.kind === 'rain' ? (mover.groundY ?? GROUND_Y) : mover.y;
          this._track(playLibraryFx(this, mover.x, hitY, mover.impact, { scale: mover.scale, depth: 23 }));
          this._pokeSkill();
        }
        mover.sprite.destroy();
        continue;
      }
      next.push(mover);
    }
    this.movers = next;
  }

  _bindApi() {
    const api = {
      send: () => this.send(),
      attack: () => this.attack(),
      skill: () => this.skill(),
      evolve: () => this.evolve(),
      reset: () => this.reset(),
      pick: (id) => this.pick(id),
      prev: () => this.cycle(-1),
      next: () => this.cycle(1),
    };
    globalThis.__ZD_PET = api;
  }

  _unlock() {
    const ctx = this.sound?.context;
    if (ctx?.state === 'suspended') ctx.resume();
  }

  _begin() {
    this.token += 1;
    this._clearFx();
    this.struck = false;
    return this.token;
  }

  _clearFx() {
    for (const sprite of this.live) {
      try {
        sprite.destroy();
      } catch (_) {
        /* already gone */
      }
    }
    this.live = [];
    this.movers = [];
  }

  /** @param {Phaser.GameObjects.GameObject|null|undefined} sprite */
  _track(sprite) {
    if (sprite) this.live.push(sprite);
    return sprite;
  }

  send() {
    this._unlock();
    if (this.out) {
      this.recall();
      return;
    }
    const token = this._begin();
    this.out = true;
    this.audio?.playPetSummon();
    this._zzz(false);
    this.pet.setAlpha(1);
    this.pet.setPosition(PET_X, GROUND_Y);
    const appearance = tryoutStrip(this.petId, this.form, 'appearance');
    if (this.textures.exists(appearance)) {
      this._pose(appearance, this.form, { matchIdle: true });
      this.time.delayedCall(560, () => {
        if (token !== this.token || !this.out) return;
        this._poseIdle();
      });
    } else {
      this._poseIdle();
    }
    this._status(`${this._name()} sent out.`);
  }

  recall() {
    this._unlock();
    const token = this._begin();
    this.out = false;
    this.audio?.playPetRecall();
    this._status(`${this._name()} recalled.`);
    this._showSleep(token);
  }

  attack() {
    this._unlock();
    if (!this.out) {
      this._status('Send the pet out, then attack.');
      return;
    }
    // PIXELLAB_HOOK: pet-<id>-<form>-attack is cataloged for baby. This booth
    // still plays claw until Gameplay swaps. Dragon baby attack is the v1.1 slam.
    const key = tryoutStrip(this.petId, this.form, 'claw');
    if (!this.textures.exists(key)) {
      this._begin();
      this._status(`${this._name()} has no claw strip. Melee cue only.`);
      this._meleeConnect();
      return;
    }
    const token = this._begin();
    this.pet.setPosition(PET_X, GROUND_Y);
    this.pet.setAlpha(1);
    this._pose(key);
    let hit = false;
    const connect = () => {
      if (hit || token !== this.token) return;
      hit = true;
      this._meleeConnect();
    };
    const onUpdate = (anim, frame) => {
      if (token !== this.token) {
        this.pet.off('animationupdate', onUpdate);
        return;
      }
      if (anim?.key !== key) return;
      if ((frame?.index ?? 0) < 2) return;
      this.pet.off('animationupdate', onUpdate);
      connect();
    };
    this.pet.on('animationupdate', onUpdate);
    this.time.delayedCall(170, connect);
    this._whenDone(token, key, () => {
      if (!this.out) return;
      this._poseIdle();
    });
    this._status(`${this._name()} claw.`);
  }

  skill() {
    this._unlock();
    if (!this.out) {
      this._status('Send the pet out, then use the skill.');
      return;
    }
    const key = petSkillKey(this.petId, formIndex(this.form));
    const spec = petSkillSpec(key);
    if (!this.textures.exists(key)) {
      this._status(`No ${this.form} skill strip for ${this.petId}.`);
      return;
    }
    const token = this._begin();
    this.audio?.playSkillTelegraph();
    this.pet.setPosition(PET_X, GROUND_Y);
    this.pet.setAlpha(1);
    this._pose(key);
    const rate = spec?.frameRate || 10;
    const castAt = ((spec?.castFrame ?? 3) / rate) * 1000;
    this.time.delayedCall(castAt, () => {
      if (token !== this.token) return;
      this._releaseSkill(spec);
    });
    this._whenDone(token, key, () => {
      if (!this.out) return;
      this._poseIdle();
    });
    const name = spec?.name || 'skill';
    this._status(`${this._name()} · ${name}.`);
  }

  evolve() {
    this._unlock();
    if (!this.out) {
      this._status('Send the pet out, then evolve.');
      return;
    }
    if (this.form === 'ancient') {
      this._status('Ancient is the last form in this try-out.');
      return;
    }
    if (this.form === 'baby') {
      const morph = tryoutStrip(this.petId, 'young', 'evolve-from-baby');
      const token = this._begin();
      this.pet.setPosition(PET_X, GROUND_Y);
      this.audio?.playPetEvolve();
      const played = this.textures.exists(morph) && this._pose(morph, 'young');
      this._playEvolveBurst(token);
      const finish = () => {
        if (token !== this.token) return;
        this.form = 'young';
        if (this.out) this._poseIdle();
        this._status(`${this.petId} evolved to young.`);
      };
      if (played) this._whenDone(token, morph, finish);
      else this.time.delayedCall(700, finish);
      return;
    }
    const idle = tryoutStrip(this.petId, 'ancient', 'idle');
    if (!this.textures.exists(idle)) {
      this._status('No ancient idle strip for this pet.');
      return;
    }
    const token = this._begin();
    this.pet.setPosition(PET_X, GROUND_Y);
    this.audio?.playPetEvolve();
    this._playEvolveBurst(token, () => {
      if (token !== this.token) return;
      this.form = 'ancient';
      if (this.out) this._poseIdle();
      this._status(`${this.petId} evolved to ancient.`);
    });
  }

  reset() {
    this._unlock();
    this.form = 'baby';
    this.out = false;
    const token = this._begin();
    this._showSleep(token);
    this._status(`${this.petId} reset to baby, recalled.`);
  }

  /** @param {string} id */
  pick(id) {
    if (!TRYOUT_PETS.includes(id) || id === this.petId) {
      this._publish();
      return;
    }
    this._unlock();
    this.petId = id;
    this.form = 'baby';
    this.out = false;
    const token = this._begin();
    this._showSleep(token);
    this._status(`${this._name()} is asleep. Press 1 to send out.`);
  }

  /** @param {number} step */
  cycle(step) {
    const index = TRYOUT_PETS.indexOf(this.petId);
    const next = (index + step + TRYOUT_PETS.length) % TRYOUT_PETS.length;
    this.pick(TRYOUT_PETS[next]);
  }

  /** @param {number} token */
  _showSleep(token) {
    this._zzz(false);
    this.pet.setAlpha(1);
    const start = tryoutStrip(this.petId, this.form, 'sleep-start');
    const loop = tryoutStrip(this.petId, this.form, 'sleep');
    if (this.textures.exists(start)) {
      this.pet.setPosition(PET_X, GROUND_Y);
      this._pose(start);
      this._whenDone(token, start, () => this._sleepLoop(loop, token));
      return;
    }
    if (this.textures.exists(loop)) {
      this.pet.setPosition(PET_X, GROUND_Y);
      this._sleepLoop(loop, token);
      return;
    }
    if (this._poseIdle()) {
      this.pet.setAlpha(0.45);
      this.pet.setPosition(BED_X, GROUND_Y);
      this._zzz(true);
      return;
    }
    this.pet.setVisible(false);
    this._zzz(true);
  }

  /**
   * @param {string} loop
   * @param {number} token
   */
  _sleepLoop(loop, token) {
    if (token !== this.token || this.out) return;
    const anim = this.anims.exists(`${loop}:loop`) ? `${loop}:loop` : loop;
    this._playKey(loop, anim, this.form);
  }

  /** @param {boolean} on */
  _zzz(on) {
    if (!this.zzz) return;
    this.zzz.setVisible(on);
    this.zzz.setPosition(this.pet?.x || BED_X, GROUND_Y - 210);
  }

  /**
   * @param {string} key
   * @param {string} [form]
   * @param {{ matchIdle?: boolean }} [opts]
   */
  _pose(key, form = this.form, opts = {}) {
    return this._playKey(key, (libraryAsset(this, key)?.frames || 1) > 1 ? key : '', form, opts);
  }

  _poseIdle() {
    const idle = tryoutStrip(this.petId, this.form, 'idle');
    if (!this.textures.exists(idle)) return false;
    this.pet.setAlpha(1);
    this.pet.setPosition(PET_X, GROUND_Y);
    return this._pose(idle);
  }

  /**
   * @param {string} textureKey
   * @param {string} animKey
   * @param {string} form
   * @param {{ matchIdle?: boolean }} [opts]
   */
  _playKey(textureKey, animKey, form, opts = {}) {
    const asset = libraryAsset(this, textureKey);
    if (!this.textures.exists(textureKey)) return false;
    const idleKey = tryoutStrip(this.petId, form, 'idle');
    const scaleKey = opts.matchIdle && this.textures.exists(idleKey) ? idleKey : textureKey;
    this.pet.setVisible(true);
    this.pet.setTexture(textureKey);
    const origin = asset?.origin || [0.5, 1];
    const feet = opts.matchIdle ? paintedBottom(this, textureKey) : origin[1];
    this.pet.setOrigin(origin[0], feet);
    this.pet.setScale(bodyScale(this, scaleKey, form));
    this.pet.setFlipX(false);
    this.pet.setY(GROUND_Y);
    if (animKey && this.anims.exists(animKey)) playLibraryAnim(this.pet, animKey, this);
    return true;
  }

  /**
   * @param {number} token
   * @param {string} key
   * @param {() => void} fn
   */
  _whenDone(token, key, fn) {
    let done = false;
    const finish = () => {
      if (done || token !== this.token) return;
      done = true;
      fn();
    };
    this.pet.once(`animationcomplete-${key}`, finish);
    const asset = libraryAsset(this, key);
    const frames = asset?.frames || 4;
    const rate = asset?.frameRate || 10;
    this.time.delayedCall((frames / rate) * 1000 + 40, finish);
  }

  _meleeConnect() {
    this.audio?.playPetMeleeHit();
    this.audio?.playPetKnockback();
    this._shoveDummy();
    this._floatDamage(12);
  }

  /** @param {import('../assets/petSkills.js').PetSkillSpec|null} spec */
  _releaseSkill(spec) {
    const scale = Math.abs(this.pet.scaleY || 1);
    this._spawnAoe();
    if (!spec?.fx?.length) {
      this._pokeSkill();
      return;
    }
    if (spec.channel) {
      this._playChannel(spec, scale);
      return;
    }
    if (spec.rain) {
      this._spawnRain(spec, scale);
      return;
    }
    if (spec.projectile) {
      this._spawnBolt(spec, scale);
      return;
    }
    if (spec.fanDeg) {
      this._spawnFan(spec, scale);
      return;
    }
    if (spec.travelOffset) {
      this._spawnTravel(spec, scale);
      return;
    }
    this._spawnPlaced(spec, scale);
  }

  _spawnAoe() {
    const key = tryoutStrip(this.petId, this.form, 'skill-aoe');
    if (!this.textures.exists(key)) return;
    const asset = libraryAsset(this, key);
    const sprite = this.add.sprite(this.pet.x, GROUND_Y, key);
    sprite.setOrigin(0.5, paintedBottom(this, key));
    sprite.setScale(groundRingScale(this.form, asset?.frameWidth || 85));
    sprite.setBlendMode(Phaser.BlendModes.ADD);
    sprite.setDepth(9);
    playLibraryAnim(sprite, key, this);
    this.live.push(sprite);
    const frames = asset?.frames || 3;
    const rate = asset?.frameRate || 6;
    this.time.delayedCall((frames / rate) * 1000 * 2, () => {
      if (sprite.active) sprite.destroy();
    });
  }

  /**
   * @param {import('../assets/petSkills.js').PetSkillSpec} spec
   * @param {number} scale
   */
  _playChannel(spec, scale) {
    const key = spec.fx[0];
    const off = spec.spawnOffset || [0, 0];
    const at = framePoint(this.pet, off[0], off[1]);
    const sprite = this._spawnHeld(key, at.x, at.y, scale, 22);
    if (!sprite) {
      this._pokeSkill();
      return;
    }
    const start = `${key}:start`;
    const loop = `${key}:loop`;
    const end = `${key}:end`;
    const playEnd = () => {
      if (!sprite.active) return;
      if (this.anims.exists(end)) {
        sprite.play(end);
        sprite.once(`animationcomplete-${end}`, () => {
          if (sprite.active) sprite.destroy();
        });
      } else {
        sprite.destroy();
      }
    };
    if (this.anims.exists(start)) {
      sprite.play(start);
      sprite.once(`animationcomplete-${start}`, () => {
        if (!sprite.active) return;
        if (this.anims.exists(loop)) sprite.play(loop);
        this.time.delayedCall(900, playEnd);
      });
    } else {
      this.time.delayedCall(900, playEnd);
    }
    this._pokeSkill();
  }

  /**
   * @param {import('../assets/petSkills.js').PetSkillSpec} spec
   * @param {number} scale
   */
  _spawnRain(spec, scale) {
    const rain = spec.rain;
    const count = rain?.count || 7;
    const boltKey = spec.fx[0];
    const impact = spec.fx[1];
    for (let i = 0; i < count; i += 1) {
      const u = count === 1 ? 0 : i / (count - 1);
      const west = ((rain?.westMin ?? 40) + ((rain?.westMax ?? 140) - (rain?.westMin ?? 40)) * u) * LAYOUT_SCALE;
      const span = Math.max(1, count - 1);
      const up = ((rain?.upMin ?? 60) + ((rain?.upMax ?? 90) - (rain?.upMin ?? 60)) * ((i * 3) % count) / span) * LAYOUT_SCALE;
      const x = this.pet.x - west;
      const y = GROUND_Y - up;
      const sprite = this._spawnHeld(boltKey, x, y, scale, 24);
      if (!sprite) continue;
      this.movers.push({
        sprite,
        x,
        y,
        vx: (rain?.vxFrame ?? -2) * 60 * LAYOUT_SCALE,
        vy: (rain?.vyFrame ?? 6) * 60 * LAYOUT_SCALE,
        life: 1600,
        kind: 'rain',
        impact,
        scale,
        groundY: GROUND_Y - 8,
      });
    }
    if (this.movers.length === 0) this._pokeSkill();
  }

  /**
   * @param {import('../assets/petSkills.js').PetSkillSpec} spec
   * @param {number} scale
   */
  _spawnBolt(spec, scale) {
    const off = spec.spawnOffset || [0, 0];
    const from = framePoint(this.pet, off[0], off[1]);
    const aim = { x: DUMMY_X + 10, y: GROUND_Y - 90 };
    const speed = (spec.projectile?.pxPerFrame ?? 5) * 60 * LAYOUT_SCALE;
    const dx = aim.x - from.x;
    const dy = aim.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    const vx = (dx / len) * speed;
    const vy = (dy / len) * speed;
    const sprite = this._spawnHeld(spec.fx[0], from.x, from.y, scale, 24);
    if (sprite?.setRotation) sprite.setRotation(aimRotation(vx, vy, 'west'));
    if (!sprite) {
      this._pokeSkill();
      return;
    }
    this.movers.push({
      sprite,
      x: from.x,
      y: from.y,
      vx,
      vy,
      life: 1800,
      kind: 'bolt',
      impact: spec.fx[1],
      scale,
      stopX: DUMMY_X + 24,
    });
  }

  /**
   * @param {import('../assets/petSkills.js').PetSkillSpec} spec
   * @param {number} scale
   */
  _spawnFan(spec, scale) {
    const off = spec.spawnOffset || [0, 0];
    const from = framePoint(this.pet, off[0], off[1]);
    const degs = spec.fanDeg?.length ? spec.fanDeg : [0];
    degs.forEach((deg, index) => {
      const rad = (deg * Math.PI) / 180;
      const speed = 320;
      const vx = -Math.cos(rad) * speed;
      const vy = Math.sin(rad) * speed;
      const sprite = this._spawnHeld(spec.fx[0], from.x, from.y, scale, 24);
      if (sprite?.setRotation) sprite.setRotation(aimRotation(vx, vy, 'west'));
      if (!sprite) return;
      this.movers.push({
        sprite,
        x: from.x,
        y: from.y,
        vx,
        vy,
        life: 760,
        kind: 'bolt',
        impact: index === Math.floor(degs.length / 2) ? spec.fx[1] : '',
        scale,
        stopX: DUMMY_X + 16,
      });
    });
  }

  /**
   * @param {import('../assets/petSkills.js').PetSkillSpec} spec
   * @param {number} scale
   */
  _spawnTravel(spec, scale) {
    const dx = (spec.travelOffset?.[0] || -12) * scale;
    this.tweens.add({
      targets: this.pet,
      x: PET_X + dx,
      duration: 220,
      yoyo: true,
    });
    if (spec.fx[1]) {
      const at = framePoint(this.pet, spec.spawnOffset?.[0] || 0, spec.spawnOffset?.[1] || 0);
      this._track(playLibraryFx(this, at.x, at.y, spec.fx[0], { scale, depth: 18 }));
    }
    this.time.delayedCall(200, () => {
      const impact = spec.fx[1] || spec.fx[0];
      if (impact) {
        this._track(playLibraryFx(this, DUMMY_X + 16, GROUND_Y - 48, impact, { scale, depth: 23 }));
      }
      this._pokeSkill();
    });
  }

  /**
   * @param {import('../assets/petSkills.js').PetSkillSpec} spec
   * @param {number} scale
   */
  _spawnPlaced(spec, scale) {
    const off = spec.spawnOffset || [0, 0];
    const at = spec.aoe === 'ground'
      ? { x: (this.pet.x + DUMMY_X) / 2, y: GROUND_Y }
      : framePoint(this.pet, off[0], off[1]);
    this._track(playLibraryFx(this, at.x, at.y, spec.fx[0], { scale, depth: 22 }));
    if (spec.fx[1]) {
      this.time.delayedCall(260, () => {
        this._track(playLibraryFx(this, DUMMY_X, GROUND_Y - 70, spec.fx[1], { scale, depth: 23 }));
        this._pokeSkill();
      });
      return;
    }
    this._pokeSkill();
  }

  /**
   * @param {string} key
   * @param {number} x
   * @param {number} y
   * @param {number} scale
   * @param {number} depth
   */
  _spawnHeld(key, x, y, scale, depth) {
    if (!key || !this.textures.exists(key)) return null;
    const asset = libraryAsset(this, key);
    const sprite = this.add.sprite(x, y, key);
    const origin = asset?.origin || [0.5, 0.5];
    sprite.setOrigin(origin[0], origin[1]);
    if (scale) sprite.setScale(scale);
    sprite.setDepth(depth);
    playLibraryAnim(sprite, key, this);
    this.live.push(sprite);
    return sprite;
  }

  /**
   * @param {number} token
   * @param {() => void} [onFlash]
   */
  _playEvolveBurst(token, onFlash) {
    const key = tryoutEvolveFx(this.petId);
    const flash = () => {
      if (token !== this.token) return;
      onFlash?.();
    };
    if (!this.textures.exists(key)) {
      this.time.delayedCall(500, flash);
      return;
    }
    const asset = libraryAsset(this, key);
    const sprite = this.add.sprite(this.pet.x, this.pet.y, key);
    const origin = asset?.origin || [0.5, 0.92];
    sprite.setOrigin(origin[0], origin[1]);
    sprite.setScale(320 / (asset?.frameHeight || 128));
    sprite.setAlpha(0.72);
    sprite.setDepth(11);
    this.live.push(sprite);
    playLibraryAnim(sprite, key, this);
    let flashed = !onFlash;
    const onUpdate = (_anim, frame) => {
      if (flashed || token !== this.token) return;
      if ((frame?.index ?? 0) < 6) return;
      flashed = true;
      flash();
    };
    sprite.on('animationupdate', onUpdate);
    sprite.once(`animationcomplete-${key}`, () => {
      if (!flashed) {
        flashed = true;
        flash();
      }
      if (sprite.active) sprite.destroy();
    });
    this.time.delayedCall(520, () => {
      if (flashed || token !== this.token) return;
      flashed = true;
      flash();
    });
  }

  _pokeSkill() {
    if (this.struck) return;
    this.struck = true;
    this.audio?.playPetKnockback();
    this._shoveDummy();
    this._floatDamage(24);
  }

  _shoveDummy() {
    if (!this.dummy) return;
    this.tweens.killTweensOf(this.dummy);
    this.dummy.x = DUMMY_X;
    this.tweens.add({
      targets: this.dummy,
      x: DUMMY_X - 36,
      duration: 90,
      yoyo: true,
    });
  }

  /** @param {number} amount */
  _floatDamage(amount) {
    const role = PET_LINEUP.find((pet) => pet.id === this.petId);
    const tint = PET_ELEMENT_TINT[role?.element] ?? 0xffe08a;
    const color = `#${tint.toString(16).padStart(6, '0')}`;
    const text = this.add.text(DUMMY_X, GROUND_Y - 210, String(amount), {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '28px',
      color,
      fontStyle: 'bold',
    }).setOrigin(0.5).setDepth(45);
    this.tweens.add({
      targets: text,
      y: GROUND_Y - 270,
      alpha: 0,
      duration: 700,
      onComplete: () => text.destroy(),
    });
  }

  _drawLane() {
    const lane = this.add.graphics();
    lane.fillStyle(0x17211b, 1);
    lane.fillRect(0, GROUND_Y - 10, GAME_WIDTH, GAME_HEIGHT - GROUND_Y + 10);
    lane.fillStyle(0x314438, 1);
    lane.fillRect(0, GROUND_Y - 10, GAME_WIDTH, 14);
    lane.setDepth(1);
    this.add.text(DUMMY_X, GROUND_Y + 28, 'dummy', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      color: '#8d99ab',
    }).setOrigin(0.5).setDepth(6);
  }

  _makeDummy() {
    const dummy = this.add.container(DUMMY_X, GROUND_Y);
    const body = this.add.graphics();
    body.fillStyle(0x243028, 1);
    body.fillRoundedRect(-34, -148, 68, 148, 10);
    body.fillStyle(0x8ea38a, 1);
    body.fillCircle(0, -170, 24);
    body.lineStyle(3, 0x7bd88f, 1);
    body.strokeRoundedRect(-34, -148, 68, 148, 10);
    dummy.add(body);
    dummy.setDepth(8);
    this.dummy = dummy;
  }

  _name() {
    const role = PET_LINEUP.find((pet) => pet.id === this.petId);
    const element = role?.elementZh || role?.element || '';
    return `${this.petId} · ${element} · ${this.form}`;
  }

  /** @param {string} text */
  _status(text) {
    this._statusText = text;
    if (this.caption) this.caption.setText(text);
    this._publish();
  }

  _publish() {
    const detail = {
      id: this.petId,
      form: this.form,
      out: this.out,
      text: this._statusText || '',
    };
    globalThis.__ZD_PET_STATE = detail;
    globalThis.__ZD_PET_PAINT?.(detail);
  }
}

export function bootPetTryout() {
  const config = {
    type: Phaser.AUTO,
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    parent: 'game-host',
    backgroundColor: '#101610',
    scene: [PetTryoutScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      pixelArt: true,
      roundPixels: true,
    },
  };
  const game = new Phaser.Game(config);
  globalThis.__ZD_PET_GAME = game;
  return game;
}

if (typeof window !== 'undefined' && window.Phaser) {
  bootPetTryout();
}
