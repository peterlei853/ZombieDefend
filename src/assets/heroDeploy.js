/**
 * Hero gun deploy (v0.27).
 *
 * The girl stays on the unarmed sheets. Owned guns are separate front-float
 * sprites. Moving hides them and blocks fire. A stop that lasts DEPLOY_HOLD_MS
 * plays `player-girl-deploy` once while the guns lerp into the front arc.
 * Fire starts only after that one-shot finishes. Bubble, lightning, frost,
 * and flame travel along the hero forward ray (west, vy = 0). Water fires
 * from a fence mount toward the nearest living enemy. Sling does the same
 * when it owns the fence (?weapon=sling); beside water it stays on the ray.
 *
 * Run sheets (`player-girl-run-*`) are preferred when present. They are not
 * in the library yet; walk sheets are the fallback.
 */

/** Stopped at least this long before the deploy one-shot starts. */
export const DEPLOY_HOLD_MS = 180;
/** `player-girl-deploy` is 8 frames at 12 fps, played once. */
export const DEPLOY_FPS = 12;
export const DEPLOY_FRAMES = 8;
export const DEPLOY_MS = (DEPLOY_FRAMES / DEPLOY_FPS) * 1000;

/** Shop / arc order. Stage 1 playtest grants this whole list. */
export const OWNED_WEAPON_ORDER = ['water', 'sling', 'bubble', 'lightning', 'frost', 'flame'];

export const HERO_UNARMED = {
  idle: 'player-girl-idle',
  deploy: 'player-girl-deploy',
  /**
   * West operator still while stopped behind a water mount.
   * One frame (92×92, same feet origin as idle). Unarmed — no held gun.
   * `command` is the backup when this texture is missing.
   */
  towerFire: 'player-girl-tower-fire',
  /**
   * Backup operator still. Same feet origin. Used only if tower-fire is absent.
   */
  command: 'player-girl-command',
  walk: {
    west: 'player-girl-walk-west',
    east: 'player-girl-walk-east',
    north: 'player-girl-walk-north',
    south: 'player-girl-walk-south',
  },
  run: {
    west: 'player-girl-run-west',
    east: 'player-girl-run-east',
    north: 'player-girl-run-north',
    south: 'player-girl-run-south',
  },
};

/**
 * Front arc, px from the girl origin. Negative X is west (in front).
 * Indexed by owned-count 1..6.
 */
export const FRONT_ARC = {
  1: [{ x: -36, y: -8 }],
  2: [
    { x: -36, y: -22 },
    { x: -34, y: 8 },
  ],
  3: [
    { x: -38, y: -30 },
    { x: -36, y: -8 },
    { x: -38, y: 16 },
  ],
  4: [
    { x: -40, y: -36 },
    { x: -36, y: -16 },
    { x: -36, y: 4 },
    { x: -40, y: 24 },
  ],
  5: [
    { x: -42, y: -40 },
    { x: -38, y: -22 },
    { x: -36, y: -6 },
    { x: -38, y: 10 },
    { x: -42, y: 28 },
  ],
  6: [
    { x: -44, y: -42 },
    { x: -38, y: -26 },
    { x: -36, y: -10 },
    { x: -36, y: 6 },
    { x: -38, y: 22 },
    { x: -44, y: 36 },
  ],
};

/** Optional back-stack Y offsets. MOVE hides guns; these are the lerp start. */
export const BACK_Y = {
  1: [0],
  2: [-10, 10],
  3: [-20, 0, 20],
  4: [-30, -10, 10, 30],
  5: [-40, -20, 0, 20, 40],
  6: [-50, -30, -10, 10, 30, 50],
};

/** Lerp start, tucked on the pack. Alpha is still 0 at t = 0. */
export const DEPLOY_START_X = 12;

/** West muzzle, fraction of the weapon frame width past center. */
export const MUZZLE_WEST_FRAC = 0.35;

/** Flame cone grows from 1/6 of the view to 2/3 while the hero stays deployed. */
export const FLAME_RANGE_START = 1 / 6;
export const FLAME_RANGE_MAX = 2 / 3;
export const FLAME_GROW_MS = 1100;

/**
 * Per-weapon flight and on-hit traits.
 * `speed` multiplies BULLET_SPEED. Sizes are the authored frame px (visualScale 1
 * times the depth taper, not an extra LAYOUT_SCALE).
 * Flame is a continuous cone, not a slug.
 */
