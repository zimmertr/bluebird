"""An overlay's whole-dataset answer, joined and gzipped once per snapshot.

The wildfire and closure routes answer a box by filtering a snapshot and
joining the stored feature text, and `GZipMiddleware` then compresses the join
for every request. For a box that takes in every feature, which is what a
zoomed-out map and a national `detail=full` request ask for, that answer is
the same bytes until the snapshot changes, and compressing it is the
expensive half: measured 2026-10-06 in the backend's test image on a synthetic
national perimeter set sized like nifc.py's (232 fires, 18.3 MB of
full-detail text), the join took 2 ms and the gzip at level 6 took 445 ms of
CPU for every request (#628). Starlette runs that compression on a worker
thread, so it does not stall the event loop, but the pod's CPU still paid it
per request. Held here, it is paid once per snapshot.

Only the compressed copy is held, 5.3 MB for that set. A client that takes no
gzip gets the per-request join, which costs no compression; Cloudflare asks
the origin for gzip, so in production that client is a direct caller inside
the cluster, and holding the 18 MB plain copy for it would cost more memory
than the 2 ms it saves.
"""

from __future__ import annotations

import asyncio
import weakref
import zlib
from collections.abc import Callable, Hashable

from starlette.requests import Request
from starlette.responses import Response

# The level `GZipMiddleware` in main.py compresses at, so a held answer is the
# bytes the middleware would have sent. main.py has the measurement behind 6;
# test_held_body.py fails if the two part.
GZIP_LEVEL = 6


def _gzip(text: str) -> bytes:
    # A gzip stream from the same compressor settings Starlette's middleware
    # uses, rather than `gzip.compress`, whose header stamps the build time.
    compressor = zlib.compressobj(GZIP_LEVEL, zlib.DEFLATED, 16 + zlib.MAX_WBITS)
    return compressor.compress(text.encode("utf-8")) + compressor.flush()


def takes_gzip(request: Request) -> bool:
    """Whether a request may be sent a gzipped body.

    The same test `GZipMiddleware` applies, so a held answer goes to exactly
    the clients that would have had a compressed one anyway.
    """
    return "gzip" in request.headers.get("accept-encoding", "")


class HeldBodies:
    """The compressed whole-dataset answers for the snapshot a cache holds now.

    Built on the first request that needs one, on a worker thread, and shared
    by every request that arrives while it builds. Keyed on the snapshot
    object itself through a weak reference: a refresh swaps the object, so the
    next request builds afresh, and the held answers are dropped as soon as
    nothing holds the old snapshot rather than waiting for that request.
    """

    def __init__(self) -> None:
        self._owner: weakref.ref[object] | None = None
        self._bodies: dict[Hashable, bytes | asyncio.Future[bytes]] = {}

    def _forget(self, ref: weakref.ref[object]) -> None:
        if self._owner is ref:
            self._owner = None
            self._bodies = {}

    async def gzipped(self, owner: object, variant: Hashable, text: Callable[[], str]) -> bytes:
        """The gzipped ``text()`` for ``owner`` and ``variant``, built at most once."""
        if self._owner is None or self._owner() is not owner:
            self._owner = weakref.ref(owner, self._forget)
            self._bodies = {}
        bodies = self._bodies
        held = bodies.get(variant)
        if isinstance(held, bytes):
            return held
        if held is None:
            held = asyncio.ensure_future(asyncio.to_thread(lambda: _gzip(text())))
            bodies[variant] = held
        try:
            # Shielded so a client that goes away mid-build does not cancel
            # the build every other waiter is sharing.
            body = await asyncio.shield(held)
        except BaseException:
            if held.done() and bodies.get(variant) is held:
                del bodies[variant]
            raise
        bodies[variant] = body
        return body


def respond(body: bytes) -> Response:
    """A held gzipped answer, which `GZipMiddleware` passes through untouched.

    The middleware leaves a response alone once it carries a
    ``Content-Encoding``, and adds ``Vary`` only to bodies it compresses
    itself, so the ``Vary`` a cache needs is set here.
    """
    return Response(
        content=body,
        media_type="application/json",
        headers={"Content-Encoding": "gzip", "Vary": "Accept-Encoding"},
    )
