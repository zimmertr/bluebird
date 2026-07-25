"""Write a bluebird examples/*.csv from peaks<lid>.json + coords<lid>.json.

Row format mirrors examples/bulger-list.csv:
    Lat, Lon, N. Name (E,EEE ft)
ordered as the list page presents them (normally highest -> lowest), with N as the row
position rather than peakbagger's rank column (that column has ties and gaps on some lists).
bluebird's "Custom (CSV)" parser splits on the first two commas only, so the comma inside
the elevation is safe.

Usage:
  python3 build_csv.py <lid> <outdir> [--headline "# ..."] [--out name.csv]
"""
import json, os, sys

lid, outdir = sys.argv[1], sys.argv[2]
args = sys.argv[3:]


def opt(flag):
    return args[args.index(flag) + 1] if flag in args else None


meta = json.load(open(f'peaks{lid}.json'))
peaks = meta['peaks']
coords = json.load(open(f'coords{lid}.json'))

missing = [p for p in peaks if str(p['pid']) not in coords]
if missing:
    sys.exit(f'REFUSING to write: {len(missing)} of {len(peaks)} peaks lack coordinates:\n  '
             + '\n  '.join(f'{p["name"]} (pid={p["pid"]})' for p in missing)
             + '\nRe-run fetch_coords.py, or resolve them by hand. Never guess a coordinate.')

outfile = os.path.join(outdir, opt('--out') or f'{meta["slug"]}.csv')
headline = opt('--headline') or f'# {meta["title"]} — ordered highest to lowest.'

lines = [
    headline,
    f'# Source: peakbagger.com list {lid}. Elevations from the list page; coordinates',
    '# (WGS84 decimal degrees, 6 places) from each peak page. Paste the rows below',
    '# into the "Custom (CSV)" destination type. Format: Latitude, Longitude, Name',
]
for i, p in enumerate(peaks, 1):
    lat, lon = coords[str(p['pid'])]
    elev = f'{int(p["elev"].replace(",", "")):,}'   # list page omits commas below 10,000 ft
    lines.append(f'{lat:.6f}, {lon:.6f}, {i}. {p["name"]} ({elev} ft)')

open(outfile, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print(f'wrote {outfile}: {len(peaks)} peaks, {len(lines)} lines')
