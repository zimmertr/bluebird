// See plugin.js for the shape of a check.
import { named, text } from '../plugin.js'

// An effect's dependency list is its array argument; the callback is the other.
// Scoped to useEffect on purpose: a useMemo over the same value is a derivation
// and costs one recomputation, where an effect is a commit.
const EFFECT = 'CallExpression[callee.name="useEffect"]'
const keyedOn = (name) => `${EFFECT} > ArrayExpression > Identifier[name="${name}"]`
const keyedOnlyOn = (name) => `${EFFECT} > ArrayExpression[elements.length=1] > Identifier[name="${name}"]`

// `n > 0` where n is the length read off the given path.
const hasAny = (side, object) =>
  `[${side}.operator=">"][${side}.right.value=0][${side}.left.property.name="length"]${object(`${side}.left.object`)}`

const MEMOIZED = 'JSXOpeningElement[name.name=/^(ResultsTable|TimeSeriesChart|MapView)$/] > JSXAttribute'
const MEMOIZED_ROWS = 'JSXOpeningElement[name.name=/^(ResultsTableRow|PendingRow)$/] > JSXAttribute'

// The bottom edge is measured in resultsSheet.ts and applied as a style. The
// sheet itself is `bottom-0` and stands on the edge, so zero is let through.
const BOTTOM_OFFSET = {
  selector: text('\\bbottom-(?:[1-9]|\\[)'),
  message: 'Take a bottom offset from resultsSheet.ts rather than spelling one as a class.',
}

// A grid surface that hangs off the one composed flag, as `gridOn && ...`.
const offGridOn = (name) => ({
  selector:
    `VariableDeclarator[id.name="${name}"] > LogicalExpression[operator="&&"]` +
    ':matches([left.name="gridOn"], [left.left.name="gridOn"], [left.left.left.name="gridOn"])',
  message: `Derive ${name} from gridOn.`,
})

const HISTORY_WRITE =
  'CallExpression[callee.property.name="replaceState"][callee.object.property.name="history"][callee.object.object.name="window"]'

const BOTH_BUTTON =
  'JSXOpeningElement:has(JSXAttribute[name.name="onClick"] CallExpression[callee.name="chooseResultsMode"][arguments.0.value="both"])'

const OPEN_RESULTS =
  'IfStatement[test.name="willRank"][consequent.expression.callee.name="setShowResults"][consequent.expression.arguments.0.value=true]'
const AWAITS_ANALYSIS = '*:has(AwaitExpression > CallExpression[callee.name="analyze"])'

