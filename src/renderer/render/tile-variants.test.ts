/**
 * Ground variant selection. Phase-33 — ADR-041 §4, `tile-variants.ts`.
 *
 * The interesting tests here are not "does it return a sprite". They are the
 * two ways this feature fails while still returning sprites: BANDING, where
 * adjacent tiles all pick the same variant and the field reads as corduroy,
 * and INSTABILITY, where a tile picks a different variant on a later call and
 * the ground shimmers.
 */

import { describe, expect, it } from 'vitest';

import { WORLD_WIDTH } from '../../shared/constants';
import { asTileIndex } from '../../shared/ids';

import { variantSprite } from './tile-variants';

/** Tiles across one row, as the renderer would walk them. */
const row = (y: number, count: number): readonly number[] =>
  Array.from({ length: count }, (_, x) => y * WORLD_WIDTH + x);

describe('ground tile variants', () => {
  it('leaves a sprite with no variants exactly as it was', () => {
    // Every plugin terrain takes this path, and the four core tiles that ship
    // one look. A caller must never have to ask whether variants exist.
    for (const sprite of ['terrain:water', 'terrain:path', 'plugin:lava', '']) {
      expect(variantSprite(sprite, asTileIndex(1234))).toBe(sprite);
    }
  });

  it('returns only real variants of the sprite it was given', () => {
    const seen = new Set<string>();
    for (let tile = 0; tile < 400; tile += 1) {
      seen.add(variantSprite('terrain:grass', asTileIndex(tile)));
    }

    expect([...seen].sort()).toEqual([
      'terrain:grass',
      'terrain:grass_b',
      'terrain:grass_c',
      'terrain:grass_d',
      'terrain:grass_e',
    ]);
  });

  it('is stable — the same tile always draws the same variant', () => {
    // A variant that changed between calls would make the ground shimmer
    // frame to frame; one that changed between sessions would make a player's
    // farm subtly different every time they opened it.
    for (const tile of [0, 1, 63, 64, 4095, 100_000]) {
      const first = variantSprite('terrain:grass', asTileIndex(tile));
      for (let repeat = 0; repeat < 5; repeat += 1) {
        expect(variantSprite('terrain:grass', asTileIndex(tile))).toBe(first);
      }
    }
  });

  it('does not band along rows — the failure a plain modulo would cause', () => {
    // THE REASON THE HASH EXISTS. Tile indices run along rows, so `tile % 4`
    // gives every fourth square the same variant in a fixed repeating order:
    // the field reads as corduroy rather than as ground. Consecutive tiles must
    // not march through the variants in lockstep.
    const sprites = row(7, 64).map((tile) => variantSprite('terrain:grass', asTileIndex(tile)));

    // With a real hash, a run of identical variants is short. A modulo cycle
    // would make this sequence perfectly periodic with period 4.
    const periodic = sprites.every((sprite, index) => sprite === sprites[index % 4]);
    expect(periodic, 'variants repeat with a fixed period — this is banding').toBe(false);
  });

  it('does not band down columns either', () => {
    // The same trap one axis over: hashing `tile` where rows are `WORLD_WIDTH`
    // apart can still align if the mix is weak, because the inputs differ by a
    // constant stride.
    const column = Array.from({ length: 32 }, (_, y) => y * WORLD_WIDTH + 11);
    const sprites = column.map((tile) => variantSprite('terrain:grass', asTileIndex(tile)));

    expect(new Set(sprites).size, 'a whole column drew one variant').toBeGreaterThan(1);
  });

  it('keeps the plain tile the common case', () => {
    // The decorated variants are Tier 3 (`ART_DIRECTION.md` §9.1). If blooms
    // land on half the map they stop being a detail and become a pattern, so
    // the plain tile is listed twice and should win roughly half the time.
    const sprites = Array.from({ length: 2000 }, (_, tile) =>
      variantSprite('terrain:grass', asTileIndex(tile)),
    );
    const plain = sprites.filter((sprite) => sprite === 'terrain:grass').length;
    const bloomed = sprites.filter((sprite) => sprite === 'terrain:grass_c').length;

    // Half the list is the plain tile (phase-44 went from three faces to five,
    // keeping the same weighting): most of a field IS plain, and a field where
    // every square is interesting is a field with no ground in it.
    expect(plain / sprites.length).toBeGreaterThan(0.4);
    expect(bloomed / sprites.length).toBeLessThan(0.35);
  });

  it('dresses tilled soil without varying the furrows', () => {
    // Phase-35. The variants differ only in DEBRIS — a turned-up stone, an
    // unpulled weed — and every one of them draws the identical furrow
    // pattern, so a field still reads as one worked block rather than as
    // several fields that happen to touch.
    const seen = new Set(
      Array.from({ length: 400 }, (_, tile) => variantSprite('terrain:tilled', asTileIndex(tile))),
    );

    expect([...seen].sort()).toEqual(['terrain:tilled', 'terrain:tilled_b', 'terrain:tilled_c']);
  });

  it('varies wild ground too, on its own set', () => {
    const seen = new Set(
      Array.from({ length: 200 }, (_, tile) => variantSprite('terrain:wild', asTileIndex(tile))),
    );

    expect([...seen].sort()).toEqual(['terrain:wild', 'terrain:wild_b']);
  });
});
