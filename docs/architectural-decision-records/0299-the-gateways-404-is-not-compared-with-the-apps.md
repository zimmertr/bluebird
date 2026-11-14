# 0299. The gateway's 404 is not compared with the app's, and the request walk is gone

- Status: Accepted. Supersedes [0081](0081-edge-404-is-the-apps.md)'s record file and its comparison, and amends [0109](0109-gateway-strips-off-tunnel-client-header.md) (the walk that held its route pairs)
- Date: 2026-11-13
- Decider: the maintainer (TJ), 2026-11-13, on #937 and bluebird-helm#513: trim both, under KISS and YAGNI
- Issues and PRs: #937, #938, bluebird-helm#513, bluebird-helm#515
- Cited in code as: none
- Guide: [`backend/CLAUDE.md`](../../backend/CLAUDE.md), the `app/routes/notfound.py` bullet

## Context

bluebird-helm's `Edge 404` workflow compared the chart's own `404` with `backend/edge_not_found.json` on this repo's `main`. That workflow, and the chart's `Chart / Chart`, also sent a table of request shapes through the rendered routes with `check_edge_routes.py`. Both were shell and Python handed to yggdrasil's chart module as its `test` input, which is deprecated (yggdrasil record 0060). Moving them here would have needed helm, a YAML parser, the published chart and a schedule in this repo's CI.

## Decision

- Neither check moves. bluebird-helm deletes `edge-404.yml`, `check_edge_routes.py` and `tunnel_values.yaml`.
- This repo deletes `backend/edge_not_found.json` and `scripts/generate_edge_not_found.py`.
- The chart keeps its copy of the body, naming the path as `EDGE_PATH_PHRASE`, and the pod's encoded-slash refusal still answers that body.

## Evidence

None measured. The two checks cover these boundaries:
- A drift in the copy changes only the body a client gets for a path that has no endpoint.
- The pod refuses any `%2F` path itself (record [0096](0096-encoded-slash-refused-at-both-layers.md)), held by `test_notfound.py`.
- bluebird-helm's helm-unittest suites pin every route of the VirtualService, plain and with the tunnel strip, so no rule changes without a PR that rewrites them in view.

## Alternatives rejected

- A test here that renders the published chart, compares the 404 route and walks the request shapes. Three new tools and a schedule, for checks the boundaries above already cover.
- A copy of `edge_not_found.json` in bluebird-helm. The copy is what drifts.

## Consequences

The gateway's `404` headers and body can drift from the pod's, and nothing turns red. When a route rule changes, no test says where each request shape lands; the reviewer of the chart PR reasons about it.
