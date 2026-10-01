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
 * waves.js and economy.js.
 */
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
      /** Field px shove on a direct hit. Lane Y is unchanged. */
      KNOCKBACK: 10,
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
      /** Field px per pellet, slightly under the handgun shove. */
      PELLET_KNOCKBACK: 8,
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
  },
};
