import { pixiManifest } from '@assetpack/core/manifest';
import { texturePacker } from '@assetpack/core/texture-packer';

/**
 * Asset pipeline. ADR-006.
 *
 * Directories tagged `{tps}` are packed into a texture atlas — that tag IS the
 * atlas-group boundary (ASSETS.md §4). Grouping is by what is DRAWN TOGETHER,
 * not by asset type: splitting co-drawn sprites across atlases breaks batching,
 * which is the entire reason ADR-001 chose a GPU renderer.
 *
 * The pipe list is composed EXPLICITLY rather than via the `pixiPipes()`
 * convenience bundle. That bundle always includes compression and mipmap pipes
 * regardless of its options, which emit lossy WebP and a 0.5x downscale —
 * both wrong for pixel art, and the 0.5x would be selected on standard-DPI
 * displays, i.e. the common case. PNG at 1x only (ASSETS.md §3, §8).
 *
 * Output is gitignored and fully reproducible via `npm run assets`.
 */
export default {
  entry: './assets/src',
  output: './assets/dist',
  cache: false,
  pipes: [
    texturePacker({
      resolutionOptions: {
        // 1x ONLY. Pixel art authors at 1x; a 0.5x variant is a blurry
        // downscale of art whose entire point is crisp texels, and it would be
        // selected on standard-DPI displays — the common case (ASSETS.md §8).
        resolutions: { default: 1 },
        maximumTextureSize: 2048,
      },
      texturePacker: {
        // 2048 is safe on all integrated GPUs (ADR-006 §3); overflow splits
        // into a numbered sheet rather than raising the cap.
        maximumTextureSize: 2048,
        // 2px padding prevents neighbour-texel bleed at non-integer scales.
        padding: 2,
        // Trimming and rotation both break the fixed 32x32 tile grid the
        // renderer indexes into.
        allowTrim: false,
        allowRotation: false,
      },
    }),
    pixiManifest({ createShortcuts: true, trimExtensions: true }),
  ],
};
