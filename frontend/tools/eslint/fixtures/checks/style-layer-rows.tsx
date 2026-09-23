// Must trip: a row spread in and out, and a player row with a note.
export const App = () => {
  const MAP_LAYERS = [
    { key: 'player', label: 'Forecast player', note: 'Not available.' },
    ...(radar ? [{ key: 'radar', label: 'Rain radar' }] : []),
  ]
  return MAP_LAYERS
}
