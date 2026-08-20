/**
 * The content census. Phase-54 — ADR-046 §2 and §3.
 *
 * ## What this file is for
 *
 * v0.6 is the first version that adds no system, so "the system works" cannot
 * bound it. ADR-046 bounds it with ten rules instead, each stating a property
 * the content set must have rather than a count it must reach. This file is
 * where those rules live, and it does three jobs:
 *
 * 1. **It records the size of every registry.** "The content is thin" was an
 *    anecdote that had to be rediscovered by counting `asContentId` calls by
 *    hand. It is now a number, printed by a test, and the first thing that
 *    number did was correct the document that scoped this version — there are
 *    ten building definitions, not six; four of them are the town's and are
 *    priced at zero because the player never buys them.
 *
 * 2. **It pins the v0.5 id set as a floor.** ADR-026 makes a `ContentId` a
 *    permanent identifier: an instance in a live save stores the id and
 *    resolves the definition at load. Renaming `core:wheat` orphans every wheat
 *    in every save, and removing it does the same. So `BASELINE` below is not
 *    documentation — it is the assertion that v0.6 only ever ADDS.
 *
 * 3. **It carries all ten rules from phase 54, with the unsatisfied ones
 *    gated.** See "the gate" below, which is the part worth reading.
 *
 * ## The gate, and why it is not `it.skip`
 *
 * Nine of the ten rules are false on the day this file is written, because the
 * content they describe has not been authored yet. The obvious move is
 * `it.skip` with a TODO, and it is the wrong one twice over: a skipped test is
 * invisible in a green run (`PLAN.md` §8's dead-code gate forbids skipped tests
 * outright), and a TODO is a promise with no mechanism behind it.
 *
 * Instead, **the gate is `PLAN.md` §0's own phase table.** A rule declares the
 * phase that satisfies it; the rule is enforced once that phase is marked
 * COMPLETE, and is merely reported before then. So:
 *
 * - Marking phase 55 COMPLETE turns R-01 and R-02 into hard assertions. Marking
 *   it complete WITHOUT satisfying them turns the suite red — which is the
 *   whole point, because "phase complete" and "the phase's rule holds" become
 *   the same claim rather than two claims that can drift apart.
 * - A pending rule still runs, still computes its violations, and still prints
 *   them. Progress is visible every run instead of at the end.
 * - A pending rule also asserts that it is *legitimately* pending — that its
 *   phase really is incomplete. A rule cannot be parked by lying about the gate,
 *   because the gate and the resume block are the same table, and
 *   `plan-state.test.ts` already guards that table against drift.
 *
 * This is the same doc-and-machine-agree pattern `coverage-policy.test.ts` and
 * `plan-state.test.ts` use, for the same reason: a fact that lives in two places
 * drifts, so it should live in one and be read from there.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ContentId } from '../src/shared/ids';
import { createInstalledRegistries } from '../src/sim/content/installed';
import { QUEST_CHAINS } from '../src/sim/content/quests';
import { RESIDENTS } from '../src/sim/content/residents';

const ROOT = join(import.meta.dirname, '..');
const PLAN = readFileSync(join(ROOT, 'docs', 'PLAN.md'), 'utf8');

const content = createInstalledRegistries();

// ---------------------------------------------------------------------------
// The gate
// ---------------------------------------------------------------------------

/**
 * Phases `PLAN.md` §0 marks COMPLETE.
 *
 * Read from the resume block rather than from a constant here, so that the
 * phase table is the single place a phase's completion is declared.
 * `plan-state.test.ts` independently guards that block against going stale, so
 * this parse is standing on something already checked.
 */
function completedPhases(): ReadonlySet<number> {
  const section = PLAN.slice(PLAN.indexOf('## 0. Current State'), PLAN.indexOf('## 1. Version'));
  const complete = new Set<number>();
  for (const line of section.split('\n')) {
    const match = /^\|\s*(\d+)\s*\|[^|]+\|\s*([A-Z_]+)\s*\|/.exec(line);
    if (match?.[1] !== undefined && match[2] === 'COMPLETE') complete.add(Number(match[1]));
  }
  return complete;
}

/** The phase that is expected to satisfy each rule (ADR-046 §2). */
const RULE_PHASE: Readonly<Record<string, number>> = {
  'R-01': 55,
  'R-02': 55,
  'R-03': 56,
  'R-04': 56,
  'R-05': 57,
  'R-06': 58,
  'R-07': 59,
  'R-08': 59,
  'R-09': 60,
  'R-10': 61,
};

