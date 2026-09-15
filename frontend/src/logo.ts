// The app's own copy of the icon, at the size the app actually draws it.
//
// `public/icon.png` stays where it is at 1024px, because the Open Graph card
// and the iOS home-screen icon need one absolute URL and a large square. What
// the app draws is much smaller: 80px in the panel header, 48px everywhere
// else. Serving the 1024px file for that cost every cold load 1.4 MB, which
// was three times the whole JavaScript bundle over the wire, for an image no
// wider than a thumbnail (issue #337).
//
// 256px covers the 80px header on a 3x screen. Importing the file rather than
// pointing at `/icon.png` is what earns it a content hash, and a hashed name
// under `assets/` is the one thing the cache-header middleware answers
// `immutable` for (#354) — the unhashed copy in `public/` revalidates on every
// load by design, because its name never changes.
import logoUrl from './assets/logo.webp'

export { logoUrl }
