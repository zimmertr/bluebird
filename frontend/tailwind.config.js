/** @type {import('tailwindcss').Config} */
export default {
  // src/index.css pulls this in with `@config`, so v4 uses these globs rather
  // than auto-detecting sources. Keeping them explicit is also what stops a
  // built dist/ from being scanned and resurrecting classes we deleted.
  //
  // Every HTML entry has to be listed. The utilities all live in src/ today,
  // but an entry missing from here goes unscanned the moment one carries a
  // class, and the failure is a silently unstyled page rather than an error.
  content: [
    './index.html',
    './privacy/index.html',
    './404.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
