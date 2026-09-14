"""The `Cache-Control` header every response carries (issue #354).

The document is the one file that names the bundle. Vite writes the hashed
chunk names into `index.html`, so a browser that keeps an old document asks
for chunks the new image does not hold, and the page breaks on a `404` for a
file that was deleted by the release. A response with a `Last-Modified` and no
freshness of its own is one a browser may reuse without asking (RFC 9111
§4.2.2 heuristic freshness), which is how that happens. So every path outside
the build's asset directory revalidates: Starlette answers `If-None-Match` and
`If-Modified-Since` with a `304` and no body, which is one small round trip
per page load.

The hashed assets are the opposite case. Their file names carry a content
hash, so a URL under the asset directory never changes meaning and never has
to be asked about again.

An error is never `immutable`, even under that directory. The name in a `404`
is the name of a file that does not exist yet or does not exist any more, and
a year of a cached `404` is worse than the defect this fixes.

The header is set only where the response carries none, so a route keeps its
own value. That is the decision a route is entitled to make about its own
body, and `/api/capabilities` and `/api/version` are expected to take it.
"""

from __future__ import annotations

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

# Vite's default `build.assetsDir` is `assets`, and `frontend/vite.config.ts`
# does not override it, so this prefix is where every content-hashed chunk and
# stylesheet lands under the static mount. A build that moves that directory
# moves this constant with it.
ASSETS_PREFIX = "/assets/"

IMMUTABLE = "public, max-age=31536000, immutable"
REVALIDATE = "no-cache"


class CacheHeadersMiddleware:
    """Adds the header above to every response that has none.

    Pure ASGI rather than ``BaseHTTPMiddleware`` for the reason
    ``SecurityHeadersMiddleware`` states: ``POST /api/analyze/stream`` is
    server-sent events, and the base class buffers a streaming response
    through a queue. Setting a header needs nothing but the raw
    ``http.response.start`` message.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        hashed = scope["path"].startswith(ASSETS_PREFIX)

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                if "Cache-Control" not in headers:
                    headers["Cache-Control"] = (
                        IMMUTABLE if hashed and message["status"] < 400 else REVALIDATE
                    )
            await send(message)

        await self.app(scope, receive, send_with_headers)
