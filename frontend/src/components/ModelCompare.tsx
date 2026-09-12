import type { ForecastModelOption } from '../hooks/useCapabilities'
import type { ComparedModel } from '../hooks/useModelCompare'
import {
  FOCUS_RING,
  ICON_ACTION,
  ICON_ADORNMENT,
  RADIUS,
  SELECT,
  SPINNER,
  STATUS,
  TEXT,
} from '../styles'

// The comparison's key, beside the chart's metric radios (#232).
//
// Wiring only: which models can be added, what each line is worth and where it
// stops are `utils/modelCompare.ts`'s, and the spend is `useModelCompare`'s.
//
// It shows at all only while exactly one destination is charted, which is what
// lets a colour mean a model here without meaning anything else elsewhere: the
// destination keeps the colour the table gave it, and the models added to it
// take the next colours on the same ramp.

interface Props {
  /** The model every held number came from. Not removable: it is the report. */
  baseLabel: string
  baseBlend: boolean
  baseColor: string
  compared: readonly ComparedModel[]
  addable: readonly ForecastModelOption[]
  onAdd: (id: string) => void
  onRemove: (id: string) => void
}

export default function ModelCompare({
  baseLabel,
  baseBlend,
  baseColor,
  compared,
  addable,
  onAdd,
  onRemove,
}: Props) {
  const notes = compared.filter((m) => m.note !== null)

  return (
    <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1">
      {compared.length > 0 && (
        <Chip color={baseColor} label={baseLabel} blend={baseBlend} state="ready" />
      )}
      {compared.map((model) => (
        <Chip
          key={model.id}
          color={model.color}
          label={model.label}
          blend={model.blend}
          state={model.status}
          onRemove={() => onRemove(model.id)}
        />
      ))}
      {addable.length > 0 && (
        <div className="relative flex flex-shrink-0">
          <select
            aria-label="Compare"
            // Never holds a value: a pick is an action rather than a setting,
            // and the picked model leaves as a chip of its own. Kept on the
            // empty option so a second pick reads the same as the first.
            value=""
            onChange={(e) => {
              if (e.target.value !== '') onAdd(e.target.value)
            }}
            className={`${SELECT} px-2 py-0.5`}
          >
            <option value="">Compare</option>
            {addable.map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
              </option>
            ))}
          </select>
          <svg
            className={`${ICON_ADORNMENT} h-4 w-4`}
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
        </div>
      )}
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
  onRemove?: () => void
}

// One model in the key. Three states, told apart by the swatch alone: a
// spinner while the forecast is in flight, the model's colour once its line is
// drawn, and a hollow swatch when nothing was drawn — which is why the note
// below the key says what happened rather than leaving an absent line to be
// read as an answer.
function Chip({ color, label, blend, state, onRemove }: ChipProps) {
  return (
    <span className={`inline-flex max-w-56 items-center bg-slate-700 ${RADIUS.control}`}>
      <span
        className={`${TEXT.control} inline-flex min-w-0 items-center gap-1.5 py-1 pl-2 ${
          onRemove ? 'pr-1' : 'pr-2'
        }`}
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
      {onRemove && (
        <button
          onClick={onRemove}
          aria-label={`Remove ${label} from the comparison`}
          className={`${ICON_ACTION} ${FOCUS_RING} cursor-pointer py-1 pl-1 pr-2 leading-none`}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}
    </span>
  )
}
