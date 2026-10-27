import { APP_VERSION } from '../data/GameConfig.js';
import { departLine } from '../data/narrationCopy.js';
import { isOpeningPetId, PET_SELECT_ROSTER, spriteKeyForPet } from '../data/petSelectRoster.js';
import { clampStage } from '../data/stageRoster.js';
import { SoundManager } from '../systems/SoundManager.js';
import { createNarrationToast } from '../ui/NarrationToast.js';
import {
  FONT_HUD,
  FONT_TINY,
  addKitImage,
  addKitText,
  addParchmentButton,
  addTitleBackdrop,
} from '../ui/uiKit.js';

/**
 * Opening pet picker. Four catalog pets, pick one, then Stage.
 * Sits after Title (and after Auth / CharSelect when those scenes exist).
 * Pets are not chosen on the character avatar.
 *
 * PIXELLAB_HOOK: card faces are the existing heads
 * ui-pet-phoenix-head, ui-pet-panda-head, ui-pet-lion-head, ui-pet-dragon-head.
 * No new card sheet. A flat swatch stands in only when that head is not cached.
 * GO! / Back! stay on goBackHudHook. This scene does not summon or recall.
 */
export default class PetSelectScene extends Phaser.Scene {
  constructor() {
    super('PetSelectScene');
  }

  init(data) {
    this.stage = clampStage(data?.stage ?? this.registry.get('stage') ?? 1);
    this.gold = data?.gold ?? this.registry.get('gold') ?? 0;
    this.characterId = data?.characterId ?? this.registry.get('characterId') ?? 'default';
    this.ownedWeapons = Array.isArray(data?.ownedWeapons) ? data.ownedWeapons.slice() : null;
    this.upgrades = data?.upgrades ? { ...data.upgrades } : null;
    const save = this.registry.get('saveManager');
    const saved = data?.selectedPetId || save?.getSelectedPetId?.() || this.registry.get('selectedPetId');
    this.pickedId = isOpeningPetId(saved) ? saved : null;
    this.registry.set('stage', this.stage);
    /** @type {{ id: string, frame: Phaser.GameObjects.Rectangle }[]} */
    this.cards = [];
    this._left = false;
  }

  create() {
    const { width, height } = this.scale;
    if (!addTitleBackdrop(this, width, height)) {
      if (this.textures.exists('bg-campus-night-full')) {
        this.add.image(0, 0, 'bg-campus-night-full').setOrigin(0, 0);
      } else {
        this.add.rectangle(width / 2, height / 2, width, height, 0x0b0f14);
      }
    }
    this.add.rectangle(width / 2, height / 2, width, height, 0x070b10, 0.45).setScrollFactor(0).setDepth(1);

    addKitText(this, width / 2, 64, 'PICK A PET', {
      font: FONT_HUD,
      size: 32,
      depth: 4,
    });
    addKitText(this, width / 2, 100, `v${APP_VERSION}`, {
      font: FONT_TINY,
      size: 16,
      depth: 4,
    });
    addKitText(this, width / 2, 132, '四選一', {
      system: true,
      size: 18,
      color: '#f6e7c2',
      depth: 4,
    });

    const cardW = 220;
    const cardH = 300;
    const gap = 24;
    const total = PET_SELECT_ROSTER.length * cardW + (PET_SELECT_ROSTER.length - 1) * gap;
    let x = width / 2 - total / 2 + cardW / 2;
    const y = 340;
    PET_SELECT_ROSTER.forEach((pet, index) => {
      this._addCard(pet, x, y, cardW, cardH, index);
      x += cardW + gap;
    });

    this.statusLabel = addKitText(this, width / 2, 560, 'PICK 1', {
      font: FONT_HUD,
      size: 16,
      depth: 5,
    });

    addParchmentButton(this, width / 2 - 180, 640, 'TITLE', () => this._back(), {
      scale: 2,
      depth: 5,
    });
    addParchmentButton(this, width / 2 + 180, 640, 'NEXT', () => this._confirm(), {
      scale: 2,
      depth: 5,
    });

    this._refresh();

    this.audio = new SoundManager(this);
    this.events.once('shutdown', () => {
      this.audio?.dispose();
      this.audio = null;
    });
    this.audio.startTitleBgm();

    const keys = this.input.keyboard;
    keys?.on('keydown-ONE', () => this._select(PET_SELECT_ROSTER[0].id));
    keys?.on('keydown-TWO', () => this._select(PET_SELECT_ROSTER[1].id));
    keys?.on('keydown-THREE', () => this._select(PET_SELECT_ROSTER[2].id));
    keys?.on('keydown-FOUR', () => this._select(PET_SELECT_ROSTER[3].id));
    keys?.on('keydown-ENTER', () => this._confirm());
    keys?.on('keydown-ESC', () => this._back());
  }

