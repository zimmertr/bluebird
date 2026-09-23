// Must trip: a reorder surface that asks the gesture module nothing and
// commits every release, moved or not.
export function onRelease(key: string, landing: string, onColumnMove: (a: string, b: string) => void) {
  if (landing) onColumnMove(key, landing)
}
