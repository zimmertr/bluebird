# 0059. The 404 page explains nothing

Verbatim guide text at 971fede, copied before the edit to the template.

## From `frontend/src/CLAUDE.md`, line 161

- `src/components/NotFoundPage.tsx` — the page Starlette serves for any static path that does not resolve, so a mistyped URL is a page rather than the raw JSON body of an HTTP exception. Nothing on it explains the miss: a 404 cannot tell a typo from a dead link from a path that never existed, so any explanation is a guess, and the ones it used to offer sent people somewhere they had not asked to go. Paths under `/api` keep their JSON, from `notfound.py`
