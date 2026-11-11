import { Fragment, useEffect, useRef, useState } from 'react'
import { nextActiveIndex, nextToolbarIndex, optionDomId } from '../utils/listbox'
import { usePopover } from '../hooks/usePopover'
import { useShiftRange } from '../hooks/useShiftRange'
import Menu, { MenuButton } from './Menu'
import {
  canRemove,
  chipFocusAfterRemoval,
  chipRemovable,
  rankWith,
  selectedIds,
  toggleSelected,
} from '../utils/model/modelSelection'
import { gridLabel, reachLabel, type ForecastModelOption } from '../hooks/useCapabilities'
import {
  BADGE_ACCENT,
  CHIP,
  CHOICE_INPUT,
  CONTROL_SIZE,
  DISABLED,
  FOCUS_RING,
  LINK_ACTION,
  MODEL_ROW,
  SURFACE_DIVIDER,
  SCROLL_BARS,
  TEXT,
} from '../styles'
import { IconClose } from './icons'
import { comparedInPlay } from '../utils/model/modelSelection'

// Namespaces this listbox's option ids inside the document.
const LIST_ID = 'model'

// Why the control is faded is NOT said here (TJ, 2026-09-14). It was a `title`
// plus hidden `aria-describedby` text, which put one of the panel's messages
// somewhere no phone could reach and no other message lives. It is now an info
// line in the list the Analyze button's badge opens, where every other message about
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
  /**
   * The row the trigger stands in, whose width the list takes: its rows carry
   * a badge, a grid and reach column and a summary, which would run a card
   * as wide as its rows across the map, and the trigger is `CONTROL_W`
   * (record 0201).
   */
  rowRef?: React.RefObject<HTMLElement | null>
  /**
   * A phone (record 0136): the list opens in a bottom sheet headed Model,
   * the label's word, rather than in a card under the field.
   */
  sheet?: boolean
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
 * and the card it sits in is `Menu`'s — including the portal to
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
 * move between the two facts live in `utils/model/modelSelection.ts`, where the node
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
  rowRef,
  sheet = false,
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
  const removeAllRef = useRef<HTMLButtonElement>(null)
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
  // the tab order still runs straight down the two groups. Both stand on every
  // open, Comparing with no chips at all while nothing is compared, because
  // its row ends in Remove all, which stands greyed there (record 0209).
  const CHIP_GROUPS: { heading: string; ids: string[] }[] = [
    { heading: 'Ranking', ids: chipIds.slice(0, 1) },
    { heading: 'Comparing', ids: chipIds.slice(1) },
  ]

  // The chip row is part of the panel's height, so a tick that wraps it onto a
  // second line has to buy another measuring pass; so does the list arriving
  // from `/api/capabilities` under an open panel. Nothing else here changes it.
  // Closed to the hook on a phone, whose sheet places and dismisses itself.
  const { popoverRef, box, closing } = usePopover({
    open: open && !sheet,
    onOpenChange: setOpen,
    triggerRef,
    // 4px under the field like every menu, at its row's width (record 0201):
    // the trigger's 118px clipped the header and the badge, and the card's
    // right edge on the field's keeps it in the panel, opening under the
    // label. It was 380px floating over the map before record 0134.
    widthRef: rowRef,
    remeasure: [models, chipIds.length],
    // The list rather than the chip row, because the list is what an opened
    // picker is for; Shift+Tab reaches the chips above it. The list itself
    // rather than an option, so `aria-activedescendant` names the highlighted
    // row and the arrow keys stay on one element.
    initialFocusRef: listRef,
  })

  function openList() {
    setActive(Math.max(selectedIndex, 0))
    setChipFocus(Math.max(chipIds.indexOf(value), 0))
    setOpen(true)
  }

  // Every close from inside the panel hands the keyboard back to the trigger:
  // the panel unmounts under it, and `usePopover` returns an orphaned focus.
  function close() {
    setOpen(false)
  }

  /** Apply one rule's answer. The ranking setter clamps the window, so it is
      called only when the ranking actually moved. */
  function apply(next: { ranking: string; compared: string[] }) {
    if (next.ranking !== value) onChange(next.ranking)
    onComparedChange(next.compared)
  }

  // A press with Shift held reaches every row from the last pressed one to
  // this one (record 0209), each toggled where it differs from the row the
  // reader pressed, so the range ends up as that row does. One rule applied
  // row by row, so a range that crosses the ranking model passes the ranking
  // on the way `toggleSelected` says, and the last selected model stays.
  const press = useShiftRange(open)
  function toggle(id: string, shift = false) {
    const wanted = !(id === value || compared.includes(id))
    let next = { ranking: value, compared: [...compared] }
    for (const each of press(models.map((m) => m.id), id, shift)) {
      const selected = each === next.ranking || next.compared.includes(each)
      if (selected !== wanted) next = toggleSelected(models, next.ranking, next.compared, each)
    }
    apply(next)
  }

  function rank(id: string) {
    apply(rankWith(models, value, compared, id))
  }

  function removeChip(id: string, at: number) {
    if (!removable) return
    wantChipFocus.current = chipFocusAfterRemoval(at, chipIds.length - 1)
    toggle(id)
  }

  // Every compared chip's × at once (record 0209): the ranking model stays and
  // ranks, so the report keeps its model and the chart drops to one. The
  // button greys under the keyboard as it acts, so the keyboard goes to the
  // ranking chip, the one chip left.
  const comparedCount = compared.filter((id) => id !== value).length
  // What the closed trigger counts: the compared models the run will fetch.
  // The picker is disabled for an archive window and nothing else, and there
  // the comparison is set aside (`comparedInPlay`, #803, W3), so a `+2` would
  // promise lines the run never draws. The selection itself is untouched.
  const countedOnTrigger = comparedInPlay(compared, disabled ? 'archive' : null).filter((id) => id !== value).length
  function removeAll() {
    if (comparedCount === 0) return
    wantChipFocus.current = 0
    apply({ ranking: value, compared: [] })
  }

  // The panel is on screen only once `usePopover` has placed it, and on the
  // first open that is a render after `open` turns true (a later open starts
  // from the previous box). So the effect below keys on the panel being drawn:
  // keyed on `open`, the first open would look for a list that does not exist
  // yet.
  const shown = open && (sheet || box !== null)

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
    } else if (e.key === 'Tab' && !(sheet && e.shiftKey)) {
      // Tab moves along the popover's own order — chips, Remove all while it
      // can act, then the list — rather than the document's, which would send
      // focus past everything else on the page first because the panel is
      // portalled to the end of the body. A sheet keeps Shift+Tab, which its
      // own trap walks to Done.
      e.preventDefault()
      if (e.shiftKey) close()
      else if (comparedCount > 0) removeAllRef.current?.focus()
      else listRef.current?.focus()
    }
  }

  // Remove all is the toolbar's one stop after the chips: Tab goes on to the
  // list, Shift+Tab back to the chip in the Tab order, by the same rule the
  // chips follow, and Escape closes.
  function onRemoveAllKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) focusChip(chipFocus)
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
      // does for a mouse: ticking three boxes is one visit, not three, and a
      // sheet, which closes on an Enter pressed on its rows, never hears it.
      e.preventDefault()
      e.stopPropagation()
      const model = models[active]
      if (model && !(model.id === value && !removable)) toggle(model.id)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      close()
    } else if (e.key === 'Tab') {
      // A sheet is modal, so Tab off the list walks on inside it rather than
      // closing it.
      if (sheet && !e.shiftKey) return
      e.preventDefault()
      if (!e.shiftKey) close()
      else if (comparedCount > 0) removeAllRef.current?.focus()
      else focusChip(chipFocus)
    }
  }

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
      <MenuButton
        ref={triggerRef}
        shape="field"
        open={open}
        aria-haspopup={sheet ? 'dialog' : 'listbox'}
        aria-label={`Forecast model: ${selected?.label ?? value}${
          countedOnTrigger > 0 ? ` +${countedOnTrigger}` : ''
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
        className="flex w-full items-center justify-center gap-1 px-2 py-0.5 text-center"
      >
        {/* The label gives way, never the count: `+2` is the only thing on the
            trigger that a reader cannot otherwise see, so a long model name
            ellipsizes rather than pushing it out of a control that must stay
            CONTROL_W wide on both breakpoints. */}
        <span className="min-w-0 truncate">{selected?.label ?? value}</span>
        {countedOnTrigger > 0 && (
          <span className="flex-shrink-0 tabular-nums">+{countedOnTrigger}</span>
        )}
      </MenuButton>
      {(box || (sheet && open)) && (
        <Menu
          box={box}
          popoverRef={popoverRef}
          closing={closing}
          sheet={sheet ? { heading: 'Model', onClose: close } : undefined}
        >
          {/* The selected set, split into what each part DOES, under
              headings of the same kind the list's own header below wears.
              Two groups rather than one row of chips is the whole
              explanation: the reader's model is under `Ranking` and the
              others are under `Comparing`, so the relationship is
              structural instead of something inferred from a highlight
              (TJ, 2026-09-14). Promoting a compared chip then shows itself
              — the chip moves up into the other group.

              `Comparing` stands with nothing compared, its row holding
              Remove all greyed, the way every menu's reset stands greyed at
              its default (record 0209), so the list does not jump down a
              row under the pointer on the first tick.

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
            {CHIP_GROUPS.map(({ heading, ids }) => (
              <Fragment key={heading}>
                <div className={`${TEXT.overline} px-2.5 pb-1 pt-2`}>{heading}</div>
                <div className="flex flex-wrap items-center gap-1.5 px-2.5 pb-2">
                  {ids.map(renderChip)}
                  {/* Every compared chip's × at once, named for them:
                      each × is `Remove <model>`. At the row's right end,
                      after the last chip, so it never stands between two
                      of them. Out of the toolbar's roving order: a Tab stop
                      of its own after the chips (`onChipKeyDown`). */}
                  {heading === 'Comparing' && (
                    <button
                      ref={removeAllRef}
                      type="button"
                      onClick={removeAll}
                      onKeyDown={onRemoveAllKeyDown}
                      disabled={comparedCount === 0}
                      className={`${CONTROL_SIZE} ${LINK_ACTION} ${FOCUS_RING} ${DISABLED} ml-auto cursor-pointer`}
                    >
                      Remove all
                    </button>
                  )}
                </div>
              </Fragment>
            ))}
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
            className={`${TEXT.overline} flex items-baseline justify-between gap-2 border-b ${SURFACE_DIVIDER} px-2.5 py-1.5`}
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
            className={`${MODEL_ROW.list} min-h-0 flex-1 overflow-y-auto p-1 focus:outline-none ${SCROLL_BARS}`}
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
                // A mouse moves the keyboard's cursor with it, so the arrow
                // keys go on from the row under the pointer. A finger does
                // not: its row is the one it ticks.
                onPointerEnter={(e) => {
                  if (e.pointerType === 'mouse') setActive(i)
                }}
                onClick={(e) => {
                  if (!locked) toggle(model.id, e.shiftKey)
                }}
                className={`${MODEL_ROW.row} ${locked ? 'cursor-default' : 'cursor-pointer'} ${
                  i === active ? MODEL_ROW.keys : ''
                }`}
              >
                {/* Drawn, not announced: `aria-selected` on the row already
                    carries this state, and a focusable input inside a
                    `role="option"` would be a second stop in a list whose
                    whole keyboard model is one element with
                    `aria-activedescendant`. Enter and Space are the keys that
                    toggle it. First in the row, as every checkbox menu's box
                    is (#801). */}
                <input
                  type="checkbox"
                  aria-hidden="true"
                  tabIndex={-1}
                  checked={isSelected}
                  disabled={locked}
                  onChange={(e) => toggle(model.id, e.nativeEvent instanceof MouseEvent && e.nativeEvent.shiftKey)}
                  onClick={(e) => e.stopPropagation()}
                  className={`${CHOICE_INPUT} ${DISABLED} mt-0.5`}
                />
                <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex items-baseline gap-1.5">
                    {/* Whole, never broken across two lines: `NOAA GFS`
                        beside its badge is the widest first line, 255.7px,
                        in a 317px card (record 0134). */}
                    <span className={`${MODEL_ROW.name} whitespace-nowrap`}>
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
              </div>
            )
          })}
          </div>
        </Menu>
      )}
    </>
  )
}
