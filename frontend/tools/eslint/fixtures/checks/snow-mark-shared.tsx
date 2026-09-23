// Must trip: the mark and the ceiling spelled here, and no shared module read.
export const cell = (inches: number) => (inches >= 1290 ? '≥ 1,290' : String(inches))
