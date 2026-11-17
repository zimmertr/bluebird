# 0305. The controls stand as a card over a desk's map, with one section open at a time

- Status: Proposed. One of two rival layouts for #825; the other puts the controls behind an icon rail at every width. Supersedes the desk half of [0202](0202-panel-and-panes-move-at-one-speed.md) (the controls no longer push the map's edge) and the layers [0216](0216-desk-moves-paint-less.md) gave the panel's move
- Date: 2026-11-16
- Decider: the maintainer (TJ), who kept this layout from #825's first lab on 2026-11-16 ("Keep the search and controls card. Legend and Layers go to the left under it. Results span the width as today, not floating. The phone stays as it is."), picked the card whose sections open and collapse under today's names from the third lab's mockups the same day, approved the summary lines, and chose that every section collapses when an analysis completes
- Issues and PRs: #825
- Cited in code as: #825; record 0305
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Rules for every change, "A control sits beside its label"; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `AppDrawer.tsx`, `ControlPanel.tsx`, `PanelSection.tsx` and `MapRows.tsx`; [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), `useCardSections.ts` and `useLayoutMotion.ts`; [`docs/USAGE.md`](../USAGE.md), At a desk

## Context

At a desk the controls were a 360px column docked beside the map. #825 measured what that costs: the panel takes 25.9% of a 1389x868 window and 35.2% of 1024x768, and after a run the map is left with 32.6% and 40.6% (production at 23e94d2c, 2026-11-16). The results table sat in the remaining 1029px of a 1389px window.

The maintainer's verdict on the first lab kept two layouts in the running. This is the first: the controls as a card floating over the map, at a desk only.

## Decision

- **A card over the map's top left.** At a desk the controls are a card one inset in from the map's top and left, in the map's own stack of rows (`MapRows`), over a map that keeps the window's width. The results dock under the map across the whole window, with nothing to their left. A phone keeps the Controls sheet (record [0141](0141-phone-controls-sheet.md)).
- **361px wide.** The docked panel was 360px with one edge, on its right, so its content was 359px. The card draws an edge on every side, so it is 361px and its content is the same 359px: every control keeps the width `styles.test.ts` measured it at.
- **The search field is in the card**, under the header, where it was the first of the map's rows. Shut, the card is that field alone, the pill it always was, with the chip row under it and the `Open controls` chip at its front. It is one field through an open and a close, never a second one mounted in its place.
- **One section open at a time.** Destinations, Forecast and Metrics each have a heading that opens the section and collapses it again, and opening one collapses the one that was open. A collapsed section shows one line saying what it is set to, and its controls stay mounted, hidden, so a field keeps what was typed in it.
- **Destinations is open on arrival**, where every analysis starts.
- **A committed report collapses every section** (the maintainer, 2026-11-16), so the card is at its shortest over the map the reader now wants. A refusal or a failed run leaves the open section open.
- **The summary lines** are the maintainer's approved words:
  - Destinations: `None yet`; a ring as its point count and the kinds it looks for, `6 points · Peaks`; a picked list as its own name; every other point destination, pasted or picked on the map, in one count, `12 destinations`. Parts join with the middle dot.
  - Forecast: the line a phone's Controls chip already shows, `Current · NOAA GFS`.
  - Metrics: the metric that ranks, the direction and the rows shown, `AQI · Lowest · 200`.
