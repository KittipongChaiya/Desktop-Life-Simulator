/**
 * Composing the tints that paint the ground. Phase-33 — ADR-041, ADR-021 §6.
 *
 * ADR-021 §6 gave the terrain ONE tint slot, because there was one thing
 * tinting it: the season. Phase-33 adds weather, and two sources multiplying
 * into one slot is a composition rule — small, but the kind of arithmetic that
 * is wrong in a way nobody notices until autumn rain looks like summer.
 *
 * MULTIPLY, because that is what the GPU does with `sprite.tint` and what the
 * existing values already assume: white means "leave the art alone", so a
 * neutral source composes to a no-op without needing a special case. It is
 * also commutative and associative, so nothing depends on the order the
 * sources are listed in, and adding a third one later changes no call site.
 */

/** Neutral: the tint that changes nothing. */
export const NO_TINT = 0xffffff;

/**
 * Multiplies packed `0xRRGGBB` tints, channel by channel.
 *
 * Rounds rather than truncating, so composing two neutral-ish tints cannot
 * drift the ground a shade darker every time a source is added.
 */
export function composeTints(...tints: readonly number[]): number {
  let red = 255;
  let green = 255;
  let blue = 255;

  for (const tint of tints) {
    red = Math.round((red * ((tint >> 16) & 0xff)) / 255);
    green = Math.round((green * ((tint >> 8) & 0xff)) / 255);
    blue = Math.round((blue * (tint & 0xff)) / 255);
  }

  return (red << 16) | (green << 8) | blue;
}
