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
 * True when any sampled world pixel is opaque on both bodies.
 * `alphaAt(frameX, frameY)` returns 0–255. Alpha above `minAlpha` counts
 * (default 0, so a single painted texel is enough).
 * @param {object} a
 * @param {object} b
 * @param {{ minAlpha?: number }} [opts]
 */
export function pixelBodiesTouch(a, b, opts = {}) {
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
  const minAlpha = Number.isFinite(opts.minAlpha) ? opts.minAlpha : 0;
  for (let y = top + step * 0.5; y < bottom; y += step) {
    for (let x = left + step * 0.5; x < right; x += step) {
      if (alphaWorld(a, x, y) > minAlpha && alphaWorld(b, x, y) > minAlpha) return true;
    }
  }
  return false;
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
