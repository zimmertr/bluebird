import { describe, it, expect } from 'vitest'
import { gridArrowFeatures } from './forecastGridArrows'
import { gridCell, gridRow } from '../testSupport/fixtures'

describe('gridArrowFeatures', () => {
  const series = {
    precip_in: [0, 0],
    temp_f: [40, 60],
    wind_mph: [1, 9],
    freeze_ft: [9000, 9500],
    aqi: [10, 20],
  }
  const box: [number, number, number, number] = [-121.8, 46.3, -121.6, 46.5]

  it('turns an arrow the way the wind is going, and omits an unknown one', () => {
    // Arrow parity with the markers: Open-Meteo reports the direction wind
    // blows FROM, and the arrow points where it is headed. A missing bearing
    // omits the feature, because a 0 would draw a confident arrow north.
    const blowing = gridArrowFeatures(
      [gridCell(box, gridRow({ series: { ...series, wind_dir_deg: [270, null] } }))],
      0,
    )
    expect(blowing.features[0].properties!.bearing).toBe(90)

    const unknown = gridArrowFeatures(
      [gridCell(box, gridRow({ series: { ...series, wind_dir_deg: [270, null] } }))],
      1,
    )
    expect(unknown.features).toHaveLength(0)
  })

  it('places an arrow at its sample, the centre of the cell', () => {
    const fc = gridArrowFeatures(
      [gridCell(box, gridRow({ series: { ...series, wind_dir_deg: [270, null] } }))],
      0,
    )
    expect((fc.features[0].geometry as { coordinates: number[] }).coordinates).toEqual([
      (box[0] + box[2]) / 2,
      (box[1] + box[3]) / 2,
    ])
  })

  it('draws nothing at rest, on any metric', () => {
    // At rest the field shows a window aggregate, which has no direction to
    // point in — the same contract the markers keep.
    const fc = gridArrowFeatures(
      [gridCell(box, gridRow({ series: { ...series, wind_dir_deg: [270, 180] } }))],
      null,
    )
    expect(fc.features).toHaveLength(0)
  })
})
