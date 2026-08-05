/**
 * NEXRAD composite radar, as a fixed set of raster-tile frames.
 *
 * The tiles come from Iowa Environmental Mesonet, straight to the browser: they
 * are keyless, CORS-open, and cached for five minutes at the edge, so unlike
 * the fire and smoke overlays there is nothing for the pod to hold. IEM asks
 * only that applications with "thousands of simultaneous users" stay away,
 * which an off-by-default toggle on a hobby-scale site respects.
 *
 * **What is being shown is observation, not forecast.** N0Q is the base
 * reflectivity mosaic — where rain is falling now and for the last hour.
 * Everything else in Bluebird is a model's opinion about the future; this is
 * the one layer that is a measurement of the present, which is why it never
 * mixes into a ranking and only ever draws on the map.
 *
 * ## Why relative offsets rather than timestamps
 *
 * IEM serves two addressing schemes and only one of them is documented for this
 * mosaic. The `nexrad-n0q-900913[-mXXm]` family below asks for "the composite as
 * of N minutes ago" and is what the service publishes. The other form, an
 * explicit `ridge::USCOMP-N0Q-YYYYMMDDHHMM`, answers 200 for timestamps this
 * mosaic never produced and `USCOMP` is not a documented RIDGE product id: the
 * bytes it returns never matched the composite when compared, so building a
 * loop on it would be building on undefined behavior.
 *
 * Two consequences follow from taking the offsets, and both are deliberate:
 *
 * - **The readout is relative** ("-25 min"), not a clock time. With `mXXm` the
 *   capture moment is only known to within the five-minute step, and printing
 *   "12:40 PM" would be inventing a precision the source does not carry.
 * - **A frame's imagery can move underneath it.** The offsets resolve against
 *   request time, so a pan mid-loop refetches the visible tiles and can pull a
 *   newer mosaic into an older frame's layer. Bounded by refreshing the whole
 *   set on the same five-minute cadence, and cosmetic at worst; engineering
 *   around it would mean the timestamp scheme that does not work.
 *
 * Measured 2026-08-04 against the live service: offsets `m05m` through `m55m`
 * serve, `m60m` is a 404, and tiles are byte-stable when refetched. Adjacent
 * offsets occasionally resolve to the same mosaic (`m10m` and `m15m` were
 * observed identical), which is a property of when the radars ran rather than
 * anything to correct — and one more reason the 10-minute step below costs
 * less than its arithmetic suggests.
 */

/** IEM's tile cache. `{z}/{x}/{y}` are MapLibre's own placeholders. */
const TILE_BASE = 'https://mesonet.agron.iastate.edu/cache/tile.py/1.0.0'

/** Where a click on the radar legend goes. */
export const IEM_HREF = 'https://mesonet.agron.iastate.edu/ogc/'

/**
 * Minutes between frames, and the oldest offset that serves.
 *
 * The reach is the service's: `m55m` serves and `m60m` 404s, so 55 minutes is
 * as far back as this product goes. The step is ours, and it is 10 rather than
 * the composite's own 5-minute cadence because **MapLibre cannot hold twelve
 * raster sources**. Measured against the live service at z11: the first six
 * frames load, the seventh stalls partway, and the remaining five are never
 * requested at all — permanently, with every missing tile answering 200 to a
 * direct fetch and no error anywhere. Raster tiles go through MapLibre's image
 * queue, and a layer parked at `raster-opacity: 0` is exactly the kind of thing
 * it will abort requests for, which is how that queue's slots leak.
 *
 * So the loop is six frames spanning 50 minutes. That halves the sources and
 * halves the ~420 tile requests a full warm-up sends to a donated server, and
 * a 10-minute step still animates a storm — it is what several public radar
 * loops run at. A finer loop is not worth a layer that silently stops loading.
 */
export const RADAR_STEP_MIN = 10
export const RADAR_OLDEST_MIN = 50

/**
 * Frame offsets in minutes, oldest first.
 *
 * Oldest-first because that is playback order, and because index 0 meaning
 * "start of the loop" is what lets the timeline's playhead be a plain array
 * index shared with the forecast axis.
 */
export function radarOffsets(): number[] {
  const out: number[] = []
  for (let m = RADAR_OLDEST_MIN; m >= 0; m -= RADAR_STEP_MIN) out.push(m)
  return out
}

/** How many frames the loop has. */
export const RADAR_FRAME_COUNT = radarOffsets().length

/**
 * The tile-URL template for one frame, with `{z}/{x}/{y}` left for MapLibre.
 *
 * Offset 0 is the bare product id: IEM has no `-m00m` alias, and asking for one
 * 404s the whole newest frame — which is the one frame that must never be
 * missing, since it is what the layer opens on.
 */
export function radarTileUrl(offsetMin: number): string {
  const product = offsetMin === 0 ? 'nexrad-n0q-900913' : `nexrad-n0q-900913-m${pad(offsetMin)}m`
  return `${TILE_BASE}/${product}/{z}/{x}/{y}.png`
}

function pad(minutes: number): string {
  return String(minutes).padStart(2, '0')
}

/** The MapLibre source/layer id for a frame. Derived so the two cannot drift. */
export function radarLayerId(offsetMin: number): string {
  return `radar-${pad(offsetMin)}`
}

/**
 * What the transport prints for a frame.
 *
 * "Now" rather than "-0 min" for the newest, because that is the frame the
 * layer rests on and a minus sign in front of a zero reads as a rounding
 * artifact. Everything else is negative minutes, which says both how old the
 * frame is and that it is behind the present without spending a second line.
 */
export function radarOffsetLabel(offsetMin: number): string {
  return offsetMin === 0 ? 'Now' : `-${offsetMin} min`
}

/** The two ends of the scale under the scrubber. */
export function radarScaleEnds(): [string, string] {
  return [`-${RADAR_OLDEST_MIN} min`, 'Now']
}
