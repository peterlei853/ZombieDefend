import { BULLET_SIZE } from '../data/waves.js';
import {
  depthFromY,
  scaleFromY,
  grassYMin,
  grassYMax,
  barricadeXAtY,
} from '../systems/DepthView.js';
import { WeaponSystem } from '../systems/WeaponSystem.js';

/** Player sits this many px right of the grass edge (safe zone). */
const PLAYER_SAFE_OFFSET = 32;
/** Pet (turret) offset from player toward the safer side. */
const PET_OFFSET_X = 25;
const PET_OFFSET_Y = -15;
/** Lerp factor per ~16.67ms frame (delta-aware). */
const PET_LERP = 0.16;
/** Player vertical move speed (px/s). */
const PLAYER_MOVE_SPEED = 180;

/**
 * Player + pet behind the barricade.
 * Movement / follow stay here; targeting, fire cadence, ballistics, pet AOE
 * live in WeaponSystem.
 */
export class DefenderGroup {
  /**
   * @param {Phaser.Scene} scene
   * @param {{}} [opts]
   */
  constructor(scene, opts = {}) {
    this.scene = scene;
    this.bullets = [];
    this.weapons = new WeaponSystem(scene);

    const yMin = grassYMin();
    const yMax = grassYMax();
    const playerY = (yMin + yMax) / 2;
    const playerX = barricadeXAtY(playerY) + PLAYER_SAFE_OFFSET;
    const playerScale = scaleFromY(playerY);

    // PIXELLAB_HOOK: replace with sprite player
    this.player = scene.add.rectangle(playerX, playerY, 22, 28, 0x42a5f5);
    this.player.setStrokeStyle(2, 0x1e88e5);
    this.player.setScale(playerScale);
    this.player.setDepth(depthFromY(playerY));

    const petX = playerX + PET_OFFSET_X;
    const petY = playerY + PET_OFFSET_Y;
    const petScale = scaleFromY(petY);

    // PIXELLAB_HOOK: replace with sprite turret (Pet)
    this.turret = scene.add.rectangle(petX, petY, 24, 24, 0x78909c);
    this.turret.setStrokeStyle(2, 0x546e7a);
    this.turret.setScale(petScale);
    this.turret.setDepth(depthFromY(petY));
    // Small barrel marker
    this.turretBarrel = scene.add
      .rectangle(petX - 16, petY, 14, 6, 0x90a4ae)
      .setScale(petScale)
      .setDepth(depthFromY(petY, 1));

    // W/S + arrow keys for Y-only move
    this.cursors = scene.input.keyboard.createCursorKeys();
    this.keys = scene.input.keyboard.addKeys({
      W: Phaser.Input.Keyboard.KeyCodes.W,
      S: Phaser.Input.Keyboard.KeyCodes.S,
      A: Phaser.Input.Keyboard.KeyCodes.A,
      D: Phaser.Input.Keyboard.KeyCodes.D,
    });
  }

  _clampGrassY(y) {
    return Math.min(grassYMax(), Math.max(grassYMin(), y));
  }

  _syncPlayerTransform() {
    const y = this._clampGrassY(this.player.y);
    this.player.y = y;
    this.player.x = barricadeXAtY(y) + PLAYER_SAFE_OFFSET;
    const s = scaleFromY(y);
    this.player.setScale(s);
    this.player.setDepth(depthFromY(y));
  }

  _syncPetTransform(deltaMs) {
    const targetX = this.player.x + PET_OFFSET_X;
    const targetY = this._clampGrassY(this.player.y + PET_OFFSET_Y);
    // Delta-aware lerp (~PET_LERP per 60fps frame)
    const t = 1 - Math.pow(1 - PET_LERP, deltaMs / (1000 / 60));
    this.turret.x += (targetX - this.turret.x) * t;
    this.turret.y += (targetY - this.turret.y) * t;
    this.turret.y = this._clampGrassY(this.turret.y);

    const s = scaleFromY(this.turret.y);
    this.turret.setScale(s);
    this.turret.setDepth(depthFromY(this.turret.y));

    this.turretBarrel.x = this.turret.x - 16;
    this.turretBarrel.y = this.turret.y;
    this.turretBarrel.setScale(s);
    this.turretBarrel.setDepth(depthFromY(this.turret.y, 1));
  }

