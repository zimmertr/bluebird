import type { ComparedModel } from '../hooks/useModelCompare'
import { STATUS, TEXT } from '../styles'
import { paceWaitLine } from '../utils/pacing'

// What the comparison has to say beside the chart's metric radios: why a
// model's lines are missing (#232), and why none of them have arrived yet
// (#394).
//
// There is no key. A row of chips naming each model in its colour was drawn
// here and removed (TJ, #232 review): a reader who wants to know which model a
// line belongs to moves the cursor over the chart, and the hover box names
// rank, destination and model on every entry. The chips were a second place
// listing the models the panel's picker already lists.
//
// Nothing here is clickable, so the chart cannot become a second place that
// spends: every control that shapes a comparison lives in the panel's picker.

interface Props {
  /** The ranking model first, then every extra on the chart. */
  compared: readonly ComparedModel[]
  /**
   * Seconds until the shared Open-Meteo pacer resumes, or null when nothing is
   * waiting. The comparison spends the same budget the analysis and the grid
   * do, and both of those already count their wait down.
   */
  paceRemainingS: number | null
}

export default function ModelCompare({ compared, paceRemainingS }: Props) {
  const notes = compared.filter((m) => m.note !== null)
  const wait = paceWaitLine(paceRemainingS)
  if (notes.length === 0 && wait === null) return null

  return (
    <div className={`ml-auto min-w-0 text-right ${TEXT.micro} ${STATUS.warn}`}>
      {/* Above the notes: a wait is about every line, where a note is about
          one model. */}
      {wait !== null && <div>{wait}</div>}
      {notes.map((model) => (
        <div key={model.id}>{model.note}</div>
      ))}
    </div>
  )
}
