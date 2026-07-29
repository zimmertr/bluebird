/**
 * How to reach a human about Bluebird, in one place.
 *
 * The address is a Cloudflare Email Routing alias on the site's own domain
 * rather than a personal mailbox. It can be re-pointed without editing a page
 * people have already bookmarked, it keeps a personal address off a public
 * page, and it survives the rename tracked in #143.
 *
 * Both channels are published on purpose. GitHub is the right place for
 * anything reproducible, but requiring an account to report a wrong summit
 * elevation would lose most of the reports worth having.
 *
 * Preview environments only ever run off this repo's PRs, so the slug is safe
 * to hardcode here rather than plumb through the runtime /api/config payload.
 */
export const SUPPORT_EMAIL = 'hello@bluebirdforecast.com'

export const REPO_URL = 'https://github.com/zimmertr/bluebird'
export const ISSUES_URL = `${REPO_URL}/issues`
export const SECURITY_URL = `${REPO_URL}/security/advisories/new`
