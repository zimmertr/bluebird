/**
 * One colour for both themes, written as the CSS that picks between them
 * (#786): `light-dark()` resolves against the element's `color-scheme`, which
 * the root sets with the theme (`index.css`). A ranked cell, a chart line or
 * a swatch carries one string that never changes, so a theme switch repaints
 * it in the style recalculation that repaints every token, and nothing has to
 * re-render for it. The theme reaching each row and line as a prop cost 341 ms
 * of rendering per switch at 946 rows (measured 2026-10-21).
 *
 * The two values are the ones each owner already measures per theme
 * (`colors.ts` for a cell's ink, `chartColors.ts` for the chart's). A pair
 * that agrees is returned bare.
 */
export function themed(light: string, dark: string): string {
  return light === dark ? dark : `light-dark(${light}, ${dark})`
}
