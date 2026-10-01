/**
 * Central combat tunables for ZombieDefend.
 *
 * Lengths and speeds are field pixels from the 800-wide composition.
 * Callers multiply px and px/s by DepthView.LAYOUT_SCALE so the 1280 canvas
 * keeps the same timing. Fire rates and tween durations are milliseconds.
 * Shake intensity is Phaser's camera.shake magnitude.
 *
 * PLAYER.MOVE_SPEED stays 180 (a sketch of this object used 200).
 * SHOTGUN.PELLETS (18) is the midpoint of the live 16–20 roll, not a fixed count.
 * Shotgun recoil is the tighter cycle: 12 field px, 80ms out, 120ms back.
 *
 * Muzzle offsets are frame px from the defender's sole origin (not the
 * frame center). Defender multiplies them by the sprite display scale,
 * which already includes LAYOUT_SCALE, so the flash stays on the barrel
 * as lane scale changes. (−25, −10) / (−30, −8) describe that same point
 * measured from the frame center; the Y values below are the sole-relative
 * equivalents so bullets do not leave from the boots.
 *
 * Wave tables, gold-by-HP, barricade max HP, and stage duration stay in
 * waves.js and economy.js. Zombie variant labels do not scale those HP
 * or speed numbers. Walker rows keep the default feel.
 *
 * Hit shove, flash, hitlag, shake, and the critical-HP ratio live in JUICE.
 * WEAPONS knockback mirrors those two shove values so older readers stay put.
 */
const KNOCKBACK_HANDGUN_PX = 10;
const KNOCKBACK_SHOTGUN_PX = 8;

export const GAME_CONFIG = {
  PLAYER: {
    /** Field px/s along the lane. Defender multiplies by LAYOUT_SCALE. */
    MOVE_SPEED: 180,
    /** Field px. Defender multiplies by LAYOUT_SCALE. Kick is +X (away from the left muzzle). */
    SHOTGUN_RECOIL_PX: 12,
    /** Quad.easeOut kick away from the muzzle. */
    SHOTGUN_RECOIL_MS: 80,
    /** Quad.easeOut return onto the barricade lane anchor. */
    SHOTGUN_RECOIL_RETURN_MS: 120,
    /**
     * After a shotgun volley the defender cannot lane-move.
     * Longer than the 80+120ms kick so the body settles before W/S work again.
     */
    SHOTGUN_MOVE_LOCK_MS: 300,
  },
  VFX: {
    /** Yellow-white muzzle flash lifetime. */
    MUZZLE_FLASH_MS: 50,
  },
  WEAPONS: {
    HANDGUN: {
      /** Auto-fire interval. Movement does not cancel this. */
      FIRE_RATE: 500,
      /** waves.js re-exports this as PLAYER_BULLET_DAMAGE. */
      DAMAGE: 30,
      /** Field px shove on a direct hit. Live copy is JUICE.KNOCKBACK_HANDGUN. */
      KNOCKBACK: KNOCKBACK_HANDGUN_PX,
      /**
       * Muzzle from the sole, left-facing. X matches the barrel tip
       * (~25px left of center). Y lifts from the sole onto that barrel.
       */
      MUZZLE_OFFSET_X: -25,
      MUZZLE_OFFSET_Y: -35,
      /** Elongated slug, field px. WeaponSystem multiplies by LAYOUT_SCALE. */
      BULLET_W: 8,
      BULLET_H: 3,
    },
    SHOTGUN: {
      /** Auto-fire interval. Only runs while the defender is fully stopped. */
      FIRE_RATE: 2000,
      /**
       * Midpoint of the live volley. WeaponSystem rolls PELLETS_MIN–PELLETS_MAX
       * (inclusive). This key is the fallback count only when that range is absent.
       */
      PELLETS: 18,
      PELLETS_MIN: 16,
      PELLETS_MAX: 20,
      /** Full fan in degrees, centered on straight left (180°). */
      SPREAD_ANGLE: 70,
      /** Fraction of the handgun's full-screen reference range (viewport width). */
      RANGE_RATIO: 0.25,
      PELLET_DAMAGE: 10,
      /** Field px per pellet. Live copy is JUICE.KNOCKBACK_SHOTGUN. */
      PELLET_KNOCKBACK: KNOCKBACK_SHOTGUN_PX,
      /** Muzzle-fan graphic lifetime. The shared yellow-white flash is VFX.MUZZLE_FLASH_MS. */
      MUZZLE_VFX_MS: 150,
      /**
       * Muzzle from the sole, left-facing. X is the example −30.
       * Y lifts from the sole to chest height (the −8 example is from frame center).
       */
      MUZZLE_OFFSET_X: -30,
      MUZZLE_OFFSET_Y: -34,
      /** Shell casing, field px/s. +X is back/right, −Y is up. WeaponSystem scales by LAYOUT_SCALE. */
      CASING_VEL_X: 40,
      CASING_VEL_Y: -80,
      /** Field px/s² downward so the casing arcs and drops. */
      CASING_GRAVITY: 200,
      CASING_LIFE_MS: 560,
      /** Field px. Spawn is a nudge back from the muzzle (ejection port). */
      CASING_W: 4,
      CASING_H: 2,
      CASING_OFFSET_X: 6,
      CASING_OFFSET_Y: -4,
    },
  },
  JUICE: {
    /** camera.shake intensity, once per shotgun volley. */
    SCREEN_SHAKE_SHOTGUN: 0.015,
    /** camera.shake duration. */
    SCREEN_SHAKE_SHOTGUN_MS: 150,
    /** Field px the floating `-N` rises. damageText multiplies by LAYOUT_SCALE. */
    DAMAGE_TEXT_FLOAT_PX: 30,
    /** Fade duration for that float. */
    DAMAGE_TEXT_DURATION_MS: 600,

    /**
     * Field-px shove on a bullet hit. Both sit in the 5–15 band.
     * WeaponSystem reads these. Tanks scale them by ZOMBIE_TYPES.tank.knockbackMult.
     */
    KNOCKBACK_HANDGUN: KNOCKBACK_HANDGUN_PX,
    KNOCKBACK_SHOTGUN: KNOCKBACK_SHOTGUN_PX,
    /**
     * Pure-white hit flash on any bullet or pellet.
     * Sprites use tint fill; rectangle placeholders swap fill.
     */
    HIT_FLASH_MS: 50,
    HIT_FLASH_COLOR: 0xffffff,

    /** Field px lean into the barricade (+X) on each bite, then back. */
    BARRICADE_LUNGE_PX: 10,
    /** Outward half of the yoyo. Return takes the same time. */
    BARRICADE_LUNGE_MS: 100,

    /** Stumble / slow when remaining HP is at or below this fraction of max. */
    CRIT_HP_RATIO: 0.3,
    /**
     * Move-speed multiplier while critical. Applied even when a stumble
     * strip is playing, so a missing sheet still reads as wounded.
     */
    CRIT_SPEED_MULT: 0.5,

    /** Normal death toss. −X is further left, away from the right-hand barricade. */
    DEATH_ARC_X: 36,
    /** Peak height of the arc (field px up). */
    DEATH_ARC_Y: 22,
    /** Extra drop by the end of the arc so the body settles, still left of the hit. */
    DEATH_DROP_Y: 8,
    DEATH_SPIN_DEG: 220,
    DEATH_MS: 480,
    BLOOD_COUNT: 10,
    /** Field px upward travel for a blood speck. */
    BLOOD_UP_PX: 28,
    BLOOD_MS: 400,

    /**
     * Killing blow is overkill when it came from a shotgun pellet, or when
     * the hit's damage is at least this (handgun is 30, so a pistol kill stays
     * a normal death).
     */
    OVERKILL_DAMAGE: 40,
    /** Real-time hitch. StageScene scales its delta; tweens and anims dip too. */
    HITLAG_MS: 30,
    HITLAG_SCALE: 0.05,
    FRAGMENT_MIN: 4,
    FRAGMENT_MAX: 6,
    FRAGMENT_MS: 460,
    /** Stronger than SCREEN_SHAKE_SHOTGUN. */
    SCREEN_SHAKE_OVERKILL: 0.03,
    SCREEN_SHAKE_OVERKILL_MS: 200,
  },
};

