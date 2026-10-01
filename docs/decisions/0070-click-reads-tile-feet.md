# 0070. A clicked summit takes its elevation from the tile's own feet

- Status: Accepted
- Date: 2026-10-01
- Decider: TJ (#581, item 4)
- Issues and PRs: #581, #119, #229
- Cited in code as: #581
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `basemapPoi.ts` bullet; [`CLAUDE.md`](../../CLAUDE.md), the mirrors table, row 20

## Context

An unnamed summit is named from its elevation, `Peak 8115`, by discovery on the server and by a click on the map. The two must agree, or one mountain becomes two destinations, and neither dedup rule (exact name, or a 5-decimal coordinate) can merge them. The readiness review found Agnes Mountain named `Peak 8115` by discovery and `Peak 8114` by a click.

## Decision

`elevationFtOf` in `basemapPoi.ts` reads the tile's `ele_ft` first and converts `ele` only when a tile carries metres alone. The server's `_ele_ft` is unchanged: it converts OSM's raw `ele` tag, decimals included.

## Evidence

The tiles are OpenFreeMap's, built by Planetiler. Its OpenMapTiles profile writes `"ele", (int) Math.round(meters)` and `"ele_ft", (int) Math.round(meters * 3.2808399)` from the same raw metres (`Utils.java`, planetiler-openmaptiles, read 2026-10-01). So `ele` loses up to half a metre and `ele_ft` does not. Agnes Mountain's raw 2473.4 m is 8114.8 ft: 8115 on the server and in the tile's `ele_ft`, while the tile's `ele` of 2473 converts to 8114. Five nearby summits read from two z12 tiles and the OSM API on 2026-10-01 had whole-metre tags and agreed either way; over uniformly random decimal tags, converting `ele` disagrees with the server on about 69 % of them, by up to 2 ft.

## Alternatives rejected

- Round the raw metres on the server before converting: changes every discovered decimal-tag summit's name and its Elevation column, moves the server up to 1.6 ft from OSM's own figure, and would need half-up rounding to match Java where Python rounds half to even.

## Consequences

`basemapPoi.test.ts` holds the Agnes Mountain case. The agreement depends on the tile build computing `ele_ft` from raw metres: the older OpenMapTiles SQL build computed it from truncated metres, so a change of tile provider re-opens this. The two factors differ past the fifth decimal, so the two sides can still round apart when a value lands within a thousandth of a foot of a half.
