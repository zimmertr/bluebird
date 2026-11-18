import { type ReactNode, useId } from 'react'
import { CHEVRON, EXTERNAL_LINK } from '../iconPaths'
import { ICON } from '../styles'
import { type AgeBandHours, STARBURST_INNER, starburst } from '../utils/fireActivity'

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

/**
 * The collapse affordance on the results panels' header bars, and every menu
 * trigger's open or shut cue (`MENU_CHEVRON`, record 0201): a chip's, a
 * results-bar button's and a field's, where it took the filled select
 * arrow's place, so one glyph says "this opens" everywhere.
 */
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
      <polyline points={up ? CHEVRON.up : CHEVRON.down} />
    </svg>
  )
}

/**
 * The fold on a group of rows inside a menu (#848): it points at the heading
 * while the group is shut and down at its rows while it is open. The chevron's
 * own stroke at the chip step, pointing right rather than up, because a
 * trigger's chevron says "this opens a card" and this says "these rows are
 * folded", and the two stand in one card.
 */
export function IconFold({ open, className }: IconProps & { open: boolean }): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={join(ICON.chip, className)}
      aria-hidden="true"
    >
      <polyline points={open ? CHEVRON.down : '9 6 15 12 9 18'} />
    </svg>
  )
}

/**
 * The star on a row of the Search by list menu (#848): an outline until the
 * list is starred, then filled. The fill is the state, so the two read apart
 * without their colour.
 */
export function IconStar({ filled, className }: IconProps & { filled: boolean }): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      className={join(ICON.inline, className)}
      aria-hidden="true"
    >
      <polygon points="12 3 14.7 8.8 21 9.6 16.4 14 17.6 20.3 12 17.2 6.4 20.3 7.6 14 3 9.6 9.3 8.8" />
    </svg>
  )
}

/** The mark on a button that says what its row is (#848): an i in a ring. */
export function IconInfo({ className }: IconProps): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={join(ICON.inline, className)}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <line x1="12" y1="11" x2="12" y2="16.5" />
      <line x1="12" y1="7.5" x2="12" y2="7.5" />
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

// The sun's and the moon's marks on the 24-unit grid, drawn once: their own
// glyphs wear them, and so does System's, smaller (#843).
const SUN_MARKS = (
  <>
    <circle cx="12" cy="12" r="4" />
    <line x1="12" y1="2" x2="12" y2="4" />
    <line x1="12" y1="20" x2="12" y2="22" />
    <line x1="2" y1="12" x2="4" y2="12" />
    <line x1="20" y1="12" x2="22" y2="12" />
    <line x1="4.93" y1="4.93" x2="6.34" y2="6.34" />
    <line x1="17.66" y1="17.66" x2="19.07" y2="19.07" />
    <line x1="4.93" y1="19.07" x2="6.34" y2="17.66" />
    <line x1="17.66" y1="6.34" x2="19.07" y2="4.93" />
  </>
)
const MOON_MARK = <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />

/**
 * The theme menu's three glyphs (#706, #843), each the choice it names, on
 * the menu's trigger and beside its row: a sun for Light, a moon for Dark,
 * and the two of them split by a diagonal for System. Drawn on the Layers
 * glyph's grid and stroke, round-capped like the close cross they stand
 * beside in the panel header.
 */
export function IconSun({ className }: IconProps): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      className={join(ICON.control, className)}
      aria-hidden="true"
    >
      {SUN_MARKS}
    </svg>
  )
}

/** Dark, in the theme menu: a crescent. */
export function IconMoon({ className }: IconProps): ReactNode {
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
      {MOON_MARK}
    </svg>
  )
}

// System's two halves: the sun's and the moon's own marks at 42%, each
// centred in its corner of the diagonal, with as much room to the divider as
// to the glyph's edge (the maintainer, 2026-11-16: "exactly the same icons
// ... just smaller", "centered in each corner, not hugging the divider").
// Their stroke is held at 1.5 units rather than scaled with them, or it would
// thin to 0.84 and vanish at 16px; the divider wears the same 1.5.
const SPLIT_SCALE = 0.42
const SPLIT_STROKE = 1.5
const splitCorner = (at: number) =>
  `translate(${at} ${at}) scale(${SPLIT_SCALE}) translate(-12 -12)`

/**
 * System, in the theme menu (#843): the Light sun top left and the Dark moon
 * bottom right of a diagonal, so it reads as both themes with the device
 * deciding. One ink like every other glyph. The maintainer picked it in a
 * lab over a monitor, a half-filled circle, a filled moon and a two-tone disc
 * (2026-11-16).
 */
