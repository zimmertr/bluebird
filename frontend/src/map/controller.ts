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
import type { DestinationResult } from '../types'
import type { FireWarning } from '../utils/fireProximity'
import type { Place } from '../utils/geocode'
import { geoKey } from '../utils/points'
import type { ColDef } from '../utils/tableColumns'

export interface MapInputs {
  drawing: boolean
  results: DestinationResult[]
  // The Windy links in a result popup need these three beside the row.
  modelId: string | null
  times: number[]
  modelFallbackLabel: string | null
  popupColumns: readonly ColDef[]
  fireWarnings: Map<string, FireWarning>
  searchedPlaces: Place[]
  onAddPoi: (place: Place) => void
  onRemovePoi: (latitude: number, longitude: number) => void
  cameraPadBottomPx: number
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
  /** The fire warning for a destination at these coordinates, if any. */
  fireWarningAt(latitude: number, longitude: number): FireWarning | null
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
    fireWarningAt(latitude, longitude) {
      return inputs.fireWarnings.get(geoKey(latitude, longitude)) ?? null
    },
  }
}
