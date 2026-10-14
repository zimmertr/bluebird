import { useLayoutEffect, useRef } from 'react'
import { CustomDestination, DiscoveryType } from '../types'
import {
  CHOICE_INPUT,
  CHOICE_ROW,
  DISABLED,
  DRAW_ROW,
  FIELD,
  STATUS,
  TEXT,
} from '../styles'
import { takeOrphanedFocus } from '../hooks/useFocusHandoff'
import { parseCustomCsv } from '../utils/customDestinations'
import { drawControls } from '../utils/drawControls'

// Above this drawn area, an informational note warns that dense regions can
// exceed the destination limit and searches slow down. Advisory only: the hard
// gate is the deployment's published polygon cap, which arrives as maxAreaKm2.
// Sized to where Cascades-density terrain starts brushing the analysis cap
// (~26,000 km² held 1,117 peaks).
const AREA_NOTE_KM2 = 40_000

// The coordinates box's placeholder: the format, then one row that follows
// it, two lines for a box two rows tall so a reader sees that several rows go
// in (the maintainer, 2026-10-13). The format is written as a "#" comment
// because parseCustomCsv skips those, so it stays valid input if a paste ever
// lands beneath it.
const COORDINATES_PLACEHOLDER = '# Lat,Lon or Lat,Lon,Name\n46.8529,-121.7604,Mount Rainier'

// The Polygon row's first button, by what pressing it would do.
const MODE_LABEL = { draw: 'Draw polygon', edit: 'Edit polygon', done: 'Done' } as const

// What polygon discovery finds. Custom (CSV) is no longer a mode here — the
// always-visible Custom Destinations section below adds to any of these.
const DESTINATION_TYPES: { value: DiscoveryType; label: string; implemented: boolean }[] = [
  { value: 'peak', label: 'Peaks', implemented: true },
  { value: 'lake', label: 'Lakes', implemented: true },
  { value: 'trailhead', label: 'Trailheads', implemented: true },
]

interface Props {
  // Is the map in draw mode? Drawing is entered and left explicitly (#118) so
  // that outside it a click on the map belongs to whatever is under it — a
  // basemap peak, a result marker, or the pan itself.
  drawing: boolean
  onStartDrawing: () => void
  onFinishDrawing: () => void
  // Leaves draw mode and puts back the ring the mode started with.
  onCancelDrawing: () => void
  // Empties the ring and leaves the mode as it is.
  onClearDrawing: () => void
  drawPointCount: number
  // The two readings the Analyze gate also takes, handed down rather than
  // derived again here so the counter and the gate cannot disagree.
  pointsNeeded: number
  areaTooLarge: boolean
  polygonAreaKm2: number | null
  maxAreaKm2: number
  // Hovering the Map group rings the map's search box and glows its
  // clickable peaks and lakes together: the two methods whose control is
  // the map itself share one subsection, so its cue lights everything the
  // map offers at once.
  onPointAtSearch: (on: boolean) => void
  onPointAtMapPois: (on: boolean) => void
  // A set: one polygon can look for several kinds at once, and none checked
  // means the polygon discovers nothing.
  destinationTypes: DiscoveryType[]
  setDestinationTypes: (t: DiscoveryType[]) => void
  // Summits OSM knows only by their height, discovered as `Peak 5961`.
  // A polygon knob rather than a map one, and off by default, because it
  // roughly triples the candidate count.
  includeUnnamedPeaks: boolean
  setIncludeUnnamedPeaks: (v: boolean) => void
  customCsv: string
  setCustomCsv: (s: string) => void
  // How many destinations the CSV box parses to. The panel parses once for
  // the gate, and the count under the box reads that one parse.
  parsedCount: number
  // A paste landed in the CSV box and parsed to at least one destination —
  // App frames the list on the map. Paste only: typing never moves the camera.
  onCsvPasted: (points: CustomDestination[]) => void
}

/**
 * The panel's first section: the three ways to name destinations (the map,
 * a drawn polygon, pasted coordinates), which union into one ranked report.
 */
