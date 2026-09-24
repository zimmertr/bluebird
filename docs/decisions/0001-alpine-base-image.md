# 0001. The image runs on Alpine, not Debian slim

Verbatim guide text at 971fede, copied before the edit to the template.

## From `CLAUDE.md`, line 118

- Stage 2: `python:3.14-alpine` runs uvicorn and serves the built SPA as static files at `/` (alpine over slim so the shipped image carries none of Debian's perpetual no-fix CVEs)
