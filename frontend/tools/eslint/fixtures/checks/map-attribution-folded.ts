// Must trip: the attribution is added elsewhere and never folded.
export function addAttribution(map: any) {
  map.addControl({}, 'top-left')
}
