import { Fragment, useCallback, useEffect, useRef, useState, type ChangeEvent, type ElementType, type RefObject } from 'react'
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
  MAP_CHIP_MENU,
  MENU,
  SEGMENT_DIVIDER,
  SEGMENT_FLUID,
  SEGMENT_IDLE,
  SEGMENT_ITEM,
  SLIDER,
  SR_ONLY,
  SURFACE_CHIP_CARD,
} from '../styles'
import { type GridStyle, pitchLabel, reachKmFor } from '../utils/forecastGrid/forecastGrid'
import { useExit } from '../hooks/useExit'
import { useTakeOrphanedFocus } from '../hooks/useFocusHandoff'
import { useLayerReach } from '../hooks/useLayerReach'
import type { LayerCoverage } from '../utils/layerCoverage'
import type { MapViewHandle } from './MapView'

// One row of the Layers popover: a checkbox and what it switches. The twelve
// overlays and the forecast player share it, because they are the same kind of
// choice — about what the map shows, never about what the analysis asks for.
function layerRow({
  key,
  label,
  checked,
  onChange,
  disabled,
  note,
  menu,
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
  /** A row of the desk's card rather than of a phone's sheet: it lights under the pointer unless disabled. */
  menu: boolean
}) {
  const inCard = menu ? ` ${MENU.cardRow}${disabled ? '' : ` ${MENU.hover}`}` : ''
  return (
    <label key={key} className={`${CHOICE_ROW}${inCard}`} title={disabled && note ? note : undefined}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
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

interface LayersPopoverProps {
  /** The overlay switches and the player's (`useMapOverlays`). */
  overlays: Omit<MapOverlays, 'showPlayer'>
  /** The forecast grid's availability and its sub-controls (`useGridLayer`). */
  grid: Pick<
    GridLayer,
    | 'gridAvailable'
    | 'gridOn'
    | 'gridStyle'
    | 'setGridStyle'
    | 'gridReachFrac'
    | 'gridReachDraft'
    | 'setGridReachDraft'
    | 'commitGridReach'
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
  } = overlays
  const {
    gridAvailable,
    gridOn,
    gridStyle,
    setGridStyle,
    gridReachFrac,
    gridReachDraft,
    setGridReachDraft,
    commitGridReach,
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
  const press = useShiftRange(open)
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

  // Alphabetical by label, which is the only order a list of unrelated switches
  // can be scanned in: these thirteen have no ranking between them — no cost, no
  // severity, no dependency — so any other order is one the reader has to
  // learn. The grid's own segment and slider still render under its row,
  // because they are that row's sub-choices rather than list members.
  //
  // The player is a list member like the other twelve even though it switches
  // something OFF the map rather than a picture onto it: it answers the same
  // question — what is on the map — and nothing about the report follows it,
  // so it is no more a knob than the overlays beside it.
  const MAP_LAYERS = [
    // The six layers whose data has an edge grey over a view wholly outside
    // it, the way the player greys when nothing spans time: outside the
    // Forest Service feeds an empty layer means "not covered" rather than
    // "open" (#551), and a grey row says so where a label could not. No
    // `note`, for the player's reason: the grey row is the whole message.
    {
      key: 'closedareas',
      label: 'Area closures',
      checked: showAreaClosures,
      onChange: setShowAreaClosures,
      disabled: outOfView.has('closedareas'),
    },
    // The fire detections (#799) never grey either: the pod reads FIRMS's
    // global files, so no view is outside them.
    { key: 'fireactivity', label: 'Fire activity', checked: showFireActivity, onChange: setShowFireActivity },
    {
      key: 'grid',
      label: 'Forecast grid',
      checked: showGrid,
      onChange: setShowGrid,
      disabled: !gridAvailable,
      // Mounted twice, as the row's `title` and as the hidden text its checkbox
      // points at: a tooltip does not exist on touch or to a screen reader.
      note: 'The forecast grid is not available for archival data.',
    },
    // Always in the list, gray when nothing spans time (#460). It used to join
    // and leave the list on the radar toggle, which moved every row under it.
    // `CHOICE_ROW` fades the label with its checkbox, and there is no `note`:
    // the gray row is the whole message, where a sentence about a control
    // would be a tooltip by another name (TJ, 2026-09-22).
    {
      key: 'player',
      label: 'Forecast player',
      checked: playerShown,
      onChange: setShowPlayer,
      disabled: !playerOffered,
    },
    {
      key: 'radar',
      label: 'Rain radar',
      checked: showRadar,
      onChange: setShowRadar,
      disabled: outOfView.has('radar'),
    },
    // The three ground layers (#799) never grey: the elevation tiles cover the
    // world, and so does the imagery, from USGS over the United States and
    // from EOX everywhere else.
    { key: 'satellite', label: 'Satellite', checked: showSatellite, onChange: setShowSatellite },
    { key: 'relief', label: 'Shaded relief', checked: showRelief, onChange: setShowRelief },
    // Never greys, for the relief's reason: the elevation covers the world.
    { key: 'slope', label: 'Slope angle', checked: showSlope, onChange: setShowSlope },
    { key: 'smoke', label: 'Smoke', checked: showSmoke, onChange: setShowSmoke, disabled: outOfView.has('smoke') },
    { key: 'snow', label: 'Snow depth', checked: showSnow, onChange: setShowSnow, disabled: outOfView.has('snow') },
    // The contour lines, under the name a reader looks for them by. The key
    // is the link's flag, `topo`.
    { key: 'topo', label: 'Topographic', checked: showContours, onChange: setShowContours },
    {
      key: 'closedtrails',
      label: 'Trail closures',
      checked: showTrailClosures,
      onChange: setShowTrailClosures,
      disabled: outOfView.has('closedtrails'),
    },
    {
      key: 'fires',
      label: 'Wildfires',
      checked: showWildfires,
      onChange: setShowWildfires,
      disabled: outOfView.has('fires'),
    },
  ]

  // On a phone each layer is one row of the sheet, its grid sub-choices
  // inside it, so the sheet's rule falls between layers and never between a
  // row and its own segment.
  // A press with Shift held reaches every row from the last pressed one to
  // this one (record 0209), each switched where it differs from the box the
  // reader pressed; a greyed row stays as it is.
  const order = MAP_LAYERS.map((layer) => layer.key)
  const Row: ElementType = sheet ? 'div' : Fragment
  const rows = MAP_LAYERS.map((layer) => (
    <Row key={layer.key}>
      {layerRow({
        ...layer,
        onChange: (on, e) => {
          for (const key of press(order, layer.key, shiftHeld(e))) {
            const each = MAP_LAYERS.find((l) => l.key === key)
            if (each && !each.disabled && each.checked !== on) each.onChange(on)
          }
        },
        menu: !sheet,
      })}
      {/* The grid's sub-choices, revealed by its own checkbox
          and rendered under the row they belong to rather than
          after the list, so the alphabetical order above holds
          whatever is open. The desk's card is as wide as its widest
          row (`CHIP_CARD_W.menu`), and a phone's sheet as wide
          as the phone, so these take the fluid segment rather than
          the panel's fixed 144px column — the same reason the
          results bar's mode switch does.

          They are ONE block, set off from the list by the same
          gap on both sides: `mt-1.5` under the checkbox row it
          belongs to, and `mb-1.5` under the last of them. The
          slider used to end flush against the next layer's row,
          so the block read as belonging to that row as much as
          to the grid's — a group is bounded by its gaps, and
          one gap bounds nothing. */}
      {layer.key === 'grid' && gridOn && (
        <>
          <div className={`${SEGMENT_FLUID} mt-1.5 w-full`}>
            {(['blocks', 'smooth'] as GridStyle[]).map((value, i) => (
              <button
                key={value}
                type="button"
                aria-pressed={gridStyle === value}
                onClick={() => setGridStyle(value)}
                className={`${SEGMENT_ITEM} ${
                  gridStyle === value ? ACCENT.fill : SEGMENT_IDLE
                } ${i > 0 ? SEGMENT_DIVIDER : ''}`}
              >
                {value === 'blocks' ? 'Blocks' : 'Smooth'}
              </button>
            ))}
          </div>
          {/* The coverage slider: how far from each destination
              the grid reaches. The value and wordmark render
              TWICE — muted on the well, white inside the accent
              fill — with the top copy clipped to the fill, so the
              line stays readable at any position without a color
              racing another. Drag previews live (`gridReachDraft`)
              and commits on release, because each committed value
              is a refetch and a drag must not fetch per pixel. */}
          <div
            className={`relative mt-1.5 mb-1.5 h-6 w-full overflow-hidden ${SLIDER.well} ${SLIDER.fit}`}
          >
            {(() => {
              const shown = gridReachDraft ?? gridReachFrac
              const pct = shown * 100
              const line = (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-2">
                  <span className={SLIDER.value}>
                    {pitchLabel(reachKmFor(gridReachPitchKm, shown))}
                  </span>
                  <span className={SLIDER.wordmark}>Coverage</span>
                </div>
              )
              return (
                <>
                  <div className={`absolute inset-0 ${SLIDER.idle}`}>{line}</div>
                  <div
                    className={`absolute inset-0 ${ACCENT.fill}`}
                    style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
                  >
                    {line}
                  </div>
                </>
              )
            })()}
            <input
              type="range"
              aria-label="Coverage"
              min={0}
              max={100}
              step={5}
              value={Math.round((gridReachDraft ?? gridReachFrac) * 100)}
              onChange={(e) => setGridReachDraft(Number(e.target.value) / 100)}
              onPointerUp={commitGridReach}
              onKeyUp={commitGridReach}
              onBlur={commitGridReach}
              className={SLIDER.overlay}
            />
          </div>
        </>
      )}
    </Row>
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
    >
      Layers
    </MenuButton>
  )

  if (sheet) {
    return (
      <>
        {button}
        {open && (
          <BottomSheet heading="Layers" onClose={closeSheet} tourAnchor={forcedOpen ? 'layers-menu' : undefined}>
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
