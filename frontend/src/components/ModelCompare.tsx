import type { ComparedModel } from '../hooks/useModelCompare'
import { STATUS, TEXT } from '../styles'

// What the comparison has to say beside the chart's metric radios, which is
// only ever why a model's lines are missing (#232).
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
}

export default function ModelCompare({ compared }: Props) {
  const notes = compared.filter((m) => m.note !== null)
  if (notes.length === 0) return null

  return (
    <div className={`ml-auto min-w-0 text-right ${TEXT.micro} ${STATUS.warn}`}>
      {notes.map((model) => (
        <div key={model.id}>{model.note}</div>
      ))}
    </div>
  )
}
