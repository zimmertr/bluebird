// Must trip: two roots, no boundary around the page, and no boundary import.
import ReactDOM from 'react-dom/client'
declare const App: () => null
ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
ReactDOM.createRoot(document.getElementById('other')!).render(<App />)