/**
 * Zombie variant identity. HP, speed, and DPS stay on the wave archetype
 * (waves.js) so gold-by-HP and the stage economy do not move.
 * `knockbackMult` scales the existing handgun / pellet shove (1 = full).
 * Placeholder scale and color are used only until that variant's walk sheet loads.
 */
export const ZOMBIE_TYPES = {
  walker: {
    knockbackMult: 1,
    placeholderScale: 1,
    placeholderColor: 0xd32f2f,
    placeholderStroke: 0x7a1010,
  },
  runner: {
    knockbackMult: 1,
    placeholderScale: 0.82,
    placeholderColor: 0xff7043,
    placeholderStroke: 0xbf360c,
  },
  tank: {
    knockbackMult: 0.6,
    placeholderScale: 1.5,
    placeholderColor: 0x4e1414,
    placeholderStroke: 0x2a0a0a,
  },
};

/** @param {string|null|undefined} id */
export function zombieTypeDef(id) {
  return ZOMBIE_TYPES[id] || ZOMBIE_TYPES.walker;
}

/**
 * Walker / runner / tank from an explicit archetype label, otherwise from the
 * stage-1 HP and speed bands already in waves.js (swarm is fast and light,
 * the heavy slow row is the tank, everything else walks).
 * @param {{ variant?: string, type?: string, hp?: number, speed?: number }|null|undefined} arch
 * @returns {'walker'|'runner'|'tank'}
 */
export function resolveZombieVariant(arch) {
  const named = arch?.variant || arch?.type;
  if (named && ZOMBIE_TYPES[named]) return /** @type {'walker'|'runner'|'tank'} */ (named);
  const hp = Number(arch?.hp) || 0;
  const speed = Number(arch?.speed) || 0;
  if (hp >= 150 || speed <= 34) return 'tank';
  if (speed >= 48 && hp <= 70) return 'runner';
  return 'walker';
}

/**
 * @param {number} hp
 * @param {number} maxHp
 */
export function isCriticalHp(hp, maxHp) {
  return maxHp > 0 && hp > 0 && hp / maxHp <= GAME_CONFIG.JUICE.CRIT_HP_RATIO;
}

/**
 * @param {number} speed
 * @param {number} hp
 * @param {number} maxHp
 */
export function woundedMoveSpeed(speed, hp, maxHp) {
  if (!isCriticalHp(hp, maxHp)) return speed;
  return speed * GAME_CONFIG.JUICE.CRIT_SPEED_MULT;
}

/**
 * Shotgun pellets always gib. Any other killing blow gibs only at or above
 * JUICE.OVERKILL_DAMAGE.
 * @param {string|null|undefined} kind
 * @param {number} damage
 */
export function isOverkillHit(kind, damage) {
  if (kind === 'shotgun') return true;
  const amount = Number(damage);
  return Number.isFinite(amount) && amount >= GAME_CONFIG.JUICE.OVERKILL_DAMAGE;
}
