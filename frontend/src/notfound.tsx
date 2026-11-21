import React from 'react'
import ReactDOM from 'react-dom/client'
import NotFoundPage from './components/NotFoundPage'
import ErrorBoundary from './components/ErrorBoundary'
// The app's face, imported here rather than from index.css (record 0324).
import '@fontsource-variable/archivo'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <NotFoundPage />
    </ErrorBoundary>
  </React.StrictMode>,
)
