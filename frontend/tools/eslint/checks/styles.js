// See plugin.js for the shape of a check.
import { calls, named, text } from '../plugin.js'

// The text-bearing sources, where a class list can be written: the same set
// eslint.config.js hands the class bans. The map's modules count, because a
// folder of their own must not be a way out of the rules MapView.tsx kept.
const SOURCES = ['src/App.tsx', 'src/components/*.tsx', 'src/map/**/*.{ts,tsx}']
// A component's test renders the rules rather than breaking them.
const TESTS = ['src/**/*.test.ts', 'src/**/*.test.tsx']

// How many interpolations into one template the helpers below look through.
// No class template in the app comes near it.
const SLOTS = 8
const upTo = (from, to) => Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i)

// Expression k of a template is `${ROLE}` or `${ROLE.key}`.
const exprIs = (k, ref) => {
  const [object, property] = ref.split('.')
  return property
    ? `[expressions.${k}.object.name="${object}"][expressions.${k}.property.name="${property}"]`
    : `[expressions.${k}.name="${object}"]`
}

// `${ROLE}` anywhere in a template, one match per interpolation.
const interp = (ref) => {
  const [object, property] = ref.split('.')
  return property
    ? `TemplateLiteral > MemberExpression[object.name="${object}"][property.name="${property}"]`
    : `TemplateLiteral > Identifier[name="${object}"]`
}

// Whatever rides along after `${ROLE}` in its template: every later chunk of
// the template, and (with `literals`) every string inside a later
// interpolation. A class spelled there shares a class list with the role.
const ride = (ref, pattern, { literals = true } = {}) =>
  upTo(0, SLOTS)
    .flatMap((k) =>
      upTo(k + 1, SLOTS + 1).flatMap((j) => {
        const tl = `TemplateLiteral${exprIs(k, ref)}`
        const out = [`${tl} > TemplateElement:nth-child(${j + 1})[value.raw=/${pattern}/]`]
        if (literals && j < SLOTS) {
          out.push(
            `${tl} > :not(TemplateElement):nth-child(${j + 1}):matches(Literal[value=/${pattern}/], :has(Literal[value=/${pattern}/]))`,
          )
        }
        return out
      }),
    )
    .join(', ')

// The chunk right after `${ROLE}`, or right before it.
const follows = (ref, pattern) =>
  upTo(0, SLOTS)
    .map((k) => `TemplateLiteral${exprIs(k, ref)} > TemplateElement:nth-child(${k + 2})[value.raw=/${pattern}/]`)
    .join(', ')
const precedes = (ref, pattern) =>
  upTo(0, SLOTS)
    .map((k) => `TemplateLiteral${exprIs(k, ref)} > TemplateElement:nth-child(${k + 1})[value.raw=/${pattern}/]`)
    .join(', ')

// `${A}<sep>${B}`: two interpolations side by side, one match per pair.
const pair = (a, b, sep) =>
  upTo(0, SLOTS - 1)
    .map(
      (k) =>
        `TemplateLiteral${exprIs(k, a)}${exprIs(k + 1, b)} > TemplateElement:nth-child(${k + 2})[value.raw=/${sep}/]`,
    )
    .join(', ')

// An element, or its opening tag, whose className is the bare role `{ROLE}`.
const classIs = (prefix, ref) =>
  upTo(0, 6)
    .map(
      (k) =>
        `[${prefix}attributes.${k}.name.name="className"][${prefix}attributes.${k}.value.expression.name="${ref}"]`,
    )
    .join(', ')
const elementWith = (ref) => `JSXElement:matches(${classIs('openingElement.', ref)})`
const classAttr = (ref) =>
  `JSXAttribute[name.name="className"] > JSXExpressionContainer > Identifier[name="${ref}"]`

// text() scoped under a node: each of its three node kinds, inside `scope`.
const within = (scope, pattern) =>
  text(pattern)
    .split(', ')
    .map((s) => `${scope} ${s}`)
    .join(', ')

