// Must trip: a drag started outside the ring's handles.
export function mountProbe(map: any) {
  map.on('mousedown', 'probe-layer', () => {})
}
