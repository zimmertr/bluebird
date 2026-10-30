import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type RefObject } from 'react'
import type { GridLayer } from '../hooks/useGridLayer'
import type { MapOverlays } from '../hooks/useMapOverlays'
import { useShiftRange } from '../hooks/useShiftRange'
import { shiftHeld } from '../utils/rangeSelect'
import BottomSheet from './BottomSheet'
import { MenuButton } from './Menu'
import {
  ACCENT,
  CHIP_CARD_W,
  CHOICE_INPUT,
  CHOICE_ROW,
  LAYER_GRID,
  LAYER_ROW,
  MAP_CHIP_MENU,
  MENU,
  MENU_GROUP,
  SHEET_ASIDE,
  SLIDER,
  SR_ONLY,
  SURFACE_CHIP_CARD,
} from '../styles'
import { pitchLabel, reachKmFor } from '../utils/forecastGrid/forecastGrid'
import { useExit } from '../hooks/useExit'
import { useTakeOrphanedFocus } from '../hooks/useFocusHandoff'
import { useLayerReach } from '../hooks/useLayerReach'
import { type BaseLayer, OPACITY_DEFAULT } from '../utils/baseMapOpacity'
import type { LayerCoverage } from '../utils/layerCoverage'
import type { MapViewHandle } from './MapView'

// One row's switch in the Layers menu: the menu's own checkbox and the
// layer's name (record 0250 tried an eye here; the maintainer chose the box
// back the same day). The twelve overlays
// and the forecast player share it, because they are the same kind of choice:
// about what the map shows, never about what the analysis asks for. The label
// takes the row's free space, so the press that switches a layer lands
// anywhere left of a base-map row's slider.
function layerSwitch({
  key,
  label,
  checked,
  onChange,
  disabled,
  note,
}: {
  key: string
  label: string
  checked: boolean
  /** The press, with its event, so a Shift range can be read off it (record 0209). */
  onChange: (on: boolean, e: ChangeEvent<HTMLInputElement>) => void
  /** Out of play for this report; `note` says why, as the row's `title` and as
   *  the hidden text its checkbox points at, since a tooltip does not exist on
   *  touch or to a screen reader. */
  disabled?: boolean
  note?: string
}) {
  // A greyed row still ticked keeps its box live, for unticking only (#803,
  // M9): it used to be disabled with the tick in it, so a layer out of view
  // or under an archive report stayed switched on with no way to switch it
  // off. Once unticked it is disabled like any greyed row, so it cannot be
  // ticked while the layer cannot draw. `data-greyed` fades its box alone,
  // leaving the label at full ink for a live control (`CHOICE_ROW`).
  const locked = disabled === true && !checked
  return (
    <label
      className={`${CHOICE_ROW} min-w-0 flex-1`}
      title={disabled && note ? note : undefined}
      data-greyed={disabled && !locked ? '' : undefined}
    >
      <input
        type="checkbox"
        checked={checked}
        disabled={locked}
        aria-describedby={disabled && note ? `layer-${key}-note` : undefined}
        onChange={(e) => onChange(e.target.checked, e)}
        className={CHOICE_INPUT}
      />
      <span>{label}</span>
      {disabled && note && (
        <span id={`layer-${key}-note`} className={SR_ONLY}>
          {note}
        </span>
      )}
    </label>
  )
}

/** One row of `MAP_LAYERS`, as `row` draws it, before its press is wired. */
interface LayerSpec {
  key: string
  label: string
  checked: boolean
  onChange: (on: boolean) => void
  disabled?: boolean
  note?: string
  /** A Base map row's opacity slider, by its layer (record 0250). */
  opacity?: BaseLayer
}

interface LayersPopoverProps {
  /** The overlay switches and the player's (`useMapOverlays`). */
  overlays: Omit<MapOverlays, 'showPlayer'>
  /** The forecast grid's availability and its style and coverage (`useGridLayer`). */
  grid: Pick<
    GridLayer,
    | 'gridOffered'
    | 'gridArchived'
    | 'gridOn'
    | 'gridReachFrac'
    | 'gridReachDraft'
    | 'setGridReachDraft'
    | 'commitGridReach'
    | 'resetGridReach'
    | 'gridReachPitchKm'
  >
  /** Whether anything spans time, so the player row can be ticked. */
  playerOffered: boolean
  /** The map, for the view each bounded row is tested against while the menu is open. */
  mapRef: RefObject<Pick<MapViewHandle, 'watchBounds'> | null>
  /** The server's outlines for the three snapshot layers (`useCapabilities`). */
  coverage: LayerCoverage
  /** The tutorial holds the menu open for its Layers step (#536). */
  forcedOpen?: boolean
  /**
   * A phone (#696): the menu is a bottom sheet, rather than the card a desk
   * stands under the chip (#714). The chip is the same at both.
   */
  sheet?: boolean
}

