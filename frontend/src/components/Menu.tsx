import { useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'
import type { PopoverBox } from '../utils/listbox'
import { nextActiveIndex, optionDomId } from '../utils/listbox'
import { usePopover } from '../hooks/usePopover'
import { MENU, MENU_CHEVRON, MENU_TRIGGER, SR_ONLY } from '../styles'
import BottomSheet from './BottomSheet'
import { IconChevron } from './icons'

/**
 * One menu for every control that opens one at a desk (#714; record 0201):
 * the card, the trigger and the list that stands in for a native select.
 *
 * The maintainer found the app's menus behaving five ways, a chart dropdown
 * drawn over its own field, a model list joined to its field, the results
 * bar's lists the width of the whole group and three hovers, and asked for
 * one "Button menu" that they all share. This is it, on top of `usePopover`,
 * which places the card and closes it. The Layers chip's card is the look
 * every menu takes, and the linter's `style-one-menu` check fails a desk
 * menu drawn any other way.
 */

interface Props {
  /** Where the card goes, from `usePopover`; null for a sheet, which places itself. */
  box: PopoverBox | null
  popoverRef: React.RefObject<HTMLDivElement | null>
  /** Whether the card is on its way out (`usePopover`'s `closing`), for the exit `MOTION.menu` draws. */
  closing: boolean
  /**
   * On a phone, the bottom sheet this menu is instead of a card (record
   * 0136), headed by the word of the label its field stands beside, and
   * closed by the sheet's own ways out. A caller with a sheet hands its
   * popover hook a closed menu, so `box` is null.
   */
  sheet?: { heading: string; onClose: () => void; tourAnchor?: string }
  children: ReactNode
}

/**
 * The card every menu stands on: the Layers menu's surface, the stacking
 * order, the fixed box `usePopover` measured, and the portal out to the body.
 *
 * Portalled rather than rendered in place, and the whole reason the box is
 * fixed: the control panel is an `overflow-y-auto` column, so a menu opened
 * from a control near the bottom of it would be clipped at the scroll
 * boundary. A card with no width of its own is its rows' width
 * (`max-content`), which `usePopover` measures to decide which edge of the
 * trigger it lines up with.
 *
 * It owns those decisions so that no component makes them again: the
 * linter's `style-own-menu` check fails a second `position: 'fixed'` or a
 * second copy of the card anywhere under `components/`.
 *
 * On a phone every field menu, the model list, the calendar, the chart's
 * metric and the aggregates, stands in a bottom sheet instead (`sheet`), as
 * every phone menu does (records 0136 and 0252). The choice is made here
 * rather than at each caller so that the rows are written once, inside the
 * one menu, for both.
 */
export default function Menu({ box, popoverRef, closing, sheet, children }: Props) {
  // The rows as one block of the sheet, so its rules fall around the menu
  // rather than between the menu's own parts, which keep their dividers. Set
  // off the screen's bottom edge by the sheet's side inset, where a row of a
  // list sheet ends on it: the calendar's well would stand cut off there.
  if (sheet) {
    return (
      <BottomSheet heading={sheet.heading} onClose={sheet.onClose} tourAnchor={sheet.tourAnchor}>
        <div className="flex flex-col pb-4">{children}</div>
      </BottomSheet>
    )
  }
  if (!box) return null
  return createPortal(
    <div
      ref={popoverRef}
      // Which way the card came in from (`MOTION.menu`): down under its
      // trigger, or up where it had to open above it.
      data-side={box.placement}
      // And whether it is going: the same fade and slide, back towards the
      // trigger, with presses passing through to what is under it.
      data-state={closing ? 'closing' : 'open'}
      style={{
        position: 'fixed',
        ...box.align,
        ...box.offset,
        width: box.width ?? 'max-content',
        minWidth: box.minWidth,
        maxWidth: box.maxWidth,
        maxHeight: box.maxHeight,
      }}
      className={MENU.card}
    >
      {children}
    </div>,
    document.body,
  )
}

interface MenuButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-expanded' | 'type'> {
  /** Which of the three trigger shapes (record 0201): a map pill, a panel field, a results-bar button. */
  shape: keyof typeof MENU_TRIGGER
  /** Whether its menu is out: the chevron points up and the trigger lights. */
  open: boolean
  /**
   * Whether it carries the chevron. A phone's chip and bar button do not,
   * because their sheet rises from below (record 0174).
   */
  chevron?: boolean
  /** The chevron's place where a field's is not the middle of its box: the calendar's first line. */
  chevronClassName?: string
  ref?: Ref<HTMLButtonElement>
}

/**
 * A control that opens a menu or a sheet, in one of the three shapes, with
 * the chevron and every state a trigger has (`MENU_TRIGGER`, `MENU_CHEVRON`,
 * record 0251). The shape is the one thing a call site picks; whatever it adds
 * in `className` is layout and width, never a colour or a state, which the
 * linter's `style-trigger-no-look` fails. Every button with `aria-expanded` in
 * the app is one of these but the message badge (`style-menu-trigger`).
 */
