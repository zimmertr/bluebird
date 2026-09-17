import { useDialog } from '../hooks/useDialog'
import SafetyNotice from './SafetyNotice'
import {
  BADGE_STEP,
  BUTTON_PRIMARY,
  LAYER,
  PROSE,
  RADIUS,
  SURFACE_CARD,
  SURFACE_DIVIDER,
} from '../styles'
import { logoUrl } from '../logo'

interface Props {
  onDismiss: () => void
}

// Five steps walking the panel top to bottom, then the Analyze button and what
// comes after. Step three covers the whole Metrics table in one breath, the
// ranking and the bounds alike, because there is no no-scroll budget left to
// spend: the card is taller than the window it opens in at a desktop width and
// at a phone width alike, measured in docs/STYLES.md under "Welcome dialog
// height". A step per question lengthens a card the reader already scrolls.
// Every step is named for the panel section it describes, so a renamed section
// renames its step.
const STEPS: [string, string][] = [
  ['Destinations', 'Search by name, draw a polygon, click the map, or paste coordinates. Each method finds what you want in its own way; they all work together.'],
  ['Forecast', 'Pick a weather model, then choose a day and time window. The calendar updates as the model changes, since different models reach different distances ahead.'],
  ['Metrics', 'Rank the results based on various weather metrics like precipitation, air quality, and temperature. Bound those same metrics, and cap how many results to list.'],
  ['Analyze', 'Generate ranked results, see them on the map as color-coded markers, and inspect forecasts across your destinations.'],
  ['Repeat', 'Adjust any control to refine your window. Changing destinations, the forecast window, or the model needs a new Analyze; everything else updates live.'],
]

export default function WelcomeModal({ onDismiss }: Props) {
  const panelRef = useDialog(onDismiss)
  return (
    <div className={`fixed inset-0 ${LAYER.modal} flex items-center justify-center bg-black/60 backdrop-blur-sm p-4`}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-title"
        tabIndex={-1}
        className={`${SURFACE_CARD} w-full max-w-md max-h-full overflow-y-auto focus:outline-none`}
      >
        {/* Header */}
        <div className={`flex items-center gap-3 px-6 pt-6 pb-4 border-b ${SURFACE_DIVIDER}`}>
          <img
            src={logoUrl}
            alt=""
            width={256}
            height={256}
            className={`w-12 h-12 ${RADIUS.surface} object-cover flex-shrink-0`}
          />
          <div>
            <h1 id="welcome-title" className={PROSE.title}>Welcome to Bluebird Forecast</h1>
            <p className={PROSE.subtitle}>The Weather Window Finder</p>
          </div>
        </div>

        <div className="px-6 py-4">
          <p className={`${PROSE.body} mb-4`}>
            It's Friday evening. Rain is moving in from the west, smoke is drifting from the east,
            and strong winds are building to the south. You want to get outside this weekend, but
            where should you go?
          </p>

          <h2 className={`${PROSE.heading} mb-3`}>How it works</h2>

          {/* Steps */}
          <ol className="space-y-3 mb-5">
            {STEPS.map(([title, desc], i) => (
              <li key={i} className={`${PROSE.body} flex gap-3`}>
                <span className={`flex-shrink-0 w-5 h-5 ${RADIUS.pill} ${BADGE_STEP} flex items-center justify-center mt-0.5`}>
                  {i + 1}
                </span>
                <p className="leading-snug">
                  <span className={PROSE.strong}>{title}</span>
                  {': '}
                  {desc}
                </p>
              </li>
            ))}
          </ol>

          <p className={`${PROSE.note} mb-4`}>
            <SafetyNotice />
          </p>

          <div className={`border-t ${SURFACE_DIVIDER} pt-4 mb-4`}>
            <p className={`${PROSE.heading} text-center`}>
              Ready to find your Bluebird day?
            </p>
          </div>

          <button
            onClick={onDismiss}
            className={BUTTON_PRIMARY}
          >
            Search now
          </button>
        </div>
      </div>
    </div>
  )
}
