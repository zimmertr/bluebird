import { describe, it, expect } from 'vitest'
import { resultPopupHtml } from './resultPopup'
import type { FireWarning } from './fireProximity'

// A fully-populated popup input; individual tests override `warning`.
const base = {
  rank: 1,
  name: 'Mount Rainier',
  type: 'peak',
  osmId: null,
  elevationFt: 14406,
  precipTotalIn: 0.123,
  windAvgMph: 5.4,
  tempAvgF: 41.2,
  aqiAvg: null,
  aqiMax: null,
  longitude: -121.760395,
  latitude: 46.851731,
}

describe('resultPopupHtml fire warning', () => {
  it('omits the warning line when no fire is nearby', () => {
    const html = resultPopupHtml({ ...base, warning: null })
    expect(html).not.toContain('⚠️')
  })

  it('renders the ⚠️ and the proximity text when a fire is near', () => {
    const warning: FireWarning = { miles: 3.2, name: 'Sourdough' }
    const html = resultPopupHtml({ ...base, warning })
    expect(html).toContain('⚠️')
    expect(html).toContain('3.2 mi from an active wildfire (Sourdough)')
  })

  it('phrases an inside-the-perimeter warning without a mileage', () => {
    const warning: FireWarning = { miles: 0, name: 'Bolt Creek' }
    const html = resultPopupHtml({ ...base, warning })
    expect(html).toContain('Inside an active wildfire perimeter (Bolt Creek)')
  })

  // NIFC incident names are third-party strings rendered via setHTML, so the
  // warning line must escape them rather than inject raw markup.
  it('escapes HTML in a third-party incident name', () => {
    const warning: FireWarning = { miles: 0, name: '<img src=x> "&' }
    const html = resultPopupHtml({ ...base, warning })
    expect(html).toContain('&lt;img src=x&gt; &quot;&amp;')
    expect(html).not.toContain('<img src=x>')
  })
})
