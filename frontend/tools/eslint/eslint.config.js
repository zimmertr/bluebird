import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

// The syntactic half of what styles.test.ts and metrics.test.ts used to do by
// reading their own sources as text (issue #379). A regex over a file's bytes
// cannot tell a class list from a sentence about one, and it only speaks on
// `npm test`; these speak in the editor, on the node the violation is on.
//
// Unlike styles.test.ts, this file may spell a class verbatim: Tailwind's
// content globs are `src/**` plus the HTML entries (tailwind.config.js), and
// tools/ is in neither, so nothing here can emit CSS. The hue rule is still
// built from alternation, because that way it forbids utilities nobody thought
// to list.
//
// Each ban is checked against string literals and template chunks rather than
// the whole file, which is the one thing the text tests could not do: a class
// name written in a comment is prose about the rule, not a violation of it.
const ban = (pattern, message) => ({
  selector: [`Literal[value=/${pattern}/]`, `TemplateElement[value.raw=/${pattern}/]`].join(', '),
  message,
})

const CLASS_BANS = [
  // Arbitrary sizes are how a 10px and an 11px treatment ended up inside one
  // 160px legend box. The ramp owns the two steps Tailwind has no name for;
  // nothing else may invent one.
  ban(
    String.raw`\btext-(xs|sm|base|lg|xl|2xl|3xl)\b|text-\[`,
    'Size text through a TEXT or PROSE role in styles.ts, never at the call site.',
  ),
  // Slate is the surface system, already covered by TEXT, SURFACE_* and FIELD.
  ban(
    String.raw`\btext-slate-[0-9]`,
    'Take slate text from a role in styles.ts, never at the call site.',
  ),
  // The placeholder colour lives in FIELD. What no component may do is dim one
  // back below AA.
  ban(
    String.raw`placeholder[:-](text-)?slate-[56]00`,
    'A placeholder at this step fails AA on the surface it lands on. Use FIELD.',
  ),
  // A fourth copy of a shared recipe should fail here rather than ship a fourth
  // look: the idle half of a segmented choice, and the two surfaces around it.
  ban(
    String.raw`bg-slate-900 text-slate-400|bg-slate-900 border border-slate-500|bg-slate-800(\/95)? border border-slate-600`,
    'Compose the shared recipe from styles.ts rather than restating it.',
  ),
  // The guardrail #167 exists to install. Every hue in the app carries meaning
  // (the accent says "this acts"; green, amber and red say how an analysis is
  // going), so every one of them is the design system's decision rather than a
  // call site's. Slate is exempt and stays compositional.
  ban(
    String.raw`(^|["'\s:])(bg|text|border|ring|divide|accent|caret|outline|decoration|shadow|from|via|to)-(sky|blue|cyan|indigo|violet|purple|fuchsia|pink|rose|red|orange|amber|yellow|lime|green|emerald|teal)-[0-9]{2,3}`,
    'A hue carries meaning here, so it is a styles.ts decision. Add or derive a role there.',
  ),
  // #160: tap targets are sized across every control at once, never one at a
  // time. The variant is spelled in styles.ts and nowhere else.
  ban(String.raw`\btouch:`, 'The touch variant belongs to a TAP role in styles.ts.'),
]

// The panel is a near-constant width on every breakpoint, so a width variant
// used for padding re-spaced its rows on desktop windows that had not changed
// size, while leaving large tablets with mouse-tight rows. Nothing catches a
// relapse at build time: a `lg:py-*` reads as ordinary responsive code.
const PANEL_BANS = [
  ban(
    String.raw`\b(sm|md|lg|xl|2xl):(p[xytrbl]?|space-[xy]|gap|min-h|h)-`,
    'The panel is one width at every breakpoint. Size it by pointer, not by viewport.',
  ),
  {
    // Spelling type out per element is what let the panel drift into three
    // treatments for one kind of label. A heading may take a ROLE
    // (`className={...}`); what it may not do is carry a quoted class list of
    // its own, which is how the drift starts.
    selector:
      'JSXOpeningElement[name.name=/^h[1-3]$/] > JSXAttribute[name.name="className"] > Literal',
    message: 'Give a panel heading its treatment through a role in styles.ts.',
  },
]

