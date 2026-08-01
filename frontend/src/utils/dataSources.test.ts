import { describe, expect, it } from 'vitest'
import { DATA_SOURCES } from './dataSources'

// Two of these entries are attributions ODbL and CC BY require, so the list
// being well-formed is a licensing property, not a cosmetic one. It renders on
// the privacy and terms pages, NOTICES.md transcribes it, and every consumer
// trusts these fields without checking them.
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

  // A named license needs somewhere to be read. Both CC BY versions here ask
  // for the license text or its URI alongside the data, and this list is the
  // only place in the shipped app that can carry it — NOTICES.md is a repo file
  // no visitor is ever served. A name without a URI is exactly the state that
  // failed that, so a new licensed source arrives with one or fails here.
  it('links every license it names', () => {
    const licensed = DATA_SOURCES.filter((s) => s.license)

    expect(licensed.length).toBeGreaterThan(0)
    for (const source of licensed) {
      expect(source.licenseHref, `${source.name} names a license with no URI`).toMatch(
        /^https:\/\//,
      )
    }
  })

  it('leaves the URI off a source that names no license', () => {
    for (const source of DATA_SOURCES) {
      if (!source.license) expect(source.licenseHref).toBeUndefined()
    }
  })

  // House style for anything a user reads. Checked here because legal.test.ts
  // lints component source, and this copy is data those components interpolate
  // at runtime; it never appears in their source text.
  it('uses no em or en dashes', () => {
    for (const source of DATA_SOURCES) {
      expect(`${source.name} ${source.provides} ${source.license ?? ''}`).not.toMatch(/[—–]/)
    }
  })
})
