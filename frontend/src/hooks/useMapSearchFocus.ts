import { useCallback, useRef } from 'react'
import type { SearchBoxHandle } from '../components/SearchBox'

/**
 * The panel's search affordance hands the keyboard to the map's search box
 * (#687, record 0137): the box lives on the map, the affordance in the panel,
 * and this is the one place that knows both.
 *
 * On a phone the drawer covers the map, so it closes first, and the focus
 * waits a frame for that commit: the drawer goes inert as it closes, and the
 * map's Controls button mounts in its place and takes an orphaned keyboard,
 * so a focus given in the same tick would be taken straight back.
 */
export function useMapSearchFocus({ isDesktop, closeDrawer }: { isDesktop: boolean; closeDrawer: () => void }) {
  const searchBoxRef = useRef<SearchBoxHandle>(null)
  const focusMapSearch = useCallback(() => {
    if (isDesktop) {
      searchBoxRef.current?.focus()
      return
    }
    closeDrawer()
    requestAnimationFrame(() => searchBoxRef.current?.focus())
  }, [isDesktop, closeDrawer])
  return { searchBoxRef, focusMapSearch }
}
