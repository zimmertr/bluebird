// The plain numeric rules the app spells in many places: bound a number,
// test that a value is a usable one, round it, and group it for a reader.
// One home, because each was spelled in several shapes that agreed only
// where nobody looked (an inverted range, a negative tie), and the linter's
// `clamp-one-home`, `finite-number-one-home`, `round-one-home` and
// `number-format-one-home` checks fail a new spelling anywhere else.

/**
 * `value` bounded to `[lo, hi]`.
 *
 * `lo` wins when the range is inverted (`hi < lo`), the answer the inline
 * shapes this replaced gave wherever such a range could be reached, and a NaN
 * passes through as NaN, so a caller that has no number keeps having none.
 */
export function clamp(value: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(value, hi))
}

/**
 * Whether a value is a finite number, narrowed for the type checker.
 *
 * `Number.isFinite` already refuses null, undefined and strings without
 * coercing them, but its lib type is no guard, which is what every
 * `x != null && Number.isFinite(x)` this replaced was spelled for.
 */
export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * `x` rounded to `digits` decimal places, halves away from zero.
 *
 * Rounds the magnitude and puts the sign back, so a tie rounds the same way
 * on either side of zero: every US longitude is negative, and the bare
 * `Math.round(x * 10 ** n) / 10 ** n` rounds a negative tie toward zero. Not
 * `Number(x.toFixed(n))`: that rounds the binary value, which sits just under
 * a decimal tie as often as not, so 1.45 to one place is 1.4 there and 1.5
 * here, the answer the app printed before this helper existed.
 * `openMeteoAggregate.roundHalfEven` is a different rule, Python's `round`
 * mirrored, and stays apart.
 */
export function roundTo(x: number, digits: number): number {
  const scale = 10 ** digits
  return (Math.sign(x) * Math.round(Math.abs(x) * scale)) / scale
}

/**
 * A count or a whole number with the reader's own thousands separators.
 *
 * One locale for every grouped number on screen, so a reader whose locale
 * groups with a point never sees `1.500` beside `1,500`. The over-cap refusal
 * is the one exception and spells `en-US` itself, because its sentence mirrors
 * the backend's (mirror row 18). A decimal is not grouped here: it keeps
 * `toFixed`, so its point matches the table's.
 */
export function grouped(n: number): string {
  return n.toLocaleString()
}

/**
 * A number as plain digits, with no thousands separator: the results table's
 * elevation, freezing level and cloud deck cells, and the popup that reads the
 * same formatters (#825; record 0304). `9,415` grouped is a sixth glyph in a
 * column whose every value has four or five digits, so the separator widened
 * every such column by one, and in tabular figures four digits read as a
 * height at a glance without it. A count in a sentence keeps `grouped`.
 */
export function ungrouped(n: number): string {
  return String(n)
}

/**
 * A fixed-point string with its trailing zeros dropped, down to one decimal:
 * `0.000` is `0.0`, `0.050` is `0.05`, `0.123` stays (#825; record 0304). The
 * table's precipitation and snowfall print three decimals for the value that
 * needs them, and a column of `0.000` spent four digits saying nothing. The
 * downloaded file keeps the fixed digits, because a spreadsheet reads them.
 */
export function trimZeros(fixed: string): string {
  if (!fixed.includes('.')) return fixed
  const trimmed = fixed.replace(/0+$/, '')
  return trimmed.endsWith('.') ? `${trimmed}0` : trimmed
}
