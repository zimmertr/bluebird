// The forecast grid: the ranked metric drawn under the markers (#246), in
// either of two styles over one set of samples.
//
// #121 rejected a forecast-derived raster, and the rejection was right about
// what it was aimed at: interpolating between two SUMMITS across the valley
// between them invents weather in exactly the terrain this app serves. Drawing
// between MODEL GRID POINTS is a different act. Open-Meteo answers a coordinate
// with the value of the model grid cell containing it, so sampling at the
// model's own pitch means adjacent samples are adjacent grid cells, and the
// field between them is one the model already claims is smooth. Every
// meteorological renderer draws it that way, Windy included.
//
// Both styles are therefore defensible, and they say different true things,
// which is why the panel offers both rather than this file choosing:
//
// - `blocks` (the default) draws each sample as its own square. It shows you
//   where the samples ARE, so the model's resolution is a thing you can see
//   and count rather than a number in the legend. Its edges are the only
//   dishonest part: the model has no discontinuity there.
// - `smooth` draws the field between samples. It reads the way every other
//   forecast map reads, and it is the honest shape of a field the model
//   already treats as continuous. What it hides is how few samples are under
//   it.
//
// They are ONE raster drawn with two magnification filters, not two drawings:
// `raster-resampling` is `nearest` for blocks and `linear` for smooth. Nothing
// downstream of this file needs to know which is showing, the switch touches no
// data, and there is no second layer to keep in step.
//
// The honesty rule sits with the pitch either way, and the legend states it:
// that is the distance over which the picture is a drawing rather than a
// measurement.
//
// Everything here is pure, including the raster, which is built as a pixel
// buffer rather than a canvas so Vitest can assert on it without a DOM. The
// fetching lives in `hooks/useForecastGrid.ts` and the drawing in `MapView`.
//
// The overlay is four flat sibling modules, and this file re-exports them so
// every importer reads one name: the lattice, the raster, the legend row and
// the arrows. Flat rather than a folder, because the style guardrails in
// `styles.test.ts` glob `./utils/*.ts` and a sub-folder would escape them.

export * from './forecastGridLattice'
export * from './forecastGridRaster'
export * from './forecastGridLegend'
export * from './forecastGridArrows'
