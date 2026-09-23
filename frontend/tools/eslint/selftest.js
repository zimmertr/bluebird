// Proof that the bans in eslint.config.js are not vacuous (issue #379 review).
// A selector matching nothing reports nothing, which reads exactly like a clean
// tree; metrics.test.ts guarded its own text checks against that by failing on
// an empty `?raw` import, and the port would have lost the guard. Each fixture
// must trip exactly the bans named below, and clean.tsx must trip none — it
// carries the words the metric ban's negative lookaheads have to let through.
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import tseslint from 'typescript-eslint'
import { CHECKS } from './checks/index.js'
import { CLASS_BANS, METRIC_BAN, PANEL_BANS } from './eslint.config.js'
import { checksPlugin, messagesOf } from './plugin.js'

// Two fixtures trip a second ban by construction: a dimmed placeholder and a
// restated recipe both spell a slate text colour. Listing both is the point.
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

// The fixtures prove each ban fires; they cannot prove the real config hands
// the bans to the right files, because they run under a config of their own.
// So one hue is linted under the real config at three paths: the two folders
// the class bans cover must reject it, and a folder outside them must not,
// which is what shows the glob rather than the rule is being tested.
const real = new ESLint({
  cwd: join(here, '..', '..'),
  overrideConfigFile: join(here, 'eslint.config.js'),
})
const PROBE = "export const probe = 'text-fuchsia-300'\n"
const PROBES = { 'src/components/Probe.tsx': true, 'src/map/probe.ts': true, 'src/utils/probe.ts': false }
for (const [path, banned] of Object.entries(PROBES)) {
  const [result] = await real.lintText(PROBE, { filePath: join(here, '..', '..', path) })
  const hit = result.messages.some((m) => m.message.startsWith('A hue carries meaning'))
  if (hit !== banned) failures.push(`${path}: hue ban ${banned ? 'missing' : 'unexpected'}`)
}

// The per-file checks. Each has fixtures under fixtures/checks/, named after
// it (`<check>.tsx`, or `<check>.<case>.tsx` where one file cannot trip every
// message: a ban and a requirement on the same node need two). Between them
// they must report every message the check can give, which is what proves no
// selector in it is vacuous, and each must report something. Every fixture is
// linted twice: once with its own rule alone, so nothing else can supply a
// message it failed to give, and once as if it were the check's probe file
// under the real config, which proves the check's glob reaches a file that
// exists.
const { plugin } = checksPlugin(CHECKS)
const PARSER = {
  languageOptions: {
    parser: tseslint.parser,
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
}
const probeOf = (check) => check.probe ?? check.files[0]
const FIXTURE_DIR = join(here, 'fixtures', 'checks')
const onDisk = readdirSync(FIXTURE_DIR)
const fixturesOf = (check) => {
  const ext = extname(probeOf(check))
  return onDisk.filter(
    (f) => f === `${check.name}${ext}` || (f.startsWith(`${check.name}.`) && f.endsWith(ext) && f.split('.').length === 3),
  )
}
const isolated = new ESLint({
  cwd: here,
  overrideConfigFile: true,
  overrideConfig: [
    { files: ['**/*.ts', '**/*.tsx'], ...PARSER },
    ...CHECKS.map((c) => ({
      files: fixturesOf(c).map((f) => `fixtures/checks/${f}`),
      plugins: { bluebird: plugin },
      rules: { [`bluebird/${c.name}`]: 'error' },
    })),
  ],
})

function compare(label, want, got) {
  const missing = want.filter((w) => !got.some((g) => g.startsWith(w)))
  const extra = got.filter((g) => !want.some((w) => g.startsWith(w)))
  if (missing.length || extra.length) {
    failures.push(`${label}: missing ${JSON.stringify(missing)}, unexpected ${JSON.stringify(extra)}`)
  }
}

const claimed = new Set(CHECKS.flatMap(fixturesOf))
for (const file of onDisk) {
  if (!claimed.has(file)) failures.push(`fixtures/checks/${file} belongs to no check`)
}

let fixtureCount = 0
for (const check of CHECKS) {
  const want = messagesOf(check)
  if (new Set(want).size !== want.length) failures.push(`${check.name}: two messages are the same`)
  const files = fixturesOf(check)
  if (files.length === 0) {
    failures.push(`${check.name}: no fixture under fixtures/checks/`)
    continue
  }
  fixtureCount += files.length
  const probe = join(here, '..', '..', probeOf(check))
  if (!existsSync(probe)) failures.push(`${check.name}: the probe ${probeOf(check)} does not exist`)
  const alone = []
  const atProbe = []
  for (const file of files) {
    const path = join(FIXTURE_DIR, file)
    const [result] = await isolated.lintFiles([path])
    if (result.messages.length === 0) failures.push(`${file}: reports nothing`)
    alone.push(...result.messages.map((m) => m.message))
    const [real_] = await real.lintText(readFileSync(path, 'utf8'), { filePath: probe })
    atProbe.push(
      ...real_.messages.filter((m) => m.ruleId === `bluebird/${check.name}`).map((m) => m.message),
    )
  }
  compare(`${check.name} (alone)`, want, [...new Set(alone)])
  compare(`${check.name} (at ${probeOf(check)})`, want, [...new Set(atProbe)])
}

if (failures.length > 0) {
  console.error('eslint self-test FAILED:')
  for (const f of failures) console.error('  ' + f)
  process.exit(1)
}
console.log(
  `eslint self-test: ${results.length} fixtures, every ban fires and only its own; ` +
    `the hue ban covers ${Object.keys(PROBES).filter((p) => PROBES[p]).join(' and ')}; ` +
    `${CHECKS.length} per-file checks over ${fixtureCount} fixtures, each firing every message alone and at its probe`,
)
