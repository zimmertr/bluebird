// Must trip: both blockers reworded.
declare const NOUN: { aqi: string; freeze: string }
declare const listPhrase: (names: string[]) => string
export const aqi = `${NOUN.aqi} cannot be compared.`
export const freeze = (freezeGaps: string[]) => `${NOUN.freeze} is missing for ${listPhrase(freezeGaps)}.`
