// See plugin.js for the shape of a check.
import { calls, named, text } from '../plugin.js'

// The text-bearing sources, where a class list can be written: the same set
// eslint.config.js hands the class bans. The map's modules count, because a
// folder of their own must not be a way out of the rules MapView.tsx kept.
const SOURCES = ['src/App.tsx', 'src/components/*.tsx', 'src/map/**/*.{ts,tsx}']
// A component's test renders the rules rather than breaking them.
const TESTS = ['src/**/*.test.ts', 'src/**/*.test.tsx']

// Every source the app ships, test files aside: the reach of the value bans
// below, which is wider than SOURCES because a hex colour in a hook or a util
// reaches the screen as surely as one in a component (#365).
const SHIPPED = ['src/**/*.ts', 'src/**/*.tsx']

// The modules that OWN a colour, each for a stated reason: the metric scales
// and the chart palette, the design system itself, the map's own paint and the
// basemap's terrain-matched labels, each overlay's pure module (which feeds
// the map layer and the legend swatch from one constant), the two keys to a
// third party's ramp (NOAA's snow bands, IEM's reflectivity), and the SVG
// sources, whose fills are the glyph. Everything else composes them.
const COLOR_OWNERS = [
  'src/styles.ts',
  'src/utils/colors.ts',
  'src/utils/chartColors.ts',
  // Composes a pair the two owners above measured into the one string that
  // carries both themes (#786); it names no colour of its own.
  'src/utils/themeColor.ts',
  'src/utils/resultFeatures.ts',
  // Not the popup chrome: every colour a card wears is a `--popup-*` value
  // that names an app token in map.css (#786, record 0215), and a literal
  // there would be a second palette beside the app's.
  'src/map/mapStyles.ts',
  'src/map/basemap.ts',
  'src/utils/wildfires.ts',
  'src/utils/smoke.ts',
  'src/utils/closures.ts',
  'src/utils/snowDepth.ts',
  'src/utils/radar.ts',
  'src/iconPaths.ts',
  'src/logo.ts',
]

// A colour value: a hex triplet or sextet where CSS or a paint spec would put
// one, or a CSS colour function (`rgb()`, `hsl()`, `oklch()` and the rest,
// which since #706 are as fixed to one theme as a hex is). Three-digit hex is
// matched only after a `:`, `(` or `,`, because `#123` is also how a string
// names an issue.
const COLOR_VALUE = String.raw`#[0-9a-fA-F]{6}(?![0-9a-zA-Z])|[:(,]\s*#[0-9a-fA-F]{3}(?![0-9a-zA-Z])|^#[0-9a-fA-F]{3}$|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|light-dark)\(`

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
// The panel's messages (#786; record 0208): the list the Analyze button's
// badge opens, the badge with the one live region beside it, and the phone's
// foot, which wears the badge too.
const MESSAGES = {
  list: 'src/components/MessageList.tsx',
  badge: 'src/components/MessageBadge.tsx',
  phoneFoot: 'src/components/PhoneFoot.tsx',
}

const role = (name) => `MemberExpression[object.name="${name}"]`
const defaultExport = (name) => `ExportDefaultDeclaration[declaration.id.name="${name}"]`
// The body of the default export and everything after it.
const fromExport = (name, target) =>
  `${defaultExport(name)} ${target}, ${defaultExport(name)} ~ * ${target}`

const ICON_SIZE = String.raw`(^|\s)[hw]-(\d|\[)`
// The old popover card, which every menu wore before record 0201.
const POPOVER_BOX = pair('SURFACE_CARD', 'LAYER.popover', '^ $')

// A trigger in one of the three shapes (record 0201).
const MENU_BUTTON = (shape) =>
  `JSXOpeningElement[name.name="MenuButton"]:has(> JSXAttribute[name.name="shape"][value.value="${shape}"])`

// Where a native select may stand: in a phone's branch, the Metrics table's
// `phone ? ... :` and the chart's `titled && ...` (record 0149).
const PHONE_ONLY =
  'ConditionalExpression[test.name="phone"] > .consequent JSXOpeningElement, ' +
  'LogicalExpression[left.name="titled"] > .right JSXOpeningElement'

