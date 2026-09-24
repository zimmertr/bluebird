# 0021. The browser path is the only path for the app

Verbatim guide text at 971fede, copied before the edit to the template.

## From `CLAUDE.md`, line 134

- **The browser path is the only path** (#240). The SSE fallback that rerouted an analysis through the pod's shared Open-Meteo quota is gone: `universe` is `null` only before the first committed analysis, every knob is live over every committed report, and an unreachable Open-Meteo fails the analysis with its existing message instead of spending the shared budget.
