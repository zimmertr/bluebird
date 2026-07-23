// Comparator for the results table's column sort. Extracted from ResultsTable so
// the ordering rules are unit-testable under the node-env Vitest (no jsdom).
//
// Two rules beyond a plain compare:
//   1. Nulls sort last in BOTH directions — a metric can be null (e.g. AQI past
//      its forecast horizon), and those rows should stay at the bottom whether
//      the column is ascending or descending, not flip to the top on desc.
//   2. Strings use numeric collation, so "10. Peak" sorts after "2. Peak" (and a
//      pasted CSV numbered 1..100 reads 1,2,…,10,…,100 rather than 1,10,100,2).
//      Plain numbers keep a straight numeric compare.
export function compareValues(av: unknown, bv: unknown, dir: 'asc' | 'desc' = 'asc'): number {
  const aNull = av == null
  const bNull = bv == null
  if (aNull && bNull) return 0
  if (aNull) return 1 // a after b, regardless of dir
  if (bNull) return -1
  const cmp =
    typeof av === 'number' && typeof bv === 'number'
      ? av < bv
        ? -1
        : av > bv
          ? 1
          : 0
      : String(av).localeCompare(String(bv), undefined, { numeric: true })
  return dir === 'asc' ? cmp : -cmp
}
