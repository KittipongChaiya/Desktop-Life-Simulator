/**
 * The installed content sources. Phase-08b — ADR-019 §2, ADR-026 §1.
 *
 * ## Why this module is ambient, when nothing else in `src/sim` is
 *
 * Every other registry here is an instance created per world. This one is
 * module-level, and that is a deliberate answer to a hard constraint rather
 * than a convenience.
 *
 * `src/sim` may not import `plugins/**` — the boundary linter enforces it, and
 * it is what keeps the engine from depending on content (`ARCHITECTURE.md`
 * §14.1, and v0.2 goals 4 and 5). But `createWorld` must produce a world that
 * HAS content, and `plugins/core/` is where core content now lives. Something
 * has to carry the definitions across a boundary neither side may import
 * through, and this is it: sources push themselves in, the world pulls them
 * out, and no `src/sim` module ever names a plugin.
 *
 * What installs core, then? The composition root imports `plugins/core` for its
 * side effect, and so does the test runner via `setupFiles`. In phase-09 the
 * loader will call `installSource` once per discovered source — **the same
 * entry point**, which is what makes ADR-019's no-privileged-path rule true
 * rather than promised.
 *
 * The alternative was passing sources into `createWorld` explicitly, which is
 * cleaner in isolation and was rejected for a stated reason: it changes 279
 * call sites across 42 test files, and ADR-019 §2 makes "the existing suites
 * pass unmodified" the proof that this migration changed no behaviour. Losing
 * that proof to gain a nicer signature is the wrong trade in the one phase
 * whose entire job is moving working code.
 *
 * ## What this costs, stated plainly
 *
 * Module-level mutable state in `src/sim` is against this codebase's grain, and
 * two worlds in one process share an installed set. That is correct — which
 * sources are installed is a property of the running application, not of a
 * world — but it does mean a test cannot install a second source for one world
 * only. Vitest isolates modules per test file, so the set is fresh per file and
 * cannot leak between them.
 */

import { ok, type Result } from '../../shared/result';

import { createBuildingRegistry } from './buildings';
import { createCropRegistry } from './crops';
import { createItemRegistry } from './items';
import { createPhaseTintRegistry } from './lighting';
import { createPluginApi, type ContentTargets, type PluginApi } from './plugin-api';
import { createRecipeRegistry } from './recipes';
import { createResourceNodeRegistry } from './resource-nodes';
import { createRoleRegistry } from './roles';
import { createSeasonRegistry } from './seasons';
import { createSoundRegistry } from './sounds';
import { createSourceRegistry, type ContentSource } from './sources';
import { createTileKindRegistry } from './tile-kinds';
import { createWeatherKindRegistry } from './weather-kinds';

/**
 * What a source does when a world asks it for its content.
 *
 * Called once per world, never at install time — the definitions are data, but
 * the registries they land in belong to a world.
 */
export type SourceInstaller = (api: PluginApi) => Result<void>;

const sources = createSourceRegistry();
const installers: { source: ContentSource; install: SourceInstaller }[] = [];

/**
 * Registers a content source and the installer that supplies its content.
 *
 * Claims the source's namespaces immediately (so a collision is refused at
 * install time, not at world creation), and defers the content itself.
 */
export function installSource(source: ContentSource, install: SourceInstaller): Result<void> {
  const claim = sources.register(source);
  if (!claim.ok) return claim;

  installers.push({ source, install });
  return ok();
}

/** Every installed source, in installation order. */
export function installedSources(): readonly ContentSource[] {
  return sources.all();
}

/**
 * Runs every installed source's installer against one world's registries.
 *
 * Order is installation order, which phase-09 makes dependency-topological with
 * a declared tie-break (ADR-019 §6). It is never filesystem enumeration order,
 * because registration order decides tile-kind indices and those are bytes in
 * every save.
 */
export function applyInstalledSources(targets: ContentTargets): Result<void> {
  for (const { source, install } of installers) {
    const result = install(createPluginApi(source, targets));
    if (!result.ok) return result;
  }

  return ok();
}

/**
 * A fresh set of registries holding every installed source's content.
 *
 * The one way to obtain populated content registries — used by `createWorld`,
 * by save validation, and by the tests that need core content without a whole
 * world. Before phase-08b each of those built four registries and called the
 * four `registerCore*` functions itself, which is why "what content exists" was
 * a question with several answers.
 *
 * Throws rather than returning a `Result`: a source that cannot install is a
 * shipped-content defect, the same judgement `registerCore*` made before it
 * moved, and every caller here is startup code with no way to proceed without
 * content.
 */
export function createInstalledRegistries(): ContentTargets {
  const targets: ContentTargets = {
    crops: createCropRegistry(),
    items: createItemRegistry(),
    buildings: createBuildingRegistry(),
    recipes: createRecipeRegistry(),
    resourceNodes: createResourceNodeRegistry(),
    tileKinds: createTileKindRegistry(),
    phaseTints: createPhaseTintRegistry(),
    seasons: createSeasonRegistry(),
    weatherKinds: createWeatherKindRegistry(),
    sounds: createSoundRegistry(),
    roles: createRoleRegistry(),
  };

  const installed = applyInstalledSources(targets);
  if (!installed.ok) {
    throw new Error(`content source failed to install: ${installed.error.message}`);
  }

  return targets;
}
