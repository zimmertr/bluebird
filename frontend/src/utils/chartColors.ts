// Categorical line colors for the comparison chart. Deliberately separate from
// colors.ts, which encodes metric *intensity* (green→red) on the map and table.
// Here each destination just needs its own distinguishable hue.

// A curated, reasonably colorblind-aware palette used first — where distinction
// matters most (the common case of a handful of lines).
const BASE_PALETTE = [
  '#38bdf8', // sky
  '#f472b6', // pink
  '#a3e635', // lime
  '#fbbf24', // amber
  '#c084fc', // purple
  '#34d399', // emerald
  '#fb923c', // orange
  '#60a5fa', // blue
  '#e879f9', // fuchsia
  '#2dd4bf', // teal
] as const

export const BASE_PALETTE_SIZE = BASE_PALETTE.length

function hslToHex(h: number, s: number, l: number): string {
  s /= 100
  l /= 100
  const k = (n: number) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const c = l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))
    return Math.round(255 * c)
      .toString(16)
      .padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}

// Past the curated palette, walk the hue wheel by the golden angle so each new
// line lands ~137.5° from the previous — maximally spaced for any count. Always
// hex, so the same value drives the swatch, the `<input type="color">`, and the
// Recharts stroke.
function generatedHex(index: number): string {
  return hslToHex((index * 137.508) % 360, 70, 60)
}

export function colorForIndex(index: number): string {
  return index < BASE_PALETTE.length ? BASE_PALETTE[index] : generatedHex(index)
}

/**
 * Give every key that has none a colour, continuing one session-long sequence.
 *
 * This is the app's ONE colour allocator and it hands out to two kinds of key:
 * a charted destination (by `chartKey`), and a (destination, compared model)
 * pair on the comparison chart (by `pairKey`). One counter for both is the
 * whole point — two allocators over one palette would eventually hand the same
 * colour to a destination and to a line standing beside it, which is exactly
 * what a comparison must never do.
 *
 * Monotonic in what is already assigned, so a colour is allocated once and
 * kept: a line never changes hue because another was added or taken away, and
 * a destination unselected and selected again comes back the colour it was.
 * That memory is the caller's — it holds the map — and this only ever adds.
 *
 * Returns the map it was given when every key already has one, so a caller can
 * skip the write rather than setting state on a render that allocated nothing.
 */
export function allocateColors(
  assigned: Readonly<Record<string, string>>,
  keys: readonly string[],
): Record<string, string> {
  const missing = keys.filter((key, i) => !assigned[key] && keys.indexOf(key) === i)
  if (missing.length === 0) return assigned as Record<string, string>
  const next = { ...assigned }
  let n = Object.keys(next).length
  for (const key of missing) {
    next[key] = colorForIndex(n)
    n++
  }
  return next
}
