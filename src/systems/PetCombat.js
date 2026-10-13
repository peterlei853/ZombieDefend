import { GAME_CONFIG } from '../data/GameConfig.js';
import { DAMAGE_COLORS, showDamageText } from '../ui/damageText.js';
import { PET_ELEMENT_TINT, PET_LINEUP } from '../assets/petLineup.js';
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

/**
 * Summoned baby pets. Off the field until the bar is tapped.
 * Tap again to recall: the pet leaves, sits behind the barricade, and
 * regens. There is no deploy cooldown and no on-field time limit.
 * Death (HP ≤ 0) greys the bar for REVIVE_CD_MS.
 * While out, the pet walks to the nearest fence threat. Each unlocked orb
 * fills, flashes, then auto-casts. The body stays the baby skin.
 * Orb 1 plays the baby cast. Orbs 2 and 3 play the young and ancient cast
 * strips plus their library FX, and stay locked until something unlocks them.
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
    /** @type {{ id: string, orb: number }[]} */
    this.castLog = [];
    /** @type {string[]} */
    this.fxLog = [];
    /** @type {number|null} overrides GAME_CONFIG.PETS.UNLOCKED_ORBS when set */
    this._unlockedOrbs = null;
  }

  /**
   * Evolution hook. 1 is form 1 only. Raising this unlocks orb casts.
   * It does not swap the pet's idle / move / hurt skin.
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
        continue;
      }
      if (actor.phase === 'ready') {
        this._tickRegen(actor, dt);
        continue;
      }
      if (actor.phase !== 'field') continue;
      const gain = this._tickField(actor, dt, list, threat, player);
      gold += gain.gold;
      kills += gain.kills;
      if (actor.phase !== 'field') continue;
      this._tickOrbs(actor, dt);
      if (!(actor.hp > 0)) this._dismiss(actor);
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
    return { gold, kills };
  }

  destroy() {
    for (const bolt of this._bolts) destroySprite(bolt?.sprite);
    this._bolts = [];
    for (const charge of this._charges) destroySprite(charge?.node);
    this._charges = [];
    for (const zone of this._zones) destroySprite(zone?.node);
    this._zones = [];
    for (const actor of this._actors) {
      this._destroyBars(actor);
      destroySprite(actor.sprite);
      actor.sprite = null;
      actor.phase = 'ready';
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
      /** Cast strip for the swing in progress. Baby idle resumes after it. */
      attackSkill: '',
      hurtLeft: 0,
      popLeft: 0,
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
    const px = Number.isFinite(player?.x) ? player.x : 0;
    const py = Number.isFinite(player?.y) ? player.y : 0;
    const x = px + layoutPx(18);
    const y = clampGrass(py);
    actor.phase = 'field';
    if (!(actor.hp > 0)) actor.hp = actor.maxHp;
    actor.state = 'idle';
    actor.attackElapsed = 0;
    actor.released = false;
    actor.attackSkill = '';
    actor.hurtLeft = 0;
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
  }

  /**
   * Leave the field at the current HP and regen behind the barricade.
   * A flash that had not released yet resumes the next time the pet is out.
   * @param {PetActor} actor
   */
  _recall(actor) {
    if (actor.phase !== 'field') return;
    const sprite = actor.sprite;
    actor.sprite = null;
    actor.phase = 'ready';
    actor.state = 'idle';
    actor.castQueue = [];
    actor.latched = false;
    actor.latchId = null;
    actor.hurtLeft = 0;
    for (const orb of actor.orbs) {
      if (!orb.pending) continue;
      orb.pending = false;
      orb.left = 0;
      orb.flashLeft = GAME_CONFIG.PETS.ORB_FLASH_MS;
    }
    this._destroyBars(actor);
    this._fadeOut(sprite);
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
      this._flash(sprite);
      if (actor.state !== 'attack') {
        actor.hurtLeft = GAME_CONFIG.PETS.HURT_MS;
        playOnce(sprite, actor.role.hurt);
      }
    }
    if (actor.hp <= 0) {
      actor.hp = 0;
      this._dismiss(actor);
      return true;
    }
    this._syncBars(actor);
    return false;
  }

  /** @param {Phaser.GameObjects.Sprite} sprite */
  _flash(sprite) {
    if (!sprite || typeof sprite.setTintFill !== 'function') return;
    sprite.setTintFill(0xffffff);
    this.scene?.time?.delayedCall?.(40, () => {
      if (sprite.active && typeof sprite.clearTint === 'function') sprite.clearTint();
    });
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
    actor.phase = 'revive';
    actor.reviveLeft = GAME_CONFIG.PETS.REVIVE_CD_MS;
    for (const orb of actor.orbs) {
      orb.pending = false;
      orb.flashLeft = 0;
      orb.left = orb.cdMs;
    }
    this._destroyBars(actor);
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
    if (actor.phase !== 'field') return;
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
    if (actor.popLeft > 0) actor.popLeft = Math.max(0, actor.popLeft - deltaMs);
    this._place(actor);

    if (actor.state === 'attack') {
      actor.attackElapsed += deltaMs;
      return this._advanceAttack(actor, zombies, threat);
    }

    if (actor.hurtLeft > 0) {
      actor.hurtLeft -= deltaMs;
      const hurt = actor.role.hurt;
      const playing = sprite.anims?.currentAnim?.key === hurt && sprite.anims?.isPlaying;
      if (!playing && !playOnce(sprite, hurt)) playLoop(sprite, actor.role.key);
      faceLeft(sprite);
      return EMPTY;
    }

    this._stepMove(actor, threat, player, deltaMs);
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
      actor.state = 'idle';
      playLoop(sprite, actor.role.key);
      faceLeft(sprite);
      return;
    }
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
    sprite.setDepth?.(depthFromY(y, -1));
    faceLeft(sprite);
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
    bg.x = sprite.x;
    bg.y = y;
    fg.x = sprite.x - w / 2;
    fg.y = y;
    if (typeof fg.setScale === 'function') fg.setScale(Math.max(0.02, ratio), 1);
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
   * Every orb plays its cast strip and releases on the hit frame.
   * Orb 1 is the baby strip. Orb 2 is young. Orb 3 is ancient.
   * Idle and move stay on the baby skin.
   * @param {PetActor} actor
   */
  _beginAttack(actor) {
    actor.state = 'attack';
    actor.released = false;
    actor.attackElapsed = 0;
    actor.hurtLeft = 0;
    faceLeft(actor.sprite);
    const orb = actor.castQueue[0] ?? 0;
    actor.attackSkill = skillKeyFor(actor.role, orb);
    playOnce(actor.sprite, actor.attackSkill);
  }

  /**
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {import('../entities/Zombie.js').Zombie|null} threat
   */
  _advanceAttack(actor, zombies, threat) {
    const sprite = actor.sprite;
    const skill = actor.attackSkill || actor.role.skill;
    const anims = sprite?.anims;
    const frame = anims?.currentFrame?.index ?? 0;
    const progress = typeof anims?.getProgress === 'function' ? anims.getProgress() : 0;
    const playingSkill = !!(anims?.isPlaying && anims.currentAnim?.key === skill);
    const due =
      frame >= GAME_CONFIG.PETS.RELEASE_FRAME ||
      (playingSkill && progress >= 0.34) ||
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
   * Phoenix rain over the lane in front of the pet. Bolts fall and burst.
   * The nova still chips and burns zombies inside the focus radius.
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {import('../entities/Zombie.js').Zombie|null} threat
   */
  _phoenixNova(actor, zombies, threat) {
    const cfg = GAME_CONFIG.PETS.FORM2.phoenix;
    const focus = focusPoint(actor, threat);
    const radius = cfg.radius * LAYOUT_SCALE;
    this._spawnRain(actor);
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
   * Falling rain bolts, 40–140 field px west of the pet, starting above the lane.
   * @param {PetActor} actor
   */
  _spawnRain(actor) {
    const sprite = actor.sprite;
    const ox = sprite?.x ?? actor.x;
    const oy = sprite?.y ?? actor.y;
    const scale = Math.abs(sprite?.scaleY || 1);
    const key = actor.role.rainBolt;
    const drops = [48, 92, 132];
    for (let i = 0; i < drops.length; i++) {
      const x = ox - layoutPx(drops[i]);
      const y = oy - layoutPx(64 + i * 12);
      this._markFx(key);
      const node = spawnProjectile(this.scene, x, y, key, scale);
      this._bolts.push({
        sprite: node,
        x,
        y,
        vx: -120 * LAYOUT_SCALE,
        vy: 360 * LAYOUT_SCALE,
        hitIds: new Set(),
        impact: actor.role.rainImpact,
        scale,
        kind: 'rain',
        groundY: oy,
      });
    }
  }

  /**
   * Blazing rebirth on the ground under the pet, plus the lane charge.
   * @param {PetActor} actor
   */
  _phoenixDive(actor) {
    const cfg = GAME_CONFIG.PETS.FORM3.phoenix;
    const sprite = actor.sprite;
    const x = sprite?.x ?? actor.x;
    const y = sprite?.y ?? actor.y;
    const scale = Math.abs(sprite?.scaleY || 1);
    this._playFx(x, y, actor.role.rebirth, scale);
    const length = cfg.length * LAYOUT_SCALE;
    const halfW = cfg.halfWidth * LAYOUT_SCALE;
    const speed = 480 * LAYOUT_SCALE;
    this._charges.push({
      node: null,
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
   * Bamboo sweep from the chest. One target in range is rooted.
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   */
  _pandaFreeze(actor, zombies) {
    const cfg = GAME_CONFIG.PETS.FORM2.panda;
    const sprite = actor.sprite;
    const scale = Math.abs(sprite?.scaleY || 1);
    const chest = framePoint(sprite, -4, -22);
    this._playFx(chest.x, chest.y, actor.role.sweep, scale);
    const range = cfg.range * LAYOUT_SCALE;
    const target = closestThreatWhere(
      zombies,
      (z) => Math.hypot((sprite?.x ?? actor.x) - z.x, (sprite?.y ?? actor.y) - z.y) <= range
    );
    if (!target) return EMPTY;
    const gain = strike(this.scene, target, cfg.damage, DAMAGE_COLORS.panda);
    if (!gain.killed && typeof target.applyRoot === 'function') target.applyRoot(cfg.rootMs);
    return gain;
  }

  /**
   * Chi blast on the ground under the panda. Slow and a light burn
   * on every zombie inside the focus radius.
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {import('../entities/Zombie.js').Zombie|null} threat
   */
  _pandaBlizzard(actor, zombies, threat) {
    const cfg = GAME_CONFIG.PETS.FORM3.panda;
    const sprite = actor.sprite;
    const scale = Math.abs(sprite?.scaleY || 1);
    const x = sprite?.x ?? actor.x;
    const y = sprite?.y ?? actor.y;
    this._playFx(x, y, actor.role.chi, scale);
    const focus = focusPoint(actor, threat);
    const radius = cfg.radius * LAYOUT_SCALE;
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
   * Roar wave from the mouth. Primary target plus jumps; damage steps down.
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   */
  _lionChain(actor, zombies) {
    const cfg = GAME_CONFIG.PETS.FORM2.lion;
    const sprite = actor.sprite;
    const scale = Math.abs(sprite?.scaleY || 1);
    const from = framePoint(sprite, -4, -26);
    this._playFx(from.x, from.y, actor.role.roar, scale);
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
      const dmg = cfg.damages[Math.min(i, cfg.damages.length - 1)];
      const gain = strike(this.scene, z, dmg, DAMAGE_COLORS.lion);
      gold += gain.gold;
      kills += gain.kills;
    });
    return { gold, kills };
  }

  /**
   * Sunder strike on the ground under the lion. Damage plus a short root.
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   */
  _lionStomp(actor, zombies) {
    const cfg = GAME_CONFIG.PETS.FORM3.lion;
    const sprite = actor.sprite;
    const x = sprite?.x ?? actor.x;
    const y = sprite?.y ?? actor.y;
    const scale = Math.abs(sprite?.scaleY || 1);
    this._playFx(x, y, actor.role.sunder, scale);
    const radius = cfg.radius * LAYOUT_SCALE;
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
   * Fireball from the mouth toward the threat. The splash is the impact FX.
   * A tick zone keeps the form-2 damage on that point.
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie|null} threat
   */
  _dragonCloud(actor, threat) {
    const cfg = GAME_CONFIG.PETS.FORM2.dragon;
    const focus = focusPoint(actor, threat);
    const radius = cfg.radius * LAYOUT_SCALE;
    const sprite = actor.sprite;
    const scale = Math.abs(sprite?.scaleY || 1);
    const mouth = framePoint(sprite, GAME_CONFIG.PETS.DRAGON.MOUTH_X, GAME_CONFIG.PETS.DRAGON.MOUTH_Y);
    const speed = 320 * LAYOUT_SCALE;
    const limit = (GAME_CONFIG.PETS.DRAGON.HALF_ANGLE_DEG * Math.PI) / 180;
    const { vx, vy } = leftBoltVelocity(mouth.x, mouth.y, focus.x, focus.y, speed, limit);
    this._markFx(actor.role.fireball);
    const node = spawnProjectile(this.scene, mouth.x, mouth.y, actor.role.fireball, scale);
    if (node && typeof node.setRotation === 'function') {
      node.setRotation(aimRotation(vx, vy, 'west'));
    }
    this._bolts.push({
      sprite: node,
      x: mouth.x,
      y: mouth.y,
      vx,
      vy,
      hitIds: new Set(),
      impact: actor.role.fireballImpact,
      scale,
      kind: 'fireball',
      targetX: focus.x,
      targetY: focus.y,
    });
    this._zones.push({
      node: null,
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
   * Apocalypse flame from the mouth. Chip plus burn on nearby threats.
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   */
  _dragonRain(actor, zombies) {
    const cfg = GAME_CONFIG.PETS.FORM3.dragon;
    const sprite = actor.sprite;
    const scale = Math.abs(sprite?.scaleY || 1);
    const mouth = framePoint(sprite, GAME_CONFIG.PETS.DRAGON.MOUTH_X, GAME_CONFIG.PETS.DRAGON.MOUTH_Y);
    this._playFx(mouth.x, mouth.y, actor.role.apocalypse, scale);
    const x = sprite?.x ?? actor.x;
    const y = sprite?.y ?? actor.y;
    const range = cfg.range * LAYOUT_SCALE;
    const hits = threatsInShape(zombies, (z) => Math.hypot(z.x - x, z.y - y) <= range).slice(0, cfg.targets);
    let gold = 0;
    let kills = 0;
    for (const z of hits) {
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
   * @param {string|undefined} key
   * @param {number} scale
   */
  _playFx(x, y, key, scale) {
    this._markFx(key);
    playCastFx(this.scene, x, y, key, scale, y);
  }

  /** @param {string|undefined} key */
  _markFx(key) {
    if (key) this.fxLog.push(key);
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
      if (bolt.kind === 'rain') {
        if (this._landRain(bolt)) continue;
        if (boltOutOfPlay(bolt)) {
          destroySprite(bolt.sprite);
          continue;
        }
        keep.push(bolt);
        continue;
      }
      if (bolt.kind === 'fireball') {
        if (this._landFireball(bolt, zombies)) continue;
        if (boltOutOfPlay(bolt)) {
          this._playFx(bolt.x, bolt.y, bolt.impact, bolt.scale);
          destroySprite(bolt.sprite);
          continue;
        }
        keep.push(bolt);
        continue;
      }
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

  /**
   * Rain bolt bursts when it reaches the lane.
   * @param {PhoenixBolt} bolt
   */
  _landRain(bolt) {
    const ground = Number.isFinite(bolt.groundY) ? bolt.groundY : bolt.y;
    if (bolt.y < ground) return false;
    this._playFx(bolt.x, ground, bolt.impact, bolt.scale);
    destroySprite(bolt.sprite);
    return true;
  }

  /**
   * Fireball bursts on the first body it crosses, or when it reaches the aim point.
   * @param {PhoenixBolt} bolt
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   */
  _landFireball(bolt, zombies) {
    const list = Array.isArray(zombies) ? zombies : [];
    const hit = list.some((z) => z?.alive && z.body && boltOverlaps(z, bolt.x, bolt.y));
    const targetX = Number.isFinite(bolt.targetX) ? bolt.targetX : bolt.x - 1;
    if (!hit && bolt.x > targetX) return false;
    const y = hit ? bolt.y : (Number.isFinite(bolt.targetY) ? bolt.targetY : bolt.y);
    this._playFx(bolt.x, y, bolt.impact, bolt.scale);
    destroySprite(bolt.sprite);
    return true;
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
 * Orb 0 stays on the baby cast. Orb 1 is the young strip. Orb 2 is ancient.
 * @param {{ skill: string, skillYoung?: string, skillAncient?: string }} role
 * @param {number} orbIndex
 */
function skillKeyFor(role, orbIndex) {
  if (orbIndex === 1 && role.skillYoung) return role.skillYoung;
  if (orbIndex >= 2 && role.skillAncient) return role.skillAncient;
  return role.skill;
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
 * @property {'idle'|'move'|'attack'|'hurt'} state
 * @property {boolean} released
 * @property {string} attackSkill
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
 * @property {'spark'|'rain'|'fireball'|undefined} [kind]
 * @property {number} [groundY]
 * @property {number} [targetX]
 * @property {number} [targetY]
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
