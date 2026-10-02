import type { MouseEvent } from 'react'
import { SKIP_LINK } from '../styles'

/**
 * The page's first Tab stop (#576): past the panel's controls to the map, which
 * a keyboard otherwise reached only after every one of them.
 *
 * A real link to the target's id, so it is a link to a screen reader, but the
 * press moves the focus itself rather than following the fragment: a `#` in
 * the address bar would ride into every link the reader copies afterwards.
 */
export default function SkipLink({ targetId }: { targetId: string }) {
  function skip(e: MouseEvent<HTMLAnchorElement>) {
    e.preventDefault()
    document.getElementById(targetId)?.focus()
  }
  return (
    <a href={`#${targetId}`} onClick={skip} className={SKIP_LINK}>
      Skip to map
    </a>
  )
}
