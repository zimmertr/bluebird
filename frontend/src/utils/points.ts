// Coordinate identity: one answer to "is this the same destination?", and one
// answer to "is this the same set of destinations?".
//
// Two modules spelled the first byte for byte and two spelled the second
// (issue #388). A third, `chartData.ts`'s `chartKey`, is the same idea without
// the rounding and deliberately stays that way; the reason is below. Every
// other caller spells `geoKey`: a map pin, a fire warning and a removal all ask
// the same question of the same two numbers, so a second name for it would only
// suggest they do not.

/**
 * One destination's identity, as a string key.
 *
 * Five decimals is ~1 m. That tolerance is the point rather than a rounding
 * detail: the same destination reaches different surfaces by different routes —
 * echoed back by the API, round-tripped through `urlState`'s `POLY_PRECISION`,
 * re-searched, or typed into the coordinates box — and an exact key would let
 * any of those read as a second destination standing on the first. Nothing in
 * OSM puts two named features within a metre of each other, so the tolerance
 * costs no distinction the app can make.
 *
 * `chartData.ts`'s `chartKey` is the one identity that deliberately does NOT
 * round, and it is not an oversight. It keys what the reader *picked*: the
 * colour a destination wears, the box they ticked, and the group a compared
 * model's rows fall into. Discovery hands it OSM coordinates at seven decimals
 * and dedups unnamed summits by OSM id rather than by coordinate, so two rows
 * really can sit within a metre of each other and really are two answers.
 * Rounding would silently make them one line, one colour and one checkbox.
 * A pin tolerates a coordinate arriving by two routes; a chart line does not
 * tolerate two destinations arriving as one.
 */
export function geoKey(lat: number, lon: number): string {
  return `${lat.toFixed(5)},${lon.toFixed(5)}`
}

/**
 * Identity of a SET of items, independent of their order.
 *
 * Every caller is an effect dependency rather than a lookup. The arrays these
 * describe are re-derived per render — once per live knob change, once per
 * keystroke in the coordinates box — so an effect keyed on the array reference
 * re-asked a question whose answer had not moved, and aborted the request
 * already in flight to do it (issue #185). Sorted because a re-rank reorders
 * the same items, which is not a new set.
 */
export function setKey<T>(items: readonly T[], keyOf: (item: T) => string): string {
  return items
    .map((item) => keyOf(item))
    .sort()
    .join('|')
}
