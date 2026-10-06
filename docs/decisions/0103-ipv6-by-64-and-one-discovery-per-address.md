# 0103. An IPv6 client is counted by its /64, the geocode bucket fits inside the Nominatim gate, and one address runs one discovery at a time

- Status: Accepted
- Date: 2026-10-06
- Decider: the maintainer (TJ), on issue #627, 2026-10-06: option A as recommended, meaning IPv6 keyed on its /64, the geocode bucket at about 10 a minute with a burst of 3, and one in-flight Overpass discovery per address
- Issues and PRs: #627, #595, #180, #148, #75
- Cited in code as: #627
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, analyze step 2, the sentence "`POST /api/destinations` runs one discovery at a time per client address"; [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/ratelimit/` bullet

## Context

The per-client buckets keyed on the `CF-Connecting-IP` string as Cloudflare sent it, one bucket per distinct string. The zone serves IPv6 (`ipv6: on`, `pseudo_ipv4: off`, read by the security review), so an IPv6 visitor's whole address reached the pod, and every IPv6 client holds at least a /64 it can choose addresses from. A client could therefore start each request from a new address in its own block and meet a fresh, full bucket every time. The 10,000-key cap evicts full buckets first, so rotation did not even cost it the eviction.

Two buckets were also sized against the request's own cost rather than against the pod-wide budget behind them. The geocode bucket allowed 30 searches a minute with a burst of 10 per address, in front of a Nominatim gate that opens one slot every 3.5 s (about 17 a minute) per pod and sheds any caller booked more than 5 s out, so one address searching distinct places at its allowed rate could keep the gate booked ahead and shed every other visitor's search on that pod. The destinations bucket bounded how often an address started a discovery, not how many it held open, and each Overpass query runs 5 to 25 s against two slots per mirror that the whole pod shares. The security review found both by arithmetic from the constants (#595, findings BR-3, BR-4 and CM-10).

## Decision

`client_key` parses the address and counts it under `bucket_key`: an IPv6 address as its /64 (`IPV6_CLIENT_PREFIX`), an IPv4 address in IPv6's mapped form as its IPv4 address, every spelling of one address as one key, and anything that does not parse as written. The access log prints the whole address, read by `client_address`; a throttle line prints both, so the two still correlate.

The geocode bucket defaults to 10 a minute with a burst of 3, so its first minute, a burst plus a minute's refill, books fewer gate slots than the gate opens in that minute.

`POST /api/destinations` holds one discovery in flight per key (`DISCOVERY_IN_FLIGHT_PER_CLIENT`, not an env knob). A second request from the same key waits for the first, up to `UPSTREAM_BUDGET_WAIT_S`, and then gets the bucket's own `429`, `Too many requests from this connection. Try again later.`, with `Retry-After: SHED_RETRY_AFTER_S`. The slot is held for the whole request, because a custom list is resolved against Overpass as well. The analyze routes do not take part.

## Evidence

Keying IPv6 on its /64 is the common industry practice for per-client limits, because a /64 is the smallest block a provider assigns to one connection; a /56 is the stricter variant.

The web app sends one `POST /api/destinations` per Analyze and awaits it before anything else (`frontend/src/utils/analysisPipeline.ts`), and the search box searches on submit only (`frontend/src/components/SearchBox.tsx`), so neither limit is one a person meets.

The regression tests failed on main before the change (2026-10-06): `test_ipv6_addresses_in_one_slash_64_share_a_key`, `test_two_spellings_of_one_ipv6_address_are_one_key`, `test_ipv4_keys_stay_whole_addresses` and `test_ipv6_addresses_in_one_slash_64_share_one_bucket` (the second address in the /64 got a 200), `test_the_geocode_bucket_books_the_gate_no_faster_than_it_serves` (40 against about 17), and `test_one_address_holds_one_discovery_at_a_time` (the second discovery from one address reached Overpass beside the first).

## Alternatives rejected

- **A /56 key.** Stricter, and it groups more than one household on some providers. The issue recommended the /64.
- **A share of each pod-wide gate per address** (the issue's option B). The one-in-flight rule is that share for Overpass; for Nominatim a resized bucket does the same with no state in the gate.
- **Refusing a second concurrent discovery at once.** A cancelled Analyze leaves its first request running on the pod, so the retry a person makes straight away would read as a rate limit. Waiting costs a coroutine and holds no upstream slot.
- **Covering the analyze routes too.** They are reached only with a key and their own bucket is the tightest of the six; holding a slot for a whole analysis would serialize forecast fetches as well as discovery.

## Consequences

`test_ratelimit.py` and `test_destinations.py` hold the key, the geocode sizing and the in-flight share. A household on one /64 shares its buckets, the way a household behind one IPv4 address always has. The chart in `bluebird-helm` sets `RATE_LIMIT_GEOCODE_PER_MINUTE` and `RATE_LIMIT_GEOCODE_BURST` explicitly, so production keeps the old geocode numbers until the chart's values move with these defaults. Whether Cloudflare's edge rule counts IPv6 per address or per prefix is still not established.
