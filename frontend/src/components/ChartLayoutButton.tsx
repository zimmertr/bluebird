import { useRef, useState } from 'react'
import { usePopover } from '../hooks/usePopover'
import Menu, { MenuButton } from './Menu'
import { CHART_LAYOUT } from '../styles'
import { type ChartLayout, LAYOUT_LABEL, LAYOUT_NAMES, layoutsFor, rowsOf } from '../utils/chart/chartLayout'

/**
 * A layout's shape in miniature: its rows of panels as blocks, the same 12
 * tracks wide whatever a row holds, so one over three reads as one bar over
 * three blocks.
 */
function Thumb({ layout, count }: { layout: ChartLayout; count: number }) {
  const rows = rowsOf(layout, count)
  return (
    <span aria-hidden="true" className={CHART_LAYOUT.thumb} style={{ gridTemplateRows: `repeat(${rows.length}, 1fr)` }}>
      {rows.flatMap((n, r) =>
        Array.from({ length: n }, (_, c) => (
          <i
            key={`${r}-${c}`}
            className={CHART_LAYOUT.cell}
            style={{ gridRow: r + 1, gridColumn: `${c * (12 / n) + 1} / span ${12 / n}` }}
          />
        )),
      )}
    </span>
  )
}

/**
 * The Panel layout button after the picker row's + (#499; TJ 2026-10-30,
 * option A of three mockups): a square wearing the current layout's shape,
 * opening the app's one menu card with every layout the panel count offers.
 * A press on one rearranges the panels and closes the card.
 */
export default function ChartLayoutButton({
  layout,
  count,
  onLayout,
}: {
  layout: ChartLayout
  count: number
  onLayout: (layout: ChartLayout) => void
}) {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const { popoverRef, box, closing } = usePopover({ open, onOpenChange: setOpen, triggerRef })
  return (
    <>
      <MenuButton
        ref={triggerRef}
        shape="square"
        open={open}
        chevron={false}
        aria-label={LAYOUT_LABEL}
        aria-haspopup="true"
        onClick={() => setOpen((o) => !o)}
      >
        <Thumb layout={layout} count={count} />
      </MenuButton>
      {box && (
        <Menu box={box} popoverRef={popoverRef} closing={closing}>
          <div role="group" aria-label={LAYOUT_LABEL} className={CHART_LAYOUT.menu}>
            {layoutsFor(count).map((l) => (
              <button
                key={l}
                type="button"
                aria-label={LAYOUT_NAMES[l]}
                aria-pressed={l === layout}
                onClick={() => {
                  onLayout(l)
                  setOpen(false)
                }}
                className={`${CHART_LAYOUT.option} ${l === layout ? CHART_LAYOUT.current : CHART_LAYOUT.idle}`}
              >
                <Thumb layout={l} count={count} />
              </button>
            ))}
          </div>
        </Menu>
      )}
    </>
  )
}
