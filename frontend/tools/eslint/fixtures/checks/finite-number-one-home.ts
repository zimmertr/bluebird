// Must trip: a null test beside Number.isFinite. A plain Number.isFinite on a
// value typed number, and a test beside some other comparison, must not.
export const usable = (v: number | null) => v != null && Number.isFinite(v)
export const plain = (v: number) => Number.isFinite(v)
export const filled = (s: string, v: number) => s !== '' && Number.isFinite(v)
