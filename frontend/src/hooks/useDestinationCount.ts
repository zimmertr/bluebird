import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DiscoveryType, GeoPolygon } from '../types'
import type { DiscoverySource } from './useCapabilities'
import type { Discovered } from '../utils/analysisPipeline'
import { ringUsable } from '../utils/analyzeGate'
import { postDestinations } from '../utils/apiFetch'
import {
  type CountAnswer,
  countDelay,
  countOf,
  countRequest,
  countWanted,
  fieldKey,
  mergedCount,
  readCount,
} from '../utils/destinationCount'

interface Inputs {
  /** Every finished area (`useDestinationInputs`). */
  areas: readonly GeoPolygon[]
  drawing: boolean
  largestAreaKm2: number | null
  maxAreaKm2: number
  destinationTypes: DiscoveryType[]
  includeUnnamedPeaks: boolean
  /** Where the pod answers rings from (`/api/capabilities`): counts run only on `places`. */
  discoverySource: DiscoverySource
  /**
   * Every area was removed or every kind unticked (#803, M7): the field a failed
   * run found for it (`useAnalyze.dropFound`, record 0204) describes a search
   * the panel no longer holds, so its dots and pending rows go.
   */
  onRingGone?: () => void
}

/** A ring's field as a count found it, with the discovery it answers (`fieldKey`). */
export interface CountedField {
  found: Discovered
  key: string
}

export interface DestinationCount {
  /**
   * How many destinations the ring as it stands holds, ahead of Analyze, or
   * null while it is unknown: no count yet, a count that failed, or a
   * deployment that counts nothing.
   */
  ringCount: number | null
  /**
   * The ring's field as of this moment, for a run starting now: it forecasts
   * this rather than asking the pod again when its own discovery would ask
   * the same question (`useAnalyze`). Null after an over-cap answer, which
   * carries a count and no field.
   */
  counted: () => CountedField | null
}

// Answers kept, by discovery, so a reader who ticks a kind and unticks it
// again is answered from here rather than asking the pod twice.
// Room for every area's answer and a few edits back, so undoing an edit
// finds its count again without asking.
const KEPT_ANSWERS = 16

/**
 * The ring's count ahead of Analyze (#803, D1). Once the ring and its kinds
 * have been still for `COUNT_DEBOUNCE_MS`, and never sooner than
 * `COUNT_SPACING_MS` after the last count, it asks `POST /api/destinations`
 * what the ring holds, for the ring alone, the way a run's discovery would.
 * Only where the pod answers from its places table (`countWanted`): a count
 * on Overpass would spend a donated service on a ring the reader may never
 * analyze.
 *
 * One count at a time: an edit aborts the one in flight and waits for the
 * next stillness. A 200 is the field; the pod's over-cap 400 is a count with
 * no field, which greys Analyze through the gate's `overCap`; anything else
 * (a 429, a 502, a dropped connection) is silent and is not asked again for
 * the same ring, because the run will discover for itself and every one of
 * those already has its message there.
 *
 * Modelled on `useElevationLookup`, the other lookup the panel runs ahead of
 * Analyze, which shares the same per-address bucket.
 */
//
// Several areas are counted one at a time, each under its own key (record
// 0306), so moving one area asks again for that area alone; the answer is
// their merge (`mergedCount`).
export function useDestinationCount(i: Inputs): DestinationCount {
  const areaTooLarge = i.largestAreaKm2 !== null && i.largestAreaKm2 > i.maxAreaKm2
  const wanted = countWanted(
    i.discoverySource,
    ringUsable(i.areas.length, areaTooLarge),
    i.drawing,
    i.destinationTypes,
  )
  // Each area's key, in order: what its answer is held under.
  const keys = useMemo(
    () => i.areas.map((area) => fieldKey([area], i.destinationTypes, i.includeUnnamedPeaks)),
    [i.areas, i.destinationTypes, i.includeUnnamedPeaks],
  )
  const [answers, setAnswers] = useState<ReadonlyMap<string, CountAnswer>>(() => new Map())
  const answersRef = useRef(answers)
  const lastSentRef = useRef<number | null>(null)
  // The inputs as of this render, for the timer that sends the count: the
  // effect is keyed on the discovery they describe, not on their identities,
  // which change when nothing a count would ask about does.
  const inputsRef = useRef(i)
  inputsRef.current = i

  // The first area with no answer yet, which the next count asks about.
  const unanswered = keys.find((k) => !answers.has(k)) ?? null

  useEffect(() => {
    if (!wanted || unanswered === null || answersRef.current.has(unanswered)) return
    const key = unanswered
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      const { areas, destinationTypes, includeUnnamedPeaks } = inputsRef.current
      const area = areas.find((a) => fieldKey([a], destinationTypes, includeUnnamedPeaks) === key)
      if (area === undefined) return
      lastSentRef.current = Date.now()
      try {
        const res = await postDestinations(countRequest(area, destinationTypes, includeUnnamedPeaks), controller.signal)
        const answer = await readCount(res)
        if (controller.signal.aborted || answer === null) return
        const next = new Map(answersRef.current)
        next.set(key, answer)
        while (next.size > KEPT_ANSWERS) next.delete(next.keys().next().value as string)
        answersRef.current = next
        setAnswers(next)
      } catch {
        // An abort, which is the next edit, or a connection that dropped.
        // Either way the run discovers for itself.
      }
    }, countDelay(Date.now(), lastSentRef.current))
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [wanted, unanswered])

  // #803, M7: no area or no kind left releases the found field.
  const gone = i.areas.length === 0 || i.destinationTypes.length === 0
  const onRingGoneRef = useRef(i.onRingGone)
  onRingGoneRef.current = i.onRingGone
  useEffect(() => {
    if (gone) onRingGoneRef.current?.()
  }, [gone])

  const answer = wanted ? mergedCount(keys.map((k) => answers.get(k))) : undefined
  const ringCount = answer === undefined ? null : countOf(answer)

  const counted = useCallback((): CountedField | null => {
    const { areas, destinationTypes, includeUnnamedPeaks } = inputsRef.current
    if (areas.length === 0) return null
    const held = mergedCount(
      areas.map((area) => answersRef.current.get(fieldKey([area], destinationTypes, includeUnnamedPeaks))),
    )
    // Keyed as a run over these areas with no list would key its discovery,
    // so `useAnalyze` takes it only for that question.
    return held?.kind === 'found'
      ? { found: held.found, key: fieldKey(areas, destinationTypes, includeUnnamedPeaks) }
      : null
  }, [])

  return useMemo(() => ({ ringCount, counted }), [ringCount, counted])
}
