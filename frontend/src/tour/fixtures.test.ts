import { describe, expect, it } from 'vitest'
import type { DestinationsResponse } from '../types'
import demoData from './demoData.json'
import { apiTransport, createDemoWorld, openMeteoTransport } from './fixtures'
import { RING_POLYGON, type DemoData, type RecordedHours, aqiAt } from './scenario'

const demo = demoData as unknown as DemoData
const NOW = Date.parse('2026-09-24T19:00:00Z')
const api = apiTransport(demo, NOW)
const weather = openMeteoTransport(demo)

async function post(body: unknown): Promise<DestinationsResponse> {
  const res = await api('/api/destinations', { method: 'POST', body: JSON.stringify(body) })
  return (await res.json()) as DestinationsResponse
}

describe('apiTransport', () => {
  it('answers the limits, the config and the search from the recording', async () => {
    expect(await (await api('/api/capabilities')).json()).toEqual(demo.capabilities)
    expect(await (await api('/api/config')).json()).toEqual({})
    expect(await (await api('/api/geocode?limit=5&q=Glacier%20Peak')).json()).toEqual(demo.geocode)
  })

  it('discovers the peaks inside the drawn ring and nothing else', async () => {
    const body = await post({ polygon: RING_POLYGON, destination_types: ['peak'] })
    expect(body.destinations.map((d) => d.name).sort()).toEqual(
      ['Bannock Mountain', 'Gamma Peak', 'Helmet Butte', 'Plummer Mountain', 'Sitting Bull Mountain'],
    )
    expect(body.total).toBe(5)
  })

  it('discovers nothing with no type ticked', async () => {
    expect((await post({ polygon: RING_POLYGON, destination_types: [] })).destinations).toEqual([])
  })

  it('resolves a named row to the recorded peak beside it, keeping its name and place', async () => {
    const body = await post({
      destination_types: [],
      custom_destinations: [{ name: 'Mount Misch', latitude: 48.3437, longitude: -121.2005 }],
    })
    const misch = demo.pool.find((d) => d.name === 'Mount Misch')!
    expect(body.destinations).toEqual([
      { ...misch, name: 'Mount Misch', latitude: 48.3437, longitude: -121.2005 },
    ])
  })

  it('answers a row far from every recorded peak with the row alone', async () => {
    const body = await post({ destination_types: [], custom_destinations: [{ name: 'Elsewhere', latitude: 40, longitude: -100 }] })
    expect(body.destinations[0]).toMatchObject({ name: 'Elsewhere', elevation_ft: null, latitude: 40 })
  })

  it('answers the overlays with the example fire and smoke, for any view', async () => {
    const fires = await (await api('/api/wildfires?bbox=-180,-90,180,90&detail=coarse')).json()
    expect(fires.features[0].properties.attr_IncidentName).toBe('Example fire')
    const smoke = await (await api('/api/smoke')).json()
    expect(smoke.features).toHaveLength(3)
  })

  it('refuses anything else as the API would', async () => {
    expect((await api('/api/nothing')).status).toBe(404)
  })

  it('rejects an aborted request the way fetch does', async () => {
    const abort = new AbortController()
    const pending = api('/api/capabilities', { signal: abort.signal })
    abort.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
  })
})

describe('openMeteoTransport', () => {
  // 13:00 to 01:00 UTC is 06:00 to 18:00 in Seattle, the demo's window.
  const hours = 'start_hour=2026-09-25T13:00&end_hour=2026-09-26T01:00'
  const glacier = demo.pool.find((d) => d.name === 'Glacier Peak')!

  it('moves the recorded weather onto the hours asked for, by the hour of the day', async () => {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${glacier.latitude}&longitude=${glacier.longitude}` +
      `&hourly=temperature_2m,precipitation&timeformat=unixtime&${hours}`
    const item = (await (await weather(url)).json()) as RecordedHours
    const times = item.hourly.time as number[]
    expect(times).toHaveLength(13)
    expect(times[0]).toBe(Date.parse('2026-09-25T13:00Z') / 1000)
    const rec = demo.weather.find((w) => w.latitude === glacier.latitude)!.forecast
    const recTimes = rec.hourly.time as number[]
    const at13 = recTimes.findIndex((t) => new Date(t * 1000).getUTCHours() === 13)
    expect(item.hourly.temperature_2m[0]).toBe(rec.hourly.temperature_2m[at13])
    expect(Object.keys(item.hourly).sort()).toEqual(['precipitation', 'temperature_2m', 'time'])
  })

  it('answers a batch as a list, one item per location in order', async () => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=48.3,48.1&longitude=-121.0,-121.1&hourly=temperature_2m&${hours}`
    const items = (await (await weather(url)).json()) as RecordedHours[]
    expect(items.map((i) => i.latitude)).toEqual([48.3, 48.1])
  })

  it('answers the cloud column from its own recording', async () => {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=48.3&longitude=-121.0&hourly=cloud_cover,dew_point_2m&${hours}`
    const item = (await (await weather(url)).json()) as RecordedHours
    expect(item.hourly.cloud_cover.some((v) => v !== null)).toBe(true)
  })

  it('makes the air quality up from the scenario', async () => {
    const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=48.3&longitude=-121.0&hourly=us_aqi&${hours}`
    const item = (await (await weather(url)).json()) as RecordedHours
    expect(item.hourly.us_aqi).toEqual(Array.from({ length: 13 }, (_v, h) => aqiAt(48.3, -121.0, h)))
  })
})

describe('createDemoWorld', () => {
  it('settles once the last request has answered', async () => {
    const world = createDemoWorld(demo, NOW)
    let answered = false
    const pending = world.api('/api/config').then(() => (answered = true))
    await world.settled()
    expect(answered).toBe(true)
    await pending
  })
})
