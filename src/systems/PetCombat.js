import { GAME_CONFIG } from '../data/GameConfig.js';
import { DAMAGE_COLORS, showDamageText } from '../ui/damageText.js';
import { PET_ELEMENT_TINT, PET_LINEUP, petLineupSlots, petSleepDepth } from '../assets/petLineup.js';
import { aimRotation, libraryAsset, playLibraryFx } from '../assets/libraryAssets.js';
import {
  barricadeXAtY,
  depthFromY,
  displayScaleFromY,
  grassYMax,
  grassYMin,
  LAYOUT_SCALE,
  layoutPx,
  spawnWorldX,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './DepthView.js';

const EMPTY = { gold: 0, kills: 0 };

/** 4 frames at 8 fps. Sleep-start, then the loop. */
const SLEEP_START_MS = 500;
/** Idle beat when a sleeping pet is called back out. */
const WAKE_MS = 280;

/**
 * Named for a later SFX pass. Recorded on cueLog and not sent to SoundManager.
 * go-shout, back-shout, pet-sleep
 */
export const PET_AUDIO_KEYS = Object.freeze({
  go: 'go-shout',
  back: 'back-shout',
  sleep: 'pet-sleep',
});

/** Tinted circles stand in for form-2 / form-3 FX until themed art exists. */
const PLACEHOLDER_TINT = {
  phoenix: 0xff6d00,
  panda: 0xb3e5fc,
  lion: 0xffee58,
  dragon: 0x76ff03,
};

/**
 * Summoned baby pets. Off the field until the bar is tapped.
 * Tap again to recall: Back! floats beside the pet, then it walks to an
 * empty bed behind the barricade, plays sleep-start once, and loops sleep.
 * Resummon wakes that body and walks it out. Regen still runs off the field.
 * There is no deploy cooldown and no on-field time limit.
 * Death (HP ≤ 0) greys the bar for REVIVE_CD_MS.
 * While out, the pet walks to the nearest fence threat. Each unlocked orb
 * fills, flashes, then auto-casts. Form 1 uses the v0.19 baby cast.
 * Forms 2 and 3 use placeholder circles and stay locked until evolution.
 * A bite flashes the body, plays the hurt strip once, and pops both HP bars.
 * The camera does not shake.
 */
export class PetCombat {
  /** @param {Phaser.Scene} scene */
  constructor(scene) {
    this.scene = scene;
    /** @type {PetActor[]} */
    this._actors = PET_LINEUP.map((role) => this._makeActor(role));
    /** @type {PhoenixBolt[]} */
    this._bolts = [];
    /** @type {DiveCharge[]} */
    this._charges = [];
    /** @type {GroundZone[]} */
    this._zones = [];
    /** @type {FxBlob[]} */
    this._blobs = [];
    /** @type {{ id: string, orb: number }[]} */
    this.castLog = [];
    /** @type {string[]} */
    this.fxLog = [];
    /** @type {{ id: string, key: string, which: string }[]} */
    this.floatLog = [];
    /** @type {string[]} Cue names only. SoundManager is not called. */
    this.cueLog = [];
    /** @type {number|null} overrides GAME_CONFIG.PETS.UNLOCKED_ORBS when set */
    this._unlockedOrbs = null;
  }

  /**
   * Evolution hook. 1 is form 1 only. 3 unlocks the placeholder forms.
   * @param {number} count
   */
  setUnlockedOrbs(count) {
    const n = Number(count);
    this._unlockedOrbs = Number.isFinite(n) ? Math.max(0, Math.min(3, Math.floor(n))) : null;
  }

  _unlockedCount() {
    if (this._unlockedOrbs == null) return GAME_CONFIG.PETS.UNLOCKED_ORBS;
    return this._unlockedOrbs;
  }

  /**
   * Tap the bar. Ready → summon. Field → recall. Revive → blocked.
   * Enemies are not required, and there is no deploy cooldown.
   * @param {number} index party order
   * @param {{ x?: number, y?: number }|null} player
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @returns {{ ok: boolean, reason: string, id?: string }}
   */
  summon(index, player, zombies) {
    const actor = this._actors[index];
    if (!actor) return { ok: false, reason: 'missing' };
    if (actor.phase === 'revive') return { ok: false, reason: 'revive' };
    if (actor.phase === 'field') {
      this._recall(actor);
      return { ok: true, reason: 'recall', id: actor.role.id };
    }
    this._deploy(actor, player);
    this.scene?.audio?.playPetSummon?.();
    void zombies;
    return { ok: true, reason: 'ok', id: actor.role.id };
  }

  /** Living pets currently out. Positions track the sprite. */
  fieldPets() {
    const radius = layoutPx(GAME_CONFIG.PETS.BITE_RADIUS);
    /** @type {FieldPet[]} */
    const out = [];
    for (const actor of this._actors) {
      if (actor.phase !== 'field' || !(actor.hp > 0) || !actor.sprite?.active) continue;
      out.push({
        id: actor.role.id,
        radius,
        get x() {
          return actor.sprite?.x ?? actor.x;
        },
        get y() {
          return actor.sprite?.y ?? actor.y;
        },
        get hp() {
          return actor.hp;
        },
        get alive() {
          return actor.phase === 'field' && actor.hp > 0;
        },
        takeDamage: (amount) => this._damage(actor, amount),
      });
    }
    return out;
  }

  /** One view per party slot, top → bottom. */
  portraitViews() {
    const unlockedCount = this._unlockedCount();
    return this._actors.map((actor) => ({
      id: actor.role.id,
      element: actor.role.element,
      elementZh: actor.role.elementZh,
      color: PET_ELEMENT_TINT[actor.role.element] ?? 0xffffff,
      phase: actor.phase,
      tappable: actor.phase !== 'revive',
      grey: actor.phase === 'revive',
      hp: actor.maxHp > 0 ? clamp01(actor.hp / actor.maxHp) : 0,
      hitSeq: actor.hitSeq || 0,
      barKey: actor.role.hudBar,
      headKey: actor.role.hudHead,
      orbs: actor.orbs.map((orb) => this._orbView(orb, unlockedCount)),
    }));
  }

  /**
   * @param {OrbState} orb
   * @param {number} unlockedCount
   */
  _orbView(orb, unlockedCount) {
    const unlocked = orb.index < unlockedCount;
    /** @type {'locked'|'cd'|'flash'} */
    let state = 'locked';
    let ratio = 0;
    if (unlocked) {
      if (orb.flashLeft > 0 || orb.pending) {
        state = 'flash';
        ratio = 1;
      } else {
        state = 'cd';
        ratio = orb.cdMs > 0 ? clamp01(1 - orb.left / orb.cdMs) : 1;
      }
    }
    return {
      index: orb.index,
      unlocked,
      state,
      ratio,
      dark: orb.dark,
      lit: orb.lit,
      flash: orb.flash,
    };
  }

  /**
   * @param {number} deltaMs
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {{ x?: number, y?: number }|null} [player]
   * @returns {{ gold: number, kills: number }}
   */
  update(deltaMs, zombies, player = null) {
    const dt = Number.isFinite(deltaMs) ? deltaMs : 0;
    const list = Array.isArray(zombies) ? zombies : [];
    const threat = nearestBarricadeThreat(list);
    let gold = 0;
    let kills = 0;
    for (const actor of this._actors) {
      if (actor.phase === 'revive') {
        this._tickRevive(actor, dt);
        this._tickFloat(actor, dt);
        continue;
      }
      if (actor.phase === 'ready') {
        this._tickRegen(actor, dt);
        this._tickRest(actor, dt);
        this._tickFloat(actor, dt);
        continue;
      }
      if (actor.phase !== 'field') {
        this._tickFloat(actor, dt);
        continue;
      }
      const gain = this._tickField(actor, dt, list, threat, player);
      gold += gain.gold;
      kills += gain.kills;
      if (actor.phase !== 'field') {
        this._tickFloat(actor, dt);
        continue;
      }
      this._tickOrbs(actor, dt);
      if (!(actor.hp > 0)) this._dismiss(actor);
      this._tickFloat(actor, dt);
    }
    this._stepBolts(dt / 1000);
    const bolts = this._resolveBolts(list);
    gold += bolts.gold;
    kills += bolts.kills;
    const charges = this._stepCharges(dt, list);
    gold += charges.gold;
    kills += charges.kills;
    const zones = this._stepZones(dt, list);
    gold += zones.gold;
    kills += zones.kills;
    this._stepBlobs(dt);
    return { gold, kills };
  }

  destroy() {
    for (const bolt of this._bolts) destroySprite(bolt?.sprite);
    this._bolts = [];
    for (const charge of this._charges) destroySprite(charge?.node);
    this._charges = [];
    for (const zone of this._zones) destroySprite(zone?.node);
    this._zones = [];
    for (const blob of this._blobs) destroySprite(blob?.node);
    this._blobs = [];
    for (const actor of this._actors) {
      this._clearFloat(actor);
      this._destroyBars(actor);
      destroySprite(actor.sprite);
      actor.sprite = null;
      actor.phase = 'ready';
      actor.rest = null;
      actor.sleepSlot = null;
      actor.tucked = false;
      actor.hp = actor.maxHp;
    }
  }

  /** @param {import('../assets/petLineup.js').PET_LINEUP[number]} role */
  _makeActor(role) {
    const cds = GAME_CONFIG.PETS.ORB_CD_MS[role.id] || [8000, 16000, 24000];
    return {
      role,
      phase: 'ready',
      hp: GAME_CONFIG.PETS.HP,
      maxHp: GAME_CONFIG.PETS.HP,
      reviveLeft: 0,
      sprite: null,
      hpBg: null,
      hpFg: null,
      state: 'idle',
      attackElapsed: 0,
      released: false,
      hurtLeft: 0,
      hurtReactLeft: 0,
      flashLeft: 0,
      tintLeft: 0,
      barFlashLeft: 0,
      hitSeq: 0,
      popLeft: 0,
      rest: null,
      sleepSlot: null,
      sleepX: 0,
      sleepY: 0,
      settleLeft: 0,
      wakeLeft: 0,
      leaving: false,
      tucked: false,
      float: null,
      floatLeft: 0,
      floatFade: 0,
      drawDepth: 0,
      latched: false,
      latchId: null,
      destX: 0,
      destY: 0,
      x: 0,
      y: 0,
      /** @type {number[]} orb indexes waiting on the skill swing */
      castQueue: [],
      orbs: cds.map((cdMs, index) => ({
        index,
        cdMs,
        left: cdMs,
        flashLeft: 0,
        pending: false,
        dark: role.orbDark,
        lit: role.orbLit,
        flash: role.orbFlash,
      })),
    };
  }

  /**
   * @param {PetActor} actor
   * @param {{ x?: number, y?: number }|null} player
   */
  _deploy(actor, player) {
    if (actor.sprite?.active) {
      this._wake(actor);
      return;
    }
    const point = deployPoint(player);
    const x = point.x;
    const y = point.y;
    actor.phase = 'field';
    if (!(actor.hp > 0)) actor.hp = actor.maxHp;
    actor.state = 'idle';
    actor.rest = null;
    actor.sleepSlot = null;
    actor.settleLeft = 0;
    actor.wakeLeft = 0;
    actor.leaving = false;
    actor.tucked = false;
    actor.attackElapsed = 0;
    actor.released = false;
    this._clearHitLook(actor);
    actor.latched = false;
    actor.latchId = null;
    actor.castQueue = [];
    actor.destX = x;
    actor.destY = y;
    actor.x = x;
    actor.y = y;
    actor.popLeft = GAME_CONFIG.PETS.POP_MS;
    actor.sprite = this._spawnSprite(actor, x, y);
    this._attachBars(actor);
    this._showFloat(actor, 'go');
    this._noteCue(PET_AUDIO_KEYS.go);
  }

  /**
   * Stand up where they are and walk out. The sprite is not respawned.
   * @param {PetActor} actor
   */
  _wake(actor) {
    const lying = actor.rest === 'sleep' || actor.rest === 'settle';
    actor.phase = 'field';
    actor.rest = null;
    actor.sleepSlot = null;
    actor.settleLeft = 0;
    actor.state = 'idle';
    actor.wakeLeft = lying ? WAKE_MS : 0;
    actor.leaving = true;
    actor.attackElapsed = 0;
    actor.released = false;
    this._clearHitLook(actor);
    actor.latched = false;
    actor.latchId = null;
    actor.castQueue = [];
    actor.popLeft = 0;
    if (actor.sprite && typeof actor.sprite.setAlpha === 'function') actor.sprite.setAlpha(1);
    faceLeft(actor.sprite);
    playLoop(actor.sprite, actor.role.key);
    this._destroyBars(actor);
    this._attachBars(actor);
    this._place(actor);
    this._showFloat(actor, 'go');
    this._noteCue(PET_AUDIO_KEYS.go);
  }

  /**
   * Leave the field at the current HP and walk to an empty bed.
   * The sprite stays. A flash that had not released yet resumes next time out.
   * @param {PetActor} actor
   */
  _recall(actor) {
    if (actor.phase !== 'field') return;
    const sprite = actor.sprite;
    actor.phase = 'ready';
    actor.state = 'idle';
    actor.rest = sprite?.active ? 'seek' : null;
    actor.castQueue = [];
    actor.latched = false;
    actor.latchId = null;
    this._clearHitLook(actor);
    actor.attackElapsed = 0;
    actor.released = false;
    actor.wakeLeft = 0;
    actor.leaving = false;
    actor.popLeft = 0;
    for (const orb of actor.orbs) {
      if (!orb.pending) continue;
      orb.pending = false;
      orb.left = 0;
      orb.flashLeft = GAME_CONFIG.PETS.ORB_FLASH_MS;
    }
    this._destroyBars(actor);
    if (!sprite?.active) return;
    this.scene?.tweens?.killTweensOf?.(sprite);
    if (typeof sprite.setScale === 'function') sprite.setScale(displayScaleFromY(sprite.y));
    if (typeof sprite.setAlpha === 'function') sprite.setAlpha(1);
    this._claimBed(actor);
    this._showFloat(actor, 'back');
    this._noteCue(PET_AUDIO_KEYS.back);
  }

  /**
   * Party index when that bed is free, otherwise the first open rank.
   * @param {PetActor} actor
   */
  _claimBed(actor) {
    const slots = petLineupSlots();
    const taken = new Set();
    for (const other of this._actors) {
      if (other === actor) continue;
      if (other.sleepSlot == null) continue;
      if (!other.sprite?.active && other.rest == null) continue;
      taken.add(other.sleepSlot);
    }
    let index = this._actors.indexOf(actor);
    if (index < 0) index = 0;
    if (taken.has(index)) {
      const free = slots.findIndex((_, i) => !taken.has(i));
      if (free >= 0) index = free;
    }
    const slot = slots[index] || slots[0];
    actor.sleepSlot = slot ? index : null;
    actor.sleepX = slot?.x ?? actor.x;
    actor.sleepY = slot?.y ?? actor.y;
  }

  /**
   * @param {number} index
   * @returns {{ id: string, x: number, y: number, rest: string|null, depth: number, slot: number|null }|null}
   */
  restSpot(index) {
    const actor = this._actors[index];
    if (!actor?.sprite?.active || actor.phase === 'field' || actor.phase === 'revive') return null;
    return {
      id: actor.role.id,
      x: actor.sprite.x,
      y: actor.sprite.y,
      rest: actor.rest,
      depth: actor.drawDepth,
      slot: actor.sleepSlot,
    };
  }

  /** @param {PetActor} actor @param {number} dt */
  _tickRest(actor, dt) {
    if (!actor.sprite?.active || !actor.rest) return;
    if (actor.rest === 'seek') this._stepSeek(actor, dt);
    else if (actor.rest === 'settle') this._stepSettle(actor, dt);
    else if (actor.rest === 'sleep') this._stepSleep(actor);
  }

  /** @param {PetActor} actor @param {number} dt */
  _stepSeek(actor, dt) {
    const sprite = actor.sprite;
    if (!sprite) return;
    const dx = actor.sleepX - sprite.x;
    const dy = actor.sleepY - sprite.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= layoutPx(5)) {
      sprite.x = actor.sleepX;
      sprite.y = actor.sleepY;
      actor.x = sprite.x;
      actor.y = sprite.y;
      this._beginSettle(actor);
      return;
    }
    const step = GAME_CONFIG.PETS.MOVE_SPEED * LAYOUT_SCALE * (dt / 1000);
    const span = Math.max(dist, 0.001);
    sprite.x += dx * Math.min(1, step / span);
    sprite.y += dy * Math.min(1, step / span);
    actor.x = sprite.x;
    actor.y = sprite.y;
    actor.state = 'move';
    const moveKey = actor.role.move;
    if (moveKey && sprite.scene?.anims?.exists?.(moveKey)) playLoop(sprite, moveKey);
    else playLoop(sprite, actor.role.key);
    if (typeof sprite.setFlipX === 'function') sprite.setFlipX(dx > layoutPx(2));
    this._placeRest(actor);
  }

  /** @param {PetActor} actor */
  _beginSettle(actor) {
    actor.rest = 'settle';
    actor.tucked = true;
    faceLeft(actor.sprite);
    this._noteCue(PET_AUDIO_KEYS.sleep);
    const key = actor.role.sleepStart;
    const played = playOnce(actor.sprite, key);
    actor.settleLeft = played ? SLEEP_START_MS : 0;
    const sprite = actor.sprite;
    if (played && sprite && typeof sprite.once === 'function') {
      sprite.once('animationcomplete', (anim) => {
        const doneKey = typeof anim === 'string' ? anim : anim?.key;
        if (actor.rest === 'settle' && doneKey === key) actor.settleLeft = 0;
      });
    }
    this._placeRest(actor);
    if (actor.settleLeft <= 0) this._beginSleepLoop(actor);
  }

  /** @param {PetActor} actor @param {number} dt */
  _stepSettle(actor, dt) {
    actor.settleLeft -= dt;
    this._placeRest(actor);
    if (actor.settleLeft > 0) return;
    this._beginSleepLoop(actor);
  }

  /** @param {PetActor} actor */
  _beginSleepLoop(actor) {
    if (actor.rest === 'sleep') return;
    actor.rest = 'sleep';
    actor.settleLeft = 0;
    actor.tucked = true;
    const sprite = actor.sprite;
    const loopKey = `${actor.role.sleep}:loop`;
    if (sprite?.scene?.anims?.exists?.(loopKey)) playLoop(sprite, loopKey);
    else playLoop(sprite, actor.role.sleep);
    faceLeft(sprite);
    this._placeRest(actor);
  }

  /** @param {PetActor} actor */
  _stepSleep(actor) {
    const sprite = actor.sprite;
    if (!sprite) return;
    sprite.x = actor.sleepX;
    sprite.y = actor.sleepY;
    const loopKey = `${actor.role.sleep}:loop`;
    const current = sprite.anims?.currentAnim?.key;
    if (current !== loopKey && current !== actor.role.sleep) {
      if (sprite.scene?.anims?.exists?.(loopKey)) playLoop(sprite, loopKey);
      else playLoop(sprite, actor.role.sleep);
    }
    this._placeRest(actor);
  }

  /** @param {PetActor} actor */
  _placeRest(actor) {
    const sprite = actor.sprite;
    if (!sprite) return;
    const y = clampGrass(sprite.y);
    sprite.y = y;
    actor.x = sprite.x;
    actor.y = y;
    if (typeof sprite.setScale === 'function') sprite.setScale(displayScaleFromY(y));
    const depth = restingBehindFence(actor) ? petSleepDepth(y) : depthFromY(y, -1);
    actor.drawDepth = depth;
    sprite.setDepth?.(depth);
    if (actor.rest === 'settle' || actor.rest === 'sleep') faceLeft(sprite);
  }

  /**
   * @param {PetActor} actor
   * @param {'go'|'back'} which
   */
  _showFloat(actor, which) {
    this._clearFloat(actor);
    const primary = which === 'go' ? 'ui-float-go' : 'ui-float-back';
    const burst = which === 'go' ? 'ui-float-go-burst' : 'ui-float-back-burst';
    const scene = this.scene;
    let key = null;
    if (scene?.textures?.exists?.(primary)) key = primary;
    else if (scene?.textures?.exists?.(burst)) key = burst;
    this.floatLog.push({ id: actor.role.id, key: key || primary, which });
    if (!key || !scene?.add?.sprite || !actor.sprite) return;
    const node = scene.add.sprite(actor.sprite.x, actor.sprite.y, key);
    const asset = libraryAsset(scene, key);
    const origin = asset?.origin ?? [0.5, 1];
    node.setOrigin?.(origin[0], origin[1]);
    if (typeof node.setScale === 'function') node.setScale(1);
    node.setData?.('float', which);
    actor.float = node;
    actor.floatLeft = GAME_CONFIG.PETS.FLOAT_HOLD_MS;
    actor.floatFade = GAME_CONFIG.PETS.FLOAT_FADE_MS;
    this._placeFloat(actor);
  }

  /** @param {PetActor} actor */
  _placeFloat(actor) {
    const node = actor.float;
    const sprite = actor.sprite;
    if (!node || !sprite) return;
    node.x = sprite.x + layoutPx(30);
    node.y = sprite.y - layoutPx(40);
    node.setDepth?.(depthFromY(sprite.y, 8));
  }

  /** @param {PetActor} actor @param {number} dt */
  _tickFloat(actor, dt) {
    const node = actor.float;
    if (!node) return;
    if (node.active === false) {
      actor.float = null;
      return;
    }
    this._placeFloat(actor);
    let remain = Number.isFinite(dt) ? dt : 0;
    if (actor.floatLeft > 0) {
      const use = Math.min(remain, actor.floatLeft);
      actor.floatLeft -= use;
      remain -= use;
      if (typeof node.setAlpha === 'function') node.setAlpha(1);
    }
    if (remain > 0 && actor.floatLeft <= 0) {
      actor.floatFade -= remain;
      const fade = GAME_CONFIG.PETS.FLOAT_FADE_MS;
      const alpha = fade > 0 ? Math.max(0, actor.floatFade / fade) : 0;
      if (typeof node.setAlpha === 'function') node.setAlpha(alpha);
      if (actor.floatFade <= 0) this._clearFloat(actor);
    }
  }

  /** @param {PetActor} actor */
  _clearFloat(actor) {
    destroySprite(actor.float);
    actor.float = null;
    actor.floatLeft = 0;
    actor.floatFade = 0;
  }

  /**
   * Key name only. The audio pass cues this later.
   * @param {string} name
   */
  _noteCue(name) {
    if (!name) return;
    this.cueLog.push(name);
  }

  /**
   * @param {PetActor} actor
   * @param {number} x
   * @param {number} y
   */
  _spawnSprite(actor, x, y) {
    const scene = this.scene;
    const key = actor.role.key;
    const scale = displayScaleFromY(y);
    /** @type {Phaser.GameObjects.Sprite|Phaser.GameObjects.Rectangle|null} */
    let sprite = null;
    if (key && scene?.textures?.exists?.(key) && scene.add?.sprite) {
      sprite = scene.add.sprite(x, y, key, 0);
      const asset = libraryAsset(scene, key);
      const origin = asset?.origin ?? [0.5, 1];
      sprite.setOrigin?.(origin[0], origin[1]);
      if (scene.anims?.exists?.(key)) sprite.play?.(key);
    } else if (scene?.add?.rectangle) {
      const tint = PET_ELEMENT_TINT[actor.role.element] ?? 0xffffff;
      sprite = scene.add.rectangle(x, y, layoutPx(16), layoutPx(22), tint);
    }
    if (!sprite) return null;
    sprite.setData?.('petId', actor.role.id);
    if (typeof sprite.setFlipX === 'function') sprite.setFlipX(false);
    if (typeof sprite.setScale === 'function') sprite.setScale(scale * 0.3);
    sprite.setDepth?.(depthFromY(y, -1));
    scene.tweens?.add?.({
      targets: sprite,
      scaleX: scale,
      scaleY: scale,
      duration: GAME_CONFIG.PETS.POP_MS,
      ease: 'Back.easeOut',
    });
    return sprite;
  }

  /** @param {PetActor} actor */
  _attachBars(actor) {
    const scene = this.scene;
    const sprite = actor.sprite;
    if (!sprite || !scene?.add?.rectangle) return;
    const w = layoutPx(26);
    const h = layoutPx(4);
    const y = sprite.y - layoutPx(36);
    const tint = PET_ELEMENT_TINT[actor.role.element] ?? 0xfff3c4;
    actor.hpBg = scene.add.rectangle(sprite.x, y, w, h, 0x14080a);
    actor.hpFg = scene.add.rectangle(sprite.x - w / 2, y, w, h, tint).setOrigin?.(0, 0.5);
    if (actor.hpFg) actor.hpFg.setOrigin?.(0, 0.5);
  }

  /**
   * @param {PetActor} actor
   * @param {number} amount
   * @returns {boolean} true when this hit removed the pet
   */
  _damage(actor, amount) {
    if (actor.phase !== 'field' || !(actor.hp > 0)) return false;
    const dmg = Number(amount);
    if (!(dmg > 0) || !Number.isFinite(dmg)) return false;
    actor.hp -= dmg;
    const sprite = actor.sprite;
    if (sprite) {
      const hy = sprite.y - layoutPx(28);
      showDamageText(this.scene, sprite.x, hy, dmg, '#ffffff', `pet-${actor.role.id}`);
    }
    if (!(actor.hurtReactLeft > 0)) this._beginHitReact(actor);
    if (actor.hp <= 0) {
      actor.hp = 0;
      this._dismiss(actor);
      return true;
    }
    this._syncBars(actor);
    return false;
  }

  /**
   * One flinch per HURT_MS. Bite DPS arrives every frame; restarting the
   * strip each frame held the pet on frame 0. A cast already in progress
   * keeps playing — the flash and bars still react.
   * @param {PetActor} actor
   */
  _beginHitReact(actor) {
    const pets = GAME_CONFIG.PETS;
    actor.hurtReactLeft = pets.HURT_MS;
    actor.flashLeft = pets.HURT_FLASH_MS;
    actor.tintLeft = pets.HURT_FLASH_MS + pets.HURT_TINT_MS;
    actor.barFlashLeft = pets.HURT_BAR_MS;
    actor.hitSeq = (actor.hitSeq || 0) + 1;
    this._paintHit(actor, 'flash');
    if (actor.state === 'attack') return;
    actor.hurtLeft = pets.HURT_MS;
    playOnce(actor.sprite, actor.role.hurt);
  }

  /**
   * @param {PetActor} actor
   * @param {'flash'|'hurt'|'clear'} mode
   */
  _paintHit(actor, mode) {
    const sprite = actor.sprite;
    if (!sprite?.active) return;
    const element = PET_ELEMENT_TINT[actor.role.element] ?? 0xffffff;
    if (mode === 'flash') {
      if (typeof sprite.setTintFill === 'function') {
        sprite.setTintFill(GAME_CONFIG.JUICE.HIT_FLASH_COLOR);
        return;
      }
      if (typeof sprite.setFillStyle === 'function') sprite.setFillStyle(GAME_CONFIG.JUICE.HIT_FLASH_COLOR);
      return;
    }
    if (mode === 'hurt') {
      if (typeof sprite.clearTint === 'function') sprite.clearTint();
      if (typeof sprite.setTint === 'function') {
        sprite.setTint(0xff5252);
        return;
      }
      if (typeof sprite.setFillStyle === 'function') sprite.setFillStyle(0xff5252);
      return;
    }
    if (typeof sprite.clearTint === 'function') sprite.clearTint();
    if (typeof sprite.setFillStyle === 'function' && typeof sprite.setTintFill !== 'function') {
      sprite.setFillStyle(element);
    }
  }

  /** Drop a flinch so recall, wake, and a fresh deploy are not stuck tinted. @param {PetActor} actor */
  _clearHitLook(actor) {
    actor.hurtLeft = 0;
    actor.hurtReactLeft = 0;
    actor.flashLeft = 0;
    actor.tintLeft = 0;
    actor.barFlashLeft = 0;
    this._paintHit(actor, 'clear');
  }

  /**
   * White fill, then the red tint, then clear. Bar heat ticks here too.
   * @param {PetActor} actor
   * @param {number} dt
   */
  _tickHitLook(actor, dt) {
    if (actor.hurtReactLeft > 0) actor.hurtReactLeft = Math.max(0, actor.hurtReactLeft - dt);
    if (actor.barFlashLeft > 0) actor.barFlashLeft = Math.max(0, actor.barFlashLeft - dt);
    if (!(actor.flashLeft > 0) && !(actor.tintLeft > 0)) return;
    const flashing = actor.flashLeft > 0;
    if (actor.flashLeft > 0) actor.flashLeft = Math.max(0, actor.flashLeft - dt);
    if (actor.tintLeft > 0) actor.tintLeft = Math.max(0, actor.tintLeft - dt);
    if (flashing && !(actor.flashLeft > 0)) {
      this._paintHit(actor, actor.tintLeft > 0 ? 'hurt' : 'clear');
    } else if (!(actor.tintLeft > 0)) {
      this._paintHit(actor, 'clear');
    }
  }

  /** @param {PetActor} actor */
  _dismiss(actor) {
    if (actor.phase !== 'field') return;
    const sprite = actor.sprite;
    actor.sprite = null;
    actor.hp = 0;
    actor.latched = false;
    actor.latchId = null;
    actor.state = 'idle';
    actor.hurtLeft = 0;
    actor.castQueue = [];
    actor.rest = null;
    actor.sleepSlot = null;
    actor.settleLeft = 0;
    actor.wakeLeft = 0;
    actor.leaving = false;
    actor.tucked = false;
    actor.hurtReactLeft = 0;
    actor.flashLeft = 0;
    actor.tintLeft = 0;
    actor.barFlashLeft = 0;
    actor.phase = 'revive';
    actor.reviveLeft = GAME_CONFIG.PETS.REVIVE_CD_MS;
    for (const orb of actor.orbs) {
      orb.pending = false;
      orb.flashLeft = 0;
      orb.left = orb.cdMs;
    }
    this._destroyBars(actor);
    this._clearFloat(actor);
    this.scene?.audio?.playPetDeath?.();
    this._fadeOut(sprite);
  }

  /** @param {Phaser.GameObjects.GameObject|null|undefined} sprite */
  _fadeOut(sprite) {
    if (!sprite) return;
    if (this.scene?.tweens?.add) {
      this.scene.tweens.add({
        targets: sprite,
        alpha: 0,
        duration: 140,
        onComplete: () => destroySprite(sprite),
      });
      return;
    }
    destroySprite(sprite);
  }

  /** @param {PetActor} actor @param {number} dt */
  _tickRegen(actor, dt) {
    if (!(actor.hp > 0) || actor.hp >= actor.maxHp) return;
    const ratio = GAME_CONFIG.PETS.OFF_FIELD_REGEN_RATIO;
    const gain = actor.maxHp * ratio * (dt / 1000);
    actor.hp = Math.min(actor.maxHp, actor.hp + gain);
  }

  /** @param {PetActor} actor @param {number} dt */
  _tickRevive(actor, dt) {
    actor.reviveLeft = Math.max(0, actor.reviveLeft - dt);
    if (actor.reviveLeft > 0) return;
    actor.reviveLeft = 0;
    actor.phase = 'ready';
    actor.hp = actor.maxHp;
    this.scene?.audio?.playPetReviveReady?.();
  }

  /**
   * @param {PetActor} actor
   * @param {number} dt
   */
  _tickOrbs(actor, dt) {
    if (actor.phase !== 'field' || actor.wakeLeft > 0) return;
    const unlocked = this._unlockedCount();
    for (const orb of actor.orbs) {
      if (orb.index >= unlocked) continue;
      this._tickOrb(actor, orb, dt);
    }
  }

  /**
   * CD fills, then the orb flashes, then the cast is committed.
   * The cooldown restarts when the skill actually releases.
   * @param {PetActor} actor
   * @param {OrbState} orb
   * @param {number} dt
   */
  _tickOrb(actor, orb, dt) {
    if (orb.pending || actor.phase !== 'field') return;
    let remain = Math.max(0, dt);
    let guard = 0;
    while (remain > 0 && guard < 12 && !orb.pending) {
      guard += 1;
      if (orb.flashLeft > 0) {
        const use = Math.min(remain, orb.flashLeft);
        orb.flashLeft -= use;
        remain -= use;
        if (orb.flashLeft <= 0) {
          orb.flashLeft = 0;
          orb.pending = true;
          this._commitOrb(actor, orb.index);
        }
        continue;
      }
      if (orb.left > remain) {
        orb.left -= remain;
        return;
      }
      remain -= orb.left;
      orb.left = 0;
      orb.flashLeft = GAME_CONFIG.PETS.ORB_FLASH_MS;
    }
  }

  /**
   * @param {PetActor} actor
   * @param {number} orbIndex
   */
  _commitOrb(actor, orbIndex) {
    actor.castQueue.push(orbIndex);
    if (actor.state === 'attack') return;
    this._beginAttack(actor);
  }

  /**
   * @param {PetActor} actor
   * @param {number} deltaMs
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {import('../entities/Zombie.js').Zombie|null} threat
   * @param {{ x?: number, y?: number }|null} player
   */
  _tickField(actor, deltaMs, zombies, threat, player) {
    const sprite = actor.sprite;
    if (!sprite?.active) return EMPTY;
    let dt = Number.isFinite(deltaMs) ? deltaMs : 0;
    this._tickHitLook(actor, dt);
    if (actor.popLeft > 0) actor.popLeft = Math.max(0, actor.popLeft - dt);
    this._place(actor);

    if (actor.wakeLeft > 0) {
      const use = Math.min(actor.wakeLeft, dt);
      actor.wakeLeft -= use;
      dt -= use;
      playLoop(sprite, actor.role.key);
      faceLeft(sprite);
      this._place(actor);
      if (actor.wakeLeft > 0 || dt <= 0) return EMPTY;
    }

    if (actor.state === 'attack') {
      actor.attackElapsed += dt;
      return this._advanceAttack(actor, zombies, threat);
    }

    if (actor.hurtLeft > 0) {
      actor.hurtLeft -= dt;
      const hurt = actor.role.hurt;
      const onHurt = sprite.anims?.currentAnim?.key === hurt;
      const playing = onHurt && sprite.anims?.isPlaying;
      if (!playing && !onHurt && !playOnce(sprite, hurt)) playLoop(sprite, actor.role.key);
      faceLeft(sprite);
      return EMPTY;
    }

    this._stepMove(actor, threat, player, dt);
    return EMPTY;
  }

  /**
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie|null} threat
   * @param {{ x?: number, y?: number }|null} player
   * @param {number} deltaMs
   */
  _stepMove(actor, threat, player, deltaMs) {
    const sprite = actor.sprite;
    if (!sprite) return;
    if (!threat) {
      if (actor.leaving) {
        this._stepOutbound(actor, player, deltaMs);
        return;
      }
      actor.state = 'idle';
      playLoop(sprite, actor.role.key);
      faceLeft(sprite);
      return;
    }
    actor.leaving = false;
    if (actor.latchId !== threat.id) {
      actor.latched = false;
      actor.latchId = threat.id;
    }
    if (!actor.latched) {
      const dest = this._aimPoint(actor, threat, player);
      actor.destX = dest.x;
      actor.destY = dest.y;
    }
    const dx = actor.destX - sprite.x;
    const dy = actor.destY - sprite.y;
    const dist = Math.hypot(dx, dy);
    const arrive = layoutPx(5);
    if (dist <= arrive) {
      actor.latched = true;
      sprite.x = actor.destX;
      sprite.y = actor.destY;
      actor.state = 'idle';
      playLoop(sprite, actor.role.key);
      faceLeft(sprite);
      this._place(actor);
      return;
    }
    const step = GAME_CONFIG.PETS.MOVE_SPEED * LAYOUT_SCALE * (deltaMs / 1000);
    const span = Math.max(dist, 0.001);
    sprite.x += dx * Math.min(1, step / span);
    sprite.y += dy * Math.min(1, step / span);
    actor.state = 'move';
    const moveKey = actor.role.move;
    if (moveKey && sprite.scene?.anims?.exists?.(moveKey)) playLoop(sprite, moveKey);
    else playLoop(sprite, actor.role.key);
    faceLeft(sprite);
    this._place(actor);
  }

  /**
   * Hold point in front of the threat, on its lane. Latched so the pet
   * does not kite once it arrives — zombies close and can bite.
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie} threat
   * @param {{ x?: number, y?: number }|null} player
   */
  _aimPoint(actor, threat, player) {
    const stand = engageStand(actor.role.id);
    let x = threat.x + stand;
    const y = clampGrass(threat.y);
    const minX = threat.x + layoutPx(14);
    if (x < minX) x = minX;
    if (player && Number.isFinite(player.x)) {
      const cap = player.x - layoutPx(4);
      if (x > cap) x = cap;
    }
    if (x < minX) x = minX;
    return { x, y };
  }

  /**
   * No threat: walk from the bed to the summon point beside the player.
   * @param {PetActor} actor
   * @param {{ x?: number, y?: number }|null} player
   * @param {number} deltaMs
   */
  _stepOutbound(actor, player, deltaMs) {
    const sprite = actor.sprite;
    if (!sprite) return;
    const dest = deployPoint(player);
    const dx = dest.x - sprite.x;
    const dy = dest.y - sprite.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= layoutPx(5)) {
      sprite.x = dest.x;
      sprite.y = dest.y;
      actor.leaving = false;
      actor.state = 'idle';
      playLoop(sprite, actor.role.key);
      faceLeft(sprite);
      this._place(actor);
      return;
    }
    const step = GAME_CONFIG.PETS.MOVE_SPEED * LAYOUT_SCALE * (deltaMs / 1000);
    const span = Math.max(dist, 0.001);
    sprite.x += dx * Math.min(1, step / span);
    sprite.y += dy * Math.min(1, step / span);
    actor.state = 'move';
    const moveKey = actor.role.move;
    if (moveKey && sprite.scene?.anims?.exists?.(moveKey)) playLoop(sprite, moveKey);
    else playLoop(sprite, actor.role.key);
    if (typeof sprite.setFlipX === 'function') sprite.setFlipX(dx > layoutPx(2));
    this._place(actor);
  }

  /** @param {PetActor} actor */
  _place(actor) {
    const sprite = actor.sprite;
    if (!sprite) return;
    const y = clampGrass(sprite.y);
    sprite.y = y;
    actor.x = sprite.x;
    actor.y = y;
    if (!(actor.popLeft > 0) && typeof sprite.setScale === 'function') {
      sprite.setScale(displayScaleFromY(y));
    }
    const behind = restingBehindFence(actor);
    if (actor.tucked && !behind) actor.tucked = false;
    const depth = behind ? petSleepDepth(y) : depthFromY(y, -1);
    actor.drawDepth = depth;
    sprite.setDepth?.(depth);
    this._syncBars(actor);
  }

  /** @param {PetActor} actor */
  _syncBars(actor) {
    const sprite = actor.sprite;
    const bg = actor.hpBg;
    const fg = actor.hpFg;
    if (!sprite || !bg || !fg) return;
    const w = layoutPx(26);
    const y = sprite.y - layoutPx(36);
    const ratio = actor.maxHp > 0 ? Math.max(0, actor.hp / actor.maxHp) : 0;
    const hot = actor.barFlashLeft > 0;
    const element = PET_ELEMENT_TINT[actor.role.element] ?? 0xfff3c4;
    bg.x = sprite.x;
    bg.y = y;
    fg.x = sprite.x - w / 2;
    fg.y = y;
    if (typeof fg.setFillStyle === 'function') fg.setFillStyle(hot ? 0xfff6e8 : element);
    if (typeof fg.setScale === 'function') fg.setScale(Math.max(0.02, ratio), hot ? 1.7 : 1);
    const depth = depthFromY(y, 2);
    bg.setDepth?.(depth);
    fg.setDepth?.(depth + 1);
  }

  /** @param {PetActor} actor */
  _destroyBars(actor) {
    destroySprite(actor.hpBg);
    destroySprite(actor.hpFg);
    actor.hpBg = null;
    actor.hpFg = null;
  }

  /**
   * Form 1 plays the baby skill strip and releases on its hit frame.
   * Forms 2 and 3 release on a short telegraph; their FX are placeholders.
   * @param {PetActor} actor
   */
  _beginAttack(actor) {
    actor.state = 'attack';
    actor.released = false;
    actor.attackElapsed = 0;
    actor.hurtLeft = 0;
    faceLeft(actor.sprite);
    const orb = actor.castQueue[0] ?? 0;
    if (orb <= 0) playOnce(actor.sprite, actor.role.skill);
  }

  /**
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {import('../entities/Zombie.js').Zombie|null} threat
   */
  _advanceAttack(actor, zombies, threat) {
    const sprite = actor.sprite;
    const skill = actor.role.skill;
    const anims = sprite?.anims;
    const frame = anims?.currentFrame?.index ?? 0;
    const progress = typeof anims?.getProgress === 'function' ? anims.getProgress() : 0;
    const playingSkill = !!(anims?.isPlaying && anims.currentAnim?.key === skill);
    const orb = actor.castQueue[0] ?? 0;
    const form1 = !(orb > 0);
    const due = form1
      ? frame >= GAME_CONFIG.PETS.RELEASE_FRAME ||
        (playingSkill && progress >= 0.34) ||
        !playingSkill ||
        actor.attackElapsed >= GAME_CONFIG.PETS.ATTACK_MAX_MS
      : actor.attackElapsed >= 90;
    let gold = 0;
    let kills = 0;
    if (!actor.released && due) {
      actor.released = true;
      const index = actor.castQueue.shift();
      if (index != null) {
        const gain = this._castOrb(actor, index, zombies, threat);
        gold += gain.gold;
        kills += gain.kills;
      }
    }
    const swingDone = form1
      ? !playingSkill || actor.attackElapsed >= GAME_CONFIG.PETS.ATTACK_MAX_MS
      : actor.released;
    if (actor.released && swingDone) {
      if (actor.castQueue.length > 0) this._beginAttack(actor);
      else this._enterIdle(actor);
    }
    faceLeft(sprite);
    this._place(actor);
    return { gold, kills };
  }

  /** @param {PetActor} actor */
  _enterIdle(actor) {
    actor.state = 'idle';
    actor.released = false;
    actor.attackElapsed = 0;
    faceLeft(actor.sprite);
    playLoop(actor.sprite, actor.role.key);
  }

  /**
   * @param {PetActor} actor
   * @param {number} orbIndex
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {import('../entities/Zombie.js').Zombie|null} threat
   */
  _castOrb(actor, orbIndex, zombies, threat) {
    const orb = actor.orbs[orbIndex];
    if (orb) {
      orb.pending = false;
      orb.flashLeft = 0;
      orb.left = orb.cdMs;
    }
    this.castLog.push({ id: actor.role.id, orb: orbIndex });
    if (orbIndex <= 0) return this._cast(actor, zombies, threat);
    if (orbIndex === 1) return this._castForm2(actor, zombies, threat);
    return this._castForm3(actor, zombies, threat);
  }

  /**
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {import('../entities/Zombie.js').Zombie|null} threat
   */
  _cast(actor, zombies, threat) {
    const id = actor.role.id;
    if (id === 'phoenix') return this._castPhoenix(actor, threat);
    if (id === 'panda') return this._castPanda(actor, zombies);
    if (id === 'lion') return this._castLion(actor, zombies);
    if (id === 'dragon') return this._castDragon(actor, zombies);
    return EMPTY;
  }

  /**
   * Straight feather bolt, traveling left, aimed at the fence threat.
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie|null} threat
   */
  _castPhoenix(actor, threat) {
    const cfg = GAME_CONFIG.PETS.PHOENIX;
    const sprite = actor.sprite;
    const from = framePoint(sprite, cfg.MOUTH_X, cfg.MOUTH_Y);
    const aim = threat
      ? { x: threat.x, y: chestY(threat) }
      : { x: from.x - layoutPx(80), y: from.y };
    const speed = cfg.SPEED * LAYOUT_SCALE;
    const limit = (cfg.AIM_LIMIT_DEG * Math.PI) / 180;
    const { vx, vy } = leftBoltVelocity(from.x, from.y, aim.x, aim.y, speed, limit);
    const scale = Math.abs(sprite.scaleY || 1);
    const bolt = spawnProjectile(this.scene, from.x, from.y, actor.role.projectile, scale);
    if (bolt) {
      bolt.setRotation(aimRotation(vx, vy, 'west'));
      bolt.setDepth(depthFromY(from.y, 3));
    }
    this._bolts.push({
      sprite: bolt,
      x: from.x,
      y: from.y,
      vx,
      vy,
      hitIds: new Set(),
      impact: actor.role.impact,
      scale,
    });
    return EMPTY;
  }

  /**
   * Short smack in front of the panda. One target: the in-range zombie
   * closest to the fence. Brief slow.
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   */
  _castPanda(actor, zombies) {
    const cfg = GAME_CONFIG.PETS.PANDA;
    const sprite = actor.sprite;
    const scale = Math.abs(sprite.scaleY || 1);
    playCastFx(this.scene, sprite.x, sprite.y, actor.role.windup, scale, sprite.y);
    const range = cfg.RANGE * LAYOUT_SCALE;
    const yHalf = cfg.Y_HALF * LAYOUT_SCALE;
    const target = closestThreatWhere(zombies, (z) =>
      inForwardBox(sprite.x, sprite.y, z.x, z.y, range, yHalf)
    );
    if (!target) return EMPTY;
    const hy = chestY(target);
    playCastFx(this.scene, target.x, hy, actor.role.impact, scale, hy);
    const gain = strike(this.scene, target, cfg.DAMAGE, DAMAGE_COLORS.panda);
    if (!gain.killed && typeof target.applySlow === 'function') {
      target.applySlow(cfg.SLOW_MULT, cfg.SLOW_MS);
    }
    return gain;
  }

  /**
   * Small forward cone. The slash FX sits in front of the cub.
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   */
  _castLion(actor, zombies) {
    const cfg = GAME_CONFIG.PETS.LION;
    const sprite = actor.sprite;
    const scale = Math.abs(sprite.scaleY || 1);
    const from = framePoint(sprite, cfg.FORWARD_X, cfg.FORWARD_Y);
    playCastFx(this.scene, from.x, from.y, actor.role.impact, scale, from.y);
    const range = cfg.RANGE * LAYOUT_SCALE;
    const half = (cfg.HALF_ANGLE_DEG * Math.PI) / 180;
    const hits = threatsInShape(zombies, (z) =>
      inLeftCone(from.x, from.y, z.x, chestY(z), range, half)
    ).slice(0, cfg.MAX_TARGETS);
    return strikeAll(this.scene, hits, cfg.DAMAGE, DAMAGE_COLORS.lion);
  }

  /**
   * Short smoke puff from the mouth. Chip now, brief burn after.
   * Not the youth fireball.
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   */
  _castDragon(actor, zombies) {
    const cfg = GAME_CONFIG.PETS.DRAGON;
    const sprite = actor.sprite;
    const scale = Math.abs(sprite.scaleY || 1);
    const mouth = framePoint(sprite, cfg.MOUTH_X, cfg.MOUTH_Y);
    playCastFx(this.scene, mouth.x, mouth.y, actor.role.breath, scale, mouth.y);
    const range = cfg.RANGE * LAYOUT_SCALE;
    const half = (cfg.HALF_ANGLE_DEG * Math.PI) / 180;
    const hits = threatsInShape(zombies, (z) =>
      inLeftCone(mouth.x, mouth.y, z.x, chestY(z), range, half)
    ).slice(0, cfg.MAX_TARGETS);
    let gold = 0;
    let kills = 0;
    for (const z of hits) {
      const gain = strike(this.scene, z, cfg.CHIP, DAMAGE_COLORS.dragon);
      gold += gain.gold;
      kills += gain.kills;
      if (!gain.killed && typeof z.applyBurn === 'function') {
        z.applyBurn(cfg.BURN, cfg.BURN_INTERVAL_MS, cfg.BURN_MS);
      }
    }
    return { gold, kills };
  }

  /**
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {import('../entities/Zombie.js').Zombie|null} threat
   */
  _castForm2(actor, zombies, threat) {
    const id = actor.role.id;
    if (id === 'phoenix') return this._phoenixNova(actor, zombies, threat);
    if (id === 'panda') return this._pandaFreeze(actor, zombies);
    if (id === 'lion') return this._lionChain(actor, zombies);
    if (id === 'dragon') return this._dragonCloud(actor, threat);
    return EMPTY;
  }

  /**
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {import('../entities/Zombie.js').Zombie|null} threat
   */
  _castForm3(actor, zombies, threat) {
    const id = actor.role.id;
    if (id === 'phoenix') return this._phoenixDive(actor);
    if (id === 'panda') return this._pandaBlizzard(actor, zombies, threat);
    if (id === 'lion') return this._lionStomp(actor, zombies);
    if (id === 'dragon') return this._dragonRain(actor, zombies);
    return EMPTY;
  }

  /**
   * Fire nova on the fence threat. Chip plus a short burn.
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {import('../entities/Zombie.js').Zombie|null} threat
   */
  _phoenixNova(actor, zombies, threat) {
    const cfg = GAME_CONFIG.PETS.FORM2.phoenix;
    const focus = focusPoint(actor, threat);
    const radius = cfg.radius * LAYOUT_SCALE;
    this._spawnBlob(focus.x, focus.y, radius, PLACEHOLDER_TINT.phoenix, 420, 'phoenix-nova');
    const hits = threatsInShape(zombies, (z) => Math.hypot(z.x - focus.x, z.y - focus.y) <= radius);
    let gold = 0;
    let kills = 0;
    for (const z of hits) {
      const gain = strike(this.scene, z, cfg.damage, DAMAGE_COLORS.phoenix);
      gold += gain.gold;
      kills += gain.kills;
      if (!gain.killed && typeof z.applyBurn === 'function') {
        z.applyBurn(cfg.burn, cfg.burnIntervalMs, cfg.burnMs);
      }
    }
    return { gold, kills };
  }

  /**
   * A line charge traveling left from the pet. Wide enough to cross one lane.
   * @param {PetActor} actor
   */
  _phoenixDive(actor) {
    const cfg = GAME_CONFIG.PETS.FORM3.phoenix;
    const sprite = actor.sprite;
    const x = sprite?.x ?? actor.x;
    const y = sprite?.y ?? actor.y;
    const length = cfg.length * LAYOUT_SCALE;
    const halfW = cfg.halfWidth * LAYOUT_SCALE;
    const speed = 480 * LAYOUT_SCALE;
    for (let i = 1; i <= 4; i++) {
      this._spawnBlob(x - (length * i) / 5, y, layoutPx(8), PLACEHOLDER_TINT.phoenix, 320, 'phoenix-dive');
    }
    const node = this.scene?.add?.rectangle?.(x, y, layoutPx(18), Math.max(layoutPx(8), halfW * 2), PLACEHOLDER_TINT.phoenix, 0.4) ?? null;
    node?.setDepth?.(depthFromY(y, 5));
    this._charges.push({
      node,
      x,
      y,
      vx: -speed,
      halfL: layoutPx(16),
      halfW,
      damage: cfg.damage,
      hitIds: new Set(),
      life: (length / speed) * 1000,
      color: DAMAGE_COLORS.phoenix,
    });
    return EMPTY;
  }

  /**
   * One target, the nearest fence threat in range, locked in place.
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   */
  _pandaFreeze(actor, zombies) {
    const cfg = GAME_CONFIG.PETS.FORM2.panda;
    const sprite = actor.sprite;
    const range = cfg.range * LAYOUT_SCALE;
    const target = closestThreatWhere(
      zombies,
      (z) => Math.hypot((sprite?.x ?? actor.x) - z.x, (sprite?.y ?? actor.y) - z.y) <= range
    );
    if (!target) return EMPTY;
    this._spawnBlob(target.x, chestY(target), layoutPx(16), PLACEHOLDER_TINT.panda, 520, 'panda-freeze');
    const gain = strike(this.scene, target, cfg.damage, DAMAGE_COLORS.panda);
    if (!gain.killed && typeof target.applyRoot === 'function') target.applyRoot(cfg.rootMs);
    return gain;
  }

  /**
   * Slow and a light burn on every zombie in a circle on the threat.
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {import('../entities/Zombie.js').Zombie|null} threat
   */
  _pandaBlizzard(actor, zombies, threat) {
    const cfg = GAME_CONFIG.PETS.FORM3.panda;
    const focus = focusPoint(actor, threat);
    const radius = cfg.radius * LAYOUT_SCALE;
    this._spawnBlob(focus.x, focus.y, radius, PLACEHOLDER_TINT.panda, 640, 'panda-blizzard');
    const hits = threatsInShape(zombies, (z) => Math.hypot(z.x - focus.x, z.y - focus.y) <= radius);
    let gold = 0;
    let kills = 0;
    for (const z of hits) {
      if (typeof z.applySlow === 'function') z.applySlow(cfg.slowMult, cfg.slowMs);
      if (typeof z.applyBurn === 'function') z.applyBurn(cfg.dot, cfg.dotIntervalMs, cfg.dotMs);
      const gain = strike(this.scene, z, cfg.dot, DAMAGE_COLORS.panda);
      gold += gain.gold;
      kills += gain.kills;
    }
    return { gold, kills };
  }

  /**
   * Primary target plus jumps to nearby bodies. Damage steps down the chain.
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   */
  _lionChain(actor, zombies) {
    const cfg = GAME_CONFIG.PETS.FORM2.lion;
    const sprite = actor.sprite;
    const from = framePoint(sprite, GAME_CONFIG.PETS.LION.FORWARD_X, GAME_CONFIG.PETS.LION.FORWARD_Y);
    const hits = chainTargets(
      zombies,
      from.x,
      from.y,
      cfg.range * LAYOUT_SCALE,
      cfg.jump * LAYOUT_SCALE,
      Math.max(0, cfg.damages.length - 1)
    );
    let gold = 0;
    let kills = 0;
    hits.forEach((z, i) => {
      this._spawnBlob(z.x, chestY(z), layoutPx(10), PLACEHOLDER_TINT.lion, 280, 'lion-chain');
      const dmg = cfg.damages[Math.min(i, cfg.damages.length - 1)];
      const gain = strike(this.scene, z, dmg, DAMAGE_COLORS.lion);
      gold += gain.gold;
      kills += gain.kills;
    });
    if (!hits.length) {
      this._spawnBlob(from.x - layoutPx(24), from.y, layoutPx(8), PLACEHOLDER_TINT.lion, 220, 'lion-chain');
    }
    return { gold, kills };
  }

  /**
   * Circle around the cub. Damage plus a short root.
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   */
  _lionStomp(actor, zombies) {
    const cfg = GAME_CONFIG.PETS.FORM3.lion;
    const sprite = actor.sprite;
    const x = sprite?.x ?? actor.x;
    const y = sprite?.y ?? actor.y;
    const radius = cfg.radius * LAYOUT_SCALE;
    this._spawnBlob(x, y, radius, PLACEHOLDER_TINT.lion, 420, 'lion-stomp');
    const hits = threatsInShape(zombies, (z) => Math.hypot(z.x - x, z.y - y) <= radius);
    let gold = 0;
    let kills = 0;
    for (const z of hits) {
      const gain = strike(this.scene, z, cfg.damage, DAMAGE_COLORS.lion);
      gold += gain.gold;
      kills += gain.kills;
      if (!gain.killed && typeof z.applyRoot === 'function') z.applyRoot(cfg.rootMs);
    }
    return { gold, kills };
  }

  /**
   * A poison puddle on the threat that ticks while it lasts.
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie|null} threat
   */
  _dragonCloud(actor, threat) {
    const cfg = GAME_CONFIG.PETS.FORM2.dragon;
    const focus = focusPoint(actor, threat);
    const radius = cfg.radius * LAYOUT_SCALE;
    const node = this._spawnBlob(focus.x, focus.y, radius, PLACEHOLDER_TINT.dragon, cfg.durationMs, 'dragon-cloud');
    this._zones.push({
      node,
      x: focus.x,
      y: focus.y,
      radius,
      damage: cfg.damage,
      interval: cfg.intervalMs,
      acc: cfg.intervalMs,
      left: cfg.durationMs,
      hitColor: DAMAGE_COLORS.dragon,
    });
    return EMPTY;
  }

  /**
   * A drop on each nearby fence threat. Chip plus burn.
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   */
  _dragonRain(actor, zombies) {
    const cfg = GAME_CONFIG.PETS.FORM3.dragon;
    const sprite = actor.sprite;
    const x = sprite?.x ?? actor.x;
    const y = sprite?.y ?? actor.y;
    const range = cfg.range * LAYOUT_SCALE;
    const hits = threatsInShape(zombies, (z) => Math.hypot(z.x - x, z.y - y) <= range).slice(0, cfg.targets);
    if (!hits.length) {
      this._spawnBlob(x - layoutPx(40), y, layoutPx(8), PLACEHOLDER_TINT.dragon, 300, 'dragon-rain');
      return EMPTY;
    }
    let gold = 0;
    let kills = 0;
    for (const z of hits) {
      this._spawnBlob(z.x, chestY(z) - layoutPx(18), layoutPx(8), PLACEHOLDER_TINT.dragon, 360, 'dragon-rain');
      const gain = strike(this.scene, z, cfg.chip, DAMAGE_COLORS.dragon);
      gold += gain.gold;
      kills += gain.kills;
      if (!gain.killed && typeof z.applyBurn === 'function') {
        z.applyBurn(cfg.burn, cfg.burnIntervalMs, cfg.burnMs);
      }
    }
    return { gold, kills };
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @param {number} color
   * @param {number} lifeMs
   * @param {string} tag
   */
  _spawnBlob(x, y, radius, color, lifeMs, tag) {
    const scene = this.scene;
    const r = Math.max(layoutPx(4), radius);
    /** @type {Phaser.GameObjects.Arc|Phaser.GameObjects.Rectangle|null} */
    let node = null;
    if (scene?.add?.circle) node = scene.add.circle(x, y, r, color, 0.45);
    else if (scene?.add?.rectangle) node = scene.add.rectangle(x, y, r * 2, r * 2, color, 0.45);
    if (node) {
      node.setDepth?.(depthFromY(y, 6));
      node.setData?.('petFx', tag);
    }
    this.fxLog.push(tag);
    this._blobs.push({ node, life: lifeMs });
    return node;
  }

  /** @param {number} dt */
  _stepBlobs(dt) {
    const keep = [];
    for (const blob of this._blobs) {
      blob.life -= dt;
      if (blob.life <= 0 || (blob.node && blob.node.active === false)) {
        destroySprite(blob.node);
        continue;
      }
      keep.push(blob);
    }
    this._blobs = keep;
  }

  /**
   * @param {number} dt
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   */
  _stepCharges(dt, zombies) {
    const keep = [];
    let gold = 0;
    let kills = 0;
    for (const charge of this._charges) {
      const use = Math.max(0, Math.min(dt, charge.life));
      const x0 = charge.x;
      charge.x += charge.vx * (use / 1000);
      charge.life -= use;
      if (charge.node) {
        charge.node.x = charge.x;
        charge.node.y = charge.y;
      }
      const minX = Math.min(x0, charge.x) - charge.halfL;
      const maxX = Math.max(x0, charge.x) + charge.halfL;
      for (const z of zombies) {
        if (!z?.alive || !z.body) continue;
        if (charge.hitIds.has(z.id)) continue;
        if (Math.abs(z.y - charge.y) > charge.halfW) continue;
        if (z.x < minX || z.x > maxX) continue;
        charge.hitIds.add(z.id);
        const gain = strike(this.scene, z, charge.damage, charge.color);
        gold += gain.gold;
        kills += gain.kills;
      }
      if (charge.life <= 0) {
        destroySprite(charge.node);
        continue;
      }
      keep.push(charge);
    }
    this._charges = keep;
    return { gold, kills };
  }

  /**
   * @param {number} dt
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   */
  _stepZones(dt, zombies) {
    const keep = [];
    let gold = 0;
    let kills = 0;
    for (const zone of this._zones) {
      zone.left -= dt;
      zone.acc += dt;
      let guard = 0;
      while (zone.acc >= zone.interval && guard < 6) {
        guard += 1;
        zone.acc -= zone.interval;
        const hits = threatsInShape(zombies, (z) => Math.hypot(z.x - zone.x, z.y - zone.y) <= zone.radius);
        for (const z of hits) {
          const gain = strike(this.scene, z, zone.damage, zone.hitColor);
          gold += gain.gold;
          kills += gain.kills;
        }
      }
      if (zone.left <= 0) continue;
      keep.push(zone);
    }
    this._zones = keep;
    return { gold, kills };
  }

  /** @param {number} deltaSec */
  _stepBolts(deltaSec) {
    const dt = Number.isFinite(deltaSec) ? deltaSec : 0;
    for (const bolt of this._bolts) {
      const sprite = bolt.sprite;
      bolt.x += bolt.vx * dt;
      bolt.y += bolt.vy * dt;
      if (!sprite?.active) continue;
      sprite.x = bolt.x;
      sprite.y = bolt.y;
      if (typeof sprite.setRotation === 'function') {
        sprite.setRotation(aimRotation(bolt.vx, bolt.vy, 'west'));
      }
      if (typeof sprite.setDepth === 'function') sprite.setDepth(depthFromY(bolt.y, 3));
    }
  }

  /**
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   */
  _resolveBolts(zombies) {
    const cfg = GAME_CONFIG.PETS.PHOENIX;
    const keep = [];
    let gold = 0;
    let kills = 0;
    for (const bolt of this._bolts) {
      if (boltOutOfPlay(bolt)) {
        destroySprite(bolt.sprite);
        continue;
      }
      let spent = false;
      for (const z of zombies) {
        if (!z?.alive || !z.body) continue;
        if (bolt.hitIds.has(z.id)) continue;
        if (!boltOverlaps(z, bolt.x, bolt.y)) continue;
        bolt.hitIds.add(z.id);
        const damage = bolt.hitIds.size === 1 ? cfg.DAMAGE : cfg.PIERCE_DAMAGE;
        const hy = chestY(z);
        playCastFx(this.scene, bolt.x, hy, bolt.impact, bolt.scale, hy);
        const gain = strike(this.scene, z, damage, DAMAGE_COLORS.phoenix);
        gold += gain.gold;
        kills += gain.kills;
        if (bolt.hitIds.size > cfg.PIERCE) {
          spent = true;
          destroySprite(bolt.sprite);
          break;
        }
      }
      if (!spent) keep.push(bolt);
    }
    this._bolts = keep;
    return { gold, kills };
  }
}

