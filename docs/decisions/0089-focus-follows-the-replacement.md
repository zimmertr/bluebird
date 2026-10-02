# 0089. The keyboard goes where the pressed control went: into a popover, back to its trigger, and to whatever replaces a control that leaves

- Status: Accepted
- Date: 2026-10-01
- Decider: the maintainer (TJ), on issue #576 (option A, through the coordinating session)
- Issues and PRs: #576, #385
- Cited in code as: #576
- Guide: [`frontend/src/hooks/CLAUDE.md`](../../frontend/src/hooks/CLAUDE.md), the `useFocusHandoff.ts` bullet; [`frontend/src/CLAUDE.md`](../../frontend/src/CLAUDE.md), the `usePopover.ts` bullet

## Context

The Round 5 readiness review walked the production build (v0.91.0) from the keyboard. Every popover is portalled to the end of the body and none took the focus, so the Columns rows came after every link in the results table: 89 Tab stops at three rows. And a pressed control that unmounted, turned disabled or landed inside the closed drawer took the focus with it, so the next Tab started again at the top of the page: after Draw polygon, Analyze, Close controls, Open controls, and Escape in Layers. `ModelPicker` alone carried a focus recipe, because it was the only popover written as a listbox.

## Decision

- `usePopover` carries the keyboard for every panel: the first control takes the focus once the panel is drawn (or the element `initialFocusRef` names), Tab past either edge closes the panel and hands the focus to the trigger, and Escape does the same. `ModelPicker`'s copy of the recipe moved into the hook.
- One rule everywhere else: the control that replaces the pressed one takes the focus, and only when the focus was really lost. `useFocusHandoff.ts` judges "lost" against the element that last had the focus (one `focusin` listener): lost means that element can no longer hold it (gone, disabled or inert) and nothing usable holds it instead.
- The closed drawer is `inert`.

## Evidence

The review's own counts on v0.91.0 (89 Tab stops at three rows; about 45 off-screen stops in the closed drawer). Each route has a Vitest test that failed before the change and passes after it, run in Docker on 2026-10-01.

## Alternatives rejected

- Move the focus to a fixed target after each action (the issue's plan for Analyze named Cancel only). Each action would need its own target and its own way back, and the ones nobody listed would keep dropping the focus.
- Take the focus whenever it sits on `<body>`. A reader who clicked the map, or a page nobody has touched, also has the focus on `<body>`; stealing it there (a share link's run closing the phone's drawer, for instance) is worse than the bug.
- A headless popover library (#576 option B). A new dependency for behavior the hook already half had.

## Consequences

A popover opened with the mouse also moves the focus into itself, which is what a menu does. A control added later that replaces another must wear `takeOrphanedFocus` or `useTakeOrphanedFocus` itself; nothing finds the one that does not.
