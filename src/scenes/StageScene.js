import { WaveManager } from '../systems/WaveManager.js';
import { Barricade } from '../entities/Barricade.js';
import { applyHpBarDensity, Zombie } from '../entities/Zombie.js';
import { DefenderGroup } from '../entities/Defender.js';
import {
  BARRICADE_MAX_HP,
  GAME_WIDTH,
  GAME_HEIGHT,
  STAGE_DURATION,
} from '../data/waves.js';
import { APP_VERSION } from '../data/GameConfig.js';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  HORIZON_Y,
  HUD_DEPTH,
  depthBands,
  cameraScrollX,
  zombieSpawnWorldX,
  laneCenters,
  takeEvenLaneY,
  grassYMin,
  grassYMax,
  barricadeXAtY,
  groundEdgesAtY,
  layoutPx,
} from '../systems/DepthView.js';
import { DAMAGE_COLORS, showDamageText } from '../ui/damageText.js';
import { VirtualControls } from '../ui/VirtualControls.js';
import {
  FONT_GOLD,
  FONT_HUD,
  FONT_INK,
  FONT_TINY,
  INK_TINT,
  UI,
  KitHpBar,
  addKitImage,
  addKitText,
  addParchmentButton,
  showKitBanner,
} from '../ui/uiKit.js';
import { preloadPlayerAssets, registerPlayerAnims } from '../assets/playerSprites.js';
import { preloadZombieAssets, registerZombieAnims } from '../assets/zombieSprites.js';
import { createLibraryAnims, preloadLibrary } from '../assets/libraryAssets.js';
import { drawCampusBackdrop } from '../assets/stageBackdrop.js';
import { tickHitlag } from '../systems/combatJuice.js';
import { preloadGameAudio, SoundManager } from '../systems/SoundManager.js';
import { nearestFieldPet } from '../systems/petAggro.js';
import { PetPortraitHud } from '../ui/PetPortraitHud.js';

