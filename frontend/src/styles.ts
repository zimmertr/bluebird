/**
 * The control panel's type ramp.
 *
 * Every piece of sidebar text picks one of these roles instead of spelling out
 * its own size, weight and color. That habit is what let the panel drift into
 * three treatments for the same kind of label: rank metrics at 14px against
 * 12px everywhere else, forecast modes semibold slate-300 against regular
 * slate-200, "Show Wildfires" dimmed to slate-400 like it was disabled. None of
 * it was visible in isolation, only when two sections sat side by side.
 *
 * Two sizes, not four. Section headings step up; everything else is the base
 * size and separates by weight and color. `subheading` and `control` share both
 * a size and a color deliberately, so weight alone distinguishes "Elevation
 * range (ft)" from "Peaks" without introducing another size to the panel.
 *
 * Status text is not in the ramp. Warnings, errors and progress lines use the
 * base size with a semantic color (amber, red, sky, green) because there the
 * color carries the meaning, not the hierarchy.
 */
export const TEXT = {
  /** Numbered section headings: "1. Destinations", "3. Result Ranking". */
  section: 'text-sm font-bold uppercase tracking-wider text-slate-400',
  /** Named sub-blocks, and the labels naming a field: "Start", "Max results". */
  subheading: 'text-xs font-semibold text-slate-200',
  /** Anything you read or type in a control: radio labels, inputs, pickers. */
  control: 'text-xs text-slate-200',
  /** Prose that explains a control without being one. */
  helper: 'text-xs italic text-slate-500',
  /** The single call to action, deliberately a step up from the panel body. */
  cta: 'text-sm font-semibold',
  /** Footer attribution and legal links. */
  fineprint: 'text-xs text-slate-600',
  /** Panel identity in the header. Outside the body ramp on purpose. */
  appTitle: 'text-lg font-bold text-white leading-tight',
  appSubtitle: 'text-xs text-slate-400',
} as const

/**
 * The full-width primary action: Analyze, and the modals' dismiss buttons.
 *
 * It had been written out three times and had drifted into two radii, with the
 * coarse-pointer padding on only one of the three. Call sites append their own
 * disabled/layout classes; nothing here is a size or color they should restate.
 */
export const BUTTON_PRIMARY =
  `${TEXT.cta} w-full py-2.5 touch:py-3 rounded-lg transition-colors ` +
  'bg-sky-600 hover:bg-sky-500 text-white'

/**
 * The shared surface under every text-entry control in the panel.
 *
 * Padding stays at the call site: a textarea and a one-line input want
 * different insets, and a second padding utility here would collide with
 * theirs rather than override it.
 */
export const FIELD =
  `${TEXT.control} bg-slate-900 border border-slate-600 rounded ` +
  'focus:outline-none focus:border-sky-500'
