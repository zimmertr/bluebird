"""Guardrails on the shared Open-Meteo pipeline (issue #387).

The pipeline's own behavior is covered where it is used: `test_weather.py`
drives the cache, the batching, the index reassembly, the pace narration and
the 429 resume, and `test_air_quality.py` drives the degrade policy and the
first-429 short circuit. What those suites cannot see is the pair of
invariants this module exists to hold, so they are asserted here against the
source itself.
"""

from __future__ import annotations

import inspect
import re
from pathlib import Path

from app.services import openmeteo_fetch

APP_ROOT = Path(__file__).parent.parent / "app"
HOME = APP_ROOT / "services" / "openmeteo_fetch.py"

# Spelled in pieces so this file cannot match itself, the same trick
# test_branding.py uses.
SHARED_CONSTANTS = ["BATCH" + "_SIZE", "MAX_CONCURRENT" + "_BATCHES"]


def test_the_batch_constants_are_declared_once():
    """Both services fan out on one batch size, not on a copy of one.

    `air_quality.py` used to re-declare both with a comment pointing at the
    weather service's originals, which is how the measured 50 (#182) could have
    been changed in one place and left in the other.
    """
    for name in SHARED_CONSTANTS:
        declaration = re.compile(rf"^{name} = ", re.MULTILINE)
        homes = [
            py.relative_to(APP_ROOT.parent)
            for py in sorted(APP_ROOT.rglob("*.py"))
            if declaration.search(py.read_text())
        ]
        assert homes == [HOME.relative_to(APP_ROOT.parent)], (
            f"{name} is declared in {homes}, not only in its shared home"
        )


def test_the_error_policy_has_no_default():
    """A service must say what a failed batch does; it may never inherit one.

    Weather raises and fails the analysis, air quality degrades to null rows.
    Either default would be wrong for one of them, and wrong silently: the
    reader would get a ranking with no weather in it, or the pod would keep
    spending a quota a 429 already refused.
    """
    for fn in (openmeteo_fetch.fetch_batched, openmeteo_fetch.request_openmeteo):
        parameter = inspect.signature(fn).parameters["on_error"]
        assert parameter.default is inspect.Parameter.empty, (
            f"{fn.__name__} gave on_error a default"
        )
        assert parameter.kind is inspect.Parameter.KEYWORD_ONLY, (
            f"{fn.__name__} lets on_error be passed positionally"
        )
