# 0349. A service worker keeps the last page, and ships switched off

- Status: Proposed, in the reliability PR; accepted when the maintainer approves it and merges it
- Date: 2026-11-25
- Decider: proposed by the reliability plan's mitigation 11 (`docs/RELIABILITY.md`), for the maintainer (TJ)
- Issues and PRs: #1001
- Cited in code as: record 0349
- Guide: [`frontend/src/utils/CLAUDE.md`](../../frontend/src/utils/CLAUDE.md), the `serviceWorker.ts` bullet

## Context

The page and every byte of the app come from the pod, through one Cloudflare tunnel to one house. When the house is down, the edge answers the page with its own `530`, and a returning visitor gets an error page, although the forecasts the app needs come from Open-Meteo directly and a pasted coordinate list needs no pod at all. The plan's full answer is static hosting for the page (`RELIABILITY.md`, In Other Repositories), which needs the release workflow and the Cloudflare zone. A service worker is the part this repository can build alone.

A service worker is also the one mitigation that can add a failure: a cached page that never updates, or one that keeps asking for files a release deleted.

## Decision

`frontend/public/sw.js` keeps one copy of the page and the hashed assets it names, and nothing else:

- The page is asked of the network on every load. The kept copy is served only when the network has no answer, or the edge answers a `5xx` for a pod it cannot reach. A `4xx` is the server's real answer and passes through.
- A hashed asset never changes meaning, so a kept one is served without asking, and every page that arrives drops the assets it no longer names.
- The API, every other page and every other host pass through untouched, so no forecast, limit or count is ever served from the worker.

It ships switched off. `GET /api/config` carries `service_worker`, false unless the deployment sets `SERVICE_WORKER`, and every page load that reads it applies it: on registers the worker, off removes every registration this origin holds. A page that cannot read the config changes nothing, since that is the visit the worker is for. So turning it off is an environment variable and one visit, and a bad worker cannot outlive the next deploy.

## Why off by default

The privacy page lists what the app keeps in the browser, and a worker keeps the page in Cache Storage. Its sentence waits on the maintainer in the PR's strings table, and the switch stays off until it is approved.

## Not built

The last published limits and model list for a visit with the pod unreachable. That is the capabilities' last good copy (mitigation 4), which waits on the same privacy page.
