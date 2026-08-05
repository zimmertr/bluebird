import {
  ACCENT,
  LAYER,
  RADIUS,
  SCRUBBER,
  SCRUBBER_TRACK,
  SEGMENT_DIVIDER,
  SEGMENT_FLUID,
  SEGMENT_IDLE,
  SEGMENT_ITEM,
  SURFACE_FLOATING,
  TAP,
  TEXT,
} from '../styles'
import type { TimelineAxis } from '../utils/timeline'

interface Props {
  // Which axis the bar is playing, and the ones it could offer. The switch only
  // appears when there are two, since a one-option control is a label.
  axis: TimelineAxis
  axes: TimelineAxis[]
  onAxisChange: (axis: TimelineAxis) => void
  // The playhead as a plain index into the axis's frames, which is what lets a
  // 12-frame radar loop and a 384-hour forecast grid share one control.
  index: number
  frameCount: number
  onIndexChange: (index: number) => void
  playing: boolean
  onPlayingChange: (playing: boolean) => void
  // What the playhead currently reads as, already composed by the axis that
  // owns the vocabulary: relative minutes for radar, a weekday and hour for the
  // forecast. The bar formats nothing itself.
  readout: string
  // Up to three marks under the track. Rendered spread across it, so two marks
  // land at the ends and three put one in the middle.
  scale: string[]
  // What the forecast axis is called: the ranked metric's noun ("Wind"),
  // composed by metrics.ts and passed in, so this file never spells a metric
  // name of its own. It used to say "Forecast", which only said which axis it
  // was not — the metric name says what the colors under the playhead mean
  // (#245 review).
  forecastLabel: string
}


function PlayIcon({ playing }: { playing: boolean }) {
  return (
    <svg viewBox="0 0 10 10" width="10" height="10" fill="currentColor" aria-hidden="true">
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

/**
 * The floating timeline over the map: play/pause, a scrubber, and a readout.
 *
 * Wiring only. Every decision it looks like it is making — which axis is
 * available, where a new axis starts, how long a frame is held, what a position
 * reads as — is `utils/timeline.ts`'s, because Vitest here has no DOM and
 * anything left in a component is untestable by construction. The same split
 * `ForecastCalendar` makes for the same reason.
 *
 * Bottom-centre rather than in a corner: the corners are spoken for (the
 * legends bottom-left, the scale control bottom-right, the map controls
 * top-right), and a control that changes what the whole map shows belongs where
 * the eye already is rather than off to one side.
 *
 * It sits at `LAYER.base` with the legends, which stack above it — the two
 * never overlap because the legend column is anchored to the left edge and this
 * is centred, and on a phone the legends are given the room to slide up.
 */
export default function TimelineTransport({
  axis,
  axes,
  onAxisChange,
  index,
  frameCount,
  onIndexChange,
  playing,
  onPlayingChange,
  readout,
  scale,
  forecastLabel,
}: Props) {
  // Radar names itself: it is a product, not a metric.
  const axisLabel = (a: TimelineAxis) => (a === 'radar' ? 'Radar' : forecastLabel)
  return (
    <div
      // Sits directly above the attribution control, which is a licence term
      // and cannot be covered. It used to clear the SCALE bar as well, which
      // cost another 40px for nothing: the scale is bottom-RIGHT and this is
      // centred and 368px wide, so on any map wide enough to matter the two
      // never share a column. Only the attribution is wide enough to be
      // unavoidable, and it is short. One number rather than a breakpoint, so
      // the control is in the same place on every screen.
      className={`${SURFACE_FLOATING} ${LAYER.base} absolute bottom-10 left-1/2 -translate-x-1/2 flex w-[min(23rem,calc(100%-4rem))] items-center gap-2.5 px-3 py-2`}
    >
      <button
        onClick={() => onPlayingChange(!playing)}
        aria-label={playing ? 'Pause the timeline' : 'Play the timeline'}
        className={`${ACCENT.fill} ${ACCENT.fillHover} ${TAP.action} h-7 w-7 flex-shrink-0 ${RADIUS.control} transition-colors`}
      >
        <PlayIcon playing={playing} />
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className={`relative ${SCRUBBER_TRACK}`}>
          {/* The filled portion, drawn behind the input rather than by it: a
              range input's own track is a pseudo-element and cannot carry a
              second box on top. `pointer-events-none` keeps it from swallowing
              the drag that belongs to the input above it. */}
          <div
            className={`${ACCENT.mark} pointer-events-none absolute inset-y-0 left-0 ${RADIUS.pill}`}
            style={{ width: `${frameCount > 1 ? (index / (frameCount - 1)) * 100 : 100}%` }}
          />
          <input
            type="range"
            min={0}
            max={Math.max(0, frameCount - 1)}
            step={1}
            value={index}
            onChange={(e) => onIndexChange(Number(e.target.value))}
            aria-label={`${axisLabel(axis)} time`}
            // The value a screen reader announces is the readout, not the
            // frame number: "8 of 12" says nothing a listener can act on and
            // "-15 min" is the whole answer.
            aria-valuetext={readout}
            className={`${SCRUBBER} absolute inset-0`}
          />
        </div>
        <div className={`${TEXT.micro} flex justify-between font-mono`}>
          {scale.map((mark, i) => (
            <span key={`${mark}-${i}`}>{mark}</span>
          ))}
        </div>
      </div>

      <div className="flex-shrink-0 text-right">
        {axes.length > 1 ? (
          // Two axes exist, so which one is playing is a choice rather than a
          // caption, and the label becomes the control.
          <div className={SEGMENT_FLUID}>
            {axes.map((option, i) => (
              <button
                key={option}
                onClick={() => onAxisChange(option)}
                aria-pressed={axis === option}
                className={`${SEGMENT_ITEM} ${i > 0 ? SEGMENT_DIVIDER : ''} ${
                  axis === option ? ACCENT.fill : SEGMENT_IDLE
                }`}
              >
                {axisLabel(option)}
              </button>
            ))}
          </div>
        ) : (
          <div className={TEXT.overline}>{axisLabel(axis)}</div>
        )}
        <div className={`${TEXT.control} whitespace-nowrap font-mono`}>{readout}</div>
      </div>
    </div>
  )
}
