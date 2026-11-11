# 0247. The fire detections neither fetch nor draw below zoom 5, and their row does not grey there

- Status: Accepted
- Date: 2026-10-27
- Decider: Claude, building #799, for the maintainer's review on the pull request. The brief named a radius small at zoom 6 and readable at zoom 12, and no floor.
- Issues and PRs: #799
- Cited in code as: #799
- Guide: [`frontend/src/map/CLAUDE.md`](../../frontend/src/map/CLAUDE.md), the `overlays/fireActivity.ts` bullet
- Related: 0246 (fire activity is a pod snapshot of FIRMS's files), 0180 (the trailhead and crag markers, which fetch nothing below zoom 11), 0117 (a Layers row greys over a view its layer cannot draw on)

## Context

The route answers whatever box it is sent, and the world holds about 200,000 detections in a burning season. A map zoomed out to a continent would ask for most of them on every pan, and draw a smear of starbursts no one can tell apart.

## Decision

`FIRE_ACTIVITY_MINZOOM` is 5. Below it the layer asks the pod for nothing and MapLibre draws nothing (the layer's `minzoom`), and what the layer holds stays for the zoom back in, the way the trailhead and crag markers do it below zoom 11. The Layers row stays live at every zoom: it greys only where a layer's data has an edge, and these detections are worldwide.

## Evidence

Measured 2026-10-27 on the day's global files, for a view 1,389 px wide: at zoom 5 a view is about 61° of longitude, and the densest such view (southern Africa, late in its burning season) held 76,792 detections, 15.5 MB of JSON and 1.0 MB gzipped, formatted in 57 ms. At zoom 4 a view of about 122° reaches most of a continent's fires at once, and the world box is 198,575 detections and 40.2 MB. North America held 4,711 on the same day, so a view of the whole western United States at zoom 5 was 2,406 detections and 0.49 MB.

## Alternatives rejected

- **No floor.** A world view would fetch and draw 200,000 starbursts on every settled pan.
- **Greying the row below the floor**, as a row greys outside its coverage (0117). That needs the zoom in the coverage test and changes what a grey row means, from "nothing here" to "nothing at this zoom". The trailhead markers set the precedent of a quiet floor instead.
- **A floor at 6**, where the brief's radius starts. A view of the whole western United States is zoom 5 on a desk, and its fires are a few thousand.
- **Thinning on the server for a wide box.** A second picture of the same data with its own rules, for a view no one reads a single fire from.

## Consequences

A reader who zooms out past a continent sees the stars go, with nothing saying why; zooming in brings them back without a fetch where the view was already held. A wide desk at zoom 5 over a burning season can still ask for a megabyte gzipped, which the pod formats in under a tenth of a second.
