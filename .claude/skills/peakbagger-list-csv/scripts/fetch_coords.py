"""Fetch WGS84 summit coords for every peak in a parsed peakbagger list, via the Wayback Machine.

peakbagger.com is behind Cloudflare's JS challenge (403 to curl/WebFetch), so every request
goes through web.archive.org's `id_` raw-bytes modifier. Pages are cached to disk and results
checkpointed, so the crawl is idempotent and resumable — re-running only retries what's missing.

RUN THIS SERIALLY. Wayback rate-limits per IP: one stream sustains ~1 peak/sec, while three
concurrent crawls collapse to ~1 peak/30s. Pass several lids to one process instead of
launching a process per list.

Usage: python3 fetch_coords.py <lid> [<lid> ...] [--rounds N]
Reads peaks<lid>.json, writes coords<lid>.json ({pid: [lat, lon]}), reports what's missing.
"""
import json, os, re, subprocess, sys, time

CACHE = 'pages'

# The WGS84 cell lists the same point in several notations, and peakbagger is NOT consistent
# about their order — some pages lead with decimal degrees, others lead with DMS:
#   <td>46.851731, -121.760395 (Dec Deg)<br/>46&deg 51' 6'' N, ...      <- Mount Rainier
#   <td>48&deg 31' 25'' N, ...<br/>48.523611, -120.816193 (Dec Deg)     <- Black Peak
# So grab the whole cell first, then find the pair tagged (Dec Deg) anywhere inside it.
# Anchoring the decimals directly to the cell opening silently drops every DMS-first page.
WGS_CELL = re.compile(r'Latitude/Longitude \(WGS84\)</td>\s*<td>(.*?)</td>', re.I | re.S)
DEC_DEG = re.compile(r'(-?\d+\.\d+),\s*(-?\d+\.\d+)\s*\(Dec Deg\)', re.I)


def parse_coords(body):
    """Return (lat, lon) from a peak page, or None."""
    cell = WGS_CELL.search(body)
    if not cell:
        return None
    m = DEC_DEG.search(cell.group(1))
    return (float(m.group(1)), float(m.group(2))) if m else None

# Peak pages are static, so any snapshot is equally valid; more years = more chances the pid
# was crawled at all. Tried in order, but only advanced past on a genuine miss (see below).
YEARS = ['2025', '2023', '2021', '2019', '']
HOSTS = ['www.peakbagger.com', 'peakbagger.com']
THROTTLED = {'000', '429', '503', '502', '504'}   # back off; NOT evidence the page is absent


def get(pid, year, host):
    """Return (http_code, body). Code '000' means the connection failed or timed out."""
    url = f'https://web.archive.org/web/{year}id_/https://{host}/peak.aspx?pid={pid}'
    p = subprocess.run(
        ['curl', '-s', '-L', '--compressed', '--max-time', '45', '-w', '%{http_code}',
         '-o', f'{CACHE}/{pid}.tmp', url], capture_output=True, text=True)
    code = (p.stdout or '').strip()[-3:] or '000'
    try:
        body = open(f'{CACHE}/{pid}.tmp', encoding='utf-8', errors='replace').read()
    except OSError:
        body = ''
    return code, body


def coords_for(pid, delay):
    """Try snapshot years x hosts until the WGS84 row appears; cache the winning page.

    Crucially, a throttled response is retried against the SAME url with backoff rather than
    being read as 'no such snapshot' — otherwise one throttle burns all ten combinations and
    the peak gets written off as missing when it was only rate-limited.
    """
    cached = f'{CACHE}/{pid}.html'
    if os.path.exists(cached):
        c = parse_coords(open(cached, encoding='utf-8', errors='replace').read())
        if c:
            return c

    for year in YEARS:
        for host in HOSTS:
            for attempt in range(4):
                code, body = get(pid, year, host)
                if code in THROTTLED:
                    time.sleep(5 * (attempt + 1))    # 5s, 10s, 15s, 20s against the same url
                    continue
                if code == '200':
                    c = parse_coords(body)
                    if c:
                        open(cached, 'w', encoding='utf-8').write(body)
                        return c
                break                                # real miss (404, or 200 without coords)
            time.sleep(delay)
    return None


def run_list(lid, rounds):
    peaks = json.load(open(f'peaks{lid}.json'))['peaks']
    out = f'coords{lid}.json'
    got = json.load(open(out)) if os.path.exists(out) else {}

    for r in range(rounds):
        missing = [p for p in peaks if str(p['pid']) not in got]
        if not missing:
            break
        delay = 0.3 + r * 1.0                        # ease off the throttle on later rounds
        print(f'--- lid={lid} round {r+1}: {len(missing)} to fetch (delay {delay}s) ---',
              flush=True)
        for i, p in enumerate(missing, 1):
            c = coords_for(p['pid'], delay)
            if c:
                got[str(p['pid'])] = c
                print(f'  [{i}/{len(missing)}] {p["name"]} -> {c[0]}, {c[1]}', flush=True)
            else:
                print(f'  [{i}/{len(missing)}] {p["name"]} (pid={p["pid"]}) FAILED', flush=True)
            if i % 20 == 0:
                json.dump(got, open(out, 'w'))
        json.dump(got, open(out, 'w'))

    json.dump(got, open(out, 'w'))
    missing = [p for p in peaks if str(p['pid']) not in got]
    print(f'\nRESULT lid={lid}: {len(got)}/{len(peaks)} resolved, {len(missing)} missing',
          flush=True)
    for p in missing:
        print(f'  MISSING pid={p["pid"]} {p["name"]}', flush=True)
    return len(missing)


def main():
    args = sys.argv[1:]
    rounds = 3
    if '--rounds' in args:
        i = args.index('--rounds')
        rounds = int(args[i + 1])
        del args[i:i + 2]
    lids = [a for a in args if not a.startswith('--')]
    if not lids:
        sys.exit(__doc__)
    os.makedirs(CACHE, exist_ok=True)
    total = sum(run_list(lid, rounds) for lid in lids)
    print(f'\nALL DONE: {total} peak(s) still missing across {len(lids)} list(s)')


if __name__ == '__main__':
    main()