export const APP = [
  {
    // `csvRows` is `parseCustomCsv(customCsv)`, a fresh array on every
    // keystroke in the coordinates box. An effect keyed on it runs per
    // character, and one that calls a setter schedules an update per character
    // from a passive effect: fifty in a row is React error 185. Depend on the
    // fact the effect reads, not on the array it reads it from.
    name: 'app-effect-keys',
    files: ['src/App.tsx'],
    ban: [
      { selector: keyedOn('csvRows'), message: 'Key no effect on csvRows, which is a new array per keystroke.' },
    ],
    require: [
      // Vacuous if the effects stop being written as useEffect calls.
      // The floor is what App.tsx keeps. An effect that moves into a hook is
      // counted by that hook's own check, so the sum never drops.
      { selector: EFFECT, min: 7, message: 'App.tsx runs its effects through useEffect.' },
      { selector: keyedOnlyOn('destinationNamed'), message: 'Open the results panel in an effect keyed on destinationNamed alone.' },
    ],
  },
  {
    // The inputs half of app-effect-keys: the fact the results panel opens on
    // is derived where the inputs live, and no effect there may key on the
    // per-keystroke rows either. The pin restore is the one effect the hook
    // took from App.tsx.
    name: 'destination-inputs-hook',
    files: ['src/hooks/useDestinationInputs.ts'],
    ban: [
      { selector: keyedOn('csvRows'), message: 'Key no effect on csvRows here either.' },
    ],
    require: [
      {
        // The panel still opens the moment a destination is named: the ban is
        // about how the effect is keyed, not about dropping it.
        selector:
          'VariableDeclarator[id.name="destinationNamed"] > LogicalExpression[operator="||"]' +
          hasAny('left', (p) => `[${p}.object.name="searched"][${p}.property.name="places"]`) +
          hasAny('right', (p) => `[${p}.name="csvRows"]`),
        message: 'Derive destinationNamed from searched.places and csvRows lengths.',
      },
      { selector: EFFECT, count: 1, message: 'useDestinationInputs.ts restores the pins in one useEffect.' },
    ],
  },
  {
    // The Enter and Escape listener is the one effect this hook took from
    // App.tsx.
    name: 'draw-mode-hook',
    files: ['src/hooks/useDrawMode.ts'],
    require: [
      { selector: EFFECT, count: 1, message: 'useDrawMode.ts listens for Enter and Escape in one useEffect.' },
    ],
  },
  {
    // The removals and the report both take the pasted rows, and neither may
    // key an effect on them, for app-effect-keys' reason.
    name: 'report-csv-rows-keys',
    files: ['src/hooks/usePresentedReport.ts', 'src/hooks/useRemovals.ts'],
    ban: [
      { selector: keyedOn('csvRows'), message: 'Key no effect on csvRows in the removals or the report.' },
    ],
  },
  {
    // The two identity effects and the detail-sort follow are the three
    // effects this hook took from App.tsx. The provisional count
    // is built here too, so its "so far" is checked here.
    name: 'presented-report-hook',
    files: ['src/hooks/usePresentedReport.ts'],
    require: [
      {
        selector:
          'VariableDeclarator[id.name="tail"] > ConditionalExpression[test.name="arriving"][consequent.value=" so far"][alternate.value=""]',
        message: 'Mark the arriving count with the tail " so far".',
      },
      { selector: EFFECT, count: 3, message: 'usePresentedReport.ts runs its three effects through useEffect.' },
    ],
  },
  {
    // `results` is App.tsx's `chartCandidates`, rebuilt once per keystroke in
    // the coordinates box and once per live knob change, for a set that has
    // usually not changed. The debut scan keys on the set's identity instead.
    // The selected rows are looked up through an index: a scan per row was
    // 895,000 key builds on a 946-destination report.
    name: 'app-chart-selection',
    files: ['src/hooks/useChartSelection.ts'],
    ban: [
      { selector: keyedOn('results'), message: 'Key no effect on the results array, which is new per render.' },
      {
        selector:
          'CallExpression[callee.property.name="find"]:matches([callee.object.name="results"], [callee.object.property.name="results"])',
        message: 'Look the selected rows up through byKey rather than scanning results.',
      },
    ],
    require: [
      { selector: EFFECT, count: 2, message: 'useChartSelection.ts runs its two effects through useEffect.' },
      {
        selector:
          'VariableDeclarator[id.name="candidatesKey"] > CallExpression[callee.name="useMemo"]' +
          '[arguments.0.type="ArrowFunctionExpression"][arguments.0.body.callee.name="candidateSetKey"]' +
          '[arguments.0.body.arguments.length=1][arguments.0.body.arguments.0.name="results"]' +
          '[arguments.1.elements.length=1][arguments.1.elements.0.name="results"]',
        message: 'Memoize candidatesKey as candidateSetKey(results).',
      },
      { selector: keyedOnlyOn('candidatesKey'), message: 'Debut in an effect keyed on candidatesKey alone.' },
      {
        selector: 'CallExpression[callee.object.name="byKey"][callee.property.name="get"][arguments.0.name="k"]',
        message: 'Index the rows as byKey and read byKey.get(k).',
      },
    ],
  },
  {
    // React.memo is worth nothing if the parent hands a fresh value on every
    // render. MapView's own memo is the `map-view-wiring` check in map.js.
    name: 'app-memoized',
    files: [
      'src/components/ResultsTable.tsx',
      'src/components/ResultsTableRow.tsx',
      'src/components/ResultsTableHeader.tsx',
      'src/components/TimeSeriesChart.tsx',
    ],
    require: [
      {
        selector:
          'ExportDefaultDeclaration > CallExpression[callee.name="memo"] > Identifier[name=/^(ResultsTable|ResultsTableRow|ResultsTableHeader|TimeSeriesChart)$/]',
        count: 1,
        message: 'Export the component as memo(Component).',
      },
    ],
  },
  {
    // The pending row is memoized like the ranked one, but exported by name
    // rather than as the default, so app-memoized's selector cannot see it.
    name: 'table-pending-row-memoized',
    files: ['src/components/ResultsTableRow.tsx'],
    require: [
      {
        selector: 'VariableDeclarator[id.name="PendingRow"] > CallExpression[callee.name="memo"]',
        count: 1,
        message: 'Export PendingRow as memo(PendingTableRow).',
      },
    ],
  },
  {
    // The three memoized children compare their props by identity, so an
    // inline function or a fresh empty literal re-renders a row per destination
    // on every overlay toggle. Wrap a function in useCallback, hoist a constant.
    name: 'app-memo-props',
    files: ['src/App.tsx'],
    ban: [
      {
        selector: `${MEMOIZED} :matches(ArrowFunctionExpression, FunctionExpression)`,
        message: 'Hand a memoized child a useCallback, not an inline function.',
      },
      {
        selector: `${MEMOIZED} > JSXExpressionContainer > ArrayExpression[elements.length=0]`,
        message: 'Hand a memoized child a hoisted empty array, not a literal one.',
      },
      {
        selector:
          `${MEMOIZED} LogicalExpression[operator="??"]` +
          ':matches([right.type="ArrayExpression"][right.elements.length=0], [right.type="ObjectExpression"][right.properties.length=0])',
        message: 'Hand a memoized child a hoisted fallback, not a fresh ?? literal.',
      },
    ],
    require: [
      { selector: 'JSXOpeningElement[name.name="ResultsTable"]', message: 'App.tsx renders ResultsTable.' },
      { selector: 'JSXOpeningElement[name.name="TimeSeriesChart"]', message: 'App.tsx renders TimeSeriesChart.' },
      { selector: 'JSXOpeningElement[name.name="MapView"]', message: 'App.tsx renders MapView.' },
    ],
  },
  {
    // The results table draws one memoized row per destination, so the same
    // rule holds one level down: a fresh value on a row's props redraws every
    // row the table holds.
    name: 'table-row-memo-props',
    files: ['src/components/ResultsTable.tsx'],
    ban: [
      {
        selector: `${MEMOIZED_ROWS} :matches(ArrowFunctionExpression, FunctionExpression)`,
        message: 'Hand a table row a stable callback, not an inline function.',
      },
      {
        selector: `${MEMOIZED_ROWS} > JSXExpressionContainer > ArrayExpression[elements.length=0]`,
        message: 'Hand a table row a hoisted empty array, not a literal one.',
      },
      {
        selector:
          `${MEMOIZED_ROWS} LogicalExpression[operator="??"]` +
          ':matches([right.type="ArrayExpression"][right.elements.length=0], [right.type="ObjectExpression"][right.properties.length=0])',
        message: 'Hand a table row a hoisted fallback, not a fresh ?? literal.',
      },
    ],
    require: [
      { selector: 'JSXOpeningElement[name.name="ResultsTableRow"]', message: 'ResultsTable.tsx renders ResultsTableRow.' },
      { selector: 'JSXOpeningElement[name.name="PendingRow"]', message: 'ResultsTable.tsx renders PendingRow.' },
    ],
  },
  {
    // Two windows answer "is this one hour": the panel's When selection and
    // the analyzed report. The Metrics table is a panel control, so its
    // aggregate dropdowns read the selection and follow a switch at once
    // (#485). The results table and the table view's column-width reset read
    // the report, because its rows were fetched for the analyzed window and a When switch
    // alone fetches nothing.
    name: 'app-panel-point-sample',
    files: ['src/App.tsx'],
    require: [
      {
        selector:
          'JSXOpeningElement[name.name="ControlPanel"] > JSXAttribute[name.name="pointSample"] > JSXExpressionContainer > Identifier[name="panelPointSample"]',
        message: 'Hand ControlPanel panelPointSample, which follows the When selection.',
      },
      {
        selector:
          'JSXOpeningElement[name.name="ResultsTable"] > JSXAttribute[name.name="pointSample"] > JSXExpressionContainer > Identifier[name="pointSample"]',
        message: 'Hand ResultsTable pointSample, which reads the analyzed report.',
      },
      {
        selector: 'CallExpression[callee.name="useTableView"] > ObjectExpression > Property[key.name="pointSample"][value.name="pointSample"]',
        message: 'Hand useTableView pointSample, which reads the analyzed report.',
      },
    ],
  },
  {
    // The panel half of app-panel-point-sample: the flag the Metrics table
    // reads is derived where the When selection lives. The default-model
    // adoption is the one effect the hook took from App.tsx.
    name: 'forecast-selection-hook',
    files: ['src/hooks/useForecastSelection.ts'],
    require: [
      {
        selector:
          'VariableDeclarator[id.name="panelPointSample"] > CallExpression[callee.name="isPointSample"]' +
          '[arguments.0.object.name="panelWindowMs"][arguments.1.object.name="panelWindowMs"]',
        message: 'Derive panelPointSample from panelWindowMs.',
      },
      { selector: EFFECT, count: 1, message: 'useForecastSelection.ts adopts the default model in one useEffect.' },
    ],
  },
  {
    // The limit re-clamp is the one effect this hook took from App.tsx.
    name: 'ranking-knobs-hook',
    files: ['src/hooks/useRankingKnobs.ts'],
    require: [
      { selector: EFFECT, count: 1, message: 'useRankingKnobs.ts re-clamps the limit in one useEffect.' },
    ],
  },
  {
    // The playhead reset, the stop when the bar goes and the playback timer
    // are the three effects this hook took from App.tsx. The reset keys on the
    // report alone: the times array is a new reference on every live knob
    // change, and keying on it would move the playhead under a reader who only
    // re-sorted. The grid is memoized so the memoized map and chart get one
    // identity for it.
    name: 'timeline-hook',
    files: ['src/hooks/useTimeline.ts'],
    require: [
      { selector: EFFECT, count: 3, message: 'useTimeline.ts runs its three effects through useEffect.' },
      { selector: keyedOnlyOn('analysisSeq'), message: 'Reset the forecast playhead in an effect keyed on analysisSeq alone.' },
      {
        selector: 'VariableDeclarator[id.name="forecastTimes"] > CallExpression[callee.name="useMemo"]',
        message: 'Memoize forecastTimes for its identity.',
      },
    ],
  },
  {
    // The analysis publishes ranked rows as each batch lands, so the results
    // area opens before the await; after it, every row would stay hidden until
    // the end. The Analyze click runs in useAnalyzeCommand.ts;
    // presented-report-hook checks the count the flag marks.
    name: 'analyze-command-hook',
    files: ['src/hooks/useAnalyzeCommand.ts'],
    ban: [
      { selector: `${AWAITS_ANALYSIS} ~ ${OPEN_RESULTS}`, message: 'Open the results area before awaiting the analysis, not after.' },
      {
        // A spread skips TypeScript's excess-property check, so the pure
        // planner would receive the refs and setters the bag also carries.
        selector: 'ObjectExpression > SpreadElement[argument.name="inputs"]',
        message: 'Name each planAnalysis field rather than spreading the input bag.',
      },
    ],
    require: [
      { selector: `${OPEN_RESULTS} ~ ${AWAITS_ANALYSIS}`, message: 'Open the results area with willRank ahead of the analysis await.' },
    ],
  },
  {
    // The flag is the hook's `arriving`, true once rows exist, not `loading`.
    name: 'app-arriving-field',
    files: ['src/App.tsx'],
    require: [
      {
        selector: 'VariableDeclarator[init.callee.name="useAnalyze"] > ObjectPattern > Property[key.name="arriving"][shorthand=true]',
        message: 'Take arriving from useAnalyze.',
      },
    ],
  },
  {
    // The bar between two panels is drawn once, by ResizeGrip, so the two
    // cannot drift apart in look or behaviour. The geometry stays the caller's:
    // each grip trades against a different neighbour.
    name: 'app-resize-grips',
    files: ['src/App.tsx', 'src/hooks/useResultsLayout.ts'],
    ban: [
      {
        selector: 'MemberExpression[object.name="TAP"][property.name="grip"]',
        message: 'Leave the grip role to ResizeGrip.',
      },
      { selector: named('DOUBLE_PRESS_MS'), message: 'Leave the double-press clock to ResizeGrip.' },
    ],
    require: [
    ],
  },
  {
    name: 'app-resize-grip-count',
    files: ['src/App.tsx'],
    require: [
      { selector: 'JSXOpeningElement[name.name="ResizeGrip"]', count: 2, message: 'Draw both grips through ResizeGrip.' },
    ],
  },
  {
    // Under two panel floors plus the map's, the sheet draws one panel, and
    // which one is layout.ts's answer. Both is disabled rather than removed, so
    // its neighbours do not move, and only a press is stored: a window that
    // grows back gives Both back with no press.
    name: 'app-results-mode',
    files: ['src/App.tsx'],
    ban: [
      {
        selector: `${BOTH_BUTTON}:not(:has(JSXAttribute[name.name="disabled"] > JSXExpressionContainer > UnaryExpression[operator="!"][argument.name="bothHasRoom"]))`,
        message: 'Disable the Both button with !bothHasRoom.',
      },
      {
        selector: `${BOTH_BUTTON}:not(:has(JSXAttribute[name.name="className"] Identifier[name="DISABLED"]))`,
        message: 'Style the Both button with DISABLED.',
      },
    ],
    require: [
      { selector: BOTH_BUTTON, message: 'Keep the Both button in the segment.' },
    ],
  },
  {
    // The legend stack hangs under the Layers button and grows down, so the
    // overflow leaves through the edge a scroll can follow; a stack pushed to
    // the bottom overflows past its start, where it cannot be reached. Every
    // offset on the bottom edge is derived in resultsSheet.ts, and the corner
    // band is published under the names map.css reads.
    name: 'app-legend-anchors',
    files: ['src/App.tsx'],
    ban: [
      { selector: text('\\bm[tb]-(?:auto)\\b'), message: 'Anchor the legend stack at the top, not with an auto margin.' },
      { selector: text('\\bjustify-(?:end)\\b'), message: 'Anchor the legend stack at the top, not by justifying to the end.' },
      BOTTOM_OFFSET,
    ],
    require: [
      { selector: 'MemberExpression[object.name="LEGEND_TOP"][property.name="compact"]', message: 'Inset the legend with LEGEND_TOP.compact.' },
      { selector: 'MemberExpression[object.name="LEGEND_TOP"][property.name="full"]', message: 'Inset the legend with LEGEND_TOP.full.' },
      {
        selector: 'CallExpression[callee.name="legendBottomPx"][arguments.0.name="sheetLiftPx"]',
        message: 'Place the legend with legendBottomPx(sheetLiftPx, ...).',
      },
      { selector: 'Property[key.value="--map-corner-lift"]', message: 'Publish --map-corner-lift.' },
      {
        selector:
          'Property[key.value="--map-corner-band"] > TemplateLiteral[quasis.length=2][quasis.0.value.raw=""][quasis.1.value.raw="px"] > Identifier[name="TRANSPORT_GAP_PX"]',
        message: 'Publish --map-corner-band as TRANSPORT_GAP_PX in px.',
      },
    ],
  },
  {
    name: 'app-transport-anchor',
    files: ['src/components/TimelineTransport.tsx'],
    ban: [BOTTOM_OFFSET],
    require: [
      {
        selector: 'CallExpression[callee.name="transportBottomPx"][arguments.length=1][arguments.0.name="liftPx"]',
        message: 'Place the transport with transportBottomPx(liftPx).',
      },
    ],
  },
  {
    // The phone sheet is a second branch beside the desktop panel rather than
    // an edit to it. Both grips that resize against the map take the drag
    // floor; the chart and table divider keeps the pair's sum and takes none.
    // The camera reads the default heights, so it does not move under a drag.
    name: 'app-docked-panels',
    files: ['src/App.tsx'],
    require: [
      { selector: 'Literal[value="flex flex-shrink-0 flex-col bg-slate-800"]', message: 'Keep the desktop results panel classes verbatim.' },
    ],
  },
  {
    // The layout half of app-results-mode, app-resize-grips and
    // app-docked-panels: the state, the floors and the default heights live
    // in the hook, and the markup that reads them stays in App.tsx. The hook
    // runs three effects that App.tsx used to (the viewport, the Both widening
    // and the sheet observer), and one layout effect with no list, which is
    // what catches every render's change of the sheet's height.
    name: 'results-layout-hook',
    files: ['src/hooks/useResultsLayout.ts'],
    require: [
      {
        selector:
          'VariableDeclarator[id.name="resultsMode"] > CallExpression[callee.name="resolveResultsMode"][arguments.length=3]' +
          '[arguments.0.name="modePref"][arguments.1.object.name="lastPanelRef"][arguments.1.property.name="current"][arguments.2.name="bothHasRoom"]',
        message: 'Resolve resultsMode from the stored mode and the room.',
      },
      {
        selector: 'CallExpression[callee.name="writeViewPrefs"][arguments.0.properties.0.key.name="modeChosen"]',
        count: 1,
        message: 'Store the chosen mode in one write, inside the press handler.',
      },
      {
        selector: 'CallExpression[callee.name="draggedMapFloorPx"][arguments.0.name="gripCount"]',
        message: 'Floor a drag at draggedMapFloorPx(gripCount).',
      },
      {
        selector: 'CallExpression[callee.name="clampPanelHeight"]:has(> Identifier[name="dragFloorPx"])',
        count: 2,
        message: 'Pass dragFloorPx to both clamps that resize against the map.',
      },
      { selector: 'Property[key.name="chartPx"][value.name="DEFAULT_CHART_HEIGHT"]', message: 'Clear the camera for DEFAULT_CHART_HEIGHT.' },
      { selector: 'Property[key.name="tablePx"][value.name="DEFAULT_TABLE_HEIGHT"]', message: 'Clear the camera for DEFAULT_TABLE_HEIGHT.' },
      {
        selector: 'VariableDeclarator[id.name="DEFAULT_CHART_HEIGHT"][init.name="DEFAULT_PANEL_HEIGHT"]',
        message: 'Open the chart at DEFAULT_PANEL_HEIGHT.',
      },
      {
        selector: 'VariableDeclarator[id.name="DEFAULT_TABLE_HEIGHT"][init.name="DEFAULT_PANEL_HEIGHT"]',
        message: 'Open the table at DEFAULT_PANEL_HEIGHT.',
      },
      {
        selector:
          'CallExpression[callee.name="splitChartTable"][arguments.length=3][arguments.0.name="chartPanelPx"][arguments.1.name="tablePanelPx"][arguments.2.name="up"]',
        message: 'Split the chart and table at the call site with splitChartTable.',
      },
      { selector: EFFECT, count: 3, message: 'useResultsLayout.ts runs its three effects through useEffect.' },
      {
        selector: 'CallExpression[callee.name="useLayoutEffect"][arguments.length=1]',
        count: 1,
        message: 'Measure the sheet in one useLayoutEffect with no dependency list.',
      },
    ],
  },
  {
    // The grid opens as a field, like the markers on it. Whether it may draw
    // at all is gridAllowed's answer, asked once, of the analyzed snapshot and
    // never of the calendar, and the fetch and every surface hang off the one
    // composed flag. The layer's state lives in useGridLayer.ts.
    name: 'grid-layer-hook',
    files: ['src/hooks/useGridLayer.ts'],
    ban: [
      {
        selector: 'CallExpression[callee.name="gridAllowed"]:not([arguments.length=1][arguments.0.name="analyzed"])',
        message: 'Ask gridAllowed of the analyzed snapshot.',
      },
      { selector: EFFECT, message: 'useGridLayer.ts runs no effect of its own; the fetch is useForecastGrid.ts.' },
    ],
    require: [
      {
        selector:
          'LogicalExpression[operator="??"][right.value="smooth"][left.type="ChainExpression"]' +
          '[left.expression.optional=true][left.expression.object.name="restored"][left.expression.property.name="gridStyle"]',
        message: 'Open the grid on the smooth style.',
      },
      { selector: 'CallExpression[callee.name="gridAllowed"]', count: 1, message: 'Call gridAllowed once.' },
      {
        selector: 'VariableDeclarator[id.name="gridAvailable"][init.callee.name="gridAllowed"]',
        message: 'Hold the answer as gridAvailable.',
      },
      {
        selector: 'VariableDeclarator[id.name="gridOn"] > LogicalExpression[operator="&&"][left.name="showGrid"][right.name="gridAvailable"]',
        message: 'Compose gridOn as showGrid && gridAvailable.',
      },
      { selector: 'Property[key.name="enabled"][value.name="gridOn"]', message: 'Enable the grid fetch on gridOn.' },
      offGridOn('gridPainted'),
      offGridOn('gridCued'),
      offGridOn('gridFailed'),
    ],
  },
  {
    // The Layers list stays in App.tsx, and its grid row reads the hook's
    // answer rather than asking again.
    name: 'app-grid-gate',
    files: ['src/App.tsx'],
    ban: [
      { selector: 'CallExpression[callee.name="gridAllowed"]', message: 'Take gridAvailable from useGridLayer.' },
    ],
    require: [
      { selector: 'Property[key.name="key"][value.value="grid"]', message: 'Keep the grid row in the layers list.' },
      {
        selector: 'Property[key.name="disabled"] > UnaryExpression[operator="!"][argument.name="gridAvailable"]',
        message: 'Disable the grid row on !gridAvailable.',
      },
    ],
  },
  {
    // An image source keeps the last image it decoded, so a placeholder that
    // will not decode clears nothing and the previous field stays painted.
    // The map hands the source decoded pixels and hides the layer instead.
    name: 'app-grid-pixels',
    files: ['src/components/MapView.tsx', 'src/map/**/*.{ts,tsx}'],
    ban: [
      { selector: text('data:image\\x2fpng;base64'), message: 'Hand the map decoded pixels, never an encoded image.' },
      {
        selector:
          ':matches(CallExpression[callee.name="updateImage"], CallExpression[callee.property.name="updateImage"])[arguments.0.properties.0.key.name="url"]',
        message: 'Update the grid image with pixels, never a url.',
      },
    ],
  },
  {
    // A fetch that can be paced says so. The comparison was the caller that
    // passed no onPace, and a paced comparison read as a hung chart. One module
    // keeps the deadline; a second copy is how the callers drifted.
    name: 'app-paced-fetch',
    files: ['src/hooks/useAnalysisRun.ts', 'src/hooks/useForecastGrid.ts', 'src/hooks/useModelCompare.ts'],
    ban: [
      { selector: `${named('paceEndMs')}, ${text('paceEndMs')}`, message: 'Keep no pace deadline outside usePacedFetch.' },
    ],
    require: [
      { selector: 'ImportDeclaration[source.value="./usePacedFetch"]', message: 'Import usePacedFetch.' },
      { selector: 'CallExpression[callee.name="usePacedFetch"][arguments.length=0]', message: 'Take the countdown from usePacedFetch().' },
      { selector: 'ObjectExpression > Property[key.name="onPace"]', message: 'Hand onPace to the fetch.' },
    ],
  },
  {
    // A chunk in hand is a chunk the pacer let through, so the wait clears on
    // every chunk, not in the repaint, which late air quality also reaches. A
    // chunk that paced and then threw will not land either, so the failure
    // path clears ahead of the gate that decides whether the layer withdraws.
    name: 'app-grid-pace',
    files: ['src/hooks/useForecastGrid.ts'],
    ban: [
      {
        selector: 'FunctionDeclaration[id.name="repaint"] CallExpression[callee.name="clearPace"]',
        message: 'Clear the grid wait per chunk, not in the repaint.',
      },
    ],
    require: [
      {
        selector:
          'ForStatement[init.declarations.0.id.name="start"][init.declarations.0.init.value=0]' +
          ':has(AwaitExpression > CallExpression[callee.name="fetchWeather"]):has(CallExpression[callee.name="clearPace"])',
        message: 'Clear the grid wait in the chunk loop that awaits fetchWeather.',
      },
      {
        selector: 'FunctionDeclaration[id.name="repaint"]:has(CallExpression[callee.name="pairCells"])',
        message: 'Repaint the grid through pairCells.',
      },
      {
        selector:
          `CatchClause:has(${text('forecast grid fetch failed')}) > BlockStatement > ExpressionStatement[expression.callee.name="clearPace"]` +
          ' ~ IfStatement[test.operator="==="][test.left.name="painted"][test.right.value=0]',
        message: 'Clear the grid wait on failure ahead of the painted gate.',
      },
    ],
  },
  {
    // The comparison buys forecasts for the table as well as the chart, so a
    // paced fetch says its wait under the results bar when the chart cannot,
    // and nowhere else while the chart has it.
    name: 'app-compare-pace',
    files: ['src/components/ModelCompare.tsx'],
    require: [{ selector: named('paceWaitLine'), message: 'Show the comparison wait on the compare surface.' }],
  },
  {
    name: 'app-compare-pace-bar',
    files: ['src/hooks/useChartCompare.ts'],
    require: [
      {
        selector:
          'ConditionalExpression[test.operator="&&"][test.left.object.name="compare"][test.left.property.name="active"][test.right.name="chartShowing"]' +
          '[consequent.raw="null"][alternate.callee.name="paceWaitLine"][alternate.arguments.0.object.name="compare"][alternate.arguments.0.property.name="paceRemainingS"]',
        message: 'Show the comparison wait under the results bar only when the chart cannot.',
      },
    ],
  },
  {
    // A replaceState in the sync effect's cleanup fires on every dependency
    // change, once per keystroke, and the debounce collapses nothing. One call
    // site, handed to debounceUrlWrite, keeps that from returning.
    name: 'app-url-writes',
    files: ['src/App.tsx'],
    require: [
      { selector: HISTORY_WRITE, count: 1, message: 'Write history from one call site.' },
      {
        selector: `CallExpression[callee.name="debounceUrlWrite"] > ArrowFunctionExpression[params.0.name="url"] > ${HISTORY_WRITE}`,
        message: 'Hand the history write to debounceUrlWrite.',
      },
    ],
  },
  {
    // Storage is viewPrefs.ts's business, or the migration and the guards go
    // back to being one call site's.
    name: 'app-no-storage',
    files: [
      'src/App.tsx',
      'src/hooks/useForecastSelection.ts',
      'src/hooks/useRankingKnobs.ts',
      'src/hooks/useResultsLayout.ts',
      'src/hooks/useDestinationInputs.ts',
      'src/hooks/useDrawMode.ts',
      'src/hooks/useRemovals.ts',
      'src/hooks/usePresentedReport.ts',
      'src/hooks/useAnalyzeCommand.ts',
      'src/hooks/useMapOverlays.ts',
      'src/hooks/useTimeline.ts',
      'src/hooks/useGridLayer.ts',
      'src/hooks/useChartCompare.ts',
      'src/hooks/useTableView.ts',
      'src/utils/exportCsv.ts',
    ],
    ban: [
      { selector: `${named('localStorage')}, ${text('localStorage')}`, message: 'Read and write storage through viewPrefs.ts.' },
    ],
  },
  {
    // A colour identifies a line, a (destination, model) pair, and the chart
    // and the table both read it through pairColor. A second indexing of the
    // map is a second answer one spelling away.
    name: 'app-pair-color',
    files: ['src/utils/modelCompare.ts'],
    require: [
      { selector: 'MemberExpression[computed=true][object.name="colors"]', count: 1, message: 'Index the colour map once.' },
      {
        selector: [
          'ReturnStatement > MemberExpression',
          'ReturnStatement > LogicalExpression > MemberExpression',
        ]
          .map(
            (at) =>
              `${at}[computed=true][object.name="colors"][property.callee.name="pairKey"][property.arguments.0.name="modelId"][property.arguments.1.name="destinationKey"]`,
          )
          .join(', '),
        message: 'Index the colour map inside pairColor by pairKey(modelId, destinationKey).',
      },
      {
        selector:
          'CallExpression[callee.name="pairColor"][arguments.0.name="colors"][arguments.1.object.name="model"][arguments.1.property.name="id"][arguments.2.object.name="destination"][arguments.2.property.name="key"]',
        message: 'Colour the chart lines through pairColor.',
      },
    ],
  },
  {
    // The table rows' colours are the chart hook's now; App.tsx keeps the ban
    // so a second lookup cannot come back there.
    name: 'app-pair-color-index',
    files: ['src/App.tsx', 'src/hooks/useChartCompare.ts'],
    ban: [
      {
        selector:
          'MemberExpression[computed=true][property.callee.name="pairKey"]:matches([object.name=/[Cc]olors$/], [object.property.name=/[Cc]olors$/])',
        message: 'Read a pair colour through pairColor, not by indexing the map.',
      },
    ],
  },
  {
    name: 'app-pair-color-rows',
    files: ['src/hooks/useChartCompare.ts'],
    require: [{ selector: 'CallExpression[callee.name="pairColor"]', message: 'Colour the table rows through pairColor.' }],
  },
  {
    // The pair-colour memory and the hidden-model prune are the two effects
    // this hook took from App.tsx, each keyed on a joined VALUE rather than
    // the array behind it. The row colour keys on `chart.colorFor`, never on
    // the `chart` object, which is new every render and would hand the
    // memoized table a new callback every render.
    name: 'chart-compare-hook',
    files: ['src/hooks/useChartCompare.ts'],
    ban: [
      {
        selector: 'VariableDeclarator[id.name="rowChartColor"] CallExpression[callee.name="useCallback"] > ArrayExpression > Identifier[name="chart"]',
        message: 'Key rowChartColor on chart.colorFor, not on the chart object.',
      },
    ],
    require: [
      { selector: EFFECT, count: 2, message: 'useChartCompare.ts runs its two effects through useEffect.' },
      { selector: keyedOnlyOn('chartedPairsKey'), message: 'Remember pair colours in an effect keyed on chartedPairsKey alone.' },
      { selector: keyedOnlyOn('selectedModelsKey'), message: 'Prune hidden models in an effect keyed on selectedModelsKey alone.' },
      {
        selector: 'VariableDeclarator[id.name="rowChartColor"] > CallExpression[callee.name="useCallback"]',
        message: 'Hand the table rowChartColor as a useCallback.',
      },
    ],
  },
  {
    // The stored shape, the width reset and the dropped order are the three
    // effects this hook took from App.tsx. The order is dropped when the
    // ranking changes and never on mount, or a reload discards the order it
    // just read back; the ref and the effect are one mechanism, so they are
    // checked together.
    name: 'table-view-hook',
    files: ['src/hooks/useTableView.ts'],
    ban: [
      { selector: 'CallExpression[callee.name="buildResultsCsv"]', message: 'Build the file through reportCsv, not buildResultsCsv.' },
    ],
    require: [
      { selector: EFFECT, count: 3, message: 'useTableView.ts runs its three effects through useEffect.' },
      {
        selector:
          `${EFFECT}:has(> ArrayExpression[elements.length=1][elements.0.name="sortBy"])` +
          ':has(IfStatement[test.operator="!"][test.argument.object.name="rankedOnce"][test.argument.property.name="current"])',
        message: 'Drop the dragged order in an effect keyed on sortBy alone, skipped once by rankedOnce.',
      },
      { selector: keyedOnlyOn('pointSample'), message: 'Reset the metric widths in an effect keyed on pointSample alone.' },
      {
        selector: `${EFFECT}:has(> ArrayExpression[elements.length=3]):has(CallExpression[callee.name="writeViewPrefs"])`,
        count: 1,
        message: 'Store the table shape in one effect over its three answers.',
      },
      {
        selector: 'VariableDeclarator[id.name="handleColumnMove"] > CallExpression[callee.name="useCallback"]',
        message: 'Hand the table handleColumnMove as a useCallback.',
      },
      { selector: 'CallExpression[callee.name="reportCsv"]', count: 1, message: 'Build the file through reportCsv.' },
    ],
  },
  {
    // A file is read once, away from the app, so a wildfire column there
    // claims the check ran. It goes over only when the check answered and the
    // column is on screen.
    name: 'export-csv-fire-gate',
    files: ['src/utils/exportCsv.ts'],
    require: [
      {
        selector:
          'ConditionalExpression[test.operator="&&"][test.left.left.name="fireStatus"][test.left.right.value="ready"]' +
          '[test.right.callee.object.name="visibleKeys"][test.right.arguments.0.name="WILDFIRE_KEY"]' +
          '[consequent.name="fireWarnings"][alternate.raw="null"]',
        message: 'Send the wildfire column only when the check is ready and the column is shown.',
      },
    ],
  },
]
