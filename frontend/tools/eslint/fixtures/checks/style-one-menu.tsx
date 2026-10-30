// Must trip: a menu that picks its own placement, a list of options drawn
// outside the card, and a native select, which a phone no longer keeps either.
export function Picker() {
  usePopover({ open, onOpenChange, triggerRef, placement: 'below' })
  return (
    <>
      <ul role="listbox" />
      {phone ? <select aria-label="Wind aggregate" /> : null}
    </>
  )
}
