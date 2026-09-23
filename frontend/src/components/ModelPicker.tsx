import { Fragment, useEffect, useRef, useState } from 'react'
import { nextActiveIndex, nextToolbarIndex, optionDomId } from '../utils/listbox'
import { usePopover } from '../hooks/usePopover'
import Popover from './Popover'
import {
  canRemove,
  chipFocusAfterRemoval,
  chipRemovable,
  rankWith,
  selectedIds,
  toggleSelected,
} from '../utils/modelSelection'
import { gridLabel, reachLabel, type ForecastModelOption } from '../hooks/useCapabilities'
import {
  BADGE_ACCENT,
  CHIP,
  CHOICE_INPUT,
  DISABLED,
  SELECT,
  SURFACE_DIVIDER,
  TEXT,
} from '../styles'
import { IconClose, IconSelectArrow } from './icons'

// Wide enough for a summary to sit on two lines rather than three: the longest
// measures 512px, so it uses 72% of the 708px two lines buy. The sidebar is
// ~285px, so this only works because the panel floats clear of it, over the map.
// The one popover that overrides the hook's width: the rest carry labels.
const PREFERRED_WIDTH_PX = 380

// Namespaces this listbox's option ids inside the document.
const LIST_ID = 'model'

// Why the control is faded is NOT said here (TJ, 2026-09-14). It was a `title`
// plus hidden `aria-describedby` text, which put one of the panel's messages
// somewhere no phone could reach and no other message lives. It is now an info
// line in the block under the Analyze button, where every other message about
// the window already is — so the panel has one place that explains itself, and
// this control is free to be nothing but disabled.