export function IconSunMoon({ className }: IconProps): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={SPLIT_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={join(ICON.control, className)}
      aria-hidden="true"
    >
      <g transform={splitCorner(7)} strokeWidth={SPLIT_STROKE / SPLIT_SCALE}>
        {SUN_MARKS}
      </g>
      <g transform={splitCorner(17)} strokeWidth={SPLIT_STROKE / SPLIT_SCALE}>
        {MOON_MARK}
      </g>
      <line x1="20.5" y1="3.5" x2="3.5" y2="20.5" />
    </svg>
  )
}

/**
 * The results bar's three modes. They and the bar's four buttons below are the
 * app's only glyphs drawn on a 16-unit grid at a lighter stroke, which is what lets a diagram of a table
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

/**
 * The forecast grid's Smooth style: one field fading across the square, the
 * way the smooth grid paints between its samples. The fade is the glyph's own
 * colour at two strengths, so it follows the control's ink in both themes.
 */
export function IconGridSmooth({ className }: IconProps): ReactNode {
  const id = useId()
  return (
    <svg viewBox="0 0 16 16" fill="none" className={join(ICON.chip, className)} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="currentColor" stopOpacity="1" />
          <stop offset="1" stopColor="currentColor" stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="14" height="14" rx="2" fill={`url(#${id})`} />
    </svg>
  )
}

/**
 * The forecast grid's Blocks style: four cells at three strengths, the way
 * the block grid paints one value per sample.
 */
export function IconGridBlocks({ className }: IconProps): ReactNode {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" className={join(ICON.chip, className)} aria-hidden="true">
      <rect x="1" y="1" width="6.5" height="6.5" rx="1" />
      <rect x="8.5" y="1" width="6.5" height="6.5" rx="1" opacity="0.55" />
      <rect x="1" y="8.5" width="6.5" height="6.5" rx="1" opacity="0.55" />
      <rect x="8.5" y="8.5" width="6.5" height="6.5" rx="1" opacity="0.2" />
    </svg>
  )
}

/**
 * The chart half of that switch, and a Metrics row's chart toggle (record
 * 0290), whose pressed state fills under the line: the fill is the state, so
 * the two read apart without their colour, as the star's do.
 */
export function IconChart({ filled = false, className }: IconProps & { filled?: boolean }): ReactNode {
  return (
    <svg
      viewBox="0 0 16 16"
      strokeWidth={1.5}
      stroke="currentColor"
      fill="none"
      className={join(ICON.control, className)}
      aria-hidden="true"
    >
      {filled && <polygon points="2,12 6,6 9,9 14,3 14,14 2,14" fill="currentColor" stroke="none" opacity="0.45" />}
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

/**
 * The results bar's Columns button (#687): the table glyph turned on its side,
 * the columns being what it picks.
 */
export function IconColumns({ className }: IconProps): ReactNode {
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
      <line x1="6" y1="2" x2="6" y2="14" />
      <line x1="10" y1="2" x2="10" y2="14" />
    </svg>
  )
}

/** The results bar's Models button: one sheet over another, more than one forecast. */
export function IconModels({ className }: IconProps): ReactNode {
  return (
    <svg
      viewBox="0 0 16 16"
      strokeWidth={1.5}
      stroke="currentColor"
      fill="none"
      className={join(ICON.control, className)}
      aria-hidden="true"
    >
      <rect x="2" y="5" width="9" height="9" />
      <polyline points="5,5 5,2 14,2 14,11 11,11" />
    </svg>
  )
}

/** The results bar's Removed button: an arrow turning back, the way a row returns. */
export function IconRestore({ className }: IconProps): ReactNode {
  return (
    <svg
      viewBox="0 0 16 16"
      strokeWidth={1.5}
      stroke="currentColor"
      fill="none"
      className={join(ICON.control, className)}
      aria-hidden="true"
    >
      <path d="M3.5 8a4.5 4.5 0 1 0 1.3-3.2" />
      <polyline points="4.5,1.8 4.5,5 7.7,5" />
    </svg>
  )
}

/** The results bar's Download CSV button: an arrow down onto a line. */
export function IconDownload({ className }: IconProps): ReactNode {
  return (
    <svg
      viewBox="0 0 16 16"
      strokeWidth={1.5}
      stroke="currentColor"
      fill="none"
      className={join(ICON.control, className)}
      aria-hidden="true"
    >
      <line x1="8" y1="2" x2="8" y2="10" />
      <polyline points="4.5,6.5 8,10 11.5,6.5" />
      <line x1="2" y1="13.5" x2="14" y2="13.5" />
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

// The three kinds of destination the Destinations section adds (record
// 0306), on its chips and its two add buttons: a list, an area, a place. Each
// takes a size, the chip's step on a chip and the control's on a button.

/** A list: rows of points, the ready-made lists and the reader's own coordinates. */
export function IconList({ size = 'control', className }: IconProps & { size?: keyof typeof ICON }): ReactNode {
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
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
      <line x1="4.5" y1="6" x2="4.5" y2="6" />
      <line x1="4.5" y1="12" x2="4.5" y2="12" />
      <line x1="4.5" y1="18" x2="4.5" y2="18" />
    </svg>
  )
}

/** An area: a drawn shape, the outline Search by area makes. */
export function IconArea({ size = 'control', className }: IconProps & { size?: keyof typeof ICON }): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      className={join(ICON[size], className)}
      aria-hidden="true"
    >
      <polygon points="5,8 13,4 20,9 17,19 7,20" />
    </svg>
  )
}

