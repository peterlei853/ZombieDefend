import { PLAYABLE_STAGE_CAP, STAGE_COUNT } from '../data/stageRoster.js';

/** ui-dialog-panel is 512×288. This is the tan fill inside the stone frame. */
const DIALOG_PANEL = { w: 512, h: 288 };
const PARCHMENT_FILL = { l: 124, t: 144, r: 388, b: 248 };
const STAGE_BUTTON_SCALE = 0.62;

/**
 * Stage buttons for the title card. Stages inside PLAYABLE_STAGE_CAP are
 * live: full alpha, no SOON. The row is centered on the parchment fill so
 * stage 5 is the same kind of button as stage 1.
 * @param {number} width
 * @param {number} height
 */
export function titleStageButtonFrames(width, height) {
  const cardY = Math.round(height * 0.66);
  const panelLeft = width / 2 - DIALOG_PANEL.w / 2;
  const panelTop = cardY - DIALOG_PANEL.h / 2;
  const inner = {
    l: panelLeft + PARCHMENT_FILL.l,
    r: panelLeft + PARCHMENT_FILL.r,
    t: panelTop + PARCHMENT_FILL.t,
    b: panelTop + PARCHMENT_FILL.b,
  };
  const btnW = 73 * STAGE_BUTTON_SCALE;
  const btnH = 33 * STAGE_BUTTON_SCALE;
  const gap = 4;
  const rowW = STAGE_COUNT * btnW + (STAGE_COUNT - 1) * gap;
  let x = (inner.l + inner.r) / 2 - rowW / 2 + btnW / 2;
  const y = inner.t + 28;
  /** @type {{ stage: number, x: number, y: number, w: number, h: number, scale: number, gated: boolean }[]} */
  const frames = [];
  for (let stage = 1; stage <= STAGE_COUNT; stage += 1) {
    frames.push({
      stage,
      x,
      y,
      w: btnW,
      h: btnH,
      scale: STAGE_BUTTON_SCALE,
      gated: stage > PLAYABLE_STAGE_CAP,
    });
    x += btnW + gap;
  }
  return { frames, inner };
}
