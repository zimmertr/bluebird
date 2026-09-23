// Must trip: a pair colour read by indexing the map, and no pairColor.
export const color = (row: { k: string }) => chartColors[pairKey(row.k, row.k)]
