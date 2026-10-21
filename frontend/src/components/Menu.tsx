import { useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react'
import { createPortal } from 'react-dom'
import type { PopoverBox } from '../utils/listbox'
import { nextActiveIndex, optionDomId } from '../utils/listbox'
import { usePopover } from '../hooks/usePopover'
import { MENU, MENU_CHEVRON, MENU_TRIGGER, SR_ONLY } from '../styles'
import { IconChevron } from './icons'

/**
 * One menu for every control that opens one at a desk (#714; record 0200):
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
  /** Where the card goes, from `usePopover`. */
  box: PopoverBox
  popoverRef: React.RefObject<HTMLDivElement | null>
  /**
   * The overline strip above the rows, for a menu whose contents need naming
   * (Removed rows). A menu that names itself another way (`ModelPicker` heads
   * two groups of chips) passes nothing and draws its own.
   */
  header?: ReactNode
  /** Whether the card is on its way out (`usePopover`'s `closing`), for the exit `MOTION.menu` draws. */
  closing: boolean
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
 */
export default function Menu({ box, popoverRef, header, closing, children }: Props) {
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
      {header !== undefined && <div className={MENU.header}>{header}</div>}
      {children}
    </div>,
    document.body,
  )
}

interface MenuButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-expanded' | 'type'> {
  /** Which of the three trigger shapes (record 0200): a map pill, a panel field, a results-bar button. */
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
 * A control that opens a menu, in one of the three shapes, with the chevron
 * and the hover and open states every trigger shares (`MENU_TRIGGER`,
 * `MENU_CHEVRON`). The shape is the one thing a call site picks; whatever it
 * adds in `className` is layout and width, never a look.
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

export interface MenuOption<V extends string> {
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
}

/**
 * A choice of one value from a short list, as the one menu rather than a
 * native select (record 0200): the chart's metric and the Metrics table's
 * aggregates at a desk. A native select opens the platform's own list, which
 * no stylesheet reaches, so at a desk it was the one menu that looked and
 * behaved like nothing else in the app. A phone keeps the native select,
 * whose picker rises from the bottom like every phone menu (record 0149).
 *
 * The WAI-ARIA listbox pattern, as the model list wears it: the field is a
 * button that opens a `listbox`, the list takes the keyboard when it opens
 * and moves a highlight with `aria-activedescendant`, the arrow keys and Home
 * and End walk it, Enter or Space picks, and Escape, Tab or a press outside
 * closes it with the keyboard back on the field. A pick closes it too, the
 * way a select does. The field is named by the select's old name and the
 * value it shows, so a screen reader hears both.
 */
export function MenuSelect<V extends string>({ label, value, options, onChange, className }: MenuSelectProps<V>) {
  const [open, setOpen] = useState(false)
  const selectedIndex = Math.max(
    options.findIndex((o) => o.value === value),
    0,
  )
  const [active, setActive] = useState(selectedIndex)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const { popoverRef, box, closing } = usePopover({ open, onOpenChange: setOpen, triggerRef, initialFocusRef: listRef })
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
        shape="field"
        open={open}
        aria-haspopup="listbox"
        aria-labelledby={`${nameId} ${valueId}`}
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
      {box && (
        <Menu box={box} popoverRef={popoverRef} closing={closing}>
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
