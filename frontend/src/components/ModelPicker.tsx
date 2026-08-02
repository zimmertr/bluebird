import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PopoverBox, nextActiveIndex, popoverBox } from '../utils/listbox'
import { gridLabel, reachLabel, type ForecastModelOption } from '../hooks/useCapabilities'
import { BADGE_ACCENT, ICON_ADORNMENT, LAYER, SELECT, SURFACE_CARD, TEXT } from '../styles'

// Wide enough for a summary to sit on two lines rather than three: the longest
// measures 512px, so it uses 72% of the 708px two lines buy. The sidebar is
// ~285px, so this only works because the panel floats clear of it, over the map.
const PREFERRED_WIDTH_PX = 380
const GAP_PX = 4
const VIEWPORT_MARGIN_PX = 8

interface Props {
  models: readonly ForecastModelOption[]
  value: string
  /** The model a request with no `forecast_model` lands on. Marked in the list. */
  defaultId: string
  onChange: (id: string) => void
}

/**
 * The forecast model, as a button that opens a list of all of them.
 *
 * A native `<select>` cannot do this job. Choosing well here means reading eight
 * summaries against each other, and a select shows one at a time; its options
 * cannot carry the summaries either, since the shortest needs 303px of label
 * where the control has 245px, so every entry would truncate. `title` on an
 * option is not a way out: macOS draws the list as an OS menu that renders no
 * tooltip, and a phone has no hover at all.
 *
 * So this is the WAI-ARIA listbox pattern, hand-rolled, which is the price of
 * the requirement. The panel is portalled to `document.body` and positioned
 * fixed, because the control panel is an `overflow-y-auto` column that would
 * otherwise clip it at the scroll boundary.
 */
