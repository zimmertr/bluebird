"""The held whole-dataset overlay answers (#628).

The routes' own tests (test_nifc.py, test_closures_route.py) pin that a
national box is joined and compressed once; these pin the holder underneath.
"""

from __future__ import annotations

import asyncio
import gc
import gzip

from app.main import app
from app.services import held_body


class _Snapshot:
    """A stand-in owner: anything a weak reference can point at."""


def test_the_held_answer_is_compressed_at_the_middlewares_level():
    gzip_middleware = next(m for m in app.user_middleware if m.cls.__name__ == "GZipMiddleware")
    assert held_body.GZIP_LEVEL == gzip_middleware.kwargs["compresslevel"]


async def test_concurrent_requests_share_one_build():
    builds: list[int] = []

    def text() -> str:
        builds.append(1)
        return '{"type":"FeatureCollection","features":[]}'

    holder, owner = held_body.HeldBodies(), _Snapshot()
    bodies = await asyncio.gather(*(holder.gzipped(owner, "full", text) for _ in range(5)))
    assert builds == [1]
    assert {gzip.decompress(b) for b in bodies} == {b'{"type":"FeatureCollection","features":[]}'}


async def test_each_variant_and_each_snapshot_is_its_own_answer():
    holder, first, second = held_body.HeldBodies(), _Snapshot(), _Snapshot()
    a = await holder.gzipped(first, "full", lambda: "full")
    b = await holder.gzipped(first, "coarse", lambda: "coarse")
    c = await holder.gzipped(second, "full", lambda: "next")
    assert [gzip.decompress(x) for x in (a, b, c)] == [b"full", b"coarse", b"next"]


async def test_the_answers_go_when_their_snapshot_does():
    holder, owner = held_body.HeldBodies(), _Snapshot()
    await holder.gzipped(owner, "full", lambda: "x" * 10_000)
    assert holder._bodies
    del owner
    gc.collect()
    assert holder._bodies == {}


async def test_a_failed_build_is_retried_rather_than_held():
    holder, owner = held_body.HeldBodies(), _Snapshot()

    def broken() -> str:
        raise RuntimeError("build failed")

    try:
        await holder.gzipped(owner, "full", broken)
    except RuntimeError:
        pass
    else:
        raise AssertionError("the build's failure was swallowed")
    assert gzip.decompress(await holder.gzipped(owner, "full", lambda: "ok")) == b"ok"
