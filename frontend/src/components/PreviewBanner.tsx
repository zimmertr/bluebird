type Props = {
  pr: string | null
  commit: string | null
}

export default function PreviewBanner({ pr, commit }: Props) {
  const shortCommit = commit ? commit.slice(0, 7) : 'unknown'
  return (
    <div className="flex-shrink-0 bg-red-600 text-white text-center text-xs sm:text-sm font-semibold py-1.5 px-4 z-30 shadow-md">
      You are viewing a preview release of Bluebird — PR: {pr ?? '—'} | Commit: {shortCommit}
    </div>
  )
}
