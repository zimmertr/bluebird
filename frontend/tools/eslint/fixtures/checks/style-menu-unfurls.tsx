// Must trip: a menu that hangs beside its control, one that says so outright,
// and a list of options drawn outside the card.
export function Menu() {
  usePopover({ open, onOpenChange, triggerRef })
  usePopover({ open, onOpenChange, triggerRef, unfurl: false })
  return <ul role="listbox" />
}