interface Props {
  models: readonly ForecastModelOption[]
  value: string
  /** The model a request with no `forecast_model` lands on. Marked in the list. */
  defaultId: string
  onChange: (id: string) => void
  /**
   * The EXTRA models the chart draws beside the ranking one (#232), in the
   * list's editorial order. Never contains `value`: the ranking model is on the
   * chart by being the report, which is why its chip leads the row instead.
   */
  compared: readonly string[]
  onComparedChange: (ids: string[]) => void
  /**
   * The model does not apply to the selected window, so there is nothing to
   * choose. True for an archive window (#123): that endpoint answers from a
   * reanalysis, the same dataset at every location, and the models here are
   * forecast models that never ran over those hours. Disabled rather than
   * hidden, because the row still says which control the window has taken out
   * of play.
   */
  disabled?: boolean
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
 * the requirement. Where the panel lands and what closes it are `usePopover`'s,
 * and the card it sits in is `Popover`'s — including the portal to
 * `document.body`, since the control panel is an `overflow-y-auto` column that
 * would otherwise clip it at the scroll boundary. What is left here is the part
 * no other popover has: the keyboard, the chips and the list.
 *
 * It is also where the chart's model comparison is chosen (#232), because it is
 * the same reading. Two parts, and each does ONE thing:
 *
 * - **The list SELECTS.** A row is ticked or unticked, and nothing about a row
 *   changes which model ranks or closes the popover. Ticking three models is
 *   one visit rather than three.
 * - **The chip row RANKS.** One chip per selected model, and a tap on a chip's
 *   label moves the highlight to it. That is the `model-changed` data knob.
 *
 * The split is the whole design. A row that both selected and ranked put two
 * gestures a few pixels apart, one of which dismissed the list under the
 * reader's hand.
 *
 * Which models are selected lives in `App.tsx` and the link; the rules that
 * move between the two facts live in `utils/modelSelection.ts`, where the node
 * test project checks every case without a page.
 */
export default function ModelPicker({
  models,
  value,
  defaultId,
  onChange,
  compared,
  onComparedChange,
  disabled = false,
}: Props) {
  const [open, setOpen] = useState(false)
  const selectedIndex = models.findIndex((m) => m.id === value)
  const [active, setActive] = useState(Math.max(selectedIndex, 0))
  // Roving tabindex along the chip row: one chip is in the Tab order and the
  // arrow keys move which. A toolbar of N buttons that were all tabbable would
  // put N stops between the trigger and the list.
  const [chipFocus, setChipFocus] = useState(0)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  // Which chip to focus once the row has re-rendered without the removed one.
  const wantChipFocus = useRef<number | null>(null)

  const selected = selectedIndex >= 0 ? models[selectedIndex] : null
  // The chips, left to right. Every selected model in the list's editorial
  // order, the ranking one included and highlighted rather than hidden.
  const chipIds = selectedIds(models, value, compared)
  const removable = canRemove(value, compared)
  // The chips in two groups, named for what each part does. `chipIds` leads
  // with the ranking model (see `selectedIds`), so the split is positional and
  // the tab order still runs straight down the two groups.
  const CHIP_GROUPS: { heading: string; ids: string[] }[] = [
    { heading: 'Ranking', ids: chipIds.slice(0, 1) },
    { heading: 'Comparing', ids: chipIds.slice(1) },
  ]

  // The chip row is part of the panel's height, so a tick that wraps it onto a
  // second line has to buy another measuring pass; so does the list arriving
  // from `/api/capabilities` under an open panel. Nothing else here changes it.
  const { popoverRef, box } = usePopover({
    open,
    onOpenChange: setOpen,
    triggerRef,
    preferredWidth: PREFERRED_WIDTH_PX,
    remeasure: [models, chipIds.length],
  })

  function openList() {
    setActive(Math.max(selectedIndex, 0))
    setChipFocus(Math.max(chipIds.indexOf(value), 0))
    setOpen(true)
  }

  // Every close from inside the panel hands the keyboard back to the trigger.
  // A press outside does not, and that one is `usePopover`'s.
  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  /** Apply one rule's answer. The ranking setter clamps the window, so it is
      called only when the ranking actually moved. */
  function apply(next: { ranking: string; compared: string[] }) {
    if (next.ranking !== value) onChange(next.ranking)
    onComparedChange(next.compared)
  }

  function toggle(id: string) {
    apply(toggleSelected(models, value, compared, id))
  }

  function rank(id: string) {
    apply(rankWith(models, value, compared, id))
  }

  function removeChip(id: string, at: number) {
    if (!removable) return
    wantChipFocus.current = chipFocusAfterRemoval(at, chipIds.length - 1)
    toggle(id)
  }

  // The panel is on screen only once `usePopover` has placed it, and on the
  // first open that is a render after `open` turns true (a later open starts
  // from the previous box). So the two effects below key on the panel being
  // drawn: keyed on `open`, the first open would look for a list that does not
  // exist yet and leave the keyboard on the trigger.
  const shown = open && box !== null

  // Focus the list itself rather than an option, so `aria-activedescendant`
  // names the highlighted row and the arrow keys stay on one element. The list
  // rather than the chip row, because the list is what an opened picker is for;
  // Shift+Tab reaches the chips above it.
  useEffect(() => {
    if (shown) listRef.current?.focus()
  }, [shown])

  useEffect(() => {
    if (!shown) return
    listRef.current
      ?.querySelector(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [shown, active])

  // A removed chip takes the keyboard with it unless focus is placed again
  // after the row re-renders, which is why this waits for the render rather
  // than running inside the handler.
  //
  // Kept: no list is the point. The ref is the trigger, and it is cleared on
  // the first pass, so the `[chipIds]` the rule offers would both fire on
  // renders that removed nothing and miss ones that removed something.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const wanted = wantChipFocus.current
    if (wanted === null) return
    wantChipFocus.current = null
    const at = Math.min(wanted, chipIds.length - 1)
    const id = chipIds[at]
    if (id === undefined) return
    setChipFocus(at)
    chipRefs.current[id]?.focus()
  })

  function focusChip(at: number) {
    setChipFocus(at)
    const id = chipIds[at]
    if (id !== undefined) chipRefs.current[id]?.focus()
  }

  function onChipKeyDown(e: React.KeyboardEvent, at: number, id: string) {
    const moved = nextToolbarIndex(chipFocus, e.key, chipIds.length)
    if (moved !== null) {
      e.preventDefault()
      focusChip(moved)
      return
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      // The ranking chip has no × for the same reason this still works on it:
      // unticking it is a real gesture, and the ranking passes to its
      // neighbour rather than the set emptying.
      if (removable) removeChip(id, at)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'Tab') {
      // Tab moves along the popover's own order — chips, then the list — rather
      // than the document's, which would send focus past everything else on the
      // page first because the panel is portalled to the end of the body.
      e.preventDefault()
      if (e.shiftKey) close()
      else listRef.current?.focus()
    }
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    const moved = nextActiveIndex(active, e.key, models.length)
    if (moved !== null) {
      e.preventDefault()
      setActive(moved)
      return
    }
    if (e.key === 'Enter' || e.key === ' ') {
      // Both keys do the one thing a row does. The list stays open the way it
      // does for a mouse: ticking three boxes is one visit, not three.
      e.preventDefault()
      const model = models[active]
      if (model && !(model.id === value && !removable)) toggle(model.id)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) focusChip(chipFocus)
      else close()
    }
  }

