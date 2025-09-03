/*
 Code 128 (Code Set B) minimal encoder and SVG renderer in TypeScript

 - Supports printable ASCII (32..126)
 - Computes modulo-103 checksum
 - Renders bars to SVG with configurable module width, height, and quiet zone
*/

export type Code128RenderOptions = {
  moduleWidth?: number; // width of one module in px
  height?: number; // bar height in px
  quietZone?: number; // quiet zone width in modules on each side
  background?: string; // SVG background fill
  barColor?: string; // bar color
  displayValue?: boolean; // render human-readable text
  fontFamily?: string;
  fontSize?: number; // in px
  textMargin?: number; // space between bars and text in px
};

// Patterns table: 107 entries (0..106). Each is a sequence of 6 (or 7 for STOP) module widths
// Source: Commonly used Code 128 patterns table, where STOP code (106) is "2331112"
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
  // Start with Start B code
  const codes: number[] = [START_CODE_B];
  for (let i = 0; i < text.length; i += 1) {
    const codeValue = text.charCodeAt(i) - 32; // 32..126 => 0..94
    codes.push(codeValue);
  }
  // Compute checksum
  let checksum = START_CODE_B;
  for (let i = 0; i < text.length; i += 1) {
    checksum += (text.charCodeAt(i) - 32) * (i + 1);
  }
  checksum %= 103;
  codes.push(checksum);
  // Append stop
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
  const codes = computeCodesForSetB(text);
  return codesToModules(codes);
}

export function renderCode128BToSvg(text: string, options: Code128RenderOptions = {}): string {
  const {
    moduleWidth = 2,
    height = 60,
    quietZone = 10,
    background = "#ffffff",
    barColor = "#000000",
    displayValue = false,
    fontFamily = "monospace",
    fontSize = 14,
    textMargin = 4,
  } = options;

  const modules = encodeCode128BToModules(text);

  const totalModules = modules.reduce((acc, m) => acc + m, 0) + quietZone * 2; // quiet zone is spaces, not bars
  const barsHeight = displayValue ? Math.max(0, height - fontSize - textMargin) : height;
  const widthPx = totalModules * moduleWidth;
  const heightPx = height;

  let x = quietZone * moduleWidth; // start after quiet zone
  let isBar = true; // patterns start with a bar

  let svgBars = "";
  for (const w of modules) {
    const wPx = w * moduleWidth;
    if (isBar) {
      svgBars += `<rect x="${x}" y="0" width="${wPx}" height="${barsHeight}" fill="${barColor}"/>`;
    }
    x += wPx;
    isBar = !isBar;
  }

  let svgText = "";
  if (displayValue) {
    const textY = barsHeight + textMargin + fontSize * 0.8; // approximate baseline
    const textX = widthPx / 2;
    const escaped = escapeXml(text);
    svgText = `<text x="${textX}" y="${textY}" text-anchor="middle" font-family="${escapeXml(fontFamily)}" font-size="${fontSize}">${escaped}</text>`;
  }

  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${widthPx}" height="${heightPx}" viewBox="0 0 ${widthPx} ${heightPx}" shape-rendering="crispEdges">` +
    `<rect x="0" y="0" width="100%" height="100%" fill="${background}"/>` +
    `${svgBars}${svgText}</svg>`;

  return svg;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

