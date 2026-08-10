/**
 * What a sound IS, as data. Phase-13c — ADR-023 §3, ADR-019 §4.
 *
 * ## Why this lives in `shared` and not in `src/sim`
 *
 * Two rules point in opposite directions, and this file is where they are
 * reconciled:
 *
 * - **ADR-019 §3** puts `registerAudio` on the public plugin API, and that API
 *   lives in `src/sim/content/plugin-api.ts`.
 * - **ADR-023 §6** says no module under `src/sim` may reference audio, and the
 *   boundary linter makes it a compile error.
 *
 * The routing is forced rather than chosen: `plugins/*` may import `shared` and
 * `sim` and nothing else — never `renderer` — so first-party content
 * physically cannot register into a renderer-side registry. Every path from
 * `plugins/core` to the audio layer goes through `src/sim`.
 *
 * The resolution is ADR-019 §4's own rule: **content is data, never code.** A
 * sound definition is an id, a category, a gain and an asset key — four plain
 * values that cannot make a noise. `src/sim` carries them the way it carries a
 * crop's sprite key: opaquely, never reading them, never acting on them. The
 * simulation gains no audio behaviour, which is what ADR-023 §6 is actually
 * protecting; everything that can produce sound stays in the renderer.
 *
 * The same shape will serve `registerEffects`, which ADR-019 §3 also declares
 * v1 and which has exactly this problem.
 */

/** A sound's mix category. Engine-owned and closed (ADR-023 §2). */
export type SoundCategoryId = 'ui' | 'world' | 'ambient' | 'music';

export interface SoundDefinition {
  /** Namespaced id, owned like every other piece of content (ADR-026 §1). */
  readonly id: string;
  /**
   * Which bus it plays on. A source assigns one; it may not invent one, and a
   * definition naming an unknown category is refused rather than defaulted.
   */
  readonly category: SoundCategoryId;
  /**
   * Mix gain, 0–1.
   *
   * The MIX, not the asset's amplitude — the two are deliberately separate so
   * balancing survives the placeholder set being replaced by real audio
   * (ADR-016 §6's replacement path).
   */
  readonly gain: number;
  /**
   * Key naming the audio asset, resolved by the renderer.
   *
   * A key rather than a URL, for the reason a crop stores `stageSprites` keys:
   * the definition must not know how the build addresses files.
   */
  readonly asset: string;
}

/** Every category, in mix order. Mirrors the renderer's `AudioCategory`. */
export const SOUND_CATEGORY_IDS: readonly SoundCategoryId[] = ['ui', 'world', 'ambient', 'music'];

/** True if a value names a category the engine actually has. */
export function isSoundCategory(value: unknown): value is SoundCategoryId {
  return typeof value === 'string' && (SOUND_CATEGORY_IDS as readonly string[]).includes(value);
}
