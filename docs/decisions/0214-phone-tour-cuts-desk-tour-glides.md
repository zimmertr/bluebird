# 0214. On a phone the tutorial cuts from card to card; at a desk its light glides

- Status: Accepted. Amends [0066](0066-tutorial-points-and-never-acts.md): steps no longer all "move in about 200 ms".
- Date: 2026-10-22
- Decider: the maintainer (TJ), on the review of PR #789. The report, 2026-10-21: "the tutorial plays really slowly and choppy on mobile. It's not smooth like on desktop." The diagnosis, 2026-10-22: "On desktop you actually see the UI moving around, but on mobile you can't really see the whole UI and the user themself is not actively scrolling. So these animations look like glitches." TJ picked "cut everything" over a fade through the dim, cutting only the scroll, and keeping the motion. The glide, the chunk warm-up and the settled chart module are Claude's, measured below.
- Issues and PRs: #786, #789, #536, #696
- Cited in code as: #786
- Guide: [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the `src/tour/` bullet; [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), `ResultsPanels.tsx`; [`docs/STYLES.md`](../STYLES.md), `MOTION`

## Context

The light and the card moved between steps on a transition class, `TOUR.motion`, worn for 250 ms after a step change. A frame loop re-measures the target while it moves and hands the light a new end on every frame. A transition handed a new end restarts from where it stands, with its ease starting slow, so it barely moves. On a phone most steps open or shut a sheet, so the target rides a 300 ms slide. The light crawled behind it and then jumped the rest of the way when the class came off. The class also went on one render after the step changed, so a step's first move snapped.

A phone also moves things the reader cannot place. The panel is a sheet over the map. The tour scrolled the sheet's content by itself and slid sheets up and down, and the reader saw only the part of the app the sheet showed.

Two waits stood on top. The Chart card's anchor lives in the chart's lazy chunk, so its light had nothing to stand on until the chunk arrived. Even with the chunk loaded, React suspends on the promise `import()` returns and holds a boundary's reveal 300 ms behind the empty fallback it showed.

## Decision

- **On a phone every step change is a cut.** `Tour` takes `cut`, the app's phone layout (`!isDesktop`). The panel's scroll jumps to the step's control, the light stands on it in the commit that shows the card, and the root's `data-touring="cut"` turns every transition in the app off while the tour runs, so a sheet lands at its stop with no slide. The reader's own moves after the tour slide as before.
- **At a desk the light and the card glide.** `glide` in `tour/place.ts` eases out over 250 ms from what stood on the screen toward what the step measures in this frame. It reads the live end every frame, so a target that moves during the glide is reached where it is. A frame held up by a long task advances the glide by 33 ms at most, so the light still travels after it. A target that has not appeared yet holds the light where it stood. `TOUR.motion` is gone. A reduced-motion setting cuts as a phone does.
- **Starting the tour fetches the two chunks later cards wait on**: the demonstration report and the chart, through `loadTimeSeriesChart`.
- **A chart whose module has loaded renders in the commit that mounts its pane.** `ResultsPanels` hands React's lazy a settled thenable once the module is in, which the lazy reads at once, so no empty fallback and no 300 ms hold.

## Evidence

`frontend/e2e/perf/tourMotion.spec.ts`, headless Chromium in Docker, 390x844 phone and 1280x800 desk, before (2fe240d) and after, 2026-10-22. "Snap" is the largest share of the light's path covered in one frame.

| Card | Before | After |
|---|---|---|
| Phone, Results | 98% of 456 px in one frame after a 199 ms frame | a cut 38 ms after the key |
| Phone, Chart | crawled 359 ms, then 45% in one frame | a cut in the key's own frame (was 360 ms of empty pane) |
| Phone, Forecast | 41% in the first frame, settled at 301 ms | a cut in the key's own frame |
| Phone, every card at 4x CPU | settled 215 to 460 ms | settled in the key's own frame; Markers, Results and Chart at 195, 198 and 259 ms, the cost of rendering what they show |
| Desk, Results | 68% in one frame | 28% |
| Desk, Forecast | 50% in one frame | 28% |
| Desk, the other six | 16 to 22% | 15 to 34%, settling at 229 to 354 ms |

The Chart card's anchor appeared 360 ms after the key before the settled module, and 72 ms after. A trace of the desk Results card shows a 170 to 360 ms main-thread task while the demonstration report mounts (mostly the compositor commit in headless software rendering). That cost is the app's own and is unchanged here.

## Alternatives rejected

- **Fade the light out and back in through the full dim**: about 300 ms per card for a move the reader still cannot place.
- **Cut only the panel's scroll**: the sheets would still slide under a light that cannot show where they went.
- **Keep the motion with the glide alone**: the glide ends the crawl and the snap, but the reader still watches the app scroll and slide by itself.
- **A spring that chases the target**: it smooths a target that jumps mid-glide, at the cost of a second tuning constant. The ease to a live end needs none.

## Consequences

Nothing in the app transitions while a phone tour runs, including hover colours on the tour's own card, which a finger does not see. A new tour step that relies on a CSS transition on a phone will not get one. The glide runs on the frame loop that already measured the target, so it adds no listener, and the loop now runs until the glide ends as well as until the target stands still.
