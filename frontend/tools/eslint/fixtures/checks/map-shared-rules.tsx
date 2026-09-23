// Must trip: a utils helper declared in the wiring, and the inputs copied out.
function ringToPts() {}
export function mount(controller: any) {
  const { drawing } = controller.inputs
  return [ringToPts, drawing]
}
