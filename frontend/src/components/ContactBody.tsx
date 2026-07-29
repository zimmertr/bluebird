import { LINK, PROSE } from '../styles'
import { ISSUES_URL, SECURITY_URL, SUPPORT_EMAIL } from '../utils/contact'

// Carried by both document pages, because each is a page someone lands on
// alone. A privacy question and a licensing question arrive at the same
// address, and neither reader should have to guess that the other page is
// where the contact details live.
//
// The address is interpolated from utils/contact rather than written out, so
// re-pointing the alias is one edit rather than a search across the pages that
// publish it.
export default function ContactBody() {
  return (
    <div className={`${PROSE.body} space-y-3`}>
      <p>
        Email{' '}
        <a href={`mailto:${SUPPORT_EMAIL}`} className={LINK}>
          {SUPPORT_EMAIL}
        </a>{' '}
        about anything: a summit at the wrong elevation, a destination that should be
        listed and isn't, a privacy question, a licensing question, or a page that will
        not load. No account needed.
      </p>
      <p>
        Bugs and feature requests are tracked on{' '}
        <a href={ISSUES_URL} target="_blank" rel="noreferrer" className={LINK}>
          GitHub
        </a>
        , which is the better channel if you can describe how to reproduce something.
      </p>
      <p>
        Security vulnerabilities should go through{' '}
        <a href={SECURITY_URL} target="_blank" rel="noreferrer" className={LINK}>
          GitHub's private advisory form
        </a>{' '}
        rather than a public issue.
      </p>
    </div>
  )
}
