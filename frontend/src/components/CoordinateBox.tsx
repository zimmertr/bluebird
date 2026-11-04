import {
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ChangeEventHandler,
  type ClipboardEventHandler,
  type KeyboardEventHandler,
  type Ref,
} from 'react'
import { COORD_BOX } from '../styles'
import { unreadLines } from '../utils/customDestinations'

interface Props {
  value: string
  onChange: ChangeEventHandler<HTMLTextAreaElement>
  onKeyDown?: KeyboardEventHandler<HTMLTextAreaElement>
  onPaste?: ClipboardEventHandler<HTMLTextAreaElement>
  placeholder: string
  'aria-label': string
  rows: number
  /** The textarea itself, for a caller that hands it the keyboard. */
  ref?: Ref<HTMLTextAreaElement>
}

/**
 * The coordinates box under Coordinate search: the textarea and a gutter that
 * numbers its lines, flagging each line the parse drops (#838, record
 * [0265](../../../docs/decisions/0265-coordinate-box-numbers-and-flags-its-lines.md)).
 *
 * The gutter is a column of numbers beside the textarea rather than an
 * editor, for the cold load's sake (`COORD_BOX`). Wrapping is off, so one line
 * of the box is one line on screen and one number. The gutter is hidden from a
 * screen reader: the caption the section draws under the box says how many
 * lines were not read.
 *
 * It owns no state. The section above it keeps the text, tells a paste from
 * typing through the handlers it passes in, and moves the keyboard here
 * through `ref`.
 */
export default function CoordinateBox({
  value,
  onChange,
  onKeyDown,
  onPaste,
  placeholder,
  'aria-label': ariaLabel,
  rows,
  ref,
}: Props) {
  const areaRef = useRef<HTMLTextAreaElement>(null)
  const gutterRef = useRef<HTMLDivElement>(null)
  useImperativeHandle(ref, () => areaRef.current!, [])
  const unread = unreadLines(value)

  // The gutter scrolls as the textarea does, a copy of its scrollTop on
  // every scroll. A new value can move the textarea's scroll with no scroll
  // event, as a short list replacing a long one clamps it, so each value puts
  // the gutter back as well. Its height needs nothing: the grid row is the
  // textarea's, the resize corner included (`COORD_BOX.gutter`).
  const follow = (area: HTMLTextAreaElement | null) => {
    if (gutterRef.current && area) gutterRef.current.scrollTop = area.scrollTop
  }
  useLayoutEffect(() => {
    if (gutterRef.current && areaRef.current) gutterRef.current.scrollTop = areaRef.current.scrollTop
  }, [value])

  return (
    <div className={COORD_BOX.frame}>
      <div ref={gutterRef} aria-hidden="true" className={COORD_BOX.gutter}>
        {unread.map((flagged, i) => (
          <span key={i} className={flagged ? `${COORD_BOX.line} ${COORD_BOX.flagged}` : COORD_BOX.line}>
            {i + 1}
          </span>
        ))}
      </div>
      <textarea
        ref={areaRef}
        aria-label={ariaLabel}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onScroll={(e) => follow(e.currentTarget)}
        placeholder={placeholder}
        rows={rows}
        wrap="off"
        className={COORD_BOX.area}
      />
    </div>
  )
}
