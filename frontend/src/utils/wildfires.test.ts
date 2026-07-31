import { describe, it, expect } from 'vitest'
import {
  wildfireQueryUrl,
  formatAcres,
  formatContainment,
  formatRevised,
  wildfirePopupHtml,
  nifcFireUrl,
  isRateLimited,
  fireIdentity,
  COARSE_TOLERANCE_DEG,
} from './wildfires'

// A representative fire-scoped NIFC link, reused by the popup tests.
const NIFC = nifcFireUrl(-121.5, 39.5, 11)

describe('wildfireQueryUrl', () => {
  it('targets Bluebird rather than NIFC', () => {
    // The whole point of #203: a browser calling NIFC directly competes with
    // every other consumer of the public dataset for a quota it cannot see.
    const url = wildfireQueryUrl([-125, 31, -102, 49], 'coarse')
    expect(url.startsWith('/api/wildfires?')).toBe(true)
    expect(url).not.toContain('arcgis.com')
  })

  it('encodes the viewport as west,south,east,north', () => {
    const url = new URL(wildfireQueryUrl([-125, 31, -102, 49], 'coarse'), 'http://x')
    expect(url.searchParams.get('bbox')).toBe('-125,31,-102,49')
  })

  it('names the fidelity it needs', () => {
    const coarse = new URL(wildfireQueryUrl([0, 0, 1, 1], 'coarse'), 'http://x')
    const full = new URL(wildfireQueryUrl([0, 0, 1, 1], 'full'), 'http://x')
    expect(coarse.searchParams.get('detail')).toBe('coarse')
    expect(full.searchParams.get('detail')).toBe('full')
  })
})

describe('COARSE_TOLERANCE_DEG', () => {
  it('matches COARSE_OFFSET_DEG in backend/app/services/nifc.py', () => {
    // A mirrored pair. If the backend simplifies more aggressively than this
    // says, the map silently asks for the coarse copy at zooms where the
    // simplification is visible.
    expect(COARSE_TOLERANCE_DEG).toBe(0.0005)
  })
})

describe('formatAcres', () => {
  it('rounds and thousands-separates a known size', () => {
    expect(formatAcres(4727.66)).toBe('4,728 acres')
  })
  it('collapses sub-acre fires', () => {
    expect(formatAcres(0.4)).toBe('<1 acre')
  })
  it('handles missing sizes', () => {
    expect(formatAcres(null)).toBe('Size not reported')
    expect(formatAcres(undefined)).toBe('Size not reported')
  })
})

describe('formatContainment', () => {
  it('rounds a reported percentage', () => {
    expect(formatContainment(55.4)).toBe('55% contained')
    expect(formatContainment(0)).toBe('0% contained')
    expect(formatContainment(100)).toBe('100% contained')
  })
  it('handles an unreported percentage', () => {
    expect(formatContainment(null)).toBe('Containment not reported')
  })
})

describe('formatRevised', () => {
  it('omits the line when no timestamp is present', () => {
    expect(formatRevised(null)).toBeNull()
    expect(formatRevised(undefined)).toBeNull()
  })
  it('names the fact it states, rather than a bare "Updated"', () => {
    // This is NIFC's survey time for one fire, not the age of Bluebird's copy,
    // and it is the only date in the popup, so nothing else is there to correct
    // a reader who reads it as ours. Avoid asserting a locale/timezone-specific
    // rendering, just the label.
    expect(formatRevised(Date.UTC(2026, 6, 20))).toMatch(/^Last updated: /)
  })
})

describe('nifcFireUrl', () => {
  it('deep-links the NIFC explore map to the fire, as lat,lon,zoom', () => {
    const url = nifcFireUrl(-121.5, 39.5, 11.42)
    expect(url).toContain('data-nifc.opendata.arcgis.com')
    expect(url).toContain('/explore?location=')
    expect(url).toContain('location=39.50000,-121.50000,11.42')
  })
})

