// Must trip: the flag decoded in App, and no useRunOnOpen.
export const App = () => <main>{String(decodeAutoAnalyze(location.search))}</main>
