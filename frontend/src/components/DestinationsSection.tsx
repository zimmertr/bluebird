import { useLayoutEffect, useRef, useState } from 'react'
import { CustomDestination, DiscoveryType, GeoPolygon } from '../types'
import {
  BUTTON_ACCENT,
  BUTTON_SECONDARY,
  CHIP,
  CHOICE_INPUT,
  CHOICE_ROW,
  DESTINATION_ADD,
  DESTINATION_FIELD,
  DISABLED,
  STATUS,
  TEXT,
} from '../styles'
import { takeOrphanedFocus } from '../hooks/useFocusHandoff'
import { useShiftRange } from '../hooks/useShiftRange'
import type { PresetLists } from '../hooks/usePresetLists'
import { shiftHeld } from '../utils/rangeSelect'
import { parseCustomCsv, unreadLines } from '../utils/customDestinations'
import { PRESET_LISTS, PRESET_REGIONS, presetListById } from '../utils/presetLists'
import { useStarredLists } from '../hooks/useStarredLists'
import { MAX_AREAS } from '../utils/drawGeometry'
import type { Place } from '../utils/geocode'
import { MenuBrowse, type BrowseGroup, type BrowseItem } from './Menu'
import CoordinateBox from './CoordinateBox'
import SearchBox from './SearchBox'
import { ringUsable } from '../utils/analyzeGate'
import DrawReadout from './DrawReadout'
import { grouped } from '../utils/numbers'
import { IconArea, IconClose, IconList, IconPin } from './icons'
import PanelSection, { type SectionFold } from './PanelSection'
import { destinationsSummary } from '../utils/controlsSummary'

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

// The lists menu's last row, which opens the box for the reader's own rows.
// Its value is a word no list's id can be: an id holds no colon.
const CUSTOM_COORDINATES = ':custom'
const CUSTOM_LABEL = 'Your own coordinates'

// The lists as the menu reads them (#848): each under its region, with its
// peak count and the description its info button opens, and the regions A to
// Z under each parent with the states a search also finds them by. Built
// once, since the manifest is the build's.
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
  ...(region.parent === null ? {} : { parent: region.parent }),
}))
const LIST_IDS: readonly string[] = PRESET_LISTS.map((list) => list.id)

// What the caption under the box adds while a line of it reads as no row
// (record 0265): the gutter flags those lines and is hidden from a screen
// reader, so the count in words is what tells one.
const unreadTail = (lines: number) => (lines === 0 ? '' : `, ${lines} line${lines === 1 ? '' : 's'} not read`)

// What the areas find. Every kind comes back from one discovery call an area,
// so asking for more kinds costs what one would.
const DESTINATION_TYPES: { value: DiscoveryType; label: string }[] = [
  { value: 'peak', label: 'Peaks' },
  { value: 'crag', label: 'Crags' },
  { value: 'lake', label: 'Lakes' },
  { value: 'trailhead', label: 'Trailheads' },
]
const TYPE_ORDER = DESTINATION_TYPES.map((t) => t.value)

