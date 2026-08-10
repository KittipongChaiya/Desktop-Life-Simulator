/**
 * The sound registry. Phase-13c — ADR-023 §3, ADR-019 §3.
 *
 * A registry with the same shape as every other (ADR-004 §5): a sound is a
 * definition, registered at startup, referenced by id, never inlined.
 *
 * **Nothing here plays anything, and nothing under `src/sim` reads it.** This
 * is a carrier — the simulation holds these definitions exactly as it holds a
 * crop's sprite keys, and the renderer is the only thing that resolves them
 * (ADR-023 §6). The types are in `src/shared/audio.ts`; the reasoning for why
 * they are there rather than here is in that file's header, and it is the
 * reasoning that lets `registerAudio` exist at all.
 *
 * A definition naming a category the engine does not have is **refused**, not
 * defaulted: the category set is closed (ADR-023 §2), and silently reassigning
 * a sound to some fallback bus is how a plugin ends up louder than the game.
 */

import { isSoundCategory, type SoundDefinition } from '../../shared/audio';
import { asContentId, type ContentId } from '../../shared/ids';

import { createContentRegistry, type ContentRegistry } from './registry';

/** A registered sound, with the branded id the registry keys on. */
export interface RegisteredSound extends SoundDefinition {
  readonly id: ContentId;
}

export type SoundRegistry = ContentRegistry<RegisteredSound>;

export function createSoundRegistry(): SoundRegistry {
  return createContentRegistry<RegisteredSound>('sound');
}

/** True when a definition is one the engine can accept. */
export function isPlayableDefinition(definition: SoundDefinition): boolean {
  return (
    isSoundCategory(definition.category) &&
    Number.isFinite(definition.gain) &&
    definition.gain >= 0 &&
    definition.gain <= 1 &&
    definition.asset.length > 0
  );
}

/** Builds the branded id a sound is registered under. */
export function soundId(namespace: string, name: string): ContentId {
  return asContentId(`${namespace}:${name}`);
}
