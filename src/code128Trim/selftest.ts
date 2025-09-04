import image from '@ohos.multimedia.image';
import { dealWithCodel128, scanCore } from './trim';

async function createSyntheticBarcodePixelMap(
  totalWidth: number,
  height: number,
  leftMargin: number,
  rightMargin: number,
  barWidth: number
): Promise<image.PixelMap> {
  const pixelFormat = image.PixelMapFormat.RGBA_8888;
  const bytesPerPixel = 4;
  const bytes = new Uint8Array(totalWidth * height * bytesPerPixel);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < totalWidth; x++) {
      const i = (y * totalWidth + x) * bytesPerPixel;
      let isBlack = false;
      if (x >= leftMargin && x < totalWidth - rightMargin) {
        const relative = x - leftMargin;
        isBlack = Math.floor(relative / barWidth) % 2 === 0; // alternate bars
      }
      bytes[i + 0] = isBlack ? 0 : 255; // R
      bytes[i + 1] = isBlack ? 0 : 255; // G
      bytes[i + 2] = isBlack ? 0 : 255; // B
      bytes[i + 3] = 255; // A
    }
  }

  const pm = await image.createPixelMap(bytes.buffer, {
    size: { width: totalWidth, height },
    pixelFormat,
    editable: true,
  });
  return pm;
}

export async function runSelfTest(): Promise<void> {
  const totalWidth = 400;
  const height = 120;
  const leftMargin = 40;
  const rightMargin = 60;
  const barWidth = 3;

  const pixelMap = await createSyntheticBarcodePixelMap(
    totalWidth,
    height,
    leftMargin,
    rightMargin,
    barWidth
  );

  const processed = await dealWithCodel128(pixelMap, { scanType: scanCore.ScanType.CODE128_CODE });

  const info = await processed.getImageInfo();
  const expectedWidth = totalWidth - leftMargin - rightMargin;
  if (info.size.width !== expectedWidth || info.size.height !== height) {
    throw new Error(
      `SelfTest failed: got ${info.size.width}x${info.size.height}, expected ${expectedWidth}x${height}`
    );
  }
}

