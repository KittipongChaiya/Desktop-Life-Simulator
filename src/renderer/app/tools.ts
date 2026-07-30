/**
 * The tool vocabulary. Phase-07.5h.
 *
 * Lives in the UI layer because BOTH sides need it: the input mapping turns a
 * held tool plus a clicked tile into a command, and the tool bar has to name
 * and label the same three tools. It previously lived in
 * `bootstrap/player-input.ts`, where the UI layer could not reach it
 * (`CODE_STYLE.md` §8.1 — `app` may not import `bootstrap`) — which is part of
 * why the tool bar `GAME_DESIGN.md` §10.2 specifies was never built, and why
 * arming a tool stayed a keyboard secret.
 *
 * `bootstrap` may import `app`, so the input layer now reads it from here.
 */

/**
 * The tools a player can hold. `GAME_DESIGN.md` §8.3 also lists a watering
 * can; it is deliberately absent while moisture is deferred — a tool that
 * silently does nothing is worse than a tool that is not offered.
 */
export const Tool = {
  Hoe: 'hoe',
  Seed: 'seed',
  Hand: 'hand',
} as const;

export type Tool = (typeof Tool)[keyof typeof Tool];

/** How each tool presents itself, and the key that arms it. */
export interface ToolInfo {
  readonly tool: Tool;
  /** What the tool DOES, not what it is called — a first-time player reads verbs. */
  readonly label: string;
  /** The keyboard shortcut (`GAME_DESIGN.md` §8.3). */
  readonly key: string;
  readonly hint: string;
}

/**
 * The bar's order, and the single source of the key bindings.
 *
 * `3` is unbound in v0.1: the numbers match `GAME_DESIGN.md` §8.3's tool slots
 * rather than being renumbered to close the gap, so the watering can can arrive
 * later without moving every other key under the player's fingers.
 */
export const TOOLS: readonly ToolInfo[] = [
  { tool: Tool.Hoe, label: 'Till', key: '1', hint: 'Till owned ground so it can be planted' },
  { tool: Tool.Seed, label: 'Plant', key: '2', hint: 'Plant the selected seed on tilled ground' },
  { tool: Tool.Hand, label: 'Harvest', key: '4', hint: 'Harvest a grown crop by hand' },
];

/** The tool a number key arms, or null for anything else. */
export function toolForKey(key: string): Tool | null {
  return TOOLS.find((info) => info.key === key)?.tool ?? null;
}
