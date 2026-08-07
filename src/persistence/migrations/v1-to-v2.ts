/**
 * v1 → v2: the world records its content sources. Phase-09b — ADR-026 §4, ADR-019 §7.
 *
 * **The first real migration this project has run.** Everything about the
 * machinery — the runner, its startup chain validation, the golden fixtures at
 * v1 — shipped in phase-07b before any link existed, precisely so that this
 * session adds one file and one chain entry and nothing else (`SAVE_FORMAT.md`
 * §9). That worked; this file is the whole change.
 *
 * ## What it adds, and why the defaults are these
 *
 * `world.sources` — **the empty manifest**, as ADR-026 §4 specifies. It is
 * tempting to synthesise a core entry here, since every v1 save was written by
 * a build that had core content. It would also be a lie: the manifest records
 * what was present *when the save was written*, and a v1 save carries no such
 * record. An empty manifest is the honest statement "this save predates source
 * recording", and the next save written fills it in from what is actually
 * installed. Inventing history to make a field look populated is how a save
 * format starts telling you things that were never true.
 *
 * `world.disabledSources` — **empty**, meaning nothing is switched off. This is
 * why the field records what is DISABLED rather than what is enabled: the
 * migration default is the empty list either way, but only this direction means
 * "everything keeps working". An `enabled: []` default would silently disable
 * core on every v1 save ever written.
 *
 * ## What it does not do
 *
 * No content moves, no id changes, nothing is dropped. A v1 save and its
 * migrated v2 self describe the same farm — which is what lets the golden
 * fixtures assert **zero repairs** afterwards (`ROADMAP.md` §5). The first
 * migration to remove a field is ADR-027 §3's `v4 → v5`, and it will copy this
 * file's shape rather than invent one.
 */

import type { Migration } from '../migrate';

export const v1ToV2: Migration = {
  from: 1,
  to: 2,
  describe: 'record the content sources present in the world (v2)',

  migrate(document) {
    // PURE and non-destructive: a new document every time, the input untouched.
    // Re-running must produce an identical result (`SAVE_FORMAT.md` §10,
    // migration purity), which is why nothing here reads a clock or a registry.
    const world = document['world'];
    const worldRecord = typeof world === 'object' && world !== null ? world : {};

    return {
      ...document,
      schemaVersion: 2,
      world: {
        ...worldRecord,
        sources: [],
        disabledSources: [],
      },
    };
  },
};
