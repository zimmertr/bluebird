"""Regenerate (or verify) the committed OpenAPI snapshot.

    python scripts/generate_openapi.py            # rewrite openapi.json
    python scripts/generate_openapi.py --check     # fail if it is stale

The snapshot is committed so that a change to the API surfaces as a reviewable
diff instead of hiding inside Python, and so a PR that alters the contract
without regenerating it fails CI rather than shipping a schema that lies.
"""

import json
import os
import sys
from pathlib import Path

# info.version is read from the build environment, so it has to be pinned before
# the app is imported. Left alone, the snapshot would encode whichever release
# happened to be in the environment and every later build would register as
# drift. CI must invoke this the same way, which it does by calling this script
# rather than reimplementing the comparison.
for _var in ("APP_VERSION", "APP_COMMIT", "APP_BUILT_AT"):
    os.environ[_var] = "dev"

BACKEND_DIR = Path(__file__).resolve().parent.parent
SNAPSHOT = BACKEND_DIR / "openapi.json"

# Lets the script run from any working directory, not just backend/.
sys.path.insert(0, str(BACKEND_DIR))

from app.main import app


def render() -> str:
    # sort_keys because dict ordering follows route registration order, which is
    # an implementation detail; sorting keeps the diff to real contract changes.
    return json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n"


def main() -> int:
    rendered = render()
    if "--check" in sys.argv:
        current = SNAPSHOT.read_text() if SNAPSHOT.exists() else ""
        if current != rendered:
            print(
                "openapi.json is out of date with the app.\n"
                "Regenerate it and commit the result:\n"
                "    cd backend && python scripts/generate_openapi.py",
                file=sys.stderr,
            )
            return 1
        print("openapi.json is up to date.")
        return 0

    SNAPSHOT.write_text(rendered)
    print(f"Wrote {SNAPSHOT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
