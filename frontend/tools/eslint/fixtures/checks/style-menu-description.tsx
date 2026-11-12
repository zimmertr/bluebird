// Must trip: a row's sentence set in the helper's type at the call site, and
// no row role's description anywhere in the file.
declare const TEXT: { helper: string }
export const Row = () => <p className={TEXT.helper}>What the row is.</p>
