// Must trip: an object, an array and an arrow built in the render for MapStage.
export const App = ({ a }: { a: number }) => <MapStage layout={{ a }} rows={[a]} onOpen={() => a} />