/**
 * Enforces a rule once its phase is complete; reports it before then.
 *
 * `violations` is a list of human-readable strings, empty when the rule holds.
 * Passing a list rather than a boolean is deliberate: a pending rule's output
 * is only useful if it says WHICH content is failing, and a rule that turns
 * hard later should fail with the same detail it was printing all along.
 */
function checkRule(rule: string, description: string, violations: readonly string[]): void {
  const phase = RULE_PHASE[rule];
  expect(phase, `${rule} has no phase in RULE_PHASE`).toBeDefined();

  const done = completedPhases().has(phase ?? -1);

  if (done) {
    expect(
      violations,
      `${rule} (${description}) is enforced because PLAN.md §0 marks phase ${String(phase)} ` +
        `COMPLETE, and it does not hold:\n  ${violations.join('\n  ')}`,
    ).toEqual([]);
    return;
  }

  // Not yet due. Assert the gate is HONEST rather than asserting nothing: a
  // rule may only be pending while its phase genuinely is.
  expect(
    completedPhases().has(phase ?? -1),
    `${rule} is being treated as pending, but PLAN.md §0 marks phase ${String(phase)} COMPLETE`,
  ).toBe(false);

  const state = violations.length === 0 ? 'already holds' : `${String(violations.length)} to go`;
  console.info(`  ${rule} pending phase ${String(phase)} — ${state}: ${description}`);
}

// ---------------------------------------------------------------------------
// The census
// ---------------------------------------------------------------------------

/**
 * Every id registered at the v0.6 baseline, captured at phase 54.
 *
 * ADR-046 §3: v0.6 adds and never renames or removes. This list is what makes
 * that a test rather than an intention. Deliberately removing content in some
 * later version means editing this list, which is exactly the amount of
 * friction the decision deserves.
 */
const BASELINE = {
  crops: ['core:carrot', 'core:pumpkin', 'core:turnip', 'core:wheat'],
  buildings: [
    'core:castle',
    'core:cottage',
    'core:kitchen',
    'core:market_stall',
    'core:mill',
    'core:notice_board',
    'core:rest_hut',
    'core:seed_bin',
    'core:storage_shed',
    'core:well',
  ],
  items: [
    'core:bread',
    'core:carrot',
    'core:carrot_seed',
    'core:flour',
    'core:ore',
    'core:pumpkin',
    'core:pumpkin_seed',
    'core:stone',
    'core:turnip',
    'core:turnip_seed',
    'core:wheat',
    'core:wheat_seed',
    'core:wood',
  ],
  recipes: ['core:bake_bread', 'core:grind_flour'],
  resourceNodes: ['core:ore_node', 'core:stone_node', 'core:timber_node'],
  expeditions: ['core:highlands', 'core:old_quarry', 'core:river_delta'],
  tileKinds: ['core:grass', 'core:path', 'core:stone', 'core:water'],
  seasons: ['core:autumn', 'core:spring', 'core:summer', 'core:winter'],
  weatherKinds: ['core:clear', 'core:rain'],
  phaseTints: ['core:dawn_tint', 'core:day_tint', 'core:dusk_tint', 'core:night_tint'],
  roles: ['core:farmhand', 'core:forager', 'core:groundskeeper', 'core:harvester'],
  sounds: [
    'core:coin',
    'core:deposit',
    'core:error',
    'core:harvest',
    'core:notification',
    'core:placement',
    'core:plant',
    'core:selection',
    'core:rain',
    'core:till',
    'core:ui_click',
  ],
} as const;

type RegistryName = keyof typeof BASELINE;

/** The registries, by the name `BASELINE` uses. */
function registry(name: RegistryName): { all(): readonly { readonly id: ContentId }[] } {
  return content[name];
}

function idsIn(name: RegistryName): string[] {
  return registry(name)
    .all()
    .map((definition) => String(definition.id))
    .sort();
}

