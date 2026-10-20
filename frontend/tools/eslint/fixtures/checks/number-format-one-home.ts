// Must trip: a bare toLocaleString and an en-US one. A date phrase with its
// options bag must not.
export const count = (n: number) => n.toLocaleString()
export const cap = (n: number) => n.toLocaleString('en-US')
export const when = (d: Date) => d.toLocaleString([], { month: 'short' })
