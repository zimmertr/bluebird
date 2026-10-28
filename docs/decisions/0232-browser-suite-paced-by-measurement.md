# 0232. The browser job runs the motion specs alone after the rest, installs Chromium alone, loads the image from an artifact, and every PR job times out at 15 minutes

- Status: Accepted
- Date: 2026-10-28
- Decider: the maintainer (TJ), who set the rules on #794 (no retries, one flat timeout, the check names stay, and the winner is the variant with the lower p90 and no flakes), and the measurement, which chose within them
- Issues and PRs: #794, #805, #412, #368, #793
- Cited in code as: #794
- Guide: [`docs/CICD.md`](../CICD.md), The pull request path; the comments on the browser, Lighthouse and Docker Build jobs in `.github/workflows/pr.yml` and at the top of `frontend/e2e/playwright.config.ts`

## Context

`Browser Smoke & Axe` set the pace of every pull request. Over 150 runs from 2026-10-15 to 2026-10-22 it took 177 s median and 389 s at most, and the whole run 251 s median against 147 s on 2026-09-15, before the job existed. It ran 85 tests on one worker, ran `npx playwright install --with-deps chromium`, which called apt on every run, and rebuilt the image from the Actions cache that `Docker Build` had just filled. On 2026-10-22 apt waited 588 s on a slow mirror (job 120075136268). No job in `pr.yml` set a timeout, so a hung step could hold its runner for GitHub's 360-minute default.

## Decision

- **The motion specs run alone, after the rest.** `playwright.config.ts` has two projects: `motion`, which is `panelMotion`, `centring`, `chartTap` and `rowTap`, and `chromium`, which is every other spec. `npm test` runs `chromium` on four workers and then `motion` on one, joined by `&&`. `retries` stays 0.
- **Chromium alone.** The browser job runs `npx playwright install chromium`, with no `--with-deps`, on the plain runner, from the cached browser folder.
- **The image arrives as an artifact.** `Docker Build` saves the image it built and uploads it (`compression-level: 1`, kept one day). `Browser Smoke & Axe` and `Lighthouse Budgets` download it and `docker load` it, with no buildx and no second build.
- **One timeout.** Every job in `pr.yml` sets `timeout-minutes: 15`.

## Evidence

A temporary matrix job in PR #805 ran the suite ten times per variant: run 40623715965 on 2026-10-27, run 40626408663 the same day, and run 40733848241 on 2026-10-28. Times are medians unless marked.

- Workers, with every spec in one invocation: one worker 192 s, 0 flakes in ten; two workers 158 s, 2 flakes; four workers 143 s, 7 to 8 flakes, under every install route. Every failure was in `centring.spec.ts` (20 of 24 red jobs), `panelMotion.spec.ts` or `chartTap.spec.ts`, each of which reads layout while it moves.
- Workers, with those three on one worker after the rest (run 40626408663): two workers 0 flakes, the rest 132 s and the motion specs 52 s; four workers 1 flake, the rest 100 s and the motion specs 47 s. The flake was `rowTap.spec.ts`, which taps a card while the phone sheet lowers, so it joined `motion`.
- Workers, with all four motion specs on one worker after the rest (run 40733848241): two workers 0 flakes, the rest 126 s, 184 s with the motion specs (190 s p90); four workers 0 flakes, the rest 115 s, 173 s with the motion specs (176 s p90). Four won, by the issue's rule of no flakes in ten and the lower p90.
- The whole browser job in the final shape: 200 s median and 207 s p90 over those ten four-worker runs, against 260 s and 277 s on one worker with apt and the cache replay (run 40623715965). The 150-run median of 177 s ran a smaller suite for most of its window.
- Install: `--with-deps` 19 s (38 s p90, 47 s max); Chromium alone 1 s (1 s p90, 8 s max); a pull of the pinned Playwright image 29 s (31 s p90, 34 s max). No flakes on one worker under any of them. `popupFit.spec.ts` and `scaleBar.spec.ts`, which measure text width, passed in all ten runs without the fonts apt installs.
- Hand-off: `setup-buildx` 7 s and the cached build 9 s, 16 s together (22 s p90); the artifact's download 2 s and `docker load` 4 s, 6 s together (9 s p90). `Docker Build` pays 1 s to save and 3 s to upload a 50 MB artifact.
- The suite's own time moved about 30 s between batches of one configuration (one worker, the same install: 192 s in one batch, 222 s in another), so a smaller difference is noise.
- Timeout: the slowest job in the 150 runs took 389 s, so 15 minutes is over twice it.

## Alternatives rejected

- **Four workers for everything.** 7 to 8 flakes in ten. A retry would hide them, and `retries: 0` exists so this job shows a flake.
- **A matrix or shards.** Each shard reports as `Browser Smoke & Axe (1)`, and branch protection matches the name exactly.
- **The Playwright image in CI.** No apt step and the same image `make browser` uses, but its pull took 29 s against 1 s for Chromium alone, with no fewer flakes.
- **Keep `--with-deps`.** It installs fonts no spec needed, and on a slow mirror it took minutes.
- **Drop `needs: docker-build` and build in each job.** Not measured. It builds the image three times in parallel, triples the cache writes, and builds cold whenever a PR changes the frontend.
- **A timeout per job.** One number is easier to keep true, and a per-job p90 would move as the jobs do.

## Consequences

- A spec that reads layout mid-move and flakes under load joins `MOTION` in `playwright.config.ts`. The motion specs add about 50 s on one worker after the rest.
- A runner image that drops a library Chromium needs fails the job at launch. Adding `--with-deps` back fixes it.
- A Playwright bump moves `make browser`'s image too: the `Makefile` reads the version off `frontend/e2e/package.json`.
- A job that hangs fails after 15 minutes and needs a re-run by hand.
- The artifact costs 50 MB of Actions storage per run, for one day.
