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
 * Summoned baby pets. They are off the field until a portrait tap.
 * A summon pops the sprite out from behind the player, walks it toward
 * the nearest fence threat, and casts the v0.19 baby skill. Timeout
 * starts the skill cooldown. Death starts the revive cooldown.
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
  }

  /**
   * @param {number} index party order
   * @param {{ x?: number, y?: number }|null} player
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @returns {{ ok: boolean, reason: string, id?: string }}
   */
  summon(index, player, zombies) {
    const actor = this._actors[index];
    if (!actor) return { ok: false, reason: 'missing' };
    if (actor.phase === 'field') return { ok: false, reason: 'field' };
    if (actor.phase === 'revive') return { ok: false, reason: 'revive' };
    if (actor.phase === 'skill') return { ok: false, reason: 'cooling' };
    const threat = nearestBarricadeThreat(zombies);
    if (!threat) return { ok: false, reason: 'no-target' };
    this._deploy(actor, player);
    this.scene?.audio?.playPetSummon?.();
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
    return this._actors.map((actor) => {
      let bar = 1;
      if (actor.phase === 'skill' && actor.skillMax > 0) {
        bar = 1 - actor.skillLeft / actor.skillMax;
      } else if (actor.phase === 'revive' && actor.reviveMax > 0) {
        bar = 1 - actor.reviveLeft / actor.reviveMax;
      } else if (actor.phase === 'field' && actor.fieldMax > 0) {
        bar = actor.fieldLeft / actor.fieldMax;
      }
      return {
        id: actor.role.id,
        element: actor.role.element,
        elementZh: actor.role.elementZh,
        color: PET_ELEMENT_TINT[actor.role.element] ?? 0xffffff,
        phase: actor.phase,
        tappable: actor.phase === 'ready',
        dim: actor.phase === 'skill' || actor.phase === 'revive',
        grey: actor.phase === 'revive',
        badge: actor.phase === 'field' ? '出戰中' : '',
        bar: clamp01(bar),
        portraitKey: actor.role.portrait,
      };
    });
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
      if (actor.phase === 'skill') {
        this._tickSkill(actor, dt);
        continue;
      }
      if (actor.phase === 'revive') {
        this._tickRevive(actor, dt);
        continue;
      }
      if (actor.phase !== 'field') continue;
      const gain = this._tickField(actor, dt, list, threat, player);
      gold += gain.gold;
      kills += gain.kills;
      if (actor.phase !== 'field') continue;
      actor.fieldLeft -= dt;
      if (!(actor.hp > 0)) this._dismiss(actor, 'death');
      else if (actor.fieldLeft <= 0) this._dismiss(actor, 'timeout');
    }
    this._stepBolts(dt / 1000);
    const bolts = this._resolveBolts(list);
    gold += bolts.gold;
    kills += bolts.kills;
    return { gold, kills };
  }

  destroy() {
    for (const bolt of this._bolts) destroySprite(bolt?.sprite);
    this._bolts = [];
    for (const actor of this._actors) {
      this._destroyBars(actor);
      destroySprite(actor.sprite);
      actor.sprite = null;
      actor.phase = 'ready';
      actor.hp = 0;
    }
  }

  /** @param {import('../assets/petLineup.js').PET_LINEUP[number]} role */
  _makeActor(role) {
    const timing = GAME_CONFIG.PETS.SUMMON[role.id];
    return {
      role,
      phase: 'ready',
      skillLeft: 0,
      skillMax: timing.skillCdMs,
      reviveLeft: 0,
      reviveMax: timing.reviveCdMs,
      fieldLeft: 0,
      fieldMax: timing.fieldMs,
      hp: 0,
      maxHp: GAME_CONFIG.PETS.HP,
      sprite: null,
      hpBg: null,
      hpFg: null,
      state: 'idle',
      attackCd: 0,
      released: false,
      attackElapsed: 0,
      hurtLeft: 0,
      popLeft: 0,
      latched: false,
      latchId: null,
      destX: 0,
      destY: 0,
      x: 0,
      y: 0,
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
    const pets = GAME_CONFIG.PETS;
    actor.phase = 'field';
    actor.hp = actor.maxHp;
    actor.fieldLeft = actor.fieldMax;
    actor.skillLeft = 0;
    actor.reviveLeft = 0;
    actor.state = 'idle';
    actor.attackCd = pets.SUMMON_WINDUP_MS;
    actor.attackElapsed = 0;
    actor.released = false;
    actor.hurtLeft = 0;
    actor.latched = false;
    actor.latchId = null;
    actor.destX = x;
    actor.destY = y;
    actor.x = x;
    actor.y = y;
    actor.popLeft = pets.POP_MS;
    actor.sprite = this._spawnSprite(actor, x, y);
    this._attachBars(actor);
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
      this._dismiss(actor, 'death');
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

  /**
   * @param {PetActor} actor
   * @param {'death'|'timeout'} mode
   */
  _dismiss(actor, mode) {
    if (actor.phase !== 'field') return;
    const sprite = actor.sprite;
    actor.sprite = null;
    actor.hp = 0;
    actor.latched = false;
    actor.latchId = null;
    actor.state = 'idle';
    actor.hurtLeft = 0;
    this._destroyBars(actor);
    if (mode === 'death') {
      actor.phase = 'revive';
      actor.reviveLeft = actor.reviveMax;
      actor.skillLeft = 0;
      actor.fieldLeft = 0;
      this.scene?.audio?.playPetDeath?.();
    } else {
      actor.phase = 'skill';
      actor.skillLeft = actor.skillMax;
      actor.reviveLeft = 0;
      actor.fieldLeft = 0;
    }
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
  _tickSkill(actor, dt) {
    actor.skillLeft = Math.max(0, actor.skillLeft - dt);
    if (actor.skillLeft <= 0) {
      actor.skillLeft = 0;
      actor.phase = 'ready';
    }
  }

  /** @param {PetActor} actor @param {number} dt */
  _tickRevive(actor, dt) {
    actor.reviveLeft = Math.max(0, actor.reviveLeft - dt);
    if (actor.reviveLeft <= 0) {
      actor.reviveLeft = 0;
      actor.phase = 'ready';
      this.scene?.audio?.playPetReviveReady?.();
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
    if (actor.attackCd > 0) actor.attackCd -= deltaMs;
    if (actor.attackCd > 0 || !threat) return EMPTY;
    if (!this._inCastRange(actor, threat)) return EMPTY;
    this._beginAttack(actor);
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

  /**
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie} threat
   */
  _inCastRange(actor, threat) {
    const sprite = actor.sprite;
    if (!sprite || !threat) return false;
    const id = actor.role.id;
    const pets = GAME_CONFIG.PETS;
    if (id === 'panda') {
      return inForwardBox(
        sprite.x,
        sprite.y,
        threat.x,
        threat.y,
        pets.PANDA.RANGE * LAYOUT_SCALE,
        pets.PANDA.Y_HALF * LAYOUT_SCALE
      );
    }
    if (id === 'lion') {
      const from = framePoint(sprite, pets.LION.FORWARD_X, pets.LION.FORWARD_Y);
      const half = (pets.LION.HALF_ANGLE_DEG * Math.PI) / 180;
      return inLeftCone(
        from.x,
        from.y,
        threat.x,
        chestY(threat),
        pets.LION.RANGE * LAYOUT_SCALE,
        half
      );
    }
    if (id === 'dragon') {
      const mouth = framePoint(sprite, pets.DRAGON.MOUTH_X, pets.DRAGON.MOUTH_Y);
      const half = (pets.DRAGON.HALF_ANGLE_DEG * Math.PI) / 180;
      return inLeftCone(
        mouth.x,
        mouth.y,
        threat.x,
        chestY(threat),
        pets.DRAGON.RANGE * LAYOUT_SCALE,
        half
      );
    }
    return inForwardBox(sprite.x, sprite.y, threat.x, threat.y, layoutPx(260), layoutPx(52));
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
   * Skill strip starts this frame. The hit waits for RELEASE_FRAME
   * (or the next tick, if that strip is not loaded).
   * @param {PetActor} actor
   */
  _beginAttack(actor) {
    actor.state = 'attack';
    actor.released = false;
    actor.attackElapsed = 0;
    actor.hurtLeft = 0;
    faceLeft(actor.sprite);
    playOnce(actor.sprite, actor.role.skill);
  }

  /**
   * @param {PetActor} actor
   * @param {import('../entities/Zombie.js').Zombie[]} zombies
   * @param {import('../entities/Zombie.js').Zombie|null} threat
   */
  _advanceAttack(actor, zombies, threat) {
    const sprite = actor.sprite;
    const skill = actor.role.skill;
    const anims = sprite.anims;
    const frame = anims?.currentFrame?.index ?? 0;
    const progress = typeof anims?.getProgress === 'function' ? anims.getProgress() : 0;
    const playing = !!(anims?.isPlaying && anims.currentAnim?.key === skill);
    const due =
      frame >= GAME_CONFIG.PETS.RELEASE_FRAME ||
      (playing && progress >= 0.34) ||
      !playing ||
      actor.attackElapsed >= GAME_CONFIG.PETS.ATTACK_MAX_MS;
    let gold = 0;
    let kills = 0;
    if (!actor.released && due) {
      actor.released = true;
      const gain = this._cast(actor, zombies, threat);
      gold += gain.gold;
      kills += gain.kills;
    }
    if (!playing || actor.attackElapsed >= GAME_CONFIG.PETS.ATTACK_MAX_MS) {
      this._enterIdle(actor);
    }
    faceLeft(sprite);
    this._place(actor);
    return { gold, kills };
  }

  /** @param {PetActor} actor */
  _enterIdle(actor) {
    const pets = GAME_CONFIG.PETS;
    const period = rollInt(pets.COOLDOWN_MIN_MS, pets.COOLDOWN_MAX_MS);
    const leftover = period - actor.attackElapsed;
    actor.state = 'idle';
    actor.released = false;
    actor.attackElapsed = 0;
    actor.attackCd = Math.max(0, leftover);
    faceLeft(actor.sprite);
    playLoop(actor.sprite, actor.role.key);
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
  const s = Math.abs(sprite.scaleY || sprite.scaleX || 1);
  return { x: sprite.x + frameX * s, y: sprite.y + frameY * s };
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

function rollInt(min, max) {
  const lo = Math.ceil(Math.min(min, max));
  const hi = Math.floor(Math.max(min, max));
  const math = globalThis.Phaser?.Math;
  if (math?.Between) return math.Between(lo, hi);
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

function wrapPi(rad) {
  return Math.atan2(Math.sin(rad), Math.cos(rad));
}

/**
 * @typedef {object} PetActor
 * @property {Phaser.GameObjects.Sprite|null} sprite
 * @property {import('../assets/petLineup.js').PET_LINEUP[number]} role
 * @property {'ready'|'field'|'skill'|'revive'} phase
 * @property {number} skillLeft
 * @property {number} skillMax
 * @property {number} reviveLeft
 * @property {number} reviveMax
 * @property {number} fieldLeft
 * @property {number} fieldMax
 * @property {number} hp
 * @property {number} maxHp
 * @property {'idle'|'move'|'attack'|'hurt'} state
 * @property {number} attackCd
 * @property {boolean} released
 * @property {number} attackElapsed
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
