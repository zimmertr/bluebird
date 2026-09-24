import { useEffect, useRef } from 'react'
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
}

/**
 * The address bar as a copy of the panel (#409 cut it out of `App.tsx`): one
 * debounced writer for the component's lifetime, the effect that queues a
 * write when the shared state changes, and a flush on unmount. Returns the
 * writer, whose `flush` a link's run on open uses to strip its flag now
 * rather than a debounce later.
 *
 * The effect's dependency list and its suppression moved as they were. The
 * list leaves out `forecastModel` and `defaultForecastModel`, which is issue
 * #292's bug to fix, not this split's.
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
}: UrlSyncInputs): UrlWriter {
  // One debouncer for the whole component lifetime. It has to outlive the URL
  // sync effect below: a timer owned by that effect would be torn down on every
  // dependency change, which is every keystroke, so the burst it exists to
  // collapse would write anyway.
  const urlWriterRef = useRef<UrlWriter | null>(null)
  if (urlWriterRef.current === null) {
    urlWriterRef.current = debounceUrlWrite((url) => window.history.replaceState(null, '', url))
  }
  const writeUrl = urlWriterRef.current

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
    const qs = encodeState({
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
    }, defaultForecastModel)

    // Nothing to write, and just as importantly, drop anything already queued.
    // An edit that lands back on the state the address bar already shows must
    // not be followed a moment later by a write of a state it merely passed
    // through on the way.
    if (!urlNeedsSync(qs, window.location.pathname, window.location.search)) {
      writeUrl.cancel()
      return
    }

    writeUrl(qs ? `?${qs}` : window.location.pathname)
    // No cleanup here on purpose: flushing once per effect run would write on
    // every keystroke and collapse nothing, which is the trap debounceUrlWrite
    // documents. Unmount is handled by its own effect below.
    // Suppressed rather than fixed: the rule is right that `forecastModel` and
    // `defaultForecastModel` are missing, and the bug that causes is
    // issue #292's to fix, not this file's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    polygon,
    destinationTypes,
    includeUnnamedPeaks,
    selection,
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
    writeUrl,
  ])

  // Unmount is the one moment a queued write cannot wait out its delay, so it
  // is the one moment worth flushing. Empty deps keep it to unmount only: the
  // sync effect above must not flush, or the debounce collapses nothing.
  useEffect(() => () => writeUrl.flush(), [writeUrl])

  return writeUrl
}
