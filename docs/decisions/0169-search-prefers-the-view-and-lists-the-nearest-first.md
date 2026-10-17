# 0169. A place search prefers the map's view and lists the nearest match first

- Status: Accepted
- Date: 2026-10-16
- Decider: the maintainer (TJ), on issue #711, 2026-10-16: ship the view box and the distance rank together, drop roads and zoning areas from the list, measure from the map's centre and never read a position
- Issues and PRs: #711, #708 (the ten-result list that made the order visible), #696
- Cited in code as: #711
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `routes/geocode.py` and `services/bbox.py` bullets; [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `geocode.ts` bullet; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `SearchBox.tsx` and `MapView.tsx` bullets; [`docs/DATA.md`](../DATA.md), Nominatim; [`docs/USAGE.md`](../USAGE.md), Search by name; [`docs/API.md`](../API.md); [`docs/TRAFFIC.md`](../TRAFFIC.md)
- Related: 0076 (an optional parameter is additive), 0117 (the Layers menu reads the map's view the same way)

## Context

The search box sent `q` and `limit` and showed Nominatim's list as sent. Nominatim ranks the world by an importance score, so a reader in the Cascades typing a name shared across ranges saw the famous namesakes and often none of the local ones. PR #708 raised the list to ten and made that visible. The maintainer asked for an audit before a change.

The audit ran fourteen queries from the app's opening view (`lng -120.5, lat 47.5, zoom 7`, about `lon -128.4 to -112.6, lat 44.2 to 50.8` on a 1440x900 desk) on 2026-10-16, each with and without that view as Nominatim's `viewbox`, 28 requests at one a second. Counting the twelve queries a local answer exists for, the local place stood first in 2 as sent, and for 8 of them it was not among the ten at all: `Mount Washington` answered Kentucky, New Hampshire, Massachusetts and Maryland before Oregon, and `Snow Lake` answered one town in Manitoba. Nominatim's documentation calls `viewbox` a boost that changes order only; measured, it changed which places came back. `Index`, `Concrete` and `Mount Jefferson` came back as the one local row, and `Snow Lake` as six Cascades lakes. Inside the box Nominatim still ordered by importance, and every rural peak and lake carried the same floor score (0.160 or 0.133), so the box alone put the local place first in 3 of 12: `Pyramid Peak` in King County stood eighth and `Mirror Lake` in Kittitas County seventh. The box followed by a sort on distance from the view's centre put it first in 11 of 12. The miss was `Springfield`, where two `landuse=residential` subdivisions inside the box stood nearer than Springfield, Oregon; dropping those rows made it 12 of 12. The two misspellings, `Mt Ranier` and `Snoqualme Pass`, answered streets carrying the same misspelling and nothing, which no ordering reaches. The full table is a comment on #711.

## Decision

**The pod's `GET /api/geocode` takes an optional `viewbox`**, `west,south,east,north`, parsed by the same function the overlay routes' `bbox` goes through, forwarded to Nominatim without `bounded` and part of the cache key, because the box changes the answer and not only its order. Optional with no default, so the contract change is additive (0076).

**The browser sends the map's view rounded outward to whole degrees**, so the pod holds one answer per query, limit and box rather than per exact view; outward, so the box never cuts a corner of what the reader sees. A zoom-14 view a few kilometres wide becomes a one-degree box, which still prefers what is near. MapLibre does not wrap longitude, so a view dragged across the antimeridian is brought back inside the globe by whole turns, and one that straddles it, or spans the world, becomes the globe in longitude, which prefers everything.

**The browser sorts the answer by great-circle distance from the map's centre**, and the centre is the only origin. The maintainer chose it over the reader's position: a press of the locate button has already moved the map onto them, and once they pan away the centre is what they are looking at. No position is read, so no permission is asked and nothing is kept.

**Roads and zoning areas never reach the list**, with or without a view. A row whose OSM key is `highway` or `landuse` carries a name a reader may type and names nowhere to stand. The maintainer chose dropping them over sorting them last. A row whose coordinates do not parse goes with them, since a NaN in the sort would scramble the rest. A box with no area is refused by the pod with a 422, because Nominatim answers one with a 400 that would read as an outage.

The words of the list do not change, and nothing on the screen says how it is ordered.

## Alternatives rejected

- **The box alone.** First in 3 of 12. Nominatim's order inside the box is its flat importance score.
- **The sort alone.** First in 4 of 12. It can only reorder the ten the global ranking chose, and for 8 queries the local place was not among them.
- **Measuring from the reader's position after a press of the locate button.** Adds state, a line in `DATA.md` about what is kept, and nothing the map's centre does not already give once the button has moved the map.
- **Sorting roads and zoning areas last instead of dropping them.** Kept rows no reader asked for in a list ten tall.
- **`bounded=1`.** A filter. A place outside the view would never come back, and a reader who zoomed in on the wrong valley would find nothing.
- **The exact view as the box.** Every pan a cache miss, for a bias a whole degree gives just as well.

## Consequences

A search from a view of the Cascades lists the Cascades namesakes first and the famous ones after. The pod's geocode cache fragments by box; the whole-degree rounding bounds the fragmentation and the hit rate under it was not measured. A search before the map exists carries no box and shows Nominatim's list as sent. The browser suite's fixture answers `/api/geocode` with a fixed, deliberately out-of-order list, and `search.spec.ts` reads the order the box shows.
