// Must trip every ban. The required roles are proven by the second fixture.
declare const CHIP: { remove: string }
export const Picker = ({ i, on }: { i: number; on: boolean }) => (
  <div>
    <li id={`option-${i}`}>x</li>
    <input type="checkbox" />
    {on && <button className={CHIP.remove}>x</button>}
    <button>Clear comparison</button>
  </div>
)
