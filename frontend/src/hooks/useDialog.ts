import { useEffect, useRef } from 'react'

// The dialogs holding the keyboard, innermost last. A sheet opened from inside
// the Controls sheet (the model list, the calendar) stands over it, and both
// listen on the document, so only the top one answers a key: without that,
// Escape in the model list closed the Controls sheet under it too (record
// 0207).
const open: object[] = []

// Dialog accessibility in one hook: focus moves into the panel when it opens
// (and back where it was on close), Escape and Enter close, and Tab cycles
// inside the panel instead of escaping to the page behind the backdrop. Pair
// with role="dialog" aria-modal="true" and an aria-labelledby on the panel —
// without these, assistive tech never learns a modal opened at all.
//
// `active` false leaves the keyboard where it is and listens for nothing: a
// sheet the tutorial holds open behind its own card, which has the keyboard
// (#696), and the Controls sheet while it is shut, since it never unmounts.
export function useDialog(onClose: () => void, active = true) {
  const panelRef = useRef<HTMLDivElement>(null)
  // Latest-close ref so the effect never re-runs on a new callback (re-running
  // would steal focus back to the panel on every parent render).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const panel = panelRef.current
    if (!panel || !active) return
    const self = {}
    open.push(self)
    const held = document.activeElement as HTMLElement | null
    // A panel that already holds the keyboard keeps it where it is: the
    // tutorial hands the Controls sheet's Tutorial link back the keyboard as
    // it ends, in the commit that makes the sheet modal again. Where it goes
    // back on close is then unknown, and nothing is put back.
    const inside = held !== null && panel.contains(held)
    const previous = inside ? null : held
    // Without scrolling: the Controls sheet takes the keyboard in the commit
    // that starts it sliding up from below the screen, and a bare focus
    // scrolls the app's column to reach it (`takeOrphanedFocus` has the
    // measurement).
    if (!inside) panel.focus({ preventScroll: true })

    function onKeyDown(e: KeyboardEvent) {
      if (open[open.length - 1] !== self) return
      if (e.key === 'Escape') {
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      // Enter dismisses too. The panel itself takes focus when a dialog opens,
      // so without this the most obvious key on the keyboard does nothing at
      // all to a dialog that is purely something to read.
      //
      // Guarded rather than unconditional, because this hook is shared and the
      // next dialog may not be read-only: an element that already does
      // something with Enter keeps it. A button or link would fire its own
      // action and then be dismissed underneath itself, and a field would lose
      // a submit or a newline. What is left is Enter pressed against the panel
      // or its prose, which is the "I have read this" gesture.
      if (e.key === 'Enter') {
        const el = document.activeElement
        const tag = el?.tagName
        if (
          tag === 'INPUT' ||
          tag === 'TEXTAREA' ||
          tag === 'SELECT' ||
          tag === 'BUTTON' ||
          tag === 'A' ||
          (el as HTMLElement | null)?.isContentEditable
        ) {
          return
        }
        e.stopPropagation()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !panel) return
      const focusables = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      open.splice(open.indexOf(self), 1)
      // Back where it was, unless the keyboard has gone somewhere of the
      // reader's or the tour's choosing meanwhile: a sheet that unmounted
      // left it on the body, and one that went inert left it inside.
      const now = document.activeElement
      if (!now || now === document.body || panel.contains(now)) previous?.focus()
    }
    // Keyed on `active` alone: a menu sheet does not change hands while open,
    // and the Controls sheet, which stays mounted, turns modal as it opens and
    // stops as it shuts or as the tutorial takes the keyboard.
  }, [active])

  return panelRef
}
