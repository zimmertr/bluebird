// Determine whether the encoded state requires a URL sync.
// Compares the full resulting URL after replaceState would be called,
// avoiding redundant writes when the URL has not changed.
export function urlNeedsSync(
  encodedQueryString: string,
  currentPathname: string,
  currentSearch: string,
): boolean {
  // Construct the full URL that would result from the replaceState call.
  // replaceState(null, '', urlArg) with urlArg="?foo=bar" results in
  // currentPathname + "?foo=bar", and with urlArg=pathname results in just
  // the pathname (query string cleared).
  const newUrl = encodedQueryString
    ? `${currentPathname}?${encodedQueryString}`
    : currentPathname
  const currentUrl = currentPathname + currentSearch
  return newUrl !== currentUrl
}
