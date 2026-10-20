import { hexToRgb } from '../utils/colors'
import { roundTo } from '../utils/numbers'

// WCAG 2's contrast measurement over a '#rrggbb' hex, which every suite that
// pins a measured ratio reads. One module because three suites each spelled
// the same formula, and a copy that drifted would pin a number WCAG never gave.

/** WCAG 2 relative luminance: each channel linearised, then weighted. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** The WCAG 2 contrast ratio of two colours, lighter over darker, 1 to 21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** `hex` at `alpha` over `under`, composited the way a browser paints an opacity, as a hex. */
export function mixOver(hex: string, under: string, alpha: number): string {
  const bottom = hexToRgb(under)
  const mixed = hexToRgb(hex).map((v, i) => Math.round(alpha * v + (1 - alpha) * bottom[i]))
  return `#${mixed.map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

/** A ratio at two decimal places, which every measured table in the suites is written to. */
export function round2(v: number): number {
  return roundTo(v, 2)
}
