import { useId, useLayoutEffect, useRef, useState } from 'react'
import { CustomDestination, DiscoveryType } from '../types'
import {
  CHOICE_INPUT,
  CHOICE_ROW,
  DISABLED,
  DRAW_ROW,
  STATUS,
  TEXT,
} from '../styles'
import { takeOrphanedFocus } from '../hooks/useFocusHandoff'
import { useShiftRange } from '../hooks/useShiftRange'
import { shiftHeld } from '../utils/rangeSelect'
import { parseCustomCsv, unreadLines } from '../utils/customDestinations'
import { PRESET_LISTS, PRESET_REGIONS, presetListIn, fetchPresetList } from '../utils/presetLists'
import { useStarredLists } from '../hooks/useStarredLists'
import { MenuBrowse, type BrowseGroup, type BrowseItem } from './Menu'
import CoordinateBox from './CoordinateBox'
import { drawControls } from '../utils/drawControls'
import { ringUsable } from '../utils/analyzeGate'
import DrawReadout from './DrawReadout'
import { grouped } from '../utils/numbers'

// Above this drawn area, an informational note warns that dense regions can
// exceed the destination limit and searches slow down. Advisory only: the hard
// gate is the deployment's published polygon cap, which arrives as maxAreaKm2.
// Sized to where Cascades-density terrain starts brushing the analysis cap
// (~26,000 km² held 1,117 peaks).
const AREA_NOTE_KM2 = 40_000

// The coordinates box's placeholder: the format, then one row that follows
// it, two lines for a box two rows tall so a reader sees that several rows go
// in (the maintainer, 2026-10-13). It stands in the box the Custom coordinates
// pick opens, where the reader is about to type. The format is written as a
// "#" comment because parseCustomCsv skips those, so it stays valid input if a
// paste ever lands beneath it.
const COORDINATES_PLACEHOLDER = '# Lat,Lon or Lat,Lon,Name\n46.8529,-121.7604,Mount Rainier'

// The Coordinate list field's last row, which opens the box for the reader's
// own rows. Its value is a word no list's id can be: an id holds no colon.
const CUSTOM_COORDINATES = ':custom'

// The lists as the Coordinate list menu reads them (#848): each under its
// region, with its peak count and the description its info button opens, and
// the regions in the manifest's order with the states a search also finds
// them by. Built once, since the manifest is the build's.
const LIST_ITEMS: readonly BrowseItem[] = PRESET_LISTS.map((list) => ({
  id: list.id,
  name: list.name,
  description: list.description,
  group: list.region,
  count: list.peaks,
}))
const LIST_GROUPS: readonly BrowseGroup[] = PRESET_REGIONS.map((region) => ({
  name: region.name,
  words: region.places,
}))
const LIST_IDS: readonly string[] = PRESET_LISTS.map((list) => list.id)

// What the caption under the box adds while a line of it reads as no row
// (record 0265): the gutter flags those lines and is hidden from a screen
// reader, so the count in words is what tells one.
const unreadTail = (lines: number) => (lines === 0 ? '' : `, ${lines} line${lines === 1 ? '' : 's'} not read`)

// The Polygon row's first button, by what pressing it would do.
const MODE_LABEL = { draw: 'Draw polygon', edit: 'Edit polygon', done: 'Done' } as const

