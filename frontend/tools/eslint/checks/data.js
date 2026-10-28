import { calls, named, text } from '../plugin.js'

// A number or a string spelled anywhere in code, digits separated or not.
const spelled = (pattern) =>
  [`Literal[raw=/${pattern}/]`, `TemplateElement[value.raw=/${pattern}/]`, `JSXText[value=/${pattern}/]`].join(', ')

// An interface or type member of a given name and type.
const member = (name, type, optional = false) =>
  `TSPropertySignature[key.name="${name}"]${optional ? '[optional=true]' : ''} > TSTypeAnnotation > ${type}`

// The files that name the polygon-area cap to a reader or gate on it. The map
// folder is in by glob, so the rule follows the map's code wherever it moves.
const AREA_SURFACES = [
  'src/App.tsx',
  'src/hooks/useDestinationInputs.ts',
  'src/components/ControlPanel.tsx',
  'src/components/DestinationsSection.tsx',
  'src/utils/panelMessages.ts',
  'src/components/MapView.tsx',
  'src/map/**/*.{ts,tsx}',
]

const OPEN_METEO = ['src/utils/openMeteo.ts', 'src/utils/openMeteoAggregate.ts', 'src/utils/openMeteoErrors.ts']

const DRAG_SURFACES = ['src/components/ResultsTableHeader.tsx', 'src/components/ColumnsPicker.tsx']

// The app's code without its tests, for the one-home checks below: a suite
// spells a rule out on purpose, to hold the helper to the arithmetic it
// replaced or to build the input a helper reads.
const APP_CODE = ['src/**/*.{ts,tsx}']
const TESTS = ['src/**/*.test.{ts,tsx}', 'src/testSupport/**']

// A call of `Math.<fn>` or `Number.<fn>`, `fn` a name or a regex.
const mathCall = (fn) => `CallExpression[callee.object.name="Math"][callee.property.name=${fn}]`
const numberCall = (fn) => `CallExpression[callee.object.name="Number"][callee.property.name=${fn}]`
const MIN_MAX = mathCall('/^(min|max)$/')
const IS_FINITE = numberCall('"isFinite"')
// A test that a value is there, or is a number: the half of a finite check
// that exists only because `Number.isFinite`'s lib type narrows nothing. The
// undefined arm names its type, because esquery reads an absent `name` as the
// string "undefined".
const PRESENCE_TEST =
  'BinaryExpression[operator=/^[!=]==?$/]:matches([right.raw="null"], [right.type="Identifier"][right.name="undefined"], [left.operator="typeof"])'