export const WEAPON_TRAITS = {
  water: {
    id: 'water',
    label: 'Water',
    profile: 'handgun',
    fireMs: 680,
    speed: 0.5,
    damage: 18,
    splash: 10,
    splashRadius: 56,
    projectile: 'fx-water-proj',
    impact: 'fx-water-impact',
    ground: 'fx-water-wet',
    rotate: false,
    hitSize: 16,
    tint: 0x4fc3f7,
  },
  sling: {
    id: 'sling',
    label: 'Sling',
    profile: 'handgun',
    fireMs: 420,
    speed: 1,
    damage: 16,
    knockbackBodies: 2,
    projectile: 'fx-sling-pellet',
    impact: 'fx-sling-impact',
    streak: 'fx-sling-knockback',
    rotate: false,
    hitSize: 10,
    tint: 0x37474f,
  },
  bubble: {
    id: 'bubble',
    label: 'Bubble',
    profile: 'shotgun',
    fireMs: 900,
    speed: 0.35,
    damage: 12,
    childDamage: { m: 8, s: 5 },
    projectile: 'fx-bubble-proj-l',
    childProjectile: { l: 'fx-bubble-proj-m', m: 'fx-bubble-proj-s' },
    childTier: { l: 'm', m: 's' },
    impact: 'fx-bubble-pop',
    rotate: false,
    hitSize: 22,
    childHitSize: { m: 14, s: 8 },
    tier: 'l',
    tint: 0x81d4fa,
  },
  lightning: {
    id: 'lightning',
    label: 'Lightning',
    profile: 'handgun',
    fireMs: 340,
    speed: 2,
    damage: 14,
    chainDamage: [9, 6],
    chainJumps: 2,
    chainRange: 150,
    projectile: 'fx-lightning-bolt',
    impact: 'fx-lightning-impact',
    chainFx: 'fx-lightning-chain',
    rotate: true,
    hitSize: 12,
    tint: 0xffee58,
  },
  frost: {
    id: 'frost',
    label: 'Frost',
    profile: 'handgun',
    fireMs: 560,
    speed: 1,
    damage: 14,
    freezeMs: 900,
    projectile: 'fx-frost-pellet',
    impact: 'fx-frost-impact',
    status: 'fx-frost-freeze',
    rotate: true,
    hitSize: 12,
    tint: 0xe0f7fa,
  },
  flame: {
    id: 'flame',
    label: 'Flame',
    profile: 'shotgun',
    continuous: true,
    burn: 5,
    burnIntervalMs: 400,
    burnMs: 1100,
    chip: 4,
    tickMs: 200,
    cone: 'fx-flame-cone',
    coneShort: 'fx-flame-cone-short',
    burnFx: 'fx-flame-burn',
    tint: 0xff7043,
  },
};

/** @param {string} id */
export function frontKey(id) {
  return `player-girl-front-${id}`;
}

/** @param {string} id */
export function backKey(id) {
  return `player-girl-back-${id}`;
}

/**
 * @param {string[]|null|undefined} ids
 * @returns {string[]}
 */
export function orderWeapons(ids) {
  const have = new Set(Array.isArray(ids) ? ids : []);
  return OWNED_WEAPON_ORDER.filter((id) => have.has(id));
}

/**
 * Stage 1 playtest always deploys all six. Later stages keep the owned list
 * in shop order. Unknown ids are dropped.
 * @param {number} stage
 * @param {string[]|null|undefined} owned
 */
export function grantStageWeapons(stage, owned) {
  if (stage === 1) return OWNED_WEAPON_ORDER.slice();
  return orderWeapons(owned);
}

/**
 * Owned guns for this stage boot.
 * A valid `?weapon=` id replaces the stage-1 all-six grant for this call.
 * Unknown or missing demo ids leave the normal grant in place.
 * The caller keeps the result in memory. This does not write a save.
 * @param {number} stage
 * @param {string[]|null|undefined} owned
 * @param {string|null|undefined} demoId lowercase weapon id, or null
 * @returns {string[]}
 */
export function resolveOwnedWeapons(stage, owned, demoId) {
  if (typeof demoId === 'string' && OWNED_WEAPON_ORDER.includes(demoId)) {
    return [demoId];
  }
  return grantStageWeapons(stage, owned);
}

/**
 * @param {number} count
 * @returns {{ x: number, y: number }[]}
 */
