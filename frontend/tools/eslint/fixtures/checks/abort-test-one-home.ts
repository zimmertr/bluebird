// Must trip: a cancel told by its name, and by its class. Building one must
// not report.
export const named = (e: Error) => e.name === 'AbortError'
export const classed = (e: unknown) => e instanceof DOMException
export const cancel = () => new DOMException('Aborted', 'AbortError')
