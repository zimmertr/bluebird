"""Check a written list against the roster it came from and against its manifest entry.

`presetLists.test.ts` holds the manifest to the CSVs in CI. This check runs before that, with
the one thing CI never sees: the roster. So it catches a coordinate bound to the wrong peak
and a dropped row, which a count alone lets through.
"""
import re

ROW = re.compile(r'^(-?\d+\.\d{6}), (-?\d+\.\d{6}), (.+)$')
SLUG = re.compile(r'^[a-z0-9]+(-[a-z0-9]+)*$')


def verify(entry, csv_path, roster, regions, bbox=None):
    """Return every problem found, as sentences. An empty list passes."""
    problems = []
    lines = open(csv_path, encoding='utf-8').read().split('\n')
    if lines[-1:] != ['']:
        problems.append('the file does not end in a newline')
    data = lines[:-1] if lines[-1:] == [''] else lines
    peaks = roster['peaks']

    if not SLUG.match(entry['id']):
        problems.append(f'id {entry["id"]!r} is not a slug')
    if entry['file'] != f'{entry["id"]}.csv':
        problems.append(f'file {entry["file"]!r} is not the id and .csv')
    if entry['region'] not in regions:
        problems.append(f'region {entry["region"]!r} is not one of the manifest\'s regions')
    if entry['peaks'] != len(data):
        problems.append(f'the entry says {entry["peaks"]} peaks and the file holds {len(data)} rows')
    if len(data) != len(peaks):
        problems.append(f'the roster holds {len(peaks)} peaks and the file holds {len(data)} rows')

    seen = {}
    for number, line in enumerate(data, 1):
        row = ROW.match(line)
        if not row:
            problems.append(f'row {number}: malformed: {line!r}')
            continue
        lat, lon, name = row.groups()
        if number <= len(peaks) and name != peaks[number - 1]['name']:
            problems.append(f'row {number}: name {name!r} is not the roster\'s {peaks[number - 1]["name"]!r}')
        if bbox and not (bbox[0] <= float(lat) <= bbox[1] and bbox[2] <= float(lon) <= bbox[3]):
            problems.append(f'row {number} ({name}): {lat}, {lon} is outside the list\'s box')
        # Two peaks on one exact fix means a page was misread or bound to the wrong peak.
        if (lat, lon) in seen:
            problems.append(f'row {number} ({name}): the same coordinate as row {seen[(lat, lon)]}')
        seen[(lat, lon)] = number
    return problems
