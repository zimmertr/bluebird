import { ColorScale, LabelledScale } from './colors'

/**
 * A colour scale drawn as one strip with its numbers inside it (#454).
 *
 * Every key on the map that is a SCALE rather than a single value is drawn this
 * way: the five ranking metrics and the snow depth overlay. It started as the
 * snow overlay's own shape (#446), because eleven bands of depth could not be
 * said by the 14px chip the single-value layers key on — and the metric key,
 * which was six rows of swatch-and-range, cost about 130px of a map that can be
 * 161px tall on a phone. One line says the same scale.
 *
 * The strip is ALWAYS equal-width per band, never to scale. Snow's boundaries
 * run 0.39 to 787 in eleven steps and precipitation's run 0.01 to 1.00 in five,
 * so a strip drawn to scale would be most of its bands in the first few pixels.
 * What a reader takes off it is which band a colour is in, and equal widths are
 * what make that readable.
 *
 * Every strip blends, and every strip is equal-width per band — see
 * {@link rampCss}.
 */

/**
 * A number on the scale under a strip: where it sits, what it reads, and which
 * way it hangs.
 *
 * `at` is a position in BANDS, not in pixels: 0 is the strip's left edge and
 * the band count its right one, so a tick lands on the boundary it names
 * however wide the legend box is. On a blended strip that boundary carries a
 * band's ANCHOR colour, which is why a caller passes `i + 1` for band `i`.
 *
 * `align` is how the label meets that boundary: centred on it, or hung from the
 * end of the strip. There is no `start`, because nothing passes `at` 0 (#460).
 */
export interface RampTick {
  readonly at: number
  readonly label: string
  readonly align: 'center' | 'end'
}

/**
 * The band colours as one CSS background: always a continuous ramp.
 *
 * **One drawing for every scale on the map** (TJ, 2026-09-22). The snow strip
 * was hard-stopped until #460, because NOAA's bands are a classification and a
 * gradient between them shows depths NOAA never assigned a colour to. That is
 * still true and is the accepted cost: two strips in one legend box, one of
 * blocks and one of gradient, read as two different systems, and the reader
 * meets the box before they meet the distinction.
 *
 * The ramp mirrors `interpolateRgb` in `colors.ts` exactly, which is what makes
 * a metric strip a picture of its own markers: everything at or below the first
 * threshold takes the first anchor, which is why band 0 is flat, and each later
 * band runs from one anchor to the next. The last band is where that function
 * extrapolates over one more band width and then clamps; the strip draws the
 * extrapolation, since the clamp has no width to be drawn in.
 *
 * A band is therefore an ANCHOR at a boundary rather than a block between two,
 * and colour `i` lands at boundary `i + 1`. Every caller's ticks are placed
 * against that, {@link rampTicks}.
 */
export function rampCss(colors: readonly string[]): string {
  const n = colors.length
  const at = (i: number) => `${(i / n) * 100}%`
  const stops = [`${colors[0]} 0%`, ...colors.map((color, i) => `${color} ${at(i + 1)}`)]
  return `linear-gradient(90deg,${stops.join(',')})`
}

/**
 * The numbers on that strip, from the boundaries a caller chose to print.
 *
 * Two rules, and both were measured on the snow strip before they were shared:
 *
 * **A tick is a bare number.** Its section's label carries the unit —
 * `Temperature (°F)`, `Snow depth (in)` — so a unit here would be the second
 * spelling on one key, and it costs the strip's widest label three characters
 * it has no room for (TJ, 2026-09-17). `AQI` is the section with nothing to
 * state, the index being a plain index.
 *
 * **A tick is CENTRED on its boundary, and the last one hangs from the end.**
 * Centring is what a colour bar's numbers do and what keeps two of them apart:
 * left-aligned, the freezing level's `12,000` ran within 4px of the `20,000`
 * beside it, where centred it clears by 20 (measured in Chrome, 2026-09-17).
 * The last tick is the exception because its label is wider than a band and its
 * boundary is one band in from the right edge, so centred it would run past the
 * legend box; hung from the end it also reads the way the top band behaves,
 * which is `50` and above.
 *
 * There is no START case. The snow strip had the one tick that needed it while
 * it was hard-stopped, and a blended strip moved that tick a boundary right
 * (#460), so nothing now passes `at` 0.
 */