export default function DestinationsSection({
  drawing,
  onStartDrawing,
  onFinishDrawing,
  onCancelDrawing,
  onClearDrawing,
  drawPointCount,
  pointsNeeded,
  areaTooLarge,
  polygonAreaKm2,
  maxAreaKm2,
  onPointAtSearch,
  onPointAtMapPois,
  destinationTypes,
  setDestinationTypes,
  includeUnnamedPeaks,
  setIncludeUnnamedPeaks,
  customCsv,
  setCustomCsv,
  parsedCount,
  onCsvPasted,
}: Props) {
  // True between a paste into the CSV box and the change event it produces —
  // how onChange tells a pasted list (frame it on the map) from typing (leave
  // the camera alone). A keydown always precedes the input event it causes
  // (cmd+V's keydown fires before its paste event), so the flag is freshly
  // true exactly when a change came from a paste — including a paste that
  // replaces existing text — and stale flags can't survive into typing.
  const csvPasteRef = useRef(false)
  // The row's three buttons never unmount; a press that greys the one it
  // landed on (Draw polygon turning into a Done that waits for three points,
  // Cancel leaving the mode, Clear emptying the ring) would park the keyboard
  // on the body, so the first button in the row that can still act takes it:
  // Cancel while drawing under three points, the mode button otherwise. A
  // press that leaves its button live keeps the keyboard there (#576).
  const drawRowRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    for (const button of drawRowRef.current?.querySelectorAll('button') ?? []) takeOrphanedFocus(button)
  }, [drawing, drawPointCount])
  const row = drawControls(drawing, drawPointCount)
  const peaksOn = destinationTypes.includes('peak')

  return (
    <section data-tour="destinations">
      <h2 className={`${TEXT.section} mb-2.5`}>
        Destinations
      </h2>

      {/* Map — the two methods whose control is the map itself, the
          floating search box and the clickable peaks and lakes, grouped
          as one subsection rather than two widgetless ones. The heading
          keeps the caption from reading as a description of the whole
          section, and makes the three groups parallel: each names the
          instrument, so the shape says "another way to add destinations"
          without a "Search by" prefix saying it four times. Hovering the
          group rings the search box AND glows the selectable features,
          so the reader is shown where both live instead of told.
          Hover-only is fine here because it adds a cue to copy that
          already stands on its own. The caption names peaks and lakes
          rather than "a destination" because those are the two things
          the basemap makes clickable - trailheads are not on it, which
          is why they are found by polygon instead. */}
      <div
        className="mb-3"
        onMouseEnter={() => {
          onPointAtSearch(true)
          onPointAtMapPois(true)
        }}
        onMouseLeave={() => {
          onPointAtSearch(false)
          onPointAtMapPois(false)
        }}
      >
        <h3 className={`${TEXT.subheading} mb-1`}>Map</h3>
        <p className={TEXT.helper}>Search by name, or click any peak or lake.</p>
      </div>

      {/* Coordinates: second, under Map, so the Polygon block's buttons
          and boxes come last (#687, record 0137). A list you bring to the
          map rather than a gesture on it. Two rows tall at rest, so a
          reader sees that several rows go in, with the format and one row
          that follows it as the placeholder. No helper line; the format
          states itself. */}
      <div className="mb-3">
        <h3 className={`${TEXT.subheading} mb-1.5`}>Coordinates</h3>
        <textarea
          aria-label="Custom destination coordinates, one per line as latitude, longitude, optional name"
          value={customCsv}
          onKeyDown={() => (csvPasteRef.current = false)}
          onPaste={() => (csvPasteRef.current = true)}
          onChange={(e) => {
            const wasPaste = csvPasteRef.current
            csvPasteRef.current = false
            setCustomCsv(e.target.value)
            if (wasPaste) {
              const points = parseCustomCsv(e.target.value)
              if (points.length > 0) onCsvPasted(points)
            }
          }}
          placeholder={COORDINATES_PLACEHOLDER}
          rows={2}
          className={`${FIELD} w-full p-2 font-mono resize-y`}
        />
        {customCsv.trim() !== '' && (
          <p className={`${TEXT.helper} mt-1`}>
            {parsedCount} destination{parsedCount !== 1 ? 's' : ''} parsed
          </p>
        )}
      </div>

      {/* Polygon, a bare noun, not "Search by polygon": beside Map and
          Coordinates, a Draw polygon button says the rest, and the verb
          phrase restated its own helper line. Last since #687, so the two
          full-width inputs above it stand together. */}
      <div>
        <h3 className={`${TEXT.subheading} mb-1.5`}>Polygon</h3>
        {drawPointCount > 0 && (
          <div className={`${TEXT.caption} space-y-0.5 mb-2`}>
            {/* The counter and the area share a line, the counter at the left
                and the area right-justified on its baseline (#687). Each
                stays whole: when the two do not fit side by side the area
                moves to a line of its own, at the left under the counter,
                because `justify-between` puts a line's only item at its start
                (the maintainer, 2026-10-13). At 360px the
                line is 295px and the pair needs the 8px gap between them, so
                outside the mode every ring under the cap fits (`99 points
                placed` and `~99,999 km²` are 175.7px), and while drawing a
                closed ring only one under 1,000 km² does: `3 points placed.
                Press Done when ready.` is 229.8px, which leaves 57.2px, and
                `~779 km²` is 53.4px where `~2,109 km²` is 63px (12px on a Mac). */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
              {/* Only while drawing does the status name a gesture: outside
                  the mode the handles are gone and none of them apply. */}
              {drawing && pointsNeeded > 0 ? (
                <p className={`${STATUS.info} whitespace-nowrap`}>
                  {drawPointCount} point{drawPointCount !== 1 ? 's' : ''} placed,{' '}
                  {pointsNeeded} more needed.
                </p>
              ) : drawing ? (
                <p className={`${STATUS.ok} font-medium whitespace-nowrap`}>
                  {drawPointCount} points placed. Press Done when ready.
                </p>
              ) : (
                <p className={`${pointsNeeded > 0 ? STATUS.info : `${STATUS.ok} font-medium`} whitespace-nowrap`}>
                  {drawPointCount} point{drawPointCount !== 1 ? 's' : ''} placed
                  {pointsNeeded > 0 && `, ${pointsNeeded} more needed`}
                </p>
              )}
              {polygonAreaKm2 !== null && (
                <p className={`${areaTooLarge ? STATUS.error : TEXT.caption} whitespace-nowrap`}>
                  ~{Math.round(polygonAreaKm2).toLocaleString()} km²
                  {areaTooLarge && ` (max ${maxAreaKm2.toLocaleString()} km²)`}
                </p>
              )}
            </div>
            {polygonAreaKm2 !== null &&
              polygonAreaKm2 > AREA_NOTE_KM2 &&
              !areaTooLarge && (
                <p className={STATUS.warn}>
                  Large polygon areas may be slow and hit limits.
                </p>
              )}
          </div>
        )}
        {/* The controls that switch the map between placing points and
            everything else. Drawing has to be left before a click on the map
            can mean anything but "another vertex", so this row is the whole
            of #118 in the panel: Draw/Edit to enter, Done to keep the ring,
            Cancel to put back the one the mode started with, Clear to empty
            it. The row is always the same three, a third of the width each,
            so it stands on the coordinates box's edges, and a
            button that does nothing yet is greyed rather than missing: one
            that popped in on the first click would move the row under the
            reader's eye (#687). Which is live, and what the first one says,
            is `drawControls`. On a phone Draw polygon closes the drawer, and
            the map's Controls button takes the keyboard. */}
        <div ref={drawRowRef} className={DRAW_ROW.row}>
          <button
            onClick={row.mode === 'done' ? onFinishDrawing : onStartDrawing}
            disabled={!row.modeEnabled}
            className={`${row.mode === 'done' ? DRAW_ROW.accent : DRAW_ROW.secondary} ${DISABLED}`}
          >
            {MODE_LABEL[row.mode]}
          </button>
          <button
            onClick={onCancelDrawing}
            disabled={!row.cancelEnabled}
            className={`${DRAW_ROW.secondary} ${DISABLED}`}
          >
            Cancel
          </button>
          <button
            onClick={onClearDrawing}
            disabled={!row.clearEnabled}
            className={`${DRAW_ROW.secondary} ${DISABLED}`}
          >
            Clear
          </button>
        </div>
        {/* Checkboxes, not radios: one polygon can look for several kinds
            at once, and they all come back from a single Overpass query,
            so asking for peaks and lakes together costs what peaks alone
            would. The "Find:" label that used to lead this row is gone —
            three checkboxes under the Polygon heading are not ambiguous
            about what they do. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2">
          {DESTINATION_TYPES.map(({ value, label, implemented }) => (
            <label key={value} className={CHOICE_ROW}>
              <input
                type="checkbox"
                name="destination_types"
                value={value}
                checked={destinationTypes.includes(value)}
                disabled={!implemented}
                onChange={(e) =>
                  setDestinationTypes(
                    e.target.checked
                      ? [...destinationTypes, value]
                      : destinationTypes.filter((t) => t !== value),
                  )
                }
                className={CHOICE_INPUT}
              />
              <span>{label}</span>
              {!implemented && <span className={TEXT.helper}>soon</span>}
            </label>
          ))}
        </div>
        {/* Unnamed peaks, under the type it modifies rather than in a
            general options drawer three sections away. It is a polygon
            DISCOVERY knob and does nothing else: it widens what the
            Overpass query counts as a peak. Shown only while Peaks is
            ticked, because then there is a peak search for it to widen (#687),
            at the section's left edge like every other row. Unticking
            Peaks hides it and keeps its value, so ticking Peaks again
            brings back what the reader had chosen. */}
        {peaksOn && (
          <label className={`${CHOICE_ROW} mt-1.5`}>
            <input
              type="checkbox"
              checked={includeUnnamedPeaks}
              onChange={(e) => setIncludeUnnamedPeaks(e.target.checked)}
              className={CHOICE_INPUT}
            />
            <span>Include unnamed peaks</span>
          </label>
        )}
      </div>
    </section>
  )
}
