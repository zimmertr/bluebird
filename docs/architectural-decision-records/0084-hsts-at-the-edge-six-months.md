# 0084. The Cloudflare zone redirects HTTP and sends HSTS for six months, with no subdomains and no preload

- Status: Accepted
- Date: 2026-10-01
- Decider: the maintainer (TJ), on issue #572 (option A: Always Use HTTPS and HSTS in the zone, `max-age` six months, no `includeSubDomains`, no `preload`)
- Issues and PRs: #572, #132, #314, #148
- Cited in code as: none
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/security_headers.py` bullet

## Context

The app sends no `Strict-Transport-Security` header, on purpose (#132): a browser cannot be told to forget a `max-age` it has read, so the header belongs to one layer only, the one that terminates the public TLS. `docs/TRAFFIC.md` and the comment above `BASE_HEADERS` said Cloudflare already sent it. The readiness review measured otherwise (#572): `http://bluebirdforecast.com/` answered `200` with the full document, and none of eight responses carried the header. The chart's `ingress.httpsRedirect` could not help, because it sits on the gateway's port 80 server and cloudflared dials the gateway on 443 (#148).

## Decision

The Cloudflare zone for `bluebirdforecast.com` has **Always Use HTTPS** on, so a plain HTTP request gets a `301` to the `https` URL at the edge, and **HSTS** on with `max-age=15552000` (180 days), no `includeSubDomains` and no `preload`. The app keeps sending no HSTS header. Both settings are zone state in the Cloudflare dashboard and live in no repository; `docs/TRAFFIC.md` records them with the date measured.

## Evidence

Measured 2026-10-01 after the change: `curl -sI http://bluebirdforecast.com/` answered `HTTP/1.1 301 Moved Permanently` with `Location: https://bluebirdforecast.com/`, and `http://bluebirdforecast.com/api/version` redirected to the same path on `https`. `curl -sI https://bluebirdforecast.com/` carried `strict-transport-security: max-age=15552000`, and so did `https://www.bluebirdforecast.com/`, an `/api/version` answer and the gateway's own `404`.

## Alternatives rejected

- Leaving the zone alone and correcting the docs (#572 option B). The site would keep answering on plain HTTP.
- A two-year `max-age` with `preload`. A preload entry ships inside browsers and takes months to remove, and a long `max-age` stays in every browser that read it; a short value is the one that can be corrected.
- `includeSubDomains`. No subdomain needs it today, and it would bind every future name under the zone to HTTPS for the life of the value.
- Sending the header from the pod as well. A second source makes a wrong value harder to withdraw, and the pod never sees the public scheme.

## Consequences

A browser that has visited keeps refusing plain HTTP for 180 days after its last visit, even if the zone setting is turned off; lowering the value takes that long to reach every browser. Nothing in any repository holds or checks the setting, so a zone change can silently undo it (#314 tracks moving zone state into code). `test_security_headers.py` still pins that the pod sends no HSTS header.