const GRID = elementWith('METRICS_GRID')
const CLEAR = 'JSXOpeningElement:has(JSXAttribute[name.name="onClick"] > JSXExpressionContainer > Identifier[name="onClearFilters"])'
const MESSAGE_BOX = 'JSXOpeningElement[name.name="MessageBox"]'
const LIVE_REGION = 'JSXAttribute[name.name="role"][value.value="status"]'
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

// The spinner's square. The pill and its list take the row's width.
const SEARCH_WIDTHS = ['4']

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
        selector: text(String.raw`bg-page(?![\x2f\w-])`),
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
                `TemplateLiteral[expressions.${k}.object.name="DRAG"][expressions.${k}.property.name=/^(ghost|insert)$/][quasis.${k + 1}.value.raw=/^\\s*$/][expressions.${k + 1}.${key}=/^LAYER/]`,
            ),
          )
          .join(', '),
        message: 'Add no layer to DRAG.ghost or DRAG.insert: each carries its own.',
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
    // Menu.tsx owns the fixed box, the card and the stacking order (record
    // 0201), so a fix reaches every menu. A menu that spells them again
    // drifts a step, which is how the app came to have five.
    name: 'style-own-menu',
    files: SOURCES,
    ignores: [...TESTS, 'src/components/Menu.tsx'],
    ban: [
      {
        selector: 'Property:matches([key.name="position"], [key.value="position"])[value.value="fixed"]',
        message: 'Position a menu through Menu.tsx.',
      },
      {
        selector: `${role('MENU')}[property.name="card"], ${POPOVER_BOX}`,
        message: 'Stand a menu in Menu.tsx rather than spelling its card.',
      },
    ],
  },
  {
    name: 'style-menu-shell',
    files: ['src/components/Menu.tsx'],
    require: [
      { selector: `${role('MENU')}[property.name="card"]`, count: 1, message: 'Menu.tsx stands the card on MENU.card.' },
      { selector: calls('createPortal'), count: 1, message: 'Menu.tsx portals the card to the body.' },
      { selector: role('MENU_TRIGGER'), count: 1, message: 'MenuButton wears MENU_TRIGGER.' },
      { selector: 'JSXOpeningElement[name.name="IconChevron"]', count: 1, message: 'MenuButton draws the one chevron.' },
    ],
  },
  {
    // The placement is wired from a hook, so the files a second caller could
    // hide in are wider than the components.
    name: 'style-one-placement',
    files: ['src/App.tsx', 'src/components/*.tsx', 'src/hooks/*.ts', 'src/map/**/*.{ts,tsx}', 'src/utils/**/*.ts'],
    ignores: [...TESTS, 'src/utils/listbox.ts', 'src/hooks/usePopover.ts'],
    ban: [
      {
        selector: `${calls('popoverBox')}, FunctionDeclaration[id.name="popoverBox"]`,
        message: 'Ask usePopover where a panel goes, never popoverBox itself.',
      },
    ],
  },
  {
    // Every desk menu is the one menu (#714, record 0201): it stands 4px under
    // its trigger wherever it opens, so no caller picks a placement, and a
    // list of options lives inside its card. The search box's results list is
    // the stated exception, so its file is the one left out. A native select
    // opens the platform's own list, which no stylesheet reaches, so one is
    // drawn on a phone only, where its picker rises from below like every
    // phone menu (record 0149).
    name: 'style-one-menu',
    files: ['src/App.tsx', 'src/components/*.tsx', 'src/hooks/*.ts', 'src/map/**/*.{ts,tsx}'],
    ignores: [...TESTS, 'src/hooks/usePopover.ts', 'src/components/SearchBox.tsx'],
    probe: 'src/components/ColumnsPicker.tsx',
    ban: [
      {
        selector: 'CallExpression[callee.name="usePopover"] Property[key.name="placement"]',
        message: 'Pass usePopover no placement: every menu stands 4px under its trigger.',
      },
      {
        selector:
          'JSXAttribute[name.name="role"][value.value="listbox"]:not(JSXElement[openingElement.name.name="Menu"] JSXAttribute)',
        message: 'A list of options lives in the card Menu.tsx draws; only the search box keeps its own.',
      },
      {
        selector: `JSXOpeningElement[name.name="select"]:not(${PHONE_ONLY})`,
        message: 'Draw a native select on a phone only: a desk picks from MenuSelect.',
      },
    ],
  },
  {
    // The joined unfurl of record 0134 is gone, and with it the card it stood
    // on, the attribute that squared its trigger and the placements that put
    // a card anywhere but under its trigger (record 0201). A role brought back
    // under its old name would bring the second look back with it.
    name: 'style-no-unfurl',
    files: SHIPPED,
    ignores: TESTS,
    probe: 'src/styles.ts',
    ban: [
      {
        selector:
          'Identifier[name=/^(SURFACE_POPOVER|UNFURLED|UNFURL_ANCHOR|UNFURL_FLOOR_PX|unfurledBox)$/], ' +
          'JSXAttribute[name.name="data-unfurled"], Literal[value=/^(data-unfurled|unfurl|cover|hang)$/]',
        message: 'Bring back no unfurled or covering menu: every menu stands under its trigger on one card.',
      },
    ],
  },
  {
    // Every control that opens a menu is a MenuButton in one of the three
    // shapes (record 0201), so it carries the chevron, the hover and the lit
    // state every trigger shares. A plain button with aria-expanded is a
    // fourth trigger with a look of its own. The map's sidebar toggle opens
    // the control panel, not a menu, so its file is left out, and so is the
    // message badge (record 0208): a count on the Analyze button's corner,
    // which the maintainer chose over a trigger shape, opening the one list.
    name: 'style-menu-trigger',
    files: SOURCES,
    ignores: [...TESTS, 'src/components/Menu.tsx', 'src/components/MapRows.tsx', MESSAGES.badge],
    probe: 'src/components/ResultsBar.tsx',
    ban: [
      {
        selector: 'JSXOpeningElement[name.name="button"]:has(> JSXAttribute[name.name="aria-expanded"])',
        message: 'Open a menu from MenuButton, never from a button of its own.',
      },
    ],
  },
  {
    // The panel's menus and the chart's open from the field shape: the model
    // picker, the calendar, each metric's aggregate and the chart's metric.
    name: 'style-menu-field',
    files: [
      'src/components/ModelPicker.tsx',
      'src/components/ForecastCalendar.tsx',
      'src/components/MetricsTable.tsx',
      'src/components/TimeSeriesChart.tsx',
    ],
    require: [
      {
        selector: `${MENU_BUTTON('field')}, JSXOpeningElement[name.name="MenuSelect"]`,
        count: 1,
        message: 'Open a panel menu from the field shape: one MenuButton shape="field" or MenuSelect.',
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
    // The map's chrome at both widths (#714, record 0174): the two rows, the
    // chips and the menus that stand under them. A width, height or offset
    // spelled beside a role moves one part without moving what is derived
    // from the role, and an inset spelled at a call site is how the old
    // column came to sit 4px right of the legends.
    name: 'style-map-chrome',
    files: [
      'src/App.tsx',
      'src/components/AnalysisOverlay.tsx',
      'src/components/LayersPopover.tsx',
      'src/components/MapRows.tsx',
      'src/components/MapLegend.tsx',
    ],
    ban: [
      {
        selector: ride('MAP_CHIP_MENU', String.raw`(^|\s)(w-|top-|left-|right-)`),
        message: 'Spell no width or offset beside MAP_CHIP_MENU.',
      },
      {
        // A range rather than a list, so a step nobody thought of still fails,
        // and guarded so a max-w is not read as a width.
        selector: text(String.raw`(?<![-\w])w-(?:4\d|5\d)\b`),
        message: 'Take the chip menu width from MAP_MENU_W.',
      },
      {
        selector: within(`${MENU_BUTTON('chip')} > JSXAttribute[name.name="className"]`, String.raw`(^|\s)(h-|min-h-|px-|py-)`),
        message: 'Spell no height or padding on a chip: its shape carries both.',
      },
      { selector: text(String.raw`\btop-3\b`), message: 'Take the top inset from MAP_EDGE.top.' },
      { selector: text(String.raw`\bleft-(2|3)\b|\bleft-\[`), message: 'Take the left inset from MAP_EDGE.left.' },
    ],
  },
  {
    // Everything inside the wrapper, which MapStage draws, inherits the one
    // inset, and the legend card reads the wrapper's height (`100cqh`).
    name: 'style-map-wrapper',
    files: ['src/components/MapStage.tsx'],
    require: [
      { selector: role('MAP_EDGE') + '[property.name="publish"]', message: 'The map wrapper publishes MAP_EDGE.publish.' },
    ],
  },
  {
    // The Legend chip and the card under it (#714, record 0174): the chip is
    // the chip shape of the one trigger (record 0201), and the card wears the
    // menu role on the chip cards' one surface (TJ, 2026-10-18).
    name: 'style-map-legend-chip',
    files: ['src/components/MapLegend.tsx'],
    require: [
      { selector: MENU_BUTTON('chip'), count: 1, message: 'The Legend chip is a MenuButton in the chip shape.' },
      { selector: interp('MAP_CHIP_MENU'), count: 1, message: 'The legend card wears MAP_CHIP_MENU.' },
      { selector: role('SURFACE_CHIP_CARD') + '[property.name="key"]', count: 1, message: 'The legend card stands on SURFACE_CHIP_CARD.key.' },
    ],
  },
  {
    // The two rows: the pill and the locate button, then the chips and the
    // compass. A stacking context orders only its own children, so the layer
    // is useless unless the stack itself wears it.
    name: 'style-map-rows',
    files: ['src/components/MapRows.tsx'],
    require: [
      { selector: role('MAP_ROWS') + '[property.name="stack"]', message: 'The rows stand in MAP_ROWS.stack.' },
      { selector: role('LAYER') + '[property.name="mapControls"]', message: 'The rows wear LAYER.mapControls.' },
      { selector: role('MAP_SLOT') + '[property.name="locate"]', message: 'The pill row ends in MAP_SLOT.locate.' },
      { selector: role('MAP_SLOT') + '[property.name="compass"]', message: 'The chip row ends in MAP_SLOT.compass.' },
    ],
  },
  {
    // The Layers chip and the menu under it, unjoined like the legend's
    // (record 0174), on the legend card's surface with the deeper shadow. Its
    // wrapper stands over the Legend chip's, so the menu opens over the legend
    // card rather than under it.
    name: 'style-map-layers-chip',
    files: ['src/components/LayersPopover.tsx'],
    require: [
      { selector: MENU_BUTTON('chip'), count: 1, message: 'The Layers chip is a MenuButton in the chip shape.' },
      { selector: interp('MAP_CHIP_MENU'), count: 1, message: 'The Layers menu wears MAP_CHIP_MENU.' },
      { selector: role('SURFACE_CHIP_CARD') + '[property.name="menu"]', count: 1, message: 'The Layers menu stands on SURFACE_CHIP_CARD.menu.' },
      { selector: text(String.raw`(^|\s)z-\[1\](\s|$)`), message: 'Stand the Layers menu over the legend card with z-[1].' },
    ],
  },
  {
    // The results bar's buttons are controls, so they read at the control
    // size; the micro step is for text that is present but never first. Since
    // #687 they are one group in the mode switch's look rather than links,
    // every word on the bar is shown by the one width rule (`BAR_LABEL`), and
    // the Open-Meteo credit lives on the map's attribution line, so the bar
    // holds no link at all. The window caption sits on the lifted fill, where
    // the caption tier fails AA.
    name: 'style-results-bar',
    files: ['src/components/ResultsBar.tsx'],
    ban: [
      { selector: interp('TEXT.micro'), message: 'Reach for no TEXT.micro in the results bar.' },
      { selector: titleCaption('TEXT.caption'), message: 'Set the window title in CAPTION_LIFTED, not TEXT.caption.' },
      { selector: 'JSXOpeningElement[name.name="a"]', message: 'Put no link in the results bar: its credit is on the map\'s attribution line.' },
      { selector: interp('LINK'), message: 'Draw a results bar button as ACTION_ITEM, not as a link.' },
    ],
    require: [
      {
        // Download CSV opens nothing, so it is the one button that is not a
        // menu's trigger and carries no chevron (record 0201). It may add
        // DISABLED, greyed until there is a row to download (record 0219).
        selector:
          'JSXAttribute[name.name="className"] > JSXExpressionContainer > Identifier[name="ACTION_ITEM"], ' +
          'JSXAttribute[name.name="className"] > JSXExpressionContainer > TemplateLiteral > Identifier[name="ACTION_ITEM"]',
        count: 1,
        message: 'Download CSV wears ACTION_ITEM.',
      },
      {
        selector: MENU_BUTTON('bar'),
        count: 3,
        message: 'The three menu buttons are MenuButtons in the bar shape.',
      },
      {
        selector: 'JSXAttribute[name.name="className"] > JSXExpressionContainer > Identifier[name="ACTION_GROUP"]',
        count: 1,
        message: 'The results bar buttons stand in one ACTION_GROUP.',
      },
      {
        selector: 'JSXAttribute[name.name="className"] > JSXExpressionContainer > Identifier[name="BAR_LABEL"]',
        count: 7,
        message: 'Every word on the bar, the switch\'s three and the buttons\' four, wears BAR_LABEL.',
      },
      { selector: titleCaption('CAPTION_LIFTED'), message: 'Set the window title in CAPTION_LIFTED.' },
    ],
  },
  {
    // 12px is the floor for anything pressed and 11px for text that is read
    // (#687), so a button or a link never wears the micro step. A credit link
    // inside a micro line takes the line's size and stays a footnote; one that
    // sizes ITSELF at the micro step is a control set below the floor, which
    // is what the Removed list's Restore buttons were.
    name: 'style-micro-not-pressed',
    files: SOURCES,
    ignores: TESTS,
    probe: 'src/components/RemovedPicker.tsx',
    ban: [
      {
        selector:
          'JSXOpeningElement[name.name=/^(button|a)$/] > JSXAttribute[name.name="className"] MemberExpression[object.name="TEXT"][property.name="micro"]',
        message: 'Set a button or a link at TEXT.control or CONTROL_SIZE, never TEXT.micro.',
      },
    ],
  },
  {
    // App.tsx and the map column keep the results bar's rule: nothing they
    // draw is text that is present but never first.
    name: 'style-app-micro',
    files: ['src/App.tsx', 'src/components/MapStage.tsx'],
    ban: [{ selector: interp('TEXT.micro'), message: 'Reach for no TEXT.micro in App.tsx or MapStage.tsx.' }],
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
    // The search pill, its results and its message: the row's width, one
    // opaque surface, and severity by STATUS colour rather than a panel
    // notice box.
    name: 'style-search-box',
    files: ['src/components/SearchBox.tsx'],
    ban: [
      {
        // The pill and its list are the row's width, so the one fixed width
        // left is the spinner's square.
        selector: text(`(?<![-\\w])w-(?!(?:${SEARCH_WIDTHS.join('|')})(?:\\s|$))\\d`),
        message: 'Pick no width in SearchBox beyond the spinner.',
      },
      { selector: ride('DROPDOWN', String.raw`\sbg-`), message: 'Spell no surface beside DROPDOWN.' },
      {
        // A panel notice's fill is a tint, and a tint over the map is the map.
        selector: 'TemplateLiteral > Identifier[name=/^NOTICE/], TemplateLiteral > MemberExpression[object.name=/^NOTICE/]',
        message: 'Colour the search message by STATUS, never a NOTICE box.',
      },
    ],
    require: [
      { selector: interp('MAP_PILL_FIELD'), count: 1, message: 'The search field wears MAP_PILL_FIELD.' },
      ...SEARCH_WIDTHS.map((w) => ({
        selector: text(`(?<![-\\w])w-${w}(?:\\s|$)`),
        message: `SearchBox keeps its w-${w}.`,
      })),
      {
        selector:
          'VariableDeclarator[id.name="DROPDOWN"] > TemplateLiteral > MemberExpression[object.name="SURFACE_CHIP_CARD"][property.name="menu"]',
        message: 'DROPDOWN stands on SURFACE_CHIP_CARD.menu, the card every menu wears.',
      },
      { selector: interp('DROPDOWN'), count: 2, message: 'The list and the message both ride DROPDOWN.' },
      { selector: interp('CAPTION_LIFTED'), message: 'The result captions wear CAPTION_LIFTED.' },
      { selector: interp('SEARCH_KIND'), count: 1, message: "A result's kind wears SEARCH_KIND." },
      { selector: interp('STATUS.warn'), message: 'The search message takes STATUS.warn.' },
    ],
  },
  {
    // The chart's metric menu cannot follow the panel column down: its
    // labels carry units. And a row whose width its labels cannot move never
    // wraps, so a sixth metric cannot bring the second line back.
    name: 'style-chart-metric',
    files: ['src/components/TimeSeriesChart.tsx'],
    ban: [
      { selector: named('CONTROL_W'), message: 'Size the chart metric menu by CHART_METRIC_W, not CONTROL_W.' },
      { selector: text('flex-wrap'), message: 'Let the chart metric row wrap nowhere.' },
    ],
    require: [
      { selector: named('CHART_METRIC_W'), message: 'TimeSeriesChart reads CHART_METRIC_W.' },
      {
        selector:
          'JSXOpeningElement[name.name="MenuSelect"]:has(JSXAttribute[name.name="className"] Identifier[name="CHART_METRIC_W"])',
        message: 'Build the desk\'s chart metric as MenuSelect at CHART_METRIC_W.',
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
    files: [...Object.values(PANEL), MESSAGES.list],
    ban: [
      {
        selector: `JSXOpeningElement[name.name="ul"], ${text('list-disc')}, ${text('<ul')}`,
        message: 'Give the messages the whole text column: no list.',
      },
    ],
  },
  {
    // Every message is in the one list the Analyze button's badge opens
    // (#786; record 0208): a NOTICE box is built in MessageList's MessageBox
    // alone, rendered from one element, on the one menu, and the list
    // announces nothing itself, since the live region beside the badge is
    // mounted for good and the list only while it is open.
    name: 'style-message-list',
    files: [MESSAGES.list],
    ban: [
      {
        selector: `${role('NOTICE')}:not(FunctionDeclaration[id.name="MessageBox"] *)`,
        message: 'Build a NOTICE box inside MessageBox alone.',
      },
      {
        selector: fromExport('MessageList', role('STATUS')),
        message: 'Colour nothing by STATUS in the list body.',
      },
      { selector: LIVE_REGION, message: 'Announce nothing from the list: the one live region is MessageRegion.' },
    ],
    require: [
      { selector: 'FunctionDeclaration[id.name="MessageBox"]', message: 'MessageList builds MessageBox.' },
      { selector: MESSAGE_BOX, count: 1, message: 'Render MessageBox in one place.' },
      { selector: 'JSXOpeningElement[name.name="Menu"]', count: 1, message: 'Stand the list on the one menu.' },
    ],
  },
  {
    // Nothing outside the list builds a notice box or renders the list's own.
    name: 'style-notice-once',
    files: SOURCES,
    ignores: [...TESTS, MESSAGES.list],
    probe: PANEL.footer,
    ban: [
      { selector: role('NOTICE'), message: 'Build a NOTICE box in MessageList alone.' },
      { selector: `${MESSAGE_BOX}, ${text('<MessageBox\\b')}`, message: 'Render MessageBox in MessageList alone.' },
    ],
  },
  {
    // The one live region for the panel's messages, mounted for good beside
    // the badge so a message is announced as it arrives, list open or shut.
    name: 'style-live-region',
    files: [MESSAGES.badge],
    require: [{ selector: LIVE_REGION, count: 1, message: 'MessageBadge mounts the one live region for the messages.' }],
  },
  {
    // The Analyze button at either width wears the badge, the region beside
    // it and the one list it opens, and a blocker greys the button rather
    // than disabling it, so a press anywhere on it opens the list (the
    // maintainer, 2026-10-21).
    name: 'style-analyze-badge',
    files: [PANEL.footer, MESSAGES.phoneFoot],
    require: [
      { selector: 'JSXOpeningElement[name.name="MessageBadge"]', count: 1, message: 'Wear one MessageBadge on the Analyze button.' },
      { selector: 'JSXOpeningElement[name.name="MessageRegion"]', count: 1, message: 'Mount MessageRegion once beside the badge.' },
      { selector: 'JSXOpeningElement[name.name="MessageList"]', count: 1, message: 'Open one MessageList from the badge.' },
      {
        selector: 'JSXAttribute[name.name="aria-disabled"] > JSXExpressionContainer > LogicalExpression[left.name="blocked"]',
        count: 1,
        message: 'Grey a blocked Analyze with aria-disabled on blocked, never disabled, so a press opens the list.',
      },
    ],
  },
  {
    // The rest of the panel and the phone's foot build no notice box, colour
    // nothing by status and announce nothing of their own.
    name: 'style-panel-no-status',
    files: [PANEL.frame, PANEL.forecast, PANEL.metrics, PANEL.footer, MESSAGES.phoneFoot],
    ban: [
      { selector: role('NOTICE'), message: 'Build no NOTICE box outside MessageList.' },
      { selector: role('STATUS'), message: 'Colour nothing by STATUS outside MessageList.' },
      { selector: LIVE_REGION, message: 'Announce nothing of your own: the one live region is MessageRegion.' },
    ],
  },
  {
    // The one bare STATUS outside the list, pinned by count: the polygon's
    // draw counter colours its captions by state. Its point count is
    // `DrawReadout`, which the phone's draw bar renders too (#687), so the
    // section keeps the area's two; a third is a message that wandered out
    // of the list.
    name: 'style-draw-counter',
    files: [PANEL.destinations],
    ban: [{ selector: role('NOTICE'), message: 'Build no NOTICE box in the destinations section.' }],
    require: [
      {
        selector: fromExport('DestinationsSection', role('STATUS')),
        count: 2,
        message: 'The polygon block colours its area and its area warning by STATUS.',
      },
      { selector: 'JSXOpeningElement[name.name="DrawReadout"]', count: 1, message: 'Say the point count with DrawReadout.' },
    ],
  },
  {
    // The point count's four states, each coloured by STATUS: the other half
    // of style-draw-counter's six.
    name: 'style-draw-readout',
    files: ['src/components/DrawReadout.tsx'],
    ban: [{ selector: role('NOTICE'), message: 'Build no NOTICE box in the draw readout.' }],
    require: [
      {
        selector: fromExport('DrawReadout', role('STATUS')),
        count: 4,
        message: 'The draw readout colours its four states by STATUS.',
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
    files: ['src/utils/popup/popupChrome.ts'],
    ban: [{ selector: text('<svg[\\s>]'), message: 'Draw the popup glyph from iconPaths.ts.' }],
    require: [
      {
        selector: 'CallExpression[callee.name="externalLinkMarkup"][arguments.length=0]',
        message: 'The popup draws its link-out arrow with externalLinkMarkup().',
      },
    ],
  },
  {
    // Every popup that describes a thing is one card (#738): the header band
    // with the title and facts line, then the notices, the body and the
    // action, all drawn by popupCard in popupChrome.ts. The fire, closure and
    // smoke popups kept a ruled shell of their own for a release after the
    // destination card moved on, because nothing said a popup had to be the
    // card. A builder (`*PopupHtml`) that never calls popupCard is a card of
    // its own, and a <strong>, <br> or <hr> outside the chrome is a title, a
    // line break or a rule written by hand.
    name: 'style-popup-card',
    files: SHIPPED,
    ignores: [...TESTS, 'src/utils/popup/popupChrome.ts'],
    probe: 'src/utils/wildfires.ts',
    ban: [
      {
        selector: [
          'FunctionDeclaration[id.name=/PopupHtml$/]:not(:has(CallExpression[callee.name="popupCard"]))',
          'VariableDeclarator[id.name=/PopupHtml$/]:not(:has(CallExpression[callee.name="popupCard"]))',
        ].join(', '),
        message: 'Build a popup with popupCard from popupChrome.ts, which every card shares.',
      },
      {
        selector: text('<(strong|br|hr)[\\s/>]'),
        message: 'A title, a line and a rule are the card\'s: compose factsLine, bodyLines and popupCard.',
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
  {
    // The design system stops at the Tailwind class, and four channels put
    // pixels on the screen without one: MapLibre paint, canvas drawing, popup
    // HTML and Recharts props. The hue ban in eslint.config.js cannot see a
    // hex literal, which is how `#3b82f6` (blue-500, which would fail that ban
    // as `bg-blue-500`) sat in the map's paint for a year (#365). A colour is
    // written in one of the owners above and composed everywhere else.
    name: 'value-hex',
    files: SHIPPED,
    ignores: [...TESTS, ...COLOR_OWNERS],
    probe: 'src/hooks/useChartSelection.ts',
    ban: [
      {
        selector: text(COLOR_VALUE),
        message: 'Name a colour in the module that owns it (colors.ts, chartColors.ts, map/mapStyles.ts or an overlay module), never at the call site.',
      },
    ],
  },
  {
    // The theme is the header switch's, and dark is the default whatever the
    // operating system says (#706, record 0158). Tailwind's dark variant is a
    // prefers-color-scheme query, so a class wearing it paints by the system's
    // setting under a switch that may say the opposite, and a matchMedia on
    // the same query does the same in script. A colour that differs by theme
    // is a token in index.css with a value in each block. styles.test.ts holds
    // the stylesheets to the same rule, since ESLint does not read CSS.
    name: 'style-no-os-theme',
    files: SHIPPED,
    ignores: TESTS,
    probe: 'src/styles.ts',
    ban: [
      {
        selector: text(String.raw`(^|\s)dark:(\[|[a-z])|prefers-color-scheme`),
        message: "The theme is the switch's, not the system's. Give the colour a token in index.css with a value in each theme.",
      },
    ],
  },
  {
    // Popup markup is handed to MapLibre's setHTML, so its type ramp cannot be
    // a TEXT role. popupChrome.ts owns the three sizes, the button and the
    // rule; a `font-size:` spelled anywhere else is how the popups came to
    // carry one size in five files.
    name: 'value-inline-style',
    files: SHIPPED,
    ignores: [...TESTS, 'src/utils/popup/popupChrome.ts'],
    probe: 'src/utils/poiPopup.ts',
    ban: [
      {
        selector: text(String.raw`\b(font-size|padding|border-radius|background)\s*:`),
        message: 'Compose popup type, padding, radius and background from popupChrome.ts, never inline.',
      },
    ],
  },
  {
    // The app's own layers (results, pending, the ring) read their paint from
    // map/mapStyles.ts, so a radius or a halo cannot be spelled twice the way
    // the result and pending markers' were. The overlays are not under this
    // check: each one's pure module is already the one place its look lives,
    // and the basemap's numbers match OpenFreeMap rather than the app.
    name: 'map-paint-named',
    files: ['src/map/*.ts'],
    ignores: [...TESTS, 'src/map/mapStyles.ts', 'src/map/basemap.ts'],
    probe: 'src/map/resultsLayer.ts',
    ban: [
      {
        selector: 'Property[key.value=/^(circle|line|fill|text|icon)-/] > Literal[value=type(number)]',
        message: 'Name a paint number in map/mapStyles.ts rather than spelling it in a layer.',
      },
    ],
  },
]
