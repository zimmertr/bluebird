"""Append the installed Python packages' license texts to the image's notice file.

    python write_third_party_licenses.py static/third-party-licenses.txt

The image build runs this in its second stage, after `pip install`, from a bind
mount, so the script itself never lands in the image (#571). The first stage
wrote the npm half of the same file (`frontend/plugins/thirdPartyLicenses.ts`);
this appends one block per installed distribution, the pod serves the result at
`/third-party-licenses.txt`, and a copy of the image carries it.

The list is every distribution the interpreter can see, not requirements.txt:
the image ships uvicorn's and FastAPI's own dependencies, and pip, and none of
those is named there. The texts are what each wheel installed under its
`.dist-info` (PEP 639's `licenses/` directory, or a LICENSE at its root for an
older wheel), found through the RECORD rather than the `License-File` header,
because httpx 0.28.1 ships its text with no header naming it.

A distribution with no license text fails the build. Writing the file without
it would hand out an incomplete notice that looks complete.

Standard library only: it runs in the runtime image, where nothing else is
installed but the app's own requirements.
"""

from __future__ import annotations

import re
import sys
from collections.abc import Iterable
from dataclasses import dataclass
from importlib.metadata import Distribution, distributions

HEADING = "Python packages"
RULE = "=" * 78

# LICENSE, LICENCE, COPYING, NOTICE and AUTHORS at the .dist-info root, for a
# wheel older than PEP 639; everything under licenses/ counts for a newer one.
_ROOT_LICENSE = re.compile(r"^(licen[cs]e|copying|notice|authors)([.-]|$)", re.IGNORECASE)


@dataclass(frozen=True)
class Notice:
    name: str
    version: str
    license: str
    texts: tuple[tuple[str, str], ...]


def _license_name(dist: Distribution) -> str:
    meta = dist.metadata
    expression = meta.get("License-Expression")
    if expression:
        return expression
    # The free-text field holds a whole license text in some older wheels, so
    # only a one-line value is a name.
    legacy = (meta.get("License") or "").strip()
    if legacy and "\n" not in legacy:
        return legacy
    classifiers = [c.rsplit(" :: ", 1)[-1] for c in meta.get_all("Classifier") or [] if c.startswith("License ::")]
    return " AND ".join(classifiers) or "unstated"


def _license_texts(dist: Distribution) -> tuple[tuple[str, str], ...]:
    texts = []
    for path in dist.files or []:
        parts = path.parts
        if len(parts) < 2 or not parts[0].endswith(".dist-info"):
            continue
        if parts[1] == "licenses" or (len(parts) == 2 and _ROOT_LICENSE.match(parts[1])):
            texts.append(("/".join(parts[1:]), path.read_text(encoding="utf-8").strip()))
    return tuple(sorted(texts))


def collect(dists: Iterable[Distribution]) -> list[Notice]:
    """One notice per distribution, sorted by name. Raises when any has no text."""
    seen: dict[str, Notice] = {}
    missing = []
    for dist in dists:
        name = dist.metadata["Name"]
        key = re.sub(r"[-_.]+", "-", name).lower()
        if key in seen:
            continue
        texts = _license_texts(dist)
        if not texts:
            missing.append(f"{name} {dist.version}")
            continue
        seen[key] = Notice(name, dist.version, _license_name(dist), texts)
    if missing:
        raise SystemExit(
            "These installed packages ship no license text, so the image's notice cannot carry it: "
            + ", ".join(sorted(missing))
        )
    return sorted(seen.values(), key=lambda n: n.name.lower())


def render(notices: list[Notice]) -> str:
    blocks = []
    for n in notices:
        body = "\n\n".join(
            f"--- {file} ---\n\n{text}" if len(n.texts) > 1 else text for file, text in n.texts
        )
        blocks.append(f"{RULE}\n{n.name} {n.version}\nLicense: {n.license}\n{RULE}\n\n{body}\n")
    return f"{HEADING}\n{'#' * len(HEADING)}\n\n" + "\n".join(blocks)


def main(argv: list[str]) -> None:
    if len(argv) != 2:
        raise SystemExit(f"usage: {argv[0]} <notice file to append to>")
    text = render(collect(distributions()))
    with open(argv[1], "a", encoding="utf-8") as out:
        out.write("\n" + text)


if __name__ == "__main__":
    main(sys.argv)
