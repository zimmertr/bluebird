import { useCallback, useState } from 'react'

/**
 * Whether the controls panel is open: docked on a desktop, an off-canvas
 * drawer on a phone.
 *
 * It starts open on a desktop and closed on a phone (#696), a shared link
 * included. A phone that opened on the drawer covered the map, and with it the
 * search field, which is how most readers first look for a place; the phone's
 * Controls button reopens it from the row under the field. The width is read
 * once, at mount, because a window crossing the breakpoint is a resize rather
 * than a reason to open or close anything.
 */
export function useDrawer(isDesktop: boolean) {
  const [sidebarOpen, setSidebarOpen] = useState(isDesktop)
  const closeDrawer = useCallback(() => setSidebarOpen(false), [])
  const openDrawer = useCallback(() => setSidebarOpen(true), [])
  return { sidebarOpen, setSidebarOpen, closeDrawer, openDrawer }
}
