import { GAME_CONFIG, petSurroundHitScale } from '../data/GameConfig.js';
import { DAMAGE_COLORS, showCritText, showDamageText } from '../ui/damageText.js';
import { beginHitstop } from './combatJuice.js';
import { pickPetCombatTarget } from './petTarget.js';
import { UltCutscene } from './UltCutscene.js';
import { PET_ELEMENT_TINT, PET_LINEUP, petLineupSlots, petSleepDepth } from '../assets/petLineup.js';
import { petSkillKey, petSkillSpec } from '../assets/petSkills.js';
import { aimRotation, libraryAsset, playLibraryFx } from '../assets/libraryAssets.js';
import { clampPetFoot } from './footprints.js';
import {
  barricadeXAtY,
  depthFromY,
  displayScaleFromY,
  grassYMax,
  grassYMin,
  LAYOUT_SCALE,
  layoutPx,
  scaleFromY,
  spawnWorldX,
  WORLD_HEIGHT,
  WORLD_WIDTH,
} from './DepthView.js';

const EMPTY = { gold: 0, kills: 0 };
/** Above lane actors (~8k) and below the HUD (20000), so the tell stays readable. */
const TELL_DEPTH = 15000;

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

/** PIXELLAB_HOOK: assets/library/fx/v026/aoe/vfx-aoe-*.png */
const RESIDUE_KEY = {
  phoenix: 'vfx-aoe-fire',
  panda: 'vfx-aoe-ice',
  lion: 'vfx-aoe-lightning',
  dragon: 'vfx-aoe-poison',
};

/**
 * Summoned baby pets. Off the field until the bar is tapped.
 * Tap again to recall: Back! floats beside the pet, then it walks to an
 * empty bed behind the barricade, plays sleep-start once, and loops sleep.
 * Resummon wakes that body and walks it out. Regen still runs off the field.
 * There is no deploy cooldown and no on-field time limit.
 * Death (HP ≤ 0) greys the bar for REVIVE_CD_MS.
 * While out, the pet walks to the nearest fence threat. Each unlocked orb
 * fills, flashes, then auto-casts. Orb 0 / 1 / 2 play the baby / young /
 * ancient cast strip and spawn that form's catalog FX on its castFrame.
 * Forms 2 and 3 stay locked until evolution. Damage tables are unchanged.
 * A bite is three beats in order: solid white fill, solid red fill, then
 * the hurt strip played once. Bite DPS cannot restart a beat already
 * running. The camera does not shake.
 */
