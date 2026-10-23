# 0223. A finger's controls draw 32px and press what they draw, and the chips and the results bar press 44

- Status: Accepted. Amends 0129 (a day row and the window field are 32px under touch), 0130 (a metric label is 32px under touch), 0132 (the draw bar is 46px tall), 0133 (the results bar's buttons are 44 wide and 32 tall, pressing 44), 0135 (sheet rows are 32px) and 0136 (sheet rows are 32px).
- Date: 2026-10-22
- Decider: the maintainer (TJ), on PR #796, item A of the UI audit. He had found the phone chunky. After seeing the two options drawn on the preview, he chose "Tighten stacks to 32" over keeping stacks 44 apart, and "44 wide, 32 tall" for the results bar over 32 by 32.
- Issues and PRs: #796
- Cited in code as: none; source comments cite the record by number
- Guide: [`docs/STYLES.md`](../STYLES.md), tap targets; `TAP` in `frontend/src/styles.ts`

## Context

`TAP` made every control a finger presses at least 44px tall, WCAG 2.2's enhanced target (SC 2.5.5, AAA) and Apple's 44pt. On a phone that drew the results bar as seven 44px squares, every metric box 44px tall, and every list row, calendar week and checkbox row 44px apart. The maintainer said the phone read chunky.

## Decision

- Under a coarse pointer, `TAP.action`, `TAP.row` and `TAP.height` are 32px tall. A control draws 32 and presses what it draws, rows in a stack included: the calendar's days and window field, the Metrics rows, the checkbox rows, the bottom sheets' rows and the dismiss ×.
- A control with no box of its own, a glyph or a word, keeps 44px of width (`TAP.action`'s `min-w-11`). A round or square button stays as wide as it is tall: the header's round buttons (`HEADER_BUTTON`) and the player's play button (`TRANSPORT_PLAY`) are 32 by 32.
- The chips and the results bar's buttons draw 32 and press 44. Each takes a pseudo-element 6px above and below (`CHIP_HIT`, `BAR_PRESS`), because nothing above or below them is a target. The bar's groups (`BAR_GROUP`) no longer clip, so the press is not cut, and the end buttons round their own outer corners at 3px.
- Presses that draw nothing keep 44: the map's round buttons and credit (i), the search pill's field, the popup's ×, the tutorial's × and the search's clear, the message badge and the phone chart's title select.

## Evidence

Measured 2026-10-22 on the PR #796 preview at 390 by 844, dark theme, with CSS injected into the real build for each option (`phone-heights` mockup artifact):

| Screen | 44 everywhere | Option 1: stacks 44 apart | Option 2: tighten to 32 |
|---|---|---|---|
| Controls sheet content | 1,199px | 1,127px | 1,019px |
| Calendar sheet | 476px | 440px | 368px |
| Columns sheet content | 684px | 684px | 517px |
| Results bar | 46px | 34px | 34px |

32px is past the AA minimum of 24 (SC 2.5.8) and under the enhanced 44. A day cell at 32px is about 8.5mm on a 390px phone, a little under the ~9mm that touch studies find a finger needs.

Measured after the change on the same preview, 2026-10-22, at 360, 390, 402 and 430 wide on a coarse pointer:

- The results sheet's header, which is its collapsed height, is 71px (`SHEET_HEADER_PX`; 84 before, with a rule of its own that record 0220 moved to the grip).
- The player with two axes is 68px (`TRANSPORT_HEIGHT_PX`; 80 before), and 50.5px with one. The band reserved for it is 12px smaller, so a phone's resting sheet stands 12px taller, a phone offers Both from 540px of viewport rather than 553, and a desk opens on Both from 779px rather than 791.
- The draw bar is 46px (58 before), so the compass under it moves up 12px (`MAP_EDGE.belowDrawBar`).
- The results bar's presses reach 6px over and under each button and stay inside the bar: 1px over the title's line box and clear of the collapse chevron above it.

## Alternatives rejected

- **Keep stacks 44 apart, with lone controls drawn 32 and pressing 44** (option 1, recommended in the mockup): it left list sheets as they were and kept the Metrics rows 50px apart. The maintainer found option 2 the better-looking of the two and accepted its smaller targets.
- **32 by 32 results bar buttons** (option 2 for the bar): the buttons in a group touch, so the press could grow 44 tall but not 44 wide.
- **44px everywhere**: the chunky phone this record exists to fix.

## Consequences

`styles.test.ts` holds the 32px roles, the 44px press around the chips and the bar, the round buttons' square sizes, the calendar's cells and field, and the draw bar's sum. `resultsSheet.test.ts` holds the sheet's heights against the 72px header. `deskMenus.spec.ts` and `messages.spec.ts` check the built calendar cell and the dismiss target. The cost is reach: a finger aimed at a 32px row has a third less room than at 44, most of all in the calendar.
