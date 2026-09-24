import { Fragment, useEffect, useRef, useState } from 'react'
import type { GridLayer } from '../hooks/useGridLayer'
import type { MapOverlays } from '../hooks/useMapOverlays'
import { IconLayers } from './icons'
import {
  ACCENT,
  BUTTON_FLOATING,
  CHOICE_INPUT,
  CHOICE_ROW,
  LIFTED_EDGE,
  MAP_COL_GAP_T,
  MAP_COL_W,
  MAP_ROW_H,
  RADIUS,
  RECESSED_FILL,
  SEGMENT_DIVIDER,
  SEGMENT_FLUID_LIFTED,
  SEGMENT_IDLE,
  SEGMENT_ITEM,
  SLIDER_IDLE,
  SLIDER_OVERLAY,
  SLIDER_VALUE,
  SLIDER_WORDMARK,
  SR_ONLY,
  SURFACE_POPOVER,
} from '../styles'
import { type GridStyle, pitchLabel, reachKmFor } from '../utils/forecastGrid'

// One row of the Layers popover: a checkbox and what it switches. The four
// overlays and the forecast player share it, because they are the same kind of
// choice — about what the map shows, never about what the analysis asks for.
function layerRow({
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
  onChange: (on: boolean) => void
  /** Out of play for this report; `note` says why, as the row's `title` and as
   *  the hidden text its checkbox points at, since a tooltip does not exist on
   *  touch or to a screen reader. */
  disabled?: boolean
  note?: string
}) {
  return (
    <label key={key} className={CHOICE_ROW} title={disabled && note ? note : undefined}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-describedby={disabled && note ? `layer-${key}-note` : undefined}
        onChange={(e) => onChange(e.target.checked)}
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
}

/**
 * Layers, under the search box rather than beside MapLibre's own
 * controls on the right. Two reasons it moved: the library's stack
 * is two control GROUPS with a margin between them, so any offset
 * that clears it is a guess that was already wrong once — and the
 * left column is where the app's own map controls live, which
 * makes the split legible. Left is ours, right is the library's.
 */
export default function LayersPopover({ overlays, grid, playerOffered }: LayersPopoverProps) {
  const {
    showWildfires,
    setShowWildfires,
    showRadar,
    setShowRadar,
    showSmoke,
    setShowSmoke,
    showSnow,
    setShowSnow,
    showGrid,
    setShowGrid,
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
  const layersRef = useRef<HTMLDivElement>(null)
  // Both ways out of a popover a reader expects: click away, or press Escape.
  // `pointerdown` rather than `click` so a press that starts outside dismisses
  // even if the pointer travels before release, and so it lands before the
  // map's own handlers get a chance to treat the same press as a map gesture.
  useEffect(() => {
    if (!layersOpen) return
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
  }, [layersOpen])

  // Alphabetical by label, which is the only order a list of unrelated switches
  // can be scanned in: these five have no ranking between them — no cost, no
  // severity, no dependency — so any other order is one the reader has to
  // learn. The grid's own segment and slider still render under its row,
  // because they are that row's sub-choices rather than list members.
  //
  // The player is a list member like the other four even though it switches
  // something OFF the map rather than a picture onto it: it answers the same
  // question — what is on the map — and nothing about the report follows it,
  // so it is no more a knob than the overlays beside it.
  const MAP_LAYERS = [
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
    { key: 'radar', label: 'Rain radar', checked: showRadar, onChange: setShowRadar },
    { key: 'smoke', label: 'Smoke', checked: showSmoke, onChange: setShowSmoke },
    { key: 'snow', label: 'Snow depth (US only)', checked: showSnow, onChange: setShowSnow },
    { key: 'fires', label: 'Wildfires (US only)', checked: showWildfires, onChange: setShowWildfires },
  ]

  return (
    <div ref={layersRef} className="relative">
      <button
        onClick={() => setLayersOpen((o) => !o)}
        aria-expanded={layersOpen}
        className={`${BUTTON_FLOATING} ${MAP_COL_W} ${MAP_ROW_H} flex items-center gap-2 px-2.5`}
      >
        <IconLayers />
        Layers
      </button>
      {/* Zero from the button it hangs under, which is the same edge
          as `MAP_EDGE.left`: the popover's offset parent is the column,
          so an inset of its own would be that inset twice and the box
          would hang a step right of the legends it hangs over. */}
      {layersOpen && (
        <div className={`${SURFACE_POPOVER} ${MAP_COL_W} ${MAP_COL_GAP_T} absolute left-0 px-2.5 py-2`}>
          {MAP_LAYERS.map((layer) => (
            <Fragment key={layer.key}>
              {layerRow(layer)}
              {/* The grid's sub-choices, revealed by its own checkbox
                  and rendered under the row they belong to rather than
                  after the list, so the alphabetical order above holds
                  whatever is open. The popover is as wide as the legend
                  boxes below it (`MAP_COL_W`), so these take the fluid
                  segment rather than the panel's fixed 144px column —
                  the same reason the results bar's mode switch does.

                  They are ONE block, set off from the list by the same
                  gap on both sides: `mt-1.5` under the checkbox row it
                  belongs to, and `mb-1.5` under the last of them. The
                  slider used to end flush against the next layer's row,
                  so the block read as belonging to that row as much as
                  to the grid's — a group is bounded by its gaps, and
                  one gap bounds nothing. */}
              {layer.key === 'grid' && gridOn && (
                <>
                  <div className={`${SEGMENT_FLUID_LIFTED} mt-1.5 w-full`}>
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
                    className={`relative mt-1.5 mb-1.5 h-6 w-full overflow-hidden ${RADIUS.control} ${LIFTED_EDGE} ${RECESSED_FILL}`}
                  >
                    {(() => {
                      const shown = gridReachDraft ?? gridReachFrac
                      const pct = shown * 100
                      const line = (
                        <div className="pointer-events-none absolute inset-0 flex items-center justify-between px-2">
                          <span className={SLIDER_VALUE}>
                            {pitchLabel(reachKmFor(gridReachPitchKm, shown))}
                          </span>
                          <span className={SLIDER_WORDMARK}>Coverage</span>
                        </div>
                      )
                      return (
                        <>
                          <div className={`absolute inset-0 ${SLIDER_IDLE}`}>{line}</div>
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
                      className={SLIDER_OVERLAY}
                    />
                  </div>
                </>
              )}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  )
}
