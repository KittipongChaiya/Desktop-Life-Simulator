/**
 * Item icon. Phase-05d.
 *
 * Renders an item's icon in the DOM by slicing the `ui-world` texture atlas with
 * CSS — the atlas is authored for PixiJS, but a React panel can still use one
 * frame of it via `background-position`, so the same placeholder art serves both
 * (ASSETS.md §5). The frame is derived from the item id by convention:
 * `core:turnip` → `item_turnip.png`, matching `items.ts`.
 *
 * `image-rendering: pixelated` keeps the pixel art crisp when scaled (ASSETS §8).
 */

import atlasData from '@assets/ui-world.json';
import atlasImage from '@assets/ui-world.png';
import type { CSSProperties, ReactNode } from 'react';

interface AtlasFrame {
  readonly frame: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  };
}
interface Atlas {
  readonly frames: Record<string, AtlasFrame>;
  readonly meta: { readonly size: { readonly w: number; readonly h: number } };
}

const atlas = atlasData as Atlas;

/** Rendered pixel size; a 2× integer scale of the 16px source (ASSETS §8). */
const ICON_SIZE = 32;

/**
 * Any `ui-world` atlas frame, CSS-sliced. `ItemIcon` is the item-id
 * convenience over it; the coin readout and other chrome use frames directly
 * (06e).
 */
export function AtlasSprite({
  frameName,
  size = ICON_SIZE,
}: {
  frameName: string;
  size?: number;
}): ReactNode {
  const frame = atlas.frames[frameName]?.frame;
  if (frame === undefined) {
    // Unknown frame → a neutral box rather than a broken image.
    return (
      <span
        style={{
          width: size,
          height: size,
          background: 'rgba(255,255,255,0.08)',
          display: 'inline-block',
        }}
      />
    );
  }

  const scale = size / frame.w;
  const style: CSSProperties = {
    display: 'inline-block',
    width: size,
    height: size,
    backgroundImage: `url(${atlasImage})`,
    backgroundPosition: `-${frame.x * scale}px -${frame.y * scale}px`,
    backgroundSize: `${atlas.meta.size.w * scale}px ${atlas.meta.size.h * scale}px`,
    backgroundRepeat: 'no-repeat',
    imageRendering: 'pixelated',
  };
  return <span style={style} aria-hidden />;
}

export function ItemIcon({ item, size }: { item: string; size?: number }): ReactNode {
  const name = item.includes(':') ? item.slice(item.indexOf(':') + 1) : item;
  return <AtlasSprite frameName={`item_${name}.png`} size={size ?? ICON_SIZE} />;
}
