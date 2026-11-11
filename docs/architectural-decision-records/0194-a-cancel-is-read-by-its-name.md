# 0194. A cancel is any error named `AbortError`, and `isAbort` is the one place that says so

- Status: Accepted
- Date: 2026-10-18
- Decider: the maintainer (TJ), approving the audit's confirmed items on issue #688, 2026-10-18.
- Issues and PRs: #688, #690, #494 (the pin this reverses), #772
- Cited in code as: #688
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `abort.ts` bullet

## Context

The frontend told a cancel from a failure three ways. `apiFetch.ts` read the error's `name`, and its comment said why: a rejected fetch is a `DOMException` in every browser, but the test environments are not bound to that. Five sites asked `e instanceof DOMException && e.name === 'AbortError'`, the form that comment rejects. Five more cast the error and read `(err as Error).name`. In Vitest's jsdom project the `instanceof` form is wrong: jsdom swaps in its own `DOMException` while Node's `AbortController` and `fetch` stay, so a real abort there is no instance of the global class, and a cancel read as a failure.

## Decision

- `isAbort` in `utils/abort.ts` is the one test. It reads the name, so any error named `AbortError` is a cancel. A `TimeoutError` is a failure the reader is told about.
- Every catch that passes a cancel through, or stays quiet about one, asks `isAbort`.
- The `abort-test-one-home` lint fails an `AbortError` test spelled anywhere else, tests and the browser suite included, because a suite that asked `instanceof` would pass for the wrong realm.

## Evidence

Verified 2026-10-17 at f971335: in Vitest's jsdom project, a real `AbortController` abort rejects with an error that is not `instanceof DOMException`. `abort.test.tsx` holds that fact, so a Vitest upgrade that merges the realms fails it and retires the note.

## Alternatives rejected

- **Keep the `instanceof` form.** It reads a real cancel as a failure in the jsdom project, where every component test runs.
- **The pin `analysisFailure.test.ts` carried since #494's split**: "treats an abort-shaped plain error as an error, not a cancel." It recorded the `instanceof` form's behaviour and gave no reason for it. The test now pins the opposite: a plain error named `AbortError` is a cancel.

## Consequences

A plain `Error` named `AbortError` now reads as a cancel: the analysis stops without an error line.
