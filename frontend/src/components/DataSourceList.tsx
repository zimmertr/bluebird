import { LINK, PROSE } from '../styles'
import { DATA_SOURCES } from '../utils/dataSources'

// The provider list both document pages render.
//
// They ask different questions of the same six entries, so the lead-in
// paragraph stays at each call site: /privacy cares that these are third
// parties your requests reach, /terms cares whose license covers what comes
// back. Only the list is shared, which is what stops a provider added to
// dataSources.ts from showing up on one page and not the other.
//
// The license name is a link to the license's text. That is not decoration:
// this list is the only place in the shipped app where a data license's text
// is reachable, and both CC BY versions here ask for exactly that (see the
// licenseHref doc comment). dataSources.test.ts fails a source that names a
// license without its URI, so there is no plain-text arm.
export default function DataSourceList() {
  return (
    <ul className={`${PROSE.body} space-y-2`}>
      {DATA_SOURCES.map((source) => (
        <li key={source.name}>
          <a href={source.href} target="_blank" rel="noreferrer" className={LINK}>
            {source.name}
          </a>
          {source.license ? (
            <>
              {' ('}
              <a href={source.licenseHref} target="_blank" rel="noreferrer" className={LINK}>
                {source.license}
              </a>
              {')'}
            </>
          ) : (
            ''
          )}
          . {source.provides}
        </li>
      ))}
    </ul>
  )
}
