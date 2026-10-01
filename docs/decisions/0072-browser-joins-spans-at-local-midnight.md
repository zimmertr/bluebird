# 0072. The browser joins a spanning window's two fetches at the reader's local midnight, not at the UTC boundary

- Status: Accepted. Supersedes 0027 in part: where the browser splits a spanning window.
- Date: 2026-10-01
- Decider: the maintainer (TJ), on issue #579 (Option A, browser only)
- Issues and PRs: #579, #589
- Cited in code as: #579
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, the paragraph "Key constraints shared between frontend and backend", the sentence "On screen the seam is named rather than hidden"; mirror row 11

## Context

[0027](0027-archive-endpoint-seam.md) split a spanning window at one instant, `archiveBoundaryMs`, a UTC midnight, on both sides. The line under Analyze names whole local days: `Archive data to {date}, {model} from {date}.` West of Greenwich the UTC midnight is the afternoon of the day before (17:00 in Seattle in summer), so the day the line named as the model's first was mostly the archive's hours. East of it, the day the line named as the archive's last ended with one or two forecast hours. The guide said `ARCHIVE_STRADDLE_DAYS` made the day the instant lands in wholly the forecast endpoint's. That was false: the tolerance decides how a window is CLASSIFIED, not where a spanning one is split (Round 5 readiness review, P35-1, F07-1, E06-8, 2026-10-01).

## Decision

The browser splits at `archiveSeamMs` in `utils/forecastWindow.ts`: the first whole UTC hour at or after the local midnight that starts the reader's local day containing the boundary instant, and never more than `ARCHIVE_STRADDLE_DAYS` before the boundary. `fetchSpans` asks the archive through the hour before that seam and the forecast endpoint from it on, and `archiveSeamPhrase` names the two days on either side of it. Both days are therefore whole, in every zone.

The boundary itself does not move. `archiveBoundaryMs`/`archive_boundary` and `windowSource`/`window_source` stay the one UTC instant and the one classifier, mirrored and pinned as before (mirror row 11). The backend's `_fetch_spans` still splits at the boundary, because the pod has no reader's zone.

## Evidence

At the boundary 2026-05-27T00:00Z, measured in `forecastWindow.test.ts` and `openMeteo.test.ts` on 2026-10-01: Los Angeles joins at 2026-05-26T07:00Z, Berlin at 22:00Z the day before, UTC at the boundary, and Kolkata, on a half-hour offset, at the first whole hour after its midnight. The forecast endpoint already serves those hours: a window starting within `ARCHIVE_STRADDLE_DAYS` of the boundary is its alone, so every hour the seam moves onto it is one it serves today for a forecast window.

## Alternatives rejected

- Move the seam to local midnight in both mirrors. The pod has no reader's zone, so its seam would need one on the request.
- Keep the UTC split and state the partial day in the line. It makes the line longer and still names a day that two sources share.
- Keep the UTC split and change only the two dates the line names. The dates would still describe a day neither source holds whole.

## Consequences

A browser analysis and a direct API call over the same spanning window can join at different hours, up to a day apart: the browser at the reader's midnight, the pod at UTC midnight. The per-location cache key is unchanged: it carries the window, the model and the source, and the seam is fixed for one reader's zone. Each span is still priced on its own hours. `forecastWindow.test.ts` pins the seam on both sides of UTC, `openMeteo.test.ts` pins the requests in Los Angeles and Berlin, and `calendarPhrases.test.ts` pins the line in both.
