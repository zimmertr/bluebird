import { useCallback, useState } from 'react'
import { type BaseLayer, DEFAULT_BASE_OPACITY, clampOpacity } from '../utils/baseMapOpacity'
import type { ShareableState } from '../utils/urlState'

/**
 * The map's overlay switches (#121, #246, #446, #550, #799), the forecast
 * player's and the 3D terrain's, and the four base-map layers' opacity levels.
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
  // The Forest Service closure orders (#550), read from the pod's snapshot
  // like the fires. Two switches rather than one because the two layers answer
  // different questions: whether the ground is closed, and whether the trail
  // to it is. A reader planning a route wants the second without the first
  // painting the whole district.
  const [showAreaClosures, setShowAreaClosures] = useState(() => restored?.showAreaClosures ?? false)
  const [showTrailClosures, setShowTrailClosures] = useState(() => restored?.showTrailClosures ?? false)
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
  // The terrain and imagery layers (#799): contour lines and shaded relief,
  // both drawn from one elevation model, and the aerial imagery. Unlike the
  // layers above they show the ground rather than a condition on it, and they
  // ask nothing of the pod: the browser fetches every tile itself.
  const [showContours, setShowContours] = useState(() => restored?.showContours ?? false)
  const [showRelief, setShowRelief] = useState(() => restored?.showRelief ?? false)
  // The slope angle shading (#799): each slope's steepness in the avalanche
  // bands, painted in the browser from the relief's own elevation.
  const [showSlope, setShowSlope] = useState(() => restored?.showSlope ?? false)
  const [showSatellite, setShowSatellite] = useState(() => restored?.showSatellite ?? false)
  // The four Base map rows' opacity sliders (record 0241), 0 to 100, each
  // kept while its row is off so switching it back on brings the level back.
  // Presentation like the switches: no fetch follows a level, and the
  // ranking never reads one.
  const [baseOpacity, setBaseOpacityAll] = useState(() => ({ ...DEFAULT_BASE_OPACITY, ...restored?.baseOpacity }))
  // One stable setter for the four, so the menu's rows can share it.
  const setBaseOpacity = useCallback(
    (layer: BaseLayer, level: number) =>
      setBaseOpacityAll((all) => {
        const next = clampOpacity(level)
        return all[layer] === next ? all : { ...all, [layer]: next }
      }),
    [],
  )
  // The satellite fire detections (#799), read from the pod's hourly copy of
  // NASA FIRMS for the view, the way the fire perimeters are.
  const [showFireActivity, setShowFireActivity] = useState(() => restored?.showFireActivity ?? false)
  // Whether the map stands the ground up in 3D (#799). Kept with the layers
  // because it changes what the map draws and nothing about the report, but it
  // is the map's own button rather than a Layers row: it changes how the whole
  // map is seen, where a row adds one picture to it.
  const [showTerrain, setShowTerrain] = useState(() => restored?.showTerrain ?? false)
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
    showAreaClosures,
    setShowAreaClosures,
    showTrailClosures,
    setShowTrailClosures,
    showRadar,
    setShowRadar,
    showSmoke,
    setShowSmoke,
    showSnow,
    setShowSnow,
    showGrid,
    setShowGrid,
    showContours,
    setShowContours,
    showRelief,
    setShowRelief,
    showSlope,
    setShowSlope,
    showSatellite,
    setShowSatellite,
    baseOpacity,
    setBaseOpacity,
    showFireActivity,
    setShowFireActivity,
    showTerrain,
    setShowTerrain,
    showPlayer,
    setShowPlayer,
    playerShown,
  }
}

/** What `useMapOverlays` hands its callers: the Layers popover and the legend read it whole. */
export type MapOverlays = ReturnType<typeof useMapOverlays>
