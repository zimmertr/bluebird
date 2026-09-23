// See plugin.js for the shape of a check. These were `?raw` tests while the map
// was being cut out of MapView.tsx into src/map/ (#410). Each one is about what
// a file under the map says, so each is a rule here now: a violation is
// underlined where it is, and a comment that names a banned thing is not one.
import { named } from '../plugin.js'

const MAP_VIEW = 'src/components/MapView.tsx'
const MAP_MODULES = 'src/map/**/*.{ts,tsx}'
const MAP_TESTS = 'src/map/**/*.test.{ts,tsx}'

// The handler MapView registers for `load`, and the only one it may register.
const LOAD = 'CallExpression[callee.property.name="on"][arguments.0.value="load"]'
const RESTORED_READ = 'MemberExpression[object.name="restoredPolygonRef"][property.name="current"]'

// A function declared at the top level of a file, exported or not.
const topLevel = (attr) =>
  `Program > FunctionDeclaration${attr}, Program > ExportNamedDeclaration > FunctionDeclaration${attr}`
// A function by name, declared anywhere: as a function or as a const.
const declares = (pattern) =>
  `FunctionDeclaration[id.name=${pattern}], VariableDeclarator[id.name=${pattern}]`
const oneOf = (names) => `/^(${names.join('|')})$/`

// A module may declare these top-level functions and no others. Each one earns
// its place by needing a map, a canvas or an event; a new name is the question
// "can this be plain data in and plain data out?", and if it can, it belongs in
// utils/ with a test of its own.
const declaresOnly = (name, file, names) => ({
  name,
  files: [file],
  ban: [
    {
      selector: topLevel(`[id.name!=${oneOf(names)}]`),
      message: `Declare only ${names.join(', ')} at the top level of this file; plain data goes to utils/.`,
    },
  ],
  require: names.map((n) => ({
    selector: topLevel(`[id.name="${n}"]`),
    count: 1,
    message: `Declare ${n} here, once.`,
  })),
})

// Each map helper that needs a map, a canvas or an event has one home, and a
// second copy anywhere else in the wiring is the drift this catches.
const oneHome = (name, home, names) => ({
  name,
  files: [MAP_VIEW, MAP_MODULES],
  ignores: [home, MAP_TESTS],
  ban: [{ selector: declares(oneOf(names)), message: `Import ${names.join(', ')} from ${home}.` }],
})

