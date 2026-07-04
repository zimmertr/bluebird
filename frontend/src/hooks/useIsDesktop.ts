import { useEffect, useState } from 'react'

// Matches Tailwind's `lg` breakpoint. Below this we switch the sidebar to an
// off-canvas drawer and the results panel to a fixed-height sheet; the layout
// itself is driven by Tailwind `lg:` classes, but a few JS-side decisions
// (mouse-only resize drag, inline panel height) need to know the breakpoint too.
const DESKTOP_QUERY = '(min-width: 1024px)'

export function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(DESKTOP_QUERY).matches : true,
  )

  useEffect(() => {
    const mq = window.matchMedia(DESKTOP_QUERY)
    const onChange = () => setIsDesktop(mq.matches)
    mq.addEventListener('change', onChange)
    setIsDesktop(mq.matches)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  return isDesktop
}
