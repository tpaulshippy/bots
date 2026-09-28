/**
 * Cached measurements of assistant message heights.
 *
 * A measured height is only valid for the width it was taken at, so heights
 * are cached per width rather than per message. The bubble is maxWidth: '85%'
 * of a list row, and the padding on that row differs between the chat screens,
 * so the same content is routinely measured at more than one width. Reusing a
 * height across widths is what clips messages: a frame that is too short cuts
 * the bottom off the text.
 */
export interface Measurement {
  width: number;
  height: number;
  /**
   * False when the report was taken before webfonts had settled. Such a height
   * is still worth showing, but it is not an answer, so a later report that
   * differs by only a pixel or two must still be allowed to replace it.
   */
  final: boolean;
}

const heightCache = new Map<string, Measurement[]>();
const MAX_CACHE_ENTRIES = 200;

export function rememberMeasurements(key: string, measurements: Measurement[]) {
  // Bound the cache without discarding heights that are still in use. Only an
  // insert can grow it, so an update to an existing key must not evict
  // anything: clearing the whole map on the 200th distinct message sent every
  // other cached row back to the placeholder estimate on its next remount.
  if (!heightCache.has(key)) {
    while (heightCache.size >= MAX_CACHE_ENTRIES) {
      const oldest = heightCache.keys().next();
      if (oldest.done) break;
      heightCache.delete(oldest.value);
    }
  } else {
    // Re-insert so a message that is still being used moves to the back of the
    // queue. Map.set on an existing key keeps its original position, which
    // would leave the busiest messages first in line to be evicted.
    heightCache.delete(key);
  }
  heightCache.set(key, measurements);
}

/**
 * The best already-measured height for this message at `width`, if any.
 *
 * A measurement taken at a narrower width is safe to reuse: narrower content is
 * taller, so the frame comes out at worst taller than the text needs and
 * nothing is clipped. One taken at a wider width is not, so it is ignored until
 * the page re-reports at this width.
 */
export function pickMeasurement(
  measurements: Measurement[] | undefined,
  width: number,
): Measurement | undefined {
  if (!measurements || width <= 0) return undefined;
  let best: Measurement | undefined;
  for (const measurement of measurements) {
    if (measurement.width > width) continue;
    if (!best || measurement.width > best.width) best = measurement;
  }
  return best;
}

/** Every width this message has been measured at. */
export function readMeasurements(key: string): Measurement[] | undefined {
  return heightCache.get(key);
}

/** Test seam: the cache is module state, so tests need to start from empty. */
export function resetHeightCache() {
  heightCache.clear();
}
