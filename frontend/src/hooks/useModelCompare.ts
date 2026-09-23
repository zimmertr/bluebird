import { useEffect, useMemo, useRef, useState } from 'react'
import { HourlySeries } from '../types'
import type { ForecastModelOption } from './useCapabilities'
import { ChartLine } from '../utils/chartData'
import { normalizeWindow, type WindowLimits } from '../utils/forecastWindow'
import {
  CompareDestination,
  CompareModel,
  ComparePoint,
  compareEndMs,
  drawnModelIds,
  compareSeries,
  modelSeriesOnGrid,
  pairKey,
} from '../utils/modelCompare'
import { shownModels } from '../utils/modelVisibility'
import { fetchWeather } from '../utils/openMeteo'
import { COVERAGE_PHRASE, OpenMeteoModelCoverage } from '../utils/openMeteoErrors'
import type { WeatherResult } from '../utils/openMeteo'
import { usePacedFetch } from './usePacedFetch'

/**
 * Comparing models across the charted destinations (issue #232): the spend, and
 * the state that survives between clicks.
 *
 * Everything decidable without a network sits in `utils/modelCompare.ts`; this
 * is the part that cannot, so it holds as little as possible. WHICH models are
 * picked is not held here at all — it is panel state, selected in the model
 * picker and carried in the link — so what is left is the forecasts themselves.
 *
 * **One single-model request per model**, over every charted destination at
 * once, rather than one request naming several models. That is the same batched
 * shape the analysis itself uses, and the split by model buys three things a
 * combined request cannot:
 *
 * - a per-model verdict. Measured 2026-09-12 at 46.5,8.0, a two-model request
 *   including out-of-domain HRRR answers HTTP 200 with BARE `precipitation`
 *   keys — another model's numbers under no label — while the same question
 *   asked of one model answers 400 and names itself. A bare key is treated as
 *   absent either way, but one request per model is what keeps HRRR's absence
 *   from erasing its companion's lines.
 * - the numbers. `fetchWeather` runs the vector-pinned aggregation the analysis
 *   itself runs, at each destination's own elevation, so a compared line and a
 *   re-analysis under that model cannot disagree.
 * - the cache and the pacer. Both are keyed per location and model already, so
 *   unticking a model and ticking it back is free, and so is switching the
 *   ranking to a model that has just been compared.
 *
 * The fetch is a spend, so it is bounded by what the last Analyze committed:
 * `fetchable` is the picked set as it was then. A model ticked afterwards is
 * drawn by no line and cued by `commitNeeded` instead — see `compareAdded`.
 */

export interface ComparedModel {
  id: string
  label: string
  /** Why nothing is drawn, when there is something to say. */
  note: string | null
}

/** Forecasts in hand, plus what is still on its way and what never arrived. */
interface Fetched {
  /**
   * By `pairKey`: the model's whole answer for that spot — the window
   * aggregates AND the hourly series — or null when it had none.
   *
   * The aggregates used to be dropped here and only the series kept, because
   * the chart was the only consumer. The results table is the second: it shows
   * one row per model, and those rows' numbers are exactly these, already
   * computed by the same fetch the chart paid for.
   */
  results: Record<string, WeatherResult>
  /** By model id: requests still in the air. */
  inFlight: Record<string, number>
  /** By model id: why a model drew nothing. */
  notes: Record<string, string | null>
}

const NOTHING_FETCHED: Fetched = { results: {}, inFlight: {}, notes: {} }

/** One identity for "nothing hidden", so a default does not re-run a memo. */
const EMPTY_HIDDEN: ReadonlySet<string> = new Set()

