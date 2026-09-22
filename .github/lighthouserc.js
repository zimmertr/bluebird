/**
 * The cold-load gate (issue #337).
 *
 * `pr.yml` runs this against the image the PR built, so what is measured is
 * the app as it will actually be served: the same bundle, the same static
 * mount, the same `Cache-Control` middleware. A PR that makes the first screen
 * heavier or slower fails here instead of being noticed months later, which is
 * how a 1.4 MB icon shipped on every cold load for months before anyone
 * measured one.
 *
 * Two deliberate choices make this a gate rather than a weather report:
 *
 * 1. **Every third-party host is blocked.** The map tiles, the Open-Meteo
 *    services, the radar and snow tiles and Nominatim are someone else's servers on someone else's day,
 *    and a gate that fails when OpenFreeMap is slow teaches everyone to ignore
 *    it. What is left is exactly what this repository ships.
 * 2. **The default mobile preset, not desktop.** Lighthouse's throttling is a
 *    simulation rather than a real slow link, so it is reproducible to the
 *    millisecond (measured 2026-09-14: three runs of the same image landed
 *    within 2 ms of each other), and a phone on a weak connection is the
 *    reader this app is built for.
 *
 * The byte assertions are the sharp edge: they are deterministic, so they are
 * set close to what the app costs today. The timing assertions are loose,
 * because the simulation's inputs still include the runner's own CPU, and a
 * flaky gate is worse than no gate. Both are errors. Re-measure and move a
 * number when a change earns it; never widen one to make a red run green.
 */
module.exports = {
  ci: {
    collect: {
      url: ['http://localhost:8000/'],
      // Three runs, and the assertions read the median. One run can catch a
      // cold JIT or a slow container start.
      numberOfRuns: 3,
      settings: {
        chromeFlags: '--no-sandbox --disable-gpu --disable-dev-shm-usage',
        blockedUrlPatterns: [
          '*openfreemap.org*',
          '*open-meteo.com*',
          '*nominatim.openstreetmap.org*',
          '*agron.iastate.edu*',
          '*mapservices.weather.noaa.gov*',
        ],
      },
    },
    assert: {
      assertions: {
        // Measured on the image this gate landed with (2026-09-14), mobile
        // preset, third parties blocked:
        //   total 604,280 B · script 563,835 B · image 11,199 B · document 2,221 B
        // Each budget is that number plus room for a change that pays for
        // itself, not plus room for anything at all.
        'resource-summary:total:size': ['error', { maxNumericValue: 700_000 }],
        'resource-summary:script:size': ['error', { maxNumericValue: 620_000 }],
        // The whole point of the first pass: the app draws one 256px logo on
        // the first screen. Anything approaching this number is a full-size
        // image that was never resized.
        'resource-summary:image:size': ['error', { maxNumericValue: 60_000 }],
        'resource-summary:stylesheet:size': ['error', { maxNumericValue: 40_000 }],
        'resource-summary:document:size': ['error', { maxNumericValue: 8_000 }],

        // Timings on the same image: FCP 3,459 ms · LCP 4,239 ms · TBT 17 ms.
        'first-contentful-paint': ['error', { maxNumericValue: 4_500 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 6_000 }],
        'total-blocking-time': ['error', { maxNumericValue: 600 }],
        // 0.1 is the Core Web Vitals "good" boundary rather than a local
        // measurement. The app sits at 0, and it stays there by giving every
        // image its intrinsic size.
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],

        // The score moves with Lighthouse's own scoring curve, which changes
        // between versions, so it informs rather than gates.
        'categories:performance': ['warn', { minScore: 0.75 }],

        // Unlike performance, this one gates. Its audits are pass or fail
        // checks on the page's markup rather than a curve over timings, so the
        // score moves only when the page does. Measured at 0.96 on the first
        // screen (0.963 unrounded, 191 audit weight in play), and the one
        // failing audit is color-contrast, the same muted label the browser
        // job's axe audit lists as known. At 0.95 a new failure of weight 3 or
        // more turns this red; only a weight-1 audit fits in the margin.
        'categories:accessibility': ['error', { minScore: 0.95 }],
      },
    },
    upload: {
      // Keep the reports in the workflow's own artifacts. The hosted
      // alternative publishes a public URL for every run.
      target: 'filesystem',
      outputDir: './.lighthouseci',
    },
  },
}
