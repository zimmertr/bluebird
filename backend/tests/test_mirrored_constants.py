"""The backend half of the mirrored-constant contract (issue #380).

`tests/data/mirrored_constants.json` is what the browser's copies of these
values are asserted against. This suite fails when the committed file no
longer matches the backend, so changing a constant forces a regeneration
(`python scripts/generate_mirrored_constants.py`) in the same PR — and the
frontend copy, CI-diffed against this one, drags the TypeScript side along
with it. Before this existed, a comment was the whole mechanism and one pair
had already drifted.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS))

from generate_mirrored_constants import render

MANIFEST = Path(__file__).parent / "data" / "mirrored_constants.json"


def test_committed_manifest_matches_the_backend():
    assert json.loads(MANIFEST.read_text()) == json.loads(render()), (
        "backend/tests/data/mirrored_constants.json is stale.\n"
        "Regenerate it and copy it to the frontend:\n"
        "    cd backend && python scripts/generate_mirrored_constants.py\n"
        "    cp tests/data/mirrored_constants.json"
        " ../frontend/src/utils/mirrored_constants.json"
    )


def test_manifest_is_byte_for_byte_what_the_script_writes():
    # The CI `mirrors` job diffs the two committed copies as text, so a
    # re-indent on one side alone would fail that job with a diff nobody asked
    # for. Pinning the bytes here keeps that failure in the suite that can
    # explain it.
    assert MANIFEST.read_text() == render()
