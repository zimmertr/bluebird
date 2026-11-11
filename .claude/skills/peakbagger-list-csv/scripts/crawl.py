"""Crawl peakbagger lists into Bluebird Forecast's coordinate lists, end to end, in one process.

Usage:
  python3 crawl.py <spec.json> --repo <path to the repo> [--work <directory>]

The spec is a JSON array with one object per list, every word in it approved by the
maintainer first (SKILL.md, "The spec"):
  {"lid": "5035", "id": "wa-snoqualmie-peak-pin", "name": "Snoqualmie Peak Pin",
   "description": "...", "region": "Washington", "credit": "The Mountaineers",
   "expect": 20, "bbox": [45.5, 49.1, -124.9, -116.9], "roster": "roster5035.json"}
`expect`, `bbox` and `roster` are optional.

For each list it reads the list page, reads every peak's coordinates, writes
frontend/src/coordinate-lists/<id>.csv, writes the list's entry in lists.json and checks the
result. It prints one summary and exits non-zero when any list was not written.

Everything it fetches is kept under --work (the current directory by default): list pages
in lists/, coordinates in coords.json. A rerun reads those first and asks the archive only
for what is missing, so a stopped crawl loses nothing.

RUN ONE CRAWL AT A TIME. Wayback throttles per address (wayback.py).
"""
import datetime
import json
import os
import sys

import build_csv
import fetch_coords
import fetch_list
import verify_csv
import wayback


def load_json(path, default):
    return json.load(open(path, encoding='utf-8')) if os.path.exists(path) else default


def save_json(path, value):
    with open(path + '.tmp', 'w', encoding='utf-8') as out:
        json.dump(value, out)
    os.replace(path + '.tmp', path)


def roster_for(lid, work, archive, override=None):
    """Return (roster, where it came from). The roster is None when no capture serves."""
    if override:
        return fetch_list.read_roster(os.path.join(work, override)), f'read live, {override}'
    cached = os.path.join(work, 'lists', f'{lid}.html')
    if os.path.exists(cached):
        return fetch_list.parse_list(open(cached, encoding='utf-8').read()), 'kept page'
    text, stamp = archive.snapshot(f'list.aspx?lid={lid}', fetch_list.is_list)
    if text is None:
        return None, 'no capture'
    with open(cached, 'w', encoding='utf-8') as out:
        out.write(text)
    return fetch_list.parse_list(text), f'captured {stamp[:4]}-{stamp[4:6]}-{stamp[6:8]}'


def seed_from_shipped(manifest, directory, skip, work, archive, coords):
    """Read the coordinates of lists already shipped out of their own CSVs.

    A shipped CSV mirrors its list page row for row, so the page gives each row its peak id.
    A list whose page no longer matches its CSV seeds nothing, and its peaks are fetched.
    """
    seeded = 0
    for entry in manifest['lists']:
        if entry['id'] in skip or entry['source']['site'] != build_csv.SITE:
            continue
        roster, _ = roster_for(entry['source']['listId'], work, archive)
        lines = open(os.path.join(directory, entry['file']), encoding='utf-8').read().splitlines()
        rows = [verify_csv.ROW.match(line) for line in lines]
        if roster is None or len(rows) != len(roster['peaks']) or not all(rows):
            continue
        if any(row.group(3) != peak['name'] for row, peak in zip(rows, roster['peaks'])):
            continue
        for row, peak in zip(rows, roster['peaks']):
            if peak['pid'] not in coords:
                coords[peak['pid']] = [float(row.group(1)), float(row.group(2))]
                seeded += 1
    return seeded


def main():
    args = sys.argv[1:]
    options = {}
    for flag in ('--repo', '--work'):
        if flag in args:
            at = args.index(flag)
            options[flag] = args[at + 1]
            del args[at:at + 2]
    if len(args) != 1 or '--repo' not in options:
        sys.exit(__doc__)

    spec = json.load(open(args[0], encoding='utf-8'))
    work = options.get('--work', '.')
    directory = os.path.join(options['--repo'], 'frontend', 'src', 'coordinate-lists')
    os.makedirs(os.path.join(work, 'lists'), exist_ok=True)
    coords_path = os.path.join(work, 'coords.json')
    coords = load_json(coords_path, {})
    manifest = build_csv.read_manifest(directory)
    regions = [region['name'] for region in manifest['regions']]
    archive = wayback.Wayback(log=lambda line: print(line, flush=True))
    today = datetime.date.today().isoformat()

    try:
        seeded = seed_from_shipped(manifest, directory, {item['id'] for item in spec}, work, archive, coords)
        print(f'{seeded} coordinates read from lists already shipped', flush=True)

        rosters = {}
        for item in spec:
            roster, origin = roster_for(item['lid'], work, archive, item.get('roster'))
            rosters[item['id']] = (roster, origin)
            count = len(roster['peaks']) if roster else 0
            print(f'list {item["lid"]} {item["id"]}: {count} peaks, {origin}', flush=True)

        # Each peak is fetched once, however many lists carry it.
        wanted = []
        for roster, _ in rosters.values():
            for peak in (roster['peaks'] if roster else []):
                if peak['pid'] not in coords and peak['pid'] not in wanted:
                    wanted.append(peak['pid'])
        print(f'{len(wanted)} peak pages to read', flush=True)
        for done, pid in enumerate(wanted, 1):
            text, _ = archive.snapshot(f'peak.aspx?pid={pid}', lambda body: fetch_coords.parse_coords(body) is not None)
            if text is not None:
                coords[pid] = fetch_coords.parse_coords(text)
            if done % 25 == 0 or done == len(wanted):
                save_json(coords_path, coords)
                print(f'  {done}/{len(wanted)} peak pages, {archive.requests} requests', flush=True)
    except wayback.Throttled as stopped:
        save_json(coords_path, coords)
        sys.exit(f'STOPPED: Wayback kept refusing {stopped}. Wait a while and run the same command again.')

    written, failed = [], []
    for item in spec:
        roster, origin = rosters[item['id']]
        peaks = roster['peaks'] if roster else []
        missing = [peak for peak in peaks if peak['pid'] not in coords]
        problems = []
        if not peaks:
            problems.append('the list page gave no peaks')
        if 'expect' in item and len(peaks) != item['expect']:
            problems.append(f'the roster holds {len(peaks)} peaks and the spec expects {item["expect"]}')
        problems += [f'no coordinates in the archive for {peak["name"]} (pid {peak["pid"]})' for peak in missing]
        if not problems:
            path = build_csv.write_csv(directory, item['id'], roster, coords)
            new = build_csv.entry(item, len(peaks), today)
            problems = verify_csv.verify(new, path, roster, regions, item.get('bbox'))
            if problems:
                os.remove(path)
            else:
                build_csv.upsert(manifest, new)
        (failed if problems else written).append((item, roster, origin, problems))
    build_csv.write_manifest(directory, manifest)

    print(f'\nSUMMARY: {len(written)} of {len(spec)} lists written, {archive.requests} requests')
    for item, roster, origin, _ in written:
        print(f'  WROTE  {item["id"]}: {len(roster["peaks"])} peaks ("{roster["title"]}", {origin})')
    for item, _, origin, problems in failed:
        print(f'  FAILED {item["id"]} (list {item["lid"]}, {origin}):')
        for problem in problems:
            print(f'    {problem}')
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
