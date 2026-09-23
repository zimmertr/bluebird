import { describe, expect, it } from 'vitest'
// `?raw` gives the file's text without executing it. Every other rule this file
// held is an ESLint check now (tools/eslint/checks/app.js); the map's memo stays
// a test while MapView.tsx is being split into src/map/.
import mapViewSource from './components/MapView.tsx?raw'

// `ResultsTable`, `TimeSeriesChart` and `MapView` are wrapped in `React.memo`,
// and App.tsx hands them only stable props. The other two are held by the
// `app-memoized` check.
describe('the memoized map', () => {
  it('is actually memoized', () => {
    expect(mapViewSource).toContain('export default memo(MapView)')
  })
})
