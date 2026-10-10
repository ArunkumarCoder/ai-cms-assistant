import { deflateSync } from "node:zlib";
import { crc32 } from "node:zlib";

// "Free-to-use or generated placeholder images; no copyrighted assets" (Day
// 36 task) — rather than depend on an external stock-photo host (another
// network dependency the seed script would need to be reliable, and another
// license to track), these are generated from nothing: a solid color field
// with a contrasting stripe, hand-encoded as a real PNG using only Node's
// built-in `zlib` for the DEFLATE compression PNG's IDAT chunk requires. No
// image library, no external asset, fully deterministic for the same
// inputs — same spirit as `node:crypto`-based password hashing elsewhere in
// this codebase: reach for what's already in Node before adding a
// dependency for something this small.
export interface PlaceholderColor {
  r: number;
  g: number;
  b: number;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData) >>> 0, 0);
  return Buffer.concat([length, typeAndData, crc]);
}

// A plain solid-color field with one contrasting horizontal stripe (so two
// placeholders generated with swapped `color`/`stripeColor` are visibly
// distinguishable from each other at a glance, not just identical gray
// boxes) — enough for a demo screenshot to not look like a broken-image
// icon, nothing more elaborate than that is needed here.
export function generatePlaceholderPng(
  width: number,
  height: number,
  color: PlaceholderColor,
  stripeColor: PlaceholderColor,
): Buffer {
  const stripeStart = Math.floor(height * 0.6);
  const stripeEnd = Math.floor(height * 0.75);

  const rowSize = 1 + width * 3; // filter-type byte + RGB per pixel
  const raw = Buffer.alloc(rowSize * height);
  for (let y = 0; y < height; y++) {
    const rowOffset = y * rowSize;
    raw[rowOffset] = 0; // filter type "None"
    const useStripe = y >= stripeStart && y < stripeEnd;
    const c = useStripe ? stripeColor : color;
    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 3;
      raw[pixelOffset] = c.r;
      raw[pixelOffset + 1] = c.g;
      raw[pixelOffset + 2] = c.b;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor (RGB)
  ihdr[10] = 0; // compression method
  ihdr[11] = 0; // filter method
  ihdr[12] = 0; // interlace method

  const signature = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  ]);
  return Buffer.concat([
    signature,
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}
