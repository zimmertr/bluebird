import { useCallback, useState } from 'react'

/**
 * Whether the controls panel is open: a desk's sentence-bar card, or the
 * Controls sheet on a phone (record 0141).
 *
 * It starts shut everywhere, a shared link included (#696, record 0334). A
 * phone that opened on the panel covered the map, and with it the search
 * field, which is how most readers first look for a place; a desk opens on
 * the map with the sentence bar over it, and a chip opens a card.
 */
export function useDrawer() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const closeDrawer = useCallback(() => setSidebarOpen(false), [])
  const openDrawer = useCallback(() => setSidebarOpen(true), [])
  return { sidebarOpen, setSidebarOpen, closeDrawer, openDrawer }
}
