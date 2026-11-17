import { useLayoutEffect, useState, type RefObject } from 'react'
import { cardChips, type CardChips } from '../utils/results/resultsSheet'

const BESIDE: CardChips = { side: 'beside' }

function same(a: CardChips, b: CardChips): boolean {
  if (a.side === 'beside' || b.side === 'beside') return a.side === b.side
  return a.cardPx === b.cardPx && a.menuPx === b.menuPx
}

/**
 * Where the chip row stands around a desk's open controls card (record
 * 0305): under it while the legend's card has room there, beside it while
 * it has not (`cardChips`). `stackRef` is the map's stack of rows, whose
 * first child is the card and whose offset parent is the map's own box.
 *
 * Measured, because the card is as tall as the section open in it and the
 * map as tall as the results under it leave: both boxes are watched, with
 * the window's height, and the answer is kept only when it changes, so a
 * results pane moving the map's foot a pixel a frame renders the rows once,
 * where the row changes sides. Read before the first paint, so an open card never draws its chips
 * on the wrong side. Null while no card is open.
 */
export function useCardChips(stackRef: RefObject<HTMLElement | null>, cardOpen: boolean): CardChips | null {
  const [chips, setChips] = useState<CardChips>(BESIDE)
  useLayoutEffect(() => {
    const stack = stackRef.current
    const card = stack?.firstElementChild
    const map = stack?.offsetParent
    if (!cardOpen || !stack || !card || !map) return
    const read = () => {
      const belowPx = window.innerHeight - map.getBoundingClientRect().top
      const next = cardChips(map.clientHeight, Math.round(card.getBoundingClientRect().height), Math.round(belowPx))
      setChips((was) => (same(was, next) ? was : next))
    }
    read()
    // The window's height bounds a chip's menu, and can change with no box
    // here changing: a map held at its floor keeps its height.
    window.addEventListener('resize', read)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(read)
    observer?.observe(card)
    observer?.observe(map)
    return () => {
      window.removeEventListener('resize', read)
      observer?.disconnect()
    }
  }, [stackRef, cardOpen])
  return cardOpen ? chips : null
}
