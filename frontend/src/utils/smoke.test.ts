import { describe, expect, it } from 'vitest'
import {
  SMOKE_DENSITIES,
  SMOKE_OPACITY,
  densityOf,
  formatObserved,
  isRateLimited,
  smokePopupHtml,
  smokeSwatch,
} from './smoke'

describe('density', () => {
  it('reads the three HMS densities', () => {
    expect(SMOKE_DENSITIES.map((d) => densityOf({ density: d }))).toEqual([
      'Light',
      'Medium',
      'Heavy',
    ])
  })

  it('falls back to the lightest for anything it does not recognize', () => {
    // HMS changed this vocabulary once already, and the backend answers an
    // unknown style the same way: draw it, do not drop it.
    expect(densityOf({ density: 'Extreme' })).toBe('Light')
    expect(densityOf({})).toBe('Light')
    expect(densityOf({ density: null })).toBe('Light')
  })
})

describe('the density ramp', () => {
  it('gets denser as the smoke does', () => {
    expect(SMOKE_OPACITY.Light).toBeLessThan(SMOKE_OPACITY.Medium)
    expect(SMOKE_OPACITY.Medium).toBeLessThan(SMOKE_OPACITY.Heavy)
  })

  it('never hides the basemap it is drawn over', () => {
    // The point of the overlay is knowing whether a destination is UNDER the
    // smoke, so a summit label has to survive the heaviest plume. Past about
    // 0.65 of this shade they stop surviving.
    expect(SMOKE_OPACITY.Heavy).toBeLessThanOrEqual(0.6)
  })

  it('keeps a full step of lightness between each density', () => {
    // The ramp first shipped at 0.15/0.30/0.50 of a lighter stone, which
    // composited to three greys within 17 points of each other: technically a
    // ramp, unreadable as one. 30 is roughly where two greys stop being
    // arguable side by side.
    const lightness = (css: string) =>
      (css.match(/\d+/g) ?? []).slice(0, 3).reduce((a, c) => a + Number(c), 0) / 3
    const steps = SMOKE_DENSITIES.map((d) => lightness(smokeSwatch(d)))
    expect(steps[0] - steps[1]).toBeGreaterThanOrEqual(20)
    expect(steps[1] - steps[2]).toBeGreaterThanOrEqual(20)
  })

  it('shows the legend what the MAP draws, not what the panel would', () => {
    // The swatch composites the fill over the basemap rather than handing the
    // legend a translucent colour to blend with the dark panel behind it. At
    // 15% over slate-800 a Light plume is invisible, so the first row of the
    // key would be a blank square explaining a shade the map shows plainly.
    expect(smokeSwatch('Heavy')).toBe('rgb(170,165,159)')
    for (const density of SMOKE_DENSITIES) {
      expect(smokeSwatch(density)).toMatch(/^rgb\(\d+,\d+,\d+\)$/)
    }
  })

  it('keeps the three swatches distinguishable and in ramp order', () => {
    const lightness = (css: string) =>
      (css.match(/\d+/g) ?? []).slice(0, 3).reduce((a, c) => a + Number(c), 0)
    const [light, medium, heavy] = SMOKE_DENSITIES.map((d) => lightness(smokeSwatch(d)))
    expect(light).toBeGreaterThan(medium)
    expect(medium).toBeGreaterThan(heavy)
  })
})

describe('formatObserved', () => {
  const morning = Date.parse('2026-08-04T11:00:00')
  const afternoon = Date.parse('2026-08-04T14:00:00')

  it('states a same-day window as two times', () => {
    const line = formatObserved(morning, afternoon)
    expect(line).toMatch(/^Observed .+ to .+$/)
    // The date is redundant on both sides of a three-hour window.
    expect(line).not.toMatch(/Aug/)
  })

  it('dates BOTH ends when a window straddles midnight', () => {
    const line = formatObserved(Date.parse('2026-08-04T23:00:00'), Date.parse('2026-08-05T02:00:00'))
    expect((line ?? '').match(/Aug/g)).toHaveLength(2)
  })

  it('states a single stamp when HMS gave no end', () => {
    expect(formatObserved(morning, null)).toMatch(/^Observed /)
  })

  it('omits the line rather than inventing one when the stamp is missing', () => {
    expect(formatObserved(null, afternoon)).toBeNull()
    expect(formatObserved(undefined, undefined)).toBeNull()
    expect(formatObserved(Number.NaN, afternoon)).toBeNull()
  })
})

describe('smokePopupHtml', () => {
  it('titles the card with the density', () => {
    expect(smokePopupHtml({ density: 'Heavy' })).toContain('Heavy smoke')
  })

  it('names the satellite the plume was traced from', () => {
    expect(smokePopupHtml({ density: 'Light', satellite: 'GOES-WEST' })).toContain('GOES-WEST')
  })

  it('drops the satellite line rather than leaving it blank', () => {
    expect(smokePopupHtml({ density: 'Light', satellite: '' })).not.toContain('Traced from')
  })

  it('escapes provider text on its way to setHTML', () => {
    const html = smokePopupHtml({ density: 'Light', satellite: '<img src=x onerror=1>' })
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })

  it('carries the observed window as the one dated line', () => {
    const html = smokePopupHtml({
      density: 'Medium',
      observed_start: Date.parse('2026-08-04T11:00:00'),
      observed_end: Date.parse('2026-08-04T14:00:00'),
    })
    expect(html).toContain('Observed')
    expect(html).toContain('font-style:italic')
  })
})

describe('isRateLimited', () => {
  it('marks the two answers that mean wait rather than ask again', () => {
    const err = new Error('x') as Error & { rateLimited?: boolean }
    err.rateLimited = true
    expect(isRateLimited(err)).toBe(true)
    expect(isRateLimited(new Error('x'))).toBe(false)
    expect(isRateLimited(null)).toBe(false)
  })
})