/** @param {string} id */
function engageStand(id) {
  const pets = GAME_CONFIG.PETS;
  if (id === 'panda') return pets.PANDA.RANGE * LAYOUT_SCALE * 0.5;
  if (id === 'lion') return pets.LION.RANGE * LAYOUT_SCALE * 0.5;
  if (id === 'dragon') return pets.DRAGON.RANGE * LAYOUT_SCALE * 0.45;
  return layoutPx(100);
}

/**
 * @param {PetActor} actor
 * @param {import('../entities/Zombie.js').Zombie|null} threat
 */
function focusPoint(actor, threat) {
  if (threat && Number.isFinite(threat.x) && Number.isFinite(threat.y)) {
    return { x: threat.x, y: threat.y };
  }
  return { x: actor.sprite?.x ?? actor.x, y: actor.sprite?.y ?? actor.y };
}

/**
 * @param {import('../entities/Zombie.js').Zombie[]} zombies
 * @param {number} originX
 * @param {number} originY
 * @param {number} range
 * @param {number} jump
 * @param {number} jumps
 */
function chainTargets(zombies, originX, originY, range, jump, jumps) {
  /** @type {import('../entities/Zombie.js').Zombie[]} */
  const hits = [];
  const used = new Set();
  let fromX = originX;
  let fromY = originY;
  let reach = range;
  const list = Array.isArray(zombies) ? zombies : [];
  for (let n = 0; n <= jumps; n++) {
    /** @type {import('../entities/Zombie.js').Zombie|null} */
    let best = null;
    let bestD = Infinity;
    for (const z of list) {
      if (!z?.alive || !z.body) continue;
      if (used.has(z.id)) continue;
      if (!Number.isFinite(z.x) || !Number.isFinite(z.y)) continue;
      const d = Math.hypot(z.x - fromX, chestY(z) - fromY);
      if (d > reach || d >= bestD) continue;
      best = z;
      bestD = d;
    }
    if (!best) break;
    used.add(best.id);
    hits.push(best);
    fromX = best.x;
    fromY = chestY(best);
    reach = jump;
  }
  return hits;
}

