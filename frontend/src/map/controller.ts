/**
 * The props the map's once-registered handlers read at event time.
 *
 * MapLibre handlers are registered once, when the map loads, so a closure over
 * a prop holds the first render's value for the whole session. The component
 * used to answer that with one mirror ref per prop and one effect per group of
 * refs to keep them current. This object is the one place that holds the latest
 * values instead: the component writes it in one effect, and every handler reads
 * it when the event fires rather than when the handler was made.
 *
 * Read `inputs` inside the handler every time. A value copied out of it when a
 * handler is registered is the stale closure this object exists to prevent.
 */
import type { DestinationResult, SortBy } from '../types'
import type { Place } from '../utils/geocode'
import type { CameraView } from '../utils/mapView'
import type { ColDef } from '../utils/tableColumns'

export interface MapInputs {
  drawing: boolean
  results: DestinationResult[]
  // The Windy links in a result popup need these three beside the row.
  modelId: string | null
  times: number[]
  modelFallbackLabel: string | null
  popupColumns: readonly ColDef[]
  // What the report ranks by, whose number a result popup marks.
  sortBy: SortBy
  // Whether the window is one hour, which a result popup's colours read as
  // the table's do.
  pointSample: boolean
  // When the report was analyzed, which a result card's forecast section
  // says in its fine print (#832); null with no report.
  analyzedAtMs: number | null
  searchedPlaces: Place[]
  onAddPoi: (place: Place) => void
  onRemovePoi: (latitude: number, longitude: number) => void
  // A result card's `Remove from analysis`: the row's × (#696).
  onRemoveResult: (row: DestinationResult) => void
  // A result card's aggregate head carried to another (TJ 2026-10-30).
  onMoveAggregate: (from: string, to: string) => void
  cameraPadBottomPx: number
  // Where the settled camera goes, and whether the reader moved it
  // (`map/camera.ts`). The share link's writer, which never renders.
  onCameraMove: (view: CameraView, readerMove: boolean) => void
  // The most positions a ring may carry, as /api/capabilities publishes it.
  maxPolygonPoints: number
  // The 3D button's press, asking for the terrain on or off (#799). The
  // switch is the overlays', so the button, the link and the map agree.
  onTerrainChange: (on: boolean) => void
  // Lowers a phone's results sheet and then does what it is handed, at once
  // where no sheet is up: a click that opens a card goes through it, so the
  // card is fitted to the map the lowered sheet leaves (TJ, 2026-11-04).
  lowerSheetFirst: (then: () => void) => void
  // Whether the map is a phone's, the results sheet's own test
  // (`useIsDesktop`): a card there opens with every section but the forecast
  // folded (TJ, 2026-11-04).
  phone: boolean
}

export interface MapController {
  /** The latest values. Read at event time, never copied at registration. */
  readonly inputs: Readonly<MapInputs>
  update(next: MapInputs): void
  /**
   * The displayed row at exactly these coordinates. Matched on the coordinates
   * a marker feature carries rather than on an index, so a source redrawn since
   * the last update cannot pair a popup with the wrong row.
   */
  resultAt(latitude: number, longitude: number): DestinationResult | null
}

export function createMapController(initial: MapInputs): MapController {
  let inputs: MapInputs = { ...initial }
  return {
    get inputs() {
      return inputs
    },
    update(next) {
      // Replaced whole rather than merged, so a field the caller forgot to pass
      // is a type error instead of a value left over from an older render.
      inputs = { ...next }
    },
    resultAt(latitude, longitude) {
      return inputs.results.find((r) => r.latitude === latitude && r.longitude === longitude) ?? null
    },
  }
}
