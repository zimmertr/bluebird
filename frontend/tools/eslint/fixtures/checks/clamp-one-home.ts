// Must trip: a clamp nested by hand, and a second clamp declared. A min and a
// max that are not a clamp (an extent) must not report.
export const bounded = (v: number) => Math.max(0, Math.min(v, 1))
export const extent = (xs: number[]) => Math.max(...xs) - Math.min(...xs)
export function clamp(v: number): number {
  return v
}
