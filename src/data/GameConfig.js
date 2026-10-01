/**
 * Central combat tunables for ZombieDefend.
 *
 * Lengths and speeds are field pixels from the 800-wide composition.
 * Callers multiply px and px/s by DepthView.LAYOUT_SCALE so the 1280 canvas
 * keeps the same timing. Fire rates and tween durations are milliseconds.
 * Shake intensity is Phaser's camera.shake magnitude.
 *
 * Defaults match the behavior that was inlined before this file existed.
 * PLAYER.MOVE_SPEED stays 180 (a sketch of this object used 200).
 * SHOTGUN.PELLETS (18) is the midpoint of the live 16–20 roll, not a fixed count.
 *
 * Wave tables, gold-by-HP, barricade max HP, and stage duration stay in
 * waves.js and economy.js.
 */
export const GAME_CONFIG = {
  PLAYER: {
    /** Field px/s along the lane. Defender multiplies by LAYOUT_SCALE. */
    MOVE_SPEED: 180,
    /** Field px. Defender multiplies by LAYOUT_SCALE. */
    SHOTGUN_RECOIL_PX: 18,
    /** Quad.easeOut kick away from the muzzle. */
    SHOTGUN_RECOIL_MS: 100,
    /** Quad.easeOut return onto the barricade lane anchor. */
    SHOTGUN_RECOIL_RETURN_MS: 140,
  },
  WEAPONS: {
    HANDGUN: {
      /** Auto-fire interval. */
      FIRE_RATE: 500,
      /** waves.js re-exports this as PLAYER_BULLET_DAMAGE. */
      DAMAGE: 30,
      /** Field px shove on a direct hit. Lane Y is unchanged. */
      KNOCKBACK: 10,
    },
    SHOTGUN: {
      /** Auto-fire interval. */
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
      /** Muzzle-fan graphic lifetime. */
      MUZZLE_VFX_MS: 150,
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
