// Must trip: the wildfire column sent whenever the check answered, shown or not.
declare const fireStatus: string
declare const fireWarnings: Map<string, number>
export const warnings = fireStatus === 'ready' ? fireWarnings : null
