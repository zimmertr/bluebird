// Trips style-no-os-theme: a class keyed to the operating system's theme
// rather than the switch, and the query that variant compiles to.
export const card = 'bg-panel dark:bg-raised'
export const query = '(prefers-color-scheme: dark)'
// Not a variant: values paired by theme, the way chartColors.ts holds them.
export const pair = { dark: 1, light: 2 }