export interface DestinationsSectionProps {
  /** Every finished area, in order (`useDestinationInputs`). */
  areas: readonly GeoPolygon[]
  /** Each area's size, in the same order, which its chip prints. */
  areaKm2s: readonly number[]
  // Is the map in draw mode? Drawing is entered and left explicitly (#118) so
  // that outside it a click on the map belongs to whatever is under it — a
  // basemap peak, a result marker, or the pan itself.
  drawing: boolean
  drawPointCount: number
  /** Search by area: a new area. */
  onStartArea: () => void
  /** An area's chip: that area, editable. */
  onEditArea: (index: number) => void
  /** An area's ×. */
  onRemoveArea: (index: number) => void
  onFinishDrawing: () => void
  /** Leaves draw mode, the areas as they were. */
  onCancelDrawing: () => void
  // The gate's reading of the area being drawn, handed down rather than
  // derived again here so the section and the gate cannot disagree.
  areaTooLarge: boolean
  /** How many areas a run would search (`AnalyzeGateInputs.areaCount`). */
  areaCount: number
  /** The size of the area being drawn, or null outside draw mode. */
  draftAreaKm2: number | null
  maxAreaKm2: number
  // Hovering the section glows the map's clickable peaks and lakes: the map
  // is a way in that has no control here, so the cue shows where it is.
  onPointAtMapPois: (on: boolean) => void
  // A set: the areas can look for several kinds at once, and none checked
  // means they discover nothing.
  destinationTypes: DiscoveryType[]
  setDestinationTypes: (t: DiscoveryType[]) => void
  // Summits OSM knows only by their height, discovered as `Peak 5961`. Off
  // by default, because it roughly triples the candidate count.
  includeUnnamedPeaks: boolean
  setIncludeUnnamedPeaks: (v: boolean) => void
  /** The ready-made lists added (`usePresetLists`). */
  presetLists: Pick<PresetLists, 'ids' | 'add' | 'remove'>
  /** The reader's own coordinates, as typed or pasted. */
  customCsv: string
  setCustomCsv: (s: string) => void
  // How many destinations the box parses to, from the panel's one parse.
  parsedCount: number
  // A paste landed in the box and parsed to at least one destination — App
  // frames the rows on the map. Paste only: typing never moves the camera.
  onCsvPasted: (points: CustomDestination[]) => void
  /** Every place searched by name or picked on the map. */
  places: readonly Place[]
  onRemovePlace: (latitude: number, longitude: number) => void
  /** A place's chip: the camera goes to it. */
  onFramePlace: (place: Place) => void
  /**
   * A place picked in the field's search. Given at a desk, where the search
   * stands in the field; a phone's search is the map's pill (record 0306).
   */
  onSearchSelect?: (place: Place) => void
  // A phone, where the lists menu opens the one menu's sheet (record 0252).
  phone?: boolean
  // A desk's card opens and collapses the section under its heading (record 0305).
  fold?: SectionFold
}

/** What the panel hands down whole; the rest it derives from its messages and limits. */
export type DestinationsInputs = Omit<
  DestinationsSectionProps,
  'areaTooLarge' | 'parsedCount' | 'maxAreaKm2' | 'phone' | 'fold'
>


/**
 * The panel's first section (record 0306): every way to name destinations as
 * chips in one field, and the ways to add more. The search by name is the
 * field's own line at a desk, a place pressed on the map adds its chip too,
 * and only a list and an area need a button: `Search by list` and `Search by
 * area`, each with a line saying what it does until anything is added. Every
 * chip has its ×; an area's chip opens it for editing and a place's goes to
 * it. The kinds the areas look for stand under them once there is an area.
 */
