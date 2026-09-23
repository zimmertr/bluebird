// Must trip: a history write that is not the debounced one.
export function sync(url: string) {
  return () => window.history.replaceState(null, '', url)
}
export const other = (url: string) => window.history.replaceState(null, '', url)
