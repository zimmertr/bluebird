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
  'src/components/ControlPanel.tsx',
  'src/components/DestinationsSection.tsx',
  'src/utils/panelMessages.ts',
  'src/components/MapView.tsx',
  'src/map/**/*.{ts,tsx}',
]

const OPEN_METEO = ['src/utils/openMeteo.ts', 'src/utils/openMeteoAggregate.ts', 'src/utils/openMeteoErrors.ts']

const DRAG_SURFACES = ['src/components/ResultsTableHeader.tsx', 'src/components/ColumnsPicker.tsx']

export const DATA = [
  {
    // The unreachable message is decided at the primitive, which only holds
    // while the primitive is the only door. Open-Meteo keeps its own, because
    // its failures are about a quota and a model domain rather than our pod.
    name: 'one-api-door',
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}', 'src/utils/apiFetch.ts', 'src/utils/openMeteo.ts'],
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
    ignores: ['src/utils/*.test.ts'],
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
      {
        selector: member('windowLimits', 'TSTypeReference[typeName.name="WindowLimits"]'),
        message: 'The panel takes windowLimits as a WindowLimits prop.',
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
    // The capped snow depth is marked by one module, so the three surfaces that
    // draw it cannot spell the mark or the ceiling a second way.
    name: 'snow-mark-shared',
    files: ['src/utils/resultsCells.ts', 'src/utils/popupRows.ts', 'src/utils/resultsCsv.ts'],
    ban: [
      { selector: text('≥'), message: 'Take the snow ceiling mark from snowCellText.' },
      { selector: spelled('1,?290'), message: 'Take the snow ceiling from snowCeiling.ts.' },
    ],
    require: [{ selector: named('snowCellText'), message: 'Draw a snow depth through snowCellText.' }],
  },
  {
    // recharts is about 105 KB gzip, and a reader who never opens the chart
    // must not pay for it.
    name: 'chart-lazy',
    files: ['src/App.tsx'],
    ban: [
      {
        selector: 'ImportDeclaration[source.value="./components/TimeSeriesChart"]',
        message: 'Import TimeSeriesChart lazily, never statically.',
      },
    ],
    require: [
      {
        selector: 'CallExpression[callee.name="lazy"] ImportExpression[source.value="./components/TimeSeriesChart"]',
        message: 'Load TimeSeriesChart through lazy().',
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
      { selector: named('DRAG_GHOST'), message: 'Draw the ghost with DRAG_GHOST.' },
      { selector: named('DRAG_INSERT'), message: 'Draw the insert line with DRAG_INSERT.' },
    ],
  },
  {
    // A finger holds the header's gesture rather than scrolling the page, and
    // the header takes both gestures from their hooks, where the checks above
    // hold them, rather than spelling one inline again.
    name: 'column-drag-header',
    files: ['src/components/ResultsTableHeader.tsx'],
    require: [
      { selector: 'Literal[value="touch-none"]', message: 'Hold the touch gesture with touch-none.' },
      { selector: calls('useColumnDrag'), message: 'Take the column drag from useColumnDrag.' },
      { selector: calls('useColumnResize'), message: 'Take the column resize from useColumnResize.' },
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
      { selector: named('DRAG_GRIP'), message: 'Hold the touch gesture on the DRAG_GRIP.' },
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
]
