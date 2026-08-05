import { useEffect, useState } from 'react'
import { DestinationResult } from '../types'
import { fetchAqi, fetchWeather } from '../utils/openMeteo'
import { canonicalTimes } from '../utils/clientAnalyze'
import { normalizeWindow } from '../utils/forecastWindow'
import { GridCell, buildGrid, pairCells } from '../utils/forecastGrid'

// The forecast grid's fetch (#246), modelled on useFireProximity: one query per
// analysis, best-effort, and entirely beside the ranking.
//
// The checkbox is the spend boundary. Nothing here runs until the layer is on
// AND a browser-path report is held, and turning it on is standing consent —
// with the layer left on, each new analysis grids itself without another click,
// the way `fires=1` re-queries NIFC per analysis.
//
// It is an OVERLAY, never a data knob: it must not appear in `commitNeeded`,
// must not cue an Analyze, and must not make a report read as stale. The
// distinction that matters is what a toggle changes — this one changes what is
// drawn beside the ranking, never which rows are ranked or what they say.
//
// Toggling back off drops the cells rather than parking them: re-toggling costs
// nothing anyway, because the per-location forecast cache the fetch reads
// through holds the same lattice for 15 minutes, which also covers a second
// analysis over the same ground.

/**
 * Whether the grid has an answer.
 *
 * Coarser than `FireProximityStatus` on purpose: a fire warning is safety
 * information whose absence must never read as an all-clear, so that hook
 * distinguishes "checked, nothing near" from "could not check". A missing cell
 * here just leaves the basemap showing, which asserts nothing at all — so the
 * only thing a caller needs is whether there is anything to key a legend to.
 */
export type ForecastGridStatus = 'idle' | 'loading' | 'ready'

export interface ForecastGrid {
  status: ForecastGridStatus
  cells: GridCell[]
  /** The pitch the lattice was built at, which the legend prints. */
  pitchKm: number
}

const IDLE: ForecastGrid = { status: 'idle', cells: [], pitchKm: 0 }

export interface ForecastGridInputs {
  /** Is the layer on? The whole gate: off means no lattice and no fetch. */
  enabled: boolean
  /**
   * The analyzed field the lattice covers, or null on the server SSE path.
   *
   * That path sends only its trimmed rows, so there is no field whose extent a
   * grid could honestly claim to cover — the established degradation for every
   * knob that needs the universe.
   */
  field: readonly DestinationResult[] | null
  /**
   * The window and model to fetch for, taken from the `analyzed` snapshot and
   * never from panel state. The panel's calendar and model picker can move
   * while a report sits on screen; a grid built from those would paint hours
   * the markers above it never saw.
   *
   * As recorded, which is the request's RAW timestamps — a Current analysis has
   * start equal to end, and `normalizeWindow` is what turns that into the hour
   * it means before anything is fetched.
   */
  window: { startMs: number; endMs: number } | null
  model: string
  /** The report's hourly grid, which the cells are re-indexed onto. */
  times: readonly number[]
  /** The selected model's finest grid, in km, from `/api/capabilities`. */
  pitchKm: number
  /** Bumped once per committed analysis; re-grids even for an identical field. */
  analysisSeq: number
}

export function useForecastGrid(inputs: ForecastGridInputs): ForecastGrid {
  const { enabled, field, window: win, model, times, pitchKm, analysisSeq } = inputs
  const [state, setState] = useState<ForecastGrid>(IDLE)

  useEffect(() => {
    if (!enabled || field === null || win === null || field.length === 0) {
      setState((prev) => (prev === IDLE ? prev : IDLE))
      return
    }

    const spec = buildGrid(field, pitchKm)
    if (spec === null) {
      setState((prev) => (prev === IDLE ? prev : IDLE))
      return
    }

    // The snapshot holds the request as submitted, so a Current analysis
    // arrives as a zero-width window. Asking Open-Meteo for it returns an
    // answer with no hours in it, which reaches `pairCells` as a null forecast
    // for every cell and paints an empty grid with nothing on screen saying so.
    const { startMs, endMs } = normalizeWindow(win.startMs, win.endMs)

    const ac = new AbortController()
    let cancelled = false
    // Cleared rather than kept while the fetch runs. The effect re-runs when
    // the analysis changes, and cells from the previous one describe a
    // different bbox over a different window — holding them would paint the
    // old answer under the new markers for as long as the fetch takes.
    setState({ status: 'loading', cells: [], pitchKm: spec.pitchKm })

    // Weather and air quality concurrently, which is the browser path's
    // standing philosophy and costs no extra wall clock: Open-Meteo bills its
    // weighted calls per service, so the two spend separate quotas. It is also
    // what makes an AQI ranking a live recolour rather than another fetch —
    // one grid covers all four metrics, and the ranking is never a dependency
    // of this effect.
    //
    // Sequenced behind the ranked analysis by construction, since it starts
    // only once a report has committed, so the shared pacer never delays the
    // ranking. A large field and a full lattice fill in over a paced minute or
    // two, silently — the fire-warning precedent for background fill-in.
    void (async () => {
      try {
        const [wx, aqi] = await Promise.all([
          fetchWeather(spec.points, startMs, endMs, { model, signal: ac.signal }),
          fetchAqi(spec.points, startMs, endMs, { signal: ac.signal }),
        ])
        if (cancelled) return
        // The report's grid when it has one. A point-sample analysis and the
        // moment before `times` arrives both fall back to the lattice's own
        // stamps, which for one window and one model are the same stamps.
        const onto = times.length > 0 ? times : canonicalTimes(wx)
        setState({ status: 'ready', cells: pairCells(spec, wx, aqi, onto), pitchKm: spec.pitchKm })
      } catch (err) {
        if (cancelled || (err as Error).name === 'AbortError') return
        // Best-effort, like every overlay: an empty layer and one line in the
        // console. There is no on-screen failure state because there is no
        // claim to withdraw — an ungridded map is the map.
        console.warn('[bluebird] forecast grid fetch failed', err)
        setState(IDLE)
      }
    })()

    return () => {
      cancelled = true
      ac.abort()
    }
    // Keyed on the analysis rather than on `field`, which is a new array on
    // every live knob change: a re-rank hands over the same destinations in a
    // new reference, and keying on it would abort the fetch in flight and
    // re-ask the same question per twiddle. Everything else here is fixed for
    // the life of one analysis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, analysisSeq, pitchKm])

  return state
}
