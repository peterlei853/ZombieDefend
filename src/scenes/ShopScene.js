/**
 * Shop stub for v0.26. Full list UI is v0.28.
 * buyWeapon / upgradeWeapon spend the run purse. If a SaveManager with
 * spendGold is already on the registry they use that; this scene does not
 * add keys or change the gold-by-HP table.
 * Receives { stage, gold, characterId, ownedWeapons, upgrades } from Stage.
 * The shop bed is bgm-shop.
 */
import { preloadGameAudio, SoundManager } from '../systems/SoundManager.js';
import {
  FONT_HUD,
  FONT_INK,
  FONT_TINY_INK,
  INK_TINT,
  UI,
  addKitImage,
  addKitText,
  addParchmentButton,
} from '../ui/uiKit.js';

/** Stub prices. Not part of the zombie gold table. */
export const SHOP_WEAPON_COST = 40;
export const SHOP_UPGRADE_COST = 25;

export default class ShopScene extends Phaser.Scene {
  constructor() {
    super('ShopScene');
  }

  init(data) {
    this.stage = data?.stage ?? this.registry.get('stage') ?? 1;
    this.gold = data?.gold ?? this.registry.get('gold') ?? 0;
    this.characterId = data?.characterId ?? this.registry.get('characterId') ?? 'default';
    this.ownedWeapons = Array.isArray(data?.ownedWeapons) ? data.ownedWeapons.slice() : [];
    this.upgrades = { ...(data?.upgrades || {}) };

    this.registry.set('stage', this.stage);
    this.registry.set('gold', this.gold);
    this.registry.set('characterId', this.characterId);
    this.registry.set('ownedWeapons', this.ownedWeapons);
    this.registry.set('weaponUpgrades', this.upgrades);
  }

  /**
   * @param {string} id
   * @returns {{ ok: boolean, reason?: string, gold?: number }}
   */
  buyWeapon(id) {
    if (!id) return { ok: false, reason: 'missing' };
    if (this.ownedWeapons.includes(id)) return { ok: false, reason: 'owned' };
    const spent = this._spendGold(SHOP_WEAPON_COST);
    if (!spent.ok) return spent;
    this.ownedWeapons.push(id);
    this.registry.set('ownedWeapons', this.ownedWeapons);
    return { ok: true, gold: this.gold };
  }

  /**
   * @param {string} id
   * @returns {{ ok: boolean, reason?: string, gold?: number, level?: number }}
   */
  upgradeWeapon(id) {
    if (!id) return { ok: false, reason: 'missing' };
    const spent = this._spendGold(SHOP_UPGRADE_COST);
    if (!spent.ok) return spent;
    this.upgrades[id] = (this.upgrades[id] || 0) + 1;
    this.registry.set('weaponUpgrades', this.upgrades);
    return { ok: true, gold: this.gold, level: this.upgrades[id] };
  }

  /** Next stage. Keeps the purse, owned weapons, and upgrade ranks. */
  continue() {
    const nextStage = this.stage + 1;
    this.registry.set('stage', nextStage);
    this.scene.start('StageScene', {
      stage: nextStage,
      gold: this.gold,
      characterId: this.characterId,
      ownedWeapons: this.ownedWeapons,
      upgrades: this.upgrades,
    });
  }

  /**
   * @param {number} cost
   * @returns {{ ok: boolean, reason?: string, gold?: number }}
   */
  _spendGold(cost) {
    const amount = Math.max(0, Math.floor(Number(cost) || 0));
    const save = this.registry?.get?.('saveManager');
    if (typeof save?.spendGold === 'function') {
      const res = save.spendGold(amount);
      if (res && res.ok === false) return res;
      if (Number.isFinite(res?.gold)) this.gold = res.gold;
      else this.gold = Math.max(0, this.gold - amount);
    } else if (this.gold < amount) {
      return { ok: false, reason: 'gold' };
    } else {
      this.gold -= amount;
    }
    this.registry.set('gold', this.gold);
    this.goldLabel?.setText?.(`GOLD ${this.gold}`);
    return { ok: true, gold: this.gold };
  }

  preload() {
    preloadGameAudio(this);
  }

  create() {
    const { width, height } = this.scale;
    if (this.textures.exists('bg-campus-night-full')) {
      this.add.image(0, 0, 'bg-campus-night-full').setOrigin(0, 0);
    } else {
      this.add.rectangle(width / 2, height / 2, width, height, 0x121820);
    }
    this.add.rectangle(width / 2, height / 2, width, height, 0x070b10, 0.55);
    addKitImage(this, width / 2, height / 2, UI.dialog, { depth: 2 });

    const cx = width / 2;
    const cy = height / 2;
    addKitText(this, cx, cy - 72, 'SHOP', {
      font: FONT_HUD,
      size: 32,
      depth: 4,
    });
    addKitText(this, cx, cy - 36, `STAGE ${this.stage}`, {
      font: FONT_HUD,
      size: 16,
      depth: 4,
    });
    this.goldLabel = addKitText(this, cx, cy + 14, `GOLD ${this.gold}`, {
      font: FONT_INK,
      size: 16,
      tint: INK_TINT,
      color: '#2a2118',
      depth: 4,
    });
    const id = String(this.characterId ?? '');
    addKitText(this, cx, cy + 36, `ID ${id}`, {
      font: FONT_TINY_INK,
      size: 16,
      tint: INK_TINT,
      color: '#3a2c1c',
      depth: 4,
      system: /[^A-Za-z0-9 .]/.test(id),
    });
    addKitText(this, cx, cy + 56, 'Shop items stub', {
      system: true,
      size: 14,
      color: '#3a2c1c',
      depth: 4,
    });

    this.audio = new SoundManager(this);
    this.events.once('shutdown', () => {
      this.audio?.dispose();
      this.audio = null;
    });
    this.audio.startShopBgm();

    addParchmentButton(this, cx, cy + 96, 'NEXT', () => this.continue(), { scale: 2, depth: 4 });
  }
}
