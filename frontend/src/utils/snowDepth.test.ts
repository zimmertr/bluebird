import { describe, expect, it } from 'vitest'
import {
  SNOW_BANDS,
  SNOW_BOUNDS,
  SNOW_MAX_ZOOM,
  SNOW_RAMP,
  SNOW_TILE_SIZE,
  snowRampCss,
  snowTicks,
  snowTileUrl,
} from './snowDepth'

describe('the tile URL', () => {
  const url = snowTileUrl()

  it('leaves the bbox token for MapLibre to substitute', () => {
    // Percent-encoded braces are a request for a bounding box literally named
    // "bbox-epsg-3857", which the service answers with a 400 and the layer
    // draws nothing — the exact failure of building the query with
    // URLSearchParams alone.
    expect(url).toContain('bbox={bbox-epsg-3857}')
    expect(url).not.toContain('%7B')
  })

  it('asks for the image in Web Mercator', () => {
    // The service's own reference is EPSG:4269. An image in it does not sit on
    // a Web Mercator map, which is the one mistake that makes the layer look
    // like it works and puts the snow in the wrong place.
    expect(url).toContain('bboxSR=3857')
    expect(url).toContain('imageSR=3857')
  })

  it('asks for snow depth alone, transparent, at the tile size', () => {
    // Layer 4 of the same service is snow water equivalent: a different number
    // in different units, and it would paint over this one.
    expect(url).toContain('layers=show%3A0')
    expect(url).toContain('transparent=true')
    expect(url).toContain('format=png32')
    expect(url).toContain(`size=${SNOW_TILE_SIZE}%2C${SNOW_TILE_SIZE}`)
  })

  it('goes to NOAA and nowhere else', () => {
    expect(url.startsWith('https://mapservices.weather.noaa.gov/')).toBe(true)
  })
})

describe('the coverage extent', () => {
  it('reads west, south, east, north, which is what a raster source wants', () => {
    const [west, south, east, north] = SNOW_BOUNDS
    expect(west).toBeLessThan(east)
    expect(south).toBeLessThan(north)
  })

  it('covers the mountain west and stops at the analysis edge', () => {
    const [west, south, east, north] = SNOW_BOUNDS
    // Rainier and Katahdin are inside; Denali and the Alps are not, and that
    // is the layer's stated limit rather than a gap to fill in.
    expect(west).toBeLessThan(-121.76)
    expect(east).toBeGreaterThan(-68.92)
    expect(south).toBeLessThan(35)
    expect(north).toBeLessThan(63.07)
  })

  it('stops asking for renders finer than the 1 km analysis', () => {
    expect(SNOW_MAX_ZOOM).toBeLessThan(14)
  })
})

describe('the band table', () => {
  it('is the twelve bands NOAA publishes, in order and without a gap', () => {
    expect(SNOW_BANDS).toHaveLength(12)
    SNOW_BANDS.forEach((band, i) => {
      expect(band.to).toBeGreaterThan(band.from)
      if (i > 0) expect(band.from).toBe(SNOW_BANDS[i - 1].to)
    })
  })

  it('draws nothing under the first boundary, and everything above it', () => {
    // NOAA paints that band fully transparent: under 1 cm the map shows the
    // ground rather than a colour meaning "almost none".
    expect(SNOW_BANDS[0].color).toBeNull()
    expect(SNOW_RAMP).toHaveLength(11)
    expect(SNOW_RAMP.every((band) => /^#[0-9a-f]{6}$/.test(band.color ?? ''))).toBe(true)
  })

  it('gives every band its own colour', () => {
    expect(new Set(SNOW_RAMP.map((b) => b.color)).size).toBe(SNOW_RAMP.length)
  })
})

describe('the legend strip', () => {
  it('draws one hard-edged block per drawn band', () => {
    const css = snowRampCss()
    // Two stops per band is what makes each one a block rather than a blend:
    // the boundaries are the service's classification, and a gradient across
    // them would colour depths NOAA never classified.
    for (const band of SNOW_RAMP) {
      expect(css.split(band.color!).length - 1).toBe(2)
    }
    expect(css).toContain('0%')
    expect(css).toContain('100%')
  })

  it('names the ends of the scale and a decade between them', () => {
    const ticks = snowTicks()
    expect(ticks.map((t) => t.label)).toEqual(['0.4', '3.9', '39', '787 in'])
  })

  it('puts every tick on a band boundary', () => {
    for (const tick of snowTicks()) {
      expect(Number.isInteger(tick.at)).toBe(true)
      expect(tick.at).toBeGreaterThanOrEqual(0)
      expect(tick.at).toBeLessThanOrEqual(SNOW_RAMP.length)
    }
  })

  it('reads left to right', () => {
    const ats = snowTicks().map((t) => t.at)
    expect(ats).toEqual([...ats].sort((a, b) => a - b))
  })

  it('states the unit once', () => {
    const withUnit = snowTicks().filter((t) => t.label.includes('in'))
    expect(withUnit).toHaveLength(1)
    expect(withUnit[0].at).toBe(SNOW_RAMP.length)
  })
})
