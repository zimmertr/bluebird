// Must trip: a menu that hangs beside its control, one that says so outright,
// a row width on a panel that does not unfurl, and a list of options drawn
// outside the card.
export function Menu() {
  usePopover({ open, onOpenChange, triggerRef })
  usePopover({ open, onOpenChange, triggerRef, placement: 'hang' })
  usePopover({ open, onOpenChange, triggerRef, placement: 'cover', widthRef })
  return <ul role="listbox" />
}
