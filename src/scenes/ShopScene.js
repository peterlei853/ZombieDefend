/**
 * Shopping list after a stage clear (v0.28).
 * buyWeapon / upgradeWeapon spend through SaveManager.spendGold when that
 * object is already on the registry. Otherwise they spend the run purse.
 * This scene does not add save keys or change the gold-by-HP table.
 * Receives { stage, gold, characterId, selectedPetId, ownedWeapons, upgrades } from Stage.
 * The shop bed is bgm-shop (started below; beds are not re-hung here).
 */
import { preloadGameAudio, SoundManager } from '../systems/SoundManager.js';
import { FONT_HUD, addKitText, addParchmentButton } from '../ui/uiKit.js';
import {
  SHOP_OFFERS,
  SHOP_UPGRADE_COST,
  SHOP_WEAPON_COST,
  tryShopAction,
} from '../data/shopList.js';
import { PLAYABLE_STAGE_CAP, STAGE_COUNT, clampStage } from '../data/stageRoster.js';

export { SHOP_UPGRADE_COST, SHOP_WEAPON_COST };

export default class ShopScene extends Phaser.Scene {
  constructor() {
    super('ShopScene');
  }

  init(data) {
    this.stage = clampStage(data?.stage ?? this.registry.get('stage') ?? 1);
    this.gold = data?.gold ?? this.registry.get('gold') ?? 0;
    this.characterId = data?.characterId ?? this.registry.get('characterId') ?? 'default';
    this.selectedPetId = data?.selectedPetId ?? this.registry.get('selectedPetId') ?? null;
    this.ownedWeapons = Array.isArray(data?.ownedWeapons)
      ? data.ownedWeapons.slice()
      : (this.registry.get('ownedWeapons') || []).slice();
    this.upgrades = { ...(data?.upgrades || this.registry.get('weaponUpgrades') || {}) };
    this.shopItems = Array.isArray(this.registry.get('shopItems'))
      ? this.registry.get('shopItems').slice()
      : [];

    this.registry.set('stage', this.stage);
    this.registry.set('gold', this.gold);
    this.registry.set('characterId', this.characterId);
    this.registry.set('selectedPetId', this.selectedPetId);
    this.registry.set('ownedWeapons', this.ownedWeapons);
    this.registry.set('weaponUpgrades', this.upgrades);
    this.registry.set('shopItems', this.shopItems);
    /** @type {{ id: string, ownText: Phaser.GameObjects.GameObject, lvText: Phaser.GameObjects.GameObject }[]} */
    this.rows = [];
  }

  /**
   * @param {string} id
   * @returns {{ ok: boolean, reason?: string, gold?: number }}
   */
  buyWeapon(id) {
    return this._act('buy', id);
  }

  /**
   * @param {string} id
   * @returns {{ ok: boolean, reason?: string, gold?: number, level?: number }}
   */
  upgradeWeapon(id) {
    return this._act('upgrade', id);
  }

  /**
   * Next stage through the 3-loop cap. Keeps the purse, owned weapons, and
   * upgrade ranks. After PLAYABLE_STAGE_CAP (and after STAGE_COUNT) return
   * to the title. Stages 4–5 stay on disk; this loop does not enter them.
   */
  continue() {
    if (this.stage >= PLAYABLE_STAGE_CAP || this.stage >= STAGE_COUNT) {
      this.registry.set('stage', 1);
      this.scene.start('TitleScene');
      return;
    }
    const nextStage = this.stage + 1;
    this.registry.set('stage', nextStage);
    this.scene.start('StageScene', {
      stage: nextStage,
      gold: this.gold,
      characterId: this.characterId,
      selectedPetId: this.selectedPetId,
      ownedWeapons: this.ownedWeapons,
      upgrades: this.upgrades,
    });
  }

  /**
   * @param {'buy'|'upgrade'} kind
   * @param {string} id
   */
  _act(kind, id) {
    const result = tryShopAction(this._shopState(), kind, id, (cost) => this._spendGold(cost));
    if (!result.ok) return result;
    this.ownedWeapons = result.ownedWeapons;
    this.upgrades = result.upgrades;
    if (Number.isFinite(result.gold)) this.gold = result.gold;
    this._remember(result.purchase);
    return { ok: true, gold: this.gold, level: result.level };
  }

  _shopState() {
    return {
      gold: this.gold,
      ownedWeapons: this.ownedWeapons,
      upgrades: this.upgrades,
    };
  }

