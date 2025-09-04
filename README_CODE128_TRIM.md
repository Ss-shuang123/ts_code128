## Code128 Margin Trimming for HarmonyOS PixelMap

This module provides a function to trim left/right white margins of Code128 barcodes by scanning for black pixels and cropping the `PixelMap` accordingly.

### API

- `dealWithCodel128(pixelMap, option): Promise<PixelMap>`
  - Only acts when `option.scanType === scanCore.ScanType.CODE128_CODE`.
  - Returns a new `PixelMap` cropped horizontally to remove leading/trailing white margins.

- `trimHorizontalMarginsByBlack(pixelMap, blackThreshold?): Promise<PixelMap>`
  - Generic helper using a luminance threshold (default 48).

### Self-test

Run `runSelfTest()` from `src/code128Trim/selftest.ts` inside a Harmony environment. It synthesizes a barcode-like image with left/right margins, runs the trimming, and asserts output width.

### Notes

- Pixel formats supported: `RGBA_8888`, `BGRA_8888`, `ARGB_8888`. Others default to RGBA interpretation.
- Threshold may need tuning if the barcode is not pure black.

