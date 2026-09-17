// Must trip: a hue named at the call site. Fuchsia on purpose - it appears
// nowhere in src/, so a build of dist/ proves Tailwind never scans this folder.
export const Hue = () => <b className="text-fuchsia-300">x</b>
