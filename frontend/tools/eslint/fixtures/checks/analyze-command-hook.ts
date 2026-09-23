// Must trip: the results area opened after the analysis await, and never
// before it, and the input bag spread into the planner.
export async function run(willRank: boolean, inputs: object) {
  await analyze({})
  if (willRank) setShowResults(true)
  return planAnalysis({ ...inputs })
}
