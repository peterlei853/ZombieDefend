import {
  PLAYER_FIRE_RATE,
  PLAYER_BULLET_DAMAGE,
  TURRET_FIRE_RATE,
  TURRET_BULLET_DAMAGE,
  BULLET_SPEED,
  BULLET_SIZE,
} from '../data/waves.js';
import {
  depthFromY,
  scaleFromY,
  laneCenters,
  spawnWorldX,
  WORLD_HEIGHT,
} from '../systems/DepthView.js';

/**
 * Auto-firing player + default turret behind the barricade.
 * Both auto-aim at nearest living zombies and fire blue square bullets toward them.
 * Placed in world X behind the barricade on different lane Ys (2.5D).
 */
export class DefenderGroup {
  /**
   * @param {Phaser.Scene} scene
   * @param {{ barricadeX: number }} opts
   */
  constructor(scene, opts) {
    this.scene = scene;
    this.bullets = [];

    const baseX = opts.barricadeX + 40;
    const lanes = laneCenters();
    // Player farther lane, turret nearer — different Y for Z-sort
    const playerY = lanes[Math.min(1, lanes.length - 1)];
    const turretY = lanes[Math.min(3, lanes.length - 1)];
    const playerScale = scaleFromY(playerY);
    const turretScale = scaleFromY(turretY);

    // PIXELLAB_HOOK: replace with sprite player
    this.player = scene.add.rectangle(baseX + 10, playerY, 22, 28, 0x42a5f5);
    this.player.setStrokeStyle(2, 0x1e88e5);
    this.player.setScale(playerScale);
    this.player.setDepth(depthFromY(playerY));

    // PIXELLAB_HOOK: replace with sprite turret
    this.turret = scene.add.rectangle(baseX + 30, turretY, 24, 24, 0x78909c);
    this.turret.setStrokeStyle(2, 0x546e7a);
    this.turret.setScale(turretScale);
    this.turret.setDepth(depthFromY(turretY));
    // Small barrel marker
    this.turretBarrel = scene.add
      .rectangle(baseX + 14, turretY, 14, 6, 0x90a4ae)
      .setScale(turretScale)
      .setDepth(depthFromY(turretY, 1));

    this._playerCooldown = 0;
    this._turretCooldown = 0;
  }

  /**
   * @param {import('./Zombie.js').Zombie[]} zombies
   * @param {number} fromX
   * @param {number} fromY
   * @param {import('./Zombie.js').Zombie|null} [exclude]
   */
  _nearest(zombies, fromX, fromY, exclude = null) {
    let best = null;
    let bestDist = Infinity;
    for (const z of zombies) {
      if (!z.alive || z === exclude) continue;
      // Prefer threats closer to the barricade (higher x), break ties by distance
      const dist = Math.hypot(z.x - fromX, z.y - fromY);
      // Prefer zombies nearer the barricade / already chewing on it
      const score = dist - z.x * 0.35 + (z.atBarricade ? -80 : 0);
      if (score < bestDist) {
        bestDist = score;
        best = z;
      }
    }
    return best;
  }

  /**
   * @param {number} deltaMs
   * @param {import('./Zombie.js').Zombie[]} zombies
   */
  update(deltaMs, zombies) {
    this._playerCooldown -= deltaMs;
    this._turretCooldown -= deltaMs;

    const living = zombies.filter((z) => z.alive);
    if (living.length > 0) {
      if (this._playerCooldown <= 0) {
        const target = this._nearest(living, this.player.x, this.player.y);
        if (target) {
          this._fireAt(this.player.x - 10, this.player.y, target, PLAYER_BULLET_DAMAGE);
          this._playerCooldown = PLAYER_FIRE_RATE;
        }
      }
      if (this._turretCooldown <= 0) {
        // Prefer a different target than player when possible
        const playerTarget = this._nearest(living, this.player.x, this.player.y);
        const target = this._nearest(living, this.turret.x, this.turret.y, playerTarget) || playerTarget;
        if (target) {
          this._fireAt(this.turret.x - 12, this.turret.y, target, TURRET_BULLET_DAMAGE);
          this._turretCooldown = TURRET_FIRE_RATE;
        }
      }
    }

    const deltaSec = deltaMs / 1000;
    const leftCull = spawnWorldX() - 50;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.gfx.x += b.vx * deltaSec;
      b.gfx.y += b.vy * deltaSec;
      b.gfx.setDepth(depthFromY(b.gfx.y));
      if (b.gfx.x < leftCull || b.gfx.y < -30 || b.gfx.y > WORLD_HEIGHT + 30) {
        b.gfx.destroy();
        this.bullets.splice(i, 1);
      }
    }
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {import('./Zombie.js').Zombie} target
   * @param {number} damage
   */
  _fireAt(x, y, target, damage) {
    const dx = target.x - x;
    const dy = target.y - y;
    const len = Math.hypot(dx, dy) || 1;
    // Always push leftward component; normalize to BULLET_SPEED
    const vx = (dx / len) * BULLET_SPEED;
    const vy = (dy / len) * BULLET_SPEED;

    // PIXELLAB_HOOK: replace with sprite bullet
    const gfx = this.scene.add.rectangle(x, y, BULLET_SIZE, BULLET_SIZE, 0x40c4ff);
    gfx.setDepth(depthFromY(y));
    this.bullets.push({ gfx, damage, vx, vy });
  }

  /**
   * Resolve bullet ↔ zombie hits. Returns gold earned this frame from kills.
   * @param {import('./Zombie.js').Zombie[]} zombies
   * @returns {{ gold: number, kills: number }}
   */
  resolveHits(zombies) {
    let gold = 0;
    let kills = 0;
    const half = BULLET_SIZE / 2 + 2; // slight forgiveness

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      const bx = b.gfx.x;
      const by = b.gfx.y;
      let hit = false;

      for (const z of zombies) {
        if (!z.alive) continue;
        const bounds = z.getBounds();
        if (
          bx + half >= bounds.left &&
          bx - half <= bounds.right &&
          by + half >= bounds.top &&
          by - half <= bounds.bottom
        ) {
          const killed = z.takeDamage(b.damage);
          if (killed) {
            gold += z.goldValue;
            kills += 1;
          }
          hit = true;
          break;
        }
      }

      if (hit) {
        b.gfx.destroy();
        this.bullets.splice(i, 1);
      }
    }

    return { gold, kills };
  }

  destroy() {
    for (const b of this.bullets) b.gfx.destroy();
    this.bullets = [];
    this.player.destroy();
    this.turret.destroy();
    this.turretBarrel.destroy();
  }
}
