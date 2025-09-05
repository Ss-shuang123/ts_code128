/*
 * HarmonyOS ArkTS implementation for trimming CODE128 margins from a PixelMap.
 * Reads pixel data, detects non-white horizontal bounds, and returns a cropped PixelMap.
 */

// Import from HarmonyOS multimedia image module
// eslint-disable-next-line @typescript-eslint/no-var-requires
import image from '@ohos.multimedia.image';

type CreateOptionsLite = { scanType?: unknown } & Record<string, unknown>;

const RGBA = 'RGBA' as const;
const BGRA = 'BGRA' as const;
type PixelOrder = typeof RGBA | typeof BGRA;

interface Bounds {
  left: number;
  right: number;
}

function getPixelOrderFromFormat(fmt: number | undefined): PixelOrder {
  // Prefer BGRA when explicitly specified, default to RGBA otherwise
  // @ts-ignore: PixelMapFormat presence differs by SDK version
  if (fmt === image.PixelMapFormat?.BGRA_8888) return BGRA;
  return RGBA;
}

function toMaybePromise<T>(value: T | Promise<T>): Promise<T> {
  if (value && typeof (value as any).then === 'function') return value as Promise<T>;
  return Promise.resolve(value as T);
}

async function getImageInfoSafe(p: image.PixelMap): Promise<any> {
  // Some SDKs expose getImageInfo() sync; others async.
  // @ts-ignore
  const info = p.getImageInfo();
  return await toMaybePromise(info);
}

async function readPixelsToBufferSafe(p: image.PixelMap, byteCount: number): Promise<ArrayBuffer> {
  const buffer = new ArrayBuffer(byteCount);
  const maybeSync = (p as any).readPixelsToBufferSync;
  if (typeof maybeSync === 'function') {
    maybeSync.call(p, buffer);
    return buffer;
  }
  await p.readPixelsToBuffer(buffer);
  return buffer;
}

