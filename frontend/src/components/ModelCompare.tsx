import type { ComparedModel } from '../hooks/useModelCompare'
import { RADIUS, SPINNER, STATUS, TEXT } from '../styles'

// The comparison's key, beside the chart's metric radios (#232).
//
// A key and nothing else: every control that shapes a comparison lives in the
// panel's model picker, which is where the ranking model is already chosen (TJ,
// #232 review). Nothing here is clickable, so the chart cannot become a second
// place that spends.
//
// It reads the chips the hook composes and draws them. Which models are on the
// chart, what each line is worth and where it stops are `utils/modelCompare.ts`'s
// and `useModelCompare`'s.

interface Props {
  /** The ranking model first, then every extra on the chart. */
  compared: readonly ComparedModel[]
}

export default function ModelCompare({ compared }: Props) {
  const notes = compared.filter((m) => m.note !== null)

  return (
    <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1">
      {compared.map((model) => (
        <Chip
          key={model.id}
          color={model.color}
          label={model.label}
          blend={model.blend}
          state={model.status}
        />
      ))}
      {notes.length > 0 && (
        // Its own line under the key rather than inside a chip: a chip is 26px
        // of a panel that can be 120px tall, and a sentence in one would set
        // the whole row's height.
        <div className={`w-full text-right ${TEXT.micro} ${STATUS.warn}`}>
          {notes.map((model) => (
            <div key={model.id}>{model.note}</div>
          ))}
        </div>
      )}
    </div>
  )
}

interface ChipProps {
  color: string
  label: string
  blend: boolean
  state: ComparedModel['status']
}

// One model in the key. Three states, told apart by the swatch alone: a
// spinner while the forecast is in flight, the model's colour once its lines
// are drawn, and a hollow swatch when nothing was drawn — which is why the note
// below the key says what happened rather than leaving absent lines to be read
// as an answer.
function Chip({ color, label, blend, state }: ChipProps) {
  return (
    <span className={`inline-flex max-w-56 items-center bg-slate-700 ${RADIUS.control}`}>
      <span
        className={`${TEXT.control} inline-flex min-w-0 items-center gap-1.5 px-2 py-1`}
      >
        {state === 'loading' ? (
          <span className={`${SPINNER} h-2.5 w-2.5 flex-shrink-0`} />
        ) : (
          <span
            className={`h-2 w-2 flex-shrink-0 ${RADIUS.pill}`}
            style={
              state === 'ready'
                ? { backgroundColor: color }
                : { border: `1px solid ${color}`, opacity: 0.5 }
            }
          />
        )}
        <span className="truncate">{label}</span>
        {blend && <span className={`${TEXT.overline} flex-shrink-0`}>Blend</span>}
      </span>
    </span>
  )
}
