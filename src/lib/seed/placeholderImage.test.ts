import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { generatePlaceholderPng } from "./placeholderImage";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

describe("generatePlaceholderPng", () => {
  it("produces a buffer starting with the real PNG signature", () => {
    const png = generatePlaceholderPng(
      64,
      48,
      { r: 10, g: 20, b: 30 },
      { r: 200, g: 180, b: 100 },
    );
    expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE);
  });

  it("encodes the requested width/height in the IHDR chunk", () => {
    const png = generatePlaceholderPng(
      300,
      150,
      { r: 1, g: 2, b: 3 },
      { r: 4, g: 5, b: 6 },
    );
    // IHDR chunk: 4 (length) + "IHDR" (4) immediately follows the signature;
    // its data is width(4)/height(4)/... big-endian.
    const ihdrData = png.subarray(16, 16 + 13);
    expect(ihdrData.readUInt32BE(0)).toBe(300);
    expect(ihdrData.readUInt32BE(4)).toBe(150);
  });

  it("is deterministic for the same inputs", () => {
    const a = generatePlaceholderPng(
      40,
      40,
      { r: 50, g: 60, b: 70 },
      { r: 10, g: 10, b: 10 },
    );
    const b = generatePlaceholderPng(
      40,
      40,
      { r: 50, g: 60, b: 70 },
      { r: 10, g: 10, b: 10 },
    );
    expect(a.equals(b)).toBe(true);
  });

  it("round-trips through inflate back to the exact raw pixel bytes it encoded", () => {
    const width = 10;
    const height = 10;
    const color = { r: 255, g: 0, b: 0 };
    const stripeColor = { r: 0, g: 255, b: 0 };
    const png = generatePlaceholderPng(width, height, color, stripeColor);

    // Locate and decompress the IDAT chunk's data (length-prefixed, right
    // after the 25-byte signature+IHDR-chunk header).
    const idatLength = png.readUInt32BE(33);
    const idatData = png.subarray(33 + 8, 33 + 8 + idatLength);
    const raw = inflateSync(idatData);

    const rowSize = 1 + width * 3;
    expect(raw.length).toBe(rowSize * height);
    // Row 0 is outside the stripe band (stripe starts at 60% of height) —
    // its first pixel should be the base color, filter byte 0.
    expect(raw[0]).toBe(0);
    expect(raw[1]).toBe(color.r);
    expect(raw[2]).toBe(color.g);
    expect(raw[3]).toBe(color.b);
  });
});