/**
 * True while the body should draw under the fence posts.
 * Fresh summons stay in front. A woken pet stays tucked until it crosses out.
 * @param {PetActor} actor
 */
function restingBehindFence(actor) {
  const y = actor.sprite?.y ?? actor.y;
  const x = actor.sprite?.x ?? actor.x;
  if (actor.rest === 'settle' || actor.rest === 'sleep') return true;
  const safe = x >= barricadeXAtY(y) - layoutPx(4);
  if (actor.rest === 'seek' && safe) return true;
  if (actor.tucked && safe) return true;
  return false;
}

/**
 * First-summon point, just behind the player. Resummon walks here when
 * nothing is on the field.
 * @param {{ x?: number, y?: number }|null|undefined} player
 */
function deployPoint(player) {
  const px = Number.isFinite(player?.x) ? player.x : 0;
  const py = Number.isFinite(player?.y) ? player.y : 0;
  return { x: px + layoutPx(18), y: clampGrass(py) };
}

/** @param {number} y */
function clampGrass(y) {
  return Math.min(grassYMax(), Math.max(grassYMin(), Number.isFinite(y) ? y : grassYMin()));
}

/** @param {number} value */
function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Living zombie with the smallest gap to the fence at its lane.
 * Not the zombie nearest the pet.
 * @param {import('../entities/Zombie.js').Zombie[]} zombies
 */
