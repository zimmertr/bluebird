// Must trip: a module that calls the browser primitive itself.
export const load = () => fetch('/api/destinations')
export const alsoLoad = () => window.fetch('/api/wildfires')
