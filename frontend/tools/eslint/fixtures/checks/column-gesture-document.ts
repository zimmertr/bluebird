// Must trip: a header gesture tracked on the cell.
export function begin(cell: HTMLElement) {
  cell.addEventListener('pointermove', () => {})
}
