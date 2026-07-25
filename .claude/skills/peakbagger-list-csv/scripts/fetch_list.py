"""Fetch a peakbagger.com list page via the Wayback Machine and parse its peaks.

peakbagger.com sits behind Cloudflare's "Just a moment..." JS challenge, so curl and
WebFetch both get 403. Wayback serves the same static data; the `id_` modifier returns
the original bytes (gzip-compressed, hence curl --compressed).

Usage: python3 fetch_list.py <lid> [<lid> ...]
Writes peaks<lid>.json ({lid, title, slug, peaks:[{seq, pb_rank, pid, name, elev}]})
into the current directory, ordered exactly as the list page presents them.
"""
import html, json, re, subprocess, sys, time, unicodedata

# <tr><td>RANK.</td><td><a href=peak.aspx?pid=NNNN>NAME</a></td><td align=right>ELEV</td>
# The first align=right cell after the peak link is elevation; prominence follows later.
ROW = re.compile(
    r'<tr>\s*<td>\s*([\d.]+)\s*</td>\s*'
    r'<td><a href=peak\.aspx\?pid=(\d+)>(.*?)</a></td>\s*'
    r'<td align=right>([\d,]+)</td>',
    re.S | re.I,
)


def slugify(title):
    """'Smoot's "Climbing Washington's Mountains" 100 Peaks' -> smoots-climbing-...-100-peaks"""
    t = unicodedata.normalize('NFKD', title).encode('ascii', 'ignore').decode()
    t = t.replace("'", '').replace('.', '')
    return re.sub(r'-+', '-', re.sub(r'[^a-z0-9]+', '-', t.lower())).strip('-')


def fetch(lid):
    """Wayback throttles hard when several crawls run at once — it returns 429s and also
    drops connections outright (curl exit != 0, HTTP 000). Retry each combination with
    growing backoff rather than concluding the snapshot doesn't exist."""
    for attempt in range(4):
        for year in ('2025', '2023', ''):
            for host in ('www.peakbagger.com', 'peakbagger.com'):
                url = f'https://web.archive.org/web/{year}id_/https://{host}/list.aspx?lid={lid}'
                p = subprocess.run(['curl', '-s', '-L', '--compressed', '--max-time', '60', url],
                                   capture_output=True, text=True)
                if p.stdout and 'peak.aspx' in p.stdout:
                    return p.stdout
                time.sleep(1)
        wait = 20 * (attempt + 1)
        print(f'  lid={lid}: no response yet (Wayback throttling?) — waiting {wait}s',
              file=sys.stderr, flush=True)
        time.sleep(wait)
    sys.exit(f'lid={lid}: could not fetch the list page after 4 rounds. Either Wayback is '
             f'throttling (wait, or reduce concurrent crawls) or the list has no snapshot.')


def main():
    for lid in sys.argv[1:]:
        d = fetch(lid)
        title = html.unescape(re.search(r'<title>(.*?)</title>', d, re.S | re.I).group(1))
        title = title.replace(' - Peakbagger.com', '').strip()
        peaks = [{
            'seq': i,                                   # row position; use this for numbering
            'pb_rank': m.group(1).rstrip('.'),          # peakbagger's own rank (can tie/gap)
            'pid': int(m.group(2)),
            'name': html.unescape(re.sub(r'<[^>]+>', '', m.group(3))).strip(),
            'elev': m.group(4),
        } for i, m in enumerate(ROW.finditer(d), start=1)]

        if not peaks:
            sys.exit(f'lid={lid}: snapshot fetched but no peak rows matched — markup may have '
                     f'changed; inspect the HTML before trusting this parser')

        slug = slugify(title)
        json.dump({'lid': lid, 'title': title, 'slug': slug, 'peaks': peaks},
                  open(f'peaks{lid}.json', 'w'), indent=1)

        ev = [int(p['elev'].replace(',', '')) for p in peaks]
        desc = all(ev[i] >= ev[i + 1] for i in range(len(ev) - 1))
        print(f'lid={lid}  n={len(peaks)}  "{title}"')
        print(f'  slug:          {slug}.csv')
        print(f'  elev-descending: {desc}   range: {ev[0]:,} -> {ev[-1]:,} ft')
        print(f'  first: {peaks[0]["name"]}   last: {peaks[-1]["name"]}')
        if not desc:
            print('  NOTE: not sorted high->low; confirm the intended row order before building')


if __name__ == '__main__':
    main()
