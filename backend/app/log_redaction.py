"""The one formatter every log record passes, and the key mask it shares.

A caller's Open-Meteo key rides the query string of every keyed request, and
`raise_for_status` builds its message out of that URL. `redacted_error` cleans
the lines that call it, but a traceback is not one of them: an exception raised
while an `HTTPStatusError` is being handled chains it, and the traceback prints
the chained text. Masking the whole formatted record at the root handler, which
uvicorn's loggers propagate to as well (see main.py), covers every present and
future path in one place rather than one call site at a time.
"""

from __future__ import annotations

import logging
import re

# What stands in for a caller's key wherever text could persist. The pod
# forwards a paid credential and must forget it, so a log line is the one
# place it could survive the request.
REDACTED = "[redacted]"

# The key's value in a query string, whatever it holds. httpx percent-encodes
# the query, so a key holding `+`, `/` or `=` reaches an error's text in a form
# that a replace of the raw key would miss.
KEY_IN_QUERY = re.compile(r"(apikey=)[^&#\s'\"]+", re.IGNORECASE)

# Every C0 control except newline and tab, DEL, and the C1 range (0x9B is a
# one-byte CSI to some terminals). A path is printed decoded, so `%1B` arrives
# as a real ESC that can recolour or rewrite a terminal reading `kubectl logs`.
# Newline and tab stay because a traceback is made of them, and a request path
# cannot carry either: urlsplit strips them before Starlette builds the path.
_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f-\x9f]")


def _escaped(match: re.Match[str]) -> str:
    return f"\\x{ord(match.group()):02x}"


def clean(text: str) -> str:
    """`text` with any `apikey=` value masked and control characters escaped."""
    return _CONTROL.sub(_escaped, KEY_IN_QUERY.sub(rf"\g<1>{REDACTED}", text))


class RedactingFormatter(logging.Formatter):
    """A Formatter whose output, traceback included, has passed `clean`.

    It cleans the finished string rather than `record.msg` or `record.args`,
    because the traceback and any `%r` of an exception exist only once the
    record is formatted.
    """

    def format(self, record: logging.LogRecord) -> str:
        return clean(super().format(record))