export function nearestBarricadeThreat(zombies) {
  return closestThreatWhere(zombies, () => true);
}

/**
 * @param {import('../entities/Zombie.js').Zombie[]} zombies
 * @param {(z: import('../entities/Zombie.js').Zombie) => boolean} pred
 */
export function closestThreatWhere(zombies, pred) {
  let best = null;
  let bestGap = Infinity;
  const list = Array.isArray(zombies) ? zombies : [];
  for (const z of list) {
    if (!z?.alive || !z.body) continue;
    if (!Number.isFinite(z.x) || !Number.isFinite(z.y)) continue;
    if (!pred(z)) continue;
    const gap = barricadeThreatGap(z);
    if (gap < bestGap) {
      bestGap = gap;
      best = z;
    }
  }
  return best;
}

/**
 * Fence X minus zombie X. Smaller means the bite is closer.
 * @param {{ x: number, y: number }} zombie
 */
export function barricadeThreatGap(zombie) {
  return barricadeXAtY(zombie.y) - zombie.x;
}

/**
 * Zombie is in front of (to the left of) the origin, inside a short box.
 * @param {number} originX
 * @param {number} originY
 * @param {number} zx
 * @param {number} zy
 * @param {number} range canvas px
 * @param {number} yHalf canvas px
 */
