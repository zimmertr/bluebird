"""Reading a knob out of the environment, for every layer of the app.

Deliberately imports nothing from ``app``, so the lowest modules can use it
without a cycle. That is what this module is for: ``ratelimit`` imports
``telemetry.py``, so ``telemetry.py`` can import nothing of ``ratelimit``,
and the four modules that read env knobs each carried their own copy of this
reader rather than share one across that edge.

The reading itself is the same everywhere on purpose. A knob that is absent
takes its default, and a knob that is not an integer is logged and takes its
default too: a pod that refuses to start over one mistyped env var is a worse
failure than a pod running at a documented default, and the log line is what
makes the mistake findable.

``env_url`` holds an upstream's address the same way. Every host the pod
calls, and every host it tells the browser to call, is one of these, so a
local stack can point the whole app at a simulator (#224). A value that does
not even look like a URL is the same kind of typo as a non-integer, and gets
the same answer.
"""

from __future__ import annotations

import logging
import os

log = logging.getLogger(__name__)


def env_int(name: str, default: int) -> int:
    """The integer in ``name``, or ``default`` when it is unset or unreadable."""
    raw = os.environ.get(name)
    if raw is None:
        return default
    try:
        return int(raw)
    except ValueError:
        log.warning("Ignoring non-integer %s=%r; using default %d", name, raw, default)
        return default


def env_url(name: str, default: str) -> str:
    """The URL in ``name``, or ``default`` when it is unset or not a URL.

    The value is returned exactly as set: callers append their own paths to
    it, so trimming a slash here would change what a configured base means.
    """
    raw = os.environ.get(name)
    if raw is None:
        return default
    if not raw.startswith(("http://", "https://")):
        log.warning("Ignoring non-URL %s=%r; using default %s", name, raw, default)
        return default
    return raw
