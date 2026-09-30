/** Tiny helpers for Title/Auth scenes — Architect-owned. */

export function addTitle(scene, text, y = 56) {
  return scene.add
    .text(400, y, text, { fontFamily: 'system-ui', fontSize: '28px', color: '#e8eef5' })
    .setOrigin(0.5);
}

export function addButton(scene, x, y, label, onClick, opts = {}) {
  const w = opts.w ?? 220;
  const h = opts.h ?? 44;
  const fill = opts.fill ?? 0x1e88e5;
  const hover = opts.hover ?? 0x42a5f5;
  const bg = scene.add.rectangle(x, y, w, h, fill).setInteractive({ useHandCursor: true });
  const txt = scene.add
    .text(x, y, label, { fontFamily: 'system-ui', fontSize: '18px', color: '#ffffff' })
    .setOrigin(0.5);
  bg.on('pointerover', () => bg.setFillStyle(hover));
  bg.on('pointerout', () => bg.setFillStyle(fill));
  bg.on('pointerup', onClick);
  return { bg, txt };
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