export const DATA = [
  {
    // The unreachable message is decided at the primitive, which only holds
    // while the primitive is the only door. Open-Meteo keeps its own, because
    // its failures are about a quota and a model domain rather than our pod,
    // and so does the tile host the glacier check reads (#748), whose failure
    // is no message at all: the snow card keeps its depth word. The point
    // readings a click on the radar or the snow takes (#737) have one door of
    // their own for the same reason: a failed reading is no message.
    name: 'one-api-door',
    files: ['src/**/*.{ts,tsx}'],
    ignores: [
      'src/**/*.test.{ts,tsx}',
      'src/utils/apiFetch.ts',
      'src/utils/glacierCell.ts',
      'src/utils/openMeteo.ts',
      'src/utils/pointReadout.ts',
    ],
    probe: 'src/App.tsx',
    ban: [
      {
        selector: calls('fetch'),
        message: 'Call apiFetch or apiJson from utils/apiFetch.ts rather than fetch.',
      },
    ],
  },
  {
    // A declaration file emits nothing, so the schema cannot be imported as a
    // value at all. This catches the near miss: a value import that reads fine
    // today and that a later edit could reach for at run time.
    name: 'schema-types-only',
    files: ['src/**/*.{ts,tsx}'],
    probe: 'src/api-compat.ts',
    ban: [
      {
        selector:
          'ImportDeclaration[source.value=/api-schema$/][importKind="value"], ' +
          'ExportNamedDeclaration[source.value=/api-schema$/][exportKind="value"]',
        message: 'Import the generated API schema with `import type`.',
      },
    ],
  },
  {
    // A page rendered outside the boundary goes blank again on a render error.
    // Every top-level entry is covered, so an entry added later is too.
    name: 'entries-inside-boundary',
    files: ['src/*.tsx'],
    probe: 'src/main.tsx',
    ban: [
      {
        selector:
          'CallExpression[callee.property.name="render"][callee.object.callee.property.name="createRoot"]' +
          ':not(:has(JSXElement[openingElement.name.name="ErrorBoundary"] > JSXElement))',
        message: 'Render an entry page inside <ErrorBoundary>.',
      },
      {
        selector:
          'Program:not(:has(ImportDeclaration[source.value="./components/ErrorBoundary"])) ' +
          'CallExpression[callee.property.name="createRoot"]',
        message: 'Import the ErrorBoundary from ./components/ErrorBoundary in an entry.',
      },
    ],
    require: [{ selector: calls('createRoot'), min: 0, max: 1, message: 'An entry creates one root.' }],
  },
  {
    // The cap is published by /api/capabilities and reaches the browser there.
    // A number compiled into a surface is the mirrored constant that was
    // removed, reborn.
    name: 'area-cap-published',
    files: AREA_SURFACES,
    ban: [
      {
        selector: spelled('100[_,]?000'),
        message: 'Read the polygon-area cap from /api/capabilities rather than spelling it.',
      },
      {
        selector: `${named('MAX_AREA_KM2')}, ${text('MAX_AREA_KM2')}`,
        message: 'Do not bring back the mirrored MAX_AREA_KM2.',
      },
    ],
  },
  {
    // The archive's reach is published too, so the calendar reads it off the
    // band it is handed and the panel takes it as a prop.
    name: 'archive-reach-published',
    // The calendar is a barrel over sibling modules, and the reach must not
    // appear in any of them.
    files: [
      'src/utils/calendar*.ts',
      'src/components/ControlPanel.tsx',
      'src/components/ForecastSection.tsx',
      'src/utils/panelMessages.ts',
    ],
    ignores: ['src/utils/**/*.test.ts'],
    probe: 'src/utils/calendarBand.ts',
    ban: [
      {
        selector: spelled('365'),
        message: 'Read the archive reach from /api/capabilities rather than spelling it.',
      },
    ],
  },
  {
    // The panel reads the air-quality horizon from its props. The compiled
    // number is a fallback, and only the hook that falls back may read it.
    name: 'aqi-horizon-published',
    files: ['src/components/ControlPanel.tsx', 'src/components/ForecastSection.tsx', 'src/utils/panelMessages.ts'],
    ban: [
      {
        selector: `${named('AQI_LIMIT_DAYS')}, ${text('AQI_LIMIT_DAYS')}`,
        message: 'Read the air-quality horizon from the panel props, not AQI_LIMIT_DAYS.',
      },
    ],
  },
  {
    // Each published limit reaches the panel as a prop rather than as an
    // import from the map or a module-level constant.
    name: 'panel-limit-props',
    files: ['src/components/ControlPanel.tsx'],
    require: [
      { selector: member('maxAreaKm2', 'TSNumberKeyword'), message: 'The panel takes maxAreaKm2 as a number prop.' },
      { selector: member('archiveDays', 'TSNumberKeyword'), message: 'The panel takes archiveDays as a number prop.' },
      {
        selector: member('aqiForecastDays', 'TSNumberKeyword'),
        message: 'The panel takes aqiForecastDays as a number prop.',
      },
    ],
  },
  {
    // The panel's messages read the same limits off the state App hands them
    // (record 0208), the window bounds among them, which the panel itself no
    // longer reads: a message about a window is the hook's to compose.
    name: 'messages-limit-state',
    files: ['src/hooks/usePanelMessages.ts'],
    require: [
      { selector: member('maxAreaKm2', 'TSNumberKeyword'), message: 'The messages take maxAreaKm2 as a number.' },
      { selector: member('archiveDays', 'TSNumberKeyword'), message: 'The messages take archiveDays as a number.' },
      { selector: member('aqiForecastDays', 'TSNumberKeyword'), message: 'The messages take aqiForecastDays as a number.' },
      {
        selector: member('windowLimits', 'TSTypeReference[typeName.name="WindowLimits"]'),
        message: 'The messages take windowLimits as a WindowLimits.',
      },
    ],
  },
  {
    // The calendar takes the archive reach as the band it draws, and the
    // air-quality horizon as an argument. A single digit cannot be banned in
    // calendar.ts without failing an array index, so the guarantee is the
    // shape: there is nowhere for a module-level count to be read from.
    name: 'calendar-limit-args',
    files: ['src/utils/calendarBand.ts'],
    require: [
      { selector: member('pastDays', 'TSNumberKeyword'), message: 'The band carries pastDays as a number.' },
      {
        selector:
          'FunctionDeclaration[id.name="aqiHorizon"][params.length=2][params.0.name="now"]' +
          '[params.0.typeAnnotation.typeAnnotation.typeName.name="Date"][params.1.name="aqiDays"]' +
          '[params.1.typeAnnotation.typeAnnotation.type="TSNumberKeyword"]',
        message: 'aqiHorizon takes the day count as aqiHorizon(now: Date, aqiDays: number).',
      },
    ],
  },
  {
    // The fetch clamps to the same horizon the calendar dims by, so it takes it
    // the same way. A fetch clamped at a compiled number under a calendar drawn
    // at a published one would empty a day drawn as covered.
    name: 'aqi-fetch-horizon-arg',
    files: ['src/utils/openMeteo.ts'],
    require: [
      {
        selector: member('aqiForecastDays', 'TSNumberKeyword', true),
        message: 'The air-quality fetch takes aqiForecastDays as an optional number.',
      },
    ],
  },
  {
    // Whether a destination with no elevation is read at the terrain height is
    // decided per place, by its type (#545): a peak stands above the model's
    // terrain and a lake or trailhead sits on it. So the fetches of places set
    // no fetch-wide `terrainElevation`, which would read a lake like a peak,
    // and each carries `terrainFallback` from its row to the coordinate: the
    // analysis, and the model comparison through the points it is handed.
    name: 'terrain-elevation-fallback',
    files: ['src/utils/clientAnalyze.ts', 'src/hooks/useModelCompare.ts', 'src/hooks/useChartCompare.ts'],
    ban: [
      {
        selector: 'Property[key.name="terrainElevation"]',
        message: 'Decide the terrain height per place with terrainFallback, not for the whole fetch.',
      },
    ],
    require: [
      {
        selector: 'Property[key.name="terrainFallback"]',
        message: 'Carry each place\'s terrainFallback onto the coordinate it is fetched by.',
      },
    ],
  },
  {
    // The browser path puts a thrown message in the notice box unchanged, so
    // it is copy the reader meets, and copy ends on the standing tail. A cancel
    // is the one throw nothing shows. A throw of a shared constant carries no
    // literal to read, which is the point of the constant.
    name: 'open-meteo-throw-tail',
    files: OPEN_METEO,
    ban: [
      {
        selector:
          'ThrowStatement > NewExpression[callee.name!="DOMException"][arguments.0.type="Literal"][arguments.0.value!=/Try again later\\.$/], ' +
          'ThrowStatement > NewExpression[callee.name!="DOMException"][arguments.0.type="TemplateLiteral"] > TemplateLiteral > TemplateElement[tail=true][value.raw!=/Try again later\\.$/]',
        message: 'End a thrown Open-Meteo message with "Try again later."',
      },
    ],
  },
  {
    // The copy lints over the Open-Meteo client and the one derivation every
    // surface reads.
    name: 'open-meteo-copy',
    files: [...OPEN_METEO, 'src/utils/present.ts'],
    ban: [
      {
        selector: text(String.raw`\bthe weather service\b`, 'i'),
        message: 'Name Open-Meteo rather than "the weather service".',
      },
      {
        // Raw interpolation after "failed:" inserts a value with no sentence
        // around it.
        selector: 'TemplateElement[tail=false][value.raw=/failed:\\s*$/]',
        message: 'Wrap an error detail in a sentence rather than after "failed:".',
      },
      {
        // The old remedy for an oversized analysis, replaced by the refusal.
        selector: text('(?:analyze|draw) a smaller area', 'i'),
        message: 'Drop the "a smaller area" remedy phrase.',
      },
      {
        selector: text('Please try again|Try again shortly', 'i'),
        message: 'End on the standing tail "Try again later." instead.',
      },
    ],
  },
  {
    // recharts is about 105 KB gzip, and a reader who never opens the chart
    // must not pay for it.
    name: 'chart-lazy',
    files: ['src/components/ResultsPanels.tsx'],
    ban: [
      {
        selector: 'ImportDeclaration[source.value="./TimeSeriesChart"]',
        message: 'Import TimeSeriesChart lazily, never statically.',
      },
    ],
    require: [
      {
        selector: 'CallExpression[callee.name="lazy"] ImportExpression[source.value="./TimeSeriesChart"]',
        message: 'Load TimeSeriesChart through lazy().',
      },
    ],
  },
  {
    // The lazy import only keeps recharts out of the entry chunk while nothing
    // else imports the chart statically. Its own tests do, and are not shipped.
    name: 'chart-never-static',
    files: ['src/App.tsx', 'src/components/*.tsx'],
    ignores: ['src/components/*.test.tsx'],
    probe: 'src/App.tsx',
    ban: [
      {
        selector: 'ImportDeclaration[importKind="value"][source.value=/TimeSeriesChart$/]',
        message: 'Import TimeSeriesChart only through the lazy() in ResultsPanels.',
      },
    ],
  },
  {
    // public/icon.png keeps a stable unhashed name so a scraper can find it,
    // and is served no-cache for that reason. Anything the app draws carries a
    // content hash instead.
    name: 'logo-hashed',
    files: ['src/App.tsx', 'src/components/*.tsx', 'src/map/**/*.{ts,tsx}'],
    ignores: ['src/components/*.test.tsx', 'src/map/**/*.test.{ts,tsx}'],
    ban: [{ selector: 'Literal[value="/icon.png"]', message: 'Draw the logo from the hashed asset, never /icon.png.' }],
  },
  {
    // The two comparison blockers were read and approved as written, and each
    // is composed from the metric vocabulary rather than spelled.
    name: 'comparison-blocker-copy',
    files: ['src/utils/panelMessages.ts'],
    require: [
      {
        selector:
          'TemplateLiteral[quasis.0.value.raw=""][quasis.length=2]:has(> MemberExpression[object.name="NOUN"][property.name="aqi"])' +
          ':has(> TemplateElement[value.raw=" data is retrieved independently of the model and cannot be compared."])',
        message: 'Keep the approved air-quality comparison blocker.',
      },
      {
        selector:
          'TemplateLiteral[quasis.0.value.raw=""][quasis.length=3]:has(> MemberExpression[object.name="NOUN"][property.name="freeze"])' +
          ':has(> TemplateElement[value.raw=" data is not available for "])' +
          ':has(> CallExpression[callee.name="listPhrase"][arguments.0.name="freezeGaps"])' +
          ':has(> TemplateElement[value.raw="."])',
        message: 'Keep the approved freezing-level comparison blocker.',
      },
    ],
  },
  {
    // Both surfaces that reorder columns ask the shared gesture module when a
    // press becomes a drag and where it lands, and both commit only a real move
    // on release. The header's gesture is its hook, the picker's is inline.
    name: 'column-drag-shared',
    files: ['src/components/ColumnsPicker.tsx', 'src/hooks/useColumnDrag.ts'],
    require: [
      { selector: calls('dragBegins'), message: 'Ask dragBegins when a press becomes a drag.' },
      { selector: calls('keyAtPosition'), message: 'Ask keyAtPosition which column is under the pointer.' },
      { selector: calls('dropEdge'), message: 'Ask dropEdge where the column would land.' },
      {
        selector:
          'IfStatement[test.type="LogicalExpression"][test.right.operator="!=="][test.right.left.name="landing"][test.right.right.name="key"]' +
          ' > ExpressionStatement > CallExpression[callee.name="onColumnMove"][arguments.0.name="key"][arguments.1.name="landing"]',
        message: 'Commit on release only when the column lands somewhere new.',
      },
    ],
  },
  {
    // Both surfaces draw a drag the same way: the ghost where the shared module
    // puts it, and the insert line in the gap.
    name: 'column-drag-draw',
    files: DRAG_SURFACES,
    require: [
      { selector: calls('ghostLeft'), message: 'Ask ghostLeft where the ghost sits.' },
      { selector: 'MemberExpression[object.name="DRAG"][property.name="ghost"]', message: 'Draw the ghost with DRAG.ghost.' },
      { selector: 'MemberExpression[object.name="DRAG"][property.name="insert"]', message: 'Draw the insert line with DRAG.insert.' },
    ],
  },
  {
    // A finger holds the header's gesture rather than scrolling the page, and
    // the header takes both gestures from their hooks, where the checks above
    // hold them, rather than spelling one inline again. A sort needs no
    // pointer, so the header cell carries the keyboard route to it the way
    // the picker's grip carries one to the reorder.
    name: 'column-drag-header',
    files: ['src/components/ResultsTableHeader.tsx'],
    require: [
      { selector: 'Literal[value="touch-none"]', message: 'Hold the touch gesture with touch-none.' },
      { selector: calls('useColumnDrag'), message: 'Take the column drag from useColumnDrag.' },
      { selector: calls('useColumnResize'), message: 'Take the column resize from useColumnResize.' },
      {
        selector: 'JSXOpeningElement[name.name="th"] > JSXAttribute[name.name="tabIndex"] Literal[value=0]',
        message: 'Put a sortable header in the tab order.',
      },
      {
        selector: 'BinaryExpression[left.object.name="e"][left.property.name="key"][right.value="Enter"]',
        message: 'Sort a header on Enter.',
      },
      {
        selector: 'BinaryExpression[left.object.name="e"][left.property.name="key"][right.value=" "]',
        message: 'Sort a header on Space.',
      },
    ],
  },
  {
    // Both header gestures are tracked on document rather than on the cell: a
    // drag leaves the cell it started in on its first frame.
    name: 'column-gesture-document',
    files: ['src/hooks/useColumnDrag.ts', 'src/hooks/useColumnResize.ts'],
    require: [
      {
        selector: 'CallExpression[callee.object.name="document"][callee.property.name="addEventListener"][arguments.0.value="pointermove"]',
        message: 'Track the header gesture on document.',
      },
    ],
  },
  {
    // The resize handle sits inside the header, so its press must never reach
    // the reorder or the sort.
    name: 'column-resize-handle',
    files: ['src/hooks/useColumnResize.ts'],
    require: [
      {
        selector:
          ':matches(FunctionDeclaration, FunctionExpression)[id.name="beginColumnResize"] CallExpression[callee.object.name="e"][callee.property.name="stopPropagation"]',
        message: 'Keep the resize handle from reaching the reorder.',
      },
    ],
  },
  {
    // A drag needs a pointer, so the picker's grip carries the keyboard path.
    name: 'column-drag-picker',
    files: ['src/components/ColumnsPicker.tsx'],
    require: [
      { selector: 'MemberExpression[object.name="DRAG"][property.name="grip"]', message: 'Hold the touch gesture on DRAG.grip.' },
      {
        selector: 'BinaryExpression[operator="==="][left.object.name="e"][left.property.name="key"][right.value="ArrowUp"]',
        message: 'Move a column up by the arrow key.',
      },
      {
        selector: 'BinaryExpression[operator="==="][left.object.name="e"][left.property.name="key"][right.value="ArrowDown"]',
        message: 'Move a column down by the arrow key.',
      },
    ],
  },
  {
    // The drag ghost never takes the pointer, or the drop would land on it.
    name: 'drag-ghost-inert',
    files: ['src/styles.ts'],
    require: [
      { selector: text('pointer-events-none fixed'), message: 'Keep the drag ghost pointer-events-none fixed.' },
    ],
  },
  // The checks below hold a rule that was spelled in several shapes to the one
  // helper that owns it (#690), so a new site imports it rather than spelling
  // a seventh shape. Each spares the helper's own module.
  {
    // Three private clamps answered an inverted range two ways, and 21 inline
    // ones in 15 files a third. `clamp` in utils/numbers.ts is the rule; a
    // Math.min that is a direct argument of a Math.max (or the reverse) is a
    // clamp spelled again. calendarSelection.ts clamps a day key between two
    // strings, which is not this rule, and is `clampDay` so it reads apart.
    name: 'clamp-one-home',
    files: APP_CODE,
    ignores: [...TESTS, 'src/utils/numbers.ts'],
    probe: 'src/utils/layout.ts',
    ban: [
      {
        selector: `${MIN_MAX} > ${MIN_MAX}.arguments`,
        message: 'Bound a number with clamp() from utils/numbers.ts rather than nesting Math.min and Math.max.',
      },
      {
        selector: 'FunctionDeclaration[id.name="clamp"], VariableDeclarator[id.name="clamp"]',
        message: 'Import clamp() from utils/numbers.ts rather than declaring another.',
      },
    ],
  },
  {
    // `x != null && Number.isFinite(x)` and its three siblings were the same
    // test spelled for the type checker. isFiniteNumber narrows once. Matched
    // by shape alone, since a selector cannot tell that both halves name one
    // value; a plain Number.isFinite on a value already typed number stays.
    name: 'finite-number-one-home',
    files: APP_CODE,
    ignores: [...TESTS, 'src/utils/numbers.ts'],
    probe: 'src/utils/smoke.ts',
    ban: [
      {
        selector:
          `LogicalExpression:has(> ${PRESENCE_TEST}):has(> :matches(${IS_FINITE}, UnaryExpression[operator="!"]:has(> ${IS_FINITE})))`,
        message: 'Test a value with isFiniteNumber() from utils/numbers.ts rather than a null test beside Number.isFinite.',
      },
    ],
  },
  {
    // Grouped numbers take the reader's locale everywhere through grouped(),
    // so one session never prints 1.500 beside 1,500. The over-cap refusal
    // spells en-US because its sentence mirrors the backend's (mirror row 18).
    // Every date call here passes arguments, so a bare call is a number.
    name: 'number-format-one-home',
    files: APP_CODE,
    ignores: [...TESTS, 'src/utils/numbers.ts', 'src/utils/clientAnalyze.ts'],
    probe: 'src/utils/panelMessages.ts',
    ban: [
      {
        selector: 'CallExpression[callee.property.name="toLocaleString"][arguments.length=0]',
        message: 'Group a number with grouped() from utils/numbers.ts rather than a bare toLocaleString().',
      },
      {
        selector: 'CallExpression[callee.property.name="toLocaleString"][arguments.0.value="en-US"]',
        message: 'Group a number in the reader\'s locale with grouped(); only the over-cap refusal spells en-US.',
      },
    ],
  },
  {
    // `Math.round(x * 10 ** n) / 10 ** n` rounds a negative tie toward zero.
    // roundTo rounds the magnitude, so a tie goes the same way either side of
    // zero. openMeteoAggregate.ts's roundHalfEven mirrors Python's round and
    // spells no division.
    name: 'round-one-home',
    files: APP_CODE,
    ignores: [...TESTS, 'src/utils/numbers.ts'],
    probe: 'src/utils/urlParams.ts',
    ban: [
      {
        selector: `BinaryExpression[operator="/"] > ${mathCall('"round"')}.left`,
        message: 'Round to decimal places with roundTo() from utils/numbers.ts.',
      },
    ],
  },
  {
    // The server's metres-to-feet factor for an OSM `ele` (mirror row 20).
    // FT_TO_M in openMeteoAggregate.ts is the exact ISA factor, a different
    // number, and stays.
    name: 'feet-per-meter-one-home',
    files: APP_CODE,
    ignores: ['src/utils/basemapPoi.ts'],
    probe: 'src/utils/geocode.ts',
    ban: [
      {
        selector: 'Literal[value=3.28084]',
        message: 'Read FEET_PER_METER from utils/basemapPoi.ts rather than spelling the factor.',
      },
    ],
  },
  {
    // A coordinate on the globe is one bound, |lat| <= 90 and |lon| <= 180,
    // which onGlobe in utils/points.ts owns. MapLibre's Mercator latitude in
    // mapView.ts is another rule, and spells 85.05.
    name: 'globe-one-home',
    files: APP_CODE,
    ignores: [...TESTS, 'src/utils/points.ts'],
    probe: 'src/utils/customDestinations.ts',
    ban: [
      {
        selector: `BinaryExpression:has(> ${mathCall('"abs"')}):matches([right.value=90], [right.value=180], [left.value=90], [left.value=180])`,
        message: 'Ask onGlobe() in utils/points.ts whether a coordinate is on the globe.',
      },
    ],
  },
  {
    // The mark a missing value prints, beside UNAVAILABLE, the other one.
    name: 'missing-mark-one-home',
    files: APP_CODE,
    ignores: [...TESTS, 'src/utils/unavailableCell.ts'],
    probe: 'src/utils/tableColumns.ts',
    ban: [
      {
        selector: 'Literal[value="\u2014"], JSXText[value=/^\\s*\u2014\\s*$/]',
        message: 'Print a missing value with NO_VALUE_MARK from utils/unavailableCell.ts.',
      },
    ],
  },
  {
    // The mark an unavailable value prints, beside NO_VALUE_MARK. The Wildfire
    // and Closure columns, the file and the point cards spelled it four more
    // times. A test still spells it, because a test pins what the reader sees.
    name: 'unavailable-mark-one-home',
    files: APP_CODE,
    ignores: [...TESTS, 'src/utils/unavailableCell.ts'],
    probe: 'src/utils/resultsCsv.ts',
    ban: [
      {
        selector: 'Literal[value="N/A"]',
        message: 'Print an unavailable value with UNAVAILABLE from utils/unavailableCell.ts.',
      },
    ],
  },
  {
    // An instant floored to its hour, and the time units, are forecastWindow.ts's.
    name: 'time-units-one-home',
    files: APP_CODE,
    ignores: [...TESTS, 'src/utils/forecastWindow.ts'],
    probe: 'src/utils/model/modelCompare.ts',
    ban: [
      {
        selector: 'BinaryExpression[operator="%"][right.name="HOUR_MS"]',
        message: 'Floor an instant with floorHour() from utils/forecastWindow.ts.',
      },
      {
        selector: 'Literal[value=3600000], Literal[value=86400000]',
        message: 'Read HOUR_MS or DAY_MS from utils/forecastWindow.ts rather than spelling the milliseconds.',
      },
    ],
  },
  {
    // One parser of the header, strict to RFC 9110's delta-seconds; Open-Meteo
    // composes it with its own floor.
    name: 'retry-after-one-home',
    files: APP_CODE,
    ignores: [...TESTS, 'src/utils/apiFetch.ts'],
    probe: 'src/utils/openMeteo.ts',
    ban: [
      {
        selector: 'Literal[value=/^retry-after$/i]',
        message: 'Read Retry-After with retryAfterSeconds() from utils/apiFetch.ts.',
      },
    ],
  },
  {
    // A cancel is read off its name (utils/abort.ts): in Vitest's jsdom project
    // a real abort is no instance of the global DOMException. Tests are in,
    // because a suite that asked instanceof would pass for the wrong realm.
    name: 'abort-test-one-home',
    files: [...APP_CODE, 'e2e/**/*.ts'],
    ignores: ['src/utils/abort.ts'],
    probe: 'src/utils/analysisFailure.ts',
    ban: [
      {
        selector: 'BinaryExpression[operator=/^[!=]==?$/]:matches([right.value="AbortError"], [left.value="AbortError"])',
        message: 'Ask isAbort() from utils/abort.ts rather than comparing a name to AbortError.',
      },
      {
        selector: 'BinaryExpression[operator="instanceof"][right.name="DOMException"]',
        message: 'Ask isAbort() from utils/abort.ts rather than instanceof DOMException, which fails across realms.',
      },
    ],
  },
]
