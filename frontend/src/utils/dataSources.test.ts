import { describe, expect, it } from 'vitest'
import { DATA_SOURCES } from './dataSources'

// Two of these entries are attributions ODbL and CC BY require, so the list
// being well-formed is a licensing property, not a cosmetic one. It renders in
// three places (panel footer, privacy dialog, privacy page) and every one of
// them trusts these fields without checking them.
describe('data sources', () => {
  it('credits every source with a name and an https link', () => {
    expect(DATA_SOURCES.length).toBeGreaterThan(0)
    for (const source of DATA_SOURCES) {
      expect(source.name.trim(), 'a credit needs something to render').toBe(source.name)
      expect(source.name).not.toBe('')
      expect(source.href, `${source.name} must link over https`).toMatch(/^https:\/\//)
    }
  })

  // A duplicate name renders as the same credit twice; a duplicate href means
  // two names point at one provider, which is how a credit line starts lying
  // about who the data came from.
  it('names and links each source exactly once', () => {
    expect(new Set(DATA_SOURCES.map((s) => s.name)).size).toBe(DATA_SOURCES.length)
    expect(new Set(DATA_SOURCES.map((s) => s.href)).size).toBe(DATA_SOURCES.length)
  })

  // The privacy page renders `provides` as a sentence following the link, so a
  // fragment without a full stop reads as part of the next entry.
  it('says what each source provides, as a sentence', () => {
    for (const source of DATA_SOURCES) {
      expect(source.provides, `${source.name} must say what it provides`).not.toBe('')
      expect(source.provides.endsWith('.'), `${source.name} must end its sentence`).toBe(true)
    }
  })

  it('spells out the licenses that require naming', () => {
    const byName = Object.fromEntries(DATA_SOURCES.map((s) => [s.name, s]))

    expect(byName.OpenStreetMap?.license).toBe('ODbL')
    expect(byName.NIFC?.license).toBe('CC BY 3.0')
  })

  // House style for anything a user reads. Checked here rather than only in
  // legal.test.ts because this copy reaches the panel footer too.
  it('uses no em or en dashes', () => {
    for (const source of DATA_SOURCES) {
      expect(`${source.name} ${source.provides} ${source.license ?? ''}`).not.toMatch(/[—–]/)
    }
  })
})
