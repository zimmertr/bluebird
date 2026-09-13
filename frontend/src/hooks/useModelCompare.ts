import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DestinationResult } from '../types'
import type { ForecastModelOption } from './useCapabilities'
import { ChartLine, chartKey, cutSeriesAfter } from '../utils/chartData'
import { normalizeWindow } from '../utils/forecastWindow'
import {
  MAX_COMPARE_MODELS,
  addableModels,
  compareColors,
  compareEndMs,
  compareSeries,
} from '../utils/modelCompare'
import { OpenMeteoModelCoverage, fetchWeather } from '../utils/openMeteo'
import type { WeatherSeries } from '../utils/openMeteo'

/**
 * Comparing models at one destination (issue #232): the spend, and the state
 * that survives between clicks.
 *
 * Everything decidable without a network sits in `utils/modelCompare.ts`; this
 * is the part that cannot, so it holds as little as possible.
 *
 * **One single-model request per added model**, rather than one request naming
 * them all. They cost within 0.2 weighted calls of each other for one
 * destination, and the split buys three things the combined request cannot:
 *
 * - a per-model verdict. Measured 2026-09-12 at 46.5,8.0, a two-model request
 *   including out-of-domain HRRR answers HTTP 200 with BARE `precipitation`
 *   keys — another model's numbers under no label — while the same question
 *   asked of one model answers 400 and names itself. A bare key is treated as
 *   absent either way, but one request per model is what keeps HRRR's absence
 *   from erasing its companion's line.
 * - the numbers. `fetchWeather` runs the vector-pinned aggregation the analysis
 *   itself runs, at the destination's own elevation, so a compared line and a
 *   re-analysis under that model cannot disagree.
 * - the cache and the pacer. Both are keyed per location and model already, so
 *   flipping a model off and on is free, and so is switching the analysis to a
 *   model that has just been compared.
 */

export type CompareStatus = 'loading' | 'ready' | 'absent'

export interface ComparedModel {
  id: string
  label: string
  /** A `*_seamless` product, which changes model partway along its own line. */
  blend: boolean
  color: string
  status: CompareStatus
  /** Why nothing is drawn, when there is something to say. */
  note: string | null
}

interface Entry {
  status: CompareStatus
  series: WeatherSeries | null
  note: string | null
}

export interface ModelCompareOptions {
  /** Off unless exactly one destination is charted and its metric has models. */
  enabled: boolean
  row: DestinationResult | null
  /** The window and model every held number came from. */
  analyzed: { window: { startMs: number; endMs: number }; forecastModel: string } | null
  /** Bumped per committed analysis; a new one drops the comparison. */
  analysisSeq: number
  models: readonly ForecastModelOption[]
  /** The chart's hourly grid, which compared series are re-indexed onto. */
  times: number[]
  /** The destination's own line colour, which no compared model may take. */
  baseColor: string
}