export interface ModelCompareOptions {
  /**
   * Off on air quality, which comes from CAMS whatever forecast model ranks the
   * field, so a comparison there could only draw the same line twice.
   */
  enabled: boolean
  /** The charted destinations, in the chart's order, each with its rank. */
  destinations: readonly CompareDestination[]
  /**
   * Every DISPLAYED row, which is what the fetch covers.
   *
   * Wider than `destinations` on purpose: the results table shows one row per
   * model for every row on screen, not only for the handful someone charted.
   * The fetch extends rather than rebuilds — `requestedRef` holds what has been
   * asked — so raising the cap or loosening a bound buys the delta.
   */
  rows: readonly ComparePoint[]
  /** The ranking model's own numbers per destination, by `chartKey`. */
  heldSeries: Readonly<Record<string, HourlySeries | null>>
  /** The window and model every held number came from. */
  analyzed: { window: { startMs: number; endMs: number }; forecastModel: string } | null
  /** Bumped per committed analysis; a new one drops the forecasts in hand. */
  analysisSeq: number
  models: readonly ForecastModelOption[]
  /** Ticked in the panel now: which models are DRAWN. */
  picked: readonly string[]
  /** Ticked when the analysis committed: which models may be FETCHED. */
  fetchable: readonly string[]
  /**
   * Models whose lines the reader has put down in the results bar's Models
   * popover. Presentation only, and deliberately not part of `drawnIds`: the
   * forecasts are already bought, so hiding must not cancel a fetch and
   * showing must not start one.
   */
  hidden?: ReadonlySet<string>
  /**
   * One colour per (destination, model) PAIR, by `pairKey`, seeded with the
   * ranking model's pairs pointing at their destinations' own colours.
   * Allocated by `App.tsx` off the one session allocator the destinations
   * themselves draw on (`allocateColors`), and passed in rather than derived
   * here, because a second allocator could hand a line the colour a
   * destination beside it is already wearing.
   */
  colors: Readonly<Record<string, string>>
  /** The chart's hourly grid, which compared series are re-indexed onto. */
  times: number[]
  /**
   * Where this deployment puts the archive boundary, from `/api/capabilities`.
   * A compared line has to land on the same side of it as the ranking did, or
   * the chart would draw one model against a different dataset (#393).
   */
  windowLimits: WindowLimits
}

