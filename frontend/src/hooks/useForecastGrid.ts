import { useEffect, useMemo, useRef, useState } from 'react'
import { DestinationResult } from '../types'
import { AqiResult, WeatherResult, fetchAqi, fetchWeather } from '../utils/openMeteo'
import { canonicalTimes } from '../utils/clientAnalyze'
import { normalizeWindow } from '../utils/forecastWindow'
import { GridCell, GridSpec, buildGrid, gridView, pairCells, reachKmFor } from '../utils/forecastGrid'

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
// Toggling back off drops the field rather than parking it: re-toggling costs
// nothing anyway, because the per-location forecast cache the fetch reads
// through holds the same lattice for 15 minutes, which also covers a second
// analysis over the same ground.

/**
 * Whether the grid has an answer.
 *
 * Coarser than `FireProximityStatus` on purpose: a fire warning is safety
 * information whose absence must never read as an all-clear, so that hook
 * distinguishes "checked, nothing near" from "could not check". A missing
 * sample here just leaves the basemap showing, which asserts nothing at all —
 * so the only thing a caller needs is whether there is anything to key a legend
 * to. `loading` persists while the field fills in, since cells arrive during it.
 *
 * `failed` is the one state that has to be SAID rather than merely handled. The
 * layer is switched on and nothing is drawn, so silence there reads as broken —
 * the same argument that put a line on the loading state. `idle` is different
 * and stays quiet: it means nothing was asked for.
 */
export type ForecastGridStatus = 'idle' | 'loading' | 'ready' | 'failed'

export interface ForecastGrid {
  status: ForecastGridStatus
  /** The lattice, which the raster needs for its shape and its corners. */
  spec: GridSpec | null
  cells: GridCell[]
  /** The pitch the lattice was built at, which the legend prints. */
  pitchKm: number
  /**
   * Has every sample been asked for? False while the chunk loop is still
   * running, which is what lets the legend say `Waiting` for a partial field
   * stalled behind the pacer instead of naming a pitch the picture does not
   * fully have (#288 review).
   */
  complete: boolean
  /**
   * When the client pacer resumes, if it is currently sleeping off a quota
   * deficit. The legend counts down from it, so a grid queued behind a large
   * analysis says why rather than looking hung. Null whenever nothing is
   * waiting — which is most of the time, since a small lattice never paces.
   */
  paceEndMs: number | null
}

const IDLE: ForecastGrid = {
  status: 'idle',
  spec: null,
  cells: [],
  pitchKm: 0,
  complete: true,
  paceEndMs: null,
}

/**
 * How many samples go out per painted step.
 *
 * The field used to appear all at once after every batch had returned, which on
 * a full lattice is twelve requests deep and reads as nothing happening. Fetched
 * in chunks instead, each one painted as it lands, so the map fills in.
 *
 * 150 rather than smaller because `fetchWeather` already batches at 50 with up
 * to 4 in flight: a chunk of 150 is three batches, which is one full wave of
 * its own concurrency. Chunks run one after another so the total in flight
 * stays where the pacer expects it — the same four — and only the FIRST paint
 * gets earlier. Nothing here asks Open-Meteo for more at once than before.
 */
const PAINT_CHUNK = 150

export interface ForecastGridInputs {
  /** Is the layer on? The whole gate: off means no lattice and no fetch. */
  enabled: boolean
  /**
   * The analyzed field the lattice covers, or null before the first committed
   * analysis, when there is no extent a grid could honestly claim to cover.
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
  /** The report's hourly grid, which the samples are re-indexed onto. */
  times: readonly number[]
  /** The selected model's finest grid, in km, from `/api/capabilities`. */
  pitchKm: number
  /**
   * The coverage slider's COMMITTED bar position, in [0, 1]; `reachKmFor`
   * with the model's pitch turns it into km. The fetch ratchets on it: within
   * one analysis the lattice is built at the largest reach ever committed, so
   * growing past what is held fetches once and shrinking never fetches at
   * all — the smaller picture is a filter over samples already in hand
   * (#288 review).
   */
  reachFrac: number
  /**
   * The bar position to DISPLAY right now — the slider's live drag position,
   * or the committed value at rest. Presentation only: it re-cuts the held
   * field through `gridView` per render and never touches the fetch, which is
   * what makes the picture follow the thumb in real time.
   */
  displayReachFrac: number
  /** Bumped once per committed analysis; re-grids even for an identical field. */
  analysisSeq: number
}