// A node that comes after `anchor` in source order: inside a later sibling of
// the anchor, or of anything that contains it.
const after = (anchor, target) =>
  [`${anchor} ~ * ${target}`, `*:has(${anchor}) ~ * ${target}`, `*:has(${anchor}) ~ ${target}`].join(', ')

const PANEL = {
  frame: 'src/components/ControlPanel.tsx',
  destinations: 'src/components/DestinationsSection.tsx',
  forecast: 'src/components/ForecastSection.tsx',
  metrics: 'src/components/MetricsTable.tsx',
  footer: 'src/components/PanelFooter.tsx',
}

const role = (name) => `MemberExpression[object.name="${name}"]`
const defaultExport = (name) => `ExportDefaultDeclaration[declaration.id.name="${name}"]`
// The body of the default export and everything after it.
const fromExport = (name, target) =>
  `${defaultExport(name)} ${target}, ${defaultExport(name)} ~ * ${target}`

const ICON_SIZE = String.raw`(^|\s)[hw]-(\d|\[)`
const POPOVER_BOX = pair('SURFACE_CARD', 'LAYER.popover', '^ $')

const GRID = elementWith('METRICS_GRID')
const CLEAR = 'JSXOpeningElement:has(JSXAttribute[name.name="onClick"] > JSXExpressionContainer > Identifier[name="onClearFilters"])'
const ANALYZE = 'JSXElement:has(JSXAttribute[name.name="onClick"] > JSXExpressionContainer > Identifier[name="onAnalyze"])'
const FOOTER_NOTICE = 'JSXOpeningElement[name.name="FooterNotice"]'
const METRIC_BOX_USE = ':matches(TemplateLiteral, JSXExpressionContainer) > Identifier[name=/^METRIC_BOX(_WIDE)?$/]'

// `<span className={`${ROLE} truncate`}>{windowTitle}</span>`: the role last in
// a class list that is the tag's last attribute, and the title its first child.
const titleCaption = (ref) =>
  'JSXElement:matches([children.0.expression.name="windowTitle"], ' +
  '[children.0.type="JSXText"][children.0.value=/^\\s*$/][children.1.expression.name="windowTitle"]) > ' +
  `JSXOpeningElement:matches(${upTo(0, 6)
    .map((i) => `[attributes.${i}.name.name="className"]:not([attributes.${i + 1}])`)
    .join(', ')}) > ` +
  'JSXAttribute[name.name="className"] > JSXExpressionContainer > ' +
  `TemplateLiteral:matches(${upTo(0, SLOTS)
    .map((k) => `${exprIs(k, ref)}[quasis.${k + 1}.value.raw=" truncate"][quasis.${k + 1}.tail=true]`)
    .join(', ')})`

const SEARCH_WIDTHS = ['4', '72', '80']

const PLAYER_ROW = 'VariableDeclarator[id.name="MAP_LAYERS"] ObjectExpression:has(> Property[key.name="label"][value.value="Forecast player"])'

