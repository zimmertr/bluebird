import { SLOPE_BANDS, bandOf, compassPoint, type GroundReading } from '../slopeAngle'
import { colorSwatch, factValue, pendingValue } from './popupChrome'

/**
 * What a card knows of the ground under its point (#832): still reading, read,
 * or nothing to say, where no elevation tile covers the point or the read
 * failed. Every card that names a place reads the same slope at its point, so
 * the state and the way it is said are one module's.
 */
export type GroundState = { kind: 'pending' } | { kind: 'read'; reading: GroundReading } | { kind: 'none' }

/**
 * The slope as a card's facts say it: its band's swatch, the angle, and the
 * way the ground falls, as `[swatch] 33° NW`. The angle is the whole degree
 * under it, so the number and the swatch agree at a band's edge, where each
 * band holds its lower edge: 26.9 reads 26° with no swatch and 27.0 reads 27°
 * in yellow. Below 27 the Slope angle layer paints nothing, so there is no
 * swatch, and ground with no fall at all, a lake's flattened surface, names
 * no direction (TJ, 2026-10-31). Bars while the tile is read, and nothing
 * where there is nothing to say.
 */
export function slopeFact(ground: GroundState | undefined): string {
  if (!ground || ground.kind === 'none') return ''
  if (ground.kind === 'pending') return pendingValue()
  const { degrees, aspect } = ground.reading
  const angle = Math.floor(degrees)
  const band = bandOf(angle)
  return `${band < 0 ? '' : colorSwatch(SLOPE_BANDS[band].color)}${factValue(`${angle}°`)}${
    aspect === null ? '' : ` ${compassPoint(aspect)}`
  }`
}
