/**
 * Alpha overlap of two sprites in world space.
 * A hit is an opaque texel of each body on the same world pixel.
 * Bounding boxes and distances do not count.
 */

/**
 * World rectangle of a display whose origin sits at (x, y).
 * @param {{ x: number, y: number, originX?: number, originY?: number, displayWidth: number, displayHeight: number }} body
 */
export function displayBounds(body) {
  const width = Math.abs(Number(body?.displayWidth) || 0);
  const height = Math.abs(Number(body?.displayHeight) || 0);
  const originX = Number.isFinite(body?.originX) ? body.originX : 0.5;
  const originY = Number.isFinite(body?.originY) ? body.originY : 0.5;
  const left = Number(body?.x) - originX * width;
  const top = Number(body?.y) - originY * height;
  return { left, top, right: left + width, bottom: top + height, width, height };
}

/**
 * @param {{ displayWidth: number, displayHeight: number, frameWidth: number, frameHeight: number }} body
 */
function worldTexel(body) {
  const sx = body.displayWidth / body.frameWidth;
  const sy = body.displayHeight / body.frameHeight;
  if (!(sx > 0) || !(sy > 0)) return 0;
  return Math.min(sx, sy);
}

/**
 * @param {object} body
 * @param {number} wx
 * @param {number} wy
 */
function alphaWorld(body, wx, wy) {
  const bounds = displayBounds(body);
  if (!(bounds.width > 0) || !(bounds.height > 0)) return 0;
  let u = (wx - bounds.left) / bounds.width;
  let v = (wy - bounds.top) / bounds.height;
  if (u < 0 || v < 0 || u >= 1 || v >= 1) return 0;
  let ix = Math.floor(u * body.frameWidth);
  let iy = Math.floor(v * body.frameHeight);
  if (body.flipX) ix = body.frameWidth - 1 - ix;
  if (body.flipY) iy = body.frameHeight - 1 - iy;
  if (ix < 0 || iy < 0 || ix >= body.frameWidth || iy >= body.frameHeight) return 0;
  const alpha = body.alphaAt(ix, iy);
  return Number.isFinite(alpha) ? alpha : 0;
}

/**
 * Walk world samples where the two boxes overlap.
 * `visit(x, y)` runs on each sample that is opaque on both bodies.
 * Return true from `visit` to stop. The function itself returns true
 * when a visit asked to stop.
 * @param {object} a
 * @param {object} b
 * @param {{ minAlpha?: number }} [opts]
 * @param {(x: number, y: number) => boolean|void} visit
 */
function eachOpaqueOverlap(a, b, opts, visit) {
  if (!a || !b || typeof a.alphaAt !== 'function' || typeof b.alphaAt !== 'function') return false;
  if (!(a.frameWidth > 0) || !(a.frameHeight > 0) || !(b.frameWidth > 0) || !(b.frameHeight > 0)) return false;
  const leftBox = displayBounds(a);
  const rightBox = displayBounds(b);
  const left = Math.max(leftBox.left, rightBox.left);
  const right = Math.min(leftBox.right, rightBox.right);
  const top = Math.max(leftBox.top, rightBox.top);
  const bottom = Math.min(leftBox.bottom, rightBox.bottom);
  if (!(right > left) || !(bottom > top)) return false;
  const texel = Math.min(worldTexel(a), worldTexel(b));
  const step = Math.min(1, texel);
  if (!(step > 0)) return false;
  const minAlpha = Number.isFinite(opts?.minAlpha) ? opts.minAlpha : 0;
  for (let y = top + step * 0.5; y < bottom; y += step) {
    for (let x = left + step * 0.5; x < right; x += step) {
      if (alphaWorld(a, x, y) > minAlpha && alphaWorld(b, x, y) > minAlpha) {
        if (visit(x, y) === true) return true;
      }
    }
  }
  return false;
}

/**
 * True when any sampled world pixel is opaque on both bodies.
 * `alphaAt(frameX, frameY)` returns 0–255. Alpha above `minAlpha` counts
 * (default 0, so a single painted texel is enough).
 * @param {object} a
 * @param {object} b
 * @param {{ minAlpha?: number }} [opts]
 */
