import { IconChevron } from './icons'
import { ROW_DISCLOSURE } from '../styles'

/**
 * Opens and shuts content in place (TJ, 2026-11-21): a compact row's facts
 * and profile (record 0327), which a press on the row's ground also opens.
 * The row's way in for a keyboard and a screen reader, which the row itself
 * is not. A disclosure rather than a menu trigger, so it is not a
 * `MenuButton`: nothing unfurls over the page, the content below it grows.
 */
export default function DisclosureButton({
  expanded,
  onToggle,
  label,
}: {
  expanded: boolean
  onToggle: () => void
  label: string
}) {
  return (
    <button type="button" aria-expanded={expanded} aria-label={label} onClick={onToggle} className={ROW_DISCLOSURE.button}>
      <IconChevron up={expanded} />
    </button>
  )
}
