import { useState } from 'react'
import { readStarredLists, writeStarredLists } from '../utils/viewPrefs'

/**
 * The coordinate lists this browser starred (#848), which the Coordinate list
 * menu shows first under Starred: the ids, in the order they were starred,
 * and the toggle a row's star presses.
 *
 * A habit of one browser, kept in its local storage like the theme (record
 * 0158) and never in a share link. A storage that refuses leaves the stars
 * working for the visit and forgotten after it. `known` is every id the
 * menu offers, so a star on a list a later build dropped is not shown, and
 * is dropped from storage by the next press.
 */
export function useStarredLists(known: readonly string[]): {
  starred: readonly string[]
  toggleStar: (id: string) => void
} {
  const [starred, setStarred] = useState<readonly string[]>(() =>
    readStarredLists().filter((id) => known.includes(id)),
  )
  const toggleStar = (id: string) => {
    const next = starred.includes(id) ? starred.filter((other) => other !== id) : [...starred, id]
    setStarred(next)
    writeStarredLists(next)
  }
  return { starred, toggleStar }
}
