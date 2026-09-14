import { useEffect, useMemo, useRef, useState } from 'react'
import { HourlySeries } from '../types'
import type { ForecastModelOption } from './useCapabilities'
import { ChartLine } from '../utils/chartData'
import { normalizeWindow } from '../utils/forecastWindow'
import {
  CompareDestination,
  CompareModel,
  compareEndMs,
  compareSeries,
  modelSeriesOnGrid,
  pairKey,
} from '../utils/modelCompare'
import { modelColor } from '../utils/chartColors'
import { OpenMeteoModelCoverage, fetchWeather } from '../utils/openMeteo'
import type { WeatherSeries } from '../utils/openMeteo'

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

export type CompareStatus = 'loading' | 'ready' | 'absent'

export interface ComparedModel {
  id: string
  label: string
  /** A `*_seamless` product, which changes model partway along its own line. */
  blend: boolean
  /**
   * The one colour its lines draw in, or null for the ranking model, whose
   * lines wear their destinations' colours. Null is also what the chip reads
   * to draw no swatch.
   */
  color: string | null
  status: CompareStatus
  /** Why nothing is drawn, when there is something to say. */
  note: string | null
}

/** Forecasts in hand, plus what is still on its way and what never arrived. */
interface Fetched {
  /** By `pairKey`: the model's numbers, or null when it had none for that spot. */
  series: Record<string, WeatherSeries | null>
  /** By model id: requests still in the air. */
  inFlight: Record<string, number>
  /** By model id: why a model drew nothing. */
  notes: Record<string, string | null>
}

const NOTHING_FETCHED: Fetched = { series: {}, inFlight: {}, notes: {} }

export interface ModelCompareOptions {
  /**
   * Off on air quality, which comes from CAMS whatever forecast model ranks the
   * field, so a comparison there could only draw the same line twice.
   */
  enabled: boolean
  /** The charted destinations, in the chart's order, each with its rank. */
  destinations: readonly CompareDestination[]
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
  /** The chart's hourly grid, which compared series are re-indexed onto. */
  times: number[]
}

export function useModelCompare({
  enabled,
  destinations,
  heldSeries,
  analyzed,
  analysisSeq,
  models,
  picked,
  fetchable,
  times,
}: ModelCompareOptions) {
  const [fetched, setFetched] = useState<Fetched>(NOTHING_FETCHED)

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
    setFetched(NOTHING_FETCHED)
  }, [analysisSeq])

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
    () =>
      picked.filter(
        (id) =>
          id !== rankingModel &&
          fetchable.includes(id) &&
          models.some((m) => m.id === id),
      ),
    [fetchable, models, picked, rankingModel],
  )

  const active =
    enabled && analyzed !== null && destinations.length > 0 && drawnIds.length > 0

  // One string per dependency that is really a set, so an effect keyed on it
  // runs once per real change rather than once per re-derived array.
  const drawnKey = drawnIds.join(',')
  const destinationsKey = destinations.map((d) => d.key).join('|')

  useEffect(() => {
    if (!active || !window_) return
    const seqAtCall = seqRef.current
    for (const id of drawnIds) {
      const model = models.find((m) => m.id === id)
      if (!model) continue
      const missing = destinations.filter(
        (d) => !requestedRef.current.has(pairKey(id, d.key)),
      )
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
        { model: id, signal: controller.signal },
      )
        .then((results) => {
          if (seqRef.current !== seqAtCall) return
          setFetched((prev) => {
            const series = { ...prev.series }
            missing.forEach((d, i) => {
              series[pairKey(id, d.key)] = results[i]?.series ?? null
            })
            return {
              series,
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
              ? // The one message mirrored from backend/app/services/weather.py.
                // No remedy clause: the analysis path's "switch to a different
                // model" is not this surface's remedy, since unticking the box
                // in the picker is what removes these lines.
                `${model.label} has no forecast coverage for this area.`
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
        })
    }
    // `drawnKey` and `destinationsKey` stand in for the two arrays: both are
    // re-derived on every live knob change, so keying on the references would
    // re-run this for sets that had not moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, analysisSeq, drawnKey, destinationsKey, window_])

  // One colour per COMPARED model, taken from the ramp past whatever the
  // destinations on screen are wearing, so no line can be read as the wrong
  // fact. The ranking model takes none: its lines keep their destinations'
  // colours, which is how the chart draws with no comparison up.
  const colors = useMemo(() => {
    const destinationColors = destinations.map((d) => d.color)
    const out: Record<string, string> = {}
    drawnIds.forEach((id, i) => {
      out[id] = modelColor(destinationColors, i)
    })
    return out
  }, [destinations, drawnIds])

  // The chips: the ranking model first, then every extra on the chart. The
  // ranking model is always ready — its numbers are the report — so only the
  // extras can be loading or empty-handed.
  const compared: ComparedModel[] = useMemo(() => {
    if (!active || !rankingModel) return []
    const chip = (id: string, status: CompareStatus, note: string | null): ComparedModel => {
      const model = models.find((m) => m.id === id)
      return {
        id,
        label: model?.label ?? id,
        blend: model?.blend === true,
        color: id === rankingModel ? null : (colors[id] ?? null),
        status,
        note,
      }
    }
    return [
      chip(rankingModel, 'ready', null),
      ...drawnIds.map((id) => {
        const waiting = (fetched.inFlight[id] ?? 0) > 0
        const drew = destinations.some((d) => fetched.series[pairKey(id, d.key)])
        return chip(id, waiting ? 'loading' : drew ? 'ready' : 'absent', fetched.notes[id] ?? null)
      }),
    ]
  }, [active, colors, destinations, drawnIds, fetched, models, rankingModel])

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
    const drew = drawnIds.filter((id) =>
      destinations.some((d) => fetched.series[pairKey(id, d.key)]),
    )
    if (drew.length === 0) return null
    const reaches = [rankingModel, ...drew].map(
      (id) => models.find((m) => m.id === id)?.forecastHours ?? 0,
    )
    const end = compareEndMs(window_.endMs, reaches, nowRef.current)
    return end < window_.endMs ? end : null
  }, [active, destinations, drawnIds, fetched.series, models, rankingModel, window_])

  const lines: ChartLine[] = useMemo(() => {
    if (!active || !rankingModel) return []
    // The ranking model rides the same product as the rest, seeded from the
    // numbers the analysis already holds, so every line is composed once and
    // every label reads alike.
    const series: Record<string, HourlySeries | null> = {}
    for (const d of destinations) {
      series[pairKey(rankingModel, d.key)] = heldSeries[d.key] ?? null
      for (const id of drawnIds) {
        series[pairKey(id, d.key)] = modelSeriesOnGrid(fetched.series[pairKey(id, d.key)], times)
      }
    }
    const onChart: CompareModel[] = compared.map((m) => ({
      id: m.id,
      label: m.label,
      color: m.color,
    }))
    return compareSeries(destinations, onChart, series, times, endMs)
  }, [
    active,
    compared,
    destinations,
    drawnIds,
    endMs,
    fetched.series,
    heldSeries,
    rankingModel,
    times,
  ])

  return { active, compared, lines, endMs }
}
