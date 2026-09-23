import { describe, expectTypeOf, it } from 'vitest'
import type { AnalyzedSnapshot } from '../utils/present'
import type { AnalyzeOptions, AnalyzedView, Progress, Refusal } from './analyzeTypes'
import type * as hook from './useAnalyze'

// Type-level assertions: `expectTypeOf` does nothing at run time, and the
// frontend typecheck is what fails them.
describe('the analysis types', () => {
  // The recorded snapshot composes the one `present.ts` compares against, so
  // the two cannot drift apart.
  it('builds the analyzed view on the presentation snapshot', () => {
    expectTypeOf<AnalyzedView>().toExtend<AnalyzedSnapshot>()
  })

  // The panel imports `Refusal` by the hook's name, so the re-export has to be
  // the same type rather than a copy of it.
  it('are the types the hook exports', () => {
    expectTypeOf<hook.Refusal>().toEqualTypeOf<Refusal>()
    expectTypeOf<hook.Progress>().toEqualTypeOf<Progress>()
    expectTypeOf<hook.AnalyzedView>().toEqualTypeOf<AnalyzedView>()
    expectTypeOf<hook.AnalyzeOptions>().toEqualTypeOf<AnalyzeOptions>()
  })
})
