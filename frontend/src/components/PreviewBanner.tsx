import { REPO_URL } from '../utils/contact'
import { BANNER_PREVIEW } from '../styles'

type Props = {
  pr: string | null
  commit: string | null
}

export default function PreviewBanner({ pr, commit }: Props) {
  const shortCommit = commit ? commit.slice(0, 7) : 'unknown'
  const text = `You are viewing a preview release of Bluebird | PR: ${pr ?? 'unknown'} | Commit: ${shortCommit}`

  // Only link when we actually have a PR number to point at.
  if (!pr) {
    return <div className={BANNER_PREVIEW}>{text}</div>
  }

  return (
    <a
      href={`${REPO_URL}/pull/${pr}`}
      target="_blank"
      rel="noopener noreferrer"
      className={`${BANNER_PREVIEW} block hover:underline`}
    >
      {text}
    </a>
  )
}
