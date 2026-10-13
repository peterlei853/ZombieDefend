/** Tiny helpers for Title/Auth scenes — Architect-owned. */

import { FONT_INK, INK_TINT, addKitText, addParchmentButton } from './uiKit.js';

export function addTitle(scene, text, y = 56) {
  return addKitText(scene, 400, y, text, {
    font: FONT_INK,
    size: 32,
    tint: INK_TINT,
    color: '#e8eef5',
    scrollFactor: 0,
  });
}

export function addButton(scene, x, y, label, onClick, opts = {}) {
  return addParchmentButton(scene, x, y, label, onClick, {
    scale: opts.scale ?? 3,
    fontSize: opts.fontSize ?? 16,
    w: opts.w ?? 220,
    h: opts.h ?? 44,
    fill: opts.fill ?? 0x6b5344,
  });
}

export function addError(scene, y = 400) {
  return scene.add
    .text(400, y, '', { fontFamily: 'system-ui', fontSize: '14px', color: '#ef5350' })
    .setOrigin(0.5);
}

/**
 * HTML overlay inputs (Phaser canvas typing is awkward).
 * Removed on scene shutdown.
 */
export function mountInputs(scene, fields) {
  const host = document.getElementById('game-host') || document.body;
  host.style.position = host.style.position || 'relative';
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'position:absolute;left:50%;top:52%;transform:translate(-50%,-50%);display:flex;flex-direction:column;gap:10px;z-index:10;';
  const values = {};
  const els = {};
  for (const f of fields) {
    const input = document.createElement('input');
    input.placeholder = f.placeholder;
    input.type = f.type || 'text';
    input.maxLength = f.maxLength || 32;
    input.autocomplete = 'off';
    input.style.cssText =
      'width:240px;padding:10px 12px;border-radius:6px;border:1px solid #334;background:#121820;color:#e8eef5;font-size:16px;';
    wrap.appendChild(input);
    els[f.key] = input;
    values[f.key] = () => input.value.trim();
  }
  host.appendChild(wrap);
  const cleanup = () => {
    if (wrap.parentNode) wrap.remove();
  };
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);
  scene.events.once(Phaser.Scenes.Events.DESTROY, cleanup);
  return { values, els, cleanup };
}
