import { useEffect, useState } from 'react'
import type { DestinationResult } from '../types'
import { GLACIERS, type GlacierCheck, cellTiles } from '../utils/glacierCell'
import { geoKey } from '../utils/points'

const NONE: ReadonlySet<string> = new Set()

interface Found {
  // The rows the answer is about, so a set found for one table is never shown
  // beside another's rows.
  key: string
  cells: ReadonlySet<string>
}

/**
 * The displayed rows, by `geoKey`, whose snow depth cell lies on a glacier
 * (#849).
 *
 * The question the snow card asks for one clicked point (#748), asked for each
 * displayed row that has a depth: NOAA's analysis never melts permanent snow
 * out, so a glaciated summit reads tens of metres, and the cell says whose
 * number it is the way the card's heading does. The answer decorates the cell
 * and nothing else. It never ranks, bounds or colours a row, because it lands
 * after the report does, and a ranking that waited on it would reorder under
 * the reader (TJ, 2026-11-12).
 *
 * The rows are asked in the order of the tiles they read, so the check's few
 * held tiles serve each run of neighbours and no tile is fetched twice for one
 * table. An answer from tiles already held is taken at once; a tile that
 * cannot be read answers no glacier, as it does on the card.
 */
export function useGlacierCells(
  rows: readonly DestinationResult[],
  on: boolean,
  glaciers: GlacierCheck = GLACIERS,
): ReadonlySet<string> {
  const key = on
    ? rows
        .filter((r) => r.snow_depth_in != null)
        .map((r) => geoKey(r.latitude, r.longitude))
        .join('|')
    : ''
  const [found, setFound] = useState<Found>({ key: '', cells: NONE })

  useEffect(() => {
    if (!key) return
    // Read back off the key, which spells each row's coordinate to the metre:
    // far finer than the kilometre cell the answer is about.
    const points = key.split('|').map((k) => {
      const [lat, lng] = k.split(',').map(Number)
      const [first] = cellTiles(lng, lat)
      return { k, lng, lat, tile: `${first.x}/${first.y}` }
    })
    points.sort((a, b) => (a.tile < b.tile ? -1 : a.tile > b.tile ? 1 : 0))
    const ctl = new AbortController()
    const cells = new Set<string>()
    void (async () => {
      for (const p of points) {
        if (ctl.signal.aborted) return
        const onIce =
          glaciers.now(p.lng, p.lat) ?? (await glaciers.ask(p.lng, p.lat, ctl.signal).catch(() => false))
        if (ctl.signal.aborted) return
        if (onIce) {
          cells.add(p.k)
          setFound({ key, cells: new Set(cells) })
        }
      }
    })()
    return () => ctl.abort()
  }, [key, glaciers])

  return found.key === key ? found.cells : NONE
}
