import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'

// Serves every `?raw` import from a module of its own rather than from the
// source file's id. Tests read most of src/ as text (branding.test.ts globs
// all of it), and V8 coverage counts a file loaded that way as reached with no
// statements, so a module no test runs reported 0 of 0 lines instead of 0 of
// its real count. The text is the same bytes Vite's own raw load returns.
function rawAsText(): Plugin {
  const PREFIX = '\0raw-text:'
  return {
    name: 'raw-as-text',
    enforce: 'pre',
    async resolveId(source, importer) {
      if (!source.endsWith('?raw')) return null
      const resolved = await this.resolve(source.slice(0, -'?raw'.length), importer, { skipSelf: true })
      // The trailing `.txt` keeps Vite's JSON and CSS plugins off the id.
      return resolved ? `${PREFIX}${resolved.id}.txt` : null
    },
    load(id) {
      if (!id.startsWith(PREFIX)) return null
      const path = id.slice(PREFIX.length, -'.txt'.length)
      return `export default ${JSON.stringify(readFileSync(path, 'utf8'))}`
    },
  }
}

// Two projects, split by file extension, so the pure suite pays nothing for the
// DOM. A `.test.ts` runs in node exactly as it always has: jsdom costs a few
// hundred milliseconds per file to stand up, and the pure suite is most of the
// files. A `.test.tsx` renders a component, so it gets jsdom and the setup file
// that unmounts between tests. The extension is the switch rather than a
// per-file pragma because a pragma forgotten on one file fails in a confusing
// way (`document is not defined`), where a wrong extension is visible in review.
//
// The timezone is pinned for both, because a calendar day is a local idea and
// some of what utils/calendar/calendar.ts guarantees only has content in a zone that
// observes DST: a local day is 23 or 25 hours across a transition, and on a UTC
// runner those assertions would pass while proving nothing. The calendar's
// component test reads the same days, so it needs the same zone.
const env = { TZ: 'America/Los_Angeles' }

export default defineConfig({
  plugins: [rawAsText()],
  test: {
    // Off unless asked for (`make coverage-frontend`). Both projects report into
    // one table, so a module a component test reaches counts once. Lines and
    // branches only, and no threshold: a floor would reward tests that run a
    // line without asserting on it.
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'plugins/**/*.ts'],
      exclude: ['**/*.test.{ts,tsx}', 'src/testSupport/**', 'src/api-schema.d.ts', '**/*.d.ts'],
      reporter: ['text-summary', 'json-summary', 'json', 'html'],
      reportsDirectory: 'coverage',
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          // plugins/ holds the build's own Vite plugins, which run in node too.
          include: ['src/**/*.test.ts', 'plugins/**/*.test.ts'],
          environment: 'node',
          env,
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          include: ['src/**/*.test.tsx'],
          environment: 'jsdom',
          setupFiles: ['src/testSupport/setup.ts'],
          env,
        },
      },
    ],
  },
})
