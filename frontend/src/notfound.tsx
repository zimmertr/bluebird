import React from 'react'
import ReactDOM from 'react-dom/client'
import NotFoundPage from './components/NotFoundPage'
import ErrorBoundary from './components/ErrorBoundary'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <NotFoundPage />
    </ErrorBoundary>
  </React.StrictMode>,
)
