import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { reloadOnStaleChunk } from './staleChunk'
import { keepForecastsAcrossReload } from './utils/forecastStore'
import { applyServiceWorkerSwitch } from './utils/serviceWorker'
// The app's face, imported here rather than from index.css, whose @import
// Tailwind inlines without rebasing the font files' paths.
import '@fontsource-variable/inter'
import './index.css'

reloadOnStaleChunk({
  target: window,
  storage: () => window.sessionStorage,
  reload: () => window.location.reload(),
  build: import.meta.url,
})
// The same build identity, so a reload into a new release discards the
// forecasts the old one aggregated rather than showing them.
keepForecastsAcrossReload(import.meta.url)
// After the page has loaded, so the switch never competes with the page's own
// requests; and only in a built image, since the dev server's files are not
// hashed and a worker there would hold them (record 0349).
if (import.meta.env.PROD) {
  window.addEventListener('load', () => void applyServiceWorkerSwitch(), { once: true })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
