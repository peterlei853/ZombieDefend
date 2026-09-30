import { WaveManager } from '../systems/WaveManager.js';
import { Barricade } from '../entities/Barricade.js';
import { Zombie } from '../entities/Zombie.js';
import { DefenderGroup } from '../entities/Defender.js';
import {
  BARRICADE_X,
  BARRICADE_MAX_HP,
  GAME_WIDTH,
  GAME_HEIGHT,
  STAGE_DURATION,
} from '../data/waves.js';

/**
 * Stage combat vertical slice.
 *
 * Reads stage / characterId / gold from scene data or registry so Architect
 * can inject SaveManager progress later.
 *
 * Win:  timer ≥ 90s AND no zombies remain → ShopScene
 * Lose: barricade HP ≤ 0 → Game Over overlay (retry)
 */
export default class StageScene extends Phaser.Scene {
  constructor() {
    super('StageScene');
  }

  init(data) {
    this.stage = data?.stage ?? this.registry.get('stage') ?? 1;
    this.gold = data?.gold ?? this.registry.get('gold') ?? 0;
    this.characterId = data?.characterId ?? this.registry.get('characterId') ?? 'default';

    this.registry.set('stage', this.stage);
    this.registry.set('gold', this.gold);
    this.registry.set('characterId', this.characterId);

    this.ended = false;
    /** @type {Zombie[]} */
    this.zombies = [];
  }

  create() {
    const w = GAME_WIDTH;
    const h = GAME_HEIGHT;

    // Ground / battlefield
    this.add.rectangle(w / 2, h / 2, w, h, 0x1a2330);
    // Dirt strip
    this.add.rectangle(w / 2, h - 6, w, 12, 0x2e3d2e);

    // Subtle lane guides
    for (let i = 1; i < 4; i++) {
      const y = 40 + ((h - 50) / 4) * i;
      this.add.rectangle(w / 2, y, w, 1, 0x243040, 0.5);
    }

    this.barricade = new Barricade(this, {
      x: BARRICADE_X,
      maxHp: BARRICADE_MAX_HP,
    });

    this.defenders = new DefenderGroup(this, {
      barricadeX: BARRICADE_X,
    });

    this.waveManager = new WaveManager();

    this._buildHud();
    this._spawnYMin = 55;
    this._spawnYMax = h - 30;
  }

  _buildHud() {
    const style = {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      color: '#e8eef5',
    };
    this.hudBg = this.add.rectangle(GAME_WIDTH / 2, 16, GAME_WIDTH, 32, 0x0a1018, 0.85).setDepth(50);

    this.hudTime = this.add.text(12, 8, 'Time: 0s', style).setDepth(51);
    this.hudWave = this.add.text(120, 8, 'Wave: 1', style).setDepth(51);
    this.hudEnemies = this.add.text(210, 8, 'Enemies: 0', style).setDepth(51);
    this.hudBarricade = this.add.text(360, 8, `Barricade: ${BARRICADE_MAX_HP}`, style).setDepth(51);
    this.hudGold = this.add.text(560, 8, `Gold: ${this.gold}`, { ...style, color: '#ffd54f' }).setDepth(51);
    this.hudStage = this.add
      .text(GAME_WIDTH - 12, 8, `Stage ${this.stage}`, { ...style, color: '#8fa3b8' })
      .setOrigin(1, 0)
      .setDepth(51);
  }

  _refreshHud() {
    const t = Math.min(STAGE_DURATION, Math.floor(this.waveManager.getElapsed()));
    const alive = this.zombies.filter((z) => z.alive).length;
    const remaining = alive + this.waveManager.getRemainingToSpawn();

    this.hudTime.setText(`Time: ${t}s`);
    this.hudWave.setText(`Wave: ${this.waveManager.getCurrentWave()}`);
    this.hudEnemies.setText(`Enemies: ${remaining}`);
    this.hudBarricade.setText(`Barricade: ${Math.ceil(this.barricade.hp)}`);
    this.hudGold.setText(`Gold: ${this.gold}`);
  }

  update(_time, delta) {
    if (this.ended) return;

    const deltaMs = Math.min(delta, 50);
    const deltaSec = deltaMs / 1000;

    // Spawns
    const due = this.waveManager.update(deltaSec);
    for (const intent of due) {
      this._spawnZombie(intent);
    }

    // Zombies move / contact DPS
    let barricadeDmg = 0;
    const contactX = this.barricade.contactX;
    for (const z of this.zombies) {
      if (!z.alive) continue;
      z.update(deltaSec, contactX);
      barricadeDmg += z.contactDamage(deltaSec);
    }
    if (barricadeDmg > 0) {
      const destroyed = this.barricade.applyDamage(barricadeDmg);
      if (destroyed) {
        this._onLose();
        return;
      }
    }

    // Defenders fire + hits
    this.defenders.update(deltaMs, this.zombies);
    const { gold } = this.defenders.resolveHits(this.zombies);
    if (gold > 0) {
      this.gold += gold;
      this.registry.set('gold', this.gold);
    }

    // Prune dead refs occasionally
    if (this.zombies.length > 40) {
      this.zombies = this.zombies.filter((z) => z.alive);
    }

    this._refreshHud();

    // Win check
    if (this.waveManager.isTimeUp()) {
      const anyAlive = this.zombies.some((z) => z.alive);
      const anyQueued = this.waveManager.getRemainingToSpawn() > 0;
      if (!anyAlive && !anyQueued) {
        this._onWin();
      }
    }
  }

  _spawnZombie(intent) {
    const y =
      this._spawnYMin + Math.random() * (this._spawnYMax - this._spawnYMin);
    const arch = intent.archetype;
    const z = new Zombie(this, {
      x: -10,
      y,
      hp: arch.hp,
      speed: arch.speed,
      dps: arch.dps,
      wave: intent.wave,
    });
    this.zombies.push(z);
  }

  _onWin() {
    if (this.ended) return;
    this.ended = true;
    this.registry.set('gold', this.gold);

    const overlay = this.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH,
      GAME_HEIGHT,
      0x000000,
      0.55
    ).setDepth(100);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.38, 'Stage Clear!', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '36px',
        color: '#81c784',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(101);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.5, `Gold: ${this.gold}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#ffd54f',
      })
      .setOrigin(0.5)
      .setDepth(101);

    this.time.delayedCall(900, () => {
      overlay.destroy();
      this.scene.start('ShopScene', {
        stage: this.stage,
        gold: this.gold,
        characterId: this.characterId,
      });
    });
  }

  _onLose() {
    if (this.ended) return;
    this.ended = true;
    this.registry.set('gold', this.gold);

    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x1a0000, 0.7)
      .setDepth(100);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.32, 'Game Over', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '40px',
        color: '#ef5350',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(101);

    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.46, `Survived ${Math.floor(this.waveManager.getElapsed())}s · Gold ${this.gold}`, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '16px',
        color: '#cfd8dc',
      })
      .setOrigin(0.5)
      .setDepth(101);

    const btn = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT * 0.62, 180, 44, 0x455a64)
      .setInteractive({ useHandCursor: true })
      .setDepth(101);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.62, 'Retry', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(102);

    btn.on('pointerover', () => btn.setFillStyle(0x546e7a));
    btn.on('pointerout', () => btn.setFillStyle(0x455a64));
    btn.on('pointerup', () => {
      // Retry same stage; keep earned gold this run (Architect may change)
      this.scene.start('StageScene', {
        stage: this.stage,
        gold: this.gold,
        characterId: this.characterId,
      });
    });
  }
}
