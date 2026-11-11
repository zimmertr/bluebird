"""Read a peak's WGS84 coordinates out of its peakbagger page."""
import collections
import re

# The WGS84 cell lists the same point in several notations, and peakbagger is NOT consistent
# about their order. Some pages lead with decimal degrees, others with DMS:
#   <td>46.851731, -121.760395 (Dec Deg)<br/>46&deg 51' 6'' N, ...      <- Mount Rainier
#   <td>48&deg 31' 25'' N, ...<br/>48.523611, -120.816193 (Dec Deg)     <- Black Peak
# So take the whole cell first, then find the pair tagged (Dec Deg) anywhere inside it.
# Anchoring the decimals to the cell's opening silently drops every DMS-first page.
WGS_CELL = re.compile(r'Latitude/Longitude \(WGS84\)</td>\s*<td>(.*?)</td>', re.I | re.S)
DEC_DEG = re.compile(r'(-?\d+\.\d+),\s*(-?\d+\.\d+)\s*\(Dec Deg\)', re.I)


# A capture can be a different peak's page: Wayback holds a capture of
# `peak.aspx?pid%3D3155`, an escaped `=`, under pid 3155's URL, and peakbagger answered
# it with Mount Rainier (found 2026-11-11, when an Oregon list row landed on Rainier).
# A peak page links its own pid more often than any other (Lookout Mountain's: 3155
# seven times, the next pid once), so the most frequent `pid=` on the page names it.
PID_LINK = re.compile(r'pid=(-?\d+)', re.I)


def page_pid(body):
    """Return the pid a peak page is about, or None."""
    counts = collections.Counter(PID_LINK.findall(body)).most_common(1)
    return counts[0][0] if counts else None


def parse_coords(body):
    """Return [lat, lon] from a peak page, or None."""
    cell = WGS_CELL.search(body)
    if not cell:
        return None
    pair = DEC_DEG.search(cell.group(1))
    return [float(pair.group(1)), float(pair.group(2))] if pair else None
