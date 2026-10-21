// Must trip: a menu that picks its own placement, a list of options drawn
// outside the card, and a native select at a desk. The phone's select passes.
export function Picker() {
  usePopover({ open, onOpenChange, triggerRef, placement: 'below' })
  return (
    <>
      <ul role="listbox" />
      <select aria-label="Chart metric" />
      {phone ? <select aria-label="Wind aggregate" /> : null}
    </>
  )
}
