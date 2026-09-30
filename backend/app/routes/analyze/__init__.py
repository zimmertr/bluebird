"""The two analyze routes and the analysis they present.

`route.py` holds the routes and `_run_analysis`, `events.py` what an analysis
yields, and `sse.py` how the stream renders it. This file holds no code. It
re-exports the two names other modules import, `router` for `main.py` and
`API_KEY_HEADER` for `/api/capabilities`, and nothing else: a test imports any
other name from the module that defines it, so a patch lands where the code
reads the name.
"""

from app.routes.analyze.route import API_KEY_HEADER, router

__all__ = ["API_KEY_HEADER", "router"]
