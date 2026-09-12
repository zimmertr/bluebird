import { describe, expect, it } from 'vitest'

// Branding lint: no new identifier may carry the pre-rename spelling.
//
// The product is Bluebird Forecast (#312). localStorage keys are
// `bluebird_forecast_*` and the CSV download is `bluebird-forecast-results-...`.
// Every source file under src/ is read as text (the `?raw` trick styles.test.ts
// and metrics.test.ts use), so a key or filename typed from an older issue fails
// here instead of shipping. Test files are skipped: they quote the patterns.
//
// Repository, image, chart and Kubernetes names are deliberately not linted:
// they keep their old spellings until #311, #111 and #315 ship.
const sources = import.meta.glob('./**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

// Spelled in pieces so this file's own text never matches the patterns.
const OLD = 'blue' + 'bird'
const BANNED: Record<string, RegExp> = {
  'storage key with the old prefix': new RegExp(`['"\`]${OLD}_(?!forecast[_.])[a-z]`),
  'CSV filename with the old prefix': new RegExp(`${OLD}-results`),
}

describe('branding', () => {
  it('no source file spells a pre-rename identifier', () => {
    const violations: string[] = []
    for (const [path, text] of Object.entries(sources)) {
      if (path.endsWith('.test.ts')) continue
      for (const [what, pattern] of Object.entries(BANNED)) {
        const m = pattern.exec(text)
        if (m) {
          const line = text.slice(0, m.index).split('\n').length
          violations.push(`${path}:${line}: ${what}: ${m[0]}`)
        }
      }
    }
    expect(violations, 'use bluebird_forecast_ / bluebird-forecast-').toEqual([])
  })

  it('reads the files it claims to lint', () => {
    expect(Object.keys(sources).some((p) => p.endsWith('/App.tsx'))).toBe(true)
    expect(Object.keys(sources).some((p) => p.endsWith('/utils/resultsCsv.ts'))).toBe(true)
  })
})
