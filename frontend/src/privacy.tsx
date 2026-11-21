import React from 'react'
import ReactDOM from 'react-dom/client'
import PrivacyPage from './components/PrivacyPage'
import ErrorBoundary from './components/ErrorBoundary'
// The app's face, imported here rather than from index.css (record 0324).
import '@fontsource-variable/archivo/wdth.css'
import './index.css'

// A separate Vite entry rather than a route inside App: this page is text, and
// sharing the app's entry would make a privacy link download the whole map.
// Nothing here may import from the App tree, directly or transitively.
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <PrivacyPage />
    </ErrorBoundary>
  </React.StrictMode>,
)