export function inForwardBox(originX, originY, zx, zy, range, yHalf) {
  const dx = originX - zx;
  if (!(dx >= 0 && dx <= range)) return false;
  return Math.abs(zy - originY) <= yHalf;
}

/**
 * Point lies in a cone opening to the left (180°) within `range`.
 * @param {number} originX
 * @param {number} originY
 * @param {number} zx
 * @param {number} zy
 * @param {number} range
 * @param {number} halfRad
 */
export function inLeftCone(originX, originY, zx, zy, range, halfRad) {
  const dx = zx - originX;
  const dy = zy - originY;
  const dist = Math.hypot(dx, dy);
  if (!(dist <= range)) return false;
  if (dist < 1) return true;
  const angle = Math.atan2(dy, dx);
  const delta = wrapPi(angle - Math.PI);
  return Math.abs(delta) <= halfRad + 1e-6;
}

/**
 * Straight-ish bolt that always travels left. Aim bends toward the target
 * up to `maxAbsRad` off 180°.
 * @param {number} fromX
 * @param {number} fromY
 * @param {number} targetX
 * @param {number} targetY
 * @param {number} speed
 * @param {number} maxAbsRad
 * @returns {{ vx: number, vy: number }}
 */
export function leftBoltVelocity(fromX, fromY, targetX, targetY, speed, maxAbsRad) {
  const speedAbs = Math.abs(Number.isFinite(speed) ? speed : 0);
  let dx = (Number.isFinite(targetX) ? targetX : fromX) - fromX;
  const dy = (Number.isFinite(targetY) ? targetY : fromY) - fromY;
  if (!(dx < -1)) dx = -1;
  const angle = Math.atan2(dy, dx);
  let delta = wrapPi(angle - Math.PI);
  const cap = Math.abs(maxAbsRad);
  if (delta > cap) delta = cap;
  if (delta < -cap) delta = -cap;
  const aim = Math.PI + delta;
  return { vx: Math.cos(aim) * speedAbs, vy: Math.sin(aim) * speedAbs };
}

