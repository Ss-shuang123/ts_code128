/*
 Code 128-B encoder and PixelMap renderer for HarmonyOS ArkTS (eTS)

 Exposes a single function `renderCode128BToPixelMap` returning image.PixelMap
 via @ohos.multimedia.image, using an in-memory RGBA_8888 buffer.
*/

import image from '@ohos.multimedia.image';

export type Code128RenderOptions = {
  moduleWidth?: number; // width of one module in px
  height?: number; // bar height in px
  quietZone?: number; // quiet zone width in modules on each side
  background?: { r: number; g: number; b: number; a?: number };
  barColor?: { r: number; g: number; b: number; a?: number };
  displayValue?: boolean; // not drawn in raster mode here (bars only)
};

const CODE128_PATTERNS: string[] = [
  "212222","222122","222221","121223","121322","131222","122213","122312","132212","221213",
  "221312","231212","112232","122132","122231","113222","123122","123221","223211","221132",
  "221231","213212","223112","312131","311222","321122","321221","312212","322112","322211",
  "212123","212321","232121","111323","131123","131321","112313","132113","132311","211313",
  "231113","231311","112133","112331","132131","113123","113321","133121","313121","211331",
  "231131","213113","213311","213131","311123","311321","331121","312113","312311","332111",
  "314111","221411","431111","111224","111422","121124","121421","141122","141221","112214",
  "112412","122114","122411","142112","142211","241211","221114","413111","241112","134111",
  "111242","121142","121241","114212","124112","124211","411212","421112","421211","212141",
  "214121","412121","111143","111341","131141","114113","114311","411113","411311","113141",
  "114131","311141","411131","211412","211214","211232","2331112"
];

const START_CODE_B = 104;
const STOP_CODE = 106;

function assertCodeSetBCompatible(text: string): void {
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 32 || code > 126) {
      throw new Error(`Character at index ${i} (U+${code.toString(16).toUpperCase()}) not supported by Code 128-B`);
    }
  }
}

function computeCodesForSetB(text: string): number[] {
  const codes: number[] = [START_CODE_B];
  for (let i = 0; i < text.length; i += 1) {
    const codeValue = text.charCodeAt(i) - 32; // 32..126 => 0..94
    codes.push(codeValue);
  }
  let checksum = START_CODE_B;
  for (let i = 0; i < text.length; i += 1) {
    checksum += (text.charCodeAt(i) - 32) * (i + 1);
  }
  checksum %= 103;
  codes.push(checksum);
  codes.push(STOP_CODE);
  return codes;
}

function codesToModules(codes: number[]): number[] {
  const modules: number[] = [];
  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code];
    if (!pattern) {
      throw new Error(`Pattern not found for code ${code}`);
    }
    for (let i = 0; i < pattern.length; i += 1) {
      modules.push(Number(pattern[i]));
    }
  }
  return modules;
}

export function encodeCode128BToModules(text: string): number[] {
  assertCodeSetBCompatible(text);
  return codesToModules(computeCodesForSetB(text));
}

function clampByte(n: number): number {
  if (n < 0) return 0;
  if (n > 255) return 255;
  return n | 0;
}

function fillRectRgba(
  buffer: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  g: number,
  b: number,
  a: number
): void {
  const x0 = Math.max(0, x);
  const y0 = Math.max(0, y);
  const x1 = Math.min(width, x + w);
  const y1 = Math.min(height, y + h);
  const rr = clampByte(r), gg = clampByte(g), bb = clampByte(b), aa = clampByte(a);
  for (let yy = y0; yy < y1; yy += 1) {
    let idx = (yy * width + x0) * 4;
    for (let xx = x0; xx < x1; xx += 1) {
      buffer[idx] = rr;
      buffer[idx + 1] = gg;
      buffer[idx + 2] = bb;
      buffer[idx + 3] = aa;
      idx += 4;
    }
  }
}

export async function renderCode128BToPixelMap(
  text: string,
  options: Code128RenderOptions = {}
): Promise<image.PixelMap> {
  const {
    moduleWidth = 2,
    height = 60,
    quietZone = 10,
    background = { r: 255, g: 255, b: 255, a: 255 },
    barColor = { r: 0, g: 0, b: 0, a: 255 },
  } = options;

  const modules = encodeCode128BToModules(text);
  const totalModules = modules.reduce((acc, m) => acc + m, 0) + quietZone * 2;
  const widthPx = totalModules * moduleWidth;
  const heightPx = height;

  const buffer = new Uint8Array(widthPx * heightPx * 4);
  // background
  fillRectRgba(
    buffer,
    widthPx,
    heightPx,
    0,
    0,
    widthPx,
    heightPx,
    background.r,
    background.g,
    background.b,
    background.a ?? 255
  );

  // draw bars
  let x = quietZone * moduleWidth;
  let isBar = true;
  for (const w of modules) {
    const wPx = w * moduleWidth;
    if (isBar) {
      fillRectRgba(
        buffer,
        widthPx,
        heightPx,
        x,
        0,
        wPx,
        heightPx,
        barColor.r,
        barColor.g,
        barColor.b,
        barColor.a ?? 255
      );
    }
    x += wPx;
    isBar = !isBar;
  }

  // Create PixelMap from raw RGBA buffer
  const opts: image.PixelMapFormat = {
    size: { width: widthPx, height: heightPx },
    pixelFormat: image.PixelFormat.RGBA_8888,
    editable: false,
    alphaType: image.AlphaType.PREMULTIPLIED
  } as unknown as image.PixelMapFormat; // typing guard for API variations

  // Some SDKs use image.createPixelMap(buffer, opts)
  // Others require wrapping ArrayBuffer
  const arrayBuf = buffer.buffer as ArrayBuffer;
  const pixelMap = await image.createPixelMap(arrayBuf, opts as any);
  return pixelMap;
}

