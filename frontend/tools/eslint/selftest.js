// Proof that the bans in eslint.config.js are not vacuous (issue #379 review).
//
// A `no-restricted-syntax` selector that matches nothing reports nothing, which
// is indistinguishable from a clean tree. metrics.test.ts guarded its own text
// checks against that by failing when a `?raw` import came back empty; the port
// would have lost the guard without this.
//
// Each fixture must trip exactly the bans named below and no others, and
// clean.tsx must trip none — it carries `Precipitation`, `Minimum` and
// `Maximum`, so a metric ban that lost its negative lookaheads fails here.
import { dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import tseslint from 'typescript-eslint'
import { CLASS_BANS, METRIC_BAN, PANEL_BANS } from './eslint.config.js'

// Two fixtures trip a second ban by construction: a dimmed placeholder and the
// restated segment recipe both spell a slate text colour. Listing both is the
// point — the table is what a fixture tripping the WRONG ban fails against.
const SLATE = 'Take slate text from a role'
const EXPECTED = {
  'clean.tsx': [],
  'hue.tsx': ['A hue carries meaning'],
  'metric.tsx': ['Compose a metric name'],
  'panel-heading.tsx': ['Give a panel heading its treatment'],
  'panel-width.tsx': ['The panel is one width at every breakpoint'],
  'placeholder.tsx': [SLATE, 'A placeholder at this step fails AA'],
  'recipe.tsx': [SLATE, 'Compose the shared recipe'],
  'size.tsx': ['Size text through a TEXT or PROSE role'],
  'slate-text.tsx': [SLATE],
  'touch.tsx': ['The touch variant belongs to a TAP role'],
}

const here = dirname(fileURLToPath(import.meta.url))
const eslint = new ESLint({
  cwd: here,
  overrideConfigFile: true,
  overrideConfig: [
    {
      files: ['**/*.tsx'],
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { ecmaFeatures: { jsx: true } },
      },
      // Every ban at once, so a fixture that trips the wrong one fails too.
      rules: { 'no-restricted-syntax': ['error', ...CLASS_BANS, ...PANEL_BANS, METRIC_BAN] },
    },
  ],
})

const results = await eslint.lintFiles(['fixtures/*.tsx'])
const failures = []
const names = Object.keys(EXPECTED)
if (results.length !== names.length) {
  failures.push(`expected ${names.length} fixtures, linted ${results.length}`)
}

for (const result of results) {
  const name = result.filePath.split('/').pop()
  const want = (EXPECTED[name] ?? ['<unknown fixture>']).toSorted()
  const got = result.messages.map((m) => m.message).toSorted()
  const hit = want.length === got.length && want.every((w, i) => got[i].startsWith(w))
  if (!hit) failures.push(`${name}: expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`)
}

if (failures.length > 0) {
  console.error('eslint self-test FAILED:')
  for (const f of failures) console.error('  ' + f)
  process.exit(1)
}
console.log(`eslint self-test: ${results.length} fixtures, every ban fires and only its own`)
