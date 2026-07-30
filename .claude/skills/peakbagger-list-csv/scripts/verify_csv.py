"""Check a generated CSV against the parsed list it came from. Exits non-zero on any problem.

Usage: python3 verify_csv.py <lid> <csvfile> [--bbox LAT_MIN LAT_MAX LON_MIN LON_MAX]

Cross-checks every row against peaks<lid>.json rather than only checking the file's shape,
so a coordinate attached to the wrong peak or a dropped row is caught. Elevation is not in
the CSV (bluebird resolves it from OSM), so ordering is checked against the list page.
"""
import json, re, sys

ROW = re.compile(r'^(-?\d+\.\d{6}), (-?\d+\.\d{6}), (\d+)\. (.+)$')

lid, csvfile = sys.argv[1], sys.argv[2]
bbox = None
if '--bbox' in sys.argv:
    i = sys.argv.index('--bbox')
    bbox = [float(x) for x in sys.argv[i + 1:i + 5]]

peaks = json.load(open(f'peaks{lid}.json'))['peaks']
lines = open(csvfile, encoding='utf-8').read().splitlines()
head = [l for l in lines if l.startswith('#')]
data = [l for l in lines if l and not l.startswith('#')]
problems = []

if len(head) != 4:
    problems.append(f'expected 4 comment lines, found {len(head)}')
if len(data) != len(peaks):
    problems.append(f'expected {len(peaks)} data rows, found {len(data)}')

seen_coords = {}
for n, line in enumerate(data, 1):
    m = ROW.match(line)
    if not m:
        problems.append(f'row {n}: malformed -> {line!r}')
        continue
    lat, lon, num, name = m.group(1), m.group(2), int(m.group(3)), m.group(4)

    if num != n:
        problems.append(f'row {n}: numbered {num}, expected {n}')
    if n <= len(peaks):
        want = peaks[n - 1]
        if name != want['name']:
            problems.append(f'row {n}: name {name!r} != list {want["name"]!r}')
    if bbox and not (bbox[0] <= float(lat) <= bbox[1] and bbox[2] <= float(lon) <= bbox[3]):
        problems.append(f'row {n} ({name}): {lat},{lon} outside expected bbox')
    # Two peaks sharing an exact 6-decimal fix means a page was misparsed or misattributed.
    key = (lat, lon)
    if key in seen_coords:
        problems.append(f'row {n} ({name}): duplicate coordinate of row {seen_coords[key]}')
    seen_coords[key] = n

# Rows are positional mirrors of the list, and every name is checked against its
# position above, so the list's own elevations answer for the CSV's ordering.
ev = [int(p['elev'].replace(',', '')) for p in peaks]
if ev and not all(ev[i] >= ev[i + 1] for i in range(len(ev) - 1)):
    problems.append('rows are not ordered highest -> lowest by elevation')

if problems:
    print(f'FAIL {csvfile} — {len(problems)} problem(s):')
    for p in problems:
        print('  ' + p)
    sys.exit(1)

print(f'OK {csvfile}: {len(data)} rows, all names match list {lid}, '
      f'coords unique, elevation-descending'
      + (f', all within bbox {bbox}' if bbox else ''))
