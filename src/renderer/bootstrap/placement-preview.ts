/**
 * The build ghost's projection. Phase-05d.
 *
 * Pure bridge from presentation state — the active building and the hovered
 * tile — to what the renderer draws. It runs the command validator (`preview`,
 * ADR-010 §6) to decide the tint, so a green ghost means the placement would be
 * accepted and an amber one means it would be rejected, by the SAME rule the
 * dispatch path uses. No copy of the placement rules lives here.
 *
 * Kept apart from both the controller and the DOM wiring so this decision is a
 * plain function over four values, testable without a world or a renderer.
 */

import type { ContentId, TileIndex } from '../../shared/ids';
import type { Command, ValidationResult } from '../../sim/commands/types';
import type { GhostState } from '../render/building-ghost';

/**
 * The ghost to draw, or null to draw nothing.
 *
 * Null whenever there is nothing to preview: no building armed, or the pointer
 * is off the world.
 */
export function ghostFor(
  active: ContentId | null,
  hovered: TileIndex | null,
  preview: (command: Command) => ValidationResult,
  sprite: (buildingId: ContentId) => string,
): GhostState | null {
  if (active === null || hovered === null) return null;

  const command: Command = { type: 'placeBuilding', tile: hovered, buildingId: active };
  return { tile: hovered, sprite: sprite(active), valid: preview(command).ok };
}
