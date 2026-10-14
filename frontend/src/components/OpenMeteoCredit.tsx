import { LINK, TEXT } from '../styles'

const OPEN_METEO_HREF = 'https://open-meteo.com/'

interface Props {
  /** Where the line stands in its container: the one thing the two feet differ by. */
  className: string
}

/**
 * The Open-Meteo credit, as one footnote line. CC BY 4.0 asks for it beside
 * the data, so it is drawn wherever Open-Meteo's numbers are: the results
 * table's last foot line, and the chart's foot while the table is not drawn
 * (#687). One component so the two cannot come to differ in words, target or
 * size; the call site supplies only placement.
 *
 * Open-Meteo's licence page gives "Weather data by Open-Meteo.com" as an
 * example rather than required wording, so the bare host stands.
 *
 * The link is sized by its line rather than by a class of its own: a credit
 * is attribution, the micro step's own job, not a control a reader looks for.
 */
export default function OpenMeteoCredit({ className }: Props) {
  return (
    <div className={`${className} ${TEXT.micro}`}>
      <a href={OPEN_METEO_HREF} target="_blank" rel="noopener noreferrer" className={LINK}>
        Open-Meteo.com
      </a>
    </div>
  )
}
