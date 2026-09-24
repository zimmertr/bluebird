# 0009. No component names a hue

Verbatim guide text at 971fede, copied before the edit to the template.

## From `CLAUDE.md`, line 63

**No component names a hue.** ESLint fails any color utility in a non-slate hue anywhere under `components/`, `map/` or `App.tsx`, because every hue here carries meaning (the accent says "this acts"; green/amber/red say how an analysis is going) and is therefore the design system's decision rather than a call site's — #167 landed that guardrail after finding three ambers, four notice boxes in three shapes, and a primary button one shade off the blocks it was meant to match. Slate stays compositional: it is the surface system the roles above already cover.
