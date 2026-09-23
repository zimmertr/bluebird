// Must trip: the colour map indexed twice, and never through pairColor.
export const a = (colors: Record<string, string>, k: string) => colors[k]
export const b = (colors: Record<string, string>, k: string) => colors[k + '|']
