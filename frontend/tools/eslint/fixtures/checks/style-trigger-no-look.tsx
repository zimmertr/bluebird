// Must trip: a trigger handed a colour, a state in a template, and a state role.
const DISABLED = 'disabled:opacity-40'
const open = true
export const Bar = () => (
  <MenuButton shape="bar" open={open} className="text-accent-ink">
    <span className={`min-w-0 ${open ? 'x' : 'y'} hover:underline`}>Columns</span>
    <MenuSelect className={`w-4 ${DISABLED}`} />
  </MenuButton>
)