  /**
   * @param {string|undefined} purchase
   */
  _remember(purchase) {
    this.registry.set('ownedWeapons', this.ownedWeapons);
    this.registry.set('weaponUpgrades', this.upgrades);
    this.registry.set('gold', this.gold);
    if (!purchase) return;
    this.shopItems.push(purchase);
    this.registry.set('shopItems', this.shopItems);
    const save = this.registry?.get?.('saveManager');
    if (typeof save?.recordPurchase === 'function') save.recordPurchase(purchase);
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
    this.add.rectangle(width / 2, height / 2, width, height, 0x070b10, 0.62).setScrollFactor(0);

    addKitText(this, width / 2, 48, 'SHOP LIST', {
      font: FONT_HUD,
      size: 32,
      depth: 4,
    });
    addKitText(this, width / 2, 84, `STAGE ${this.stage} CLEAR`, {
      font: FONT_HUD,
      size: 16,
      depth: 4,
    });
    this.goldLabel = addKitText(this, 160, 120, `GOLD ${this.gold}`, {
      font: FONT_HUD,
      size: 16,
      originX: 0,
      depth: 4,
    });
    addKitText(this, width - 160, 120, `BUY ${SHOP_WEAPON_COST}    UP ${SHOP_UPGRADE_COST}`, {
      font: FONT_HUD,
      size: 16,
      originX: 1,
      depth: 4,
    });
    this.statusLabel = addKitText(this, width / 2, 616, 'PICK A GUN', {
      font: FONT_HUD,
      size: 16,
      depth: 5,
    });

    const top = 176;
    const gap = 72;
    SHOP_OFFERS.forEach((offer, index) => {
      const y = top + index * gap;
      const plate = this.add.rectangle(width / 2, y, 1080, 60, 0x24180f, 0.9);
      plate.setStrokeStyle(2, 0x8a7048);
      plate.setScrollFactor(0);
      plate.setDepth(3);
      if (this.textures.exists(offer.icon)) {
        const icon = this.add.image(150, y, offer.icon).setScrollFactor(0).setDepth(4);
        icon.setScale(1.5);
      }
      addKitText(this, 190, y, offer.label.toUpperCase(), {
        font: FONT_HUD,
        size: 16,
        originX: 0,
        depth: 4,
      });
      const ownText = addKitText(this, 520, y, '', {
        font: FONT_HUD,
        size: 16,
        originX: 0,
        depth: 4,
      });
      const lvText = addKitText(this, 860, y, '', {
        font: FONT_HUD,
        size: 16,
        depth: 4,
      });
      addParchmentButton(this, 740, y, 'BUY', () => this._press('buy', offer.id), {
        scale: 1.6,
        depth: 5,
      });
      addParchmentButton(this, 1060, y, 'UP', () => this._press('upgrade', offer.id), {
        scale: 1.6,
        depth: 5,
      });
      this.rows.push({ id: offer.id, ownText, lvText });
    });
    this._refreshRows();

    addParchmentButton(this, width / 2, 672, this.stage >= PLAYABLE_STAGE_CAP || this.stage >= STAGE_COUNT ? 'TITLE' : 'NEXT', () => {
      this.audio?.playUiClick();
      this.continue();
    }, { scale: 2, depth: 5 });

    this.audio = new SoundManager(this);
    this.events.once('shutdown', () => {
      this.audio?.dispose();
      this.audio = null;
    });
    this.audio.startShopBgm();
    this.audio.playUiShop();
  }

  /**
   * @param {'buy'|'upgrade'} kind
   * @param {string} id
   */
  _press(kind, id) {
    this.audio?.playUiClick();
    const result = kind === 'buy' ? this.buyWeapon(id) : this.upgradeWeapon(id);
    this._showResult(result);
    this._refreshRows();
  }

  /**
   * @param {{ ok?: boolean, reason?: string }} result
   */
  _showResult(result) {
    if (!this.statusLabel?.setText) return;
    if (result?.ok) {
      this.statusLabel.setText('PAID');
      return;
    }
    if (result?.reason === 'gold') this.statusLabel.setText('NEED GOLD');
    else if (result?.reason === 'owned') this.statusLabel.setText('ALREADY OWNED');
    else if (result?.reason === 'unowned') this.statusLabel.setText('BUY FIRST');
    else this.statusLabel.setText('NO SALE');
  }

  _refreshRows() {
    this.goldLabel?.setText?.(`GOLD ${this.gold}`);
    for (const row of this.rows) {
      const owned = this.ownedWeapons.includes(row.id);
      const level = this.upgrades[row.id] || 0;
      row.ownText?.setText?.(owned ? 'HAVE' : `${SHOP_WEAPON_COST}G`);
      row.lvText?.setText?.(`LV ${level}`);
    }
  }
}
