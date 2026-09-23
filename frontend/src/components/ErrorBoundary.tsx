import { Component, type ErrorInfo, type ReactNode } from 'react'
import { BUTTON_PRIMARY, PROSE, SURFACE_CARD, SURFACE_PAGE } from '../styles'

interface Props {
  children: ReactNode
}

interface State {
  failed: boolean
}

// Without a boundary React unmounts the whole tree when a render throws, and
// the page is left blank with nothing to say. Every entry renders inside one of
// these, so a crash leaves a sentence and a way back instead.
//
// A class because React offers no hook that catches a render error, and not a
// package because this is the whole of it.
//
// Nothing here may import from the App tree: /privacy, /terms and the 404 wear
// this too, and anything from the map's side would pull maplibre into bundles
// that render text.
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  // The console is the only record this app keeps: it reports nothing to a
  // third party, so the component stack is written where a reader with a bug
  // report can copy it from.
  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  // Mounts the same children again in place. A failure that depended on a
  // moment (a response mid-flight, a transient value) gets a second chance
  // without the cold load a reload would cost.
  retry = () => {
    this.setState({ failed: false })
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className={`min-h-dvh ${SURFACE_PAGE} px-4 py-10`}>
        <div role="alert" className={`mx-auto w-full max-w-md ${SURFACE_CARD} p-4`}>
          <p className={PROSE.body}>Bluebird Forecast hit an error. Try again later.</p>
          <button type="button" onClick={this.retry} className={`${BUTTON_PRIMARY} mt-4`}>
            Try again
          </button>
        </div>
      </div>
    )
  }
}