export function pixelBodiesTouch(a, b, opts = {}) {
  return eachOpaqueOverlap(a, b, opts, () => true);
}

/**
 * World point of the opaque overlap, or null when the bodies miss.
 * The point is the centroid of the shared samples, which on the first
 * touching frame is the contact sliver.
 * @param {object} a
 * @param {object} b
 * @param {{ minAlpha?: number }} [opts]
 * @returns {{ x: number, y: number }|null}
 */
export function pixelBodiesTouchPoint(a, b, opts = {}) {
  let sx = 0;
  let sy = 0;
  let n = 0;
  eachOpaqueOverlap(a, b, opts, (x, y) => {
    sx += x;
    sy += y;
    n += 1;
    return false;
  });
  if (!n) return null;
  return { x: sx / n, y: sy / n };
}

/** @type {WeakMap<object, ImageData|null>} */
const sourceAlpha = new WeakMap();

/**
 * One read of the texture source. Later frames sample this buffer.
 * @param {Phaser.Textures.Texture|null|undefined} texture
 * @returns {ImageData|null}
 */
function textureImageData(texture) {
  const source = texture?.source?.[0];
  if (!source) return null;
  if (sourceAlpha.has(source)) return sourceAlpha.get(source) || null;
  const image = source.image;
  if (!image || !(image.width > 0) || !(image.height > 0) || typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    sourceAlpha.set(source, data);
    return data;
  } catch (_) {
    sourceAlpha.set(source, null);
    return null;
  }
}

/**
 * Alpha reader for one texture frame at the sprite's current pose, or null
 * when that frame cannot be sampled. A filled shape with no frame is opaque
 * across its box.
 * @param {Phaser.GameObjects.Sprite|Phaser.GameObjects.Image|Phaser.GameObjects.Rectangle|null|undefined} sprite
 * @param {Phaser.Textures.Frame|null|undefined} [frame]
 */
function pixelBodyFromFrame(sprite, frame) {
  if (!sprite || sprite.active === false) return null;
  const displayWidth = Math.abs(Number(sprite.displayWidth) || Number(sprite.width) || 0);
  const displayHeight = Math.abs(Number(sprite.displayHeight) || Number(sprite.height) || 0);
  if (!(displayWidth > 0) || !(displayHeight > 0)) return null;
  if (!Number.isFinite(sprite.x) || !Number.isFinite(sprite.y)) return null;
  const frameWidth = frame?.realWidth || frame?.width || frame?.cutWidth;
  const frameHeight = frame?.realHeight || frame?.height || frame?.cutHeight;
  /** @type {((fx: number, fy: number) => number)|null} */
  let alphaAt = null;
  let fw = frameWidth;
  let fh = frameHeight;
  if (fw > 0 && fh > 0) {
    const data = textureImageData(sprite.texture);
    if (!data) return null;
    const cutX = Number.isFinite(frame.cutX) ? frame.cutX : (Number(frame.x) || 0);
    const cutY = Number.isFinite(frame.cutY) ? frame.cutY : (Number(frame.y) || 0);
    const fullW = data.width;
    const bytes = data.data;
    alphaAt = (fx, fy) => {
      if (fx < 0 || fy < 0 || fx >= fw || fy >= fh) return 0;
      const sx = cutX + fx;
      const sy = cutY + fy;
      if (sx < 0 || sy < 0 || sx >= fullW || sy >= data.height) return 0;
      return bytes[(sy * fullW + sx) * 4 + 3] || 0;
    };
  } else if (!frame && (typeof sprite.setFillStyle === 'function' || typeof sprite.fillColor === 'number')) {
    fw = Math.max(1, Math.round(displayWidth));
    fh = Math.max(1, Math.round(displayHeight));
    alphaAt = () => 255;
  }
  if (!alphaAt) return null;
  return {
    x: sprite.x,
    y: sprite.y,
    originX: Number.isFinite(sprite.originX) ? sprite.originX : 0.5,
    originY: Number.isFinite(sprite.originY) ? sprite.originY : 0.5,
    displayWidth,
    displayHeight,
    flipX: !!sprite.flipX,
    flipY: !!sprite.flipY,
    frameWidth: fw,
    frameHeight: fh,
    alphaAt,
  };
}

