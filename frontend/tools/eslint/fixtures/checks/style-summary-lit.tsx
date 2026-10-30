// Must trip: the summary chip in a class of its own, which drops the open state.
export const MapRows = ({ open }: { open: boolean }) => (
  <button type="button" aria-expanded={open} className="rounded-full">
    Controls
  </button>
)
