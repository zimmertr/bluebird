// Trips style-no-os-theme: a class keyed to the operating system's theme
// rather than the menu, the query that variant compiles to, and the same
// query asked in script anywhere but useTheme.ts (#843).
export const card = 'bg-panel dark:bg-raised'
export const query = '(prefers-color-scheme: dark)'
export const asks = () => matchMedia('(prefers-color-scheme: light)').matches
// Not a variant: values paired by theme, the way chartColors.ts holds them.
export const pair = { dark: 1, light: 2 }