export function MenuButton({ shape, open, chevron = true, chevronClassName, className, children, ref, ...rest }: MenuButtonProps) {
  return (
    <button
      ref={ref}
      type="button"
      aria-expanded={open}
      {...rest}
      className={`${MENU_TRIGGER[shape]}${className ? ` ${className}` : ''}`}
    >
      {children}
      {chevron && <IconChevron up={open} className={chevronClassName ?? MENU_CHEVRON[shape]} />}
    </button>
  )
}

interface MenuOption<V extends string> {
  value: V
  label: string
}

interface MenuSelectProps<V extends string> {
  /** What the choice is called, which a native select carried as its accessible name. */
  label: string
  value: V
  options: readonly MenuOption<V>[]
  onChange: (value: V) => void
  /** The field's width and insets, from the role its call site already wore. */
  className: string
  /** A field of its own, or the left segment of a group that wears the field's look (#499). */
  shape?: 'field' | 'segment'
  /** Out of play, as a Metrics row the window cannot answer is (#803): the field takes no press. */
  disabled?: boolean
  /** A phone: the list opens in a bottom sheet headed by `label`, as the model list does (record 0252). */
  sheet?: boolean
}

/**
 * A choice of one value from a short list, as the one menu rather than a
 * native select (record 0201): the chart's metric and the Metrics table's
 * aggregates. A native select opens the platform's own list, which no
 * stylesheet reaches, so at a desk it was the one menu that looked and
 * behaved like nothing else in the app. A phone kept the native select until
 * 2026-10-30, whose field was then a second control drawn to look like this
 * one and lit its edge where this did not; it opens the one menu's sheet now,
 * as the model list does (record 0252).
 *
 * The WAI-ARIA listbox pattern, as the model list wears it: the field is a
 * button that opens a `listbox`, the list takes the keyboard when it opens
 * and moves a highlight with `aria-activedescendant`, the arrow keys and Home
 * and End walk it, Enter or Space picks, and Escape, Tab or a press outside
 * closes it with the keyboard back on the field. A pick closes it too, the
 * way a select does. The field is named by the select's old name and the
 * value it shows, so a screen reader hears both.
 */
export function MenuSelect<V extends string>({
  label,
  value,
  options,
  onChange,
  className,
  disabled = false,
  shape = 'field',
  sheet = false,
}: MenuSelectProps<V>) {
  const [open, setOpen] = useState(false)
  const selectedIndex = Math.max(
    options.findIndex((o) => o.value === value),
    0,
  )
  const [active, setActive] = useState(selectedIndex)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // Closed to the hook on a phone, whose sheet places and dismisses itself.
  const { popoverRef, box, closing } = usePopover({
    open: open && !sheet,
    onOpenChange: setOpen,
    triggerRef,
    initialFocusRef: listRef,
  })
  const listId = useId()
  const nameId = useId()
  const valueId = useId()

  function openList() {
    setActive(selectedIndex)
    setOpen(true)
  }

  function pick(at: number) {
    const option = options[at]
    setOpen(false)
    if (option && option.value !== value) onChange(option.value)
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    const moved = nextActiveIndex(active, e.key, options.length)
    if (moved !== null) {
      e.preventDefault()
      setActive(moved)
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      pick(active)
    }
  }

  return (
    <>
      <MenuButton
        ref={triggerRef}
        shape={shape}
        open={open}
        aria-haspopup={sheet ? 'dialog' : 'listbox'}
        aria-labelledby={`${nameId} ${valueId}`}
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if (!open && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
            e.preventDefault()
            openList()
          }
        }}
        className={`${className} text-left`}
      >
        <span id={nameId} className={SR_ONLY}>
          {label}
        </span>
        <span id={valueId} className="block min-w-0 truncate">
          {options[selectedIndex]?.label ?? value}
        </span>
      </MenuButton>
      {(box || (sheet && open)) && (
        <Menu
          box={box}
          popoverRef={popoverRef}
          closing={closing}
          sheet={sheet ? { heading: label, onClose: () => setOpen(false) } : undefined}
        >
          <div
            ref={listRef}
            role="listbox"
            aria-label={label}
            aria-activedescendant={options[active] ? optionDomId(listId, options[active].value) : undefined}
            tabIndex={-1}
            onKeyDown={onListKeyDown}
            className={`${MENU.list} focus:outline-none`}
          >
            {options.map((option, i) => (
              <div
                key={option.value}
                id={optionDomId(listId, option.value)}
                role="option"
                aria-selected={option.value === value}
                onPointerEnter={() => setActive(i)}
                onClick={() => pick(i)}
                className={`${MENU.option} ${i === active ? MENU.active : ''} ${
                  option.value === value ? MENU.current : ''
                }`}
              >
                {option.label}
              </div>
            ))}
          </div>
        </Menu>
      )}
    </>
  )
}
