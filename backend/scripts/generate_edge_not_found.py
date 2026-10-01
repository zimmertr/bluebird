"""Regenerate (or verify) the committed copy of the gateway's 404.

    python scripts/generate_edge_not_found.py            # rewrite edge_not_found.json
    python scripts/generate_edge_not_found.py --check     # fail if it is stale

On bluebirdforecast.com an /api path the chart does not publish, and an
analyze request without its key, never reach the pod: an Istio directResponse
in bluebird-helm answers them. That answer is a static copy of the catch-all
in `app/routes/notfound.py`, and a copy in another repository drifts in
silence; the chart's body went without the `error` object for a release after
the app gained it (#565).

So the app writes down what the copy must say, and the chart's `Lint & render`
check renders its VirtualService and compares the route against this file on
bluebird's main. Nothing here is typed by hand: the body is the route's own
builder with the gateway's phrase for the path, and the headers are whatever
the app actually sent on a 404 to a browser, so a header added to the pod, or
a host added to its CSP, changes this file and turns the chart's check red
until the chart follows.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
OUT = BACKEND_DIR / "edge_not_found.json"

# Lets the script run from any working directory, not just backend/.
sys.path.insert(0, str(BACKEND_DIR))

from fastapi.testclient import TestClient  # noqa: E402 — after the sys.path insert above

from app.main import app  # noqa: E402
from app.routes.notfound import EDGE_PATH_PHRASE, not_found_body  # noqa: E402

# A path no route will ever claim, asked for the way a browser on another
# origin asks, so the CORS headers a browser needs to read the body are among
# the ones recorded.
_PROBE_PATH = "/api/edge-not-found-probe"
_PROBE_ORIGIN = "https://example.com"

# Describes one message rather than the route, and Envoy computes it for the
# body it sends.
_PER_MESSAGE = {"content-length"}


def render() -> str:
    response = TestClient(app).get(_PROBE_PATH, headers={"Origin": _PROBE_ORIGIN})
    if response.status_code != 404:
        raise SystemExit(f"{_PROBE_PATH} answered {response.status_code}, not 404")
    headers = {
        name.lower(): value
        for name, value in response.headers.items()
        if name.lower() not in _PER_MESSAGE
    }
    record = {
        "status": response.status_code,
        "body": not_found_body(EDGE_PATH_PHRASE),
        "headers": dict(sorted(headers.items())),
    }
    return json.dumps(record, indent=2) + "\n"


def main() -> int:
    rendered = render()
    if "--check" in sys.argv:
        current = OUT.read_text() if OUT.exists() else ""
        if current != rendered:
            print(
                "edge_not_found.json is out of date with the app.\n"
                "Regenerate it, commit the result, and update the chart's\n"
                "-api-internal route in bluebird-helm to match:\n"
                "    cd backend && python scripts/generate_edge_not_found.py",
                file=sys.stderr,
            )
            return 1
        print("edge_not_found.json is up to date.")
        return 0

    OUT.write_text(rendered)
    print(f"Wrote {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
