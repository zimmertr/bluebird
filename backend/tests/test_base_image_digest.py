"""The base images are pinned by digest.

A digest is the image, a tag is whatever was pushed last (#632). The one check
here no maintained linter made on 2026-11-06: not hadolint, Trivy 0.69.1,
Checkov 3 or frizbee 0.1.11 (record 0279).
"""

from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).parents[2]


def test_the_base_images_are_pinned_by_digest():
    path = REPO / "Dockerfile"
    froms = re.findall(r"^FROM (?:--\S+ )*(\S+)", path.read_text(), re.MULTILINE)
    assert froms
    # tag@digest, so the tag stays readable (and test_node_version.py can read
    # the Node major off it) while the digest decides what is pulled.
    assert [f for f in froms if not re.fullmatch(r"[\w./-]+:[\w.-]+@sha256:[0-9a-f]{64}", f)] == []