- **Legend and Layers stand under an open card wherever the legend has room there, and beside it where it has not** (the maintainer, 2026-11-17, on the first build, which stood them beside the card always: "wouldn't it make sense to have the legend below to free up this section of the map?"). Under the card the legend's card shares the card's column, and the map to its right stays clear. The row is under the card while the legend's card then has 120px of the map under its chip (`LEGEND_UNDER_CARD_MIN_PX`, `cardChips`), and beside the card otherwise. The Layers menu is taller than the map left under the card, so there it opens over the results, as it does on any short map, and stops one inset over the window's foot, scrolling past that.
- **The card is never taller than the map** less one inset over and under it; past that its body scrolls, with the header, the search field and Analyze fixed.
- **A framing move leaves the card's width clear.** A list fitted to the map, a searched place and a restored ring are framed into the map less the open card's reach on the left (`framePadding`), so none of them lands under the card.
- **Opening or closing the controls moves no edge.** The map is not resized and the table and the chart are not laid out again, so the holds that kept them to one width while the panel slid are gone (`LAYOUT_HOLD.mapPush`, `table`, `chartClosing`, `chartOpening`, `layer`, and `MOTION.push`). `useLayoutMotion` reports the results panes alone.
- **The tutorial opens what it lights.** A step whose target stands in the card opens the card, and a step that lights a section shows that section open for the length of the step.

## Evidence

The card's heights, measured in the PR's preview at 1400x857 in Chrome on macOS on 2026-11-17 (commit 21fe9ecd), where the map is 825px tall before a run:

| The card | Height |
|---|---|
| Every section collapsed | 335px |
| Forecast open | 407px |
| Destinations open | 535px |
| Metrics open | 723px |

A section's heading is a 40px row with one rule between sections (`CARD_SECTION`), so three collapsed sections are 122px. The first build kept the panel's own spacing, 16px over and under each rule, and the same collapsed card was 383px. The docked results leave the map about 380px at 1389x868 (#825's measurement, 32.6% of the window), so 335px and its two insets, 359px, is what lets a collapsed card stand whole over that map.

Where the chips stand, on the numbers. The maintainer's window on 2026-11-17 had a 594px map after a run and the collapsed card ended 347px down it: the chip row under the card ends at 391px, and the legend's card has 167px before the 32px it keeps over the map's foot. The legend with every layer on was 239px, so it scrolls its last 72px there, and with the layers a first visit shows it stands whole. At 1389x868 with the table and the chart both open the map is about 380px, less than the 391px the rows alone would take, so the chips stand beside the card. Before a run on an 825px map they are under the card with Destinations open (535px) and beside it with Metrics open (723px).

The cost is that the row changes sides when a section opens tall enough to take the room, or the results take the map's foot. Keeping it under the card always was declined for the short map, where the chips themselves would stand off the map; keeping it beside always was the first build, and the legend then covered a second column of the map at its top, where the destinations are.

Three things followed from the move and are in the same PR:

- **A desk's results bar holds one line.** The bar is the window's width, 1000px of content at 1024 wide where it had 640 beside the docked panel, so a three-digit Removed count no longer wraps its button group (`BAR_LABEL`).
- **A shut card's hidden parts are inert as well as hidden.** The browser moves the keyboard off a hidden element only at its next frame, so the focus hand-off (`useFocusHandoff`) saw the pressed Close button still holding it and left the keyboard on nothing. `inert` is what that hook already reads.
- **A dragged popup stops at a surface a hair inside its breath.** With the legend beside the controls card, as it stands on a short map, a row's popup opens exactly 8px from the legend, and the browser suite's card measured 7.5px from it: MapLibre rounds a popup's place to a whole pixel, and a projected point carries noise in its last digits. The drag's bounds read that as a surface the card could not clear, left it alone, and the card widened over the legend. `clearSize` now gives a pixel of tolerance (`PLACE_SLOP_PX`) and holds the card at its least width there.

## Alternatives rejected

- Today's panel moved into the card whole, scrolling inside it: no new words, but the card is as tall as the map at every moment, so it covers the map's left third for good.
- The lab's own headings, Where, When and Rank: three renamed sections for no gain over the names every doc and the tutorial already use.
- Closing the card when a report commits, as a phone's sheet closes: the ranking, the row cap and the bounds are live after a run, and they are one press away in a collapsed card and two in a shut one.
- An icon beside each section's name, as the mockup drew: the name and the fold already say what the row is and that it opens.