export const MAP = [
  {
    // MapView constructs the map, mounts every feature in one call when the
    // map loads, keeps the camera, and hands the features props. Everything a
    // feature draws or listens on is in its module under src/map/, so a
    // source, a layer, a listener or a popup written back here is a feature
    // split again. MapLibre needs WebGL, which neither Vitest project has, so
    // nothing in this file can be tested except by reading it.
    name: 'map-view-wiring',
    files: [MAP_VIEW],
    ban: [
      {
        selector: topLevel(''),
        message: 'Declare no top-level function in MapView: a map helper goes to src/map/, plain data to utils/.',
      },
      {
        selector: 'CallExpression[callee.property.name=/^(addSource|addLayer|addImage)$/]',
        message: 'Add a source or a layer in the feature module under src/map/ that owns it.',
      },
      {
        selector: 'CallExpression[callee.property.name=/^(on|once)$/][arguments.0.value!="load"]',
        message: 'Listen in the feature module under src/map/; MapView listens for load alone.',
      },
      {
        selector: 'NewExpression[callee.name="Popup"], NewExpression[callee.property.name="Popup"]',
        message: 'Open a popup in its feature module, on the board in map/popups.ts.',
      },
      {
        selector: 'CallExpression[callee.name=/^mount(?!Features$)/]',
        message: 'Mount a feature through mountFeatures in map/features.ts.',
      },
      {
        selector: 'Identifier[name=/^(resultPopupRef|poiPopupRef|openPopupsRef)$/]',
        message: 'Keep no popup ref: every popup is on the board in map/popups.ts.',
      },
      {
        selector:
          'Identifier[name=/^(DRAW_COLOR|WIND_ARROW_IMAGE|startVertexDrag|radarTileUrl|snowTileUrl|gridRaster|fetchWildfires|fetchSmoke)$/]',
        message: 'This belongs to the feature module under src/map/ that draws it.',
      },
      {
        // The map can only report an area once it has loaded, so a ring
        // restored from a link had none. useDestinationInputs derives it from
        // the polygon.
        selector: named('bboxAreaKm2'),
        message: 'Leave the area of the ring to useDestinationInputs.',
      },
      {
        // A handler registered once on load closes over the first render's
        // props. The controller in map/controller.ts carries the latest ones;
        // a ref seeded from a prop is the mirror it replaced. The restored
        // ring is the one seeded ref, and it is not a mirror: nothing keeps
        // it current, and restoreRing writes it.
        selector: 'CallExpression[callee.name="useRef"][arguments.0.type="Identifier"][arguments.0.name!="polygon"]',
        message: 'Read a prop through the controller rather than seeding a ref with it.',
      },
      {
        // An effect whose every statement writes a ref.
        selector:
          'CallExpression[callee.name="useEffect"] > ArrowFunctionExpression > BlockStatement[body.length>0]' +
          ':not(:has(> :not(ExpressionStatement[expression.type="AssignmentExpression"][expression.left.property.name="current"])))',
        message: 'Keep no effect that copies a value into a ref; write the controller instead.',
      },
      {
        // The ring a `?poly=` link opens with is read when MapLibre fires
        // `load`, which behind the welcome modal is long after mount, and a
        // Clear or a Cancel can land in between. A read anywhere else is a
        // snapshot that cannot see them.
        selector:
          `${RESTORED_READ}:not(AssignmentExpression > MemberExpression.left)` +
          `:not(${LOAD} ${RESTORED_READ}):not(FunctionDeclaration[id.name="frameOpening"] ${RESTORED_READ})`,
        message: 'Read the restored ring in the load handler or frameOpening alone.',
      },
      {
        selector:
          'VariableDeclarator[init.type="Identifier"][init.name="polygon"], ' +
          'AssignmentExpression[right.type="Identifier"][right.name="polygon"]',
        message: 'Capture no copy of the polygon prop; the restored ring is read on load.',
      },
    ],
    require: [
      { selector: `${LOAD} CallExpression[callee.name="mountFeatures"]`, count: 1, message: 'Mount every feature once, in the load handler.' },
      { selector: `${LOAD} CallExpression[callee.name="frameOpening"]`, count: 1, message: 'Take the opening frame in the load handler.' },
      { selector: `${LOAD} ${RESTORED_READ}`, message: 'Hydrate the restored ring in the load handler.' },
      {
        selector:
          'Property[key.name="restoreRing"] AssignmentExpression[left.object.name="restoredPolygonRef"][right.name="ring"]',
        count: 1,
        message: 'Let restoreRing write the restored ring, for Clear and for Cancel.',
      },
      {
        selector: 'CallExpression[callee.object.name="controller"][callee.property.name="update"]',
        count: 1,
        message: 'Write the controller in one effect.',
      },
      {
        // App.tsx hands MapView only stable props, which is worth nothing
        // unless MapView compares them.
        selector: 'ExportDefaultDeclaration > CallExpression[callee.name="memo"] > Identifier[name="MapView"]',
        count: 1,
        message: 'Export MapView as memo(MapView).',
      },
      {
        // map.css wraps the vendor stylesheet in layer(base). Imported here
        // rather than from index.css, so the text pages do not load it.
        selector: 'ImportDeclaration[source.value="../map.css"]',
        count: 1,
        message: 'Import the map CSS from MapView.',
      },
    ],
  },
  {
    // The rules every file of the map's wiring shares.
    name: 'map-shared-rules',
    files: [MAP_VIEW, MAP_MODULES],
    ignores: [MAP_TESTS],
    ban: [
      {
        selector: declares(
          oneOf(['featureRow', 'framePadding', 'makeDrawData', 'pendingFC', 'polygonsOf', 'resolveMapClick', 'ringToPts']),
        ),
        message: 'Import this helper from utils/ rather than declaring it in the map wiring.',
      },
      {
        // A handler that copied the inputs when it was registered would hold
        // the first render's values, which is the bug the controller fixes.
        selector: 'VariableDeclarator[id.type="ObjectPattern"][init.object.name="controller"][init.property.name="inputs"]',
        message: 'Read controller.inputs when the event fires; never destructure it.',
      },
    ],
  },
  oneHome('map-home-basemap', 'src/map/basemap.ts', ['enhanceBasemap', 'lakeAnchor', 'setSource']),
  oneHome('map-home-popups', 'src/map/popups.ts', ['isPinning', 'popupOptions']),
  oneHome('map-home-results', 'src/map/resultsLayer.ts', ['updateResults']),
  declaresOnly('map-basemap-declares', 'src/map/basemap.ts', [
    'enhanceBasemap',
    'lakeAnchor',
    'setSource',
    'makeGlowImage',
    'poiLabelLayout',
    'glowTwin',
  ]),
  declaresOnly('map-grid-declares', 'src/map/overlays/forecastGrid.ts', [
    'gridRedraws',
    'mountForecastGrid',
    'rasterImage',
  ]),
  declaresOnly('map-results-declares', 'src/map/resultsLayer.ts', [
    'makeArrowImage',
    'mountResultsLayer',
    'updateResults',
  ]),
  declaresOnly('map-poi-declares', 'src/map/poiPopup.ts', ['mountPoiPopups']),
  declaresOnly('map-popups-declares', 'src/map/popups.ts', ['createPopupBoard', 'isPinning', 'popupOptions']),
  {
    // What map/basemap.ts must say about the clickable peaks and lakes. The ids
    // and the label offset are compared with utils/basemapPoi.ts in its test.
    name: 'map-basemap-layers',
    files: ['src/map/basemap.ts'],
    require: [
      {
        // A lake drawn by our layer AND by the style's would put two labels
        // on one point. One class name governs both halves.
        selector: 'ArrayExpression[elements.0.value="=="][elements.2.name="LAKE_CLASS"]',
        message: 'Draw only the lake class the app accepts.',
      },
      {
        selector: 'ArrayExpression[elements.0.value="!="][elements.2.name="LAKE_CLASS"]',
        message: 'Take that lake class off the style\'s own water labels.',
      },
      { selector: 'Literal[value="water_name_point_label"]', message: 'Filter the style\'s point water labels.' },
      {
        // Lakes and peaks share one floor and one look, so neither kind of
        // destination can become clickable at a zoom the other is not.
        selector: 'Property[key.name="minzoom"][value.name="POI_MINZOOM"]',
        count: 3,
        message: 'Give every clickable layer the one POI_MINZOOM.',
      },
      {
        selector: 'Property[key.name="paint"][value.name="POI_LABEL_PAINT"]',
        count: 3,
        message: 'Give every clickable layer the one POI_LABEL_PAINT.',
      },
      {
        // Peaks build from the shared layout directly; the two lake layers
        // share one recipe, spelled once and spread twice.
        selector: 'CallExpression[callee.name="poiLabelLayout"]',
        count: 2,
        message: 'Build the peak layout and the one lake recipe from poiLabelLayout.',
      },
      {
        // The long lakes render only because their layer places labels along
        // the line, and look like the rest only because it pins them upright.
        selector: 'Property[key.value="symbol-placement"][value.value="line-center"]',
        message: 'Place a long lake\'s label along its line.',
      },
      { selector: 'Property[key.value="text-rotation-alignment"][value.value="viewport"]', message: 'Keep a line label\'s text upright.' },
      { selector: 'Property[key.value="icon-rotation-alignment"][value.value="viewport"]', message: 'Keep a line label\'s icon upright.' },
      {
        // Each label's halo is built from that label's own spec, so the two
        // cannot come to light different features.
        selector: 'CallExpression[callee.name="glowTwin"][arguments.0.name="layer"]',
        message: 'Build each halo from its own label with glowTwin.',
      },
      {
        selector: 'Property[key.name="id"] > TemplateLiteral[quasis.1.value.raw="-glow"]',
        count: 1,
        message: 'Name a halo after its label, in one place.',
      },
      {
        selector: 'Property[key.name="filter"][value.object.name="layer"][value.property.name="filter"]',
        message: 'Give a halo its label\'s filter.',
      },
      {
        selector: 'Property[key.name="minzoom"][value.object.name="layer"][value.property.name="minzoom"]',
        message: 'Give a halo its label\'s floor.',
      },
      {
        // A halo that took part in collision would make hovering the panel
        // remove the labels it is pointing at.
        selector: 'Property[key.value="icon-ignore-placement"][value.value=true]',
        message: 'Keep the halo out of label collision.',
      },
      {
        // Only the peak tiles carry an elevation.
        selector: 'ArrayExpression[elements.0.value="has"][elements.1.value="ele_ft"]',
        message: 'Print an elevation only where the tile has one.',
      },
      { selector: 'Property[key.value="icon-image"][value.name="icon"]', count: 1, message: 'Take the POI icon in one place.' },
    ],
  },
  {
    // maplibre-gl adds a compact attribution open and folds it on the first
    // drag, so the phone's (i) is a licence line until the reader pans. It is
    // folded on add, with the class the library's own toggle removes.
    name: 'map-attribution-folded',
    files: ['src/map/controls.ts'],
    require: [
      {
        selector:
          'FunctionDeclaration[id.name="addAttribution"] CallExpression[callee.property.name="addControl"][arguments.1.value="bottom-right"]',
        count: 1,
        message: 'Add the attribution bottom right, in addAttribution.',
      },
      {
        selector:
          'FunctionDeclaration[id.name="addAttribution"] CallExpression[callee.property.name="remove"][arguments.0.value="maplibregl-compact-show"]',
        count: 1,
        message: 'Fold the compact attribution when it is added.',
      },
    ],
  },
  {
    // The grid's two drawings are two magnification filters on one layer, so
    // the style moves a paint property and nothing else. The field leaves the
    // map by the layer's visibility, hidden from the start, because an image
    // source keeps the last image it decoded.
    name: 'map-grid-layer',
    files: ['src/map/overlays/forecastGrid.ts'],
    require: [
      {
        selector: 'ConditionalExpression[test.right.value="smooth"][consequent.value="linear"][alternate.value="nearest"]',
        count: 1,
        message: 'Switch the grid style by its resampling filter.',
      },
      { selector: 'Literal[value="raster-resampling"]', count: 2, message: 'Declare the resampling filter and switch it, nowhere else.' },
      {
        selector:
          'CallExpression[callee.property.name="setLayoutProperty"][arguments.0.value="forecast-grid-fill"][arguments.1.value="visibility"][arguments.2.value="none"]',
        message: 'Clear the field by hiding its layer.',
      },
      {
        selector: 'ObjectExpression:has(> Property[key.name="id"][value.value="forecast-grid-fill"]) Property[key.name="visibility"][value.value="none"]',
        count: 1,
        message: 'Declare the field layer hidden.',
      },
    ],
  },
]