/**
 * Stage combat vertical slice — 2.5D side strip.
 *
 * Camera scrolls X only; Y is the depth/lane axis (DepthView).
 * Barricade follows the slanted grass right edge; player Y-moves in safe zone.
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
    // Purse for this attempt. Boot and Shop pass the gold the run starts
    // with. Kills add on top. Retry restores this value so a failed attempt
    // cannot farm gold. There is no separate SaveManager write during Stage;
    // MockDB account gold is not touched here.
    this.runStartGold = data?.gold ?? this.registry.get('gold') ?? 0;
    this.gold = this.runStartGold;
    this.characterId = data?.characterId ?? this.registry.get('characterId') ?? 'default';

    this.registry.set('stage', this.stage);
    this.registry.set('gold', this.gold);
    this.registry.set('characterId', this.characterId);

    this.ended = false;
    /** @type {Zombie[]} */
    this.zombies = [];
    /** Shuffled lane cycle so spawns spread across every guide before repeating. */
    this._laneCycle = { order: [] };
  }

  preload() {
    // BootScene loads these first; this covers a direct Stage start / retry
    // after a cache miss without re-queueing keys that already exist.
    preloadLibrary(this);
    preloadPlayerAssets(this);
    preloadZombieAssets(this);
    preloadGameAudio(this);
  }

  create() {
    this.audio = new SoundManager(this);
    this.events.once('shutdown', () => {
      this.audio?.dispose();
      this.audio = null;
    });

    createLibraryAnims(this);
    registerPlayerAnims(this);
    registerZombieAnims(this);
    this._drawWorld();

    // Frame camera on slanted barricade at mid-grass Y (shared DepthView helpers)
    const midY = (grassYMin() + grassYMax()) / 2;
    const barricadeFocusX = barricadeXAtY(midY);
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    cam.setScroll(cameraScrollX(barricadeFocusX), 0);

    this.barricade = new Barricade(this, {
      maxHp: BARRICADE_MAX_HP,
    });

    this.defenders = new DefenderGroup(this, {});

    this.waveManager = new WaveManager();

    this._buildHud();

    // SPACE toggles Handgun ↔ Shotgun (once per press); combat math stays in WeaponSystem.
    // The touch SWAP button uses the same toggle.
    const keyboard = this.input.keyboard;
    if (keyboard) {
      this._spaceKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this._spaceKey.on('down', () => this._toggleWeapon());
    }

    this.touchControls = new VirtualControls(this, {
      onWeapon: () => this._toggleWeapon(),
    });
    this.defenders.touchControls = this.touchControls;
    this.petHud = new PetPortraitHud(this, {
      views: () => this.defenders.petCombat?.portraitViews() || [],
      onSummon: (index) => this.defenders.summonPet(index, this.zombies),
    });
    this.events.once('shutdown', () => {
      this.petHud?.destroy();
      this.petHud = null;
    });
    this.audio.startStageBgm();
  }

  /** Handgun ↔ shotgun. Shared by SPACE and the touch SWAP button. */
  _toggleWeapon() {
    this.defenders.weapons.toggleWeapon();
    this.hudWeapon?.setText(this._weaponName());
    this._reflowHud();
    this.audio?.playWeaponSwap();
  }

  /** Short weapon name. The icon sits beside it, so the "Weapon:" prefix is dropped. */
  _weaponName() {
    const skin = this.defenders?.weapons?.getSkin?.();
    if (skin?.label) return skin.label;
    return this.defenders?.weapons?.weapon || '';
  }

  _drawWorld() {
    // Sky / atmosphere above the horizon
    this.add.rectangle(WORLD_WIDTH / 2, HORIZON_Y / 2, WORLD_WIDTH, HORIZON_Y, 0x152238);
    // Soft horizon glow
    this.add
      .rectangle(WORLD_WIDTH / 2, HORIZON_Y, WORLD_WIDTH, layoutPx(6), 0x3a5a78, 0.55)
      .setDepth(0);

    // Backdrop under the ground plane (fills side wedges outside trapezoids)
    this.add
      .rectangle(
        WORLD_WIDTH / 2,
        HORIZON_Y + (WORLD_HEIGHT - HORIZON_Y) / 2,
        WORLD_WIDTH,
        WORLD_HEIGHT - HORIZON_Y,
        0x1a2a20
      )
      .setDepth(0);

    // Perspective depth bands (far = higher / narrower)
    const g = this.add.graphics().setDepth(1);
    for (const band of depthBands()) {
      g.fillStyle(band.color, 1);
      g.beginPath();
      g.moveTo(band.e0.left, band.y0);
      g.lineTo(band.e0.right, band.y0);
      g.lineTo(band.e1.right, band.y1);
      g.lineTo(band.e1.left, band.y1);
      g.closePath();
      g.fillPath();
    }

    // Dark lane guides — one per lane center, clipped to the grass trapezoid.
    const guides = this.add.graphics().setDepth(2);
    guides.lineStyle(layoutPx(2), 0x070d0a, 0.88);
    for (const y of laneCenters()) {
      const edge = groundEdgesAtY(y);
      const xEnd = Math.min(edge.right, barricadeXAtY(y));
      if (xEnd <= edge.left) continue;
      guides.beginPath();
      guides.moveTo(edge.left, y);
      guides.lineTo(xEnd, y);
      guides.strokePath();
    }

    drawCampusBackdrop(this);
  }

  _buildHud() {
    const d = HUD_DEPTH;
    const barY = 22;
    // Heart + player frame. The defender has no HP pool, so this fill stays full.
    addKitImage(this, 26, barY, UI.heart, { depth: d + 4, scrollFactor: 0 });
    this.playerHp = new KitHpBar(this, 'player', 174, barY, {
      scrollFactor: 0,
      depth: d + 2,
      ratio: 1,
    });

    const rowY = 58;
    const textOpts = { size: 16, originX: 0, originY: 0.5, depth: d + 3 };
    this.hudTime = addKitText(this, 16, rowY, 'TIME 0s', textOpts);
    this.hudWave = addKitText(this, 16, rowY, 'WAVE 1', textOpts);
    this.hudEnemies = addKitText(this, 16, rowY, 'ENEMIES 0', textOpts);
    this.hudGold = addKitText(this, 16, rowY, `GOLD ${this.gold}`, {
      ...textOpts,
      font: FONT_GOLD,
    });
    this.hudWeapon = addKitText(this, 16, rowY, this._weaponName(), textOpts);
    this.hudBarricade = addKitText(this, 16, rowY, `WALL ${BARRICADE_MAX_HP}`, textOpts);
    this.hudStage = addKitText(this, GAME_WIDTH - 12, rowY, `v${APP_VERSION} STAGE ${this.stage}`, {
      font: FONT_TINY,
      size: 16,
      originX: 1,
      originY: 0.5,
      depth: d + 3,
    });

    const weaponIconKey = this.defenders.weapons.getSkin?.()?.icon;
    if (weaponIconKey && this.textures.exists(weaponIconKey)) {
      this.hudWeaponIcon = this.add
        .image(0, rowY, weaponIconKey)
        .setOrigin(0, 0.5)
        .setScale(0.5)
        .setScrollFactor(0)
        .setDepth(d + 3);
    }

    this._hudRow = [this.hudTime, this.hudWave, this.hudEnemies, this.hudGold];
    if (this.hudWeaponIcon) this._hudRow.push(this.hudWeaponIcon);
    this._hudRow.push(this.hudWeapon, this.hudBarricade);
    this._reflowHud();

    this._announcedWave = null;
    this._showBanner({
      icon: UI.ready,
      title: 'AUTO-FIRE',
      sub: 'W/S LANE SWAP',
      zh: '自動射擊 · 換道 · 換武器',
      hold: 6500,
      y: 230,
    });
    this.events.once('shutdown', () => this._clearBanner());
  }

  _reflowHud() {
    let x = 16;
    const y = 58;
    const gap = 16;
    const versionLeft = (this.hudStage?.x ?? GAME_WIDTH - 12) - (this.hudStage?.width ?? 0) - 12;
    for (const go of this._hudRow || []) {
      if (!go?.setPosition) continue;
      go.setPosition(x, y);
      const w = go.displayWidth || go.width || 0;
      x += w + gap;
      if (x > versionLeft) break;
    }
  }

  /**
   * @param {{ icon?: string, title?: string, sub?: string, zh?: string, hold?: number, y?: number, panel?: string, onParchment?: boolean, titleSize?: number }} opts
   */
  _showBanner(opts) {
    this._clearBanner();
    this._banner = showKitBanner(this, {
      x: GAME_WIDTH / 2,
      y: opts.y ?? 230,
      depth: HUD_DEPTH + 40,
      ...opts,
    });
    if (opts.hold > 0) {
      this._bannerTimer = this.time.delayedCall(opts.hold, () => {
        const banner = this._banner;
        if (!banner || banner.dead) return;
        this.tweens.add({
          targets: banner.objects,
          alpha: 0,
          duration: 280,
          onComplete: () => {
            if (this._banner === banner) this._clearBanner();
            else banner.destroy();
          },
        });
      });
    }
  }

  _clearBanner() {
    this._bannerTimer?.remove?.();
    this._bannerTimer = null;
    this._banner?.destroy?.();
    this._banner = null;
  }

  _refreshHud() {
    const t = Math.min(STAGE_DURATION, Math.floor(this.waveManager.getElapsed()));
    const alive = this.zombies.filter((z) => z.alive).length;
    const wave = this.waveManager.getCurrentWave();

    this.hudTime.setText(`TIME ${t}s`);
    this.hudWave.setText(`WAVE ${wave}`);
    // On-field only. Adding the unspawned budget showed 118 at stage start.
    this.hudEnemies.setText(`ENEMIES ${alive}`);
    this.hudBarricade.setText(`WALL ${Math.ceil(this.barricade.hp)}`);
    this.hudGold.setText(`GOLD ${this.gold}`);
    this.hudWeapon.setText(this._weaponName());
    this.playerHp?.setRatio(1);
    const iconKey = this.defenders.weapons.getSkin?.()?.icon;
    if (this.hudWeaponIcon && iconKey && this.textures.exists(iconKey)) {
      this.hudWeaponIcon.setTexture(iconKey);
    }
    this._reflowHud();

    if (this._announcedWave == null) {
      this._announcedWave = wave;
    } else if (wave !== this._announcedWave) {
      this._announcedWave = wave;
      this._showBanner({
        icon: UI.wave,
        title: `WAVE ${wave}`,
        zh: `第${wave}波`,
        hold: 2400,
        y: 230,
      });
    }
  }

  update(_time, delta) {
    // Restores tween / anim timescale when the overkill hitch ends.
    const hitlag = tickHitlag(this);
    if (this.ended) return;

    // Enforce X-only scroll (no Y drift)
    const cam = this.cameras.main;
    if (cam.scrollY !== 0) cam.setScroll(cam.scrollX, 0);

    const deltaMs = Math.min(delta, 50) * hitlag;
    const deltaSec = deltaMs / 1000;

    // Spawns
    const due = this.waveManager.update(deltaSec);
    for (const intent of due) {
      this._spawnZombie(intent);
    }

    // Zombies move / contact DPS — per-zombie contactXAt(y) matches slanted posts.
    // A pet in front of the fence is bitten instead. The halt itself is unchanged.
    // Damage totals still apply every frame; floating numbers pop on the ~1s bite.
    let barricadeDmg = 0;
    let statusGold = 0;
    /** @type {Zombie[]} */
    const attackBeats = [];
    const fieldPets = this.defenders.fieldPets();
    for (const z of this.zombies) {
      if (!z.alive) continue;
      const pet = nearestFieldPet(z, fieldPets);
      z.update(deltaSec, this.barricade.contactXAt(z.y), pet);
      const status = z.tickStatus(deltaMs);
      statusGold += status?.gold || 0;
      const petDmg = z.petContactDamage(deltaSec);
      if (petDmg > 0 && z.petBiteTarget) {
        z.petBiteTarget.takeDamage(petDmg);
      } else {
        const dealt = z.contactDamage(deltaSec);
        barricadeDmg += dealt;
        z.addBarricadeDmg(dealt);
      }
      if (z.consumeAttackBeat() && !z.petBiteTarget) attackBeats.push(z);
    }
    let destroyed = false;
    if (barricadeDmg > 0) {
      destroyed = this.barricade.applyDamage(barricadeDmg);
    }
    for (const z of attackBeats) {
      this._onBarricadeAttack(z);
    }
    if (destroyed) {
      this._onLose();
      return;
    }

    // Defenders fire + hits. Pet gold includes baby-pet kills; burn gold is statusGold.
    const petGain = this.defenders.update(deltaMs, this.zombies);
    const hitGain = this.defenders.resolveHits(this.zombies);
    const gold = statusGold + (petGain?.gold || 0) + (hitGain?.gold || 0);
    if (gold > 0) {
      this.gold += gold;
      this.registry.set('gold', this.gold);
      this.audio?.playCoin();
    }

    // Prune dead refs occasionally
    if (this.zombies.length > 40) {
      this.zombies = this.zombies.filter((z) => z.alive);
    }

    this._refreshHud();
    this.petHud?.update(deltaMs);
    applyHpBarDensity(this.zombies);
    this._syncControlFade();

    // Win check
    if (this.waveManager.isTimeUp()) {
      const anyAlive = this.zombies.some((z) => z.alive);
      const anyQueued = this.waveManager.getRemainingToSpawn() > 0;
      if (!anyAlive && !anyQueued) {
        this._onWin();
      }
    }
  }

  /**
   * One bite: punch already played on the zombie. Flash the wall, claw mark,
   * and a red integer for the HP chewed since the previous bite.
   * @param {Zombie} z
   */
  _onBarricadeAttack(z) {
    if (!z) return;
    this.audio?.playBarricadeHit();
    const y = z.y;
    const x = this.barricade.contactXAt(y);
    this.barricade.flashAtY(y);
    this.barricade.spawnImpact(x, y);
    const shown = z.popBarricadeDmgInt();
    if (shown >= 1) {
      showDamageText(this, x - layoutPx(10), y - layoutPx(18), shown, DAMAGE_COLORS.barricade);
    }
  }

  _spawnZombie(intent) {
    const y = takeEvenLaneY(this._laneCycle);
    const arch = intent.archetype;
    // Variant is a spawn hook. HP / speed / DPS stay on the wave row.
    const z = new Zombie(this, {
      x: 0,
      y,
      hp: arch.hp,
      speed: arch.speed,
      dps: arch.dps,
      wave: intent.wave,
      variant: arch.variant,
    });
    // Inset by the measured half-body so the left edge does not crop it.
    z.placeAt(zombieSpawnWorldX(z.displayHalf));
    this.zombies.push(z);
  }

  /**
   * Drop joystick / SWAP opacity while a body covers them. The onboarding
   * hint lives under the top HUD, not on the bottom lane.
   */
  _syncControlFade() {
    const controls = this.touchControls;
    if (!controls?.bodyCoversControl) return;
    const cam = this.cameras.main;
    let joy = false;
    let swap = false;
    for (const z of this.zombies) {
      if (!z.alive || !z.body) continue;
      // Controls are screen-space. Zombie x is world x (camera scrolls).
      const screenX = z.x - cam.scrollX;
      if (!joy && controls.bodyCoversControl('joy', screenX, z.y, z.displayHalf, z.visualTop)) {
        joy = true;
      }
      if (!swap && controls.bodyCoversControl('swap', screenX, z.y, z.displayHalf, z.visualTop)) {
        swap = true;
      }
      if (joy && swap) break;
    }
    controls.setCombatFade(joy, swap);
  }

  _pinOverlay(go) {
    go.setScrollFactor(0);
    return go;
  }

  _onWin() {
    if (this.ended) return;
    this.ended = true;
    this.audio?.fadeBgm();
    this.registry.set('gold', this.gold);
    this._clearBanner();

    const d = HUD_DEPTH + 100;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const overlay = this._pinOverlay(
      this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.55).setDepth(d)
    );
    addKitImage(this, cx, cy, UI.dialog, { depth: d + 1 });
    // Navy header: outlined Latin. The ready icon is a dark glyph, so it
    // sits on the parchment body beside the gold line.
    addKitText(this, cx, cy - 72, 'STAGE CLEAR', {
      font: FONT_HUD,
      size: 32,
      depth: d + 3,
    });
    addKitText(this, cx, cy - 36, '關卡通過', {
      system: true,
      size: 18,
      color: '#f6e7c2',
      depth: d + 3,
    });
    this._pairIconText(cx, cy + 36, UI.ready, `GOLD ${this.gold}`, {
      font: FONT_INK,
      size: 16,
      tint: INK_TINT,
      color: '#2a2118',
      depth: d + 3,
    });

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
    this.audio?.playGameOver();
    // Failed attempt does not keep kill gold. The next run starts at the
    // purse this attempt was given (0 from Boot, or Shop gold after a win).
    this.registry.set('gold', this.runStartGold);
    this._clearBanner();

    const d = HUD_DEPTH + 100;
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;
    const survived = Math.floor(this.waveManager.getElapsed());

    this._pinOverlay(
      this.add.rectangle(cx, cy, GAME_WIDTH, GAME_HEIGHT, 0x1a0000, 0.7).setDepth(d)
    );
    addKitImage(this, cx, cy, UI.dialog, { depth: d + 1 });
    // Header is navy, so outlined Latin and cream Chinese live there.
    // The parchment body only has room for one line plus the scale-2 button.
    this._pairIconText(cx, cy - 76, UI.gameover, 'GAME OVER', {
      font: FONT_HUD,
      size: 32,
      depth: d + 3,
    });
    addKitText(this, cx, cy - 42, '遊戲結束', {
      system: true,
      size: 18,
      color: '#f6e7c2',
      depth: d + 3,
    });
    addKitText(this, cx, cy - 16, `RETRY STARTS AT ${this.runStartGold} GOLD`, {
      font: FONT_HUD,
      size: 16,
      depth: d + 3,
    });
    this._pairIconText(cx, cy + 22, UI.damage, `SURVIVED ${survived}s  GOLD ${this.gold}`, {
      font: FONT_INK,
      size: 16,
      tint: INK_TINT,
      color: '#2a2118',
      depth: d + 3,
    });
    addParchmentButton(
      this,
      cx,
      cy + 78,
      'RETRY',
      () => {
        // Retry resets run gold to the purse this attempt started with.
        this.scene.start('StageScene', {
          stage: this.stage,
          gold: this.runStartGold,
          characterId: this.characterId,
        });
      },
      { scale: 2, depth: d + 4 }
    );
  }

  /**
   * Icon then bitmap label, centered as a pair. Missing icons leave the label centered.
   * @param {number} x
   * @param {number} y
   * @param {string} iconKey
   * @param {string} label
   * @param {object} textOpts
   */
  _pairIconText(x, y, iconKey, label, textOpts) {
    const title = addKitText(this, x, y, label, textOpts);
    const icon = addKitImage(this, x, y, iconKey, { depth: textOpts.depth, scrollFactor: 0 });
    if (icon && title) {
      const gap = 8;
      const tw = title.width || 0;
      const iw = icon.displayWidth || 32;
      const total = iw + gap + tw;
      icon.setPosition(x - total / 2 + iw / 2, y);
      title.setPosition(x - total / 2 + iw + gap + tw / 2, y);
    }
    return title;
  }
}
