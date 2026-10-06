# 0102. Every log record passes one root formatter that masks a caller's key and escapes control characters, traceback included

- Status: Accepted
- Date: 2026-10-06
- Decider: TJ, taking #626's option A with `redacted_error` kept as defence in depth (security fix pass, 2026-10-06)
- Issues and PRs: #626, #595, #561, #616
- Cited in code as: none
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, the bullet "The browser path is the only path", the sentence "A traceback is no call site of either helper"

## Context

A keyed analysis forwards the caller's Open-Meteo key in the query string, and `raise_for_status` builds its message out of that URL. `redacted_params` and `redacted_error` (#561) clean the lines that call them, one line at a time. A traceback calls neither: an exception raised while the `HTTPStatusError` is being handled chains it as `__context__`, and the traceback prints the chained text. Two readers inside that handler could raise on a malformed answer from Open-Meteo: `_reason_matches` raised `TypeError` on a `reason` that is not a string, and `parse_rate_limit` raised `OverflowError` on `Retry-After: inf`. The chain then reached `log.exception` in the analyze phases and uvicorn's "Exception in ASGI application" trace. The review in #595 also found that a request path is logged decoded, so `%1B` reaches a terminal reading `kubectl logs` as a real ESC.

## Decision

`app/log_redaction.py` owns `RedactingFormatter`, a `logging.Formatter` whose `format` runs the finished string, traceback included, through one mask: the value after `apikey=` becomes `[redacted]`, and every C0 control except newline and tab, DEL and the C1 range are written as `\xNN`. `main.py` builds the root `StreamHandler` with it and hands it to `basicConfig`. uvicorn's `uvicorn` and `uvicorn.error` loggers keep no handler and propagate to it, which `main.py` already arranged for the timestamp format. `KEY_IN_QUERY` and `REDACTED` live in the same module, and `openmeteo_fetch.py` imports them, so the mask is spelled once. `redacted_error` stays: only a call site holds the raw key, so only there can it be removed where it appears outside a query string.

The two readers now treat a malformed value as absent: a `reason` that is not a string is read as `""`, and a `Retry-After` that is not finite falls back to the scope's floor. No new knob: the formatter is always on.

## Evidence

Measured 2026-10-06 in the backend test image (Python 3.14), 100,000 formats each, best of five: an access-log line costs 1.14 µs with the plain formatter and 2.14 µs with this one; a record with a cached traceback 1.06 µs and 6.89 µs. At this app's log volume that is noise.

`tests/test_log_redaction.py` starts a fresh interpreter, applies uvicorn's own `LOGGING_CONFIG`, imports the app (the order `uvicorn app.main:app` uses), logs a chained `HTTPStatusError` on `uvicorn.error` and serves a path holding `%1B`. On main the encoded test key and a raw ESC were both in its stderr; with this change neither is. The parser cases in `test_errors.py`, `test_weighted_budget.py` and `test_weather.py` raised `TypeError` and `OverflowError` on main.

## Alternatives rejected

- **Hardening each known path only** (#626 option B): the two parsers and a `%r` on the logged path. The next path that chains a keyed error is unguarded, which is how this one appeared after #561.
- **A `logging.Filter` that rewrites `record.msg` and `record.args`.** The traceback does not exist until the record is formatted, so a filter cannot reach the text that leaked.
- **Escaping newlines too.** A traceback is made of them, and a request path cannot carry one: `urlsplit` strips `\t`, `\r` and `\n` before Starlette builds the path.

## Consequences

A handler added anywhere without this formatter, or a uvicorn logger given its own handler again, would print raw records; `test_log_redaction.py` fails if the production wiring stops masking. Some characters a person might want to read are written as escapes: a C1 control has no legitimate place in a log line here.