/**
 * @param {import('../entities/Zombie.js').Zombie[]} zombies
 * @param {(z: import('../entities/Zombie.js').Zombie) => boolean} pred
 */
function threatsInShape(zombies, pred) {
  const list = Array.isArray(zombies) ? zombies : [];
  const hits = [];
  for (const z of list) {
    if (!z?.alive || !z.body) continue;
    if (!Number.isFinite(z.x) || !Number.isFinite(z.y)) continue;
    if (!pred(z)) continue;
    hits.push(z);
  }
  hits.sort((a, b) => barricadeThreatGap(a) - barricadeThreatGap(b));
  return hits;
}

/**
 * @param {Phaser.Scene} scene
 * @param {import('../entities/Zombie.js').Zombie[]} zombies
 * @param {number} damage
 * @param {string} color
 */
function strikeAll(scene, zombies, damage, color) {
  let gold = 0;
  let kills = 0;
  for (const z of zombies) {
    const gain = strike(scene, z, damage, color);
    gold += gain.gold;
    kills += gain.kills;
  }
  return { gold, kills };
}

/**
 * @param {Phaser.Scene} scene
 * @param {import('../entities/Zombie.js').Zombie} zombie
 * @param {number} damage
 * @param {string} color
 * @returns {{ gold: number, kills: number, killed: boolean }}
 */