/**
 * Layers, a chip in the map's row under the search pill at both widths
 * (#696; a desk's since #714), with its menu a card joined to the chip at a
 * desk and a bottom sheet on a phone.
 */
export default function LayersPopover({
  overlays,
  grid,
  playerOffered,
  mapRef,
  coverage,
  forcedOpen = false,
  sheet = false,
}: LayersPopoverProps) {
  const {
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
    showFireActivity,
    setShowFireActivity,
    setShowPlayer,
    playerShown,
    baseOpacity,
    setBaseOpacity,
  } = overlays
  const {
    gridOffered,
    gridArchived,
    gridReachFrac,
    gridReachDraft,
    setGridReachDraft,
    commitGridReach,
    resetGridReach,
    gridReachPitchKm,
  } = grid

  // The map's own Layers popover, closed on load. Not persisted: it is a
  // disclosure, not a setting, and a link that reopened it would be sharing a
  // gesture rather than a picture.
  const [layersOpen, setLayersOpen] = useState(false)
  // The tutorial's Layers step holds it open at either width; a phone's step
  // also switches a layer on under it (`useTour`, #696).
  const open = layersOpen || forcedOpen
  // The desk's menu, which closes itself on a press outside it or Escape. A
  // phone's sheet closes itself (`BottomSheet`), and a press inside it, in a
  // portal at the end of the body, would read as outside the column here.
  const popoverOpen = layersOpen && !sheet
  const closeSheet = useCallback(() => setLayersOpen(false), [])
  // The base-map row whose slider a finger is dragging on a phone, which the
  // sheet steps aside for (record 0250), or null. Pointer presses only: the
  // keyboard moves a level a step at a time and keeps the sheet.
  const [tuning, setTuning] = useState<BaseLayer | null>(null)
  const endTuning = useCallback(() => setTuning(null), [])
  const press = useShiftRange(open)
  // Names each group's heading, which the group points at for its name.
  const headingId = useId()
  // The rows whose layer can draw nothing over the view, watched while the
  // menu is open. A label used to carry this ("US only", "OR/WA", "West"),
  // three ways at once and none of them true of the area feeds' eight states;
  // a grey row is the one way that is true everywhere (#676).
  const layersRef = useRef<HTMLDivElement>(null)
  // A close by Escape or by a press elsewhere takes the menu from under a
  // keyboard that was inside it, so the focus comes back to the button that
  // opened it rather than falling to the body (#576): as the desk's card
  // starts to leave (`useExit`, which keeps it for `MOTION.menu`'s fade), or
  // as the phone's sheet unmounts.
  const buttonRef = useRef<HTMLButtonElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const closing = useExit(open && !sheet, cardRef, buttonRef)
  useTakeOrphanedFocus(buttonRef, !open)
  // Watched while the card is going too, so its grey rows do not light up as
  // it fades.
  const outOfView = useLayerReach(mapRef, coverage, open || closing)
  // Both ways out of a popover a reader expects: click away, or press Escape.
  // `pointerdown` rather than `click` so a press that starts outside dismisses
  // even if the pointer travels before release, and so it lands before the
  // map's own handlers get a chance to treat the same press as a map gesture.
  useEffect(() => {
    if (!popoverOpen) return
    function onDown(e: PointerEvent) {
      if (!layersRef.current?.contains(e.target as Node)) setLayersOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLayersOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [popoverOpen])

  // Three groups by what a layer changes (record 0249): the map itself, a
  // hazard drawn on it, and the weather drawn on it. Alphabetical order held
  // while the list was a handful of unrelated switches; at thirteen it parted
  // the rows that belong together, Fire activity from Active wildfires and Slope
  // angle from Shaded relief. Inside a group the rows go by kind rather than
  // by name: the imagery before the drawn base, a fire before its smoke,
  // the area closures before the trails they close, and the observed
  // weather before the forecast. The grid's own style and coverage stand on
  // its row, because they are that row's controls rather than list members.
  //
  // The player is a list member like the other twelve even though it switches
  // something OFF the map rather than a picture onto it: it answers the same
  // question — what is on the map — and nothing about the report follows it,
  // so it is no more a knob than the overlays beside it. It ends the Forecast
  // group, since what it plays is the forecast.
  //
  // The six layers whose data has an edge grey over a view wholly outside
  // it, the way the player greys when nothing spans time: outside the Forest
  // Service feeds an empty layer means "not covered" rather than "open"
  // (#551), and a grey row says so where a label could not. No `note`, for
  // the player's reason: the grey row is the whole message.
  const MAP_LAYERS: { heading: string; rows: LayerSpec[] }[] = [
    {
      heading: 'Base map',
      // The four ground layers (#799) never grey: the elevation tiles cover
      // the world, and so does the imagery, from USGS over the United States
      // and from EOX everywhere else.
      rows: [
        // Each carries its opacity slider (record 0250); the other nine rows
        // switch a layer and carry none.
        { key: 'satellite', label: 'Satellite', checked: showSatellite, onChange: setShowSatellite, opacity: 'satellite' },
        // The contour lines, under the name a reader looks for them by. The
        // key is the link's flag, `topo`.
        { key: 'topo', label: 'Topographic', checked: showContours, onChange: setShowContours, opacity: 'topo' },
        { key: 'relief', label: 'Shaded relief', checked: showRelief, onChange: setShowRelief, opacity: 'relief' },
        { key: 'slope', label: 'Slope angle', checked: showSlope, onChange: setShowSlope, opacity: 'slope' },
      ],
    },
    {
      heading: 'Hazards',
      rows: [
        {
          key: 'fires',
          label: 'Active wildfires',
          checked: showWildfires,
          onChange: setShowWildfires,
          disabled: outOfView.has('fires'),
        },
        // The fire detections (#799) never grey: the pod reads FIRMS's
        // global files, so no view is outside them.
        { key: 'fireactivity', label: 'Fire activity', checked: showFireActivity, onChange: setShowFireActivity },
        { key: 'smoke', label: 'Smoke', checked: showSmoke, onChange: setShowSmoke, disabled: outOfView.has('smoke') },
        {
          key: 'closedareas',
          label: 'Area closures',
          checked: showAreaClosures,
          onChange: setShowAreaClosures,
          disabled: outOfView.has('closedareas'),
        },
        {
          key: 'closedtrails',
          label: 'Trail closures',
          checked: showTrailClosures,
          onChange: setShowTrailClosures,
          disabled: outOfView.has('closedtrails'),
        },
      ],
    },
    {
      heading: 'Forecast',
      rows: [
        {
          key: 'radar',
          label: 'Rain radar',
          checked: showRadar,
          onChange: setShowRadar,
          disabled: outOfView.has('radar'),
        },
        { key: 'snow', label: 'Snow depth', checked: showSnow, onChange: setShowSnow, disabled: outOfView.has('snow') },
        // Grey, too, with nothing to grid (#803, M5): before any report, and
        // over one whose ranked metric has no number anywhere. Those two carry
        // no `note`, for the player's reason; the archive's older sentence stays.
        {
          key: 'grid',
          label: 'Forecast grid',
          checked: showGrid,
          onChange: setShowGrid,
          disabled: !gridOffered,
          // Mounted twice, as the row's `title` and as the hidden text its
          // checkbox points at: a tooltip does not exist on touch or to a
          // screen reader.
          note: gridArchived ? 'The forecast grid is not available for archival data.' : undefined,
        },
        // Always in the list, gray when nothing spans time (#460). It used to
        // join and leave the list on the radar toggle, which moved every row
        // under it. `CHOICE_ROW` fades the label with its checkbox, and there
        // is no `note`: the gray row is the whole message, where a sentence
        // about a control would be a tooltip by another name (TJ, 2026-09-22).
        {
          key: 'player',
          label: 'Forecast player',
          checked: playerShown,
          onChange: setShowPlayer,
          disabled: !playerOffered,
        },
      ],
    },
  ]
  const layers = MAP_LAYERS.flatMap((group) => group.rows)

  // A base-map row's opacity slider (record 0250), the menu's own `SLIDER`
  // well with the level at the left and `Opacity` at the right, drawn the
  // coverage slider's way below: the line twice, muted on the well and in
  // the fill's ink inside it, the top copy clipped to the fill. While the
  // layer is off the slider keeps its level in a fill without the accent,
  // and a drag on it switches the layer back on at the level it sets. Live:
  // a level is a paint property, never a fetch, so nothing waits for release.
  const opacitySlider = (layer: LayerSpec & { opacity: BaseLayer }) => {
    const level = baseOpacity[layer.opacity]
    const line = (
      <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-2">
        <span className={SLIDER.value}>{level}%</span>
        <span className={SLIDER.wordmark}>Opacity</span>
      </div>
    )
    return (
      <div className={`${sheet ? LAYER_ROW.sliderSheet : LAYER_ROW.slider} ${SLIDER.well}`}>
        <div className={`absolute inset-0 ${SLIDER.idle}`}>{line}</div>
        <div
          className={`absolute inset-0 ${ACCENT.fill}`}
          style={{ clipPath: `inset(0 ${100 - level}% 0 0)` }}
        >
          {line}
        </div>
        <input
          type="range"
          aria-label={`${layer.label} opacity`}
          min={0}
          max={100}
          step={5}
          value={level}
          onChange={(e) => {
            setBaseOpacity(layer.opacity, Number(e.target.value))
            if (!layer.checked) layer.onChange(true)
          }}
          // A double-click puts the level back where it starts.
          onDoubleClick={() => setBaseOpacity(layer.opacity, OPACITY_DEFAULT)}
          // On a phone the sheet steps aside while a finger drags, so the
          // map being tuned is in sight. The input holds the pointer, so its
          // release lands here wherever the finger ends.
          onPointerDown={(e) => {
            if (!sheet) return
            e.currentTarget.setPointerCapture?.(e.pointerId)
            setTuning(layer.opacity)
          }}
          onPointerUp={endTuning}
          onPointerCancel={endTuning}
          onLostPointerCapture={endTuning}
          className={SLIDER.overlay}
        />
      </div>
    )
  }

  // The forecast grid's style and coverage, on its own row at the right where
  // a Base map row carries its opacity slider (LAYER_GRID). Like those
  // sliders they stand while the grid is off, and using one switches it on;
  // they grey with the row while there is nothing the grid could draw. The
  // coverage drag previews live (`gridReachDraft`) and commits on release,
  // because each committed value is a refetch and a drag must not fetch per
  // pixel. Its value renders twice, muted on the well and in the fill's ink
  // inside it, the top copy clipped to the fill, as every slider here does.
  const gridControls = (layer: LayerSpec) => {
    const off = layer.disabled === true
    const switchOn = () => {
      if (!layer.checked) layer.onChange(true)
    }
    const shown = gridReachDraft ?? gridReachFrac
    const pct = shown * 100
    const line = (
      <div className="pointer-events-none absolute inset-0 flex items-center px-2">
        <span className={SLIDER.value}>{pitchLabel(reachKmFor(gridReachPitchKm, shown))}</span>
      </div>
    )
    return (
      <div className={`${sheet ? LAYER_GRID.reachSheet : LAYER_GRID.reach} ${SLIDER.well}`}>
        <div className={`absolute inset-0 ${SLIDER.idle}`}>{line}</div>
        <div className={`absolute inset-0 ${ACCENT.fill}`} style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}>
          {line}
        </div>
        <input
          type="range"
          aria-label="Coverage"
          min={0}
          max={100}
          step={5}
          disabled={off}
          value={Math.round(shown * 100)}
          onChange={(e) => {
            setGridReachDraft(Number(e.target.value) / 100)
            switchOn()
          }}
          onPointerUp={commitGridReach}
          onKeyUp={commitGridReach}
          onBlur={commitGridReach}
          onDoubleClick={resetGridReach}
          className={SLIDER.overlay}
        />
      </div>
    )
  }

  // Each layer is one row: on a phone one row of the sheet, under the
  // sheet's rule, and at a desk one row of the group's ruled list
  // (`LAYER_ROW.cardRows`). A group's
  // heading stands on the rule over its first row on a phone, and on the
  // card's own space at a desk.
  // A press with Shift held reaches every row from the last pressed one to
  // this one (record 0209), down the whole list and across the groups, each
  // switched where it differs from the box the reader pressed; a greyed row
  // is never ticked, and one still ticked may be unticked, as its own box may
  // (#803).
  const order = layers.map((layer) => layer.key)
  const row = (layer: LayerSpec) => {
    // A row lights under the pointer while a press acts on it: a greyed row
    // still ticked does, since it can be unticked (#803).
    const locked = layer.disabled === true && !layer.checked
    const inCard = sheet ? '' : ` ${LAYER_ROW.cardRow} ${MENU.cardRow}${locked ? '' : ` ${MENU.hover}`}`
    const parts = (
      <>
        <div className={`${LAYER_ROW.line}${inCard}`}>
          {layerSwitch({
            ...layer,
            onChange: (on, e) => {
              for (const key of press(order, layer.key, shiftHeld(e))) {
                const each = layers.find((l) => l.key === key)
                if (each && !(on && each.disabled) && each.checked !== on) each.onChange(on)
              }
            },
          })}
          {layer.opacity && opacitySlider({ ...layer, opacity: layer.opacity })}
          {layer.key === 'grid' && gridControls(layer)}
        </div>
      </>
    )
    // The row a finger is tuning stays in sight while the sheet steps aside.
    const kept = sheet && tuning !== null && layer.opacity === tuning ? ` ${SHEET_ASIDE.keep}` : ''
    return (
      <div key={layer.key} className={`${sheet ? MENU_GROUP.sheetRow : ''}${kept}`}>
        {parts}
      </div>
    )
  }
  // Each group is a group to a screen reader too, named by its heading, so a
  // box is heard with the group it stands in.
  const rows = MAP_LAYERS.map((group, g) => (
    <div
      key={group.heading}
      role="group"
      aria-labelledby={`${headingId}-${g}`}
      className={sheet ? MENU_GROUP.sheet : MENU_GROUP.card}
    >
      <div id={`${headingId}-${g}`} className={sheet ? MENU_GROUP.sheetHeading : MENU_GROUP.cardHeading}>
        {group.heading}
      </div>
      {sheet ? group.rows.map(row) : <div className={LAYER_ROW.cardRows}>{group.rows.map(row)}</div>}
    </div>
  ))

  // Layers is a chip in the row under the search pill at both widths. A
  // phone's menu is a bottom sheet over the dimmed map (#696; record 0136),
  // and a desk's is a card 4px under the chip, which stays whole (#714;
  // record 0174), because a pill squared to join a card reads as a dome. One
  // button either way, so the tutorial's anchor is one element; the desk's
  // card is absolute, so the chip's box is the row member's. The tutorial
  // does not hold the sheet open: a modal sheet would take the keyboard from
  // the tour's own card, so on a phone its Layers step points at the chip.
  const button = (
    <MenuButton
      ref={buttonRef}
      shape="chip"
      open={open}
      chevron={!sheet}
      onClick={() => setLayersOpen((o) => !o)}
      data-tour="layers"
      className="flex-shrink-0"
    >
      Layers
    </MenuButton>
  )

  if (sheet) {
    return (
      <>
        {button}
        {open && (
          <BottomSheet
            heading="Layers"
            onClose={closeSheet}
            tourAnchor={forcedOpen ? 'layers-menu' : undefined}
            aside={tuning !== null}
          >
            {rows}
          </BottomSheet>
        )}
      </>
    )
  }

  return (
    // Raised over the Legend chip's card beside it, which it opens across:
    // the menu is the thing a reader just asked for. The two cards share one
    // surface, so the menu's outline and its deeper shadow are what part them.
    <div ref={layersRef} className="relative z-[1] flex-shrink-0">
      {button}
      {(open || closing) && (
        <div
          ref={cardRef}
          data-state={closing ? 'closing' : 'open'}
          className={`${SURFACE_CHIP_CARD.menu} ${MAP_CHIP_MENU} ${CHIP_CARD_W.menu}`}
          data-tour="layers-menu"
        >
          {rows}
        </div>
      )}
    </div>
  )
}