export function useModelCompare({
  enabled,
  row,
  analyzed,
  analysisSeq,
  models,
  times,
  baseColor,
}: ModelCompareOptions) {
  const [added, setAdded] = useState<string[]>([])
  const [entries, setEntries] = useState<Record<string, Entry>>({})

  const active = enabled && row !== null && analyzed !== null && models.length > 0

  // What the held comparison is an answer to. A different destination or a new
  // analysis is a different question, so the lines go rather than lingering
  // under a report that never saw them.
  //
  // `enabled` is deliberately not part of it: a look at air quality turns the
  // comparison off, and dropping the models over it would make the reader buy
  // them again to come back to the metric they left.
  const scope = row && analyzed ? `${analysisSeq}|${chartKey(row)}` : ''

  // "Now" is captured per scope rather than read per render: it decides the
  // clamp and which models can be added, and a value that moved every render
  // would rebuild every line on every hover.
  const nowRef = useRef(Date.now())
  const inFlight = useRef(new Map<string, AbortController>())
  const scopeRef = useRef(scope)
  scopeRef.current = scope

  useEffect(() => {
    nowRef.current = Date.now()
    for (const controller of inFlight.current.values()) controller.abort()
    inFlight.current.clear()
    setAdded([])
    setEntries({})
  }, [scope])

  // Abort whatever is still in the air when the chart goes away, so a comparison
  // nobody is waiting for stops spending.
  useEffect(
    () => () => {
      for (const controller of inFlight.current.values()) controller.abort()
      inFlight.current.clear()
    },
    [],
  )

  // The snapshot records the request as submitted, so a Current analysis
  // arrives with start equal to end. That describes no span at all:
  // `normalizeWindow` is what turns it into the hour it means, and without it
  // every model fails the reach test below, the Compare control never appears,
  // and the fetch would ask Open-Meteo for a moment between itself and itself.
  const window_ = useMemo(
    () => (analyzed ? normalizeWindow(analyzed.window.startMs, analyzed.window.endMs) : null),
    [analyzed],
  )

  const add = useCallback(
    (id: string) => {
      const model = models.find((m) => m.id === id)
      if (!active || !model || !row || !window_) return
      if (added.includes(id) || added.length >= MAX_COMPARE_MODELS - 1) return
      const scopeAtCall = scopeRef.current

      setAdded((prev) => (prev.includes(id) ? prev : [...prev, id]))
      setEntries((prev) => ({ ...prev, [id]: { status: 'loading', series: null, note: null } }))

      const controller = new AbortController()
      inFlight.current.get(id)?.abort()
      inFlight.current.set(id, controller)

      // Asked for every hour this model has inside the window, not for the
      // clamped window: the clamp is a drawing decision, so removing a
      // short-reach model has to give the other lines their hours back without
      // buying them again.
      const endMs = compareEndMs(window_.endMs, [model.forecastHours], nowRef.current)
      fetchWeather(
        [{ latitude: row.latitude, longitude: row.longitude, elevation_ft: row.elevation_ft }],
        window_.startMs,
        endMs,
        { model: id, signal: controller.signal },
      )
        .then(([result]) => {
          if (scopeRef.current !== scopeAtCall) return
          setEntries((prev) => ({
            ...prev,
            [id]: result?.series
              ? { status: 'ready', series: result.series, note: null }
              : { status: 'absent', series: null, note: null },
          }))
        })
        .catch((e) => {
          if (e instanceof DOMException && e.name === 'AbortError') return
          if (scopeRef.current !== scopeAtCall) return
          const note =
            e instanceof OpenMeteoModelCoverage
              ? // The one message mirrored from backend/app/services/weather.py.
                // No remedy clause: the analysis path's "switch to a different
                // model" is not this surface's remedy, and removing the line is
                // the × already beside it.
                `${model.label} has no forecast coverage for this area.`
              : e instanceof Error
                ? e.message
                : null
          setEntries((prev) => ({
            ...prev,
            [id]: { status: 'absent', series: null, note },
          }))
        })
        .finally(() => {
          if (inFlight.current.get(id) === controller) inFlight.current.delete(id)
        })
    },
    [active, added, models, row, window_],
  )

  const remove = useCallback((id: string) => {
    inFlight.current.get(id)?.abort()
    inFlight.current.delete(id)
    setAdded((prev) => prev.filter((k) => k !== id))
    // The fetched series stays: re-adding a model is then instant, and it
    // costs nothing to hold two of them until the scope resets.
    setEntries((prev) => {
      const next = { ...prev }
      if (next[id]?.status === 'loading') delete next[id]
      return next
    })
  }, [])

  const colors = useMemo(() => compareColors(baseColor, added), [baseColor, added])

  const compared: ComparedModel[] = useMemo(
    () =>
      added.map((id) => {
        const model = models.find((m) => m.id === id)
        const entry = entries[id]
        return {
          id,
          label: model?.label ?? id,
          blend: model?.blend === true,
          color: colors[id],
          status: entry?.status ?? 'loading',
          note: entry?.note ?? null,
        }
      }),
    [added, colors, entries, models],
  )

  const addable = useMemo(
    () =>
      active && analyzed && window_
        ? addableModels(models, analyzed.forecastModel, added, window_, nowRef.current)
        : [],
    [active, added, analyzed, models, window_],
  )

  /**
   * Where every line on the chart stops while a comparison is up — the
   * destination's own line included, since a held line running past the models
   * beside it is the ragged comparison the clamp exists to prevent. Null when
   * nothing is compared, or when every model reaches the window's end.
   *
   * Only the models actually DRAWN bound it. A model that came back uncovered
   * contributes no line, so letting its reach cut the lines that did arrive
   * would hide hours on behalf of a model nobody can see.
   */
  const drawn = useMemo(
    () => compared.filter((m) => m.status === 'ready').map((m) => m.id),
    [compared],
  )

  const endMs = useMemo(() => {
    if (!active || !analyzed || !window_ || drawn.length === 0) return null
    const reaches = [analyzed.forecastModel, ...drawn].map(
      (id) => models.find((m) => m.id === id)?.forecastHours ?? 0,
    )
    const end = compareEndMs(window_.endMs, reaches, nowRef.current)
    return end < window_.endMs ? end : null
  }, [active, analyzed, drawn, models, window_])

  const lines: ChartLine[] = useMemo(() => {
    if (!active) return []
    return compared
      .filter((m) => m.status === 'ready')
      .map((m) => ({
        // Prefixed so a model's key can never collide with a destination's,
        // which is a coordinate pair.
        key: `model:${m.id}`,
        label: m.label,
        color: m.color,
        series: cutSeriesAfter(times, compareSeries(entries[m.id]?.series, times), endMs),
      }))
  }, [active, compared, endMs, entries, times])

  return { active, compared, addable, add, remove, lines, endMs }
}
