import type { DestinationResult } from '../types'
import { OPENED_ROW } from '../styles'
import { profileFacts, summitProfile } from '../utils/score/summitProfile'
import { destinationLinkLabel, destinationUrl } from '../utils/destinationUrl'
import { useUsStates } from '../hooks/useUsStates'
import { grouped } from '../utils/numbers'
import { IconExternalLink } from './icons'

interface Props {
  row: DestinationResult
  /** The field's hour grid, which the row's own series times override. */
  times: readonly number[]
  /** The fly-to and card the row's name gives. */
  onCenter: () => void
}

// Each mark is a box placed in percentages of the profile, from the
// fractions `summitProfile` gives.
const pct = (f: number) => `${f * 100}%`

/**
 * An opened row in the compact table (record 0327): the summit against the
 * cloud over the window's hours, its key, the facts and the two actions.
 */
export default function OpenedRow({ row, times, onCenter }: Props) {
  const profile = summitProfile(row, times)
  const href = destinationUrl(row, useUsStates(row.type === 'crag'))
  const elevation = row.elevation_ft == null ? null : `${grouped(Math.round(row.elevation_ft))} ft`
  return (
    <div data-opened-row="">
      {profile && (
        <div className={OPENED_ROW.profile} aria-hidden="true">
          {profile.hours.map((h, i) =>
            h.lit ? null : <span key={`n${i}`} className={OPENED_ROW.night} style={{ left: pct(h.x), width: pct(h.w) }} />,
          )}
          {profile.hours.map((h, i) =>
            h.cloud ? (
              <span
                key={`c${i}`}
                className={OPENED_ROW.cloud}
                style={{ left: pct(h.x), width: pct(h.w), top: pct(h.cloud.top), height: pct(h.cloud.base - h.cloud.top) }}
              />
            ) : null,
          )}
          {profile.freeze.map((f) => (
            <span key={`f${f.x}`} className={OPENED_ROW.freeze} style={{ left: pct(f.x), width: pct(f.w), top: pct(f.y) }} />
          ))}
          <span className={OPENED_ROW.summit} style={{ top: pct(profile.summit) }} />
          {profile.best && (
            <span className={OPENED_ROW.best} style={{ left: pct(profile.best.x0), width: pct(profile.best.x1 - profile.best.x0) }} />
          )}
          {profile.days.map((d) => (
            <span key={d.x} className={OPENED_ROW.day} style={{ left: `calc(${d.x * 100}% + 4px)` }}>
              {d.label}
            </span>
          ))}
          {elevation && (
            <span className={OPENED_ROW.summitTag} style={{ top: `${profile.summit * 100}%` }}>
              {elevation}
            </span>
          )}
        </div>
      )}
      {profile && (
        <div className={OPENED_ROW.key} aria-hidden="true">
          <span className={OPENED_ROW.keyItem}>
            <span className={OPENED_ROW.swatchSummit} />
            {elevation ? `Summit ${elevation}` : 'Summit'}
          </span>
          <span className={OPENED_ROW.keyItem}>
            <span className={OPENED_ROW.swatchCloud} />
            Cloud
          </span>
          <span className={OPENED_ROW.keyItem}>
            <span className={OPENED_ROW.swatchFreeze} />
            Freezing level
          </span>
        </div>
      )}
      <dl className={OPENED_ROW.facts}>
        {profileFacts(row).map((f) => (
          <div key={f.label}>
            <dt className={OPENED_ROW.factLabel}>{f.label}</dt>
            <dd className={OPENED_ROW.factValue}>{f.value}</dd>
          </div>
        ))}
      </dl>
      <div className={OPENED_ROW.actions}>
        <button type="button" onClick={onCenter} className={OPENED_ROW.action}>
          Show on map
        </button>
        <a href={href} target="_blank" rel="noopener noreferrer" className={OPENED_ROW.action}>
          <IconExternalLink className="flex-shrink-0" />
          {destinationLinkLabel(row.type)}
        </a>
      </div>
    </div>
  )
}
