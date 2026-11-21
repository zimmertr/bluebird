# 0323. After a forecast the day strip draws each day's sky and plays the window

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it.
- Date: 2026-11-21
- Decider: the maintainer, 2026-11-17, keeping the prototype's day strip with plain days before a run; built while the maintainer was away, 2026-11-21
- Issues and PRs: #825
- Cited in code as: record 0323
- Guide: `frontend/src/components/CLAUDE.md` (`DayStrip.tsx`, `MapStage.tsx`), `frontend/src/utils/score/CLAUDE.md` (`daySky.ts`)

## Context

The day strip (record 0311) picks the window, and once a report spans hours it hosts the forecast player under its days: a play button, a slider and a readout, a second control for time beside the days that are already a row of time. The prototype makes the days themselves the player after a forecast: each day shows its sky, the analysed days widen to about half the strip so an hour is a few pixels wide, a drag across them moves a playhead with its hour on a tag, and a meta row under the days holds play, the hour and the model.

## Decision

- **Each day's sky.** `daySky` lays each local day out as eight blocks of three hours, each the score the best tenth of the field reaches at the block's first hour, drawn in the score's ramp (`scoreColor` over the field's range). A day the window does not reach draws an empty sky on the recessed ground: the app forecasts the window and nothing past it.
- **The window widened.** The window's days take about half the strip (the prototype's share, `0.22 + 0.17` per day up to 0.6), through `flex-grow`.
- **The playhead.** The hour drawn is a line through its day's sky with the hour on a tag over the row (`hourShort`). A press or a drag on a window's day scrubs the hours and stops playback; outside the window a press still picks days, and Shift still extends them.
- **The meta row** replaces the player's bar: play (`Play the timeline`, `Pause the timeline`), the hour as the player reads it, the player's own slider for the keyboard (`Score time`, its focus ring on the hour it shows), and the model, which opens the When card. No new words.
- **When.** Only at a desk, while a lens ranks the field, the forecast axis plays, and the strip still shows the window the report was fetched for. Otherwise the player's bar stands under the days as before, and before a run the days stay plain (the maintainer, 2026-11-17).

## Evidence

- `daySky.test.ts` pins the blocks, the keys and the best tenth. `DayStrip.test.tsx` pins the painted sky, the widened day, the playhead's tag, the meta row's three controls and a press in the window scrubbing.

## Open

- The prototype paints every day's sky from an outlook it forecasts for the whole horizon. This paints only the window's days, since the app fetches the window alone.
- Without a lens, the strip keeps the player's bar.
