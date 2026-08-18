/**
 * What the renderer may read from the simulation. Phase-29 — ADR-039 §3.
 *
 * A type is not a test. `WorldRenderSource` narrows `world-view.ts`'s reach
 * from the whole simulation to a named list, but `World` still satisfies it
 * structurally and TypeScript is happy to let someone widen the interface in a
 * line — which is the intended friction and not a wall.
 *
 * These assertions are the wall's other half: they read the SOURCE, so
 * widening the boundary fails a test with a name that says what it is, rather
 * than passing quietly because the compiler had no objection.
 *
 * ## Why the render layer is checked and the bootstrap is not
 *
 * The composition root builds the world, so it holds one by definition
 * (`world-mount.ts`, `game-loop.ts`, `start.tsx`). The boundary ADR-039 draws
 * is around `src/renderer/render/` — the views that DRAW — because that is
 * where a worker-thread migration's cost sits.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

const RENDER_DIR = resolve(import.meta.dirname, '..', 'src', 'renderer', 'render');

const sourceFiles = readdirSync(RENDER_DIR).filter(
  (name) => name.endsWith('.ts') && !name.endsWith('.test.ts'),
);

const read = (name: string): string => readFileSync(join(RENDER_DIR, name), 'utf8');

describe('the render layer does not hold the whole simulation', () => {
  it('finds the files it exists to check', () => {
    expect(sourceFiles.length).toBeGreaterThan(10);
  });

  it('imports no `World` anywhere', () => {
    // THE ONE THAT MATTERS. `world-view.ts` took a `World` until phase 29, so
    // "what does the renderer depend on?" had no answer shorter than reading
    // every line of it — and that question is exactly the scope of ADR-003
    // §2's worker-thread migration.
    const offenders = sourceFiles.filter((name) => /sim\/world\/world'/.test(read(name)));

    expect(offenders, 'these reach the whole simulation instead of `WorldRenderSource`').toEqual(
      [],
    );
  });

  it('reads the tile grid only through the named source', () => {
    // The grid is the one mutable structure still read directly (ADR-039 §5),
    // and it is named in `world-source.ts` so a migration's scope stays one
    // field long. Files that take a `TileGrid` as a parameter are fine — that
    // is the pure half being pure. What is not fine is a second door to it.
    const offenders = sourceFiles.filter(
      (name) => name !== 'world-source.ts' && /world\.tiles\b/.test(read(name)),
    );

    // `world-view.ts` reads `options.world.tiles`, which IS the named source.
    expect(offenders.every((name) => read(name).includes('options.world.tiles'))).toBe(true);
  });
});

describe('the named source stays enumerable', () => {
  const source = read('world-source.ts');

  it('declares exactly the documented fields', () => {
    // Pinned so that widening the boundary is a deliberate edit HERE too, with
    // a reason, rather than a line nobody notices in review. ADR-039 groups
    // these three ways: immutable setup, the snapshot, and the one mutable
    // structure that a threaded build would still have to solve.
    const fields = [...source.matchAll(/^ {2}readonly (\w+):/gm)].map((match) => match[1]);

    expect(fields.sort()).toEqual([
      'phaseTintRegistry',
      'resourceNodeRegistry',
      'seasonRegistry',
      'seed',
      'snapshots',
      'tileKinds',
      'tiles',
    ]);
  });

  it('names the tile grid as the migration’s whole remaining scope', () => {
    // The sentence a future session inherits instead of rediscovering.
    expect(source).toContain('SharedArrayBuffer');
  });
});
