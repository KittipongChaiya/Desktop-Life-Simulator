/**
 * Hydration's guards. Phase-08.0b — `SAVE_FORMAT.md` §4.3, ADR-015 §6.
 *
 * `hydrateWorld` assumes a valid document at the current version: structural
 * validation, semantic repair, and the quarantine path all run before it in the
 * load pipeline (07b). Its own checks therefore guard a PIPELINE ORDERING BUG,
 * not a corrupt file — and that is exactly why they need tests. If validation
 * is ever bypassed, reordered, or made conditional, these throws are the last
 * thing standing between a malformed document and a silently wrong world.
 *
 * What each asserts is that hydration FAILS LOUDLY AND BY NAME. A grid copied
 * at the wrong length would not crash — `Uint8Array.set` would throw, or worse,
 * a shorter array would leave the tail of the world at its fresh-world values
 * and the player would load a farm with half its terrain reset. Naming the
 * field is what turns that into a bug report instead of a mystery.
 *
 * The happy path is covered by `tests/save-round-trip.test.ts`, which proves
 * the far stronger property: hydrate(serialize(w)) ≡ w, over arbitrary worlds.
 */

import { describe, expect, it } from 'vitest';

import { asTileIndex } from '../shared/ids';
import { CORE_STORAGE_SHED } from '../sim/content/buildings';
import { setOwned } from '../sim/world/tile-grid';
import { createWorld } from '../sim/world/world';

import { hydrateWorld } from './deserialize';
import type { SaveDocument, SaveMeta } from './schema';
import { serializeSave, toSaveDocument } from './serialize';

const META: SaveMeta = {
  gameVersion: '0.1.0',
  createdAtUnixMs: 1_753_000_000_000,
  savedAtUnixMs: 1_753_084_800_000,
  playtimeTicks: 0,
  saveCount: 1,
};

function documentWithShed(): SaveDocument {
  const world = createWorld(7);
  const shedTile = asTileIndex(2144);
  setOwned(world.tiles, shedTile, true);
  const shedId = world.ids.allocateBuilding();
  world.buildings.set(shedId, { id: shedId, tile: shedTile, buildingId: CORE_STORAGE_SHED });
  world.buildingStorage.set(shedId, { stacks: [], capacity: 50 });
  return toSaveDocument(world, META);
}

/** A mutable deep clone — documents are JSON-shaped by construction. */
function tampered(mutate: (doc: never) => void): SaveDocument {
  const doc = JSON.parse(serializeSave(documentWithShed())) as SaveDocument;
  mutate(doc as never);
  return doc;
}

describe('hydrateWorld rejects a document that skipped validation', () => {
  it('accepts the untampered document, so every rejection below is the tampering', () => {
    expect(() => hydrateWorld(documentWithShed())).not.toThrow();
  });

  it('refuses a grid whose dimensions are not the world it is being loaded into', () => {
    const doc = tampered((d: { world: { grid: { width: number } } }) => {
      d.world.grid.width = 32;
    });
    expect(() => hydrateWorld(doc)).toThrow(/grid 32x64 does not match/);
  });

  it('names the grid field whose byte length is wrong, rather than half-copying it', () => {
    // `owned` is one bit per tile, so a `kind`-length encoding is the exact
    // mistake a future grid field would make. Two bytes short is not a crash;
    // it is a farm with its last rows quietly reset.
    const doc = tampered((d: { world: { grid: { owned: string; kind: string } } }) => {
      d.world.grid.owned = d.world.grid.kind;
    });
    expect(() => hydrateWorld(doc)).toThrow(/grid owned: expected 640 bytes, got 5120/);
  });

  it('refuses a tilledAt array of the wrong word count', () => {
    const doc = tampered((d: { world: { grid: { tilledAt: string } } }) => {
      // 16 base64 characters decode to 12 bytes — three whole 32-bit words, so
      // this passes the decoder and fails only the count check under test.
      d.world.grid.tilledAt = 'A'.repeat(16);
    });
    expect(() => hydrateWorld(doc)).toThrow(/grid tilledAt: expected 5120 words/);
  });

  it('refuses storage for a building that does not exist — 07b turns this into quarantine', () => {
    const doc = tampered((d: { world: { buildingStorage: { building: number }[] } }) => {
      d.world.buildingStorage[0]!.building = 777;
    });
    expect(() => hydrateWorld(doc)).toThrow(/storage for building 777, which does not exist/);
  });

  it('refuses a building whose content is not registered — unknown content belongs in quarantine', () => {
    const doc = tampered((d: { world: { buildings: { buildingId: string }[] } }) => {
      d.world.buildings[0]!.buildingId = 'mod:moon_shed';
    });
    expect(() => hydrateWorld(doc)).toThrow(/mod:moon_shed is not registered/);
  });
});
