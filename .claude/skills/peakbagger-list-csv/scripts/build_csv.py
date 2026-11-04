"""Write a Bluebird Forecast frontend/src/coordinate-lists/*.csv from peaks<lid>.json + coords<lid>.json.

The file is named for the list as the Example list menu reads it: the app offers every
file in that directory, named by its file name without .csv, so --name is the
maintainer-approved menu string (e.g. --name 'The Bulger List').

Rows only, no headline, in the format every list there uses:
    Lat, Lon, Name
ordered as the list page presents them (normally highest -> lowest).

The name carries no list number: Bluebird Forecast ranks the rows and numbers them itself,
so a "23." prefix would read as "1 23. Foobar Mountain" in the results table.

The name carries no elevation either: Bluebird Forecast resolves each coordinate against OpenStreetMap and
fills the Elevation column itself (issue #207), so printing the list page's figure here
would only be a second number to disagree with the one on screen.

Usage:
  python3 build_csv.py <lid> <outdir> --name '<Menu name>'
"""
import json, os, sys

lid, outdir = sys.argv[1], sys.argv[2]
args = sys.argv[3:]

if '--name' not in args or args.index('--name') + 1 >= len(args):
    sys.exit("--name '<Menu name>' is required: the file's name is the string the Example list menu shows.")
name = args[args.index('--name') + 1].strip()
if not name or '/' in name or name.endswith('.csv'):
    sys.exit(f'--name {name!r} must be the menu string alone: no slash, no .csv.')

meta = json.load(open(f'peaks{lid}.json'))
peaks = meta['peaks']
coords = json.load(open(f'coords{lid}.json'))

missing = [p for p in peaks if str(p['pid']) not in coords]
if missing:
    sys.exit(f'REFUSING to write: {len(missing)} of {len(peaks)} peaks lack coordinates:\n  '
             + '\n  '.join(f'{p["name"]} (pid={p["pid"]})' for p in missing)
             + '\nRe-run fetch_coords.py, or resolve them by hand. Never guess a coordinate.')

outfile = os.path.join(outdir, f'{name}.csv')

lines = []
for p in peaks:
    lat, lon = coords[str(p['pid'])]
    lines.append(f'{lat:.6f}, {lon:.6f}, {p["name"]}')

open(outfile, 'w', encoding='utf-8').write('\n'.join(lines) + '\n')
print(f'wrote {outfile}: {len(peaks)} peaks, {len(lines)} lines')
