# 0079. A Region 3 or 4 order's own words can veto its citation, a short list excludes what no words can, and an order that has not started is not live, and a Stage 3 fire closure counts by its type

- Status: Accepted. Supersedes 0068 in part: which orders pass, and what counts as live.
- Date: 2026-10-01
- Decider: the maintainer (TJ), on issue #568 (a text veto plus a short exclusion list; an order that has not started is not active; then, the same day, "Pass Stage 3 fire closures.")
- Issues and PRs: #568, #551, #588, #596
- Cited in code as: #568
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/services/usfs_closures.py` bullet

## Context

[0068](0068-forest-orders-entry-closure-test.md) passes a Region 3 or 4 order when its `cfr` cites 36 CFR 261.52(e) or 261.53(e), or its text says entry is prohibited in a sentence that names no permit. Many orders cite paragraph (e) for something narrower than a person on foot: posted sites, vehicles, or nothing at all. The Round 5 readiness review (2026-10-01) found six such passes in a live read of 2026-09-30. The worst was the Payette National Forest's "Abandoned Mine Area Closure", whose polygon is the whole forest (2.3 million acres), so the map painted the Payette as closed and the Closure column flagged every summit on it. The same review found that `ORDER_WHERE` read only the rescind and end dates, so Region 4's Goose Creek winter order was served as standing a month before it starts, and that the sentence splitter cut at every period, so "Mile 12.5 to Mile 40 without a permit." read as a closure.

## Decision

The order's own words veto both signals, in three narrow forms, each in `usfs_closures.py` beside the permit exception:

- `ORDER_KIND_VETO`, over `ordertype` and `ordername`: `motor vehicle use prohibition`, `motor vehicle closure`, and a Stage 1 or Stage 2 fire restriction (`fire restrictions? - stage [12]`, `stage (1|2|i|ii) fire restriction`). Stage 3 closes the forest and is not vetoed.
- `TEXT_SCOPE_VETO`, over the sentence that carries the entry words: `with a motori[sz]ed vehicle` and `when posted`. Such a sentence does not count, and it vetoes the citation as well, because it says what the order's (e) closes. An unlimited entry sentence elsewhere in the same order still passes it. A permit sentence keeps its 0068 meaning: it does not count, and it leaves the citation standing.
- `EXCLUDED_ORDERS`, for an order no rule over its text can catch, keyed on `ordernum` with a comment per entry saying what the order closes and when it was read. Today it holds one entry, `04-12-328`, the Payette mine order.

One type passes an order by itself, and it was added the same day after the first change shipped in #596: `STAGE_THREE_FIRE_CLOSURE`, the whole `ordertype` `Fire Closure - Stage 3` as the feeds spell it. Such an order counts with no citation and no entry words. Its own words still narrow it: an entry sentence that names a permit, a vehicle or posted ground keeps it out, and the exclusion list and both date filters apply as to any order.

A sentence ends at a period followed by a space or the end of the text, and not after a dotted abbreviation (`C.F.R.`, `A.M.`) or after `Mt.`, `Rd.` or `No.`.

An order is live when `rescinddate` is null, `startdate` is null or past, and `enddate` is null or ahead, all against now. `ORDER_WHERE` sends the start clause, and `is_area_closure` reads the start date again so the rule is in one function and a test can reach it. Now is the right instant, not the analyzed window, because the Closure column reads today's orders for every window (#588). Region 6 is unchanged: its `ClosureStatus='Active'` is trusted as sent ([0067](0067-region-6-closure-orders.md)).

## Evidence

Measured 2026-10-01 over one attribute read of each feed (`ORDER_WHERE` of 0068, `outFields=*`, `returnGeometry=false`), with the rule applied offline:

| | Region 3 | Region 4 |
|---|---|---|
| Live orders, 0068's clause | 94 | 214 |
| Live orders with the start clause | 90 | 190 |
| Passing under 0068 | 31 | 5 |
| Passing now | 30 | 2 |

Four verdicts changed, and each order's text was read:

- Region 3, 03-03-07-26-17, "Kiowa / Rita Blanca NG Stage I Fire Restrictions": type "Fire Restriction - Stage 1", cites 261.53(e). It restricts fire on 230,285 acres and closes nothing. Vetoed by its type.
- Region 4, 04-12-328, "Abandoned Mine Area Closure": its signed order (2003, read from the Forest Service's PDF as archived 2025-02-04, since the live link answered 404) closes "any mine shaft, adit, stope, pit or other opening which has been gated and/or posted as dangerous" on the Payette. Its text is the 261.53(e) boilerplate that Region 3's Santa Fe Watershed closure (10-198) also uses for ground that is genuinely closed, so no text rule can tell them apart. Excluded by number.
- Region 4, 04-12-302, "Goose Creek Winter Restrictions": type "Motor Vehicle Use Prohibition", cites 261.53 (e) for a snowcat route, and starts 2026-11-01. Vetoed by its type, and not live until then.
- Region 4, 04-19-60, "Snowbasin Area Restrictions": "Going into or being upon the closed area, when posted or marked as closed." Its acreage is 0. Vetoed by its text.

Two of the review's six are not in this read. Region 3's Fossil Creek motor vehicle order (03-04-06-26-02, "Going into or being upon the Described Area with a motorized vehicle") ended 2026-10-01 and has left the feed; its 2026-09-30 wording is pinned in the tests and fails on its type and on its text. The San Francisco Peaks alpine tundra order (03-04-08-24-04, "1) Going into or being upon an area.") still passes, unchanged: its exemptions include "Persons hiking on designated trails", so it closes the tundra off trail. That is a real closure of ground, and whether a summit on a trail through it should be flagged is a question about exemptions, which no veto here reads.

No order that passed under 0068 and keeps people out lost its pass. The splitter changed no live verdict.

The review of #596 found three Region 4 orders that keep people out and passed neither signal, and the maintainer decided to pass them by their type. Measured over the same 2026-10-01 read:

| | Region 3 | Region 4 |
|---|---|---|
| Passing after #596 | 30 | 2 |
| Passing with the Stage 3 type | 30 | 5 |

Three verdicts changed, all to "closure", and nothing else. Each is a "Fire Closure - Stage 3" on the Boise National Forest whose `cfr` is "See closure order" and whose description states a purpose rather than a prohibition:

- 0402-01-119, Claremont Fire Area, Road, and Trail Closure, 617 acres, 2026-07-08 to 2026-12-31: "Road and Trail closure. The purpose of this Order is to protect public safety from hazards related to the Claremont Fire."
- 0402-03-140, Crooked Fire Area, Road, and Trail Closure, two features of 10,450 and 1,069 acres, 2026-09-19 to 2026-12-31: "The purpose of this Order is to protect public safety from hazards related to the Crooked Fire."

No other live order in either region carries a Stage 3 type.

## Alternatives rejected

- An acreage ceiling: it catches forest-wide polygons but misses the fire restriction, the vehicle orders and Snowbasin's 0 acres.
- An exclusion list alone: each new false positive needs a code change, where the vetoes read the order's own words the way the permit exception does.
- Keying the exclusion on `objectid`: object IDs are assigned on insert, and Region 3's are not in signing order (its 1996 Santa Fe Watershed order is 75,320, above a 2024 order's 75,247), so that layer has been reloaded before and its IDs can change. The order number is printed on the signed order. It is not unique to one feature, since a forest files each part of an order under the same number, which suits an exclusion: every part goes with it.
- Counting an order that starts inside the analyzed window: the Closure column reads today's orders for every window (#588), so the window cannot decide a closure's dates either.

## Consequences

`test_usfs_closures.py` pins each veto with a real order's wording, the exclusion, the Santa Fe Watershed order that shares the excluded order's words and still passes, a Stage 3 type that still passes, three periods that do not end a sentence and one that does, and an order that starts a year from now. A veto can be wrong both ways, like the text test it narrows, which is why DATA.md still tells the reader to read the order. A new forest-wide order with closure boilerplate needs a new exclusion entry.
