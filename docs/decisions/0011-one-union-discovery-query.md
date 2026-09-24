# 0011. Discovery sends one Overpass query for every destination type

Verbatim guide text at 971fede, copied before the edit to the template.

## From `CLAUDE.md`, line 122

2. Queries Overpass API for **every** named OSM feature in the polygon, with no sampling. `destination_types` is a **set** — peaks, trailheads and lakes are found by one query whose clauses are unioned (`_CLAUSES` in `osm/query.py`), never one request per type, because Overpass is donated and this is the slowest step of an analysis. Each returned element is classified from its own tags (`_classify`), so a row is tagged with what it *is* rather than what was asked for; an empty set skips discovery entirely, which is how an analysis of only `custom_destinations` is expressed.
