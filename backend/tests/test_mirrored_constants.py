"""The backend half of the mirrored-constant contract (issue #380).

`tests/data/mirrored_constants.json` is what the browser's copies of these
values are asserted against. This suite fails when the committed file no
longer matches the backend, so changing a constant forces a regeneration
(`python scripts/generate_mirrored_constants.py`) in the same PR — and the
regenerated file drags the TypeScript side along with it, because the
frontend suite reads this same file. Before this existed, a comment was the
whole mechanism and one pair had already drifted.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parent.parent / "scripts"
sys.path.insert(0, str(SCRIPTS))

from generate_mirrored_constants import render  # noqa: E402 — after the sys.path insert above

MANIFEST = Path(__file__).parent / "data" / "mirrored_constants.json"


def test_committed_manifest_matches_the_backend():
    assert json.loads(MANIFEST.read_text()) == json.loads(render()), (
        "backend/tests/data/mirrored_constants.json is stale.\n"
        "Regenerate it:\n"
        "    cd backend && python scripts/generate_mirrored_constants.py"
    )


def test_manifest_is_byte_for_byte_what_the_script_writes():
    # The file says it is generated and not to be hand-edited. Comparing the
    # parsed values alone would let a re-indent or a reordered key stand, and
    # the next regeneration would then land as a diff nobody meant to make.
    assert MANIFEST.read_text() == render()
