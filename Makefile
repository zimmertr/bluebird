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
# Must match @playwright/test in frontend/e2e/package.json: each release pins
# its own Chromium build, and the image carries the build for its own version.
PLAYWRIGHT_IMAGE := mcr.microsoft.com/playwright:v1.63.0-noble

.PHONY: typecheck lint-frontend test-frontend check-api test-backend check-openapi typecheck-backend lint-backend lighthouse browser

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

# The browser suite, shaped like the audit above: the built image serving on a
# network, and the pinned Playwright image driving it. A failed run leaves
# e2e-target running; `docker rm -f e2e-target` clears it.
browser:
	docker build -t bluebird:e2e .
	-docker network create e2e-net
	docker run -d --rm --name e2e-target --network e2e-net bluebird:e2e
	docker run --rm --network e2e-net --ipc=host -v "$(CURDIR)":/repo -w /repo/frontend/e2e -e BASE_URL=http://e2e-target:8000 $(PLAYWRIGHT_IMAGE) sh -c "npm ci && npx playwright test"
	docker rm -f e2e-target
