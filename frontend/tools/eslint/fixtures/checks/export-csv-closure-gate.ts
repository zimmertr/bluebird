// Must trip: the Closure column sent whenever the check answered, shown or not.
declare const closureStatus: string
declare const closureWarnings: Map<string, number>
export const warnings = closureStatus === 'ready' ? closureWarnings : null