/**
 * Alpha reader for the sprite's current frame, or null when the texture
 * cannot be sampled. A filled shape with no frame is opaque across its box.
 * @param {Phaser.GameObjects.Sprite|Phaser.GameObjects.Image|Phaser.GameObjects.Rectangle|null|undefined} sprite
 */
export function pixelBodyFromSprite(sprite) {
  return pixelBodyFromFrame(sprite, sprite?.frame);
}

/**
 * Cells of the playing strip. The base texture is not a cell.
 * @param {Phaser.GameObjects.Sprite|null|undefined} sprite
 * @returns {Phaser.Textures.Frame[]}
 */
function animFramesOf(sprite) {
  const list = sprite?.anims?.currentAnim?.frames;
  if (Array.isArray(list) && list.length) {
    const frames = [];
    for (const item of list) {
      if (item?.frame) frames.push(item.frame);
    }
    if (frames.length) return frames;
  }
  return sprite?.frame ? [sprite.frame] : [];
}

/**
 * True when the current frames share an opaque world pixel.
 * @param {Phaser.GameObjects.GameObject|null|undefined} a
 * @param {Phaser.GameObjects.GameObject|null|undefined} b
 */
export function spritesTouch(a, b) {
  const left = pixelBodyFromSprite(a);
  const right = pixelBodyFromSprite(b);
  if (!left || !right) return false;
  return pixelBodiesTouch(left, right);
}

/**
 * World point where the current frames share opaque pixels, or null.
 * Uses the pose on screen (origin, scale, flip, current frame).
 * @param {Phaser.GameObjects.GameObject|null|undefined} a
 * @param {Phaser.GameObjects.GameObject|null|undefined} b
 * @returns {{ x: number, y: number }|null}
 */
export function spritesTouchPoint(a, b) {
  const left = pixelBodyFromSprite(a);
  const right = pixelBodyFromSprite(b);
  if (!left || !right) return null;
  return pixelBodiesTouchPoint(left, right);
}

/** @type {WeakMap<object, { minX: number, minY: number, maxX: number, maxY: number }|null>} */
const frameOpaqueBox = new WeakMap();

/**
 * Inclusive frame-pixel box of alpha > 0, or null when the frame is empty.
 * @param {object} body
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number }|null}
 */
