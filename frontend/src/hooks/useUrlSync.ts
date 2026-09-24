import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { CameraView } from '../utils/mapView'
import { type ShareableState, encodeState } from '../utils/urlState'
import { type UrlWriter, debounceUrlWrite, urlNeedsSync } from '../utils/urlSync'

export interface UrlSyncInputs {
  /** The drawn ring, or null before one is drawn. */
  polygon: ShareableState['polygon']
  /** The kinds of place the ring looks for. */
  destinationTypes: ShareableState['destinationTypes']
  /** Whether peaks with an elevation and no name are found too. */
  includeUnnamedPeaks: boolean
  /** The forecast window the panel selects. */
  selection: ShareableState['selection']
  /** The panel's ranking model. */
  forecastModel: string
  /** The models the chart draws beside it. */
  comparedModels: ShareableState['compareModels']
  /** The ranking and its direction. */
  sortBy: ShareableState['sortBy']
  sortDesc: boolean
  /** The aggregate each metric row's dropdown holds. */
  rowKeys: ShareableState['rowKeys']
  /** The forecast bounds. */
  constraints: ShareableState['constraints']
  /** The results cap. */
  limit: number
  /** The coordinates box, as typed. */
  customCsv: string
  /** The map's layer switches. */
  showWildfires: boolean
  showRadar: boolean
  showSmoke: boolean
  showSnow: boolean
  showGrid: boolean
  /** The player switch: the reader's answer, or null for the device default. */
  showPlayer: ShareableState['showPlayer']
  /** The forecast grid's style and coverage. */
  gridStyle: ShareableState['gridStyle']
  gridReachFrac: number
  /** Searched and clicked places. */
  places: ShareableState['pins']
  /** The deployment's default model, which a link leaves out (`/api/capabilities`). */
  defaultForecastModel: string
  /** The ×-removed rows, by `geoKey`. */
  removedKeys: ReadonlySet<string>
  /** The table's header sort, or null while it follows the ranking. */
  tableSort: ShareableState['tableSort']
  /** The camera the link opened on, held until the map reports its own. */
  restoredView: CameraView | null
}

export interface UrlSync {
  /** The debounced writer; a link's run on open flushes it. */
  writeUrl: UrlWriter
  /**
   * The map's settled camera, and whether the reader moved it. Stable, and
   * outside React state: a pan must not render the page, so the camera goes
   * straight to the writer instead of through the sync effect.
   */
  reportView: (view: CameraView, readerMove: boolean) => void
}

/**
 * The address bar as a copy of the panel (#409 cut it out of `App.tsx`): one
 * debounced writer for the component's lifetime, the effect that queues a
 * write when the shared state changes, and a flush on unmount. Returns the
 * writer, whose `flush` a link's run on open uses to strip its flag now
 * rather than a debounce later, and `reportView`, the map camera's way in.
 */
export function useUrlSync({
  polygon,
  destinationTypes,
  includeUnnamedPeaks,
  selection,
  forecastModel,
  comparedModels,
  sortBy,
  sortDesc,
  rowKeys,
  constraints,
  limit,
  customCsv,
  showWildfires,
  showRadar,
  showSmoke,
  showSnow,
  showGrid,
  showPlayer,
  gridStyle,
  gridReachFrac,
  places,
  defaultForecastModel,
  removedKeys,
  tableSort,
  restoredView,
}: UrlSyncInputs): UrlSync {
  // One debouncer for the whole component lifetime. It has to outlive the URL
  // sync effect below: a timer owned by that effect would be torn down on every
  // dependency change, which is every keystroke, so the burst it exists to
  // collapse would write anyway.
  const urlWriterRef = useRef<UrlWriter | null>(null)
  if (urlWriterRef.current === null) {
    urlWriterRef.current = debounceUrlWrite((url) => window.history.replaceState(null, '', url))
  }
  const writeUrl = urlWriterRef.current

  // The camera lives here rather than in state, so a pan renders nothing. The
  // sync effect below reads it on every write, and `reportView` writes with
  // the state the sync effect last encoded, held in `latestRef`: a camera
  // write from a closure would carry the state of the render that made it.
  const viewRef = useRef<CameraView | null>(restoredView)
  const cameraMovedRef = useRef(false)
  const latestRef = useRef<{ state: Omit<ShareableState, 'view'>; defaultModel: string } | null>(null)
  const sync = useCallback(() => {
    const latest = latestRef.current
    if (!latest) return
    const qs = encodeState({ ...latest.state, view: viewRef.current }, latest.defaultModel, {
      cameraMoved: cameraMovedRef.current,
    })
    // Nothing to write, and just as importantly, drop anything already queued.
    // An edit that lands back on the state the address bar already shows must
    // not be followed a moment later by a write of a state it merely passed
    // through on the way.
    if (!urlNeedsSync(qs, window.location.pathname, window.location.search)) {
      writeUrl.cancel()
      return
    }
    writeUrl(qs ? `?${qs}` : window.location.pathname)
  }, [writeUrl])

  const reportView = useCallback(
    (view: CameraView, readerMove: boolean) => {
      viewRef.current = view
      if (readerMove) cameraMovedRef.current = true
      sync()
    },
    [sync],
  )

  // Live-sync all analysis inputs into the address bar so the URL is always
  // copy-pasteable. replaceState (not pushState) keeps the back button clean;
  // the map commits polygon edits only at discrete events (point add, drag
  // end, insert, delete — never mid-drag), so this can't thrash replaceState
  // past Safari's rate limit.
  //
  // A trailing debounce (~400ms) collapses bursts of edits (e.g. per-keystroke
  // customCsv changes) into a single write. The no-op guard skips replaceState
  // entirely when the URL is already current. On cleanup (unmount or re-run),
  // any pending write is flushed so the last state reaches the URL before the
  // component exits.
  useEffect(() => {
    latestRef.current = {
      state: {
        polygon,
        destinationTypes,
        includeUnnamedPeaks,
        selection,
        forecastModel,
        compareModels: comparedModels,
        sortBy,
        sortDesc,
        rowKeys,
        constraints,
        limit,
        customCsv,
        showWildfires,
        showRadar,
        showSmoke,
        showSnow,
        showGrid,
        showPlayer,
        gridStyle,
        gridReachFrac,
        pins: places,
        removed: [...removedKeys],
        tableSort,
      },
      defaultModel: defaultForecastModel,
    }
    sync()
    // No cleanup here on purpose: flushing once per effect run would write on
    // every keystroke and collapse nothing, which is the trap debounceUrlWrite
    // documents. Unmount is handled by its own effect below.
  }, [
    polygon,
    destinationTypes,
    includeUnnamedPeaks,
    selection,
    forecastModel,
    comparedModels,
    sortBy,
    sortDesc,
    rowKeys,
    constraints,
    limit,
    customCsv,
    showWildfires,
    showRadar,
    showSmoke,
    showSnow,
    showGrid,
    showPlayer,
    gridStyle,
    gridReachFrac,
    places,
    defaultForecastModel,
    removedKeys,
    tableSort,
    sync,
  ])

  // Unmount is the one moment a queued write cannot wait out its delay, so it
  // is the one moment worth flushing. Empty deps keep it to unmount only: the
  // sync effect above must not flush, or the debounce collapses nothing.
  useEffect(() => () => writeUrl.flush(), [writeUrl])

  return useMemo(() => ({ writeUrl, reportView }), [writeUrl, reportView])
}