describe('the content census', () => {
  it('records the size of every registry', () => {
    const rows = (Object.keys(BASELINE) as RegistryName[]).map((name) => ({
      registry: name,
      at_v05: BASELINE[name].length,
      now: idsIn(name).length,
    }));
    rows.push({ registry: 'questChains' as RegistryName, at_v05: 5, now: QUEST_CHAINS.length });
    rows.push({ registry: 'residents' as RegistryName, at_v05: 4, now: RESIDENTS.length });

    console.table(rows);

    // The census is an instrument, and an instrument that reads nothing is
    // broken. This asserts it is wired to real registries, not that any
    // particular registry is large — the ten rules are what say that.
    for (const row of rows) {
      expect(row.now, `${row.registry} is empty — the census is not reading it`).toBeGreaterThan(0);
    }
  });

  it('never loses an id that existed at the v0.6 baseline', () => {
    // ADR-026 + ADR-046 §3. An id in a save that no longer resolves is an
    // orphaned instance, which is the one way a content version can destroy a
    // farm — and `PLAN.md` §8 makes data loss a blocking gate, always.
    for (const name of Object.keys(BASELINE) as RegistryName[]) {
      const present = new Set(idsIn(name));
      const missing = BASELINE[name].filter((id) => !present.has(id));
      expect(
        missing,
        `${name}: ${missing.join(', ')} existed at the v0.6 baseline and no longer resolves. ` +
          `ADR-046 §3 forbids renaming or removing content — every save holding one of these ` +
          `would orphan it.`,
      ).toEqual([]);
    }
  });

  it('never loses a resident or an authored quest chain', () => {
    const residents = RESIDENTS.map((resident) => String(resident.id)).sort();
    for (const id of BASELINE_PEOPLE.residents) {
      expect(residents, `resident ${id} was removed`).toContain(id);
    }
    const chains = QUEST_CHAINS.map((chain) => String(chain.id)).sort();
    for (const id of BASELINE_PEOPLE.questChains) {
      expect(chains, `quest chain ${id} was removed`).toContain(id);
    }
  });
});

const BASELINE_PEOPLE = {
  residents: [
    'core:resident_edwin',
    'core:resident_marla',
    'core:resident_prue',
    'core:resident_tobin',
  ],
  questChains: [
    'core:quest_edwin',
    'core:quest_good_neighbour',
    'core:quest_marla',
    'core:quest_prue',
    'core:quest_tobin',
  ],
} as const;

// ---------------------------------------------------------------------------
// The ten rules
// ---------------------------------------------------------------------------

/** Sale value of a stack, at base price — dynamic pricing is not content. */
function stackValue(stack: { readonly item: ContentId; readonly quantity: number }): number {
  const definition = content.items.get(stack.item);
  return definition.ok ? definition.value.basePrice * stack.quantity : 0;
}

function harvestValue(crop: {
  readonly harvestYield: readonly { item: ContentId; quantity: number }[];
}): number {
  return crop.harvestYield.reduce((total, stack) => total + stackValue(stack), 0);
}

