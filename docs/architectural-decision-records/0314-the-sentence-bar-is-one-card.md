# 0314. The sentence bar is one card that reads as a sentence

- Status: Proposed, in the from-scratch UI PR; accepted when the maintainer approves it and merges it.
- Date: 2026-11-21
- Decider: the maintainer, 2026-11-21, ordering the build brought to the prototype (https://claude.ai/artifact/3gjaDv8Bh4qns9Zuv1FsGH)
- Issues and PRs: #825
- Cited in code as: record 0314
- Guide: `frontend/src/components/CLAUDE.md` (`SentenceBar.tsx`, `PanelFooter.tsx`), `frontend/src/utils/CLAUDE.md` (`sentenceBar.ts`)

## Context

Record 0309 put a sentence on the map's top row, but drew it as five separate chips: the name, Where, When, Limits and the button. The prototype draws one floating card that reads aloud as a sentence, "Peaks in this view on Sat 21 – Sun 22", with each choice underlined inside it and the one warm button at its end, outlined when it would fetch nothing.

## Decision

The bar is one card (`SENTENCE_BAR.row`): the logo and name behind a rule, then the sentence, then the button, then the theme switch. The sentence's choices are a new trigger shape, `slot` (`MENU_TRIGGER.slot`): words in the strong ink, underlined in the rule, with a chevron and the one trigger's states, so an open phrase lights as an open chip does. What and where are two phrases joined by `in` (`wherePhrases`), both opening the Where card; the window follows `on` before days and nothing before `Current` (`whenWord`). A list, or no kind ticked, is one phrase with no place after it. Limits keeps a phrase at the sentence's end until limits stand with the results.

When a press would fetch nothing new the button reads `Up to date` as an outline in the quiet ink (`BUTTON_FORECAST_QUIET`), so the warm fill always means a forecast will be spent. It still takes a press.

## Evidence

- `SentenceBar.test.tsx` pins the words and their order, a list and Current dropping what they lack, which card each phrase opens, and the outlined button running. `sentenceBar.test.ts` pins `wherePhrases` and `whenWord`. `styles.test.ts` pins the shapes list and the outline's words at 4.5:1 or better on the bar's face in both themes.

## Open

- An open phrase fills with the accent, as every open trigger does (record 0251), where the prototype tints it softly. Tokens and type come to the prototype in a later task.
