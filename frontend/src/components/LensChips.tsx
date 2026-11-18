import { Fragment } from 'react'
import { LENSES, type Lens } from '../utils/score/lenses'
import { ACCENT, BAR_GROUP, BAR_PRESS, SEGMENT_DIVIDER, SEGMENT_IDLE, SEGMENT_ITEM, TEXT } from '../styles'

// What each lens is called on screen (record 0306). Strings in the PR's
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
}

/**
 * The lenses the field is ranked by, one segment each in the results bar's
 * well (record 0306). A press on the lit one lets go of it, and the field
 * ranks by the metric the Metrics table names, as it did before the score.
 * Each is a toggle (`aria-pressed`), since none of them opens anything.
 */
export default function LensChips({ lens, onLens }: Props) {
  return (
    <div role="group" aria-label="Lenses" className={`${BAR_GROUP} max-w-full overflow-x-auto`}>
      {LENSES.map((name, i) => (
        <Fragment key={name}>
          {i > 0 && <div className={SEGMENT_DIVIDER} />}
          <button
            onClick={() => onLens(lens === name ? null : name)}
            aria-pressed={lens === name}
            className={`${SEGMENT_ITEM} ${BAR_PRESS} ${TEXT.control} whitespace-nowrap px-2 ${lens === name ? ACCENT.fill : SEGMENT_IDLE}`}
          >
            {LENS_LABEL[name]}
          </button>
        </Fragment>
      ))}
    </div>
  )
}
