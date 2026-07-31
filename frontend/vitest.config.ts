import { defineConfig } from 'vitest/config'

// The logic under test is pure (no DOM), so the default node environment is all
// we need — no jsdom, no setup files. A `.test.tsx` would be silently *not*
// collected by the pattern below, which is why everything worth pinning lives in
// a function outside its component.
//
// The timezone is pinned because a calendar day is a local idea and some of what
// utils/calendar.ts guarantees only has content in a zone that observes DST: a
// local day is 23 or 25 hours across a transition, and on a UTC runner those
// assertions would pass while proving nothing. Every other test here builds its
// dates through local-time constructors and is unaffected by the choice.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    env: { TZ: 'America/Los_Angeles' },
  },
})