  /**
   * @param {number} deltaMs
   * @param {import('./Zombie.js').Zombie[]} zombies
   * @returns {{ gold: number, kills: number }} always zero here; pet AOE gold comes from resolveHits
   */
  update(deltaMs, zombies) {
    // Player Y-only move (W/S or up/down). X always tracks barricade edge.
    const deltaSec = deltaMs / 1000;
    let dy = 0;
    if (this.cursors.up.isDown || this.keys.W.isDown) dy -= 1;
    if (this.cursors.down.isDown || this.keys.S.isDown) dy += 1;
    if (dy !== 0) {
      this.player.y += dy * PLAYER_MOVE_SPEED * deltaSec;
    }
    this._syncPlayerTransform();
    this._syncPetTransform(deltaMs);

    // WeaponSystem owns fire cadence + targeting; pet spawns PetBullets (AOE on hit only)
    this.weapons.updatePlayerFire(
      deltaMs,
      this.player.x,
      this.player.y,
      zombies,
      this.bullets
    );
    this.weapons.updatePetFire(
      deltaMs,
      this.turret.x,
      this.turret.y,
      zombies,
      this.bullets
    );

    // Move only. Range / off-view retirement happens after hit tests so a
    // pellet can still connect on the frame it reaches maxDistance.
    this.weapons.stepBullets(this.bullets, deltaSec);

    return { gold: 0, kills: 0 };
  }

  /**
   * Resolve bullet ↔ zombie hits (per-pellet shotgun + pet on-hit AOE).
   * Pair living bodies first, then damage — never splice or takeDamage mid-scan.
   * A zombie killed by an earlier pellet is skipped by later pellets.
   * @param {import('./Zombie.js').Zombie[]} zombies
   * @returns {{ gold: number, kills: number }}
   */
  resolveHits(zombies) {
    let gold = 0;
    let kills = 0;
    const list = Array.isArray(zombies) ? zombies : [];
    /** @type {Set<number>} */
    const remove = new Set();
    /** @type {{ index: number, bullet: object, zombie: import('./Zombie.js').Zombie, bx: number, by: number }[]} */
    const hits = [];

    // Pass 1 — pair only. Do not takeDamage here; a kill nulls body and would
    // throw on the next bounds read (the old shotgun hang).
    for (let i = 0; i < this.bullets.length; i++) {
      const b = this.bullets[i];
      if (!b?.gfx || b.gfx.active === false) {
        remove.add(i);
        continue;
      }
      const half = ((b.size ?? BULLET_SIZE) / 2) + 2;
      const bx = b.gfx.x;
      const by = b.gfx.y;
      let hitZombie = null;

      for (const z of list) {
        if (!z?.alive || !z.body) continue;
        const bounds = z.getBounds();
        if (!bounds) continue;
        if (
          bx + half >= bounds.left &&
          bx - half <= bounds.right &&
          by + half >= bounds.top &&
          by - half <= bounds.bottom
        ) {
          hitZombie = z;
          break;
        }
      }

      if (!hitZombie) continue;
      hits.push({ index: i, bullet: b, zombie: hitZombie, bx, by });
    }

    // Pass 2 — damage / knockback / pet AOE. Later pellets no-op if an earlier
    // one already destroyed that zombie.
    for (const hit of hits) {
      remove.add(hit.index);
      const b = hit.bullet;
      if (b.kind === 'pet') {
        const z = hit.zombie;
        const ix = Number.isFinite(hit.bx) ? hit.bx : z?.x;
        const iy = Number.isFinite(hit.by) ? hit.by : z?.y;
        const aoe = this.weapons.applyPetAoe(ix, iy, list);
        gold += aoe.gold;
        kills += aoe.kills;
      } else {
        const gain = this.weapons.applyDirectHit(hit.zombie, b);
        gold += gain.gold;
        kills += gain.kills;
      }
    }

    for (let i = 0; i < this.bullets.length; i++) {
      if (remove.has(i)) continue;
      if (this.weapons.shouldRetireBullet(this.bullets[i])) remove.add(i);
    }

    const indices = Array.from(remove).sort((a, b) => b - a);
    for (const i of indices) this._retireBullet(i);

    return { gold, kills };
  }

  /**
   * @param {number} index
   */
  _retireBullet(index) {
    const b = this.bullets[index];
    if (b?.gfx) {
      try {
        b.gfx.destroy();
      } catch (_) {
        /* already destroyed */
      }
      b.gfx = null;
    }
    this.bullets.splice(index, 1);
  }

  destroy() {
    for (const b of this.bullets) {
      if (b?.gfx) {
        try {
          b.gfx.destroy();
        } catch (_) {
          /* already destroyed */
        }
      }
    }
    this.bullets = [];
    this.player.destroy();
    this.turret.destroy();
    this.turretBarrel.destroy();
  }
}
