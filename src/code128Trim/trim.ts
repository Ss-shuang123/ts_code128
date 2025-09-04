/*
 * Code128 margin trimming utilities for HarmonyOS PixelMap
 */

import image from '@ohos.multimedia.image';

// Minimal types to avoid leaking external dependencies at compile time
// Adjust imports/types in your project if you already have them defined elsewhere
// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace scanCore {
  export enum ScanType {
    CODE128_CODE = 104,
  }
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export namespace generateBarcode {
  export interface CreateOptions {
    scanType: number;
  }
}

type ChannelOffsets = {
  redOffset: number;
  greenOffset: number;
  blueOffset: number;
  alphaOffset: number;
  bytesPerPixel: number;
};

function getChannelOffsets(pixelFormat: number): ChannelOffsets {
  // Default to RGBA_8888 if unknown; supported formats handled explicitly
  switch (pixelFormat) {
    case image.PixelMapFormat.RGBA_8888:
      return { redOffset: 0, greenOffset: 1, blueOffset: 2, alphaOffset: 3, bytesPerPixel: 4 };
    case image.PixelMapFormat.BGRA_8888:
      return { redOffset: 2, greenOffset: 1, blueOffset: 0, alphaOffset: 3, bytesPerPixel: 4 };
    case image.PixelMapFormat.ARGB_8888:
      return { redOffset: 1, greenOffset: 2, blueOffset: 3, alphaOffset: 0, bytesPerPixel: 4 };
    default:
      // Fall back to RGBA_8888 interpretation
      return { redOffset: 0, greenOffset: 1, blueOffset: 2, alphaOffset: 3, bytesPerPixel: 4 };
  }
}

function isBlackPixel(
  pixelBytes: Uint8Array,
  indexBase: number,
  offsets: ChannelOffsets,
  blackThreshold: number
): boolean {
  const red = pixelBytes[indexBase + offsets.redOffset];
  const green = pixelBytes[indexBase + offsets.greenOffset];
  const blue = pixelBytes[indexBase + offsets.blueOffset];
  const luminance = (red + green + blue) / 3;
  return luminance <= blackThreshold;
}

function scanEffectiveHorizontalBounds(
  pixelBytes: Uint8Array,
  width: number,
  height: number,
  offsets: ChannelOffsets,
  blackThreshold: number
): { left: number; right: number } | null {
  let left = -1;
  let right = -1;

  for (let x = 0; x < width; x++) {
    let hasBlack = false;
    for (let y = 0; y < height; y++) {
      const index = (y * width + x) * offsets.bytesPerPixel;
      if (isBlackPixel(pixelBytes, index, offsets, blackThreshold)) {
        hasBlack = true;
        break;
      }
    }
    if (hasBlack) {
      left = x;
      break;
    }
  }

  for (let x = width - 1; x >= 0; x--) {
    let hasBlack = false;
    for (let y = 0; y < height; y++) {
      const index = (y * width + x) * offsets.bytesPerPixel;
      if (isBlackPixel(pixelBytes, index, offsets, blackThreshold)) {
        hasBlack = true;
        break;
      }
    }
    if (hasBlack) {
      right = x;
      break;
    }
  }

  if (left < 0 || right < 0 || right < left) {
    return null;
  }
  return { left, right };
}

async function readPixelBytes(pm: image.PixelMap): Promise<{
  bytes: Uint8Array;
  width: number;
  height: number;
  pixelFormat: number;
}> {
  const info = await pm.getImageInfo();
  const width = info.size.width;
  const height = info.size.height;
  const byteCount = pm.getPixelBytesNumber();
  const buffer = new ArrayBuffer(byteCount);
  await pm.readPixelsToBuffer(buffer);
  const bytes = new Uint8Array(buffer);
  const pixelFormat = info.pixelFormat ?? image.PixelMapFormat.RGBA_8888;
  return { bytes, width, height, pixelFormat };
}

async function createPixelMap(
  bytes: Uint8Array,
  width: number,
  height: number,
  pixelFormat: number
): Promise<image.PixelMap> {
  const buffer = bytes.buffer.byteLength === bytes.byteLength && bytes.byteOffset === 0
    ? bytes.buffer
    : bytes.slice().buffer;

  return await image.createPixelMap(buffer, {
    size: { width, height },
    pixelFormat: pixelFormat,
    editable: true,
  });
}

export async function dealWithCodel128(
  pixelMap: image.PixelMap,
  option: generateBarcode.CreateOptions
): Promise<image.PixelMap> {
  if (option?.scanType !== scanCore.ScanType.CODE128_CODE) {
    return pixelMap;
  }

  const { bytes, width, height, pixelFormat } = await readPixelBytes(pixelMap);
  const offsets = getChannelOffsets(pixelFormat);

  const bounds = scanEffectiveHorizontalBounds(bytes, width, height, offsets, 48);
  if (!bounds) {
    return pixelMap;
  }

  const newWidth = bounds.right - bounds.left + 1;
  if (newWidth <= 0 || newWidth === width) {
    return pixelMap;
  }

  const cropped = new Uint8Array(newWidth * height * offsets.bytesPerPixel);
  for (let y = 0; y < height; y++) {
    const srcRowStart = (y * width + bounds.left) * offsets.bytesPerPixel;
    const dstRowStart = (y * newWidth) * offsets.bytesPerPixel;
    const rowLength = newWidth * offsets.bytesPerPixel;
    cropped.set(bytes.subarray(srcRowStart, srcRowStart + rowLength), dstRowStart);
  }

  const newPm = await createPixelMap(cropped, newWidth, height, pixelFormat);
  return newPm;
}

export async function trimHorizontalMarginsByBlack(
  pixelMap: image.PixelMap,
  blackThreshold: number = 48
): Promise<image.PixelMap> {
  const { bytes, width, height, pixelFormat } = await readPixelBytes(pixelMap);
  const offsets = getChannelOffsets(pixelFormat);
  const bounds = scanEffectiveHorizontalBounds(bytes, width, height, offsets, blackThreshold);
  if (!bounds) {
    return pixelMap;
  }
  const newWidth = bounds.right - bounds.left + 1;
  if (newWidth <= 0 || newWidth === width) {
    return pixelMap;
  }
  const cropped = new Uint8Array(newWidth * height * offsets.bytesPerPixel);
  for (let y = 0; y < height; y++) {
    const srcRowStart = (y * width + bounds.left) * offsets.bytesPerPixel;
    const dstRowStart = (y * newWidth) * offsets.bytesPerPixel;
    const rowLength = newWidth * offsets.bytesPerPixel;
    cropped.set(bytes.subarray(srcRowStart, srcRowStart + rowLength), dstRowStart);
  }
  return await createPixelMap(cropped, newWidth, height, pixelFormat);
}

