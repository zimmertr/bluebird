// Must trip: the row colour made fresh per render rather than a useCallback.
declare const chart: { colorFor: (r: object) => string }
export const rowChartColor = (r: object) => chart.colorFor(r)