export class PetCombat {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ skillsEnabled?: boolean }} [opts]
   * Stage passes `skillsEnabled: false`. Tests omit it, so the skill
   * strips still run when a check pumps the orbs. Live play does not.
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this._skillsEnabled = opts.skillsEnabled !== false;
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
    /** @type {RainDrop[]} Falling phoenix-rain bolts. Visual; nova damage is separate. */
    this._falls = [];
    /** @type {ChannelBeam[]} Ancient dragon breath. Visual; rain damage is separate. */
    this._channels = [];
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
    /** @type {import('./PetEvolve.js').PetEvolve|null} */
    this.evolve = null;
    this.ult = new UltCutscene(scene);
    /** Basics and small skills stay quiet this long after a letterbox. */
    this._attackHold = 0;
    /** True while a tier-3 swing should use the ult damage bias. */
    this._ultSwing = false;
    this._loot = { gold: 0, kills: 0 };
    /** @type {import('../entities/Zombie.js').Zombie[]} */
    this._liveZombies = [];
    /** Set by StageScene when `?debugPetSkill=1` is on. Off, forceSkill no-ops. */
    this.debugSkills = false;
    /** Party index of the last pet sent out. Keys 0/1/2 fire this body. */
    this._debugFocus = 0;
    /** Last debug cast, for the on-screen hint. */
    this.lastForcedSkill = '';
  }

  /** @param {import('./PetEvolve.js').PetEvolve|null} evolve */
  setEvolve(evolve) {
    this.evolve = evolve || null;
  }

  /** True while the tier-3 letterbox is holding this scene. */
  get ultPlaying() {
    return !!this.ult?.playing;
  }

  /** Ms left before basics and small skills may fire after a letterbox. */
  get attackHoldMs() {
    return this._attackHold || 0;
  }

  /** @returns {boolean} */
  _attacksPaused() {
    return this.ultPlaying || this._attackHold > 0;
  }

  /**
   * @param {PetActor} actor
   * @param {number} dt
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {import('../entities/Zombie.js').Zombie|null} threat
   * @param {{ x?: number, y?: number }|null} player
   */
  tickAi(actor, dt, zombies, threat, player) {
    return this._tickField(actor, dt, zombies, threat, player);
  }

  /**
   * Melee box in front of the pet. Wind-up, impact, recovery.
   * Plays `role.attack` once when that anim is loaded. Dragon's key is
   * the overhead slam (`pet-dragon-baby-attack`). Panda, lion, and
   * phoenix use the same path. A missing strip leaves the current body.
   * Damage timing stays on MELEE. The melee fan and the existing
   * pet-attack cue stay. Hurt is not touched.
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie[]} [zombies]
   */
  tryBasic(actor, zombies) {
    if (this._attacksPaused()) return false;
    if (!actor || actor.state === 'attack' || actor.meleePhase || actor.hurtLeft > 0) return false;
    if (actor.meleeGap > 0) return false;
    const sprite = actor.sprite;
    if (!sprite?.active) return false;
    const pets = GAME_CONFIG.PETS.MELEE;
    const range = layoutPx(pets.RANGE);
    const yHalf = layoutPx(pets.Y_HALF);
    const list = Array.isArray(zombies) ? zombies : this._liveZombies;
    const hit = list.some((z) => z?.alive && z.body && inForwardBox(sprite.x, sprite.y, z.x, z.y, range, yHalf));
    if (!hit) return false;
    actor.meleePhase = 'windup';
    actor.meleeLeft = pets.WINDUP_MS;
    actor.state = 'melee';
    this._playBasicStrip(actor);
    return true;
  }

  /**
   * One-shot basic strip. `role.attack` when the anim exists. Claw is
   * not the stage swing.
   * @param {PetActor} actor
   * @returns {boolean}
   */
  _playBasicStrip(actor) {
    const key = actor?.role?.attack;
    if (!key) return false;
    return playOnce(actor.sprite, key);
  }

  /**
   * True while the basic strip is still advancing, so idle does not cut
   * the slam during recovery. A finished or replaced anim is not live.
   * @param {PetActor} actor
   */
  _basicStripLive(actor) {
    const key = actor?.role?.attack;
    const anims = actor?.sprite?.anims;
    if (!key || !anims?.isPlaying) return false;
    return anims.currentAnim?.key === key;
  }

  /**
   * @param {PetActor} actor
   * @param {1|2|3} slot
   */
  trySkill(actor, slot) {
    const index = Math.floor(Number(slot)) - 1;
    if (!actor || index < 0 || index > 2) return false;
    if (index >= this._unlockedCount(actor)) return false;
    if (index === 2 && !this._allowUlt(actor)) return false;
    this._commitOrb(actor, index);
    return true;
  }

  /**
   * Debug only. Force the focused field pet's baby (0), young (1), or
   * ancient (2) cast now. Ignores cooldown and unlock. The strip still
   * releases its FX on castFrame. A bite during the tell does not cover
   * the strip. Damage tables are unchanged. No-op unless `debugSkills`.
   * @param {number} orbIndex
   * @param {{ x?: number, y?: number }|null} [player]
   * @returns {boolean}
   */
  forceSkill(orbIndex, player = null) {
    if (!this.debugSkills) return false;
    const index = Math.floor(Number(orbIndex));
    if (index < 0 || index > 2) return false;
    let actor = this._focusedField();
    if (!actor) {
      const slot = Number.isInteger(this._debugFocus) ? this._debugFocus : 0;
      const summoned = this.summon(slot, player || this._anchor, []);
      actor = summoned.ok ? this._focusedField() : null;
      if (!actor && slot !== 0) {
        const fallback = this.summon(0, player || this._anchor, []);
        if (fallback.ok) actor = this._focusedField();
      }
    }
    if (!actor) return false;
    this._forceCast(actor, index);
    const spec = petSkillSpec(petSkillKey(actor.role.id, index));
    const form = spec?.form || '';
    const name = spec?.name || '';
    this.lastForcedSkill = `${actor.role.id} ${form} ${name}`.trim();
    return true;
  }

  /** @param {PetActor|null|undefined} actor */
  _onField(actor) {
    return !!(actor && actor.phase === 'field' && actor.hp > 0 && actor.sprite?.active);
  }

  /** Last deployed pet if they are still out, otherwise the first field pet. */
  _focusedField() {
    const focus = this._actors[this._debugFocus];
    if (this._onField(focus)) return focus;
    return this._actors.find((entry) => this._onField(entry)) || null;
  }

  /**
   * Restart the cast strip immediately. A skill already swinging is replaced.
   * @param {PetActor} actor
   * @param {number} orbIndex
   */
  _forceCast(actor, orbIndex) {
    if (actor.meleePhase) {
      actor.meleePhase = null;
      if (actor.state === 'melee') actor.state = 'idle';
    }
    actor.wakeLeft = 0;
    for (const orb of actor.orbs) {
      if (!orb.pending && !(orb.flashLeft > 0)) continue;
      orb.pending = false;
      orb.flashLeft = 0;
      orb.left = orb.cdMs;
    }
    const orb = actor.orbs[orbIndex];
    if (orb) {
      orb.pending = false;
      orb.flashLeft = 0;
      orb.left = orb.cdMs;
    }
    actor.castQueue = [orbIndex];
    this._clearHitLook(actor);
    actor.debugSkillGuard = GAME_CONFIG.PETS.TELEGRAPH_MS + 900;
    this._beginAttack(actor);
  }

  /**
   * Leftward shove. dirX <= 0 pushes back down the march.
   * @param {import('../entities/Zombie.js').Zombie} zombie
   * @param {number} [dirX]
   * @param {number} [px] field px
   * @param {number} [ms]
   */
  applyKnockback(zombie, dirX = -1, px = GAME_CONFIG.PETS.KNOCKBACK_PX, ms = GAME_CONFIG.PETS.KNOCKBACK_MS) {
    if (!zombie || typeof zombie.beginPetSlide !== 'function') return;
    const mag = layoutPx(Math.abs(px));
    if (!(mag > 0)) return;
    void dirX;
    zombie.beginPetSlide(mag, ms);
    this.scene?.audio?.playPetKnockback?.();
  }

  /** @param {number} ms */
  hitstop(ms) {
    beginHitstop(this.scene, ms);
  }

  _takeLoot() {
    const loot = this._loot || EMPTY;
    this._loot = { gold: 0, kills: 0 };
    return { gold: loot.gold || 0, kills: loot.kills || 0 };
  }

  /**
   * @param {number} chance
   * @param {() => { gold: number, kills: number }} fn
   */
  _withCrit(chance, fn) {
    const prev = this.scene?._zdCrit;
    if (this.scene) this.scene._zdCrit = chance;
    try {
      return fn();
    } finally {
      if (this.scene) this.scene._zdCrit = prev;
    }
  }

  /**
   * Evolution hook. 1 is form 1 only. 3 unlocks the placeholder forms.
   * @param {number} count
   */
  setUnlockedOrbs(count) {
    const n = Number(count);
    this._unlockedOrbs = Number.isFinite(n) ? Math.max(0, Math.min(3, Math.floor(n))) : null;
  }

  /**
   * @param {PetActor} [actor]
   */
  _unlockedCount(actor) {
    if (this._unlockedOrbs != null) return this._unlockedOrbs;
    if (actor && this.evolve?.getTier) {
      return Math.max(1, Math.min(3, this.evolve.getTier(actor.role.id) || 1));
    }
    return GAME_CONFIG.PETS.UNLOCKED_ORBS;
  }

  /** @param {PetActor} actor */
  _tierOf(actor) {
    return this.evolve?.getTier?.(actor.role.id) ?? 1;
  }

  /**
   * Lane pick for this pet. High wall pressure taunts the breach.
   * Otherwise the pet sits 10–20% off the hero's west ray.
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {{ x?: number, y?: number }|null} player
   * @param {Set<object>} claimed
   */
  _threatFor(actor, zombies, player, claimed) {
    return pickPetCombatTarget(zombies, {
      heroY: Number.isFinite(player?.y) ? player.y : null,
      tier: this._tierOf(actor),
      slot: Math.max(0, this._actors.indexOf(actor)),
      claimed,
    });
  }

  /**
   * @param {PetActor} actor
   * @param {{ knockback?: boolean, critChance?: number, hitstop?: boolean, ult?: boolean }} [extra]
   */
  _hitOpts(actor, extra = {}) {
    const tier = actor ? this._tierOf(actor) : 1;
    const packed = actor ? this._packCount(actor) : 0;
    const pets = GAME_CONFIG.PETS;
    return {
      knockback: extra.knockback,
      critChance: extra.critChance,
      hitstop: extra.hitstop,
      scale: packed >= pets.SURROUND_COUNT ? petSurroundHitScale() : 1,
      finisher: tier === 2,
      ult: !!((extra.ult || this._ultSwing) && tier >= 3),
    };
  }

  /**
   * @param {PetActor|null|undefined} actor
   * @param {import('../entities/Zombie.js').Zombie} zombie
   * @param {number} damage
   * @param {string} color
   * @param {{ knockback?: boolean, critChance?: number, hitstop?: boolean, ult?: boolean }} [extra]
   */
  _strike(actor, zombie, damage, color, extra) {
    return strike(this.scene, zombie, damage, color, this._hitOpts(actor, extra));
  }

  /**
   * @param {PetActor|null|undefined} actor
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {number} damage
   * @param {string} color
   * @param {{ knockback?: boolean, critChance?: number, hitstop?: boolean, ult?: boolean }} [extra]
   */
  _strikeAll(actor, zombies, damage, color, extra) {
    return strikeAll(this.scene, zombies, damage, color, this._hitOpts(actor, extra));
  }

  /** Tier 1 crowd-control bias. Damage numbers stay on the skill table. @param {PetActor} actor @param {number} ms */
  _ccMs(actor, ms) {
    if (this._tierOf(actor) <= 1) return Math.round(ms * GAME_CONFIG.PETS.T1_CC_MULT);
    return ms;
  }

  /** Living zombies standing in this pet's melee box. @param {PetActor} actor */
  _packCount(actor) {
    const sprite = actor?.sprite;
    const x = sprite?.x ?? actor?.x;
    const y = sprite?.y ?? actor?.y;
    if (!Number.isFinite(x) || !Number.isFinite(y)) return 0;
    const pets = GAME_CONFIG.PETS.MELEE;
    const range = layoutPx(pets.RANGE);
    const yHalf = layoutPx(pets.Y_HALF);
    let n = 0;
    for (const z of this._liveZombies) {
      if (!z?.alive || !z.body) continue;
      if (!Number.isFinite(z.x) || !Number.isFinite(z.y)) continue;
      if (inForwardBox(x, y, z.x, z.y, range, yHalf)) n += 1;
    }
    return n;
  }

  /** S3 plays only at tier 3, or when a test override unlocks every orb. */
  _allowUlt(actor) {
    if ((this._unlockedOrbs ?? 0) >= 3) return true;
    return this.evolve?.canUseUlt?.(actor.role.id) === true;
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
      this._recall(actor, player);
      return { ok: true, reason: 'recall', id: actor.role.id };
    }
    this._deploy(actor, player);
    this.scene?.audio?.playPetSummon?.();
    void zombies;
    return { ok: true, reason: 'ok', id: actor.role.id };
  }

  /**
   * Baby idle catalog key for this party slot.
   * Stage passes the key from getSelectedPetSpriteKey().
   * A missing texture keeps the lineup idle. Skills stay on their own flag.
   * @param {number} index
   * @param {string|null|undefined} idleKey
   */
  setBabyIdleKey(index, idleKey) {
    const actor = this._actors[index];
    if (!actor) return;
    actor._babyIdleKey = typeof idleKey === 'string' && idleKey ? idleKey : null;
  }

  /**
   * Standing strip. The saved baby idle wins when that texture is loaded.
   * @param {PetActor} actor
   */
  _babyIdleKey(actor) {
    const override = actor?._babyIdleKey;
    const scene = this.scene;
    if (typeof override === 'string' && override) {
      const loaded = !scene?.textures || scene.textures.exists(override) || scene.anims?.exists?.(override);
      if (loaded) return override;
    }
    return actor?.role?.key;
  }

  /**
   * Advance an in-progress flinch. The feel booth skips the field tick,
   * so a shock hit would otherwise stay on the white fill.
   * @param {number} deltaMs
   */
  tickContactHurts(deltaMs) {
    const dt = Number.isFinite(deltaMs) ? deltaMs : 0;
    for (const actor of this._actors) {
      if (!actor.hitPhase || actor.phase !== 'field') continue;
      if (actor.invulnLeft > 0) actor.invulnLeft = Math.max(0, actor.invulnLeft - dt);
      this._tickHitLook(actor, dt);
      this._presentHurt(actor);
      this._applyHitLook(actor);
    }
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
        get sprite() {
          return actor.sprite?.active ? actor.sprite : null;
        },
        get hp() {
          return actor.hp;
        },
        get alive() {
          return actor.phase === 'field' && actor.hp > 0;
        },
        onField: true,
        takeDamage: (amount) => this._damage(actor, amount),
      });
    }
    return out;
  }

  /**
   * Every pet sprite still on screen, including a body walking to its bed.
   * Footprints push these so they do not share a sole with a zombie.
   */
  occupiedPets() {
    /** @type {{ kind: 'pet', id: string, x: number, y: number, footprintWidth: () => number, shift: (dx: number, dy: number) => void }[]} */
    const out = [];
    for (const actor of this._actors) {
      const sprite = actor.sprite;
      if (!sprite?.active) continue;
      out.push({
        kind: 'pet',
        id: actor.role.id,
        get x() {
          return sprite.x;
        },
        get y() {
          return sprite.y;
        },
        footprintWidth: () => Math.abs(sprite.displayWidth || 0),
        footprintHeight: () => Math.abs(sprite.displayHeight || 0),
        shift: (dx, dy) => {
          const y0 = sprite.y;
          if (dx) sprite.x += dx;
          if (dy) sprite.y = clampPetFoot(sprite.y + dy);
          actor.x = sprite.x;
          actor.y = sprite.y;
          // Grass refused the drop. The separator then slides on X.
          if (dy && !dx && Math.abs(sprite.y - y0) < Math.abs(dy) * 0.5) return false;
          return true;
        },
      });
    }
    return out;
  }

  /** One view per party slot, top → bottom. */
  portraitViews() {
    return this._actors.map((actor) => {
      const unlockedCount = this._unlockedCount(actor);
      return {
        id: actor.role.id,
        element: actor.role.element,
        elementZh: actor.role.elementZh,
        color: PET_ELEMENT_TINT[actor.role.element] ?? 0xffffff,
        phase: actor.phase,
        tappable: actor.phase !== 'revive',
        grey: actor.phase === 'revive',
        hp: actor.maxHp > 0 ? clamp01(actor.hp / actor.maxHp) : 0,
        lowHp: actor.phase !== 'revive' && actor.hp > 0 && actor.maxHp > 0 && actor.hp / actor.maxHp < GAME_CONFIG.PETS.LOW_HP_RATIO,
        hitSeq: actor.hitSeq || 0,
        tier: this._tierOf(actor),
        expRatio: this.evolve?.expRatio?.(actor.role.id) ?? 0,
        barKey: actor.role.hudBar,
        headKey: actor.role.hudHead,
        orbs: actor.orbs.map((orb) => this._orbView(orb, unlockedCount)),
      };
    });
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
    this._anchor = player;
    const dt = Number.isFinite(deltaMs) ? deltaMs : 0;
    const list = Array.isArray(zombies) ? zombies : [];
    this._liveZombies = list;
    this._ageMeleeFans(dt);
    let justEnded = false;
    if (this.ult?.playing) {
      this._loot = { gold: 0, kills: 0 };
      this.ult.update(dt);
      this._stepFalls(dt);
      this._stepChannels(dt);
      if (this.ult.playing) return this._takeLoot();
      this._attackHold = GAME_CONFIG.PETS.ULT_RESUME_MS;
      justEnded = true;
    }
    if (!justEnded && this._attackHold > 0) {
      this._attackHold = Math.max(0, this._attackHold - dt);
    }
    const claimed = new Set();
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
        this._tickSleepCd(actor, dt);
        this._tickFloat(actor, dt);
        continue;
      }
      if (actor.phase !== 'field') {
        this._tickFloat(actor, dt);
        continue;
      }
      const threat = this._threatFor(actor, list, player, claimed);
      actor.focusThreat = threat;
      if (threat) claimed.add(threat);
      const gain = this.tickAi(actor, dt, list, threat, player);
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
    this._stepFalls(dt);
    this._stepChannels(dt);
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
    for (const drop of this._falls) destroySprite(drop?.sprite);
    this._falls = [];
    for (const beam of this._channels) destroySprite(beam?.sprite);
    this._channels = [];
    this.ult?._clear?.();
    this.ult && (this.ult.playing = false);
      for (const actor of this._actors) {
      this._clearTelegraph(actor);
      this._clearMeleeFan(actor);
      this._clearLowHint(actor);
      this._clearFloat(actor);
      this._destroyBars(actor);
      destroySprite(actor.stars);
      actor.stars = null;
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
      hurtStrip: false,
      /** @type {''|'white'|'red'|'strip'} */
      hitPhase: '',
      stripLeft: 0,
      hurtReactLeft: 0,
      flashLeft: 0,
      tintLeft: 0,
      barFlashLeft: 0,
      hitLook: '',
      hitSeq: 0,
      biteReadout: 0,
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
      meleePhase: null,
      meleeLeft: 0,
      meleeGap: 0,
      meleeFan: null,
      invulnLeft: 0,
      /** Ms left to keep a debug force-cast visible through a bite. */
      debugSkillGuard: 0,
      lowLatched: false,
      lowHint: null,
      lowHintLeft: 0,
      lowPulse: 0,
      focusThreat: null,
      shownTier: 1,
      stars: null,
      starsKey: '',
      expBg: null,
      expFg: null,
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
        opened: false,
        dark: role.orbDark,
        lit: role.orbLit,
        flash: role.orbFlash,
      })),
      telegraph: null,
    };
  }

  /**
   * @param {PetActor} actor
   * @param {{ x?: number, y?: number }|null} player
   */
  _deploy(actor, player) {
    if (actor.sprite?.active) {
      this._wake(actor, player);
      return;
    }
    const point = deployPoint(player, cameraRight(this.scene));
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
    const focus = this._actors.indexOf(actor);
    if (focus >= 0) this._debugFocus = focus;
    actor.sprite = this._spawnSprite(actor, x, y);
    this._attachBars(actor);
    this._showFloat(actor, 'go', player);
    this._noteCue(PET_AUDIO_KEYS.go);
    this.scene?.audio?.playPetGo?.();
  }

  /**
   * Stand up where they are and walk out. The sprite is not respawned.
   * @param {PetActor} actor
   * @param {{ x?: number, y?: number }|null} [anchor]
   */
  _wake(actor, anchor = null) {
    const lying = actor.rest === 'sleep' || actor.rest === 'settle';
    actor.phase = 'field';
    actor.rest = null;
    actor.sleepSlot = null;
    actor.settleLeft = 0;
    actor.state = 'idle';
    actor.meleePhase = null;
    actor.wakeLeft = lying ? WAKE_MS : 0;
    if (lying) this.scene?.events?.emit?.('pet:wake', { petId: actor.role.id });
    actor.leaving = true;
    const focus = this._actors.indexOf(actor);
    if (focus >= 0) this._debugFocus = focus;
    actor.attackElapsed = 0;
    actor.released = false;
    this._clearHitLook(actor);
    actor.latched = false;
    actor.latchId = null;
    actor.castQueue = [];
    actor.popLeft = 0;
    if (actor.sprite && typeof actor.sprite.setAlpha === 'function') actor.sprite.setAlpha(1);
    faceLeft(actor.sprite);
    playLoop(actor.sprite, this._babyIdleKey(actor));
    this._destroyBars(actor);
    this._attachBars(actor);
    this._place(actor);
    this._showFloat(actor, 'go', anchor);
    this._noteCue(PET_AUDIO_KEYS.go);
    this.scene?.audio?.playPetGo?.();
  }

  /**
   * Leave the field at the current HP and walk to an empty bed.
   * The sprite stays. A flash that had not released yet resumes next time out.
   * @param {PetActor} actor
   * @param {{ x?: number, y?: number }|null} [anchor]
   */
  _recall(actor, anchor = null) {
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
    this._showFloat(actor, 'back', anchor);
    this._noteCue(PET_AUDIO_KEYS.back);
    this.scene?.audio?.playPetBack?.();
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
    else playLoop(sprite, this._babyIdleKey(actor));
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
    this.scene?.events?.emit?.('pet:sleep', { petId: actor.role.id });
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
   * @param {{ x?: number, y?: number }|null} [anchor]
   */
  _showFloat(actor, which, anchor = null) {
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
    this._placeFloat(actor, anchor);
  }

  /**
   * @param {PetActor} actor
   * @param {{ x?: number, y?: number }|null} [anchor]
   */
  _placeFloat(actor, anchor = null) {
    const node = actor.float;
    const sprite = actor.sprite;
    if (!node || !sprite) return;
    const desiredX = sprite.x + layoutPx(GAME_CONFIG.PETS.FLOAT_OFFSET_X);
    const desiredY = sprite.y - layoutPx(GAME_CONFIG.PETS.FLOAT_OFFSET_Y);
    const hero = floatHeroRect(anchor || this._anchor);
    const placed = placeFloatLabel(desiredX, desiredY, floatLabelBox(node), floatView(this.scene), hero);
    node.x = placed.x;
    node.y = placed.y;
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
    this._placeFloat(actor, this._anchor);
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
    const key = this._babyIdleKey(actor);
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
    const ey = y - layoutPx(6);
    const eh = Math.max(2, layoutPx(2));
    actor.expBg = scene.add.rectangle(sprite.x, ey, w, eh, 0x1a1208);
    actor.expFg = scene.add.rectangle(sprite.x - w / 2, ey, w, eh, 0xffd54f);
    actor.expFg?.setOrigin?.(0, 0.5);
  }

  /**
   * @param {PetActor} actor
   * @param {number} amount
   * @returns {boolean} true when this hit removed the pet
   */
  _damage(actor, amount) {
    if (actor.phase !== 'field' || !(actor.hp > 0)) return false;
    if (actor.invulnLeft > 0) return false;
    const dmg = Number(amount);
    if (!(dmg > 0) || !Number.isFinite(dmg)) return false;
    actor.hp -= dmg;
    actor.invulnLeft = GAME_CONFIG.PETS.HURT_INVULN_MS;
    this.scene?.events?.emit?.('pet:hit', { petId: actor.role.id, amount: dmg });
    const sprite = actor.sprite;
    if (sprite) {
      const hy = sprite.y - layoutPx(28);
      // Bite DPS is a fraction per frame. Math.round drops those, so the
      // pet never printed a −N while a zombie shot still showed −30.
      actor.biteReadout = (actor.biteReadout || 0) + dmg;
      const whole = Math.floor(actor.biteReadout);
      if (whole >= 1) {
        actor.biteReadout -= whole;
        showDamageText(this.scene, sprite.x, hy, whole, '#ff4040', `pet-${actor.role.id}`);
      }
    }
    // Debug force-casts hold the fill off so the strip stays readable.
    // HP and the invuln window still apply. A normal bite is unchanged.
    if (!(actor.debugSkillGuard > 0) && !actor.hitPhase) this._beginHitReact(actor);
    if (actor.hp <= 0) {
      actor.hp = 0;
      this._dismiss(actor);
      return true;
    }
    this._syncLowHp(actor);
    this._syncBars(actor);
    return false;
  }

  /**
   * One Recall! hint the first time a field pet drops under LOW_HP_RATIO.
   * The latch clears once they are back over the line.
   * @param {PetActor} actor
   */
  _syncLowHp(actor) {
    const ratio = actor.maxHp > 0 ? actor.hp / actor.maxHp : 1;
    const low = actor.phase === 'field' && actor.hp > 0 && ratio < GAME_CONFIG.PETS.LOW_HP_RATIO;
    if (!low) {
      actor.lowLatched = false;
      return;
    }
    if (actor.lowLatched) return;
    actor.lowLatched = true;
    this._showLowHint(actor);
  }

  /** @param {PetActor} actor */
  _showLowHint(actor) {
    this.fxLog.push('low-hp-recall');
    const scene = this.scene;
    const sprite = actor.sprite;
    if (!scene?.add?.text || !sprite) return;
    this._clearLowHint(actor);
    const node = scene.add.text(sprite.x, sprite.y - layoutPx(48), 'Recall!');
    node.setOrigin?.(0.5, 1);
    node.setDepth?.(depthFromY(sprite.y, 9));
    actor.lowHint = node;
    actor.lowHintLeft = GAME_CONFIG.PETS.FLOAT_HOLD_MS;
  }

  /** @param {PetActor} actor @param {number} dt */
  _tickLowHint(actor, dt) {
    const node = actor.lowHint;
    if (!node) return;
    const sprite = actor.sprite;
    if (sprite) {
      node.x = sprite.x;
      node.y = sprite.y - layoutPx(48);
    }
    actor.lowHintLeft -= Number.isFinite(dt) ? dt : 0;
    if (actor.lowHintLeft <= 0 || node.active === false) this._clearLowHint(actor);
  }

  /** @param {PetActor} actor */
  _clearLowHint(actor) {
    destroySprite(actor.lowHint);
    actor.lowHint = null;
    actor.lowHintLeft = 0;
  }

  /**
   * Start white → red → hurt strip. A second call is ignored while
   * `hitPhase` is set, so per-frame bite DPS cannot restart the strip
   * with play() or swap the fill back to white. The camera does not shake.
   * @param {PetActor} actor
   */
  _beginHitReact(actor) {
    if (actor.hitPhase) return;
    const pets = GAME_CONFIG.PETS;
    actor.hitPhase = 'white';
    actor.flashLeft = pets.HURT_FLASH_MS;
    actor.tintLeft = pets.HURT_TINT_MS;
    actor.stripLeft = pets.HURT_STRIP_MS;
    actor.hurtLeft = pets.HURT_MS;
    actor.hurtReactLeft = pets.HURT_MS;
    actor.hurtStrip = false;
    actor.barFlashLeft = pets.HURT_BAR_MS;
    actor.hitSeq = (actor.hitSeq || 0) + 1;
    this._applyHitLook(actor);
  }

  /**
   * White fill, then solid red, then the hurt strip, without spending HP.
   * No-op while a flinch is already on screen. Summons the phoenix when
   * the field is empty so a debug key still has a body to flash.
   * @param {{ x?: number, y?: number }|null} [player]
   * @returns {boolean}
   */
  debugHurtOnce(player = null) {
    if (this._actors.some((actor) => actor.hitPhase)) return false;
    let actor = this._actors.find((entry) => entry.phase === 'field' && entry.hp > 0 && entry.sprite?.active);
    if (!actor) {
      const anchor = player || this._anchor;
      const summoned = this.summon(0, anchor, []);
      if (!summoned.ok) return false;
      actor = this._actors.find((entry) => entry.phase === 'field' && entry.hp > 0 && entry.sprite?.active);
    }
    if (!actor) return false;
    this._beginHitReact(actor);
    return true;
  }

  /**
   * Set every field pet just under LOW_HP_RATIO (25% of max) and run the
   * same latch that pulses the bar and floats Recall! once. A second call
   * while they are still low does not float another hint. Does not play
   * the hurt strip. Summons the phoenix when the field is empty.
   * @param {{ x?: number, y?: number }|null} [player]
   * @returns {boolean}
   */
  debugLowHp(player = null) {
    const living = () => this._actors.filter((entry) => entry.phase === 'field' && entry.hp > 0 && entry.sprite?.active);
    let field = living();
    if (!field.length) {
      const summoned = this.summon(0, player || this._anchor, []);
      if (!summoned.ok) return false;
      field = living();
    }
    if (!field.length) return false;
    for (const actor of field) {
      const max = actor.maxHp > 0 ? actor.maxHp : GAME_CONFIG.PETS.HP;
      actor.hp = Math.max(1, Math.floor(max * 0.25));
      this._syncLowHp(actor);
      this._syncBars(actor);
    }
    return true;
  }

  /**
   * @param {PetActor} actor
   * @param {'flash'|'hurt'|'clear'} mode
   */
  _paintHit(actor, mode) {
    const sprite = actor.sprite;
    if (!sprite?.active) return;
    const element = PET_ELEMENT_TINT[actor.role.element] ?? 0xffffff;
    const pets = GAME_CONFIG.PETS;
    if (mode === 'flash') {
      paintSolid(sprite, GAME_CONFIG.JUICE.HIT_FLASH_COLOR);
      return;
    }
    if (mode === 'hurt') {
      // Fill, not multiply. 0xff5252 left a blue phoenix almost black.
      const red = pets.HURT_TINT_COLOR;
      paintSolid(sprite, red);
      return;
    }
    if (typeof sprite.clearTint === 'function') sprite.clearTint();
    if (typeof sprite.setFillStyle === 'function' && typeof sprite.setTintFill !== 'function') {
      sprite.setFillStyle(element);
    }
  }

  /** Drop a flinch so recall, wake, and a fresh deploy are not stuck tinted. @param {PetActor} actor */
  _clearHitLook(actor) {
    actor.invulnLeft = 0;
    actor.hurtLeft = 0;
    actor.hurtStrip = false;
    actor.hitPhase = '';
    actor.stripLeft = 0;
    actor.hurtReactLeft = 0;
    actor.flashLeft = 0;
    actor.tintLeft = 0;
    actor.barFlashLeft = 0;
    actor.hitLook = '';
    actor.biteReadout = 0;
    this._paintHit(actor, 'clear');
  }

  /**
   * Step the active beat only. Leftover time spills into the next beat so
   * one long frame cannot skip the red fill. The strip beat does not
   * start counting on the frame it begins — that frame is the single play().
   * @param {PetActor} actor
   * @param {number} dt
   */
  _tickHitLook(actor, dt) {
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    if (actor.barFlashLeft > 0) actor.barFlashLeft = Math.max(0, actor.barFlashLeft - step);
    if (!actor.hitPhase) {
      actor.hurtReactLeft = 0;
      return;
    }
    let remain = step;
    const pets = GAME_CONFIG.PETS;
    if (actor.hitPhase === 'white') {
      if (actor.flashLeft > remain) {
        actor.flashLeft -= remain;
        remain = 0;
      } else {
        remain -= Math.max(0, actor.flashLeft);
        actor.flashLeft = 0;
        actor.hitPhase = 'red';
        actor.tintLeft = pets.HURT_TINT_MS;
      }
    }
    if (actor.hitPhase === 'red' && remain > 0) {
      if (actor.tintLeft > remain) {
        actor.tintLeft -= remain;
        remain = 0;
      } else {
        remain -= Math.max(0, actor.tintLeft);
        actor.tintLeft = 0;
        actor.hitPhase = 'strip';
        actor.hurtStrip = false;
        actor.stripLeft = pets.HURT_STRIP_MS;
        remain = 0;
      }
    }
    if (actor.hitPhase === 'strip' && remain > 0) {
      actor.stripLeft = Math.max(0, actor.stripLeft - remain);
      if (!(actor.stripLeft > 0)) this._finishHit(actor);
    }
    actor.hurtLeft = actor.hitPhase ? pets.HURT_MS : 0;
    actor.hurtReactLeft = actor.hitPhase ? pets.HURT_MS : 0;
  }

  /** @param {PetActor} actor */
  _finishHit(actor) {
    actor.hitPhase = '';
    actor.hurtStrip = false;
    actor.stripLeft = 0;
    actor.flashLeft = 0;
    actor.tintLeft = 0;
    actor.hurtLeft = 0;
    actor.hurtReactLeft = 0;
  }

  /**
   * White fill, then solid red, then the pet's own colors for the strip.
   * Reapplied every field tick so a frame change cannot drop the fill.
   * @param {PetActor} actor
   */
  _applyHitLook(actor) {
    if (!actor.sprite?.active) return;
    if (actor.hitPhase === 'white') {
      actor.hitLook = 'flash';
      this._paintHit(actor, 'flash');
      return;
    }
    if (actor.hitPhase === 'red') {
      actor.hitLook = 'hurt';
      this._paintHit(actor, 'hurt');
      return;
    }
    if (actor.hitLook) {
      actor.hitLook = '';
      this._paintHit(actor, 'clear');
    }
  }

  /**
   * Hold still for the fills. Start the hurt strip exactly once when the
   * red beat ends, and do not call play() again until it has finished.
   * @param {PetActor} actor
   */
  _presentHurt(actor) {
    const sprite = actor.sprite;
    if (!sprite) return;
    if (actor.hitPhase === 'strip' && !actor.hurtStrip) {
      actor.hurtStrip = playOnce(sprite, actor.role.hurt, { restart: false });
      if (!actor.hurtStrip) this._finishHit(actor);
    }
    faceLeft(sprite);
  }

  /** @param {PetActor} actor */
  _dismiss(actor) {
    this._clearTelegraph(actor);
    this._clearMeleeFan(actor);
    this._clearLowHint(actor);
    if (actor.phase !== 'field') return;
    const sprite = actor.sprite;
    actor.sprite = null;
    actor.hp = 0;
    actor.latched = false;
    actor.latchId = null;
    actor.state = 'idle';
    actor.hurtLeft = 0;
    actor.hurtStrip = false;
    actor.hitPhase = '';
    actor.stripLeft = 0;
    actor.hitLook = '';
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
    destroySprite(actor.stars);
    actor.stars = null;
    actor.starsKey = '';
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
    this._syncLowHp(actor);
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
    if (this._skillsEnabled === false) return;
    if (actor.phase !== 'field' || actor.wakeLeft > 0) return;
    const unlocked = this._unlockedCount(actor);
    for (const orb of actor.orbs) {
      const open = orb.index < unlocked;
      if (open && !orb.opened) {
        orb.opened = true;
        // S2/S3 sit on a full CD while locked, so the first tick after
        // tier-up would hide the ult for another 5s. Bring them up.
        if (orb.index > 0 && orb.left >= orb.cdMs && !orb.pending && !(orb.flashLeft > 0)) {
          orb.left = 300;
        }
      }
      if (!open) continue;
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
    if (this._attacksPaused()) {
      if (!(orb.flashLeft > 0) && orb.left > 0) orb.left = Math.max(0, orb.left - Math.max(0, dt));
      return;
    }
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
    if (actor.meleePhase) {
      actor.meleePhase = null;
      if (actor.state === 'melee') actor.state = 'idle';
    }
    if (actor.state === 'attack') return;
    this._beginAttack(actor);
  }

  /**
   * Recalled pets keep charging skill CDs at 1.0× and do not cast from the bed.
   * @param {PetActor} actor
   * @param {number} dt
   */
  _tickSleepCd(actor, dt) {
    if (this._skillsEnabled === false) return;
    const unlocked = this._unlockedCount(actor);
    const step = Math.max(0, dt);
    for (const orb of actor.orbs) {
      if (orb.index >= unlocked || orb.pending) continue;
      if (orb.left > 0) orb.left = Math.max(0, orb.left - step);
    }
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
    if (actor.invulnLeft > 0) actor.invulnLeft = Math.max(0, actor.invulnLeft - dt);
    if (actor.debugSkillGuard > 0) actor.debugSkillGuard = Math.max(0, actor.debugSkillGuard - dt);
    actor.lowPulse = (actor.lowPulse || 0) + dt;
    this._tickHitLook(actor, dt);
    this._tickLowHint(actor, dt);
    let gain = EMPTY;
    try {
      if (actor.popLeft > 0) actor.popLeft = Math.max(0, actor.popLeft - dt);
      this._stepLunge(actor, dt);
      this._place(actor);

      // Skills keep moving during a bite so the ground tell and the ult
      // are not frozen for the whole flinch. skills advance during a bite.
      const attacksPaused = this._attacksPaused();
      if (actor.wakeLeft <= 0 && !attacksPaused) {
        if (actor.castQueue.length > 0 && actor.state !== 'attack') {
          this._beginAttack(actor);
        }
        if (actor.state === 'attack') {
          actor.attackElapsed += dt;
          gain = this._advanceAttack(actor, zombies, threat);
        }
      }
      if (!attacksPaused && actor.telegraph) this._ageTelegraph(actor, dt);

      if (actor.hitPhase) {
        this._presentHurt(actor);
        return gain;
      }

      if (actor.wakeLeft > 0) {
        const use = Math.min(actor.wakeLeft, dt);
        actor.wakeLeft -= use;
        dt -= use;
        playLoop(sprite, this._babyIdleKey(actor));
        faceLeft(sprite);
        this._place(actor);
        if (actor.wakeLeft > 0 || dt <= 0) return gain;
      }

      if (actor.state === 'attack') return gain;

      if (this._attacksPaused()) return gain;

      if (actor.meleeGap > 0) actor.meleeGap = Math.max(0, actor.meleeGap - dt);
      if (actor.meleePhase) {
        gain = this._advanceMelee(actor, dt, zombies);
        return gain;
      }

      if (!threat && !actor.leaving) {
        this._tickCombatNap(actor, dt);
        return EMPTY;
      }
      if (threat && actor.rest) this._combatWake(actor);

      this._stepMove(actor, threat, player, dt);
      if (actor.meleePhase) gain = this._advanceMelee(actor, dt, zombies);
      return gain;
    } finally {
      this._applyHitLook(actor);
    }
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
      playLoop(sprite, this._babyIdleKey(actor));
      faceLeft(sprite);
      return;
    }
    actor.leaving = false;
    if (actor.latchId !== threat.id) {
      actor.latched = false;
      actor.latchId = threat.id;
    }
    // Retarget every frame. A frozen latch walks the pet back onto a
    // zombie that marched into the old stand.
    const dest = this._aimPoint(actor, threat, player);
    actor.destX = dest.x;
    actor.destY = dest.y;
    const dx = actor.destX - sprite.x;
    const dy = actor.destY - sprite.y;
    const dist = Math.hypot(dx, dy);
    const arrive = layoutPx(5);
    // The stand point slides with the zombie, so a pet can sit inside
    // MELEE.RANGE and still miss the 8px arrival check. Swing as soon as
    // the forward box is true.
    if (dist <= arrive || this._inMeleeReach(actor)) {
      actor.latched = true;
      if (dist <= arrive) {
        sprite.x = actor.destX;
        sprite.y = actor.destY;
      }
      actor.state = 'idle';
      if (!this._basicStripLive(actor)) playLoop(sprite, this._babyIdleKey(actor));
      faceLeft(sprite);
      this._place(actor);
      this.tryBasic(actor, this._liveZombies);
      return;
    }
    const step = GAME_CONFIG.PETS.MOVE_SPEED * LAYOUT_SCALE * (deltaMs / 1000);
    const span = Math.max(dist, 0.001);
    sprite.x += dx * Math.min(1, step / span);
    sprite.y += dy * Math.min(1, step / span);
    actor.state = 'move';
    const moveKey = actor.role.move;
    if (moveKey && sprite.scene?.anims?.exists?.(moveKey)) playLoop(sprite, moveKey);
    else playLoop(sprite, this._babyIdleKey(actor));
    faceLeft(sprite);
    this._place(actor);
  }

  /**
   * True when a living zombie is inside this pet's melee box.
   * @param {PetActor} actor
   */
  _inMeleeReach(actor) {
    const sprite = actor?.sprite;
    if (!sprite) return false;
    const pets = GAME_CONFIG.PETS.MELEE;
    const range = layoutPx(pets.RANGE);
    const yHalf = layoutPx(pets.Y_HALF);
    return this._liveZombies.some(
      (z) => z?.alive && z.body && inForwardBox(sprite.x, sprite.y, z.x, z.y, range, yHalf)
    );
  }

  /**
   * Hold on the threat's road lane, in front of it, inside MELEE.RANGE.
   * Recomputed every frame.
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie} threat
   * @param {{ x?: number, y?: number }|null} player
   */
  _aimPoint(actor, threat, player) {
    const stand = engageStand(actor.role.id);
    let x = threat.x + stand;
    // Same road lane as the zombie. A drop toward the camera parks the pet
    // on the grass edge with a gap wider than the swing, so tryBasic never
    // sees them. The stand X is 0.7 of MELEE.RANGE, inside the forward box.
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
    const dest = deployPoint(player, cameraRight(this.scene));
    const dx = dest.x - sprite.x;
    const dy = dest.y - sprite.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= layoutPx(5)) {
      sprite.x = dest.x;
      sprite.y = dest.y;
      actor.leaving = false;
      actor.state = 'idle';
      playLoop(sprite, this._babyIdleKey(actor));
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
    else playLoop(sprite, this._babyIdleKey(actor));
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
    this._syncStars(actor);
  }

  /**
   * No target in aggro: walk to the recall bed and sleep. Phase stays field
   * so GO! / Back! still recalls, and skill CDs keep charging.
   * @param {PetActor} actor
   * @param {number} dt
   */
  _tickCombatNap(actor, dt) {
    if (!actor.rest) {
      this._claimBed(actor);
      actor.rest = 'seek';
      actor.latched = false;
      actor.latchId = null;
      actor.state = 'move';
      actor.meleePhase = null;
    }
    if (actor.rest === 'seek') this._stepSeek(actor, dt);
    else if (actor.rest === 'settle') this._stepSettle(actor, dt);
    else this._stepSleep(actor);
    this._syncStars(actor);
  }

  /** Threat walked into range. Stand up without a second GO! float. @param {PetActor} actor */
  _combatWake(actor) {
    const was = actor.rest;
    actor.rest = null;
    actor.settleLeft = 0;
    actor.tucked = false;
    actor.sleepSlot = null;
    actor.state = 'idle';
    actor.meleePhase = null;
    if (was === 'sleep' || was === 'settle' || was === 'seek') {
      this.scene?.events?.emit?.('pet:wake', { petId: actor.role.id });
    }
    faceLeft(actor.sprite);
    playLoop(actor.sprite, this._babyIdleKey(actor));
  }

  /**
   * @param {PetActor} actor
   * @param {number} dt
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   */
  _advanceMelee(actor, dt, zombies) {
    let left = Math.max(0, dt);
    let gold = 0;
    let kills = 0;
    let guard = 0;
    const pets = GAME_CONFIG.PETS.MELEE;
    while (left > 0 && actor.meleePhase && guard < 6) {
      guard += 1;
      const use = Math.min(left, Math.max(0, actor.meleeLeft));
      if (actor.meleePhase === 'windup') this._stepIn(actor, use, pets.WINDUP_MS);
      actor.meleeLeft -= use;
      left -= use;
      if (actor.meleeLeft > 0) break;
      if (actor.meleePhase === 'windup') {
        const gain = this._meleeImpact(actor, zombies);
        gold += gain.gold;
        kills += gain.kills;
        actor.meleePhase = 'recover';
        actor.meleeLeft = pets.RECOVER_MS;
        continue;
      }
      actor.meleePhase = null;
      actor.state = 'idle';
      actor.meleeGap = pets.GAP_MS;
      if (!this._basicStripLive(actor)) playLoop(actor.sprite, this._babyIdleKey(actor));
      break;
    }
    this._place(actor);
    return { gold, kills };
  }

  /**
   * @param {PetActor} actor
   * @param {number} use
   * @param {number} windup
   */
  _stepIn(actor, use, windup) {
    const sprite = actor.sprite;
    if (!sprite || !(windup > 0)) return;
    const step = layoutPx(GAME_CONFIG.PETS.MELEE.STEP_PX) * (use / windup);
    sprite.x -= step;
    faceLeft(sprite);
  }

  /**
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   */
  _meleeImpact(actor, zombies) {
    const sprite = actor.sprite;
    const pets = GAME_CONFIG.PETS.MELEE;
    const range = layoutPx(pets.RANGE);
    const yHalf = layoutPx(pets.Y_HALF);
    const hits = threatsInShape(zombies, (z) =>
      inForwardBox(sprite?.x ?? actor.x, sprite?.y ?? actor.y, z.x, z.y, range, yHalf)
    );
    this._showMeleeFan(actor);
    this.scene?.audio?.playPetMeleeHit?.();
    this.scene?.audio?.playPetBasicAttack?.();
    const color = DAMAGE_COLORS[actor.role.id] || DAMAGE_COLORS.pet;
    return this._strikeAll(actor, hits, pets.DAMAGE, color, { knockback: true, critChance: 0.22 });
  }

  /**
   * One-frame faint cone in front of the pet. MELEE.FAN turns it off.
   * @param {PetActor} actor
   */
  _showMeleeFan(actor) {
    if (GAME_CONFIG.PETS.MELEE.FAN === false) return;
    const sprite = actor.sprite;
    if (!sprite) return;
    this._clearMeleeFan(actor);
    const range = layoutPx(GAME_CONFIG.PETS.MELEE.RANGE);
    const yHalf = layoutPx(GAME_CONFIG.PETS.MELEE.Y_HALF);
    const node = makeMeleeFan(this.scene, sprite.x, sprite.y, range, yHalf);
    if (!node) return;
    actor.meleeFan = { node, life: GAME_CONFIG.PETS.MELEE.FAN_MS };
    this.fxLog.push('melee-fan');
  }

  /** @param {number} dt */
  _ageMeleeFans(dt) {
    const step = Number.isFinite(dt) ? dt : 0;
    for (const actor of this._actors) {
      const fan = actor.meleeFan;
      if (!fan) continue;
      fan.life -= step;
      if (fan.life <= 0) this._clearMeleeFan(actor);
    }
  }

  /** @param {PetActor} actor */
  _clearMeleeFan(actor) {
    if (!actor?.meleeFan) return;
    destroySprite(actor.meleeFan.node);
    actor.meleeFan = null;
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
    const low = ratio > 0 && ratio < GAME_CONFIG.PETS.LOW_HP_RATIO;
    const lowWave = low && !hot ? 1 + 0.35 * (0.5 + 0.5 * Math.sin((actor.lowPulse || 0) / 80)) : 1;
    const element = PET_ELEMENT_TINT[actor.role.element] ?? 0xfff3c4;
    bg.x = sprite.x;
    bg.y = y;
    fg.x = sprite.x - w / 2;
    fg.y = y;
    if (typeof fg.setFillStyle === 'function') fg.setFillStyle(hot ? 0xfff6e8 : element);
    if (typeof fg.setScale === 'function') fg.setScale(Math.max(0.02, ratio), (hot ? 1.7 : 1) * lowWave);
    const depth = depthFromY(y, 2);
    bg.setDepth?.(depth);
    fg.setDepth?.(depth + 1);
    const expRatio = this.evolve?.expRatio?.(actor.role.id) ?? 0;
    const expY = y - layoutPx(6);
    if (actor.expBg) {
      actor.expBg.x = sprite.x;
      actor.expBg.y = expY;
      actor.expBg.setDepth?.(depth);
    }
    if (actor.expFg) {
      actor.expFg.x = sprite.x - w / 2;
      actor.expFg.y = expY;
      if (typeof actor.expFg.setScale === 'function') actor.expFg.setScale(Math.max(0.02, expRatio), 1);
      actor.expFg.setDepth?.(depth + 1);
    }
  }

  /**
   * Tier marker above the pet. Origin (0.5, 1). Burst only when the tier rises.
   * PIXELLAB_HOOK: assets/library/fx/v026/evolve-stars/vfx-evolve-stars-{1,2,3}.png
   * @param {PetActor} actor
   */
  _syncStars(actor) {
    const sprite = actor.sprite;
    if (!sprite?.active) {
      destroySprite(actor.stars);
      actor.stars = null;
      actor.starsKey = '';
      return;
    }
    const tier = Math.max(1, Math.min(3, this._tierOf(actor) || 1));
    if (tier > (actor.shownTier || 1)) this._burstEvolve(actor, tier);
    actor.shownTier = tier;
    const key = `vfx-evolve-stars-${tier}`;
    const scene = this.scene;
    if (actor.starsKey !== key || !actor.stars?.active) {
      destroySprite(actor.stars);
      actor.stars = null;
      actor.starsKey = '';
      if (scene?.textures?.exists?.(key)) {
        const make = scene.add?.image || scene.add?.sprite;
        const node = make?.call(scene.add, sprite.x, sprite.y - layoutPx(42), key);
        if (node) {
          node.setOrigin?.(0.5, 1);
          node.setDepth?.(depthFromY(sprite.y, 4));
          actor.stars = node;
          actor.starsKey = key;
        }
      }
    }
    if (actor.stars) {
      actor.stars.x = sprite.x;
      actor.stars.y = sprite.y - layoutPx(42);
      actor.stars.setDepth?.(depthFromY(sprite.y, 4));
    }
  }

  /**
   * Visual only. PetEvolve.addExp already emits pet:evolved and plays the sting.
   * @param {PetActor} actor
   * @param {number} tier
   */
  _burstEvolve(actor, tier) {
    const sprite = actor.sprite;
    if (!sprite) return;
    const key = `vfx-evolve-stars-${tier}`;
    const y = sprite.y - layoutPx(48);
    const node = playLibraryFx(this.scene, sprite.x, y, key, {
      scale: 1.35,
      depth: depthFromY(sprite.y, 8),
    });
    if (!node) return;
    this.scene?.tweens?.add?.({
      targets: node,
      y: y - layoutPx(22),
      alpha: 0,
      duration: 700,
      onComplete: () => destroySprite(node),
    });
  }

  /**
   * Ground tell before the skill hits. S1 and S2 draw a filled lane ellipse
   * plus the catalog ring, held fully opaque until mark.age reaches
   * TELEGRAPH_MS, then faded. Depth sits above the march and below the HUD
   * so a closer zombie cannot cover the aim point. S3 keeps the half-screen
   * wash. A bite does not pause mark.age.
   * PIXELLAB_HOOK: assets/library/fx/v026/telegraph/
   * @param {PetActor} actor
   * @param {number} orbIndex
   */
  _showTelegraph(actor, orbIndex) {
    this._clearTelegraph(actor);
    const scene = this.scene;
    const sprite = actor.sprite;
    if (!scene?.add || !sprite) return;
    scene.audio?.playSkillTelegraph?.();
    const pets = GAME_CONFIG.PETS;
    const threat = actor.focusThreat || nearestBarricadeThreat(this._liveZombies);
    const aim = telegraphPoint(actor, orbIndex, threat);
    if (orbIndex >= 2) {
      this._showHalfTell(actor, scene, aim);
      return;
    }
    const radius = orbIndex >= 1 ? pets.SKILL_R.s2 : pets.SKILL_R.s1;
    const width = Math.max(layoutPx(280), layoutPx(radius * 2));
    const height = Math.max(layoutPx(120), Math.round(width * pets.TELEGRAPH_GROUND_Y));
    const spot = clampTellPoint(scene, aim.x, aim.y, width / 2, height / 2);
    const disc = makeTellDisc(scene, spot.x, spot.y, width, height);
    const key = orbIndex >= 1 ? 'vfx-telegraph-ring-128' : 'vfx-telegraph-ring';
    const frame = orbIndex >= 1 ? 128 : 64;
    const node = makeTellRing(scene, spot.x, spot.y, key, width, height, frame);
    disc?.setDepth?.(TELL_DEPTH);
    node?.setDepth?.(TELL_DEPTH + 1);
    actor.telegraph = { node, disc, age: 0, discFill: 0.92 };
    this._paintTelegraph(actor.telegraph, 1);
  }

  /**
   * S3 half-left wash. No ground squash. Catalog key vfx-telegraph-half-left.
   * @param {PetActor} actor
   * @param {Phaser.Scene} scene
   * @param {{ x: number, y: number }} aim
   */
  _showHalfTell(actor, scene, aim) {
    const key = 'vfx-telegraph-half-left';
    const camW = scene.cameras?.main?.width || 1280;
    const scale = camW / 2 / 192;
    const node = makeTellRing(scene, aim.x, aim.y, key, 192 * scale, 192 * scale, 192);
    node?.setFlipX?.(true);
    node?.setDepth?.(TELL_DEPTH);
    actor.telegraph = { node, disc: null, age: 0, discFill: 1 };
  }

  /**
   * @param {PetActor} actor
   * @param {number} dt
   */
  _ageTelegraph(actor, dt) {
    const mark = actor.telegraph;
    if (!mark) return;
    const step = Number.isFinite(dt) ? Math.max(0, dt) : 0;
    mark.age += step;
    const hold = GAME_CONFIG.PETS.TELEGRAPH_MS;
    const fade = GAME_CONFIG.PETS.TELEGRAPH_FADE_MS;
    if (mark.age >= hold + fade) {
      this._clearTelegraph(actor);
      return;
    }
    const alpha = mark.age < hold ? 1 : Math.max(0, 1 - (mark.age - hold) / Math.max(1, fade));
    this._paintTelegraph(mark, alpha);
  }

  /** @param {{ node?: object|null, disc?: object|null, discFill?: number }} mark @param {number} alpha */
  _paintTelegraph(mark, alpha) {
    const shown = Math.max(0, Math.min(1, alpha));
    mark.node?.setAlpha?.(shown);
    mark.disc?.setAlpha?.(shown * (mark.discFill ?? 1));
  }

  /** @param {PetActor} actor */
  _clearTelegraph(actor) {
    if (!actor?.telegraph) return;
    destroySprite(actor.telegraph.node);
    destroySprite(actor.telegraph.disc);
    actor.telegraph = null;
  }

  /**
   * Lingering element patch. PIXELLAB_HOOK: assets/library/fx/v026/aoe/
   * @param {PetActor} actor
   * @param {number} x
   * @param {number} y
   */
  _showResidue(actor, x, y) {
    const key = RESIDUE_KEY[actor.role.id];
    if (!key || !Number.isFinite(x) || !Number.isFinite(y)) return;
    const node = playLibraryFx(this.scene, x, y, key, { depth: depthFromY(y, 5) });
    if (!node) return;
    this.scene?.tweens?.add?.({
      targets: node,
      alpha: 0,
      duration: 700,
      onComplete: () => destroySprite(node),
    });
  }

  /**
   * Letterbox, then themed form-3 plus a forward half-screen hit.
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {import('../entities/Zombie.js').Zombie|null} threat
   */
  _startUlt(actor, zombies, threat) {
    const list = Array.isArray(zombies) ? zombies.slice() : [];
    this.ult?.play?.(actor.role.id, () => {
      this._applyUltHit(actor, list, threat);
    });
  }

  /**
   * Start the letterbox now. Used by the `?debugExp=1` U key so a tier-3
   * pet does not have to wait out the skill queue.
   * @param {string|{ id?: string }|null} [petId]
   * @returns {boolean}
   */
  forceUlt(petId) {
    const id = typeof petId === 'string' ? petId : petId?.id;
    const actor = this._actors.find((entry) => {
      if (entry.phase !== 'field' || !(entry.hp > 0) || !entry.sprite?.active) return false;
      return id ? entry.role.id === id : true;
    });
    if (!actor) return false;
    this._startUlt(actor, this._liveZombies, nearestBarricadeThreat(this._liveZombies));
    return this.ultPlaying;
  }

  /**
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {import('../entities/Zombie.js').Zombie|null} threat
   */
  _applyUltHit(actor, zombies, threat) {
    const focus = focusPoint(actor, threat);
    this._showResidue(actor, focus.x, focus.y);
    this.hitstop(GAME_CONFIG.PETS.HITSTOP_S3_MS);
    const color = DAMAGE_COLORS[actor.role.id] || DAMAGE_COLORS.pet;
    this._ultSwing = true;
    let gain = EMPTY;
    try {
      gain = this._withCrit(0.55, () => {
        const themed = this._castForm3(actor, zombies, threat);
        const hits = this._halfScreenHits(actor, zombies);
        const aoe = this._strikeAll(actor, hits, 10, color, { knockback: true, critChance: 0.55, ult: true });
        return { gold: (themed?.gold || 0) + aoe.gold, kills: (themed?.kills || 0) + aoe.kills };
      });
    } finally {
      this._ultSwing = false;
    }
    this._loot.gold = (this._loot.gold || 0) + gain.gold;
    this._loot.kills = (this._loot.kills || 0) + gain.kills;
  }

  /**
   * Zombies in the forward half of the camera, roughly on the pet's side of the screen.
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   */
  _halfScreenHits(actor, zombies) {
    const x = actor.sprite?.x ?? actor.x;
    const y = actor.sprite?.y ?? actor.y;
    const camW = this.scene?.cameras?.main?.width || 1280;
    const reach = camW / 2;
    return threatsInShape(
      zombies,
      (z) => z.x <= x + layoutPx(8) && z.x >= x - reach && Math.abs((z.y ?? y) - y) <= reach
    );
  }

  /** @param {PetActor} actor */
  _destroyBars(actor) {
    destroySprite(actor.hpBg);
    destroySprite(actor.hpFg);
    destroySprite(actor.expBg);
    destroySprite(actor.expFg);
    actor.hpBg = null;
    actor.hpFg = null;
    actor.expBg = null;
    actor.expFg = null;
  }

  /**
   * Every form plays its cast strip during the tell and releases on that
   * strip's castFrame, only after TELEGRAPH_MS. The ground circle is already up.
   * @param {PetActor} actor
   */
  _beginAttack(actor) {
    actor.state = 'attack';
    actor.released = false;
    actor.attackElapsed = 0;
    actor.hurtStrip = false;
    faceLeft(actor.sprite);
    const orb = actor.castQueue[0] ?? 0;
    actor.castSkill = petSkillKey(actor.role.id, orb);
    this._showTelegraph(actor, orb);
    playOnce(actor.sprite, actor.castSkill);
  }

  /**
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {import('../entities/Zombie.js').Zombie|null} threat
   */
  _advanceAttack(actor, zombies, threat) {
    const sprite = actor.sprite;
    const orb = actor.castQueue[0] ?? 0;
    const skill = actor.castSkill || petSkillKey(actor.role.id, orb);
    const spec = petSkillSpec(skill);
    const castFrame = spec?.castFrame ?? GAME_CONFIG.PETS.RELEASE_FRAME;
    const frames = spec?.frames > 0 ? spec.frames : 8;
    const anims = sprite?.anims;
    const frame = anims?.currentFrame?.index ?? 0;
    const progress = typeof anims?.getProgress === 'function' ? anims.getProgress() : 0;
    const playingSkill = !!(anims?.isPlaying && anims.currentAnim?.key === skill);
    const frameKnown = playingSkill && Number.isFinite(frame);
    const told = actor.attackElapsed >= GAME_CONFIG.PETS.TELEGRAPH_MS;
    const due = !told
      ? false
      : frameKnown
        ? frame >= castFrame || actor.attackElapsed >= GAME_CONFIG.PETS.ATTACK_MAX_MS
        : (playingSkill && progress >= castFrame / frames) ||
          !playingSkill ||
          actor.attackElapsed >= GAME_CONFIG.PETS.ATTACK_MAX_MS;
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
    const swingDone = !playingSkill || actor.attackElapsed >= GAME_CONFIG.PETS.ATTACK_MAX_MS;
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
    actor.castSkill = '';
    faceLeft(actor.sprite);
    playLoop(actor.sprite, this._babyIdleKey(actor));
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
    if (orbIndex >= 2 && this._allowUlt(actor)) {
      this._presentForm3(actor);
      actor.form3Shown = true;
      this._startUlt(actor, zombies, threat);
      return EMPTY;
    }
    if (orbIndex >= 1) {
      const focus = focusPoint(actor, threat);
      this._showResidue(actor, focus.x, focus.y);
    }
    if (orbIndex <= 0) return this._cast(actor, zombies, threat);
    if (orbIndex === 1) {
      this.hitstop(GAME_CONFIG.PETS.HITSTOP_S2_MS);
      return this._withCrit(0.45, () => this._castForm2(actor, zombies, threat));
    }
    this.hitstop(GAME_CONFIG.PETS.HITSTOP_S3_MS);
    this._ultSwing = true;
    try {
      return this._withCrit(0.55, () => this._castForm3(actor, zombies, threat));
    } finally {
      this._ultSwing = false;
    }
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
    const spec = petSkillSpec(petSkillKey(actor.role.id, 0));
    const sprite = actor.sprite;
    const off = spec?.spawnOffset ?? [cfg.MOUTH_X, cfg.MOUTH_Y];
    const from = framePoint(sprite, off[0], off[1]);
    const aim = threat
      ? { x: threat.x, y: chestY(threat) }
      : { x: from.x - layoutPx(80), y: from.y };
    const speed = cfg.SPEED * LAYOUT_SCALE;
    const limit = (cfg.AIM_LIMIT_DEG * Math.PI) / 180;
    const { vx, vy } = leftBoltVelocity(from.x, from.y, aim.x, aim.y, speed, limit);
    const scale = Math.abs(sprite.scaleY || 1);
    const key = spec?.fx?.[0] || actor.role.projectile;
    const impact = spec?.fx?.[1] || actor.role.impact;
    const fans = spec?.fanDeg?.length ? spec.fanDeg : [0];
    const base = Math.atan2(vy, vx);
    for (const deg of fans) {
      const ang = base + (deg * Math.PI) / 180;
      const fvx = Math.cos(ang) * speed;
      const fvy = Math.sin(ang) * speed;
      const bolt = spawnProjectile(this.scene, from.x, from.y, key, scale);
      if (bolt) {
        bolt.setRotation(aimRotation(fvx, fvy, 'west'));
        bolt.setDepth(depthFromY(from.y, 3));
      }
      this.fxLog.push(key);
      this._bolts.push({
        sprite: bolt,
        actor,
        x: from.x,
        y: from.y,
        vx: fvx,
        vy: fvy,
        hitIds: new Set(),
        impact,
        scale,
        decorative: deg !== 0,
      });
    }
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
    const spec = petSkillSpec(petSkillKey(actor.role.id, 0));
    const sprite = actor.sprite;
    const scale = Math.abs(sprite.scaleY || 1);
    const dust = spec?.fx?.[0] || actor.role.windup;
    const impact = spec?.fx?.[1] || actor.role.impact;
    const off = spec?.spawnOffset ?? [-8, -8];
    const puff = framePoint(sprite, off[0], off[1]);
    this._fx(puff.x, puff.y, dust, scale, sprite.y);
    const range = cfg.RANGE * LAYOUT_SCALE;
    const yHalf = cfg.Y_HALF * LAYOUT_SCALE;
    const target = closestThreatWhere(zombies, (z) =>
      inForwardBox(sprite.x, sprite.y, z.x, z.y, range, yHalf)
    );
    const travel = spec?.travelOffset?.[0] ?? off[0];
    this._beginLunge(actor, travel * scale, dust, scale);
    if (!target) return EMPTY;
    const hy = chestY(target);
    this._fx(target.x, hy, impact, scale, hy);
    const gain = this._strike(actor, target, cfg.DAMAGE, DAMAGE_COLORS.panda);
    if (!gain.killed && typeof target.applySlow === 'function') {
      target.applySlow(cfg.SLOW_MULT, this._ccMs(actor, cfg.SLOW_MS));
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
    const spec = petSkillSpec(petSkillKey(actor.role.id, 0));
    const sprite = actor.sprite;
    const scale = Math.abs(sprite.scaleY || 1);
    const off = spec?.spawnOffset ?? [cfg.FORWARD_X, cfg.FORWARD_Y];
    const from = framePoint(sprite, off[0], off[1]);
    const slash = spec?.fx?.[0] || actor.role.impact;
    this._fx(from.x, from.y, slash, scale, from.y);
    const travel = spec?.travelOffset?.[0] ?? off[0];
    this._beginLunge(actor, travel * scale);
    const range = cfg.RANGE * LAYOUT_SCALE;
    const half = (cfg.HALF_ANGLE_DEG * Math.PI) / 180;
    const hits = threatsInShape(zombies, (z) =>
      inLeftCone(from.x, from.y, z.x, chestY(z), range, half)
    ).slice(0, cfg.MAX_TARGETS);
    return this._strikeAll(actor, hits, cfg.DAMAGE, DAMAGE_COLORS.lion);
  }

  /**
   * Short smoke puff from the mouth. Chip now, brief burn after.
   * Not the youth fireball.
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   */
  _castDragon(actor, zombies) {
    const cfg = GAME_CONFIG.PETS.DRAGON;
    const spec = petSkillSpec(petSkillKey(actor.role.id, 0));
    const sprite = actor.sprite;
    const scale = Math.abs(sprite.scaleY || 1);
    const off = spec?.spawnOffset ?? [cfg.MOUTH_X, cfg.MOUTH_Y];
    const mouth = framePoint(sprite, off[0], off[1]);
    const breath = spec?.fx?.[0] || actor.role.breath;
    this._fx(mouth.x, mouth.y, breath, scale, mouth.y);
    const range = cfg.RANGE * LAYOUT_SCALE;
    const half = (cfg.HALF_ANGLE_DEG * Math.PI) / 180;
    const hits = threatsInShape(zombies, (z) =>
      inLeftCone(mouth.x, mouth.y, z.x, chestY(z), range, half)
    ).slice(0, cfg.MAX_TARGETS);
    let gold = 0;
    let kills = 0;
    for (const z of hits) {
      const gain = this._strike(actor, z, cfg.CHIP, DAMAGE_COLORS.dragon);
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
    if (!actor.form3Shown) this._presentForm3(actor);
    actor.form3Shown = false;
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
    this._spawnRain(actor, focus);
    this.fxLog.push('phoenix-nova');
    const hits = threatsInShape(zombies, (z) => Math.hypot(z.x - focus.x, z.y - focus.y) <= radius);
    let gold = 0;
    let kills = 0;
    for (const z of hits) {
      const gain = this._strike(actor, z, cfg.damage, DAMAGE_COLORS.phoenix);
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
    this.fxLog.push('phoenix-dive');
    this._charges.push({
      node: null,
      actor,
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
    if (!target) {
      this._fxAtOffset(actor, petSkillSpec(petSkillKey(actor.role.id, 1)));
      return EMPTY;
    }
    this._fxAtOffset(actor, petSkillSpec(petSkillKey(actor.role.id, 1)));
    this.fxLog.push('panda-freeze');
    const gain = this._strike(actor, target, cfg.damage, DAMAGE_COLORS.panda);
    if (!gain.killed && typeof target.applyRoot === 'function') target.applyRoot(this._ccMs(actor, cfg.rootMs));
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
    this.fxLog.push('panda-blizzard');
    const hits = threatsInShape(zombies, (z) => Math.hypot(z.x - focus.x, z.y - focus.y) <= radius);
    let gold = 0;
    let kills = 0;
    for (const z of hits) {
      if (typeof z.applySlow === 'function') z.applySlow(cfg.slowMult, this._ccMs(actor, cfg.slowMs));
      if (typeof z.applyBurn === 'function') z.applyBurn(cfg.dot, cfg.dotIntervalMs, cfg.dotMs);
      const gain = this._strike(actor, z, cfg.dot, DAMAGE_COLORS.panda);
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
    const spec = petSkillSpec(petSkillKey(actor.role.id, 1));
    this._fxAtOffset(actor, spec);
    this.fxLog.push('lion-chain');
    hits.forEach((z, i) => {
      const dmg = cfg.damages[Math.min(i, cfg.damages.length - 1)];
      const gain = this._strike(actor, z, dmg, DAMAGE_COLORS.lion);
      gold += gain.gold;
      kills += gain.kills;
      if (!gain.killed && spec?.cone && typeof z.applyRoot === 'function') {
        z.applyRoot(spec.cone.stunMs);
      }
    });
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
    this.fxLog.push('lion-stomp');
    const hits = threatsInShape(zombies, (z) => Math.hypot(z.x - x, z.y - y) <= radius);
    let gold = 0;
    let kills = 0;
    for (const z of hits) {
      const gain = this._strike(actor, z, cfg.damage, DAMAGE_COLORS.lion);
      gold += gain.gold;
      kills += gain.kills;
      if (!gain.killed && typeof z.applyRoot === 'function') z.applyRoot(this._ccMs(actor, cfg.rootMs));
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
    this._spawnFireball(actor, threat);
    this.fxLog.push('dragon-cloud');
    const node = null;
    if (threat) this.applyKnockback(threat);
    this._zones.push({
      node,
      actor,
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
    this.fxLog.push('dragon-rain');
    if (!hits.length) return EMPTY;
    let gold = 0;
    let kills = 0;
    for (const z of hits) {
      const gain = this._strike(actor, z, cfg.chip, DAMAGE_COLORS.dragon);
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
   * @param {string|undefined} key
   * @param {number} scale
   * @param {number} depthY
   */
  _fx(x, y, key, scale, depthY) {
    if (!key || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    this.fxLog.push(key);
    return playCastFx(this.scene, x, y, key, scale, depthY);
  }

  /**
   * Attach the first FX key at the skill's spawnOffset.
   * @param {PetActor} actor
   * @param {import('../assets/petSkills.js').PetSkillSpec|null} spec
   */
  _fxAtOffset(actor, spec) {
    if (!spec?.fx?.[0]) return null;
    const sprite = actor.sprite;
    const scale = Math.abs(sprite?.scaleY || 1);
    const off = spec.spawnOffset || [0, 0];
    const at = sprite ? framePoint(sprite, off[0], off[1]) : { x: actor.x, y: actor.y };
    return this._fx(at.x, at.y, spec.fx[0], scale, at.y);
  }

  /**
   * Ancient catalog FX at cast time. Ground rings keep their origin on the
   * feet (x may shift by spawnOffset). The beam attaches at the mouth.
   * @param {PetActor} actor
   */
  _presentForm3(actor) {
    const spec = petSkillSpec(petSkillKey(actor.role.id, 2));
    if (!spec?.fx?.[0]) return;
    const sprite = actor.sprite;
    const scale = Math.abs(sprite?.scaleY || 1);
    const x = sprite?.x ?? actor.x;
    const y = sprite?.y ?? actor.y;
    if (spec.channel) {
      const off = spec.spawnOffset || [0, 0];
      const at = sprite ? framePoint(sprite, off[0], off[1]) : { x, y };
      this._spawnChannel(actor, at.x, at.y, spec.fx[0], scale, spec);
      return;
    }
    const shift = (spec.spawnOffset?.[0] || 0) * scale;
    this._fx(x + shift, y, spec.fx[0], scale, y);
  }

  /**
   * Body travel during Roll Raid / Cub Pounce. Dust, when set, is left
   * behind along the roll and does not follow. The offset is the manifest
   * travelOffset in frame px, so the body stays on the safe side of the fence.
   * @param {PetActor} actor
   * @param {number} dx canvas px, west negative
   * @param {string} [dustKey]
   * @param {number} [scale]
   */
  _beginLunge(actor, dx, dustKey, scale) {
    const sprite = actor.sprite;
    if (!sprite || !Number.isFinite(dx) || dx === 0) return;
    actor.lunge = {
      x0: sprite.x,
      y0: sprite.y,
      x1: sprite.x + dx,
      y1: sprite.y,
      left: 220,
      dur: 220,
      dustKey: dustKey || '',
      scale: scale || Math.abs(sprite.scaleY || 1),
      mid: false,
    };
  }

  /** @param {PetActor} actor @param {number} dt */
  _stepLunge(actor, dt) {
    const lung = actor.lunge;
    const sprite = actor.sprite;
    if (!lung || !sprite) return;
    lung.left = Math.max(0, lung.left - Math.max(0, dt));
    const t = lung.dur > 0 ? 1 - lung.left / lung.dur : 1;
    sprite.x = lung.x0 + (lung.x1 - lung.x0) * t;
    sprite.y = lung.y0 + (lung.y1 - lung.y0) * t;
    if (lung.dustKey && !lung.mid && t >= 0.45) {
      lung.mid = true;
      const mx = lung.x0 + (lung.x1 - lung.x0) * 0.45;
      this._fx(mx, lung.y0, lung.dustKey, lung.scale, lung.y0);
    }
    if (lung.left <= 0) actor.lunge = null;
  }

  /**
   * Phoenix Rain. 7 bolts across the manifest's 40–140 west / 60–90 up band.
   * Nova damage is applied by the caller, not per bolt.
   * @param {PetActor} actor
   * @param {{ x: number, y: number }} focus
   */
  _spawnRain(actor, focus) {
    const spec = petSkillSpec(petSkillKey(actor.role.id, 1));
    const rain = spec?.rain;
    const sprite = actor.sprite;
    const scale = Math.abs(sprite?.scaleY || 1);
    const boltKey = spec?.fx?.[0] || 'fx-pet-phoenix-rain-bolt';
    const impact = spec?.fx?.[1] || 'fx-pet-phoenix-rain-impact';
    const count = rain?.count || 7;
    const westMin = rain?.westMin ?? 40;
    const westMax = rain?.westMax ?? 140;
    const upMin = rain?.upMin ?? 60;
    const upMax = rain?.upMax ?? 90;
    const vx = (rain?.vxFrame ?? -2) * 60 * LAYOUT_SCALE;
    const vy = (rain?.vyFrame ?? 6) * 60 * LAYOUT_SCALE;
    const originX = sprite?.x ?? actor.x;
    const groundY = Number.isFinite(focus?.y) ? focus.y : (sprite?.y ?? actor.y);
    for (let i = 0; i < count; i++) {
      const u = count === 1 ? 0 : i / (count - 1);
      const west = layoutPx(westMin + (westMax - westMin) * u);
      const up = layoutPx(upMin + ((upMax - upMin) * ((i * 3) % count)) / Math.max(1, count - 1));
      const x = originX - west;
      const y = groundY - up;
      const node = spawnProjectile(this.scene, x, y, boltKey, scale);
      node?.setDepth?.(depthFromY(groundY, 8));
      this.fxLog.push(boltKey);
      this._falls.push({ sprite: node, x, y, groundY, vx, vy, impact, scale });
    }
  }

  /** @param {number} dt */
  _stepFalls(dt) {
    const sec = (Number.isFinite(dt) ? dt : 0) / 1000;
    const keep = [];
    for (const drop of this._falls) {
      drop.x += drop.vx * sec;
      drop.y += drop.vy * sec;
      if (drop.sprite) {
        drop.sprite.x = drop.x;
        drop.sprite.y = drop.y;
      }
      if (drop.y >= drop.groundY) {
        this._fx(drop.x, drop.groundY, drop.impact, drop.scale, drop.groundY);
        destroySprite(drop.sprite);
        continue;
      }
      if (drop.y > WORLD_HEIGHT + layoutPx(40)) {
        destroySprite(drop.sprite);
        continue;
      }
      keep.push(drop);
    }
    this._falls = keep;
  }

  /**
   * Scorching Fireball. Splash art on arrival. Cloud ticks keep the old damage.
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie|null} threat
   */
  _spawnFireball(actor, threat) {
    const spec = petSkillSpec(petSkillKey(actor.role.id, 1));
    const sprite = actor.sprite;
    const scale = Math.abs(sprite?.scaleY || 1);
    const off = spec?.spawnOffset ?? [-22, -28];
    const from = sprite ? framePoint(sprite, off[0], off[1]) : { x: actor.x, y: actor.y };
    const aim = threat
      ? { x: threat.x, y: chestY(threat) }
      : { x: from.x - layoutPx(120), y: from.y };
    const speed = (spec?.projectile?.pxPerFrame ?? 5) * 60 * LAYOUT_SCALE;
    const limit = (42 * Math.PI) / 180;
    const { vx, vy } = leftBoltVelocity(from.x, from.y, aim.x, aim.y, speed, limit);
    const key = spec?.fx?.[0] || 'fx-pet-dragon-fireball';
    const impact = spec?.fx?.[1] || 'fx-pet-dragon-fireball-impact';
    const node = spawnProjectile(this.scene, from.x, from.y, key, scale);
    if (node) {
      node.setRotation?.(aimRotation(vx, vy, 'west'));
      node.setDepth?.(depthFromY(from.y, 3));
    }
    this.fxLog.push(key);
    this._bolts.push({
      sprite: node,
      actor,
      x: from.x,
      y: from.y,
      vx,
      vy,
      hitIds: new Set(),
      impact,
      scale,
      kind: 'fireball',
      aimX: aim.x,
    });
  }

  /**
   * Apocalyptic Flame. Start, then loop frames 4–9, then the burnout.
   * @param {PetActor} actor
   * @param {number} x
   * @param {number} y
   * @param {string} key
   * @param {number} scale
   * @param {import('../assets/petSkills.js').PetSkillSpec} spec
   */
  _spawnChannel(actor, x, y, key, scale, spec) {
    const scene = this.scene;
    const channel = spec.channel;
    /** @type {Phaser.GameObjects.Sprite|null} */
    let sprite = null;
    if (scene?.add?.sprite && scene.textures?.exists?.(key)) {
      sprite = scene.add.sprite(x, y, key);
      const asset = libraryAsset(scene, key);
      const origin = asset?.origin ?? [0.9844, 0.5];
      sprite.setOrigin?.(origin[0], origin[1]);
      sprite.setScale?.(scale);
      sprite.setDepth?.(depthFromY(y, 6));
      try {
        sprite.play?.(key);
      } catch (_) {
        /* phase sync plays the loop next */
      }
    }
    this.fxLog.push(key);
    const rate = channel?.frameRate > 0 ? channel.frameRate : 12;
    const ms = (frames) => (Math.max(0, frames) / rate) * 1000;
    const loopFrom = channel?.loopFrom ?? 4;
    const loopTo = channel?.loopTo ?? 9;
    const total = channel?.frames ?? 14;
    this._channels.push({
      sprite,
      actor,
      key,
      ox: spec.spawnOffset?.[0] ?? 0,
      oy: spec.spawnOffset?.[1] ?? 0,
      elapsed: 0,
      phase: '',
      startMs: ms(loopFrom),
      loopMs: ms(loopTo - loopFrom + 1) * 2,
      endMs: ms(Math.max(1, total - loopTo - 1)),
    });
    this._syncChannel(this._channels[this._channels.length - 1]);
  }

  /** @param {ChannelBeam} beam */
  _syncChannel(beam) {
    if (!beam?.sprite) return;
    let phase = 'start';
    if (beam.elapsed >= beam.startMs + beam.loopMs) phase = 'end';
    else if (beam.elapsed >= beam.startMs) phase = 'loop';
    if (beam.phase === phase) return;
    beam.phase = phase;
    const anim = `${beam.key}:${phase}`;
    const scene = beam.sprite.scene;
    const key = scene?.anims?.exists?.(anim) ? anim : beam.key;
    try {
      beam.sprite.play?.(key);
    } catch (_) {
      /* hold the sheet */
    }
  }

  /** @param {number} dt */
  _stepChannels(dt) {
    const step = Number.isFinite(dt) ? dt : 0;
    const keep = [];
    for (const beam of this._channels) {
      beam.elapsed += step;
      const sprite = beam.actor?.sprite;
      if (sprite && beam.sprite && beam.actor.state === 'attack') {
        const at = framePoint(sprite, beam.ox, beam.oy);
        beam.sprite.x = at.x;
        beam.sprite.y = at.y;
        beam.sprite.setDepth?.(depthFromY(sprite.y, 6));
      }
      this._syncChannel(beam);
      const done = beam.elapsed >= beam.startMs + beam.loopMs + beam.endMs;
      if (done || (beam.sprite && beam.sprite.active === false)) {
        destroySprite(beam.sprite);
        continue;
      }
      keep.push(beam);
    }
    this._channels = keep;
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
        const gain = this._strike(charge.actor, z, charge.damage, charge.color);
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
          const gain = this._strike(zone.actor, z, zone.damage, zone.hitColor, { knockback: false, hitstop: false });
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
      if (bolt.kind === 'fireball') {
        const reached = Number.isFinite(bolt.aimX) && bolt.x <= bolt.aimX;
        const hit = zombies.some((z) => z?.alive && z.body && boltOverlaps(z, bolt.x, bolt.y));
        if (reached || hit) {
          this._fx(bolt.x, bolt.y, bolt.impact, bolt.scale, bolt.y);
          destroySprite(bolt.sprite);
          continue;
        }
        keep.push(bolt);
        continue;
      }
      if (bolt.decorative) {
        const hit = zombies.some((z) => z?.alive && z.body && boltOverlaps(z, bolt.x, bolt.y));
        if (hit) {
          this._fx(bolt.x, bolt.y, bolt.impact, bolt.scale, bolt.y);
          destroySprite(bolt.sprite);
          continue;
        }
        keep.push(bolt);
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
        this._fx(bolt.x, hy, bolt.impact, bolt.scale, hy);
        const gain = this._strike(bolt.actor, z, damage, DAMAGE_COLORS.phoenix);
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
function engageStand(_id) {
  return layoutPx(GAME_CONFIG.PETS.MELEE.RANGE * 0.7);
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
 * Where the ground circle sits. S1 is the lane between the pet and the
 * threat. S2 is on the threat. S3 is the pet, for the half-screen wash.
 * @param {PetActor} actor
 * @param {number} orbIndex
 * @param {import('../entities/Zombie.js').Zombie|null} threat
 */
function telegraphPoint(actor, orbIndex, threat) {
  const px = actor.sprite?.x ?? actor.x;
  const py = actor.sprite?.y ?? actor.y;
  if (orbIndex >= 2) return { x: px, y: py };
  const focus = focusPoint(actor, threat);
  if (orbIndex >= 1) return { x: focus.x, y: focus.y };
  const ahead = Number.isFinite(focus.x) ? (px + focus.x) / 2 : px - layoutPx(36);
  return { x: ahead, y: py };
}

/**
 * Keep the ellipse center inside the camera so an off-screen threat
 * cannot hide the tell past the left edge.
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 * @param {number} halfW
 * @param {number} halfH
 */
function clampTellPoint(scene, x, y, halfW, halfH) {
  const cam = scene?.cameras?.main;
  if (!cam || !(cam.width > 0)) return { x, y };
  const scrollX = Number.isFinite(cam.scrollX) ? cam.scrollX : 0;
  const scrollY = Number.isFinite(cam.scrollY) ? cam.scrollY : 0;
  const width = cam.width;
  const height = cam.height || 720;
  const padX = Math.min(Math.max(8, halfW), width * 0.35);
  const padY = Math.min(Math.max(8, halfH), height * 0.35);
  return {
    x: Math.min(scrollX + width - padX, Math.max(scrollX + padX, x)),
    y: Math.min(scrollY + height - padY, Math.max(scrollY + padY, y)),
  };
}

/**
 * Filled ground ellipse. A missing catalog ring still leaves a readable disc.
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 * @param {number} width
 * @param {number} height
 */
/**
 * One-frame cone outline opening west. A missing graphics API falls back
 * to a faint disc so the swing is still visible.
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 * @param {number} range
 * @param {number} yHalf
 */
function makeMeleeFan(scene, x, y, range, yHalf) {
  const g = scene?.add?.graphics?.();
  if (g?.lineStyle && g.beginPath) {
    g.lineStyle(Math.max(1, layoutPx(1)), 0xfff4c8, 0.55);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x - range, y - yHalf);
    g.lineTo(x - range * 0.72, y);
    g.lineTo(x - range, y + yHalf);
    g.closePath();
    g.strokePath?.();
    g.setDepth?.(depthFromY(y, 6));
    g.setAlpha?.(0.7);
    return g;
  }
  const node = scene?.add?.ellipse?.(x - range * 0.45, y, range, yHalf * 2, 0xfff4c8, 0.18)
    || scene?.add?.circle?.(x - range * 0.45, y, Math.max(layoutPx(8), yHalf * 0.65), 0xfff4c8, 0.18);
  node?.setDepth?.(depthFromY(y, 6));
  node?.setAlpha?.(0.35);
  return node || null;
}

function makeTellDisc(scene, x, y, width, height) {
  const color = 0x39f3ff;
  const fill = 0.92;
  let disc = null;
  if (typeof scene.add.ellipse === 'function') {
    disc = scene.add.ellipse(x, y, width, height, color, fill);
  } else if (typeof scene.add.circle === 'function') {
    disc = scene.add.circle(x, y, width / 2, color, fill);
    disc?.setScale?.(1, height / Math.max(1, width));
  }
  if (!disc) return null;
  disc.setStrokeStyle?.(Math.max(4, Math.round(width * 0.035)), 0x5cf6ff, 1);
  return disc;
}

/**
 * Catalog ring in NORMAL blend, scaled to the disc. Not playLibraryFx:
 * a one-frame strip must not destroy itself on animationcomplete.
 * @param {Phaser.Scene} scene
 * @param {number} x
 * @param {number} y
 * @param {string} key
 * @param {number} width
 * @param {number} height
 * @param {number} frame
 */
function makeTellRing(scene, x, y, key, width, height, frame) {
  if (!key || !scene.textures?.exists?.(key) || typeof scene.add.sprite !== 'function') return null;
  const node = scene.add.sprite(x, y, key);
  const source = scene.textures.get?.(key)?.get?.();
  const fw = source?.width || frame || 64;
  const fh = source?.height || frame || 64;
  node.setOrigin?.(0.5, 0.5);
  node.setScale?.(width / Math.max(1, fw), height / Math.max(1, fh));
  node.setAlpha?.(1);
  const normal = globalThis.Phaser?.BlendModes?.NORMAL;
  if (normal != null) node.setBlendMode?.(normal);
  return node;
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
 * Hero body used to keep GO! / Back! off the back. Matches the 92px frame
 * with feet at y=76 and a 16px pad below the sole.
 * @param {{ x?: number, y?: number }|null|undefined} anchor
 * @returns {{ l: number, r: number, t: number, b: number }|null}
 */
export function floatHeroRect(anchor) {
  if (!Number.isFinite(anchor?.x) || !Number.isFinite(anchor?.y)) return null;
  const scale = displayScaleFromY(anchor.y);
  return {
    l: anchor.x - 46 * scale,
    r: anchor.x + 46 * scale,
    t: anchor.y - 76 * scale,
    b: anchor.y + 16 * scale,
  };
}

/**
 * Extents from the label anchor. GO! is 80×32, Back! is 128×32, origin bottom-center.
 * @param {{ texture?: { key?: string }, textureKey?: string, displayWidth?: number, width?: number, displayHeight?: number, height?: number, originX?: number, originY?: number }} node
 */
export function floatLabelBox(node) {
  const key = node?.texture?.key || node?.textureKey || '';
  const fallbackW = String(key).includes('back') ? 128 : 80;
  const w = node?.displayWidth || node?.width || fallbackW;
  const h = node?.displayHeight || node?.height || 32;
  const ox = Number.isFinite(node?.originX) ? node.originX : 0.5;
  const oy = Number.isFinite(node?.originY) ? node.originY : 1;
  return { left: w * ox, right: w * (1 - ox), up: h * oy, down: h * (1 - oy) };
}

/**
 * Camera view clipped to the world, inset by a few field px.
 * @param {Phaser.Scene|null|undefined} scene
 */
export function floatView(scene) {
  const margin = layoutPx(4);
  const world = {
    left: margin,
    top: margin,
    right: WORLD_WIDTH - margin,
    bottom: WORLD_HEIGHT - margin,
  };
  const cam = scene?.cameras?.main;
  if (!cam || !(cam.width > 0)) return world;
  const scrollX = Number.isFinite(cam.scrollX) ? cam.scrollX : 0;
  const scrollY = Number.isFinite(cam.scrollY) ? cam.scrollY : 0;
  const height = cam.height > 0 ? cam.height : WORLD_HEIGHT;
  const view = {
    left: Math.max(world.left, scrollX + margin),
    top: Math.max(world.top, scrollY + margin),
    right: Math.min(world.right, scrollX + cam.width - margin),
    bottom: Math.min(world.bottom, scrollY + height - margin),
  };
  if (!(view.right > view.left && view.bottom > view.top)) return world;
  return view;
}

/**
 * Prefer the offset point, then keep the whole label inside the view.
 * If that lands on the hero, lift it above the hero's head.
 * @param {number} x
 * @param {number} y
 * @param {{ left: number, right: number, up: number, down: number }} box
 * @param {{ left: number, right: number, top: number, bottom: number }} view
 * @param {{ l: number, r: number, t: number, b: number }|null} hero
 */
export function placeFloatLabel(x, y, box, view, hero) {
  const fit = (px, py) => {
    const minX = view.left + box.left;
    const maxX = view.right - box.right;
    const minY = view.top + box.up;
    const maxY = view.bottom - box.down;
    const cx = minX > maxX ? (view.left + view.right) / 2 : Math.min(maxX, Math.max(minX, px));
    const cy = minY > maxY ? (view.top + view.bottom) / 2 : Math.min(maxY, Math.max(minY, py));
    return { x: cx, y: cy };
  };
  const hits = (placed) => {
    if (!hero) return false;
    const label = {
      l: placed.x - box.left,
      r: placed.x + box.right,
      t: placed.y - box.up,
      b: placed.y + box.down,
    };
    return !(label.r <= hero.l || label.l >= hero.r || label.b <= hero.t || label.t >= hero.b);
  };
  const placed = fit(x, y);
  if (!hits(placed)) return placed;
  const above = fit(placed.x, hero.t - layoutPx(2));
  if (!hits(above)) return above;
  const left = fit(hero.l - box.right - layoutPx(2), above.y);
  if (!hits(left)) return left;
  return above;
}

/**
 * First-summon point, just behind the player. Resummon walks here when
 * nothing is on the field.
 * @param {{ x?: number, y?: number }|null|undefined} player
 * @param {number|null} [viewRight] camera right edge in world px
 */
function deployPoint(player, viewRight = null) {
  const px = Number.isFinite(player?.x) ? player.x : 0;
  const py = Number.isFinite(player?.y) ? player.y : 0;
  const y = clampGrass(py);
  // Hero frame is 92px, origin x 0.5 (46px half). Baby pet frame is 48px
  // (24px half). The gun points left, so the pet stands behind (+X).
  // 0.72 of the combined halves clears most of the arm where the lane has
  // room. The slanted barricade puts a bottom-lane hero on the camera's
  // right edge, so the offset never pushes the pet further off screen
  // than the previous 18 field px tuck. GO! / Back! keep their clamp.
  const display = scaleFromY(y) * LAYOUT_SCALE;
  const petHalf = 24 * display;
  const desired = Math.round((46 + 24) * display * 0.72);
  const floor = layoutPx(18);
  let behind = desired;
  if (Number.isFinite(viewRight)) {
    const maxFit = viewRight - layoutPx(6) - petHalf - px;
    // No room behind the hero: keep the old tuck instead of stepping
    // left onto the gun or further off the right edge.
    behind = maxFit < floor ? floor : Math.min(desired, maxFit);
  }
  return { x: px + Math.round(behind), y };
}

/** @param {Phaser.Scene|null|undefined} scene */
function cameraRight(scene) {
  const cam = scene?.cameras?.main;
  if (!cam || !(cam.width > 0)) return null;
  const scrollX = Number.isFinite(cam.scrollX) ? cam.scrollX : 0;
  return scrollX + cam.width;
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
function strikeAll(scene, zombies, damage, color, opts) {
  let gold = 0;
  let kills = 0;
  for (const z of zombies) {
    const gain = strike(scene, z, damage, color, opts);
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
function strike(scene, zombie, damage, color, opts = {}) {
  if (!zombie?.alive || !zombie.body) return { gold: 0, kills: 0, killed: false };
  const pets = GAME_CONFIG.PETS;
  let amount = Number(damage);
  if (!(amount > 0) || !Number.isFinite(amount)) return { gold: 0, kills: 0, killed: false };
  if (opts.scale > 0 && opts.scale !== 1) amount *= opts.scale;
  if (opts.finisher && zombie.maxHp > 0 && zombie.hp / zombie.maxHp <= pets.T2_FINISHER_HP) {
    amount *= pets.T2_FINISHER_MULT;
  }
  if (opts.ult) amount *= pets.T3_ULT_MULT;
  amount = Math.max(1, Math.round(amount));
  if (opts.knockback !== false && typeof zombie.beginPetSlide === 'function') {
    const px = layoutPx(pets.KNOCKBACK_PX);
    zombie.beginPetSlide(px, pets.KNOCKBACK_MS);
    scene?.audio?.playPetKnockback?.();
  }
  if (opts.hitstop !== false) beginHitstop(scene, pets.HITSTOP_HIT_MS);
  const hx = zombie.x;
  const hy = Number.isFinite(zombie.visualTop) ? zombie.visualTop : chestY(zombie);
  const goldVal = zombie.goldValue || 0;
  // Existing display crit. The roll does not change `amount`.
  // v0.36.25 passes it so a killing crit can play die-critical-hit.
  const chance = Number.isFinite(opts.critChance) ? opts.critChance : (scene?._zdCrit ?? 0.15);
  const crit = chance > 0 && Math.random() < chance;
  const killed = zombie.takeDamage(amount, { kind: 'pet', crit });
  if (amount > 0) scene?.audio?.playHitImpact?.();
  showDamageText(scene, hx, hy, amount, color, zombie.id);
  if (crit) showCritText(scene, hx, hy - layoutPx(12));
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
 * @param {{ restart?: boolean }} [opts]
 * `restart: false` leaves a strip that is already showing this key alone,
 * so a later bite frame cannot snap it back to frame 0.
 */
function playOnce(sprite, key, opts = {}) {
  if (!sprite || !key || typeof sprite.play !== 'function') return false;
  if (!sprite.scene?.anims?.exists?.(key)) return false;
  // Already on this strip: play() would snap back to frame 0.
  if (opts.restart === false && sprite.anims?.currentAnim?.key === key) return true;
  try {
    sprite.play(key);
  } catch (_) {
    return false;
  }
  faceLeft(sprite);
  return true;
}

/**
 * Solid fill. setTint() (multiply) is never used here — it darkens a
 * blue phoenix instead of painting red. tintFill is set again because
 * setTint inside setTintFill clears it first.
 * @param {Phaser.GameObjects.GameObject} sprite
 * @param {number} color
 */
function paintSolid(sprite, color) {
  if (typeof sprite.setTintFill === 'function') {
    sprite.setTintFill(color);
    sprite.tintFill = true;
    return;
  }
  if (typeof sprite.setFillStyle === 'function') sprite.setFillStyle(color);
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
 * @property {Phaser.GameObjects.Sprite|null} sprite
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
