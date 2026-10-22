import { BLOCKER_LINE, STATUS } from '../styles'
import type { FooterMessage } from '../utils/notices'

/**
 * A blocker's line under the field it validates (#786; record 0208): a dot in
 * the severity's colour and the sentence, with no box and no ×. The field's
 * own readout, the way the draw counter is, rather than a notice: it stands
 * where the fix is, for as long as the field holds Analyze up, and goes when
 * the reader supplies what it asks. The same sentence is in the list the
 * Analyze button's badge opens, which is the one place every message is.
 *
 * Which blocker stands under which field is `BLOCKER_HOME` in
 * `panelMessages.ts`; each section renders its own home's lines through this
 * and nothing else colours by `STATUS` outside the draw counter, which the
 * linter's `style-blocker-line` check holds.
 */
export default function BlockerLine({ lines }: { lines: readonly FooterMessage[] }) {
  return (
    <>
      {lines.map((m) => (
        <p key={m.key} className={`${BLOCKER_LINE.row} ${STATUS[m.severity]}`}>
          <span className={BLOCKER_LINE.dot} aria-hidden="true" />
          {m.text}
        </p>
      ))}
    </>
  )
}