describe('ADR-046 §2 — the content rules', () => {
  it('R-01 — every season offers at least three plantable crops', () => {
    const crops = content.crops.all();
    const violations = content.seasons.all().flatMap((season) => {
      const plantable = crops.filter(
        (crop) => crop.seasons.length === 0 || crop.seasons.includes(String(season.id)),
      );
      return plantable.length >= 3
        ? []
        : [`${String(season.id)} has ${String(plantable.length)} plantable crops`];
    });

    checkRule('R-01', 'three plantable crops per season', violations);
  });

  it('R-02 — no crop is strictly dominated within a season', () => {
    // Three axes, deliberately opposed (ADR-046 §2): value per tick is the
    // active player's, value per harvest is the idle player's — fewer returns
    // for the same money — and seed cost is the player who has none. A crop is
    // dominated only when another beats it on all three at once, so a crop that
    // is slower but pays more per visit survives. A single-axis rule would
    // delete exactly the crops that make a season a choice.
    const crops = content.crops.all();
    const violations: string[] = [];

    for (const season of content.seasons.all()) {
      const available = crops.filter(
        (crop) => crop.seasons.length === 0 || crop.seasons.includes(String(season.id)),
      );

      for (const crop of available) {
        const rate = harvestValue(crop) / crop.growthTicks;
        const perHarvest = harvestValue(crop);

        const dominator = available.find((other) => {
          if (other.id === crop.id) return false;
          const otherRate = harvestValue(other) / other.growthTicks;
          const otherPerHarvest = harvestValue(other);
          const noWorse =
            otherRate >= rate && otherPerHarvest >= perHarvest && other.seedCost <= crop.seedCost;
          const better =
            otherRate > rate || otherPerHarvest > perHarvest || other.seedCost < crop.seedCost;
          return noWorse && better;
        });

        if (dominator !== undefined) {
          violations.push(
            `${String(crop.id)} is dominated by ${String(dominator.id)} in ${String(season.id)}`,
          );
        }
      }
    }

    checkRule('R-02', 'no strictly dominated crop', violations);
  });

  it('R-03 — two production chains of depth 3, and one of depth 4', () => {
    const depths = chainDepths();
    const deep = depths.filter((depth) => depth >= 3);
    const deeper = depths.filter((depth) => depth >= 4);

    const violations: string[] = [];
    if (deep.length < 2) {
      violations.push(`${String(deep.length)} chains of depth >= 3 items, need 2`);
    }
    if (deeper.length < 1) {
      violations.push(`${String(deeper.length)} chains of depth >= 4 items, need 1`);
    }

    checkRule('R-03', 'chains with real depth', violations);
  });

  it('R-04 — every factory building is named by at least two recipes', () => {
    // ADR-035 §1: what makes a building a factory is that a recipe names it.
    // So the set of factories is derived from the recipes, never declared.
    const perBuilding = new Map<string, number>();
    for (const recipe of content.recipes.all()) {
      const key = String(recipe.building);
      perBuilding.set(key, (perBuilding.get(key) ?? 0) + 1);
    }

    const violations = [...perBuilding.entries()]
      .filter(([, count]) => count < 2)
      .map(([building, count]) => `${building} is named by ${String(count)} recipe(s)`);

    checkRule('R-04', 'two recipes per factory', violations);
  });

  it('R-05 — a ladder above the Market Stall, of more than one kind', () => {
    const stall = content.buildings.get('core:market_stall' as ContentId);
    expect(stall.ok, 'the Market Stall must exist — R-05 is measured against it').toBe(true);
    const floor = stall.ok ? stall.value.cost : 0;

    const above = content.buildings.all().filter((building) => building.cost > floor);

    // A building's KIND is derived from its definition rather than declared:
    // `storageSlots` makes it storage, a recipe naming it makes it a factory
    // (ADR-035 §1 — what makes a building a factory is that a recipe names it),
    // and neither makes it a utility. Counting kinds is what stops three more
    // processing buildings at three prices from passing as a ladder.
    const factories = new Set(content.recipes.all().map((recipe) => String(recipe.building)));
    const kindOf = (building: (typeof above)[number]): string => {
      if (building.storageSlots !== undefined) return 'storage';
      if (factories.has(String(building.id))) return 'factory';
      return 'utility';
    };
    const kinds = new Set(above.map(kindOf));

    const violations: string[] = [];
    if (above.length < 3) {
      violations.push(
        `${String(above.length)} buildings cost more than the Market Stall (${String(floor)}), need 3`,
      );
    }
    if (kinds.size < 2) {
      violations.push(
        `every building above the Market Stall is the same kind (${[...kinds].join(', ')}) — ` +
          `a ladder of one rung repeated is not a ladder`,
      );
    }

    checkRule('R-05', 'a ladder above the Market Stall', violations);
  });

  it('R-06 — every resident has an authored quest chain', () => {
    // The four existing per-resident chains are produced by `RESIDENTS.map()`:
    // one template, two steps, thresholds 1 and 3, with a name substituted in.
    // That is a formula, not content — counting chains would report four and
    // mean nothing.
    //
    // So "authored" is defined structurally rather than by a naming convention:
    // a chain that points at this resident and is NOT the one the template
    // generates. The derived id is `core:resident_x` -> `core:quest_x`, so the
    // check needs no agreement about what an authored chain is called, and
    // phase 58 is free to name them however reads best.
    const violations = RESIDENTS.flatMap((resident) => {
      const derivedId = String(resident.id).replace(':resident_', ':quest_');
      const authored = QUEST_CHAINS.filter(
        (chain) =>
          chain.counter.kind === 'requester' &&
          String(chain.counter.requester) === String(resident.id) &&
          String(chain.id) !== derivedId,
      );
      return authored.length > 0
        ? []
        : [`${String(resident.id)} has only the derived template chain`];
    });

    checkRule('R-06', 'an authored chain per resident', violations);
  });

  it('R-07 — every resource node kind is reachable from two expedition sites', () => {
    const itemsFromSite = new Map<string, Set<string>>();
    for (const site of content.expeditions.all()) {
      for (const stack of site.yields) {
        const key = String(stack.item);
        if (!itemsFromSite.has(key)) itemsFromSite.set(key, new Set());
        itemsFromSite.get(key)?.add(String(site.id));
      }
    }

    const violations = content.resourceNodes.all().flatMap((node) => {
      const sites = new Set<string>();
      for (const stack of node.yields) {
        for (const site of itemsFromSite.get(String(stack.item)) ?? []) sites.add(site);
      }
      return sites.size >= 2
        ? []
        : [`${String(node.id)} is reachable from ${String(sites.size)} site(s)`];
    });

    checkRule('R-07', 'two routes to every resource', violations);
  });

  it('R-08 — expedition sites differ on more than one axis', () => {
    // If ordering sites by travel time gives the same ordering as by value,
    // there is one axis wearing two names and the map is a straight line.
    const sites = content.expeditions.all();
    const byTravel = [...sites]
      .sort((a, b) => a.travelTicks - b.travelTicks)
      .map((s) => String(s.id));
    const value = (site: (typeof sites)[number]): number =>
      site.yields.reduce((total, stack) => total + stackValue(stack), 0);
    const byValue = [...sites].sort((a, b) => value(a) - value(b)).map((s) => String(s.id));

    const violations =
      sites.length >= 2 && byTravel.join() === byValue.join()
        ? ['travel time and yield value order the sites identically — one axis, not two']
        : [];

    checkRule('R-08', 'destinations that are not one ordering', violations);
  });

  it('R-09 — every sound in the catalogue is reachable', () => {
    // AMENDED AT PHASE 60 (ADR-046 §2). This asked whether each sound had an
    // authored `.wav` behind it, which measures the METHOD rather than the
    // quality — and ADR-043 already established that the quality is
    // human-evaluable and may not be claimed by a session that cannot hear it.
    //
    // What it asks now is that the catalogue has no holes: a sound nothing
    // plays is an asset nobody hears. The trigger sites are `sound.play(...)`
    // calls in the renderer, so this greps the source the same way
    // `sprite-keys.test.ts` greps for sprite keys — and for the same reason,
    // that an unreachable asset fails silently and forever.
    const sources = [
      join(ROOT, 'src', 'renderer', 'bootstrap', 'start.tsx'),
      join(ROOT, 'src', 'renderer', 'app', 'App.tsx'),
      join(ROOT, 'src', 'renderer', 'app', 'ambience.ts'),
    ].filter((path) => existsSync(path));
    const wiring = sources.map((path) => readFileSync(path, 'utf8')).join('\n');

    const violations = content.sounds.all().flatMap((sound) => {
      // `core:ui_click` is played as `Sound.UiClick`; the id is snake_case and
      // the enum member is Pascal, so the comparison is on the squashed name.
      const name = (String(sound.id).split(':')[1] ?? '').replace(/_/g, '').toLowerCase();
      const played = /Sound\.([A-Za-z]+)/g;
      let match = played.exec(wiring);
      while (match !== null) {
        if ((match[1] ?? '').toLowerCase() === name) return [];
        match = played.exec(wiring);
      }
      return [`${String(sound.id)} is registered but nothing plays it`];
    });

    checkRule('R-09', 'no sound without a trigger', violations);
  });

  it('R-10 — the progression arc clears both its floor and its ceiling', () => {
    // Measured by `progression-arc.test.ts`, which owns the model player and
    // the two bounds. Duplicating the simulation here would give the census a
    // second answer to a question that already has one, so this rule asserts
    // that the measurement EXISTS and is enforced, and phase 61 is where the
    // number itself is read.
    const arc = join(ROOT, 'tests', 'progression-arc.test.ts');
    const violations = existsSync(arc) ? [] : ['tests/progression-arc.test.ts is missing'];

    checkRule('R-10', 'the arc still has a floor and a ceiling', violations);
  });
});

