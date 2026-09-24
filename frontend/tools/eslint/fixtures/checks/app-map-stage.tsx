// Must trip: MapView rendered by App, no MapStage, and an object built for the call.
export const App = ({ a }: { a: number }) => (
  <>
    <MapView />
    <Other layout={{ a }} />
  </>
)