function strike(scene, zombie, damage, color) {
  if (!zombie?.alive || !zombie.body) return { gold: 0, kills: 0, killed: false };
  const hx = zombie.x;
  const hy = Number.isFinite(zombie.visualTop) ? zombie.visualTop : chestY(zombie);
  const goldVal = zombie.goldValue || 0;
  const killed = zombie.takeDamage(damage, { kind: 'pet' });
  if (damage > 0) scene?.audio?.playHitImpact?.();
  showDamageText(scene, hx, hy, damage, color, zombie.id);
  if (killed) return { gold: goldVal, kills: 1, killed: true };
  return { gold: 0, kills: 0, killed: false };
}

/**
 * Frame-pixel offset from a feet-origin sprite, in canvas px.
 * `scale` already includes LAYOUT_SCALE, so this is not multiplied again.
 * @param {{ x: number, y: number, scaleY?: number, scaleX?: number }} sprite
 * @param {number} frameX
 * @param {number} frameY
 */
function framePoint(sprite, frameX, frameY) {
  const s = Math.abs(sprite?.scaleY || sprite?.scaleX || 1);
  return { x: (sprite?.x ?? 0) + frameX * s, y: (sprite?.y ?? 0) + frameY * s };
}

/** @param {{ bodyCenterY?: number, y: number }} zombie */
function chestY(zombie) {
  return Number.isFinite(zombie.bodyCenterY) ? zombie.bodyCenterY : zombie.y;
}

