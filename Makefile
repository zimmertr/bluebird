# One target per check CI runs, each the Docker command docs/DEVELOPMENT.md
# shows, so nothing needs installing on the host. Every container mounts the
# repo ROOT: the browser suite reads the manifests under backend/tests/data/,
# one backend test reads frontend/src, and a bare frontend/ mount lets Tailwind
# scan a stale dist/.

# The Node major lives in .node-version alone. CI reads it through setup-node,
# and a backend test fails when the Dockerfile's base image disagrees with it.
NODE_IMAGE := node:$(shell cat .node-version)-alpine
PYTHON_IMAGE := python:3.14-slim
# Pinned because ruff's default rule set changes between releases.
RUFF_VERSION := 0.16.0

.PHONY: typecheck lint-frontend test-frontend check-api test-backend check-openapi typecheck-backend lint-backend lighthouse

typecheck:
	docker run --rm -v "$(CURDIR)":/repo -w /repo/frontend $(NODE_IMAGE) sh -c "npm ci && npx tsc --noEmit"

lint-frontend:
	docker run --rm -v "$(CURDIR)":/repo -w /repo/frontend $(NODE_IMAGE) sh -c "npm run lint"

test-frontend:
	docker run --rm -v "$(CURDIR)":/repo -w /repo/frontend $(NODE_IMAGE) sh -c "npm ci && npm test"

check-api:
	docker run --rm -v "$(CURDIR)":/repo -w /repo/frontend $(NODE_IMAGE) sh -c "npm run check:api"

test-backend:
	docker run --rm -v "$(CURDIR)":/repo -w /repo/backend $(PYTHON_IMAGE) sh -c "pip install -r requirements-dev.txt && pytest"

check-openapi:
	docker run --rm -v "$(CURDIR)":/repo -w /repo/backend $(PYTHON_IMAGE) sh -c "pip install -r requirements-dev.txt && python scripts/generate_openapi.py --check"

# The app's dependencies install too: the pydantic plugin and the FastAPI
# signatures mypy checks against come from them.
typecheck-backend:
	docker run --rm -v "$(CURDIR)":/repo -w /repo/backend $(PYTHON_IMAGE) sh -c "pip install -r requirements-dev.txt && mypy app"

# From the repo root, which is what CI does; backend/ruff.toml makes the
# import order the same from either directory.
lint-backend:
	docker run --rm -v "$(CURDIR)":/repo -w /repo $(PYTHON_IMAGE) sh -c "pip install ruff==$(RUFF_VERSION) && ruff check backend/"

# The one target that is several commands: the audit needs a built image
# serving on a network that a Chromium container can reach. A failed audit
# leaves lh-target running; `docker rm -f lh-target` clears it.
lighthouse:
	docker build -t bluebird:lh .
	-docker network create lh-net
	docker run -d --rm --name lh-target --network lh-net bluebird:lh
	docker run --rm --network lh-net -v "$(CURDIR)":/repo -w /repo -e CHROME_PATH=/usr/bin/chromium-browser --entrypoint sh zenika/alpine-chrome:with-node -c "npx -y @lhci/cli@0.15.x autorun --config=.github/lighthouserc.js --collect.url=http://lh-target:8000/"
	docker rm -f lh-target
