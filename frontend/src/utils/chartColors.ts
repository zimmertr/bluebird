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
 * The colour a COMPARED model's lines wear (#232).
 *
 * With no comparison up, colour on this chart means the destination and
 * nothing else. A comparison adds a second fact, and colour carries both: the
 * lines drawn from the RANKING model keep their destinations' colours, as the
 * chart always drew them, and every line from a compared model wears one
 * colour for that model across every destination it covers. The hover box and
 * the legend name rank, destination and model on every entry, which is what
 * keeps one model's line findable among the others.
 *
 * That only holds while no model wears a colour a destination on the same
 * chart is already wearing, so this takes the destination colours THEMSELVES
 * rather than a count of them. A count is not enough: chart two destinations
 * and uncheck the first, and one destination is left on screen wearing palette
 * index 1, which is exactly the "next" index after a count of one.
 *
 * The consequence worth knowing is that a model's colour is not a property of
 * the model: charting another destination can move it. That is the price of
 * never colliding, and it is the price the destinations' own ramp already pays.
 */
export function modelColor(
  destinationColors: readonly string[],
  modelIndex: number,
): string {
  const taken = new Set(destinationColors)
  // At most `taken.size` of the indices below are skipped, so this window
  // holds at least `modelIndex + 1` free colours. Bounded rather than "walk
  // until there are enough", so a palette that ever repeated a value could not
  // turn this into a hang.
  const limit = taken.size + modelIndex + 1
  const free: string[] = []
  for (let index = 0; index < limit; index++) {
    const color = colorForIndex(index)
    if (!taken.has(color)) free.push(color)
  }
  return free[modelIndex] ?? colorForIndex(limit)
}
