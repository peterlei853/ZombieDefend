import { depthFromY, layoutPx } from './DepthView.js';
import { libraryAsset } from '../assets/libraryAssets.js';

/** Field px. Home to the nearest on-field pet inside this radius. */
export const MAGNET_R = 96;
/** Field px. Pickup hands the orb's EXP to that pet. */
export const PICKUP_R = 28;
/** PIXELLAB_HOOK: assets/library/fx/v026/exp-orb/exp-orb.png */
export const ORB_KEY = 'exp-orb';

/**
 * EXP from a zombie's initial max HP. Separate from getGoldByHP.
 * Architect default: floor(maxHp/20), minimum 1.
 * @param {number} maxHp
 */
export function expFromZombieHp(maxHp) {
  const hp = Number(maxHp);
  if (!Number.isFinite(hp) || hp <= 0) return 1;
  return Math.max(1, Math.floor(hp / 20));
}

/**
 * Cyan EXP gems. Magnet to the nearest on-field pet inside MAGNET_R,
 * otherwise idle (a small bob). Pickup calls PetEvolve.addExp.
 */
export class ExpOrbManager {
  /**
   * @param {Phaser.Scene} scene
   * @param {import('./PetEvolve.js').PetEvolve|null} [evolve]
   */
  constructor(scene, evolve = null) {
    this.scene = scene;
    this.evolve = evolve;
    /** @type {ExpOrb[]} */
    this._orbs = [];
    this._bob = 0;
  }

  /**
   * @param {import('./PetEvolve.js').PetEvolve|null} evolve
   */
  setEvolve(evolve) {
    this.evolve = evolve;
  }

  /**
   * Death hook. Budget lives on PetEvolve; gold is not touched.
   * @param {{ x?: number, y?: number, maxHp?: number }} zombie
   */
  onZombieDeath(zombie) {
    if (!zombie) return null;
    const raw = expFromZombieHp(zombie.maxHp);
    const amount = this.evolve?.requestDrop ? this.evolve.requestDrop(raw) : raw;
    if (!(amount > 0)) return null;
    return this.spawn(zombie.x, zombie.y, amount);
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} amount
   */
  spawn(x, y, amount) {
    const n = Math.max(0, Math.floor(Number(amount) || 0));
    if (!(n > 0) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
    const scene = this.scene;
    const node = this._makeNode(x, y);
    /** @type {ExpOrb} */
    const orb = { node, x, y, homeY: y, amount: n, vx: 0, vy: 0 };
    this._orbs.push(orb);
    scene?.audio?.playExpOrbDrop?.();
    return orb;
  }

  /**
   * @param {number} dt ms
   * @param {Array<{ id?: string, x: number, y: number, alive?: boolean, hp?: number, onField?: boolean }>|null} fieldPets
   */
  update(dt, fieldPets) {
    const step = Number.isFinite(dt) ? dt : 0;
    this._bob += step;
    const magnetR = layoutPx(MAGNET_R);
    const pickupR = layoutPx(PICKUP_R);
    const speed = layoutPx(110) * (step / 1000);
    const pets = (Array.isArray(fieldPets) ? fieldPets : []).filter(isFieldPet);
    /** @type {ExpOrb[]} */
    const keep = [];
    for (const orb of this._orbs) {
      if (orb.node && orb.node.active === false) continue;
      const pet = nearestPet(orb, pets, magnetR);
      if (pet) {
        const dx = pet.x - orb.x;
        const dy = pet.y - orb.y;
        const dist = Math.hypot(dx, dy);
        if (dist <= pickupR) {
          this._pickup(orb, pet);
          continue;
        }
        const span = Math.max(dist, 0.001);
        const move = Math.min(speed, dist);
        orb.x += (dx / span) * move;
        orb.y += (dy / span) * move;
      } else {
        const bob = Math.sin(this._bob / 280 + orb.homeY) * layoutPx(2);
        orb.y = orb.homeY + bob;
      }
      if (orb.node) {
        orb.node.x = orb.x;
        orb.node.y = orb.y;
        orb.node.setDepth?.(depthFromY(orb.y, 6));
      }
      keep.push(orb);
    }
    this._orbs = keep;
  }

  clearAll() {
    for (const orb of this._orbs) destroyNode(orb.node);
    this._orbs = [];
  }

  /**
   * @param {ExpOrb} orb
   * @param {{ id?: string }} pet
   */
  _pickup(orb, pet) {
    destroyNode(orb.node);
    orb.node = null;
    if (pet?.id) this.evolve?.addExp?.(pet.id, orb.amount);
    this.scene?.audio?.playExpOrbPickup?.();
  }

  /**
   * @param {number} x
   * @param {number} y
   */
  _makeNode(x, y) {
    const scene = this.scene;
    if (!scene?.add) return null;
    // PIXELLAB_HOOK: exp-orb — 32×32 cyan gem, origin (0.5, 0.5)
    if (scene.textures?.exists?.(ORB_KEY) && scene.add.sprite) {
      const sprite = scene.add.sprite(x, y, ORB_KEY);
      const origin = libraryAsset(scene, ORB_KEY)?.origin ?? [0.5, 0.5];
      sprite.setOrigin?.(origin[0], origin[1]);
      sprite.setDepth?.(depthFromY(y, 6));
      return sprite;
    }
    if (scene.add.rectangle) {
      const gem = scene.add.rectangle(x, y, layoutPx(10), layoutPx(10), 0x5ce1ff);
      gem.setDepth?.(depthFromY(y, 6));
      return gem;
    }
    return null;
  }
}

/**
 * @param {{ x?: number, y?: number, alive?: boolean, hp?: number, onField?: boolean }|null} pet
 */
function isFieldPet(pet) {
  if (!pet || pet.onField === false || pet.alive === false) return false;
  if (pet.hp != null && !(pet.hp > 0)) return false;
  return Number.isFinite(pet.x) && Number.isFinite(pet.y);
}

/**
 * @param {ExpOrb} orb
 * @param {Array<{ x: number, y: number }>} pets
 * @param {number} magnetR
 */
function nearestPet(orb, pets, magnetR) {
  let best = null;
  let bestD = magnetR;
  for (const pet of pets) {
    const dist = Math.hypot(pet.x - orb.x, pet.y - orb.y);
    if (dist <= bestD) {
      bestD = dist;
      best = pet;
    }
  }
  return best;
}

/** @param {Phaser.GameObjects.GameObject|null|undefined} node */
function destroyNode(node) {
  if (node && node.active !== false) node.destroy?.();
}

/**
 * @typedef {object} ExpOrb
 * @property {Phaser.GameObjects.GameObject|null} node
 * @property {number} x
 * @property {number} y
 * @property {number} homeY
 * @property {number} amount
 * @property {number} vx
 * @property {number} vy
 */