// metrics.ts is the one vocabulary for the four metrics, and nothing in the
// type system stops a surface writing its own name: a string literal in JSX
// type-checks fine. Capitalisation is what keeps this off code — field
// identifiers are lowercase or camel, and the abbreviations only ever appeared
// in display copy with a leading capital.
const METRIC_BAN = ban(
  String.raw`\b(Precip(?!itation)|Temp(?!erature)|Avg|Min(?!imum)|Max(?!imum)|Elev(?!ation))\b`,
  'Compose a metric name from src/metrics.ts rather than spelling it here.',
)

// The text-bearing sources, where a class list can be written.
const COMPONENTS = ['src/App.tsx', 'src/components/*.tsx']

// Every surface that puts a metric's name in front of a reader. metrics.ts
// itself is absent on purpose: its comments quote these abbreviations to
// explain what went wrong, which is the one place naming them is the point.
const METRIC_SURFACES_IN_COMPONENTS = [
  'src/App.tsx',
  'src/components/ControlPanel.tsx',
  'src/components/ResultsTable.tsx',
  'src/components/TimeSeriesChart.tsx',
  'src/components/TimelineTransport.tsx',
]
const METRIC_SURFACES_ELSEWHERE = [
  'src/utils/chartData.ts',
  'src/utils/colors.ts',
  // The one file that writes a whole SENTENCE about a metric (#295).
  'src/utils/freezingLevel.ts',
  'src/utils/popupRows.ts',
  'src/utils/resultPopup.ts',
  // A downloaded file is read in a spreadsheet, where nothing around it says
  // which app wrote the header.
  'src/utils/resultsCsv.ts',
  'src/utils/tableColumns.ts',
]

export default [
  // The package lives two levels down so it can carry its own TypeScript (see
  // package.json), but the run happens from frontend/: ESLint reads a
  // `--config` file's patterns against the working directory, not against the
  // file's own folder, so `npm run lint` in frontend/ is the only invocation
  // these paths are correct for.
  { ignores: ['dist/**', 'node_modules/**', 'tools/**', 'public/**'] },

  ...tseslint.configs.recommended,

  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The pair the disable comments in this repo were written against, and
      // which nothing ran until now. Both are errors: a hook called
      // conditionally is a crash, and a dependency list that lies is a stale
      // render nobody sees until a reader hits it. The URL sync effect in
      // App.tsx was exactly that, silently, until this rule was switched on.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',

      // A leading underscore is how this codebase already says "declared
      // because the position needs filling, never read" — the same signal
      // tsconfig's noUnusedParameters honours — so the linter reads it the
      // same way rather than asking for a second spelling.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  // Rule options replace rather than merge, so the three blocks below hand each
  // file the WHOLE list it needs: class bans, metric ban, or both.
  { files: COMPONENTS, rules: { 'no-restricted-syntax': ['error', ...CLASS_BANS] } },
  { files: METRIC_SURFACES_ELSEWHERE, rules: { 'no-restricted-syntax': ['error', METRIC_BAN] } },
  {
    files: METRIC_SURFACES_IN_COMPONENTS,
    rules: { 'no-restricted-syntax': ['error', ...CLASS_BANS, METRIC_BAN] },
  },
  {
    files: ['src/components/ControlPanel.tsx'],
    rules: { 'no-restricted-syntax': ['error', ...CLASS_BANS, METRIC_BAN, ...PANEL_BANS] },
  },

  {
    // Recharts hands its chart callbacks internal state objects, and the types
    // it publishes for them do not describe what the payload actually carries:
    // `MouseHandlerDataParam` has no `chartY`, which the pointer handler reads
    // and which is present at run time. Retyping that boundary is a change of
    // its own rather than a lint fix, so the rule is lifted here alone and
    // keeps working in every other file.
    files: ['src/components/TimeSeriesChart.tsx'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
]