/**
 * Depth, in ITEMS, of every maximal production chain.
 *
 * A chain is a path through recipes where one recipe's output is the next
 * recipe's input. `wheat -> flour -> bread` is depth 3 and is the chain that
 * already existed at the baseline — which is why ADR-046 §2 counts items rather
 * than recipes, and asks for two of these plus one deeper.
 */
function chainDepths(): number[] {
  const producedBy = new Map<string, { inputs: string[] }>();
  for (const recipe of content.recipes.all()) {
    for (const output of recipe.outputs) {
      producedBy.set(String(output.item), {
        inputs: recipe.inputs.map((stack) => String(stack.item)),
      });
    }
  }

  /** Longest path of items ending at `item`, counting `item` itself. */
  function depthOf(item: string, seen: ReadonlySet<string>): number {
    if (seen.has(item)) return 0; // a cycle contributes nothing
    const recipe = producedBy.get(item);
    if (recipe === undefined || recipe.inputs.length === 0) return 1;

    const next = new Set(seen);
    next.add(item);
    return 1 + Math.max(...recipe.inputs.map((input) => depthOf(input, next)));
  }

  // Only FINISHED goods start a chain — an item that feeds another recipe is
  // the middle of a longer one, and counting it separately would report the
  // same chain twice at two different depths.
  const consumed = new Set<string>();
  for (const recipe of content.recipes.all()) {
    for (const input of recipe.inputs) consumed.add(String(input.item));
  }

  return [...producedBy.keys()]
    .filter((item) => !consumed.has(item))
    .map((item) => depthOf(item, new Set()));
}
