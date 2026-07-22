/**
 * Ghost projection tests. Phase-05d.
 *
 * `ghostFor` is the pure bridge from presentation state (active building +
 * hovered tile) to what the renderer draws (a tinted building ghost). It runs
 * the command validator to decide the tint, so the ghost is legal exactly when
 * the placement would be — the same rule set, never a copy (ADR-010 §6).
 */

import { describe, expect, it, vi } from 'vitest';

import { appError, ErrorCode } from '../../shared/errors';
import { asContentId, asTileIndex } from '../../shared/ids';
import { err, ok } from '../../shared/result';
import type { Command } from '../../sim/commands/types';

import { ghostFor } from './placement-preview';

const SHED = asContentId('core:storage_shed');
const TILE = asTileIndex(123);

const accepts = () => ok();
const rejects = () => err(appError(ErrorCode.TileNotOwned, 'outside the plot'));
const spriteOf = () => 'buildings:storage_shed';

describe('ghostFor', () => {
  it('draws nothing when no building is being placed', () => {
    expect(ghostFor(null, TILE, accepts, spriteOf)).toBeNull();
  });

  it('draws nothing when the pointer is off the world', () => {
    expect(ghostFor(SHED, null, accepts, spriteOf)).toBeNull();
  });

  it('projects a valid ghost when placement would be accepted', () => {
    expect(ghostFor(SHED, TILE, accepts, spriteOf)).toEqual({
      tile: TILE,
      sprite: 'buildings:storage_shed',
      valid: true,
    });
  });

  it('projects an invalid ghost when placement would be rejected', () => {
    expect(ghostFor(SHED, TILE, rejects, spriteOf)?.valid).toBe(false);
  });

  it('validates the placeBuilding command for the active building and hovered tile', () => {
    const preview = vi.fn<(command: Command) => ReturnType<typeof accepts>>(accepts);
    ghostFor(SHED, TILE, preview, spriteOf);
    expect(preview).toHaveBeenCalledWith({ type: 'placeBuilding', tile: TILE, buildingId: SHED });
  });
});