/** A place: one destination, searched by name or picked on the map. */
export function IconPin({ size = 'control', className }: IconProps & { size?: keyof typeof ICON }): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinejoin="round"
      className={join(ICON[size], className)}
      aria-hidden="true"
    >
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  )
}

/** A plus: add one more of what stands beside it (the chart's panels, #499). */
export function IconPlus({ size = 'control', className }: IconProps & { size?: keyof typeof ICON }): ReactNode {
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
      <line x1="12" y1="6" x2="12" y2="18" />
      <line x1="6" y1="12" x2="18" y2="12" />
    </svg>
  )
}

/** Two columns of dots: the standing picture for "drag this". */
/** A pinned chart card's corner grip: two strokes that size the card. */
export function IconResizeCorner({ className }: IconProps): ReactNode {
  return (
    <svg viewBox="0 0 10 10" className={join('h-full w-full', className)} aria-hidden="true">
      <path d="M9 3 3 9M9 6 6 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

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

// The fire key's starburst in the 16-unit box, a unit to a pixel of the
// 16px chip: its points at 7.58, so the 0.8 rim round them reaches the box's
// edge and no further.
const FIRE_AGE_STAR = starburst(7.58, STARBURST_INNER.chip, 8, 8)
  .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
  .join(' ')

// Each band's hour as centrelines in that box, stroked 1 unit wide: a
// geometric, condensed face of four digits, 8.5 tall and 3.4 wide with 0.8
// between them, a narrow 1 with a flag and no foot, a 2 on a round bowl, a
// closed 4 and an 8 of two stacked ellipses, the smaller on top. Drawn in the
// icon labs of 2026-10-29 and picked from sixteen variants for reading on a
// 1x screen (record 0246); paths rather than text, so the digits are part of
// the drawing and no face the browser picks can change them.
const FIRE_AGE_NUMERALS: Record<AgeBandHours, string> = {
  12: 'M5.13 6.2L6.52 4.25V12.25M8.32 5.6A1.2 1.2 0 0 1 10.72 5.45C10.72 7.55 8.92 10.1 8.32 11.75H11.22',
  24: 'M4.7 5.6A1.2 1.2 0 0 1 7.1 5.45C7.1 7.55 5.3 10.1 4.7 11.75H7.6M10.82 12.25V3.95L8.9 9.5H11.8',
  48: 'M6.62 12.25V3.95L4.7 9.5H7.6M9.07 6.01A1.03 1.76 0 1 0 11.13 6.01A1.03 1.76 0 1 0 9.07 6.01M8.9 9.76A1.2 1.99 0 1 0 11.3 9.76A1.2 1.99 0 1 0 8.9 9.76',
}

/**
 * The fire activity key's icon for one age band (#799): the starburst the
 * map draws each detection as, its body in the layer's ink with a rim in the
 * band's fill, and the hour the band ends at drawn in the same fill on the
 * body. It fills the box it stands in, since `SWATCH_STAR` sizes the chip;
 * its two colours are the band's and the layer's, from
 * `utils/fireActivity.ts`, rather than `currentColor`, because they are data.
 */
export function IconFireAge({
  hours,
  fill,
  ink,
  className,
}: IconProps & { hours: AgeBandHours; fill: string; ink: string }): ReactNode {
  return (
    <svg viewBox="0 0 16 16" className={join('h-full w-full', className)} aria-hidden="true">
      <polygon points={FIRE_AGE_STAR} fill={ink} stroke={fill} strokeWidth={0.8} strokeLinejoin="round" />
      <path d={FIRE_AGE_NUMERALS[hours]} fill="none" stroke={fill} strokeWidth={1} />
    </svg>
  )
}
