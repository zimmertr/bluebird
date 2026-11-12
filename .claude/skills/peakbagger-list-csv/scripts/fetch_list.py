"""Read a peakbagger list page into its roster: the list's peaks, in the page's own order.

A roster is {'title': str, 'peaks': [{'pid': str, 'name': str}]}. `crawl.py` calls
`parse_list` on the page the Wayback Machine holds, and `read_roster` on a roster saved
from the maintainer's Chrome when the archive's copy is out of date (SKILL.md, "A stale
roster").
"""
import html
import json
import re

# One table row: everything from a <tr> to the next one. The pages close no row.
TR = re.compile(r'<tr[^>]*>(.*?)(?=<tr[^>]*>|</table>)', re.S | re.I)
# A row counts when its first cell is a rank. An elevation list also prints the summits
# that miss its prominence rule, with an empty first cell, and those are not on the list
# (Colorado 13ers: 629 ranked of 879 rows). A list of high points carries cells between the
# rank and the peak that say what the peak is the top of: one for a state or a county, two
# for a county and its country (the UK's), and a continent's is a link to its range page
# (the Seven Summits). Up to three such cells are passed over, none of them holding a peak
# link. Only the FIRST peak link is the row's peak: a county row links its other contenders
# after it.
RANKED = re.compile(
    r'\s*<td[^>]*>\s*[\d.]+\s*</td>\s*'
    r'(?:<td[^>]*>(?:(?!</td>|peak\.aspx\?pid=).)*</td>\s*){0,3}'
    r'<td[^>]*>\s*<a href=["\']?peak\.aspx\?pid=(-?\d+)["\']?>(.*?)</a>',
    re.S | re.I,
)
TITLE = re.compile(r'<title>(.*?)</title>', re.S | re.I)


def is_list(text):
    return 'peak.aspx?pid=' in text.lower()


def _name(markup):
    return ' '.join(html.unescape(re.sub(r'<[^>]+>', '', markup)).split())


def parse_list(text):
    title = TITLE.search(text)
    peaks, seen = [], set()
    for row in TR.finditer(text):
        ranked = RANKED.match(row.group(1))
        # One summit can top two counties, and it is one peak of the list.
        if ranked and ranked.group(1) not in seen:
            seen.add(ranked.group(1))
            peaks.append({'pid': ranked.group(1), 'name': _name(ranked.group(2))})
    return {
        'title': _name(title.group(1)).replace(' - Peakbagger.com', '') if title else '',
        'peaks': peaks,
    }


def read_roster(path):
    roster = json.load(open(path, encoding='utf-8'))
    seen, peaks = set(), []
    for peak in roster['peaks']:
        pid = str(peak['pid'])
        if pid not in seen:
            seen.add(pid)
            peaks.append({'pid': pid, 'name': ' '.join(str(peak['name']).split())})
    return {'title': roster.get('title', ''), 'peaks': peaks}