function computeHorizontalBounds(
  buffer: ArrayBuffer,
  width: number,
  height: number,
  options?: {
    bytesPerPixel?: number;
    pixelOrder?: PixelOrder;
    blackThreshold?: number;
    minCoverageRatio?: number;
    sampleStep?: number;
  }
): Bounds {
  const bytesPerPixel = options?.bytesPerPixel ?? 4;
  const pixelOrder = options?.pixelOrder ?? RGBA;
  const blackThreshold = options?.blackThreshold ?? 64;
  const minCoverageRatio = options?.minCoverageRatio ?? 0.02;
  const sampleStep = options?.sampleStep ?? 1;

  const view = new Uint8Array(buffer);
  const minHits = Math.max(1, Math.floor(height * Math.max(0, Math.min(1, minCoverageRatio))));

  const isBlackAtIndex = (idx: number): boolean => {
    let r: number, g: number, b: number, a: number;
    if (pixelOrder === BGRA) {
      b = view[idx];
      g = view[idx + 1];
      r = view[idx + 2];
      a = view[idx + 3];
    } else {
      r = view[idx];
      g = view[idx + 1];
      b = view[idx + 2];
      a = view[idx + 3];
    }
    const luminance = (54 * r + 183 * g + 19 * b) >> 8; // approx sRGB Y
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

  if (left >= width || right < 0 || right < left) {
    return { left: 0, right: width - 1 };
  }
  return { left, right };
}

async function cropPixelMapHorizontally(
  pixelMap: image.PixelMap,
  left: number,
  right: number,
  imageInfo: any
): Promise<image.PixelMap> {
  const width = imageInfo.size?.width ?? imageInfo.size?.height ?? 0; // fallback to avoid crash
  const height = imageInfo.size?.height ?? imageInfo.size?.width ?? 0;
  const cropWidth = Math.max(0, right - left + 1);

  // Prefer PixelMap native crop APIs if available, for speed and fidelity
  const cropRect = { x: left, y: 0, size: { width: cropWidth, height } } as any;
  const cropSync = (pixelMap as any).cropSync;
  if (typeof cropSync === 'function') {
    return cropSync.call(pixelMap, cropRect);
  }
  const createSub = (pixelMap as any).createSubPixelMap;
  if (typeof createSub === 'function') {
    return await createSub.call(pixelMap, { x: left, y: 0, width: cropWidth, height });
  }

  // Fallback: manual buffer crop and re-create PixelMap
  const bpp = 4;
  const totalBytes = (pixelMap as any).getPixelBytesNumber?.() ?? width * height * bpp;
  const srcBuffer = await readPixelsToBufferSafe(pixelMap, totalBytes);
  const cropped = cropHorizontalBuffer(srcBuffer, width, height, left, right, { bytesPerPixel: bpp });

  const fmt = imageInfo.pixelFormat;
  const newMap = await image.createPixelMap(cropped.buffer, {
    size: { width: cropped.width, height: cropped.height },
    // @ts-ignore
    pixelFormat: fmt ?? image.PixelMapFormat?.RGBA_8888,
    editable: true,
  } as any);
  return newMap;
}

function cropHorizontalBuffer(
  buffer: ArrayBuffer,
  width: number,
  height: number,
  left: number,
  right: number,
  options?: { bytesPerPixel?: number }
): { buffer: ArrayBuffer; width: number; height: number } {
  const bytesPerPixel = options?.bytesPerPixel ?? 4;
  const src = new Uint8Array(buffer);
  const cropWidth = Math.max(0, right - left + 1);
  const out = new Uint8Array(cropWidth * height * bytesPerPixel);

  if (cropWidth === 0 || width === 0 || height === 0) {
    return { buffer: out.buffer, width: cropWidth, height };
  }
  for (let y = 0; y < height; y++) {
    const srcRowStart = (y * width + left) * bytesPerPixel;
    const dstRowStart = y * cropWidth * bytesPerPixel;
    out.set(src.subarray(srcRowStart, srcRowStart + cropWidth * bytesPerPixel), dstRowStart);
  }
  return { buffer: out.buffer, width: cropWidth, height };
}

function shouldTrimForCode128(option: CreateOptionsLite | undefined): boolean {
  const val = option?.scanType;
  // Try to match common representations safely without failing if modules are absent
  // 1) enum constant via scanCore.ScanType.CODE128_CODE
  try {
    // @ts-ignore
    const enumVal = (globalThis as any)?.scanCore?.ScanType?.CODE128_CODE;
    if (enumVal !== undefined && val === enumVal) return true;
  } catch (_) {}
  // 2) string forms
  if (typeof val === 'string' && val.toUpperCase().includes('CODE128')) return true;
  if (typeof val === 'string' && val.toUpperCase().includes('CODE_128')) return true;
  return false;
}

export async function dealWithCodel128(
  pixelMap: image.PixelMap,
  option: CreateOptionsLite
): Promise<image.PixelMap> {
  if (!shouldTrimForCode128(option)) {
    return pixelMap;
  }

  const imageInfo = await getImageInfoSafe(pixelMap);
  const width = imageInfo.size?.width ?? 0;
  const height = imageInfo.size?.height ?? 0;
  if (width <= 0 || height <= 0) {
    return pixelMap;
  }

  // Determine pixel format and order
  const pixelOrder = getPixelOrderFromFormat(imageInfo.pixelFormat);
  const bytes = (pixelMap as any).getPixelBytesNumber?.() ?? width * height * 4;
  const buffer = await readPixelsToBufferSafe(pixelMap, bytes);

  // Detect bounds with conservative thresholds to ignore faint noise
  const { left, right } = computeHorizontalBounds(buffer, width, height, {
    bytesPerPixel: 4,
    pixelOrder,
    blackThreshold: 72, // slightly above default to be tolerant
    minCoverageRatio: 0.02, // at least 2% of rows
    sampleStep: 1,
  });

  // If full width, trimming is unnecessary
  if (left <= 0 && right >= width - 1) {
    return pixelMap;
  }

  const cropped = await cropPixelMapHorizontally(pixelMap, left, right, imageInfo);
  return cropped ?? pixelMap;
}

export default { dealWithCodel128 };

