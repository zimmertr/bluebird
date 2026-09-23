// Must trip: the results area opened after the analysis await.
export async function run(willRank: boolean) {
  await analyze({})
  if (willRank) setShowResults(true)
}
