// Must trip: the results area opened after the analysis await, and no arriving count.
export async function run(willRank: boolean) {
  await analyze({})
  if (willRank) setShowResults(true)
}
