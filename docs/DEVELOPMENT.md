# Local Development

Run the backend and frontend separately when you want hot-reload.

Backend:

```bash
cd backend
pip install -r requirements.txt
LOG_LEVEL=TRACE uvicorn app.main:app --reload --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

The Vite dev server comes up on `http://localhost:5173` and proxies `/api` requests to the backend on `:8000`.

## Tests and Checks

CI runs all of these on every PR, so run the ones your change touches first:

```bash
# Frontend typecheck
cd frontend && npx tsc --noEmit

# Frontend unit tests (Vitest)
docker run --rm -v "$PWD/frontend":/app -w /app node:22-alpine \
  sh -c "npm ci && npm test"

# Backend unit tests (pytest)
docker run --rm -v "$PWD/backend":/app -w /app python:3.14-slim \
  sh -c "pip install -r requirements-dev.txt && pytest"

# Backend lint
pip install ruff && ruff check backend/
```

Two rules worth knowing before you send a change: any behavior change ships with
a matching test in the same PR, and any change to a route or Pydantic model
regenerates the committed OpenAPI snapshot with
`cd backend && python scripts/generate_openapi.py` (CI fails the PR otherwise).