  const comparedCount = compared.filter((id) => id !== value).length

  // One chip, by id. Lifted out of the JSX because the row is drawn twice now,
  // once per group, and a chip must be the same object in both: same shape,
  // same roving-tabindex arithmetic, same remove affordance.
  function renderChip(id: string) {
    const at = chipIds.indexOf(id)
    const model = models.find((m) => m.id === id) ?? null

    const label = model?.label ?? id
    const isRanking = id === value
    const canDrop = chipRemovable(value, compared, id)
    return (
      <span key={id} className={isRanking ? CHIP.active : CHIP.rest}>
        <button
          type="button"
          ref={(el) => {
            chipRefs.current[id] = el
          }}
          tabIndex={at === Math.min(chipFocus, chipIds.length - 1) ? 0 : -1}
          onClick={() => rank(id)}
          onFocus={() => setChipFocus(at)}
          onKeyDown={(e) => onChipKeyDown(e, at, id)}
          className={CHIP.label}
        >
          {label}
        </button>
        {/* Always drawn, and hidden with `invisible` rather than
            dropped, so the slot keeps its width: a chip that lost
            this box when the highlight reached it would resize
            two chips per tap and shuffle the row under the
            pointer that did it.

            Out of the Tab order rather than out of the
            accessibility tree while it can act: the chip row's own
            Delete does this, so a second stop per chip would double
            the presses a keyboard pays to cross the row, while a
            screen reader still reaches and names the button. While
            it cannot act it leaves the tree altogether, since a
            slot held open for alignment is not a control. */}
        <button
          type="button"
          tabIndex={-1}
          disabled={!canDrop}
          aria-hidden={canDrop ? undefined : 'true'}
          aria-label={`Remove ${label}`}
          onClick={() => removeChip(id, at)}
          className={`${CHIP.remove} ${canDrop ? '' : 'invisible'}`}
        >
          <IconClose size="chip" />
        </button>
      </span>
    )
                }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Forecast model: ${selected?.label ?? value}${
          comparedCount > 0 ? ` +${comparedCount}` : ''
        }`}
        disabled={disabled}
        onClick={() => (open ? close() : openList())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault()
            openList()
          }
        }}
        // Centered on both axes. `items-center` rather than `items-baseline`
        // is what makes the vertical half true on a phone: `FIELD` grows the
        // box to the tap floor there, and a baseline left the model name
        // against the top edge of a box half again as tall as its text
        // (TJ, 2026-09-14).
        className={`${SELECT} ${DISABLED} flex w-full items-center justify-center gap-1 px-2 py-1.5 text-center`}
      >
        {/* The label gives way, never the count: `+2` is the only thing on the
            trigger that a reader cannot otherwise see, so a long model name
            ellipsizes rather than pushing it out of a control that must stay
            CONTROL_W wide on both breakpoints. */}
        <span className="min-w-0 truncate">{selected?.label ?? value}</span>
        {comparedCount > 0 && (
          <span className="flex-shrink-0 tabular-nums">+{comparedCount}</span>
        )}
      </button>
      <IconSelectArrow />
      {open && box && (
        <Popover box={box} popoverRef={popoverRef}>
          {/* The selected set, split into what each part DOES, under
              headings of the same kind the list's own header below wears.
              Two groups rather than one row of chips is the whole
              explanation: the reader's model is under `Ranking` and the
              others are under `Comparing`, so the relationship is
              structural instead of something inferred from a highlight
              (TJ, 2026-09-14). Promoting a compared chip then shows itself
              — the chip moves up into the other group.

              `Comparing` is drawn only when something is compared. A reader
              with one model selected sees one heading and one chip, which
              is the height the single header cost before.

              One toolbar across both groups, not one each: the roving
              tabindex walks `chipIds`, and that order now leads with the
              ranking model, so the tab order and the reading order are the
              same walk. A toolbar rather than a second listbox, because
              these are buttons that act, not options that are chosen, and
              the one listbox below already owns the arrow keys. */}
          <div
            role="toolbar"
            className={`flex flex-shrink-0 flex-col border-b ${SURFACE_DIVIDER}`}
          >
            {CHIP_GROUPS.map(({ heading, ids }) =>
              ids.length === 0 ? null : (
                <Fragment key={heading}>
                  <div className={`${TEXT.overline} px-3 pb-1 pt-2`}>{heading}</div>
                  <div className="flex flex-wrap items-center gap-1.5 px-3 pb-2">
                    {ids.map(renderChip)}
                  </div>
                </Fragment>
              ),
            )}
          </div>
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
            className={`${TEXT.overline} flex items-baseline justify-between gap-2 border-b ${SURFACE_DIVIDER} px-3 py-1.5`}
          >
            <span>Model</span>
            <span>Resolution · Range</span>
          </div>
          <div
            ref={listRef}
            role="listbox"
            // One list, one decision, and more than one row answers it: every
            // selected model is on the chart. Multi-select is what makes
            // `aria-selected` on more than one row legal.
            aria-multiselectable="true"
            aria-label="Forecast model"
            aria-activedescendant={
              models[active] ? optionDomId(LIST_ID, models[active].id) : undefined
            }
            tabIndex={-1}
            onKeyDown={onListKeyDown}
            className="min-h-0 flex-1 overflow-y-auto p-1 focus:outline-none"
          >
          {models.map((model, i) => {
            const isRanking = model.id === value
            const isSelected = isRanking || compared.includes(model.id)
            // The last selected model cannot be given up: a report has to
            // come from some model, so the box is disabled rather than
            // quietly doing nothing when pressed.
            const locked = isRanking && !removable
            return (
              <div
                key={model.id}
                id={optionDomId(LIST_ID, model.id)}
                data-index={i}
                role="option"
                aria-selected={isSelected}
                aria-disabled={locked || undefined}
                onPointerEnter={() => setActive(i)}
                onClick={() => {
                  if (!locked) toggle(model.id)
                }}
                className={`flex items-start gap-2 rounded px-2 py-1.5 ${
                  locked ? 'cursor-default' : 'cursor-pointer'
                } ${i === active ? 'bg-slate-700' : ''}`}
              >
                <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex items-baseline gap-1.5">
                    {/* Two roles that differ only in weight, so the ranking
                        row reads as the ranking one without a second color
                        competing with the active highlight behind it. */}
                    <span className={isRanking ? TEXT.subheading : TEXT.control}>
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
                {/* Drawn, not announced: `aria-selected` on the row above
                    already carries this state, and a focusable input inside a
                    `role="option"` would be a second stop in a list whose
                    whole keyboard model is one element with
                    `aria-activedescendant`. Enter and Space are the keys that
                    toggle it. */}
                <input
                  type="checkbox"
                  aria-hidden="true"
                  tabIndex={-1}
                  checked={isSelected}
                  disabled={locked}
                  onChange={() => toggle(model.id)}
                  onClick={(e) => e.stopPropagation()}
                  className={`${CHOICE_INPUT} ${DISABLED} mt-0.5`}
                />
              </div>
            )
          })}
          </div>
        </Popover>
      )}
    </>
  )
}