export function rampTicks(
  marks: readonly { readonly at: number; readonly text: string }[],
): RampTick[] {
  return marks.map((mark, i) => {
    const last = i === marks.length - 1
    return {
      at: mark.at,
      label: mark.text,
      align: last ? ('end' as const) : ('center' as const),
    }
  })
}

/** A ranking metric's scale as a strip. */
export function scaleRampCss(scale: ColorScale): string {
  return rampCss(scale.colors)
}

/**
 * A ranking metric's ticks: every OTHER band boundary, which on a six-band
 * scale is three — its bottom, its middle and its top.
 *
 * **Five would not fit, and that is measured rather than assumed.** A metric
 * scale has six bands where the snow scale has eleven, so its five boundaries
 * land 27px apart across a 162px strip, and at the 10px step the row is set in
 * the widest of them are wider than that: the freezing level's
 * `4,000 8,000 12,000 16,000 20,000` overlapped into one run of digits and
 * the AQI's last two ran together (Chrome, 2026-09-17; `4,000` alone measures
 * 28.2px). Three sit 54px apart, which every scale clears with at least 20px
 * to spare, the freezing level included.
 *
 * Three rather than a per-scale count that prints as many as happen to fit:
 * that needs a table of per-character advances in a module with no DOM, which
 * is a font measurement pretending to be a constant and would silently start
 * clipping the first time a face or a box width moved. One measured number with
 * its measurement written down is the boring answer and it is the right one.
 *
 * What three numbers cost is the exact boundary of two bands, and what they buy
 * is a row a reader can read at all. It is the same trade the snow strip makes
 * with four numbers over eleven bands.
 *
 * Threshold `i` is the bottom of band `i + 1`, so that is the column the tick
 * sits in: the first hangs one band in from the left, which is where the first
 * band stops meaning "at or below".
 *
 * **The numbers are the thresholds themselves, formatted rather than written.**
 * A tick that restated a threshold could disagree with it, which is the bug the
 * band captions here were carrying by hand until #454.
 *
 * **No unit on the ticks.** The section's label carries it, as
 * `Temperature (°F)` — `metricLabel` in `metrics.ts`, the same composer the
 * table headers use, reading `scale.unit` so playback's swap to `in/hr` moves
 * the label with the bands (TJ, 2026-09-17). It keeps the strip's widest label
 * three characters shorter, and it is why `AQI` reads as a bare noun: the index
 * is unitless, so the label is the metric's name and the ticks are numbers.
 */
export function scaleTicks(scale: LabelledScale): RampTick[] {
  const digits = Math.max(...scale.thresholds.map(decimalsOf))
  const last = scale.thresholds.length - 1
  return rampTicks(
    scale.thresholds
      // Every other boundary, and the top one whether or not the count lands on
      // it: the scale's ceiling is the number a reader checks first, and a
      // strip that stopped naming numbers one band short of its end would read
      // as a scale that had been cut off.
      .map((value, i) => ({ value, i }))
      .filter(({ i }) => i % 2 === 0 || i === last)
      .map(({ value, i }) => ({
        at: i + 1,
        // en-US rather than the reader's locale: every other number this app
        // prints is formatted the same way, and a strip whose ticks grouped on
        // a different separator from the table beside it would read as two
        // scales.
        text: value.toLocaleString('en-US', {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        }),
      })),
  )
}

/**
 * How many decimals a scale prints, taken from the finest threshold it has.
 *
 * One answer for the whole scale rather than one per tick, because a row
 * reading `0.01 0.10 0.25 0.50 1.00` is one scale and `0.01 0.1 0.25 0.5 1` is
 * five unrelated numbers.
 */
function decimalsOf(value: number): number {
  const text = String(value)
  const dot = text.indexOf('.')
  return dot < 0 ? 0 : text.length - dot - 1
}
