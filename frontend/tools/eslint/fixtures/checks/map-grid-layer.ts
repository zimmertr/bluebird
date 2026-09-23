// Must trip: no resampling switch, no hide, and a layer declared visible.
export function mount(map: any) {
  map.addLayer({ id: 'forecast-grid-fill', layout: { visibility: 'visible' } })
}
