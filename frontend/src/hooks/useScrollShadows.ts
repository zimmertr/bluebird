import { useEffect, type RefObject } from 'react'

// Where scroll-driven animations exist, index.css draws the shadows alone and
// this does nothing. Read once: support does not change under a running page.
const CSS_ONLY =
  typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('animation-timeline: scroll()')

/**
 * The scroll shadows' fallback (#697): marks a scroll container with
 * `data-more-above` and `data-more-below` while content continues past that
 * edge, for the browsers without `animation-timeline`, whose index.css rules
 * read the two attributes instead. Re-measured on scroll and on any resize of
 * the container or its content, since a section opening changes what is below.
 */
export function useScrollShadows(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current
    if (CSS_ONLY || !el) return
    const update = () => {
      const above = el.scrollTop > 0
      const below = el.scrollTop + el.clientHeight < el.scrollHeight - 1
      el.toggleAttribute('data-more-above', above)
      el.toggleAttribute('data-more-below', below)
    }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update)
    observer?.observe(el)
    for (const child of Array.from(el.children)) observer?.observe(child)
    return () => {
      el.removeEventListener('scroll', update)
      observer?.disconnect()
    }
  }, [ref])
}
