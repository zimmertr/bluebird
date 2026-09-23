import type { ReactNode } from 'react'
import { EXTERNAL_LINK } from '../iconPaths'
import { ICON, ICON_ADORNMENT } from '../styles'

/**
 * Every glyph the app draws (#386).
 *
 * Before this module the nineteen `<svg>` elements under `src/` each answered
 * the same three questions for themselves, and they had stopped agreeing: the
 * close cross existed six times at three sizes and two stroke weights, two of
 * the six were readable by a screen reader that should have skipped them, and
 * the select arrow's path was typed out three times. An icon is a style
 * decision, so the size comes from the `ICON` ramp in `styles.ts` and the call
 * site never spells one.
 *
 * Two rules hold across the file:
 *
 * - **Every glyph is `aria-hidden`.** Each one stands inside a control that
 *   already carries its own `aria-label`, so an icon that reaches the
 *   accessibility tree can only announce a second time. The linter's
 *   `glyphs-hidden` check fails an `<svg` here without the attribute.
 * - **`className` carries position and colour, never size.** A call site says
 *   where the glyph sits (`ICON_ADORNMENT`, `flex-shrink-0`) and what colour it
 *   reaches for (`ICON_ACTION`); the step is this module's. The linter's
 *   `style-call-site-classes` check fails a height or width utility passed to
 *   one of these.
 *
 * Attributes below are per icon rather than shared through one base component.
 * They genuinely differ — three viewBox grids, two stroke weights, and line
 * caps that are round on the crosses and square on the map's menu bars — and a
 * base that took defaults would have quietly restyled six glyphs to unify the
 * one that repeats.
 */
interface IconProps {
  /** Position and colour only. The size is the `ICON` ramp's. */
  className?: string
}

const join = (size: string, className?: string): string =>
  className ? `${size} ${className}` : size

/**
 * The close cross, at three steps: a control (16), a chip (12), and the
 * notice's dismiss disc (10).
 *
 * Two lines rather than the `×` character. That glyph is centred on the font's
 * own maths and not on the button's, so it sits visibly high in a round target
 * however the line-height is nudged, and it moves again with any font change.
 * Two lines in a square viewBox are centred by construction.
 */
export function IconClose({
  size = 'control',
  className,
}: IconProps & { size?: keyof typeof ICON }): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={join(ICON[size], className)}
      aria-hidden="true"
    >
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  )
}

/** The collapse affordance on the results panels' header bars. */
export function IconChevron({ up, className }: IconProps & { up: boolean }): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={join(ICON.control, className)}
      aria-hidden="true"
    >
      <polyline points={up ? '18 15 12 9 6 15' : '6 9 12 15 18 9'} />
    </svg>
  )
}

/**
 * The arrow a `SELECT` reserves its right-hand room for.
 *
 * It carries `ICON_ADORNMENT` itself: all three dropdowns in the app place it
 * the same way, and the reserve `SELECT` budgets is measured off that one
 * offset plus this one step.
 */
export function IconSelectArrow(): ReactNode {
  return (
    <svg
      className={`${ICON_ADORNMENT} ${ICON.control}`}
      viewBox="0 0 20 20"
      fill="currentColor"
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.17l3.71-3.94a.75.75 0 1 1 1.08 1.04l-4.25 4.5a.75.75 0 0 1-1.08 0l-4.25-4.5a.75.75 0 0 1 .02-1.06Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

/** The map's Controls button: three bars, the standing picture for a panel. */
export function IconMenu({ className }: IconProps): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={join(ICON.control, className)}
      aria-hidden="true"
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  )
}

/** The map's Layers button: a sheet with a second one under it. */
export function IconLayers({ className }: IconProps): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      className={join(ICON.control, className)}
      aria-hidden="true"
    >
      <polygon points="12,3 21,8 12,13 3,8" />
      <polyline points="3,13 12,18 21,13" />
    </svg>
  )
}

/**
 * The results bar's three modes. They are the app's only glyphs drawn on a
 * 16-unit grid at a lighter stroke, which is what lets a diagram of a table
 * carry two interior rules inside a 16px box without them closing up.
 */
