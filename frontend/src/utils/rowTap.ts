/**
 * Whether a press on a results row opens that destination's marker popup
 * (#696; record 0143): a press on the row's own ground does, at both widths,
 * and a press on a control inside it does only what that control does. The
 * chart box, the remove, the name's fly-to and its external map link, a
 * Windy link in a metric cell and a footnote mark all keep their behaviour,
 * so a reader who meant one of them never gets a popup as well.
 *
 * Read off the element the press landed on rather than off the controls one
 * by one, so a control a later change adds to a cell is excluded without
 * anyone remembering to. A press that ends a text selection is a reader
 * copying a name or a number, and opens nothing either.
 */
export const ROW_CONTROLS = 'a, button, input, select, textarea, label, summary, [role="button"]'

export function rowTapOpens(target: EventTarget | null, row: Element, selection = ''): boolean {
  if (selection !== '') return false
  if (!(target instanceof Element) || !row.contains(target)) return false
  const control = target.closest(ROW_CONTROLS)
  return control === null || !row.contains(control)
}