export function useForecastGrid(inputs: ForecastGridInputs): ForecastGrid {
  const {
    enabled,
    field,
    window: win,
    model,
    times,
    pitchKm,
    reachFrac,
    displayReachFrac,
    analysisSeq,
  } = inputs
  const [state, setState] = useState<ForecastGrid>(IDLE)
  // What the current analysis has already been fetched at. The ratchet: a
  // committed reach at or under a COMPLETED fetch's reach is served from the
  // held field with no effect run at all; anything else rebuilds at the
  // largest reach seen, so one grow covers every earlier value on the way
  // back down.
  const fetchedRef = useRef<{ seq: number; reach: number; complete: boolean } | null>(null)

  // The bar position as km, from the MODEL's pitch — the same conversion for
  // the fetch and the display, so the two can be compared in one unit.
  const reachKm = reachKmFor(pitchKm, reachFrac)

  useEffect(() => {
    if (!enabled || field === null || win === null || field.length === 0) {
      fetchedRef.current = null
      setState((prev) => (prev === IDLE ? prev : IDLE))
      return
    }

    const held = fetchedRef.current
    if (held && held.seq === analysisSeq && held.complete && reachKm <= held.reach) {
      // The held lattice covers this reach; `gridView` below re-cuts it.
      return
    }
    const target =
      held && held.seq === analysisSeq ? Math.max(reachKm, held.reach) : reachKm

    const spec = buildGrid(field, pitchKm, target)
    if (spec === null) {
      fetchedRef.current = null
      setState((prev) => (prev === IDLE ? prev : IDLE))
      return
    }
    fetchedRef.current = { seq: analysisSeq, reach: target, complete: false }

    // The snapshot holds the request as submitted, so a Current analysis
    // arrives as a zero-width window. Asking Open-Meteo for it returns an
    // answer with no hours in it, which reaches `pairCells` as a null forecast
    // for every sample and paints an empty field with nothing saying so.
    const { startMs, endMs } = normalizeWindow(win.startMs, win.endMs)

    const ac = new AbortController()
    let cancelled = false
    // Cleared rather than kept while the fetch runs. The effect re-runs when
    // the analysis changes, and a field from the previous one describes a
    // different bbox over a different window — holding it would paint the old
    // answer under the new markers for as long as the fetch takes.
    setState({
      status: 'loading',
      spec,
      cells: [],
      pitchKm: spec.pitchKm,
      complete: false,
      paceEndMs: null,
    })

    // What has come back so far, by lattice index. Weather arrives in chunks
    // and air quality arrives whole and late, so both write here and repaint
    // from whatever is in hand rather than each owning half the picture.
    const wx: (WeatherResult | undefined)[] = new Array(spec.points.length)
    const aqi: (AqiResult | undefined)[] = new Array(spec.points.length)
    let grid: readonly number[] = times

    function repaint() {
      if (cancelled) return
      const indices: number[] = []
      const wxHave: WeatherResult[] = []
      const aqiHave: AqiResult[] = []
      for (let i = 0; i < wx.length; i++) {
        if (wx[i] === undefined) continue
        indices.push(i)
        wxHave.push(wx[i] as WeatherResult)
        aqiHave.push(aqi[i] ?? null)
      }
      if (grid.length === 0) grid = canonicalTimes(wxHave)
      setState((prev) => ({
        status: 'ready',
        spec: spec as GridSpec,
        cells: pairCells(spec as GridSpec, indices, wxHave, aqiHave, grid),
        pitchKm: (spec as GridSpec).pitchKm,
        complete: fetchedRef.current?.complete ?? false,
        // A repaint means samples arrived, so whatever wait was being counted
        // down is over.
        paceEndMs: prev.status === 'loading' ? null : prev.paceEndMs,
      }))
    }

    // Air quality runs alongside the weather rather than in front of the paint,
    // which is the whole of why the field now appears when it does. It used to
    // be awaited together with the weather, so a temperature grid sat invisible
    // behind 600 AQI samples nobody had asked to see. It is a separate service
    // on a separate quota, so overlapping costs no wall clock; it simply lands
    // when it lands and repaints what is already drawn.
    //
    // Fetching it at all, unasked, is still right: ranking is a live knob, so
    // one pass covers all four metrics and switching to AQI recolours the held
    // field with no request. Keying the fetch on `sortBy` is the architecture
    // this line exists to forbid.
    const air = fetchAqi(spec.points, startMs, endMs, { signal: ac.signal })
      .then((list) => {
        if (cancelled) return
        list.forEach((a, i) => {
          aqi[i] = a
        })
        // Only worth a repaint once there is something painted to fold into.
        if (wx.some((w) => w !== undefined)) repaint()
      })
      .catch(() => {
        // Best-effort twice over: air quality already degrades to null inside
        // `fetchAqi`, and a grid missing it is a grid, not a failure.
      })

    void (async () => {
      try {
        for (let start = 0; start < spec.points.length; start += PAINT_CHUNK) {
          const indices: number[] = []
          for (let i = start; i < Math.min(start + PAINT_CHUNK, spec.points.length); i++) {
            indices.push(i)
          }
          const chunk = indices.map((i) => spec.points[i])
          const got = await fetchWeather(chunk, startMs, endMs, {
            model,
            // A lattice point is not a destination, but it stands on real
            // ground: adjust its wind to the terrain height Open-Meteo
            // reports for the coordinate, so a volcano's flank paints its
            // real winds instead of valley calm (#288 review).
            terrainElevation: true,
            signal: ac.signal,
            // The pacer narrating itself, exactly as the analysis overlay
            // already does. Without this a grid queued behind a large
            // analysis is silent for minutes.
            onPace: (seconds) => {
              if (cancelled) return
              setState((prev) => ({ ...prev, paceEndMs: Date.now() + seconds * 1000 }))
            },
          })
          if (cancelled) return
          got.forEach((w, j) => {
            wx[indices[j]] = w
          })
          repaint()
        }
        // Every sample has been asked for; the legend may name the pitch now
        // even through a later pace.
        if (cancelled) return
        if (fetchedRef.current?.seq === analysisSeq) fetchedRef.current.complete = true
        repaint()
        await air
      } catch (err) {
        if (cancelled || (err as Error).name === 'AbortError') return
        // Best-effort, like every overlay: whatever painted stays, and one line
        // in the console. There is no on-screen failure state because there is
        // no claim to withdraw — an ungridded map is the map.
        console.warn('[bluebird] forecast grid fetch failed', err)
        // Only when nothing painted. A chunk that lands and then a later one
        // that fails still leaves a field on the map, and calling that
        // unavailable would contradict what the reader can see.
        setState((prev) =>
          prev.cells.length > 0 ? prev : { ...prev, status: 'failed', paceEndMs: null },
        )
      }
    })()

    return () => {
      cancelled = true
      ac.abort()
    }
    // Keyed on the analysis rather than on `field`, which is a new array on
    // every live knob change: a re-rank hands over the same destinations in a
    // new reference, and keying on it would abort the fetch in flight and
    // re-ask the same question per twiddle. `reachKm` is a key so a commit
    // ABOVE the ratchet can fetch; at or under a completed fetch's reach the
    // body returns before touching anything, so the shrink direction costs no
    // teardown. `displayReachKm` is deliberately absent: display is the
    // memo's job below, and keying the fetch on it would abort a grow because
    // the thumb wiggled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, analysisSeq, pitchKm, reachKm])

  // The held field re-cut to the reach on display, live with the thumb. Same
  // state object back when nothing is cut, so consumers' effects do not churn.
  const displayReachKm = reachKmFor(pitchKm, displayReachFrac)
  return useMemo(() => {
    if (state.spec === null) return state
    const view = gridView(state.spec, state.cells, displayReachKm)
    if (view.spec === state.spec && view.cells === state.cells) return state
    return { ...state, spec: view.spec, cells: view.cells as GridCell[] }
  }, [state, displayReachKm])
}
