import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CustomDestination } from '../types'
import { parseCustomCsv } from '../utils/customDestinations'
import { fetchPresetList, presetListById } from '../utils/presetLists'

export interface PresetListsInputs {
  /** The lists a share link named (`list=`), by id, in order. */
  initial: readonly string[]
  /** A list's rows arrived: frame the map on them. Latest call wins. */
  onArrived: (points: CustomDestination[]) => void
  /** A list did not arrive (true), or the last one asked for did (false), which the panel's messages say. */
  onFailed: (failed: boolean) => void
}

const NO_ROWS: readonly CustomDestination[] = []

/**
 * The ready-made lists the reader added (record 0306): which ones, in order,
 * and the rows of each that has arrived.
 *
 * A list is held by its id and fetched on its own, beside the reader's own
 * coordinates rather than in their box, so several can stand at once and each
 * is removed whole. A link names its lists (`list=`) rather than carrying
 * their rows, so those rows arrive a moment after the panel does:
 *
 * - `arriving` is true while any list has not answered. A link's run on open
 *   waits for it, since the gate would read the lists as empty.
 * - A list that cannot be had is dropped from the ids, and `onFailed(true)`
 *   puts its message in the Analyze button's list. A later add that lands
 *   clears it.
 *
 * The fetch is `fetchPresetList`'s, which keeps every list that arrived for
 * the session and never rejects.
 */
export function usePresetLists({ initial, onArrived, onFailed }: PresetListsInputs) {
  const [ids, setIds] = useState<string[]>(() => [...new Set(initial)].filter((id) => presetListById(id)))
  const [texts, setTexts] = useState<ReadonlyMap<string, string>>(() => new Map())
  // The callbacks as they stand, so the fetch effect is keyed on the ids alone.
  const latest = useRef({ ids, onArrived, onFailed })
  latest.current = { ids, onArrived, onFailed }
  // The ids asked for, on their way or arrived, so no render asks twice and
  // a list removed and added again comes back from `texts` without a fetch.
  // A failed one leaves it, so adding it again asks again.
  const asked = useRef(new Set<string>())

  useEffect(() => {
    for (const id of ids) {
      const list = presetListById(id)
      if (!list || asked.current.has(id)) continue
      asked.current.add(id)
      void fetchPresetList(list).then((text) => {
        if (text === null) asked.current.delete(id)
        // Removed while it was on its way: nothing to say and nothing to frame.
        if (!latest.current.ids.includes(id)) {
          if (text !== null) setTexts((now) => new Map(now).set(id, text))
          return
        }
        if (text === null) {
          setIds((now) => now.filter((held) => held !== id))
          latest.current.onFailed(true)
          return
        }
        setTexts((now) => new Map(now).set(id, text))
        latest.current.onFailed(false)
        const points = parseCustomCsv(text)
        if (points.length > 0) latest.current.onArrived(points)
      })
    }
  }, [ids])

  const add = useCallback((id: string) => {
    if (!presetListById(id)) return
    setIds((now) => (now.includes(id) ? now : [...now, id]))
  }, [])

  const remove = useCallback((id: string) => {
    setIds((now) => now.filter((held) => held !== id))
  }, [])

  // Every arrived list's rows, in the order the lists were added. Parsed once
  // per change to the lists, never per keystroke in the box.
  const rows = useMemo(() => {
    const arrived = ids.filter((id) => texts.has(id))
    return arrived.length === 0 ? NO_ROWS : arrived.flatMap((id) => parseCustomCsv(texts.get(id) ?? ''))
  }, [ids, texts])

  const arriving = ids.some((id) => !texts.has(id))

  return { ids, add, remove, rows, arriving }
}

/** What `usePresetLists` hands its callers. */
export type PresetLists = ReturnType<typeof usePresetLists>