describe('wildfirePopupHtml', () => {
  it('coalesces the incident name and falls back when absent', () => {
    expect(wildfirePopupHtml({ attr_IncidentName: 'P-L Gulch' }, NIFC)).toContain('P-L Gulch')
    expect(wildfirePopupHtml({ poly_IncidentName: 'Beehive' }, NIFC)).toContain('Beehive')
    expect(wildfirePopupHtml({}, NIFC)).toContain('Unnamed fire')
  })

  it('escapes HTML in third-party incident names', () => {
    const html = wildfirePopupHtml({ attr_IncidentName: '<img src=x>' }, NIFC)
    expect(html).not.toContain('<img src=x>')
    expect(html).toContain('&lt;img src=x&gt;')
  })

  it('renders size and containment together', () => {
    const html = wildfirePopupHtml({ poly_GISAcres: 5649, attr_PercentContained: 0 }, NIFC)
    expect(html).toContain('5,649 acres')
    expect(html).toContain('0% contained')
  })

  it('links to the fire-scoped NIFC map', () => {
    const html = wildfirePopupHtml({ attr_IncidentName: 'Beehive' }, NIFC)
    expect(html).toContain(`href="${NIFC}"`)
    expect(html).toContain('target="_blank"')
  })

  it('dates the perimeter, and says whose date it is', () => {
    const html = wildfirePopupHtml(
      { attr_IncidentName: 'Dollar Lake', attr_ModifiedOnDateTime_dt: Date.UTC(2026, 6, 17) },
      NIFC,
    )
    expect(html).toContain('Last updated:')
  })

  // The date qualifies the facts above it rather than joining them, so it goes
  // last and wears the footnote treatment. Asserted because the order is the
  // whole point of putting it there.
  it('sets the date last, and smaller and italic than the facts', () => {
    const html = wildfirePopupHtml(
      { attr_IncidentName: 'Dollar Lake', attr_ModifiedOnDateTime_dt: Date.UTC(2026, 6, 17) },
      NIFC,
    )
    expect(html.indexOf('Last updated:')).toBeGreaterThan(html.indexOf('View on NIFC map'))
    const line = html.slice(html.lastIndexOf('<span', html.indexOf('Last updated:')))
    expect(line).toContain('font-style:italic')
    expect(line).toContain('font-size:11px')
  })

  it('says nothing about the age of our own copy', () => {
    // Deliberate: the server serves an aged snapshot rather than failing, so a
    // visitor's answer no longer hinges on a fetch of their own, and a
    // freshness line on every fire would be noise about an internal detail.
    // `fetched_at` stays in the API response for programmatic callers.
    const html = wildfirePopupHtml(
      { attr_IncidentName: 'Dollar Lake', attr_ModifiedOnDateTime_dt: Date.UTC(2026, 6, 17) },
      NIFC,
    )
    expect(html).not.toContain('Retrieved')
    expect(html).not.toContain('Bluebird')
  })

  it('still renders a perimeter NIFC has never revised', () => {
    const html = wildfirePopupHtml({ attr_IncidentName: 'Fresh' }, NIFC)
    expect(html).not.toContain('Last updated')
    expect(html).toContain('Fresh')
  })
})

// Drives whether the hover popup stays anchored (same fire, so it can be moved
// onto) or re-anchors (a different fire under the cursor).
describe('fireIdentity', () => {
  it('is stable across two hovers of the same fire', () => {
    const fire = { attr_IncidentName: 'Dollar Lake', poly_GISAcres: 812, attr_ModifiedOnDateTime_dt: 1 }
    expect(fireIdentity(fire)).toBe(fireIdentity({ ...fire }))
  })

  it('separates two fires that differ in any field it reads', () => {
    const base = { attr_IncidentName: 'Dollar Lake', poly_GISAcres: 812, attr_ModifiedOnDateTime_dt: 1 }
    expect(fireIdentity(base)).not.toBe(fireIdentity({ ...base, attr_IncidentName: 'Beehive' }))
    expect(fireIdentity(base)).not.toBe(fireIdentity({ ...base, poly_GISAcres: 813 }))
  })

  // Unnamed perimeters are common in the feed. They must not all collapse onto
  // one identity, or hovering across two of them would leave the popup pinned
  // to the first while showing the second's numbers.
  it('still separates unnamed fires by their other fields', () => {
    expect(fireIdentity({ poly_GISAcres: 10 })).not.toBe(fireIdentity({ poly_GISAcres: 20 }))
  })

  it('falls back to the polygon name when the attribute name is missing', () => {
    expect(fireIdentity({ poly_IncidentName: 'Beehive' })).toContain('Beehive')
  })
})

// A 429 is this client outpacing its own address limit; a 503 is a server that
// has never completed a fetch. Neither resolves inside a backoff a UI can hold.
describe('isRateLimited', () => {
  it('is true only for a failure flagged as one worth waiting out', () => {
    const err = new Error('quota') as Error & { rateLimited?: boolean }
    err.rateLimited = true
    expect(isRateLimited(err)).toBe(true)
    expect(isRateLimited(new Error('network'))).toBe(false)
    expect(isRateLimited(null)).toBe(false)
  })
})
