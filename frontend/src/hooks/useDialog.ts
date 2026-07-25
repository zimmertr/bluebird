import { useEffect, useRef } from 'react'

// Dialog accessibility in one hook: focus moves into the panel when it opens
// (and back where it was on close), Escape closes, and Tab cycles inside the
// panel instead of escaping to the page behind the backdrop. Pair with
// role="dialog" aria-modal="true" and an aria-labelledby on the panel —
// without these, assistive tech never learns a modal opened at all.
export function useDialog(onClose: () => void) {
  const panelRef = useRef<HTMLDivElement>(null)
  // Latest-close ref so the mount-once effect never re-runs (re-running would
  // steal focus back to the panel on every parent render).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const previous = document.activeElement as HTMLElement | null
    panel.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
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
      previous?.focus()
    }
  }, [])

  return panelRef
}
