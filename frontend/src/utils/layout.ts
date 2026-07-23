// Height a resizable bottom panel (the results table or the comparison chart)
// should settle at after a vertical drag. Two clamps apply: the panel stays at
// least `floorPx` tall to remain usable, and the map above it keeps at least
// `mapMinPx`. The map floor matters because its legend is bottom-anchored and
// would ride up over the top-anchored search box if the map got too short.
// `reservedPx` is the height already taken below the map by the sibling panel
// and any preview banner, so the two panels together can't crowd the map out.
// `dragUpPx` is the drag distance with up positive (drag the handle up to grow).
export function clampPanelHeight(
  startHeight: number,
  dragUpPx: number,
  reservedPx: number,
  viewportPx: number,
  mapMinPx = 280,
  floorPx = 120,
): number {
  const ceil = Math.max(floorPx, viewportPx - mapMinPx - reservedPx)
  return Math.max(floorPx, Math.min(startHeight + dragUpPx, ceil))
}