export default function ModelPicker({ models, value, defaultId, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [box, setBox] = useState<PopoverBox | null>(null)
  const selectedIndex = models.findIndex((m) => m.id === value)
  const [active, setActive] = useState(Math.max(selectedIndex, 0))
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // The popover is more than the listbox now — it has a header bar above it,
  // and a press there must not read as a press outside.
  const popoverRef = useRef<HTMLDivElement>(null)

  const selected = selectedIndex >= 0 ? models[selectedIndex] : null

  // Two passes, both before paint so neither is visible. The first asks for as
  // much room as the viewport can give, which lets the list lay out at its
  // natural height; the second measures that height and re-places knowing it.
  // Without the measurement the placement cannot tell "taller than the gap" from
  // "taller than the screen", and every list would scroll in the gap.
  function place(desiredHeight = Infinity) {
    const trigger = triggerRef.current
    if (!trigger) return
    setBox(
      popoverBox(
        trigger.getBoundingClientRect(),
        { width: window.innerWidth, height: window.innerHeight },
        {
          preferredWidth: PREFERRED_WIDTH_PX,
          gap: GAP_PX,
          margin: VIEWPORT_MARGIN_PX,
          desiredHeight,
        },
      ),
    )
  }

  function openList() {
    setActive(Math.max(selectedIndex, 0))
    place()
    setOpen(true)
  }

  function close(refocus: boolean) {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }

  function choose(index: number) {
    const model = models[index]
    if (model) onChange(model.id)
    close(true)
  }

  // Before paint, so the panel never renders at a stale position for a frame.
  useLayoutEffect(() => {
    if (open) place()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // The measuring pass. `scrollHeight` rather than the bounding box, since the
  // first pass may already have capped the box at the viewport.
  useLayoutEffect(() => {
    if (!open) return
    const popover = popoverRef.current
    if (popover) place(popover.scrollHeight)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, models])

  // The trigger moves whenever the panel scrolls or the window resizes, and a
  // fixed-position child does not follow it. Capture phase because the scroll
  // that matters is the sidebar's own, which does not bubble to window.
  useEffect(() => {
    if (!open) return
    const reposition = () => place(popoverRef.current?.scrollHeight ?? Infinity)
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Pointerdown rather than click: a click that lands on something which
  // unmounts under it never reaches document, and the list would stay open.
  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (popoverRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      close(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Focus the list itself rather than an option, so `aria-activedescendant`
  // carries the position and the arrow keys stay on one element.
  useEffect(() => {
    if (open) listRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  function onListKeyDown(e: React.KeyboardEvent) {
    const moved = nextActiveIndex(active, e.key, models.length)
    if (moved !== null) {
      e.preventDefault()
      setActive(moved)
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      choose(active)
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      e.preventDefault()
      close(true)
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Forecast model: ${selected?.label ?? value}`}
        onClick={() => (open ? close(true) : openList())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault()
            openList()
          }
        }}
        className={`${SELECT} w-full px-2 py-1.5 text-left`}
      >
        {selected?.label ?? value}
      </button>
      <svg
        className={`${ICON_ADORNMENT} h-4 w-4`}
        viewBox="0 0 20 20"
        fill="currentColor"
        aria-hidden="true"
      >
        <path
          fillRule="evenodd"
          d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
          clipRule="evenodd"
        />
      </svg>
      {open &&
        box &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: 'fixed',
              left: box.left,
              width: box.width,
              maxHeight: box.maxHeight,
              ...box.offset,
            }}
            className={`${SURFACE_CARD} ${LAYER.popover} flex flex-col`}
          >
            {/* Names the right-hand column once instead of eight times. The
                figures are two bare numbers otherwise, and "3 km" beside a
                model called NOAA GFS invites reading it as GFS's own grid
                rather than the finest the blend reaches — which is what each
                row's "Blends in…" clause is there to correct.

                Outside the listbox, and hidden from assistive tech, because a
                `role="listbox"` may only contain options: a header row inside
                it would be announced as a ninth entry that cannot be chosen.
                Sighted readers get the column names, and a screen reader gets
                each figure in the option's own text. */}
            <div
              aria-hidden="true"
              className={`${TEXT.overline} flex items-baseline justify-between gap-2 border-b border-slate-700 px-3 py-1.5`}
            >
              <span>Model</span>
              <span>Resolution · Range</span>
            </div>
            <div
              ref={listRef}
              role="listbox"
              aria-label="Forecast model"
              aria-activedescendant={`model-option-${active}`}
              tabIndex={-1}
              onKeyDown={onListKeyDown}
              className="min-h-0 flex-1 overflow-y-auto p-1 focus:outline-none"
            >
            {models.map((model, i) => {
              const isSelected = model.id === value
              return (
                <div
                  key={model.id}
                  id={`model-option-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={isSelected}
                  onPointerEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                  className={`cursor-pointer rounded px-2 py-1.5 ${
                    i === active ? 'bg-slate-700' : ''
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="flex items-baseline gap-1.5">
                      {/* Two roles that differ only in weight, so the chosen row
                          reads as chosen without a second color competing with
                          the active highlight behind it. */}
                      <span className={isSelected ? TEXT.subheading : TEXT.control}>
                        {model.label}
                      </span>
                      {model.id === defaultId && (
                        <span className={BADGE_ACCENT}>Recommended</span>
                      )}
                    </span>
                    {/* The two numbers, right-aligned into a column of their
                        own so eight rows can be compared by scanning one edge
                        rather than by reading eight sentences. Both are data
                        rather than prose, which is what keeps the reach honest:
                        it is `forecast_hours` rendered, so it cannot drift from
                        what the calendar will actually offer. */}
                    <span className={`${TEXT.micro} flex-shrink-0 tabular-nums`}>
                      {gridLabel(model.finestGridKm)}
                      {model.finestGridKm > 0 && model.forecastHours > 0 && ' · '}
                      {reachLabel(model.forecastHours)}
                    </span>
                  </div>
                  {model.summary !== '' && (
                    <p className={TEXT.helper}>{model.summary}</p>
                  )}
                </div>
              )
            })}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