export default function DestinationsSection({
  areas,
  areaKm2s,
  drawing,
  drawPointCount,
  onStartArea,
  onEditArea,
  onRemoveArea,
  onFinishDrawing,
  onCancelDrawing,
  areaTooLarge,
  areaCount,
  draftAreaKm2,
  maxAreaKm2,
  onPointAtMapPois,
  destinationTypes,
  setDestinationTypes,
  includeUnnamedPeaks,
  setIncludeUnnamedPeaks,
  presetLists,
  customCsv,
  setCustomCsv,
  parsedCount,
  onCsvPasted,
  places,
  onRemovePlace,
  onFramePlace,
  onSearchSelect,
  phone = false,
  fold,
}: DestinationsSectionProps) {
  // Distinguishes a paste from typed input, so only a paste frames the map.
  const csvPasteRef = useRef(false)
  // The box stands only while the reader asked for it or it holds rows: most
  // readers add a ready-made list and never need it.
  const [customOpen, setCustomOpen] = useState(false)
  const csvBlank = customCsv.trim() === ''
  const boxShown = !csvBlank || customOpen
  const csvBoxRef = useRef<HTMLTextAreaElement>(null)
  const addRowRef = useRef<HTMLDivElement>(null)
  const { starred, toggleStar } = useStarredLists(LIST_IDS)
  const unread = csvBlank ? 0 : unreadLines(customCsv).filter(Boolean).length

  // Your own coordinates is the one pick that moves the keyboard: the reader
  // just asked to type. The box mounts in the commit the pick causes, so the
  // keyboard moves once it is drawn, after the menu's card or a phone's sheet
  // has given it back to its trigger.
  const focusBoxRef = useRef(false)
  const pickList = (value: string) => {
    if (value === CUSTOM_COORDINATES) {
      setCustomOpen(true)
      focusBoxRef.current = true
    } else presetLists.add(value)
  }
  useLayoutEffect(() => {
    if (!focusBoxRef.current || !csvBoxRef.current) return
    focusBoxRef.current = false
    csvBoxRef.current.focus()
  })

  const chipCount = areas.length + presetLists.ids.length + places.length + (boxShown ? 1 : 0)
  const nothingAdded = chipCount === 0
  // A chip's × removes the chip it stands in, which would park the keyboard
  // on the body; the first control left in the add row takes it (#576).
  useLayoutEffect(() => {
    for (const button of addRowRef.current?.querySelectorAll('button') ?? []) takeOrphanedFocus(button)
  }, [chipCount])

  const peaksOn = destinationTypes.includes('peak')
  // Shift reaches every kind between this box and the last one pressed, as in
  // every checkbox group in the app (record 0209, #801).
  const pressType = useShiftRange(true)
  // The kinds are live only over areas a search can use, and grey while one
  // is past the cap. Greyed keeps the ticks.
  const typesLive = ringUsable(areaCount, areaTooLarge)
  const kindsShown = areas.length > 0 || drawing

  const chip = (key: string, glyph: React.ReactNode, label: string, onPress: (() => void) | null, onRemove: () => void) => (
    <span key={key} className={CHIP.rest}>
      {onPress ? (
        <button type="button" onClick={onPress} className={CHIP.label}>
          {glyph}
          {label}
        </button>
      ) : (
        <span className={DESTINATION_FIELD.text}>
          {glyph}
          {label}
        </span>
      )}
      <button type="button" aria-label={`Remove ${label}`} onClick={onRemove} className={CHIP.remove}>
        <IconClose size="chip" />
      </button>
    </span>
  )
  const glyph = (Icon: typeof IconList) => <Icon size="chip" className={DESTINATION_FIELD.glyph} />

  const chips = [
    ...presetLists.ids.map((id) => {
      const list = presetListById(id)
      const label = list ? `${list.name} · ${list.peaks}` : id
      return chip(`list:${id}`, glyph(IconList), label, null, () => presetLists.remove(id))
    }),
    ...(boxShown
      ? [
          // The box stands under the field while this chip does, so the chip
          // has nothing to open; its × empties the box and shuts it.
          chip('custom', glyph(IconList), CUSTOM_LABEL, null, () => {
            setCustomCsv('')
            setCustomOpen(false)
          }),
        ]
      : []),
    ...areas.map((_, i) =>
      chip(
        `area:${i}`,
        glyph(IconArea),
        `Area ${i + 1} · ~${grouped(Math.round(areaKm2s[i] ?? 0))} km²`,
        drawing ? null : () => onEditArea(i),
        () => onRemoveArea(i),
      ),
    ),
    ...places.map((place) =>
      chip(`place:${place.lat},${place.lon}`, glyph(IconPin), place.label, () => onFramePlace(place), () =>
        onRemovePlace(place.lat, place.lon),
      ),
    ),
  ]
  const fieldShown = onSearchSelect !== undefined || chips.length > 0

  return (
    <PanelSection
      data-tour="destinations"
      heading="Destinations"
      fold={fold}
      summary={destinationsSummary({
        areas: areas.length,
        kinds: DESTINATION_TYPES.filter((t) => destinationTypes.includes(t.value)).map((t) => t.label),
        listNames: presetLists.ids.map((id) => presetListById(id)?.name ?? id),
        pointDestinations: parsedCount + places.length,
      })}
      onHover={onPointAtMapPois}
    >

      {fieldShown && (
        <div className={`${DESTINATION_FIELD.frame} mb-2`}>
          {chips.length > 0 && <div className={DESTINATION_FIELD.chips}>{chips}</div>}
          {onSearchSelect && <SearchBox inField onSelect={onSearchSelect} />}
        </div>
      )}

      {boxShown && (
        <div className="mb-2">
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
        </div>
      )}

      {drawing ? (
        <div>
          {/* The ring's count and, once it closes, its area, on one line
              where both fit (#687), and the area note under them. */}
          <div className={`${TEXT.caption} space-y-0.5 mb-2`}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
              <DrawReadout drawPointCount={drawPointCount} whole />
              {draftAreaKm2 !== null && (
                <p className={`${areaTooLarge ? STATUS.error : TEXT.caption} whitespace-nowrap`}>
                  ~{grouped(Math.round(draftAreaKm2))} km²
                  {areaTooLarge && ` (max ${grouped(maxAreaKm2)} km²)`}
                </p>
              )}
            </div>
            {draftAreaKm2 !== null && draftAreaKm2 > AREA_NOTE_KM2 && !areaTooLarge && (
              <p className={STATUS.warn}>Large polygon areas may be slow and hit limits.</p>
            )}
          </div>
          <div className={DESTINATION_ADD.row}>
            <button
              onClick={onFinishDrawing}
              disabled={drawPointCount < 3}
              className={`${BUTTON_ACCENT} ${DISABLED}`}
            >
              Done
            </button>
            {/* Mounts in Search by area's place, so it takes the keyboard
                that button's press left behind. */}
            <button ref={takeOrphanedFocus} onClick={onCancelDrawing} className={BUTTON_SECONDARY}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div ref={addRowRef} className={DESTINATION_ADD.row}>
          <MenuBrowse
            label="Search by list"
            placeholder="Search by list"
            value=""
            items={LIST_ITEMS}
            groups={LIST_GROUPS}
            other={{ value: CUSTOM_COORDINATES, label: CUSTOM_LABEL }}
            onChange={pickList}
            starred={starred}
            onToggleStar={toggleStar}
            widthRef={addRowRef}
            sheet={phone}
            className=""
            face={
              <>
                <span className={DESTINATION_ADD.title}>
                  <IconList />
                  Search by list
                </span>
                {nothingAdded && <span className={DESTINATION_ADD.line}>Choose a peak list or provide coordinates</span>}
              </>
            }
          />
          <button
            type="button"
            onClick={onStartArea}
            disabled={areas.length >= MAX_AREAS}
            className={DESTINATION_ADD.tile}
          >
            <span className={DESTINATION_ADD.title}>
              <IconArea />
              Search by area
            </span>
            {nothingAdded && <span className={DESTINATION_ADD.line}>Draw a shape and search within it</span>}
          </button>
        </div>
      )}

      {kindsShown && (
        <div className="mt-3">
          <p className={`${TEXT.subheading} mb-1.5`}>Find in areas</p>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {DESTINATION_TYPES.map(({ value, label }) => (
              <label key={value} className={CHOICE_ROW}>
                <input
                  type="checkbox"
                  name="destination_types"
                  value={value}
                  checked={destinationTypes.includes(value)}
                  disabled={!typesLive}
                  onChange={(e) => {
                    const reached = new Set(pressType(TYPE_ORDER, value, shiftHeld(e)))
                    setDestinationTypes(
                      e.target.checked
                        ? [...destinationTypes, ...TYPE_ORDER.filter((t) => reached.has(t) && !destinationTypes.includes(t))]
                        : destinationTypes.filter((t) => !reached.has(t)),
                    )
                  }}
                  className={CHOICE_INPUT}
                />
                <span>{label}</span>
              </label>
            ))}
            {/* Shown only while Peaks is ticked, because then there is a peak
                search for it to widen (#687). Unticking Peaks hides it and
                keeps its value. */}
            {peaksOn && (
              <label className={CHOICE_ROW}>
                <input
                  type="checkbox"
                  checked={includeUnnamedPeaks}
                  disabled={!typesLive}
                  onChange={(e) => setIncludeUnnamedPeaks(e.target.checked)}
                  className={CHOICE_INPUT}
                />
                <span>Unnamed peaks</span>
              </label>
            )}
          </div>
        </div>
      )}
    </PanelSection>
  )
}
