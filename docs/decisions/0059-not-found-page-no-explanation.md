# 0059. The 404 page explains nothing

- Status: Accepted
- Date: 2026-07-28 (git: the merge of #173)
- Decider: TJ (git: author and merger of #173)
- Issues and PRs: #173
- Cited in code as: none
- Guide: [`frontend/src/components/CLAUDE.md`](../../frontend/src/components/CLAUDE.md), the `src/components/NotFoundPage.tsx` bullet

## Context

Starlette serves a page for any static path that does not resolve. Before #173 a mistyped URL returned the raw JSON body of an HTTP exception, which reads as a broken site rather than a wrong address.

## Decision

A missed path gets a branded 404 page with a heading, a subtitle and a decorative image, and nothing on it explains the miss. Paths under `/api` keep their JSON, from `notfound.py`.

## Evidence

No measurement. A 404 cannot tell a typo from a dead link from a path that never existed, so any explanation is a guess.

## Alternatives rejected

- The raw JSON body of the exception: it reads as a broken site.
- An explanation of the miss: the ones the page used to offer sent people somewhere they had not asked to go.

## Consequences

The image source is absolute, because `404.html` is served at whatever URL missed, so a relative path would 404 as well. A client that asked `/api` for JSON never has to parse a page.
