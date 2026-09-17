// Comparator for the results table's column sort, and the null rule the app's
// two orderings share. Extracted from ResultsTable so the ordering rules are
// unit-testable under the node-env Vitest (no jsdom).
//
// Two rules beyond a plain compare:
//   1. Nulls sort last in BOTH directions — a metric can be null (e.g. AQI past
//      its forecast horizon), and those rows should stay at the bottom whether
//      the column is ascending or descending, not flip to the top on desc.
//   2. Strings use numeric collation, so "10. Peak" sorts after "2. Peak" (and a
//      pasted CSV numbered 1..100 reads 1,2,…,10,…,100 rather than 1,10,100,2).
//      Plain numbers keep a straight numeric compare.

/**
 * Rule 1 on its own: where a null goes, once at least one side is one.
 *
 * Two comparators encode it — this file's column sort and `rankComparator` in
 * clientAnalyze.ts, which is a byte-for-byte port of the backend's `_sort_key`.
 * They reached the same answer by different arithmetic, which is two chances to
 * drift on a rule the table and the ranking have to agree on (#388). The
 * direction is deliberately not a parameter: a null is last whichever way the
 * column points, and passing `dir` in would invite the bug.
 *
 * The `aNull || bNull` guard stays at each call site rather than moving in
 * here, because in clientAnalyze.ts that guard is what narrows the two values
 * to numbers for the compare below it. Two non-nulls would tie here.
 */
export function nullsLast(aNull: boolean, bNull: boolean): number {
  return Number(aNull) - Number(bNull)
}

export function compareValues(av: unknown, bv: unknown, dir: 'asc' | 'desc' = 'asc'): number {
  const aNull = av == null
  const bNull = bv == null
  if (aNull || bNull) return nullsLast(aNull, bNull)
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
