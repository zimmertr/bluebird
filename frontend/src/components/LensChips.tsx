import { LENSES, type Lens } from '../utils/score/lenses'
import { RESULTS_HEAD } from '../styles'

// What each lens is called on screen (record 0307). Strings in the PR's
// table for the maintainer's approval.
export const LENS_LABEL: Readonly<Record<Lens, string>> = {
  bluebird: 'Bluebird',
  calm: 'Calm summit',
  clean: 'Clean air',
  fresh: 'Fresh snow',
  warm: 'Warmest',
}

interface Props {
  lens: Lens | null
  onLens: (lens: Lens | null) => void
  /** In a phone's one scrolling row with the limits (record 0330), which scrolls for both. */
  inline?: boolean
}

/**
 * The lenses the field is ranked by, a pill each under the headline (records
 * 0307 and 0319). A press on the lit one lets go of it, and the field ranks
 * by the metric the Metrics table names, as it did before the score. Each is
 * a toggle (`aria-pressed`), since none of them opens anything.
 */
export default function LensChips({ lens, onLens, inline = false }: Props) {
  return (
    <div role="group" aria-label="Lenses" className={inline ? RESULTS_HEAD.lensesInline : RESULTS_HEAD.lenses}>
      {LENSES.map((name) => (
        <button
          key={name}
          type="button"
          onClick={() => onLens(lens === name ? null : name)}
          aria-pressed={lens === name}
          className={lens === name ? RESULTS_HEAD.lensOn : RESULTS_HEAD.lens}
        >
          {LENS_LABEL[name]}
        </button>
      ))}
    </div>
  )
}
