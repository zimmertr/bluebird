# 0275. The ESLint tools override minimatch to 11, ahead of the packages that use it

- Status: Superseded in part by 0279
- Date: 2026-11-05
- Decider: the maintainer (TJ), 2026-11-05, on Dependabot alert 30: "Yes, troubleshoot and raise a PR"
- Issues and PRs: this PR, Dependabot alert 30 (GHSA-g3hv-75wg-m249, CVE-2026-118764)
- Cited in code as: `backend/tests/test_dependency_lock.py`
- Guide: [`docs/CICD.md`](../CICD.md), the ESLint step of the frontend job

## Context

Dependabot alert 30 is a moderate denial of service in `minimatch` from 7.0.0 up to but not including 11.0.1: a glob pattern can make its preprocessing grow quadratically. Only 11.0.1 fixes it. `frontend/tools/eslint` locked 10.2.6, pulled in by `eslint`, `@eslint/config-array` and `@typescript-eslint/typescript-estree`, and all three ask for `^10`, so no update of theirs can reach the fix. Their latest releases on 2026-11-05 (eslint 10.14.0, config-array 0.23.5, typescript-estree 8.72.1) still ask for `^10`. No other lockfile holds an affected version: `tools/api-types` locks 5.1.9, below the range, and the other three lock none.

## Decision

`frontend/tools/eslint/package.json` overrides `minimatch` to `^11.0.1`, and the lock holds 11.0.3. `backend/tests/test_dependency_lock.py` holds the lock inside the override, and fails once every package that needs `minimatch` asks for `^11` itself, so the override is dropped when it stops doing anything.

## Evidence

All on 2026-11-05.

- The flaw is only reachable at `optimizationLevel` 2 or higher, with a pattern an attacker writes. None of the three parents sets `optimizationLevel` (the default is 1), and every pattern they see comes from this repo's ESLint config or the `lint` script. So the alert was not exploitable here; the override clears it so it doesn't train anyone to ignore the Security tab.
- The three parents call only `new Minimatch(pattern, { dot: true })`, `.match(path)`, `.match(path, true)`, `.pattern` and `minimatch(path, pattern, { dot: true })`, read from their published sources. 11.0 removes `makeRe()`, `Minimatch#regexp`, the `AST` class and some internal methods, none of which they use. It also changes how `partial` matching (`.match(path, true)`) treats `**`, which ESLint uses to choose the directories to walk.
- `npm run lint`'s ESLint run, in `node:26-alpine`, before and after: the same 615 files, the same zero messages each, and the same self-test result (12 fixtures, 156 per-file checks over 165 fixtures).
- 11.0.3 rather than 11.0.5: 11.0.5 and `@isaacs/nonrecursive-glob-match` 1.1.0, which 11.x adds, were both published on 2026-11-05. The lock was resolved with `npm install --package-lock-only --before=2026-10-29`, which keeps the seven-day cooldown this directory's Dependabot entry waits. Both new packages are BlueOak-1.0.0, like 10.2.6.

## Alternatives rejected

- Dismissing the alert as "vulnerable code is not used": true today, but it rests on three packages never raising `optimizationLevel`, and nothing would notice if one did.
- Waiting for ESLint and typescript-eslint to move to `^11`: no release date, and the alert stays open meanwhile.
- An exact override (`11.0.3`): Dependabot could not move the lock to a later 11.x fix without a hand edit.

## Consequences

The ESLint tools run a `minimatch` major that their parents haven't tested against. The lint comparison above is the evidence it behaves the same here, and the self-test fails if a ban or a per-file check stops firing. When the parents move to `^11`, `test_each_override_is_still_needed` fails and names the cleanup.
