type Props = {
  pr: string | null
  commit: string | null
}

// Preview environments only ever run off this repo's PRs, so the slug is safe
// to hardcode rather than plumb through the runtime /api/config payload.
const REPO_URL = 'https://github.com/zimmertr/bluebird'

const BANNER_CLASS =
  'flex-shrink-0 bg-red-600 text-white text-center text-xs sm:text-sm font-semibold py-1.5 px-4 z-30 shadow-md'

export default function PreviewBanner({ pr, commit }: Props) {
  const shortCommit = commit ? commit.slice(0, 7) : 'unknown'
  const text = `You are viewing a preview release of Bluebird — PR: ${pr ?? '—'} | Commit: ${shortCommit}`

  // Only link when we actually have a PR number to point at.
  if (!pr) {
    return <div className={BANNER_CLASS}>{text}</div>
  }

  return (
    <a
      href={`${REPO_URL}/pull/${pr}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`${BANNER_CLASS} block hover:underline`}
    >
      {text}
    </a>
  )
}
