"""Regenerate the committed manifest of the constants the browser mirrors.

The browser reimplements enough of the backend that the same numbers are
spelled twice, once per language, and a "port of" comment was the only thing
holding each pair together. That held until it did not: `N_VARIABLES` and the
browser's hourly variable list disagreed for a release, and both sides read
plausibly on their own (issue #380).

This manifest is the same contract `weather_vectors.json` carries for the
aggregation, narrowed to the values a vector cannot express: the backend is
the reference, the committed file is the answer, and BOTH suites read this
one file — pytest proves Python still produces it (so a change to a constant
forces a regeneration, making the pair's other half a visible part of the
review) and Vitest proves the TypeScript copies match it.

Formulas stay out of it. A weight formula or an aggregation is pinned by the
vectors, which exercise it; this file holds only values and the one shared
sentence, which no vector reaches.

Run:
    cd backend && python scripts/generate_mirrored_constants.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from app.models import (
    ARCHIVE_STRADDLE_DAYS,
    DEFAULT_FORECAST_MODEL,
    FUTURE_LIMIT_SLACK_DAYS,
    MAX_ANALYZE_PEAKS,
    MODEL_INFO,
    PAST_DATA_DAYS,
    PAST_LIMIT_SLACK_DAYS,
)
from app.services.nifc import COARSE_OFFSET_DEG
from app.services.weather import (
    BATCH_SIZE,
    MAX_CONCURRENT_BATCHES,
    N_VARIABLES,
    _coverage_message,
)

OUT = Path(__file__).parent.parent / "tests" / "data" / "mirrored_constants.json"


def _coverage_template() -> str:
    """`_coverage_message` with the model's own label back out of it.

    The sentence is composed per model on both sides, so the label is the one
    part that is not shared. Taking it out here leaves the half that is.
    """
    label = MODEL_INFO[DEFAULT_FORECAST_MODEL].label
    return _coverage_message(DEFAULT_FORECAST_MODEL).replace(label, "{label}", 1)


def render() -> str:
    out = {
        "_generated_by": (
            "backend/scripts/generate_mirrored_constants.py — do not hand-edit"
        ),
        "constants": {
            "N_VARIABLES": N_VARIABLES,
            "MAX_ANALYZE_PEAKS": MAX_ANALYZE_PEAKS,
            "COARSE_OFFSET_DEG": COARSE_OFFSET_DEG,
            "PAST_DATA_DAYS": PAST_DATA_DAYS,
            "PAST_LIMIT_SLACK_DAYS": PAST_LIMIT_SLACK_DAYS,
            "FUTURE_LIMIT_SLACK_DAYS": FUTURE_LIMIT_SLACK_DAYS,
            "ARCHIVE_STRADDLE_DAYS": ARCHIVE_STRADDLE_DAYS,
            # The air-quality service spells both of these too, and defers to
            # the weather service's reasoning in a comment, so the weather
            # service is the one reference here (issue #434).
            "BATCH_SIZE": BATCH_SIZE,
            "MAX_CONCURRENT_BATCHES": MAX_CONCURRENT_BATCHES,
        },
        "strings": {"model_coverage_message": _coverage_template()},
    }
    return json.dumps(out, indent=2) + "\n"


def main() -> None:
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(render())
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
