# 0080. A major version comes from the PR title's `!` alone, and a body footer never counts

- Status: Accepted
- Date: 2026-10-01
- Decider: the maintainer (TJ), on issue #562 (any conventional-commit title with `!` cuts a major, in both repositories; a PR check rejects a title the pipeline cannot read; the tag step becomes retryable; body footers do not count); and, the same day, that the chart goes to 1.0 with the app
- Issues and PRs: #562, #600, zimmertr/bluebird-helm#283
- Cited in code as: #562
- Guide: root [`CLAUDE.md`](../../CLAUDE.md), CI/CD pipeline; [`docs/CICD.md`](../CICD.md), Conventions

## Context

A squash merge makes the PR title the commit's first line and the PR body the rest (both repositories set `squash_merge_commit_title: PR_TITLE` and `squash_merge_commit_message: PR_BODY`). GitVersion picks the bump from three patterns in `GitVersion.yml`. The major pattern was `^(feat!|BREAKING CHANGE:)`, so only the exact title `feat!: ...` cut a major: `feat(api)!:`, `fix!:` and every other breaking title released a patch. The Round 5 readiness review (2026-10-01) found it before 1.0.0, when a wrong guess in either direction cannot be withdrawn: Docker Hub tag immutability and GitHub immutable releases are on.

The issue's candidate pattern, `(?m)^([a-z]+(\(.+\))?!:|BREAKING CHANGE:)`, widened the title and also let any body line count, because `(?m)` makes `^` match at every line.

## Decision

Only the title decides the bump. Any listed type, with or without a scope, followed by `!` before the colon is a major. A `BREAKING CHANGE:` footer, or any other body line, changes nothing. A title that starts `BREAKING CHANGE:` names no type, so it is not read either, and the PR Title check refuses it: there is one way to write a major, and it is in the title where the reviewer and the merge button both show it.

The patterns, identical in both repositories:

- major `^(feat|fix|perf|refactor|chore|docs|style|test|ci|build)(\([^)\r\n]+\))?!:`
- minor `^feat(\([^)\r\n]+\))?:`
- patch `^(fix|perf|refactor|chore|docs|style|test|ci|build)(\([^)\r\n]+\))?:`

No `(?m)`, so `^` is the start of the message. The scope is `[^)\r\n]+`, because `.+` runs past the scope's own `)` and reads `fix(ui): explain feat(api)!: titles` as a major. The major takes the same type list as the other two, so the check and the engine agree on exactly which titles are read. `build` joins the patch list for Dependabot's `build(deps):` titles, which already released a patch through the branch's default increment.

## Evidence

GitVersion 6.8.2 (the version both repositories' `6.x` setup resolves, read from the release logs of 2026-10-01) in Docker, one synthetic squash commit on top of `origin/main` per row, in a throwaway clone. Columns: the old pattern, the issue's candidate, this decision. On bluebird, with `origin/main` at 3ac47c0 (v0.92.2):

| Squash message (`/` is a line break) | Old | Candidate | Decided |
|---|---|---|---|
| `feat!: x` | 1.0.0 | 1.0.0 | 1.0.0 |
| `feat(api)!: x` | 0.92.3 | 1.0.0 | 1.0.0 |
| `fix!: x` | 0.92.3 | 1.0.0 | 1.0.0 |
| `fix(ui)!: x` | 0.92.3 | 1.0.0 | 1.0.0 |
| `chore!: x` | 0.92.3 | 1.0.0 | 1.0.0 |
| `Fix!: x` | 0.92.3 | 1.0.0 | 1.0.0 |
| `feat: x` | 0.93.0 | 0.93.0 | 0.93.0 |
| `fix: x` | 0.92.3 | 0.92.3 | 0.92.3 |
| `feat: x / / BREAKING CHANGE: y` | 0.93.0 | 1.0.0 | 0.93.0 |
| `feat: x / / Some prose. / / fix!: y` | 0.93.0 | 1.0.0 | 0.93.0 |
| `fix: stop the crash!` | 0.92.3 | 0.92.3 | 0.92.3 |
| `fix: handle feat!: in titles` | 0.92.3 | 0.92.3 | 0.92.3 |
| `fix(ui): explain feat(api)!: titles` | 0.92.3 | 1.0.0 | 0.92.3 |
| `BREAKING CHANGE: x` | 1.0.0 | 1.0.0 | 0.92.3 |
| `Merge pull request #999 from zimmertr/topic` | 0.92.3 | 0.92.3 | 0.92.3 |

GitVersion matches without regard to case (`Feat: x` is a minor under every column), which is why `Fix!:` is a major. The full tables, both repositories, are in the two PRs. `backend/tests/test_release_titles.py` holds the same rows against the patterns through the check's own code.

### The chart's 1.0.0 (added 2026-10-01)

The maintainer decided the same day that the chart goes to 1.0 with the app ("Yes", answering the open question on the PRs). No pattern or workflow changes for it: the chart's 1.0.0 comes from a chart PR whose title carries `!`, merged after the app's 1.0.0. The automatic appVersion PR is titled `chore(release): bump chart appVersion to <semver>` and releases a chart patch on its own. Each sequence below lands its titles in turn on bluebird-helm's `origin/main` (d26a9d8, v0.15.21) with this decision's patterns, GitVersion 6.8.2, and tags each result before the next commit the way the release workflow does. The patch numbers move with whatever merges first.

| Order | First title merged | Chart version | Second title merged | Chart version |
|---|---|---|---|---|
| App first (the one to use) | `chore(release): bump chart appVersion to 1.0.0` | 0.15.22 | `chore!: cut chart 1.0.0 with app 1.0.0` | 1.0.0 |
| Chart first | `chore!: cut chart 1.0.0 with app 1.0.0` | 1.0.0 | `chore(release): bump chart appVersion to 1.0.0` | 1.0.1 |

Chart first also gives chart 1.0.0 the newest pre-1.0 app as its `appVersion`, because the chart workflow resolves `appVersion` from the app's latest release when it packages. A third path, retitling the automatic PR to `chore(release)!:`, gives 1.0.0 in one release in the engine, but that PR arms auto-merge when it opens, so a hand edit races its merge. `docs/CICD.md` (Conventions) has the steps.

## Alternatives rejected

- The issue's candidate with `(?m)`: a body is free prose, and `BREAKING CHANGE:` or `feat!:` at the start of any line of it would cut 1.0.0 from a PR whose title says `fix:`. The title is what the reviewer reads before merging; the body is not.
- Keeping `^BREAKING CHANGE:` as a title form: the Conventional Commits specification uses it only as a footer, the title check would have to accept a second way to write a major, and no PR here has ever used it.
- `[a-z]+` for the type in the major pattern: it makes a major of a title the check refuses (`wip!:`), so the engine and the check would disagree about one title in exactly the case that cannot be undone.

## Consequences

A breaking change must say `!` in its title. A footer is still fine to write, and is read by people, not by the pipeline. The PR Title check (`pr-title.yml`, both repositories) reads these patterns from `GitVersion.yml` and fails a title none of them reads; it is not a required check until the maintainer adds it to branch protection. A new type means adding it to the major and patch (or minor) lists together, and `test_every_type_the_pipeline_reads_can_be_marked_breaking` fails otherwise.
