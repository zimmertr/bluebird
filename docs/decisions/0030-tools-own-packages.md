# 0030. Tools that need another TypeScript are packages of their own

- Status: Accepted
- Date: 2026-09-14 (git: the merge of #328). #411 did the same for ESLint on 2026-09-17.
- Decider: TJ (git: author and merger of #328)
- Issues and PRs: #154, #328, #379, #411
- Cited in code as: #154, #379
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Rules for every change, "Regenerate the OpenAPI snapshot" and "Style through the design system, never ad hoc"

## Context

The app runs TypeScript 7. `openapi-typescript` loads the TypeScript compiler API at run time and peers on `^5.x`, and typescript-eslint refuses TypeScript 7. npm resolves one version of a peer.

## Decision

The API type generator lives in `frontend/tools/api-types` and ESLint in `frontend/tools/eslint`, each a private package with its own lockfile. The frontend's scripts only delegate to them.

## Evidence

The peer ranges above. No dated measurement.

## Alternatives rejected

- A devDependency of `frontend/package.json`: npm cannot resolve two TypeScripts for one peer.
- A version string in a script: Dependabot reads manifests and bumps nothing it cannot see.

## Consequences

The frontend's own `npm ci` does not install them; `generate:api` and `check:api` install theirs when they run. The image build context excludes `frontend/tools/`.