export const STYLES = [
  {
    // Bans every call site is under. Each is a class the design system owns,
    // spelled beside the role that already answers it.
    name: 'style-call-site-classes',
    files: SOURCES,
    ignores: TESTS,
    ban: [
      {
        // Two width utilities resolve by stylesheet order rather than by class
        // order, so a width beside the role breaks the alignment it holds and
        // cannot even be relied on to win.
        selector: ride('SEGMENT', String.raw`(^|\s)w-\S`),
        message: 'Re-width no segment: SEGMENT carries the control width.',
      },
      {
        // The error boundary's fallback replaces the tree it guards, so it
        // cannot inherit the ground, and a fourth spelling is how the grounds
        // would part. A translucent scrim over the map is a different thing.
        selector: text(String.raw`bg-slate-900(?![\x2f\w-])`),
        message: 'Stand a page on SURFACE_PAGE rather than spelling its ground.',
      },
      {
        // A call site says where a glyph sits and what colour it reaches for;
        // icons.tsx says how big it is.
        selector: `JSXOpeningElement[name.name=/^Icon/] Literal[value=/${ICON_SIZE}/], JSXOpeningElement[name.name=/^Icon/] TemplateElement[value.raw=/${ICON_SIZE}/]`,
        message: 'Hand no icon a size: the icon module sizes every glyph.',
      },
      {
        // The size lives in ACCENT.input, which CHOICE_INPUT composes. An input
        // that re-sizes itself after taking it is how the chart's radio came to
        // wear the tint at the browser's default size.
        selector: ride('ACCENT.input', String.raw`\bh-[\d.]+`, { literals: false }),
        message: 'Re-size no input after ACCENT.input.',
      },
      {
        // The ghost and the insert bar carry their own stacking order, which
        // is part of what they are. A layer beside them is half of a pair.
        selector: upTo(0, SLOTS - 1)
          .flatMap((k) =>
            ['object.name', 'name'].map(
              (key) =>
                `TemplateLiteral[expressions.${k}.name=/DRAG_(GHOST|INSERT)$/][quasis.${k + 1}.value.raw=/^\\s*$/][expressions.${k + 1}.${key}=/^LAYER/]`,
            ),
          )
          .join(', '),
        message: 'Add no layer to DRAG_GHOST or DRAG_INSERT: each carries its own.',
      },
    ],
  },
  {
    // One module draws every glyph, which is what stops the close cross
    // existing six times at three sizes and two stroke weights again.
    name: 'style-own-glyphs',
    files: SOURCES,
    ignores: [...TESTS, 'src/components/icons.tsx'],
    ban: [
      {
        selector: `JSXOpeningElement[name.name="svg"], ${text('<svg')}`,
        message: 'Draw a glyph in components/icons.tsx, never at the call site.',
      },
    ],
  },
  {
    // The glyph ban above exempts this module, and is vacuous if it stops
    // being where the glyphs are.
    name: 'style-icon-module',
    files: ['src/components/icons.tsx'],
    require: [{ selector: 'JSXOpeningElement[name.name="svg"]', min: 11, message: 'icons.tsx draws the glyphs.' }],
  },
  {
    // Popover.tsx owns the fixed box, the card and the stacking order, so a
    // fix reaches every panel. A panel that spells them again drifts a step.
    name: 'style-own-popover',
    files: SOURCES,
    ignores: [...TESTS, 'src/components/Popover.tsx'],
    ban: [
      {
        selector: 'Property:matches([key.name="position"], [key.value="position"])[value.value="fixed"]',
        message: 'Position a floating panel through Popover.tsx.',
      },
      { selector: POPOVER_BOX, message: 'Wrap a floating panel in Popover.tsx rather than spelling its box.' },
    ],
  },
  {
    name: 'style-popover-shell',
    files: ['src/components/Popover.tsx'],
    require: [{ selector: POPOVER_BOX, message: 'Popover.tsx applies the card and the popover layer.' }],
  },
  {
    // The placement is wired from a hook, so the files a second caller could
    // hide in are wider than the components.
    name: 'style-one-placement',
    files: ['src/App.tsx', 'src/components/*.tsx', 'src/hooks/*.ts', 'src/map/**/*.{ts,tsx}', 'src/utils/*.ts'],
    ignores: [...TESTS, 'src/utils/listbox.ts', 'src/hooks/usePopover.ts'],
    ban: [
      {
        selector: `${calls('popoverBox')}, FunctionDeclaration[id.name="popoverBox"]`,
        message: 'Ask usePopover where a panel goes, never popoverBox itself.',
      },
    ],
  },
  {
    name: 'style-placement-caller',
    files: ['src/hooks/usePopover.ts'],
    require: [{ selector: calls('popoverBox'), message: 'usePopover asks popoverBox where a panel goes.' }],
  },
  {
    name: 'style-placement-module',
    files: ['src/utils/listbox.ts'],
    require: [
      {
        selector: 'ExportNamedDeclaration > FunctionDeclaration[id.name="popoverBox"]',
        message: 'listbox.ts exports popoverBox.',
      },
    ],
  },
  {
    // Every full page stands on the one ground.
    name: 'style-page-ground',
    files: ['src/App.tsx', 'src/components/PageShell.tsx', 'src/components/ErrorBoundary.tsx'],
    require: [{ selector: interp('SURFACE_PAGE'), message: 'Stand the page on SURFACE_PAGE.' }],
  },
  {
    // The map's left column: one width, one gap, one row height, one inset.
    // A width, gap or height spelled beside the role moves the column without
    // moving what is derived from the role.
    name: 'style-map-column',
    files: [
      'src/App.tsx',
      'src/components/AnalysisOverlay.tsx',
      'src/components/LayersPopover.tsx',
      'src/components/MapButtonColumn.tsx',
      'src/components/MapLegend.tsx',
    ],
    ban: [
      { selector: ride('MAP_COL_W', String.raw`(^|\s)w-\S`), message: 'Spell no width beside MAP_COL_W.' },
      {
        // A range rather than a list, so a step nobody thought of still fails,
        // and guarded so a max-w is not read as a width.
        selector: text(String.raw`(?<![-\w])w-(?:4\d|5\d)\b`),
        message: 'Take the map column width from MAP_COL_W.',
      },
      {
        selector: `${ride('MAP_COL_GAP', String.raw`(^|\s)(gap-|mt-)`)}, ${ride('MAP_COL_GAP_T', String.raw`(^|\s)(gap-|mt-)`)}`,
        message: 'Spell no gap beside MAP_COL_GAP.',
      },
      {
        selector: ride('MAP_ROW_H', String.raw`(^|\s)(h-|min-h-|py-)`),
        message: 'Spell no height or padding beside MAP_ROW_H.',
      },
      { selector: text(String.raw`\btop-3\b`), message: 'Take the top inset from MAP_EDGE.top.' },
      { selector: text(String.raw`\bleft-(2|3)\b|\bleft-\[`), message: 'Take the left inset from MAP_EDGE.left.' },
    ],
  },
  {
    // The map column's members are four files now (#409); each carries its
    // share of the roles, and the counts add up to what App.tsx held: four
    // MAP_COL_W, two MAP_COL_GAP, one MAP_COL_GAP_T and two MAP_EDGE.left.
    // Everything inside the wrapper inherits the one number.
    name: 'style-map-wrapper',
    files: ['src/App.tsx'],
    require: [
      { selector: role('MAP_EDGE') + '[property.name="publish"]', message: 'The map wrapper publishes MAP_EDGE.publish.' },
    ],
  },
  {
    // The legend box and the stack it scrolls in.
    name: 'style-map-legend-column',
    files: ['src/components/MapLegend.tsx'],
    require: [
      { selector: interp('MAP_COL_W'), count: 1, message: 'The legend box wears MAP_COL_W.' },
      { selector: interp('MAP_COL_GAP'), count: 1, message: 'The legend stack spaces by MAP_COL_GAP.' },
      { selector: interp('MAP_EDGE.left'), count: 1, message: 'The legend stack stands off the left by MAP_EDGE.left.' },
    ],
  },
  {
    // The button cluster and the Controls button it holds while the panel is
    // closed. A stacking context orders only its own children, so the layer
    // is useless unless the cluster itself wears it.
    name: 'style-map-button-column',
    files: ['src/components/MapButtonColumn.tsx'],
    require: [
      { selector: interp('MAP_COL_W'), count: 1, message: 'The Controls button wears MAP_COL_W.' },
      { selector: interp('MAP_COL_GAP'), count: 1, message: 'The cluster spaces by MAP_COL_GAP.' },
      { selector: role('LAYER') + '[property.name="mapControls"]', message: 'The map controls cluster wears LAYER.mapControls.' },
      { selector: interp('MAP_EDGE.top'), message: 'The column stands off the top by MAP_EDGE.top.' },
      { selector: interp('MAP_EDGE.left'), count: 1, message: 'The cluster stands off the left by MAP_EDGE.left.' },
    ],
  },
  {
    // The Layers button and the popover that hangs from it.
    name: 'style-map-layers-column',
    files: ['src/components/LayersPopover.tsx'],
    require: [
      { selector: interp('MAP_COL_W'), count: 2, message: 'The Layers button and its popover wear MAP_COL_W.' },
      { selector: interp('MAP_COL_GAP_T'), count: 1, message: 'The hanging popover spaces by MAP_COL_GAP_T.' },
    ],
  },
  {
    // The results bar's links are controls, so they read at the control size;
    // the micro step is for text that is present but never first. The window
    // caption sits on the lifted fill, where the caption tier fails AA.
    name: 'style-results-bar',
    files: ['src/App.tsx'],
    ban: [
      { selector: interp('TEXT.micro'), message: 'Reach for no TEXT.micro in App.tsx.' },
      { selector: titleCaption('TEXT.caption'), message: 'Set the window title in CAPTION_LIFTED, not TEXT.caption.' },
    ],
    require: [
      { selector: pair('TEXT.control', 'LINK', '^ $'), count: 5, message: 'The five results bar links read at TEXT.control.' },
      { selector: titleCaption('CAPTION_LIFTED'), message: 'Set the window title in CAPTION_LIFTED.' },
    ],
  },
  {
    // The legend's scale key: one strip, drawn from the roles, edged from one
    // place, and not hidden now that it holds its numbers.
    name: 'style-legend-ramp',
    files: ['src/components/MapLegend.tsx'],
    ban: [
      { selector: 'Literal[value="#475569"]', message: 'Edge a swatch with SWATCH_EDGE, not a hex.' },
      {
        selector: `JSXOpeningElement:matches(${classIs('', 'SWATCH_RAMP')}):has(JSXAttribute[name.name="aria-hidden"])`,
        message: 'Leave the ramp visible to assistive technology: it holds the numbers.',
      },
    ],
    require: [
      { selector: classAttr('SWATCH_RAMP'), count: 1, message: 'One strip wears SWATCH_RAMP.' },
      { selector: classAttr('SWATCH_RAMP_TICK'), message: 'The strip numbers wear SWATCH_RAMP_TICK.' },
    ],
  },
  {
    // Every layer row is in the list every time, so switching one layer never
    // moves the rows under it. A row out of play greys and says nothing else.
    name: 'style-layer-rows',
    files: ['src/components/LayersPopover.tsx'],
    ban: [
      {
        selector: 'VariableDeclarator[id.name="MAP_LAYERS"] SpreadElement',
        message: 'Spread no row in and out of MAP_LAYERS.',
      },
      { selector: `${PLAYER_ROW} > Property[key.name="note"]`, message: 'Write the player row no note.' },
    ],
    require: [
      {
        selector: `${PLAYER_ROW} > Property[key.name="disabled"] > UnaryExpression[operator="!"] > Identifier[name="playerOffered"]`,
        message: 'Grey the Forecast player row with disabled: !playerOffered.',
      },
    ],
  },
  {
    // The search field, its results and its message: one width, one opaque
    // surface, and severity by STATUS colour rather than a panel notice box.
    name: 'style-search-box',
    files: ['src/components/SearchBox.tsx'],
    ban: [
      { selector: ride('MAP_COL_W', String.raw`(^|\s)w-\S`), message: 'Spell no width beside MAP_COL_W.' },
      {
        // The one deliberate exception is the result list, wider than the
        // column so a second line keeps the county and state. The single-digit
        // step left is the spinner's square.
        selector: text(`(?<![-\\w])w-(?!(?:${SEARCH_WIDTHS.join('|')})(?:\\s|$))\\d`),
        message: 'Pick no width in SearchBox beyond the result list and the spinner.',
      },
      { selector: ride('DROPDOWN', String.raw`\sbg-`), message: 'Spell no surface beside DROPDOWN.' },
      {
        // A panel notice's fill is a tint, and a tint over the map is the map.
        selector: 'TemplateLiteral > Identifier[name=/^NOTICE/], TemplateLiteral > MemberExpression[object.name=/^NOTICE/]',
        message: 'Colour the search message by STATUS, never a NOTICE box.',
      },
    ],
    require: [
      { selector: interp('MAP_COL_W'), count: 1, message: 'The search field wears MAP_COL_W.' },
      ...SEARCH_WIDTHS.map((w) => ({
        selector: text(`(?<![-\\w])w-${w}(?:\\s|$)`),
        message: `SearchBox keeps its w-${w}.`,
      })),
      {
        selector: 'VariableDeclarator[id.name="DROPDOWN"] > TemplateLiteral > Identifier[name="SURFACE_POPOVER"]',
        message: 'DROPDOWN stands on SURFACE_POPOVER.',
      },
      { selector: interp('DROPDOWN'), count: 2, message: 'The list and the message both ride DROPDOWN.' },
      { selector: interp('CAPTION_LIFTED'), message: 'The result captions wear CAPTION_LIFTED.' },
      { selector: interp('STATUS.warn'), message: 'The search message takes STATUS.warn.' },
    ],
  },
  {
    // The chart's metric select cannot follow the panel column down: its
    // labels carry units. And a row whose width its labels cannot move never
    // wraps, so a sixth metric cannot bring the second line back.
    name: 'style-chart-metric',
    files: ['src/components/TimeSeriesChart.tsx'],
    ban: [
      { selector: named('CONTROL_W'), message: 'Size the chart metric select by CHART_METRIC_W, not CONTROL_W.' },
      { selector: text('flex-wrap'), message: 'Let the chart metric row wrap nowhere.' },
    ],
    require: [
      { selector: named('CHART_METRIC_W'), message: 'TimeSeriesChart reads CHART_METRIC_W.' },
      {
        selector:
          'JSXOpeningElement[name.name="select"]:has(JSXAttribute[name.name="className"] Identifier[name="SELECT"]):has(JSXAttribute[name.name="className"] Identifier[name="CHART_METRIC_W"])',
        message: 'Build the chart metric select from SELECT at CHART_METRIC_W.',
      },
    ],
  },
  {
    // The bar wears the axis half's role, or the role is a number nothing reads.
    name: 'style-axis-item',
    files: ['src/components/TimelineTransport.tsx'],
    require: [{ selector: named('TRANSPORT_AXIS_ITEM'), message: 'TimelineTransport reads TRANSPORT_AXIS_ITEM.' }],
  },
  {
    // The Metrics section: every control stands on the box columns' edges,
    // every numeric box comes off one shape, nothing is drawn inside the
    // table, and Clear filters is always drawn and disables instead.
    name: 'style-metrics-table',
    files: [PANEL.metrics],
    ban: [
      { selector: within(GRID, 'border-t|border-b'), message: 'Draw no rule inside the Metrics table.' },
      { selector: `${CLEAR} Identifier[name="CONTROL_W"]`, message: 'Size Clear filters by the box columns, not CONTROL_W.' },
      {
        // A button that appears and disappears moves everything under it.
        selector: 'JSXExpressionContainer > LogicalExpression[operator="&&"][left.name="filtersActive"]',
        message: 'Draw Clear filters always and disable it instead.',
      },
    ],
    balance: [
      {
        selectors: ['JSXAttribute[name.name="type"][value.value="number"]', METRIC_BOX_USE],
        message: 'Build every numeric box from METRIC_BOX or METRIC_BOX_WIDE.',
      },
    ],
    require: [
      { selector: 'JSXAttribute[name.name="type"][value.value="number"]', min: 2, message: 'The Metrics section draws its numeric boxes.' },
      {
        selector:
          'VariableDeclarator[id.name="METRIC_BOX"] > TemplateLiteral[expressions.0.name="METRIC_BOX_SHAPE"][expressions.1.name="METRIC_BOX_W"][quasis.0.value.raw=""][quasis.1.value.raw=" "][quasis.2.value.raw=""]',
        message: 'METRIC_BOX is METRIC_BOX_SHAPE at METRIC_BOX_W.',
      },
      {
        selector:
          'VariableDeclarator[id.name="METRIC_BOX_WIDE"] > TemplateLiteral[expressions.0.name="METRIC_BOX_SHAPE"][quasis.0.value.raw=""][quasis.1.value.raw=" w-full"][quasis.1.tail=true]',
        message: 'METRIC_BOX_WIDE is METRIC_BOX_SHAPE at full width.',
      },
      // Spanning the two box columns rather than spelling their sum.
      { selector: follows('METRIC_BOX_WIDE', '^ col-span-2'), message: 'Span the wide box over the two box columns.' },
      { selector: follows('SEGMENT_FILL', '^ col-span-2'), message: 'Span the fill segment over the two box columns.' },
      // Vacuous if the grid stops being where the section is.
      { selector: within(GRID, 'Rank by'), message: 'The Metrics grid holds Rank by.' },
      { selector: within(GRID, 'results'), message: 'The Metrics grid holds the results cap.' },
      {
        // One per heading cell: the spacer, and the two headings EDGES maps.
        selector: `${GRID} Identifier[name="METRIC_HEAD_GAP"]`,
        count: 2,
        message: 'Two heading cells in the grid wear METRIC_HEAD_GAP.',
      },
      {
        selector: precedes('METRIC_HEAD_GAP', 'col-span-2 $')
          .split(', ')
          .map((s) => `${GRID} ${s}`)
          .join(', '),
        message: 'The heading spacer spans two columns before METRIC_HEAD_GAP.',
      },
      {
        selector: `${CLEAR}:has(${text('col-span-2')}):has(${text('col-start-3')})`,
        message: 'Stand Clear filters under the bound boxes.',
      },
      {
        selector: `${CLEAR}:has(JSXAttribute[name.name="disabled"] > JSXExpressionContainer > UnaryExpression[operator="!"] > Identifier[name="filtersActive"]):has(TemplateLiteral > Identifier[name="DISABLED"])`,
        message: 'Disable Clear filters on !filtersActive and wear DISABLED.',
      },
    ],
  },
  {
    // Every message in the app fits one line at 360px, measured with the full
    // text column. A list indent and its marker take 16px of it.
    name: 'style-panel-messages',
    files: Object.values(PANEL),
    ban: [
      {
        selector: `JSXOpeningElement[name.name="ul"], ${text('list-disc')}, ${text('<ul')}`,
        message: 'Give the messages the whole text column: no list.',
      },
    ],
  },
  {
    // Every notice renders in the one block under Analyze: a NOTICE box is
    // built in FooterNotice alone, which is rendered once, after the button.
    name: 'style-footer-notice',
    files: [PANEL.footer],
    ban: [
      {
        selector: `${role('NOTICE')}:not(FunctionDeclaration[id.name="FooterNotice"] *)`,
        message: 'Build a NOTICE box inside FooterNotice alone.',
      },
      {
        // The footer colours by status inside FooterNotice alone.
        selector: fromExport('PanelFooter', role('STATUS')),
        message: 'Colour nothing by STATUS in the footer body.',
      },
    ],
    require: [
      { selector: 'FunctionDeclaration[id.name="FooterNotice"]', message: 'PanelFooter builds FooterNotice.' },
      { selector: FOOTER_NOTICE, count: 1, message: 'Render FooterNotice in one place.' },
      { selector: after(ANALYZE, FOOTER_NOTICE), message: 'Render FooterNotice below the Analyze button.' },
    ],
  },
  {
    name: 'style-footer-notice-once',
    files: SOURCES,
    ignores: [...TESTS, PANEL.footer],
    ban: [{ selector: `${FOOTER_NOTICE}, ${text('<FooterNotice\\b')}`, message: 'Render FooterNotice in PanelFooter alone.' }],
  },
  {
    // The rest of the panel builds no notice box and colours nothing by status.
    name: 'style-panel-no-status',
    files: [PANEL.frame, PANEL.forecast, PANEL.metrics],
    ban: [
      { selector: role('NOTICE'), message: 'Build no NOTICE box outside the footer.' },
      { selector: role('STATUS'), message: 'Colour nothing by STATUS outside a notice.' },
    ],
  },
  {
    // The one exception, pinned by count: the polygon's draw counter colours
    // its captions by state. A seventh is a notice that wandered out of the
    // footer.
    name: 'style-draw-counter',
    files: [PANEL.destinations],
    ban: [{ selector: role('NOTICE'), message: 'Build no NOTICE box in the destinations section.' }],
    require: [
      {
        selector: fromExport('DestinationsSection', role('STATUS')),
        count: 6,
        message: 'The draw counter colours six captions by STATUS.',
      },
    ],
  },
  {
    // Why the model control is faded is said in the message block, not on it.
    name: 'style-model-picker-quiet',
    files: ['src/components/ModelPicker.tsx'],
    ban: [
      {
        selector: text('Archive data uses no forecast model\\.'),
        message: 'Say why the model picker is faded in the panel messages.',
      },
    ],
  },
  {
    name: 'style-window-messages',
    files: ['src/utils/panelMessages.ts'],
    require: [
      {
        selector: [
          `VariableDeclarator[id.name="windowMessages"] Literal[value=/Archive data uses no forecast model\\./]`,
          ...after('VariableDeclarator[id.name="windowMessages"]', 'Literal[value=/Archive data uses no forecast model\\./]').split(', '),
        ].join(', '),
        message: 'windowMessages says why the model picker is faded.',
      },
    ],
  },
  {
    // A map popup is markup for setHTML, and the one glyph it draws comes from
    // iconPaths.ts rather than being typed out again.
    name: 'style-popup-glyph',
    files: ['src/utils/popupChrome.ts'],
    ban: [{ selector: text('<svg[\\s>]'), message: 'Draw the popup glyph from iconPaths.ts.' }],
    require: [
      {
        selector: 'CallExpression[callee.name="externalLinkMarkup"][arguments.length=0]',
        message: 'The popup draws its link-out arrow with externalLinkMarkup().',
      },
    ],
  },
  {
    // The rank cell trades its number for the remove cross by visibility, in
    // one grid cell, so the column never grows on hover. And both kinds of
    // body row come off one recipe, whose group is what the cross hangs on.
    name: 'style-rank-cell',
    files: ['src/components/ResultsTableRow.tsx'],
    ban: [
      {
        selector: text('group-hover:(hidden|inline|block|flex)\\b'),
        message: 'Trade visibility, never display, on row hover.',
      },
    ],
    require: [
      {
        selector: 'MemberExpression[property.name="rankFace"]:matches([object.name="TABLE"], [object.property.name="TABLE"])',
        count: 2,
        message: 'Both faces of the rank cell wear TABLE.rankFace.',
      },
      {
        selector: 'MemberExpression[property.name="row"]:matches([object.name="TABLE"], [object.property.name="TABLE"])',
        count: 2,
        message: 'Both kinds of body row wear TABLE.row.',
      },
    ],
  },
]
