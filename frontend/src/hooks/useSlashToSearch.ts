import { useEffect, useLayoutEffect, useRef } from 'react'

/** Whether a key went to something that types, where `/` is a character. */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

/**
 * A desk's `/` opens the Where card with its search field holding the
 * keyboard (record 0313), the key every map and search page reads as
 * "search". Search lives in the card rather than on the map, so the key is
 * what keeps it one press away.
 *
 * `open` shows the card; `focus` puts the keyboard in its field and says
 * whether the field was there to take it. The field mounts with the card a
 * render later, so the focus waits for the first commit that has it.
 */
export function useSlashToSearch(enabled: boolean, open: () => void, focus: () => boolean) {
  const pending = useRef(false)
  const latest = useRef({ open, focus })
  latest.current = { open, focus }

  useEffect(() => {
    if (!enabled) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return
      e.preventDefault()
      pending.current = true
      latest.current.open()
      if (latest.current.focus()) pending.current = false
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [enabled])

  // No dependency list: the card's commit is a render of the caller's, and
  // nothing else here says when it lands.
  useLayoutEffect(() => {
    if (pending.current && latest.current.focus()) pending.current = false
  })
}
