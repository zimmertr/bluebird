import { LINK } from '../styles'

// The one sentence the lawyers asked for: people plan real backcountry trips
// with this data, so the app itself must say it is not a safety tool, because
// the README saying so isn't user-visible.
//
// Shared because the welcome dialog is exactly the wrong place for it to live
// alone: it is dismissed once and remembered forever, so the people with the
// most Bluebird trips behind them are the ones least likely to have seen this
// recently. The public page repeats it where a link can reach it.
//
// Returns a fragment so each caller supplies its own paragraph and PROSE role.
// The dialog wants this as a footnote; the page gives it a section.
export default function SafetyNotice() {
  return (
    <>
      Bluebird is a planning aid, not a safety tool. Forecasts are automated estimates.
      Verify conditions with official sources such as{' '}
      <a
        href="https://www.weather.gov"
        target="_blank"
        rel="noopener noreferrer"
        className={LINK}
      >
        weather.gov
      </a>{' '}
      before committing to backcountry travel.
    </>
  )
}
