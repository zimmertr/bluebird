"""Every source module is named in CLAUDE.md (#392).

CLAUDE.md is the guide a session reads before it writes anything, and its two
layout lists are what say where a decision already lives. A module the guide
never names is a module the next session rediscovers from scratch, and then
re-decides: when #392 was filed, 46 of the 122 source files were in that state,
the map component among them.

This check lives in the backend suite although half of what it reads is the
frontend, and that is a mount rather than a preference. `docs/DEVELOPMENT.md`
runs Vitest with `frontend/` alone mounted at `/app`, so a Vitest test can see
neither `CLAUDE.md` nor `backend/app`; pytest is handed the whole repository at
`/repo`. That is the same reason `test_security_headers.py` reads `frontend/src`
from here, and the same mount that leaves the weather vectors committed twice
(see the `vectors` job in `pr.yml`).

A name counts when the BASENAME WITH ITS EXTENSION appears anywhere in the
guide: `MapView.tsx`, `errors.py`. A bare stem is not a match, because
`present` and `calendar` are words the guide uses as words. Anywhere rather
than in a bullet, because several modules are named in the prose above the
lists and a rule that demanded a bullet would ask for those sentences twice.
Two files may share a basename (`app/version.py` and `app/routes/version.py`),
and one mention then answers for both; the guide names each of that pair today,
and a basename rule is what keeps the check independent of where a file sits.
"""

from __future__ import annotations

from pathlib import Path

import pytest

_REPO = Path(__file__).parents[2]
_GUIDE = _REPO / "CLAUDE.md"
_FRONTEND_SRC = _REPO / "frontend" / "src"
_BACKEND_APP = _REPO / "backend" / "app"

_SUFFIXES: dict[Path, tuple[str, ...]] = {
    # `.css` is here because a stylesheet decides things too: `map.css` wraps the
    # vendor stylesheet in `layer(base)` and lifts MapLibre's own corners, which
    # is a decision the guide has to carry like any other.
    _FRONTEND_SRC: (".ts", ".tsx", ".css"),
    _BACKEND_APP: (".py",),
}

# Modules that carry no decision of their own, so a bullet could only repeat
# what the component they mount, or the tool that wrote them, already says.
# Each entry carries its reason; an entry with no live file fails below, so a
# deleted module cannot leave its exemption behind for the next file to inherit.
ALLOWED: dict[str, str] = {
    # Empty by construction. What the packages hold is named module by module.
    "__init__.py": "an empty package marker, not a module",
    # The four entries `frontend/vite.config.ts` names. Each is ten lines of
    # createRoot().render(); the component it mounts holds the decisions and is
    # named in the guide.
    "main.tsx": "a Vite entry: it mounts App and nothing else",
    "notfound.tsx": "a Vite entry: it mounts NotFoundPage and nothing else",
    "privacy.tsx": "a Vite entry: it mounts PrivacyPage and nothing else",
    "terms.tsx": "a Vite entry: it mounts TermsPage and nothing else",
    # Declarations rather than code.
    "vite-env.d.ts": "one /// <reference> line for Vite's own client types",
    "api-schema.d.ts": "generated from backend/openapi.json by `npm run generate:api`",
}


def _modules(tree: Path) -> list[Path]:
    """Every source module under `tree`, test files excluded.

    A suite is read through the thing it tests: the guide names a behavior and
    points at the test that pins it, so a rule demanding a line per test file
    would ask for a second index of the same facts.
    """
    return sorted(
        p
        for p in tree.rglob("*")
        if p.is_file()
        and p.suffix in _SUFFIXES[tree]
        and not p.name.endswith((".test.ts", ".test.tsx"))
    )


def _unnamed(tree: Path, guide: str) -> list[str]:
    return [
        str(p.relative_to(_REPO))
        for p in _modules(tree)
        if p.name not in ALLOWED and p.name not in guide
    ]


_needs_guide = pytest.mark.skipif(
    not _GUIDE.is_file(),
    reason="CLAUDE.md is not mounted; CI runs pytest from the repo root",
)
_needs_frontend = pytest.mark.skipif(
    not _FRONTEND_SRC.is_dir(),
    reason="frontend sources are not mounted; CI runs pytest from the repo root",
)


@_needs_guide
def test_every_backend_module_is_named():
    unnamed = _unnamed(_BACKEND_APP, _GUIDE.read_text())
    assert not unnamed, (
        "CLAUDE.md names none of these. Add a bullet to its Backend layout list "
        "saying what each owns and why it is separate: " + ", ".join(unnamed)
    )


@_needs_guide
@_needs_frontend
def test_every_frontend_module_is_named():
    unnamed = _unnamed(_FRONTEND_SRC, _GUIDE.read_text())
    assert not unnamed, (
        "CLAUDE.md names none of these. Add a bullet to its Frontend layout "
        "list saying what each owns and why it is separate: " + ", ".join(unnamed)
    )


def test_the_check_reads_the_trees_it_claims_to_read():
    """A walk that found nothing would pass the two assertions above in silence.

    The frontend half already skips where its tree is absent, so an emptied
    walk is the failure mode this file is most exposed to.
    """
    backend = {p.name for p in _modules(_BACKEND_APP)}
    # `__init__.py` proves the walk does not filter ahead of the allowlist:
    # the exemption is what excuses it, not the traversal.
    assert {"main.py", "osm.py", "__init__.py"} <= backend
    if _FRONTEND_SRC.is_dir():
        frontend = {p.name for p in _modules(_FRONTEND_SRC)}
        # `map.css` is the canary for the third suffix: a typo in the tuple
        # would drop the stylesheets and this walk would still look healthy.
        assert {"App.tsx", "MapView.tsx", "map.css"} <= frontend
        assert "App.test.ts" not in frontend


@_needs_frontend
def test_no_allowlist_entry_outlives_its_file():
    """Basenames get reused, so an exemption must not outlive what earned it.

    A second `main.tsx` under another directory would inherit this one in
    silence, and a reason written for a deleted file is no reason at all.
    """
    live = {p.name for tree in _SUFFIXES for p in _modules(tree)}
    stale = sorted(name for name in ALLOWED if name not in live)
    assert not stale, f"allowlist entries with no matching file: {stale}"
