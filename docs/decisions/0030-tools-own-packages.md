# 0030. Tools that need another TypeScript are packages of their own

Verbatim guide text at 971fede, copied before the edit to the template.

## From `CLAUDE.md`, line 67

The generator itself lives in `frontend/tools/api-types`, a private package of its own with its own lockfile, and the two frontend scripts do nothing but delegate to it. It cannot be a devDependency of `frontend/package.json`: `openapi-typescript` loads the TypeScript compiler API at run time and peers on `^5.x`, the app runs TypeScript 7, and npm resolves one version of a peer. A package rather than a version string in a script, because Dependabot reads manifests and bumps nothing it cannot see. `frontend`'s own `npm ci` does not install it; `generate:api`/`check:api` install it when they run, which is why the image build context excludes `frontend/tools/`.

## From `CLAUDE.md`, line 63

ESLint is a package apart from `frontend/package.json` because typescript-eslint refuses TypeScript 7, which is the app's version.
