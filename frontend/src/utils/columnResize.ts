// Column-width arithmetic for the results table (#242 review).
//
// The DOM work — measuring headers, tracking a drag, reading a column's
// cells — stays in ResultsTable; everything that decides a NUMBER lives here,
// because Vitest runs with no DOM and logic left in the component is
// untestable by construction (the listbox/calendar split, applied again).
//
// The width model: `columnWidths` holds only columns someone has decided —
// a drag, a double-click auto-fit, or the automatic Name narrowing below.
// A column absent from the map keeps its natural auto-layout width, so the
// table never needs a seeding pass over every column.

/**
 * The floor a drag or an auto-fit can reach. Below ~3ch a numeric column
 * shows nothing but its ellipsis, which reads as data loss rather than a
 * narrow column; 48px also keeps the resize handle itself grabbable.
 */
export const MIN_COL_PX = 48

/** The ceiling: past this a runaway drag just costs scroll distance. */
export const MAX_COL_PX = 640

export function clampColWidth(px: number): number {
  return Math.max(MIN_COL_PX, Math.min(Math.round(px), MAX_COL_PX))
}

/** A drag in progress: the width it started from plus the pointer's travel. */
export function dragWidth(startPx: number, dxPx: number): number {
  return clampColWidth(startPx + dxPx)
}

/**
 * Double-click auto-fit: wide enough for the longest cell, and no wider.
 *
 * Inputs are the FRACTIONAL content widths of every cell in the column,
 * header included (getBoundingClientRect, not the integer scroll metrics).
 * Ceiling rather than a pad: the width only has to clear the true content
 * width for the ellipsis never to fire, and any fixed pad made the first
 * double-click visibly widen a column whose header was already its longest
 * content — fit must be idempotent from the natural width onward.
 */
export function autoFitWidth(contentWidths: readonly number[]): number {
  return clampColWidth(Math.ceil(Math.max(0, ...contentWidths)))
}

/**
 * The Name column's opening width: 75% of what its content would take.
 *
 * Names are the widest column and the least numeric — a cut-off name is
 * recoverable (resize, or read the popup) where a cut-off number is wrong, so
 * Name gives up a quarter of its natural width to keep more metric columns on
 * a phone screen. Applied once per session, only while the user has not sized
 * the column themselves.
 */
export const NAME_DEFAULT_SCALE = 0.75

export function defaultNameWidth(naturalPx: number): number {
  return clampColWidth(naturalPx * NAME_DEFAULT_SCALE)
}