export function IconTable({ className }: IconProps): ReactNode {
  return (
    <svg
      viewBox="0 0 16 16"
      strokeWidth={1.5}
      stroke="currentColor"
      fill="none"
      className={join(ICON.control, className)}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="12" height="12" />
      <line x1="2" y1="6" x2="14" y2="6" />
      <line x1="2" y1="10" x2="14" y2="10" />
    </svg>
  )
}

/** The chart half of that switch. */
export function IconChart({ className }: IconProps): ReactNode {
  return (
    <svg
      viewBox="0 0 16 16"
      strokeWidth={1.5}
      stroke="currentColor"
      fill="none"
      className={join(ICON.control, className)}
      aria-hidden="true"
    >
      <polyline points="2,12 6,6 9,9 14,3" />
    </svg>
  )
}

/** Both of them, stacked the way the panels are. */
export function IconChartTable({ className }: IconProps): ReactNode {
  return (
    <svg
      viewBox="0 0 16 16"
      strokeWidth={1.5}
      stroke="currentColor"
      fill="none"
      className={join(ICON.control, className)}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="12" height="5.5" />
      <line x1="8" y1="7.5" x2="8" y2="14" />
      <rect x="2" y="7.5" width="12" height="6.5" />
    </svg>
  )
}

/** The magnifier in the map's search field. */
export function IconSearch({ className }: IconProps): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={join(ICON.control, className)}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.5" y2="16.5" />
    </svg>
  )
}

/**
 * The mark on a link that leaves the app, in the results table.
 *
 * The warning it stands for is the anchor's `aria-label`, not this glyph:
 * the linter's `new-tab-anchors-named` check holds every new-tab anchor in that
 * table to a label ending "Opens in a new tab."
 *
 * The one glyph whose shape is not spelled here. The map popup draws it too,
 * out of a string this module cannot reach, so both sides read it from
 * `iconPaths.ts` (#435).
 */
export function IconExternalLink({ className }: IconProps): ReactNode {
  return (
    <svg
      viewBox={EXTERNAL_LINK.viewBox}
      fill="none"
      stroke="currentColor"
      strokeWidth={EXTERNAL_LINK.strokeWidth}
      strokeLinecap={EXTERNAL_LINK.linecap}
      strokeLinejoin={EXTERNAL_LINK.linejoin}
      className={join(ICON.inline, className)}
      aria-hidden="true"
    >
      <path d={EXTERNAL_LINK.frame} />
      <polyline points={EXTERNAL_LINK.head} />
      <line
        x1={EXTERNAL_LINK.shaft.x1}
        y1={EXTERNAL_LINK.shaft.y1}
        x2={EXTERNAL_LINK.shaft.x2}
        y2={EXTERNAL_LINK.shaft.y2}
      />
    </svg>
  )
}

/** The timeline transport's one button, which is two glyphs in one box. */
export function IconPlay({ playing, className }: IconProps & { playing: boolean }): ReactNode {
  return (
    <svg
      viewBox="0 0 10 10"
      fill="currentColor"
      className={join(ICON.micro, className)}
      aria-hidden="true"
    >
      {playing ? (
        <>
          <rect x="1" y="0" width="3" height="10" />
          <rect x="6" y="0" width="3" height="10" />
        </>
      ) : (
        <path d="M1,0 L10,5 L1,10 Z" />
      )}
    </svg>
  )
}

/** Two columns of dots: the standing picture for "drag this". */
export function IconGrip({ className }: IconProps): ReactNode {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      className={join(ICON.control, className)}
      aria-hidden="true"
    >
      <circle cx="6" cy="4" r="1.3" />
      <circle cx="10" cy="4" r="1.3" />
      <circle cx="6" cy="8" r="1.3" />
      <circle cx="10" cy="8" r="1.3" />
      <circle cx="6" cy="12" r="1.3" />
      <circle cx="10" cy="12" r="1.3" />
    </svg>
  )
}
