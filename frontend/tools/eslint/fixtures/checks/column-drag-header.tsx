// Must trip: a header drag tracked on the cell, a resize that reaches the
// reorder, and no touch hold.
export function beginColumnResize(e: PointerEvent, cell: HTMLElement) {
  cell.addEventListener('pointermove', () => e.preventDefault())
}
