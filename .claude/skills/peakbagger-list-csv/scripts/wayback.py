"""The crawl's one connection to the Wayback Machine.

peakbagger.com sits behind a JavaScript challenge, so every page is read from
web.archive.org, whose `id_` modifier returns the bytes it captured. Wayback throttles per
address: one paced stream holds about a page a second, and three streams at once ran about
thirty times slower (measured on 300 peaks). So there is one connection, kept alive, and every
request in the crawl goes through `Wayback.get`.
"""
import gzip
import http.client
import re
import time
import urllib.parse

HOST = 'web.archive.org'
SITE = 'www.peakbagger.com'
# A generic client name: the request carries nothing about the project or its maintainer.
USER_AGENT = 'peak-list-crawl/1.0'
# Wayback's own way of saying slow down. A CAPTURED answer with one of these statuses carries
# a Memento-Datetime header and is a miss, not a throttle.
THROTTLE = {429, 502, 503, 504}
REDIRECT = {301, 302, 303, 307, 308}
STAMP = re.compile(r'/web/(\d{14})')


class Throttled(Exception):
    """Wayback kept refusing one page. The crawl stops; a rerun resumes where it stopped."""


def _text(body):
    # `id_` hands back the captured bytes, which may be gzip under a gzip transfer.
    for _ in range(2):
        if body[:2] != b'\x1f\x8b':
            break
        body = gzip.decompress(body)
    return body.decode('utf-8', 'replace')


class Wayback:
    def __init__(self, pace=1.0, log=print):
        self.pace = pace
        self.log = log
        self.conn = None
        self.last = 0.0
        self.requests = 0

    def _once(self, path):
        wait = self.last + self.pace - time.monotonic()
        if wait > 0:
            time.sleep(wait)
        self.last = time.monotonic()
        self.requests += 1
        if self.conn is None:
            self.conn = http.client.HTTPSConnection(HOST, timeout=60)
        self.conn.request('GET', path, headers={'Accept-Encoding': 'gzip', 'User-Agent': USER_AGENT})
        response = self.conn.getresponse()
        return response, response.read()

    def _drop(self):
        if self.conn is not None:
            self.conn.close()
        self.conn = None

    def get(self, path):
        """Return (status, text, final path), following Wayback's own redirects.

        A throttle or a dropped connection retries the SAME page after a wait, honouring
        Retry-After, so a rate limit is never read as a page the archive lacks.
        """
        wait = 5
        for _ in range(8):
            try:
                for _ in range(5):
                    response, body = self._once(path)
                    location = response.getheader('Location')
                    if response.status not in REDIRECT or not location:
                        break
                    target = urllib.parse.urlsplit(location)
                    if target.netloc not in ('', HOST):
                        return response.status, '', path
                    path = target.path + ('?' + target.query if target.query else '')
            except (OSError, http.client.HTTPException) as error:
                self._drop()
                reason = type(error).__name__
            else:
                if response.status not in THROTTLE or response.getheader('Memento-Datetime'):
                    return response.status, _text(body), path
                reason = f'HTTP {response.status}'
                after = response.getheader('Retry-After') or ''
                if after.isdigit():
                    wait = max(wait, int(after))
            self.log(f'  {reason} from Wayback, waiting {wait}s')
            time.sleep(wait)
            wait = min(wait * 2, 300)
        raise Throttled(path)

    def snapshot(self, page, good):
        """Return (text, timestamp) of a capture of peakbagger's `page` that `good` accepts.

        The newest capture is tried first. When it is no use (the archive holds challenge
        pages and refusals too), ONE index lookup lists that page's good captures, newest
        last, and each is tried. (None, None) when none serves.
        """
        status, text, path = self.get(f'/web/2025id_/https://{SITE}/{page}')
        first = STAMP.search(path)
        if status == 200 and good(text):
            return text, first.group(1) if first else ''
        query = urllib.parse.urlencode({
            'url': f'{SITE}/{page}', 'filter': 'statuscode:200', 'fl': 'timestamp,original',
            'collapse': 'digest', 'limit': '-4',
        })
        status, listing, _ = self.get('/cdx/search/cdx?' + query)
        if status != 200:
            return None, None
        for line in reversed(listing.split('\n')):
            stamp, _, original = line.strip().partition(' ')
            if not original or (first and stamp == first.group(1)):
                continue
            status, text, _ = self.get(f'/web/{stamp}id_/{original}')
            if status == 200 and good(text):
                return text, stamp
        return None, None
