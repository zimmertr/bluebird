import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from 'react'
import type { CustomDestination } from '../types'
import { parseCustomCsv } from '../utils/customDestinations'
import { fetchPresetList, presetListById } from '../utils/presetLists'

export interface LinkedListInputs {
  /** The list a share link named (`list=`), by its id, or null. */
  id: string | null
  /** The coordinates box (`useDestinationInputs`). */
  customCsv: string
  setCustomCsv: Dispatch<SetStateAction<string>>
  /** The list's rows are in the box: frame the map on them. Latest call wins. */
  onArrived: (points: CustomDestination[]) => void
  /** The list did not arrive, which the panel's messages say (`presetListFailed`). */
  onFailed: (failed: boolean) => void
}

/**
 * A ready-made list a share link names (#864): fetched once the page opens
 * and put in the coordinates box, where a picked one goes.
 *
 * A link carries such a list as `list=<id>` rather than as its rows, so the
 * rows are not in the link to restore and arrive a moment after the panel
 * does. Two things are true in that moment, and this hook answers both:
 *
 * - `awaited` is the id while the box does not hold the list yet. The address
 *   bar keeps naming it, or the first write after open would drop the list
 *   from the link the reader just opened. It stays after a fetch that failed,
 *   so a reload asks again, and goes when the list lands or the reader puts
 *   rows of their own in the box.
 * - `arriving` is true until the fetch answers either way. A link's run on
 *   open waits for it, since the gate is shut over an empty box.
 *
 * A reader who typed into the box before the list landed keeps what they
 * typed. The fetch is `fetchPresetList`'s, which never rejects.
 */
export function useLinkedList({ id, customCsv, setCustomCsv, onArrived, onFailed }: LinkedListInputs) {
  const [awaited, setAwaited] = useState(id)
  const [arriving, setArriving] = useState(id !== null)
  // The latest box and callbacks, read when the fetch answers.
  const latest = useRef({ customCsv, onArrived, onFailed })
  latest.current = { customCsv, onArrived, onFailed }

  useEffect(() => {
    const list = id === null ? undefined : presetListById(id)
    if (!list) {
      setAwaited(null)
      setArriving(false)
      return
    }
    let current = true
    void fetchPresetList(list).then((text) => {
      if (!current) return
      setArriving(false)
      if (text === null) {
        latest.current.onFailed(true)
        return
      }
      setAwaited(null)
      if (latest.current.customCsv.trim() !== '') return
      setCustomCsv(text)
      const points = parseCustomCsv(text)
      if (points.length > 0) latest.current.onArrived(points)
    })
    return () => {
      current = false
    }
  }, [id, setCustomCsv])

  // Rows of the reader's own take the box, and the link's list with it.
  const boxBlank = customCsv.trim() === ''
  useEffect(() => {
    if (!boxBlank) setAwaited(null)
  }, [boxBlank])

  return { awaited, arriving }
}