  /**
   * @param {typeof PET_SELECT_ROSTER[number]} pet
   * @param {number} x
   * @param {number} y
   * @param {number} cardW
   * @param {number} cardH
   * @param {number} index
   */
  _addCard(pet, x, y, cardW, cardH, index) {
    const frame = this.add.rectangle(x, y, cardW, cardH, 0x24180f, 0.92);
    frame.setStrokeStyle(4, 0x8a7048);
    frame.setScrollFactor(0);
    frame.setDepth(3);
    frame.setInteractive({ useHandCursor: true });
    frame.setName(`pet-card-${pet.id}`);
    frame.on('pointerup', () => this._select(pet.id));

    // PIXELLAB_HOOK: existing catalog head. No new card texture.
    const head = addKitImage(this, x, y - 36, pet.headKey, { scale: 3, depth: 4 });
    if (!head) {
      const swatch = this.add.rectangle(x, y - 36, 96, 96, pet.swatch, 1);
      swatch.setStrokeStyle(3, 0xf6e7c2);
      swatch.setScrollFactor(0);
      swatch.setDepth(4);
    }

    addKitText(this, x, y + 78, pet.label, {
      font: FONT_HUD,
      size: 16,
      depth: 4,
    });
    addKitText(this, x, y + 108, pet.labelZh, {
      system: true,
      size: 16,
      color: '#f6e7c2',
      depth: 4,
    });
    addKitText(this, x - cardW / 2 + 22, y - cardH / 2 + 22, String(index + 1), {
      font: FONT_TINY,
      size: 16,
      depth: 4,
    });

    this.cards.push({ id: pet.id, frame });
  }

  /** @param {string} id */
  _select(id) {
    if (this._left || !isOpeningPetId(id)) return;
    this.audio?.playUiClick();
    this.pickedId = id;
    this._refresh();
  }

  _refresh() {
    const pet = PET_SELECT_ROSTER.find((row) => row.id === this.pickedId) || null;
    this.statusLabel?.setText?.(pet ? pet.label : 'PICK 1');
    for (const card of this.cards) {
      const on = card.id === this.pickedId;
      card.frame.setStrokeStyle(on ? 6 : 4, on ? 0xffe08a : 0x8a7048);
    }
  }

  _confirm() {
    if (this._left) return;
    if (!isOpeningPetId(this.pickedId)) {
      this.statusLabel?.setText?.('PICK 1');
      return;
    }
    const id = this.pickedId;
    const save = this.registry.get('saveManager');
    const saved = save?.setSelectedPetId?.(id);
    if (saved && saved.ok === false) return;
    const spriteKey = saved?.spriteKey || spriteKeyForPet(id);
    this.registry.set('selectedPetId', id);
    this.registry.set('selectedPetSpriteKey', spriteKey);
    this._left = true;
    this.audio?.playUiClick();
    /** @type {Record<string, unknown>} */
    const payload = {
      stage: this.stage,
      gold: this.gold,
      characterId: this.characterId,
      selectedPetId: id,
    };
    if (this.ownedWeapons) payload.ownedWeapons = this.ownedWeapons;
    if (this.upgrades) payload.upgrades = this.upgrades;
    // Confirm toast, then the stage. Buttons are already consumed (`_left`).
    // The banner does not take a hit target.
    const line = departLine(id);
    const toast = createNarrationToast(this, { y: this.scale.height / 2, style: 'banner' });
    const wait = line && toast.say('depart', line) ? toast.msUntilIdle() : 0;
    this.time.delayedCall(wait, () => {
      this.scene.start('StageScene', payload);
    });
  }

  _back() {
    if (this._left) return;
    this._left = true;
    this.audio?.playUiClick();
    this.scene.start('TitleScene');
  }
}
