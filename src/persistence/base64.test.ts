/**
 * The base64 codec. Phase-07a, `SAVE_FORMAT.md` §2.1 (grid arrays are base64
 * typed arrays).
 *
 * Hand-rolled because `src/persistence` compiles against pure ES2022 — no
 * `Buffer`, no `btoa` (`tsconfig.sim.json`, ARCHITECTURE.md §2.1). The codec
 * must be byte-stable (same bytes → same text, always) and exact in both
 * directions; 32-bit words are explicitly little-endian so the document never
 * depends on platform byte order.
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { decodeBytes, decodeUint32, encodeBytes, encodeUint32 } from './base64';

describe('encodeBytes / decodeBytes', () => {
  it('round-trips the RFC 4648 test vectors', () => {
    const cases: readonly (readonly [string, string])[] = [
      ['', ''],
      ['f', 'Zg=='],
      ['fo', 'Zm8='],
      ['foo', 'Zm9v'],
      ['foob', 'Zm9vYg=='],
      ['fooba', 'Zm9vYmE='],
      ['foobar', 'Zm9vYmFy'],
    ];
    for (const [plain, encoded] of cases) {
      const bytes = Uint8Array.from([...plain].map((c) => c.charCodeAt(0)));
      expect(encodeBytes(bytes)).toBe(encoded);
      expect([...decodeBytes(encoded)]).toEqual([...bytes]);
    }
  });

  it('round-trips arbitrary byte arrays exactly', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 4096 }), (bytes) => {
        const decoded = decodeBytes(encodeBytes(bytes));
        expect(decoded.length).toBe(bytes.length);
        expect([...decoded]).toEqual([...bytes]);
      }),
    );
  });

  it('is byte-stable: the same input always encodes to the same text', () => {
    const bytes = Uint8Array.from({ length: 257 }, (_, i) => i % 256);
    expect(encodeBytes(bytes)).toBe(encodeBytes(Uint8Array.from(bytes)));
  });

  it('rejects malformed text rather than decoding garbage silently', () => {
    expect(() => decodeBytes('abc')).toThrow(); // length not a multiple of 4
    expect(() => decodeBytes('ab!=')).toThrow(); // character outside the alphabet
    expect(() => decodeBytes('=abc')).toThrow(); // padding in the wrong place
  });
});

describe('encodeUint32 / decodeUint32', () => {
  it('round-trips arbitrary 32-bit word arrays exactly', () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 0xffffffff }), { maxLength: 512 }),
        (values) => {
          const words = Uint32Array.from(values);
          const decoded = decodeUint32(encodeUint32(words));
          expect(decoded.length).toBe(words.length);
          expect([...decoded]).toEqual([...words]);
        },
      ),
    );
  });

  it('encodes little-endian regardless of platform byte order', () => {
    // 0x04030201 must serialize as bytes 01 02 03 04 — the same document on
    // every machine (SAVE_FORMAT.md §3.2 byte-stability).
    expect(encodeUint32(Uint32Array.of(0x04030201))).toBe(encodeBytes(Uint8Array.of(1, 2, 3, 4)));
  });

  it('rejects byte lengths that are not whole words', () => {
    expect(() => decodeUint32(encodeBytes(Uint8Array.of(1, 2, 3)))).toThrow();
  });
});