// What polygon discovery finds. Custom (CSV) is no longer a mode here — the
// always-visible Custom Destinations section below adds to any of these.
const DESTINATION_TYPES: { value: DiscoveryType; label: string; implemented: boolean }[] = [
  { value: 'peak', label: 'Peaks', implemented: true },
  { value: 'crag', label: 'Crags', implemented: true },
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
  // Whether the preset list last picked arrived (#838): false on a pick that
  // lands, true on one that does not, which the Analyze button's list says.
  onPresetListFailed: (failed: boolean) => void
  // A phone, where the Coordinate list field opens the one menu's sheet (record 0252).
  phone?: boolean
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
  onPresetListFailed,
  phone = false,
}: Props) {
  // True between a paste into the CSV box and the change event it produces —
  // how onChange tells a pasted list (frame it on the map) from typing (leave
  // the camera alone). A keydown always precedes the input event it causes
  // (cmd+V's keydown fires before its paste event), so the flag is freshly
  // true exactly when a change came from a paste — including a paste that
  // replaces existing text — and stale flags can't survive into typing.
  const csvPasteRef = useRef(false)
  // The box stands only once something is in it or the reader asked for it
  // (#838, record 0263): most readers pick a preset and never need the box,
  // its format line or its mono type, so at rest the Coordinate list field is the
  // whole of Coordinate search (the maintainer, 2026-11-03). `customOpen` is
  // the asking: the Custom coordinates pick, or an edit, so the box does not
  // vanish under a reader who deletes every row by hand. A preset pick and
  // Clear put it back.
  const [customOpen, setCustomOpen] = useState(false)
  const csvBoxRef = useRef<HTMLTextAreaElement>(null)
  const csvRowRef = useRef<HTMLDivElement>(null)
  const csvHeadingId = useId()
  const csvClearId = useId()
  const csvBlank = customCsv.trim() === ''
  const boxShown = !csvBlank || customOpen
  // The field reads the list's name while the box is exactly that list, its
  // own name while the box is shut, and Custom coordinates over anything else:
  // rows typed, pasted or restored from a share link, or an open blank box.
  const heldList = presetListIn(customCsv)
  const fieldValue = heldList ? heldList.id : boxShown ? CUSTOM_COORDINATES : ''
  const { starred, toggleStar } = useStarredLists(LIST_IDS)
  const unread = csvBlank ? 0 : unreadLines(customCsv).filter(Boolean).length
  // A list picked from the field replaces whatever the box holds, typed rows
  // included, with nothing asked: the pick is the press that means it (the
  // maintainer, 2026-11-03). The list frames the map as a paste does, since
  // it arrives whole rather than typed. The keyboard stays where it was: a
  // box that took it scrolled to its end and hid a line of the two it shows,
  // so a click into the box is what places the cursor (the maintainer,
  // 2026-11-03).
  const loadList = async (id: string) => {
    const list = PRESET_LISTS.find((l) => l.id === id)
    if (!list) return
    const text = await fetchPresetList(list)
    onPresetListFailed(text === null)
    if (text === null) return
    setCustomOpen(false)
    setCustomCsv(text)
    const points = parseCustomCsv(text)
    if (points.length > 0) onCsvPasted(points)
  }
  // Custom coordinates is the one pick that moves the keyboard: the reader
  // just asked to type. A preset in the box goes, since the reader asked for
  // rows of their own; their own rows stay. The box mounts in the commit the
  // pick causes, so the keyboard moves once it is drawn, after the menu's
  // card or a phone's sheet has given it back to the field.
  const focusBoxRef = useRef(false)
  const openCustom = () => {
    if (heldList) setCustomCsv('')
    setCustomOpen(true)
    focusBoxRef.current = true
  }
  useLayoutEffect(() => {
    if (!focusBoxRef.current || !csvBoxRef.current) return
    focusBoxRef.current = false
    csvBoxRef.current.focus()
  })
  // Clear shuts the box and greys itself in one press, so a keyboard on it
  // would land on the body: the row's first live control, the field, takes
  // it, as the Polygon row's first live button takes its row's (#576). Only
  // when the focus was orphaned, so a press that focused nothing, as
  // Safari's does, moves nothing. Keyed on the box going rather than run on
  // the first draw, which orphans nothing of this row's.
  const boxWasShownRef = useRef(boxShown)
  useLayoutEffect(() => {
    if (boxWasShownRef.current && !boxShown) {
      for (const button of csvRowRef.current?.querySelectorAll('button') ?? []) takeOrphanedFocus(button)
    }
    boxWasShownRef.current = boxShown
  }, [boxShown])
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
  // Shift reaches every type between this box and the last one pressed, as in
  // every checkbox group in the app (record 0209, #801). The row never closes,
  // so the anchor stands until the next press.
  const pressType = useShiftRange(true)
  const typeOrder = DESTINATION_TYPES.filter((t) => t.implemented).map((t) => t.value)
  // The types and the unnamed-peaks knob are live only over a ring a search
  // can use, and grey again when it is cleared or grows past the cap. Greyed
  // keeps the ticks, so the next ring searches what the reader chose, and a
  // tick with no ring was never sent anyway (`planAnalysis` sends no types
  // without one). Greyed rather than hidden, as the draw row's buttons are
  // (#687), so a ring arriving does not move the panel under the reader.
  const typesLive = ringUsable(drawPointCount, areaTooLarge)

  return (
    <section data-tour="destinations">
      <h2 className={`${TEXT.section} mb-2.5`}>
        Destinations
      </h2>

      {/* Map search: the two methods whose control is the map itself, the
          floating search box and the clickable labels, grouped as one
          subsection rather than two widgetless ones. Each of the three
          subheadings says its row searches, because `Polygon` over a Draw
          polygon button never said that drawing one searches the area for
          destinations (the maintainer, 2026-10-15, #710). The sentence names
          the map again under `Map search`, which the maintainer accepted so
          it says where a destination is selected, and says `a` rather than
          `any` so it stays one line where the panel's scroll bars are always
          drawn: about 316px of room there, 305.6px for this sentence and
          318.9px with `any` (12px italic, 2026-10-15). It names no kind of
          destination: the map labels and lets you select peaks, lakes,
          places, trailheads and crags, and prose that lists the types is a
          string every new type would have to reopen. Hovering the group rings the search box
          AND glows the selectable features, so the reader is shown where
          both live instead of told. Hover-only is fine here because it adds
          a cue to copy that already stands on its own. */}
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
        <h3 className={`${TEXT.subheading} mb-1`}>Map search</h3>
        <p className={TEXT.helper}>Search by name, or select a destination from the map.</p>
      </div>

      {/* Coordinate search: second, under Map search, so the Polygon
          block's buttons and boxes come last (#687, record 0137). A list you
          bring to the map rather than a gesture on it. The row under the
          subheading is the Polygon row's grid (#838, record 0263): the one
          menu across two cells and Clear in the third, on the edge the
          Polygon row's Clear stands on. The menu holds every preset list and,
          set apart under a rule, Custom coordinates, which opens the box for
          the reader's own rows. The box folds into the menu (mockup M1, the
          maintainer, 2026-11-03): most readers pick a preset and never need
          the box, its format line or its mono type, so it stands only once
          something is in it or Custom coordinates was picked. M2 opened it
          for custom rows alone and hid a preset's, which lost trimming a
          list to the peaks a reader wants. Two rows tall when it stands, with
          the format and one row that follows it as the placeholder; no
          helper line, since the format states itself. Two cells because a
          third leaves 72px of label beside the chevron, and every list's
          name is wider than that. A menu rather than the lists written out,
          because the lists will outgrow a note (the maintainer, 2026-11-03).
          Clear is named with the subheading, since the Polygon row's Clear
          is a second button reading the same word. */}
      <div className="mb-3">
        <h3 id={csvHeadingId} className={`${TEXT.subheading} mb-1.5`}>
          Coordinate search
        </h3>
        <div ref={csvRowRef} className={`${DRAW_ROW.row}${boxShown ? ' mb-1.5' : ''}`}>
          <MenuBrowse
            label="Coordinate list"
            placeholder="Coordinate list"
            value={fieldValue}
            items={LIST_ITEMS}
            groups={LIST_GROUPS}
            other={{ value: CUSTOM_COORDINATES, label: 'Custom coordinates' }}
            onChange={(value) => (value === CUSTOM_COORDINATES ? openCustom() : void loadList(value))}
            starred={starred}
            onToggleStar={toggleStar}
            widthRef={csvRowRef}
            sheet={phone}
            className={DRAW_ROW.field}
          />
          {/* Empties the box and shuts it, so the field reads its own name
              again; greyed while the box is shut. */}
          <button
            id={csvClearId}
            aria-labelledby={`${csvClearId} ${csvHeadingId}`}
            onClick={() => {
              setCustomCsv('')
              setCustomOpen(false)
            }}
            disabled={!boxShown}
            className={`${DRAW_ROW.secondary} ${DISABLED}`}
          >
            Clear
          </button>
        </div>
        {boxShown && (
          <>
            <CoordinateBox
              ref={csvBoxRef}
              aria-label="Custom destination coordinates, one per line as latitude, longitude, optional name"
              value={customCsv}
              onKeyDown={() => (csvPasteRef.current = false)}
              onPaste={() => (csvPasteRef.current = true)}
              onChange={(e) => {
                const wasPaste = csvPasteRef.current
                csvPasteRef.current = false
                setCustomOpen(true)
                setCustomCsv(e.target.value)
                if (wasPaste) {
                  const points = parseCustomCsv(e.target.value)
                  if (points.length > 0) onCsvPasted(points)
                }
              }}
              placeholder={COORDINATES_PLACEHOLDER}
              rows={2}
            />
            {!csvBlank && (
              <p className={`${TEXT.helper} mt-1`}>
                {parsedCount} destination{parsedCount !== 1 ? 's' : ''} parsed{unreadTail(unread)}
              </p>
            )}
          </>
        )}
      </div>

      {/* Polygon search: drawing a ring searches the area inside it for
          destinations, which a Draw polygon button alone does not say, so
          the subheading does (#710). Last since #687, so the two full-width
          inputs above it stand together. */}
      <div>
        <h3 className={`${TEXT.subheading} mb-1.5`}>Polygon search</h3>
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
                Press Done or Analyze.` is 229.5px at the readout's medium
                weight, which leaves 57.5px, and `~999 km²` is 54.9px where
                `~2,109 km²` is 63px (12px on a Mac, 2026-10-16). */}
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
              {/* The count in the words the phone's draw bar uses too
                  (`DrawReadout`), kept whole on its line like the area. */}
              <DrawReadout drawing={drawing} drawPointCount={drawPointCount} pointsNeeded={pointsNeeded} whole />
              {polygonAreaKm2 !== null && (
                <p className={`${areaTooLarge ? STATUS.error : TEXT.caption} whitespace-nowrap`}>
                  ~{grouped(Math.round(polygonAreaKm2))} km²
                  {areaTooLarge && ` (max ${grouped(maxAreaKm2)} km²)`}
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
            at once. Every kind comes back from one discovery call, read from
            the pod's own copy of OpenStreetMap (#760) or a single Overpass
            query without it, so asking for more kinds costs what one would.
            The "Find:" label that used to lead this row is gone —
            the checkboxes under the Polygon search heading are not ambiguous
            about what they do. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2">
          {DESTINATION_TYPES.map(({ value, label, implemented }) => (
            <label key={value} className={CHOICE_ROW}>
              <input
                type="checkbox"
                name="destination_types"
                value={value}
                checked={destinationTypes.includes(value)}
                disabled={!implemented || !typesLive}
                onChange={(e) => {
                  const reached = new Set(pressType(typeOrder, value, shiftHeld(e)))
                  setDestinationTypes(
                    e.target.checked
                      ? [...destinationTypes, ...typeOrder.filter((t) => reached.has(t) && !destinationTypes.includes(t))]
                      : destinationTypes.filter((t) => !reached.has(t)),
                  )
                }}
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
              disabled={!typesLive}
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
