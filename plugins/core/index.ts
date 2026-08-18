/**
 * `core` — the built-in content source. Phase-08b — ADR-019 §2, ADR-026 §1.
 *
 * This is the first consumer of the public plugin API, and closing ADR-003 §6's
 * gap is its whole purpose: _"the API is proven sufficient by first-party
 * content before any third party depends on it."_ That promise had been
 * unbacked since phase-00 — core content registered through `registerCore*`
 * called directly from `world.ts`, and there was no `PluginApi` in the
 * repository at all. A reserved-but-unused seam does not stay honest.
 *
 * **It uses the public API and nothing else.** No privileged path, no internal
 * shortcut, no capability reachable from here that a third-party source cannot
 * reach — ADR-019 §Alternatives D rejects the opposite explicitly, because a
 * fast path for official content is how a public API stops being dogfooded and
 * makes ADR-026 §2's "the engine never branches on provenance" false at the one
 * seam where it matters most.
 *
 * Importing this module installs the source. The renderer's composition root
 * does it, and the test runner does it through `setupFiles`; in phase-09 the
 * loader calls the same `installSource` once per discovered source.
 */

import { installSource } from '../../src/sim/content/installed';
import { Provenance, type ContentSource } from '../../src/sim/content/sources';

import {
  coreBuildings,
  coreCrops,
  coreItems,
  corePhaseTints,
  coreRecipes,
  coreRoles,
  coreSeasons,
  coreSounds,
  coreWeatherKinds,
  coreTileKinds,
} from './content';

/**
 * The source record for built-in content.
 *
 * `core` is reserved forever (ADR-026 §1) and this is its only owner. The
 * version is the content's, not the engine's — a source's version is
 * independent of the game it runs in (ADR-019 §1).
 */
export const CORE_SOURCE: ContentSource = {
  id: 'core',
  namespaces: ['core'],
  provenance: Provenance.Builtin,
  displayName: 'Desktop Life Simulator',
  version: '1.0.0',
};

/**
 * Registers every core definition through the public API.
 *
 * One bundle rather than four calls, because the API is all-or-nothing: core
 * either supplies its whole content set or none of it, and a world holding
 * three of four crop definitions is a world whose saves reference content that
 * does not exist.
 */
const installed = installSource(CORE_SOURCE, (api) => {
  // ONE install per source: `installSource` claims namespaces, and a source
  // may claim them once (ADR-026 §1). Audio registers inside the same
  // installer rather than a second call, which also keeps it atomic with the
  // content — core supplies its whole surface or none of it.
  const audio = api.registerAudio({ sounds: coreSounds() });
  if (!audio.ok) return audio;

  return api.registerContent({
    tileKinds: coreTileKinds(),
    crops: coreCrops(),
    items: coreItems(),
    buildings: coreBuildings(),
    recipes: coreRecipes(),
    phaseTints: corePhaseTints(),
    roles: coreRoles(),
    seasons: coreSeasons(),
    weatherKinds: coreWeatherKinds(),
  });
});

if (!installed.ok) {
  // The same judgement the four `registerCore*` functions made before this
  // moved: core content failing to install is a programming error — a
  // duplicate or malformed id shipped — not a runtime condition to handle.
  throw new Error(`core content source failed to install: ${installed.error.message}`);
}