/** @param {Phaser.GameObjects.Sprite} sprite */
function faceLeft(sprite) {
  if (!sprite) return;
  if (typeof sprite.setFlipX === 'function') sprite.setFlipX(false);
  if (typeof sprite.setFlipY === 'function') sprite.setFlipY(false);
}

/**
 * @param {Phaser.GameObjects.Sprite} sprite
 * @param {string} key
 */
function playLoop(sprite, key) {
  if (!sprite || !key || typeof sprite.play !== 'function') return;
  if (!sprite.scene?.anims?.exists?.(key)) return;
  const current = sprite.anims?.currentAnim?.key;
  if (current === key && sprite.anims.isPlaying) return;
  try {
    sprite.play(key);
  } catch (_) {
    /* missing strip */
  }
}

/**
 * @param {Phaser.GameObjects.Sprite} sprite
 * @param {string} key
 */
function playOnce(sprite, key) {
  if (!sprite || !key || typeof sprite.play !== 'function') return false;
  if (!sprite.scene?.anims?.exists?.(key)) return false;
  try {
    sprite.play(key);
  } catch (_) {
    return false;
  }
  faceLeft(sprite);
  return true;
}

/**
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 * @param {string|undefined} key
 * @param {number} scale
 * @param {number} depthY
 */
function playCastFx(scene, x, y, key, scale, depthY) {
  if (!key) return null;
  return playLibraryFx(scene, x, y, key, {
    scale,
    depth: depthFromY(depthY, 6),
  });
}

/**
 * Looping feather. Caller moves and destroys it. One-shot FX uses playLibraryFx.
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 * @param {string} key
 * @param {number} scale
 */
function spawnProjectile(scene, x, y, key, scale) {
  if (!scene?.add?.sprite || !key || !scene.textures?.exists?.(key)) {
    if (!scene?.add?.rectangle) return null;
    const fallback = scene.add.rectangle(x, y, layoutPx(10), layoutPx(4), 0xffb74d);
    fallback.setDepth(depthFromY(y, 3));
    return fallback;
  }
  const sprite = scene.add.sprite(x, y, key);
  const asset = libraryAsset(scene, key);
  const origin = asset?.origin ?? [0.19, 0.5];
  sprite.setOrigin(origin[0], origin[1]);
  sprite.setScale(scale);
  if (scene.anims?.exists?.(key)) sprite.play(key);
  return sprite;
}

/**
 * @param {import('../entities/Zombie.js').Zombie} zombie
 * @param {number} x
 * @param {number} y
 */
function boltOverlaps(zombie, x, y) {
  const bounds = typeof zombie.getBounds === 'function' ? zombie.getBounds() : null;
  if (!bounds) return false;
  const pad = layoutPx(6);
  return (
    x >= bounds.left - pad &&
    x <= bounds.right + pad &&
    y >= bounds.top - pad &&
    y <= bounds.bottom + pad
  );
}

/** @param {{ x: number, y: number }} bolt */
function boltOutOfPlay(bolt) {
  if (!Number.isFinite(bolt.x) || !Number.isFinite(bolt.y)) return true;
  const left = spawnWorldX() - layoutPx(40);
  if (bolt.x < left || bolt.x > WORLD_WIDTH + layoutPx(40)) return true;
  if (bolt.y < -layoutPx(30) || bolt.y > WORLD_HEIGHT + layoutPx(30)) return true;
  return false;
}

/** @param {Phaser.GameObjects.GameObject|null|undefined} sprite */
function destroySprite(sprite) {
  if (!sprite) return;
  try {
    sprite.destroy();
  } catch (_) {
    /* already destroyed */
  }
}

function wrapPi(rad) {
  return Math.atan2(Math.sin(rad), Math.cos(rad));
}

/**
 * @typedef {object} OrbState
 * @property {number} index
 * @property {number} cdMs
 * @property {number} left
 * @property {number} flashLeft
 * @property {boolean} pending
 * @property {string} dark
 * @property {string} lit
 * @property {string} flash
 */

/**
 * @typedef {object} PetActor
 * @property {Phaser.GameObjects.Sprite|null} sprite
 * @property {import('../assets/petLineup.js').PET_LINEUP[number]} role
 * @property {'ready'|'field'|'revive'} phase
 * @property {number} hp
 * @property {number} maxHp
 * @property {number} reviveLeft
 * @property {'idle'|'move'|'attack'|'hurt'|'wake'} state
 * @property {null|'seek'|'settle'|'sleep'} rest
 * @property {number|null} sleepSlot
 * @property {boolean} tucked
 * @property {boolean} leaving
 * @property {number} wakeLeft
 * @property {boolean} released
 * @property {number} attackElapsed
 * @property {number[]} castQueue
 * @property {OrbState[]} orbs
 * @property {number} x
 * @property {number} y
 */

/**
 * @typedef {object} FieldPet
 * @property {string} id
 * @property {number} x
 * @property {number} y
 * @property {number} hp
 * @property {boolean} alive
 * @property {number} radius
 * @property {(amount: number) => boolean} takeDamage
 */

/**
 * @typedef {object} PhoenixBolt
 * @property {Phaser.GameObjects.Sprite|Phaser.GameObjects.Rectangle|null} sprite
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} vy
 * @property {Set<number>} hitIds
 * @property {string|undefined} impact
 * @property {number} scale
 */

/**
 * @typedef {object} DiveCharge
 * @property {Phaser.GameObjects.Rectangle|null} node
 * @property {number} x
 * @property {number} y
 * @property {number} vx
 * @property {number} halfL
 * @property {number} halfW
 * @property {number} damage
 * @property {Set<number>} hitIds
 * @property {number} life
 * @property {string} color
 */

/**
 * @typedef {object} GroundZone
 * @property {Phaser.GameObjects.GameObject|null} node
 * @property {number} x
 * @property {number} y
 * @property {number} radius
 * @property {number} damage
 * @property {number} interval
 * @property {number} acc
 * @property {number} left
 * @property {string} hitColor
 */

/**
 * @typedef {object} FxBlob
 * @property {Phaser.GameObjects.GameObject|null} node
 * @property {number} life
 */