export function frontArcFor(count) {
  const n = Math.min(6, Math.max(0, count | 0));
  if (n <= 0) return [];
  return FRONT_ARC[n].map((p) => ({ x: p.x, y: p.y }));
}

/** @param {number} t */
export function easeOutCubic(t) {
  const u = Math.min(1, Math.max(0, t));
  return 1 - (1 - u) ** 3;
}

/**
 * Weapon offset while deploying. `alpha` is linear in t (hidden at 0).
 * @param {number} index
 * @param {number} count
 * @param {number} t 0..1
 */
export function deployOffset(index, count, t) {
  const n = Math.min(6, Math.max(1, count | 0));
  const i = Math.min(n - 1, Math.max(0, index | 0));
  const start = { x: DEPLOY_START_X, y: BACK_Y[n][i] };
  const end = FRONT_ARC[n][i];
  const u = Math.min(1, Math.max(0, t));
  const e = easeOutCubic(u);
  return {
    x: start.x + (end.x - start.x) * e,
    y: start.y + (end.y - start.y) * e,
    alpha: u,
  };
}

/**
 * Unarmed locomotion. Run keys first (not shipped), then the walk sheet.
 * @param {number} dy
 * @param {number} dx
 * @returns {string[]}
 */
export function unarmedAnimKeys(dy, dx) {
  const idle = HERO_UNARMED.idle;
  if (dy < 0) return [HERO_UNARMED.run.north, HERO_UNARMED.walk.north, idle];
  if (dy > 0) return [HERO_UNARMED.run.south, HERO_UNARMED.walk.south, idle];
  if (dx < 0) return [HERO_UNARMED.run.west, HERO_UNARMED.walk.west, idle];
  if (dx > 0) return [HERO_UNARMED.run.east, HERO_UNARMED.walk.east, idle];
  return [idle];
}

/** @returns {{ phase: 'move', holdMs: number, deployMs: number, t: number, canFire: boolean }} */
export function createDeployMachine() {
  return { phase: 'move', holdMs: 0, deployMs: 0, t: 0, canFire: false };
}

/**
 * @param {{ phase: string, holdMs: number, deployMs: number }} state
 * @param {boolean} moving
 * @param {number} deltaMs
 */
export function stepDeploy(state, moving, deltaMs) {
  const dt = Math.max(0, Number(deltaMs) || 0);
  if (moving) {
    return { phase: 'move', holdMs: 0, deployMs: 0, t: 0, canFire: false };
  }
  const phase = state?.phase || 'move';
  if (phase === 'move' || phase === 'hold') {
    const holdMs = (phase === 'hold' ? state.holdMs : 0) + dt;
    if (holdMs < DEPLOY_HOLD_MS) {
      return { phase: 'hold', holdMs, deployMs: 0, t: 0, canFire: false };
    }
    return advanceDeploy(holdMs - DEPLOY_HOLD_MS, holdMs);
  }
  if (phase === 'deploy') {
    return advanceDeploy((state.deployMs || 0) + dt, state.holdMs || DEPLOY_HOLD_MS);
  }
  return {
    phase: 'fire',
    holdMs: state?.holdMs || DEPLOY_HOLD_MS,
    deployMs: DEPLOY_MS,
    t: 1,
    canFire: true,
  };
}

/**
 * Straight west. `speed` is px/s. vy is always 0 — no target aim.
 * @param {number} speed
 */
export function forwardVelocity(speed) {
  const s = Math.abs(Number(speed) || 0);
  return { vx: -s, vy: 0 };
}

/**
 * ±45° children of a parent velocity. Same speed.
 * @param {number} vx
 * @param {number} vy
 */
export function splitVelocities(vx, vy) {
  const ang = Math.atan2(vy, vx);
  const speed = Math.hypot(vx, vy);
  return [-45, 45].map((deg) => {
    const a = ang + (deg * Math.PI) / 180;
    return { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed };
  });
}

/**
 * @param {number} deployMs
 * @param {number} holdMs
 */
function advanceDeploy(deployMs, holdMs) {
  if (deployMs >= DEPLOY_MS) {
    return { phase: 'fire', holdMs, deployMs: DEPLOY_MS, t: 1, canFire: true };
  }
  const t = deployMs / DEPLOY_MS;
  return { phase: 'deploy', holdMs, deployMs, t, canFire: false };
}