function scanOpaqueBox(body) {
  let minX = body.frameWidth;
  let minY = body.frameHeight;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < body.frameHeight; y++) {
    for (let x = 0; x < body.frameWidth; x++) {
      if (body.alphaAt(x, y) > 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, maxX, maxY };
}

/**
 * World AABB of the opaque pixels, or null when the sprite cannot be read.
 * @param {Phaser.GameObjects.GameObject|null|undefined} sprite
 * @returns {{ left: number, right: number, top: number, bottom: number }|null}
 */
export function opaqueWorldRect(sprite) {
  const body = pixelBodyFromSprite(sprite);
  if (!body) return null;
  const frame = sprite?.frame;
  let box = frame && frameOpaqueBox.has(frame) ? frameOpaqueBox.get(frame) : null;
  if (!box && !(frame && frameOpaqueBox.has(frame))) {
    box = scanOpaqueBox(body);
    if (frame) frameOpaqueBox.set(frame, box);
  }
  if (!box) return null;
  const bounds = displayBounds(body);
  const mapX = (fx) => {
    let u = (fx + 0.5) / body.frameWidth;
    if (body.flipX) u = 1 - u;
    return bounds.left + u * bounds.width;
  };
  const mapY = (fy) => {
    let v = (fy + 0.5) / body.frameHeight;
    if (body.flipY) v = 1 - v;
    return bounds.top + v * bounds.height;
  };
  const xs = [mapX(box.minX), mapX(box.maxX)];
  const ys = [mapY(box.minY), mapY(box.maxY)];
  return {
    left: Math.min(xs[0], xs[1]),
    right: Math.max(xs[0], xs[1]),
    top: Math.min(ys[0], ys[1]),
    bottom: Math.max(ys[0], ys[1]),
  };
}

/**
 * @param {{ left: number, right: number, top: number, bottom: number }} rect
 * @param {{ x: number, y: number }} point
 */
function clampToRect(rect, point) {
  return {
    x: Math.min(rect.right, Math.max(rect.left, point.x)),
    y: Math.min(rect.bottom, Math.max(rect.top, point.y)),
  };
}

/**
 * @param {{ left: number, right: number, top: number, bottom: number }} a
 * @param {{ left: number, right: number, top: number, bottom: number }} b
 */
function rectsOverlap(a, b) {
  return a.right >= b.left && a.left <= b.right && a.bottom >= b.top && a.top <= b.bottom;
}

/**
 * @param {number} x
 * @param {number} y
 * @param {{ left: number, right: number, top: number, bottom: number }} rect
 */
function pointInRect(x, y, rect) {
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

/**
 * First point where the segment enters `rect`, or null.
 * @param {number} x0
 * @param {number} y0
 * @param {number} x1
 * @param {number} y1
 * @param {{ left: number, right: number, top: number, bottom: number }} rect
 * @returns {{ x: number, y: number }|null}
 */
function segmentEnter(x0, y0, x1, y1, rect) {
  if (pointInRect(x1, y1, rect)) return { x: x1, y: y1 };
  if (pointInRect(x0, y0, rect)) return clampToRect(rect, { x: x1, y: y1 });
  const dist = Math.hypot(x1 - x0, y1 - y0);
  const steps = Math.max(1, Math.ceil(dist / 4));
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t;
    if (pointInRect(x, y, rect)) return { x, y };
  }
  return null;
}

/**
 * Opaque-pixel contact, or the point where this step's opaque core
 * actually crosses `b`'s opaque box. A near miss stays null — steering
 * the shot onto the body is the caller's job.
 * @param {Phaser.GameObjects.GameObject|null|undefined} a
 * @param {Phaser.GameObjects.GameObject|null|undefined} b
 * @param {{ x?: number, y?: number }|null} [from]
 * @returns {{ x: number, y: number }|null}
 */
export function spriteSweepContact(a, b, from = null) {
  const left = pixelBodyFromSprite(a);
  const right = pixelBodyFromSprite(b);
  if (left && right) {
    const exact = pixelBodiesTouchPoint(left, right);
    if (exact) return exact;
  }
  const blob = opaqueWorldRect(a);
  const body = opaqueWorldRect(b);
  if (!blob || !body) return null;
  const cur = { x: (blob.left + blob.right) / 2, y: (blob.top + blob.bottom) / 2 };
  const hw = (blob.right - blob.left) / 2;
  const hh = (blob.bottom - blob.top) / 2;
  const reach = {
    left: body.left - hw,
    right: body.right + hw,
    top: body.top - hh,
    bottom: body.bottom + hh,
  };
  if (rectsOverlap(blob, body)) return clampToRect(body, cur);
  if (!Number.isFinite(from?.x) || !Number.isFinite(from?.y)) return null;
  const crossed = segmentEnter(from.x, from.y, cur.x, cur.y, reach);
  if (!crossed) return null;
  return clampToRect(body, crossed);
}

/**
 * True when any cell of `a`'s playing strip shares an opaque world pixel
 * with `b`'s current frame. The pose is `a`'s current origin, scale, and
 * flip. Used by the brute shock: catalog frame 13 often shows a cell
 * before the lobe's widest cells, and those wider cells sit on the same anchor.
 * @param {Phaser.GameObjects.GameObject|null|undefined} a
 * @param {Phaser.GameObjects.GameObject|null|undefined} b
 */
export function spritesTouchAnyFrame(a, b) {
  const right = pixelBodyFromSprite(b);
  if (!right) return false;
  for (const frame of animFramesOf(a)) {
    const left = pixelBodyFromFrame(a, frame);
    if (left && pixelBodiesTouch(left, right)) return true;
  }
  return false;
}
