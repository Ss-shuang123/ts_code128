"use strict";

// Core utilities to detect horizontal bounds of a barcode-like region and crop buffers.

/**
 * Compute horizontal crop bounds by scanning from both sides until columns that
 * contain enough black pixels are found.
 *
 * @param {ArrayBuffer} buffer - Raw pixel buffer (contiguous, width*height*BPP bytes)
 * @param {number} width - Image width in pixels
 * @param {number} height - Image height in pixels
 * @param {object} [options]
 * @param {number} [options.bytesPerPixel=4] - Bytes per pixel (supports 4)
 * @param {('RGBA'|'BGRA')} [options.pixelOrder='RGBA'] - Channel order in buffer
 * @param {number} [options.blackThreshold=64] - Luminance threshold (<= is black), range [0,255]
 * @param {number} [options.minCoverageRatio=0.02] - Minimum vertical coverage as ratio of height
 * @param {number} [options.sampleStep=1] - Row sampling step to speed scan
 * @returns {{ left: number, right: number }} Inclusive bounds. If not found, returns {left:0,right:width-1}
 */
function computeHorizontalBounds(buffer, width, height, options = {}) {
  const {
    bytesPerPixel = 4,
    pixelOrder = 'RGBA',
    blackThreshold = 64,
    minCoverageRatio = 0.02,
    sampleStep = 1,
  } = options;

  if (!(buffer instanceof ArrayBuffer)) {
    throw new TypeError('buffer must be an ArrayBuffer');
  }
  if (bytesPerPixel !== 4) {
    throw new Error('Only 4 bytes-per-pixel buffers (RGBA/BGRA) are supported');
  }
  if (width <= 0 || height <= 0) {
    return { left: 0, right: 0 };
  }

  const view = new Uint8Array(buffer);
  const minHits = Math.max(1, Math.floor(height * Math.max(0, Math.min(1, minCoverageRatio))));

  const isBlackAtIndex = (idx) => {
    let r, g, b, a;
    if (pixelOrder === 'BGRA') {
      b = view[idx];
      g = view[idx + 1];
      r = view[idx + 2];
      a = view[idx + 3];
    } else {
      // Default RGBA
      r = view[idx];
      g = view[idx + 1];
      b = view[idx + 2];
      a = view[idx + 3];
    }
    // Fast integer luminance approximation: (0.2126, 0.7152, 0.0722)
    const luminance = (54 * r + 183 * g + 19 * b) >> 8; // 54+183+19=256
    return a >= 16 && luminance <= blackThreshold;
  };

  // Scan from left
  let left = 0;
  for (; left < width; left++) {
    let hits = 0;
    for (let y = 0; y < height; y += sampleStep) {
      const idx = (y * width + left) * bytesPerPixel;
      if (isBlackAtIndex(idx)) {
        hits++;
        if (hits >= minHits) break;
      }
    }
    if (hits >= minHits) break;
  }

  // Scan from right
  let right = width - 1;
  for (; right >= left; right--) {
    let hits = 0;
    for (let y = 0; y < height; y += sampleStep) {
      const idx = (y * width + right) * bytesPerPixel;
      if (isBlackAtIndex(idx)) {
        hits++;
        if (hits >= minHits) break;
      }
    }
    if (hits >= minHits) break;
  }

  // If nothing found, return full width
  if (left >= width || right < 0 || right < left) {
    return { left: 0, right: width - 1 };
  }

  return { left, right };
}

/**
 * Copy a horizontal crop from the source buffer into a new tightly packed buffer.
 *
 * @param {ArrayBuffer} buffer - Source buffer
 * @param {number} width - Source width
 * @param {number} height - Source height
 * @param {number} left - Inclusive left bound
 * @param {number} right - Inclusive right bound
 * @param {object} [options]
 * @param {number} [options.bytesPerPixel=4]
 * @returns {{ buffer: ArrayBuffer, width: number, height: number }}
 */
function cropHorizontalBuffer(buffer, width, height, left, right, options = {}) {
  const { bytesPerPixel = 4 } = options;
  const src = new Uint8Array(buffer);
  const cropWidth = Math.max(0, right - left + 1);
  const out = new Uint8Array(cropWidth * height * bytesPerPixel);

  if (cropWidth === 0 || width === 0 || height === 0) {
    return { buffer: out.buffer, width: cropWidth, height };
  }

  for (let y = 0; y < height; y++) {
    const srcRowStart = (y * width + left) * bytesPerPixel;
    const dstRowStart = y * cropWidth * bytesPerPixel;
    out.set(
      src.subarray(srcRowStart, srcRowStart + cropWidth * bytesPerPixel),
      dstRowStart
    );
  }

  return { buffer: out.buffer, width: cropWidth, height };
}

module.exports = {
  computeHorizontalBounds,
  cropHorizontalBuffer,
  COLOR_ORDER: { RGBA: 'RGBA', BGRA: 'BGRA' },
};

