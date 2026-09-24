import { useState } from 'react'
import type { ShareableState } from '../utils/urlState'

/**
 * The map's overlay switches (#121, #246, #446) and the forecast player's.
 *
 * None of them is a knob: each changes what is drawn over the map and nothing
 * about what was asked for, so no ranking moves and `commitNeeded` does not
 * know they exist. Every one rides the URL, so a shared link reproduces the
 * picture. Their own hook because the map, the Layers popover, the legend and
 * the timeline all read them and none of them owns them.
 *
 * @param restored The state a shared link restored, or null.
 * @param isDesktop Whether the viewport is at the desktop width, which decides
 *   the player's default.
 */
export function useMapOverlays(restored: Partial<ShareableState> | null, isDesktop: boolean) {
  // Live, not part of the analyze request. Toggling queries NIFC for the
  // current viewport.
  const [showWildfires, setShowWildfires] = useState(() => restored?.showWildfires ?? false)
  // Radar is raster tiles the browser fetches straight from IEM; smoke is one
  // national GeoJSON from the pod.
  const [showRadar, setShowRadar] = useState(() => restored?.showRadar ?? false)
  const [showSmoke, setShowSmoke] = useState(() => restored?.showSmoke ?? false)
  // The snow analysis (#446). NOAA renders each tile on request, so like the
  // radar it is the browser that fetches them, and like the radar it draws
  // nothing the ranking ever reads.
  const [showSnow, setShowSnow] = useState(() => restored?.showSnow ?? false)
  // The forecast grid (#246), with one difference worth naming: this toggle is
  // a spend boundary. Turning it on fetches a lattice of forecasts over the
  // analyzed field, and leaving it on is standing consent for the next
  // analysis to do the same. It still changes nothing about the ranking.
  const [showGrid, setShowGrid] = useState(() => restored?.showGrid ?? false)
  // Whether the forecast player is on the map. `null` means "this device's
  // default": on at a desktop width, off on a phone, where the bar is a band
  // across a map that can be a third of the screen. A boolean means the reader
  // has decided, and only a decision reaches the URL, in either direction, so
  // a link can carry the player onto a phone or off a desktop.
  const [showPlayer, setShowPlayer] = useState<boolean | null>(() => restored?.showPlayer ?? null)
  // Whether the player is on the map: the reader's decision where they have
  // made one, this device's default otherwise.
  const playerShown = showPlayer ?? isDesktop

  return {
    showWildfires,
    setShowWildfires,
    showRadar,
    setShowRadar,
    showSmoke,
    setShowSmoke,
    showSnow,
    setShowSnow,
    showGrid,
    setShowGrid,
    showPlayer,
    setShowPlayer,
    playerShown,
  }
}
