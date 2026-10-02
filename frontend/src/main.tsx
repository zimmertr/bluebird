import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import { reloadOnStaleChunk } from './staleChunk'
import { keepForecastsAcrossReload } from './utils/forecastStore'
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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