export function useModelCompare({
  enabled,
  destinations,
  rows,
  heldSeries,
  analyzed,
  analysisSeq,
  models,
  picked,
  fetchable,
  hidden = EMPTY_HIDDEN,
  colors,
  times,
  windowLimits,
}: ModelCompareOptions) {
  const [fetched, setFetched] = useState<Fetched>(NOTHING_FETCHED)
  // A comparison draws on the same weighted budget the analysis and the grid
  // spend, so it can be put to sleep by work it did not start. Before #394 it
  // was the one caller that took the pacer's word and said nothing, and a
  // reader who ticked a model after a large analysis watched an empty chart
  // for minutes with no way to tell waiting from broken.
  const { paceRemainingS, onPace, clear: clearPace } = usePacedFetch()

  // "Now" is captured per analysis rather than read per render: it decides the
  // clamp, and a value that moved every render would rebuild every line on
  // every hover.
  const nowRef = useRef(Date.now())
  const inFlightRef = useRef(new Map<string, AbortController>())
  // Every (model, destination) pair already asked for under this analysis, so a
  // re-render cannot buy the same forecast twice.
  const requestedRef = useRef(new Set<string>())
  const seqRef = useRef(analysisSeq)
  seqRef.current = analysisSeq

  // A new analysis is a new question — another window, another ranking model,
  // another field — so nothing bought for the last one survives it.
  useEffect(() => {
    nowRef.current = Date.now()
    for (const controller of inFlightRef.current.values()) controller.abort()
    inFlightRef.current.clear()
    requestedRef.current.clear()
    clearPace()
    setFetched(NOTHING_FETCHED)
  }, [analysisSeq, clearPace])

  // Abort whatever is still in the air when the chart goes away, so a comparison
  // nobody is waiting for stops spending.
  useEffect(
    () => () => {
      for (const controller of inFlightRef.current.values()) controller.abort()
      inFlightRef.current.clear()
    },
    [],
  )

  // The snapshot records the request as submitted, so a Current analysis
  // arrives with start equal to end. That describes no span at all:
  // `normalizeWindow` is what turns it into the hour it means, and without it
  // every model fails the reach test below and the fetch would ask Open-Meteo
  // for a moment between itself and itself.
  const window_ = useMemo(
    () => (analyzed ? normalizeWindow(analyzed.window.startMs, analyzed.window.endMs) : null),
    [analyzed],
  )

  const rankingModel = analyzed?.forecastModel ?? null

  // The extra models actually on the chart: selected in the panel, bought by
  // the last Analyze, published by this deployment, and never the ranking model
  // (which is on the chart by being the report). Panel order, so the chips and
  // the link read alike.
  const drawnIds = useMemo(
    () => drawnModelIds(picked, fetchable, models, rankingModel),
    [fetchable, models, picked, rankingModel],
  )

  // Whether the CHART draws a comparison. Off on air quality, and off with
  // nothing charted.
  const active =
    enabled && analyzed !== null && destinations.length > 0 && drawnIds.length > 0

  // Whether anything is FETCHED, which is a different question: the results
  // table shows one row per model over every displayed row, so the numbers are
  // bought as soon as a second model is selected and an analysis has committed.
  // The chart is one reader of them, not the reason for them — which is why
  // `enabled` (off on air quality, where a comparison could only draw one
  // answer twice) does not gate this. The other columns still differ per model.
  const fetching = analyzed !== null && rows.length > 0 && drawnIds.length > 0

  // One string per dependency that is really a set, so an effect keyed on it
  // runs once per real change rather than once per re-derived array.
  const drawnKey = drawnIds.join(',')
  const rowsKey = rows.map((r) => r.key).join('|')

  useEffect(() => {
    if (!fetching || !window_) return
    const seqAtCall = seqRef.current
    for (const id of drawnIds) {
      const model = models.find((m) => m.id === id)
      if (!model) continue
      const missing = rows.filter((d) => !requestedRef.current.has(pairKey(id, d.key)))
      if (missing.length === 0) continue
      for (const d of missing) requestedRef.current.add(pairKey(id, d.key))

      const controller = new AbortController()
      // Keyed per model AND per batch, so a later batch for the same model —
      // the reader charted another destination — does not abort the first.
      const inFlightKey = `${id}|${missing.map((d) => d.key).join('|')}`
      inFlightRef.current.set(inFlightKey, controller)
      setFetched((prev) => ({
        ...prev,
        inFlight: { ...prev.inFlight, [id]: (prev.inFlight[id] ?? 0) + 1 },
        notes: { ...prev.notes, [id]: null },
      }))

      // Asked for every hour this model has inside the window, not for the
      // clamped window: the clamp is a drawing decision, so unticking a
      // short-reach model has to give the other lines their hours back without
      // buying them again.
      const endMs = compareEndMs(window_.endMs, [model.forecastHours], nowRef.current)
      fetchWeather(
        missing.map((d) => ({
          latitude: d.latitude,
          longitude: d.longitude,
          elevation_ft: d.elevationFt,
        })),
        window_.startMs,
        endMs,
        { model: id, signal: controller.signal, onPace, windowLimits },
      )
        .then((results) => {
          if (seqRef.current !== seqAtCall) return
          setFetched((prev) => {
            const held = { ...prev.results }
            missing.forEach((d, i) => {
              held[pairKey(id, d.key)] = results[i] ?? null
            })
            return {
              results: held,
              inFlight: { ...prev.inFlight, [id]: Math.max(0, (prev.inFlight[id] ?? 1) - 1) },
              notes: prev.notes,
            }
          })
        })
        .catch((e) => {
          if (e instanceof DOMException && e.name === 'AbortError') return
          if (seqRef.current !== seqAtCall) return
          // A failed batch is not held against the model for ever: drop the
          // pairs from the asked-for set so charting another destination, or
          // ticking the model again, tries once more.
          for (const d of missing) requestedRef.current.delete(pairKey(id, d.key))
          const note =
            e instanceof OpenMeteoModelCoverage
              ? // No remedy clause: the analysis path's "switch to a different
                // model" is not this surface's remedy, since unticking the box
                // in the picker is what removes these lines.
                `${model.label} ${COVERAGE_PHRASE}`
              : e instanceof Error
                ? e.message
                : null
          setFetched((prev) => ({
            ...prev,
            inFlight: { ...prev.inFlight, [id]: Math.max(0, (prev.inFlight[id] ?? 1) - 1) },
            notes: { ...prev.notes, [id]: note },
          }))
        })
        .finally(() => {
          if (inFlightRef.current.get(inFlightKey) === controller) {
            inFlightRef.current.delete(inFlightKey)
          }
          // The wait belongs to the fetch, not to the batch that reported it:
          // a sleeping batch is still a reason to say so while its neighbours
          // land. Nothing left in the air is what ends it — a completed batch,
          // a failed one and an aborted one all arrive here.
          if (inFlightRef.current.size === 0) clearPace()
        })
    }
    // `drawnKey` and `rowsKey` stand in for the two arrays: both are
    // re-derived on every live knob change, so keying on the references would
    // re-run this for sets that had not moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetching, analysisSeq, drawnKey, rowsKey, window_])

  // The models on the chart: the ranking model first, then every extra. The
  // ranking model carries no note — its numbers are the report — so only an
  // extra can have something to say about why its lines are missing.
  const compared: ComparedModel[] = useMemo(() => {
    if (!active || !rankingModel) return []
    const entry = (id: string, note: string | null): ComparedModel => ({
      id,
      label: models.find((m) => m.id === id)?.label ?? id,
      note,
    })
    return [entry(rankingModel, null), ...drawnIds.map((id) => entry(id, fetched.notes[id] ?? null))]
  }, [active, drawnIds, fetched.notes, models, rankingModel])

  // The models actually drawn: everything on the chart the reader has not put
  // down. Everything below reads THIS rather than `compared`, so a hidden
  // model draws no line, bounds no clamp and explains no absence — it is
  // absent because it was asked to be.
  const shown: ComparedModel[] = useMemo(
    () => shownModels(compared, hidden),
    [compared, hidden],
  )
  const shownIds = useMemo(
    () => new Set(shown.map((m) => m.id)),
    [shown],
  )

  /**
   * Where every line on the chart stops — the ranking model's lines included,
   * since a held line running past the models beside it is the ragged
   * comparison the clamp exists to prevent. Null when nothing is compared, or
   * when every model reaches the window's end.
   *
   * Only the models actually DRAWN bound it. A model that came back uncovered
   * contributes no line, so letting its reach cut the lines that did arrive
   * would hide hours on behalf of a model nobody can see.
   */
  const endMs = useMemo(() => {
    if (!active || !window_ || !rankingModel) return null
    if (!shownIds.has(rankingModel)) return null
    const drew = drawnIds.filter(
      (id) =>
        shownIds.has(id) && destinations.some((d) => fetched.results[pairKey(id, d.key)]),
    )
    if (drew.length === 0) return null
    const reaches = [rankingModel, ...drew].map(
      (id) => models.find((m) => m.id === id)?.forecastHours ?? 0,
    )
    const end = compareEndMs(window_.endMs, reaches, nowRef.current)
    return end < window_.endMs ? end : null
  }, [active, destinations, drawnIds, fetched.results, models, rankingModel, shownIds, window_])

  const lines: ChartLine[] = useMemo(() => {
    if (!active || !rankingModel) return []
    // The ranking model rides the same product as the rest, seeded from the
    // numbers the analysis already holds, so every line is composed once and
    // every label reads alike.
    const series: Record<string, HourlySeries | null> = {}
    for (const d of destinations) {
      series[pairKey(rankingModel, d.key)] = heldSeries[d.key] ?? null
      for (const id of drawnIds) {
        series[pairKey(id, d.key)] = modelSeriesOnGrid(
          fetched.results[pairKey(id, d.key)]?.series ?? null,
          times,
        )
      }
    }
    const onChart: CompareModel[] = shown.map((m) => ({ id: m.id, label: m.label }))
    return compareSeries(destinations, onChart, series, times, endMs, colors)
  }, [
    active,
    colors,
    destinations,
    drawnIds,
    endMs,
    fetched.results,
    heldSeries,
    rankingModel,
    shown,
    times,
  ])

  return { active, compared, shown, lines, endMs, results: fetched.results, paceRemainingS }
}
