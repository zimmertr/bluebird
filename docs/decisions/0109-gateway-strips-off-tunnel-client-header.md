# 0109. The gateway removes `CF-Connecting-IP` from every request that did not come through the tunnel, and the app is unchanged

- Status: Accepted
- Date: 2026-10-06
- Decider: the maintainer, choosing between the two remedies #631 left open after PR #657; the mechanism (a route pair keyed on the gateway's own `X-Forwarded-For` hop) was chosen by Claude in the security fix pass and is in the pull requests below for review
- Issues and PRs: #631, bluebird-helm#331, Kubernetes-Manifests#1390
- Cited in code as: #631
- Guide: [`CLAUDE.md`](../../CLAUDE.md), the keyed analyze API bullet under Architecture; [`docs/TRAFFIC.md`](../TRAFFIC.md), "Client identity"

## Context

The rate limiter keys on `CF-Connecting-IP` when a request carries it (`client_address` in `app/ratelimit/client.py`), because Cloudflare overwrites the header and the tunnel is the only path from the internet. The shared Istio gateway is also the LAN address `192.168.40.150`, and it serves `bluebirdforecast.com` there as well as `ganymede.sol.milkyway`, because the tunnel forwards to that same gateway. So a device on the home network that sent its request straight to the gateway could set the header to any address and be counted against that address (#595, finding BR-10). PR #657 documented the gap and left two remedies to the maintainer: the gateway drops the header from every request that did not arrive through cloudflared, or the app believes it only from a configured trusted peer.

## Decision

The gateway does it, and the app does not change. The chart value `ingress.tunnel.peerRegex` (bluebird-helm#331, chart `0.15.67`) names the peer a tunnel request arrives from. While it is set, every route that forwards to the pod renders as a pair. The route with the usual name matches only when the last `X-Forwarded-For` hop matches that pattern, and keeps the header. Its `-off-tunnel` twin matches the same paths from any other peer, mesh traffic included, and removes `cf-connecting-ip`. The gateway appends that hop itself, after anything the client sent, so a client cannot write it. The edge 404 route has no twin, because it never reaches the pod. Production sets the pattern to a cloudflared pod address, `10\.244\.\d+\.(?:[2-9]|[1-9]\d|1\d\d|2[0-4]\d|25[0-5])`, and lists the three twins in the Rollout's `trafficRouting` (Kubernetes-Manifests#1390). The value is empty by default, which renders the chart unchanged for a deployment without a tunnel.

## Evidence

Read from the cluster on 2026-10-06 (`kubectl get`, `logs` only) and from Kubernetes-Manifests:

- cloudflared reaches the gateway at `https://gateway.istio-gateway.svc.cluster.local:443`: the ClusterIP Service, TLS, with the public hostname as SNI and the original Host header.
- cloudflared is not in the mesh. Its pods run one container, its namespace has no injection label, and its service account is `default`. So there is no source principal to key on. Its pod addresses (`10.244.0.55` and `10.244.2.62` that day) change on every reschedule.
- The gateway Service is a MetalLB `LoadBalancer` with `externalTrafficPolicy: Cluster`. kube-proxy runs in `nftables` mode with `--cluster-cidr=10.244.0.0/16`. flannel uses vxlan, with a `/24` per node.
- One `Gateway` and one `VirtualService`, both named `bluebird`, carry all three hosts.
- The gateway writes no access log: the mesh config sets no `accessLogFile`, and no `Telemetry` or `EnvoyFilter` exists.

From that configuration, derived but not observed:

- A tunnel request arrives from the cloudflared pod's own address. Pod-to-ClusterIP traffic inside the cluster CIDR is not masqueraded.
- A LAN request is masqueraded to the node's `cni0` (`10.244.N.1`) or `flannel.1` (`10.244.N.0`) address. With `externalTrafficPolicy: Local` it would keep its own `192.168.x.x` address.
- The pattern matches neither LAN case, so it holds under both policies.

Kubernetes-Manifests#1390 asks for one LAN request without the header before it merges, to confirm the derived address.

The chart's `check_edge_routes.py --tunnel`, a step of the required `Lint & render` job, sends every request shape from the tunnel's peer and from five LAN peers, with both `,` and `, ` as the separator. One of those peers types a pod address into `X-Forwarded-For` itself. The check passed 204 of 204 on the chart render and on the production render (2026-10-06). On the chart's previous render it fails 80 shapes.

## Alternatives rejected

- **An app setting that believes the header only from a trusted peer.** It needs a new environment variable declared in the chart. Behind the Istio sidecar the pod's socket peer is the sidecar, not cloudflared, which #631 left to be confirmed and nobody measured. The setting would therefore have to read the same `X-Forwarded-For` hop the gateway can test before the request reaches the pod.
- **Keying on cloudflared's mesh identity.** cloudflared is not meshed. Meshing it means a sidecar in a `restricted` namespace and an `ISTIO_MUTUAL` server on the shared gateway, a larger cluster change than the finding needs.
- **An `EnvoyFilter` on the gateway keyed on the peer address.** It would have to live in `istio-gateway`, but the bluebird kustomization sets `namespace: bluebird-system` on everything the chart renders. The project also keeps `EnvoyFilter` out of the stack on purpose (#75). It would read the same peer the route match reads.
- **A tunnel-only listener port.** It needs a second Service in `istio-gateway` and a change to cloudflared's config. The routes would still need the same split per port, so it adds a repository's worth of change and no stronger key.
- **Stripping on the `ganymede.sol.milkyway` host alone.** A LAN client can present `bluebirdforecast.com` as both Host and SNI, so the gap stays open.
- **A NetworkPolicy.** The cluster's CNI enforces none (Kubernetes-Manifests#1310), and a policy would not reach the gateway's LAN listener either.

## Consequences

`check_edge_routes.py` holds the route pairs in both modes. Without `--tunnel`, no route may remove the header. With it, every forwarding route either requires a tunnel peer in every match or removes the header.

What it leaves open:

- Any pod in the cluster has a pod address, still passes the pattern, and can set the header through the gateway. This is the in-mesh trade-off `docs/TRAFFIC.md` already accepts.
- A LAN device with a route into `10.244.0.0/16` can skip the gateway and reach a pod's port directly. Closing that waits for Kubernetes-Manifests#1310.
- While the Service stays on `externalTrafficPolicy: Cluster`, LAN devices share the few `.0`/`.1` keys of the node that holds the MetalLB address.
- The pattern encodes flannel's addressing. A CNI or pod CIDR change means deriving it again and repeating the LAN check.
- An `-off-tunnel` twin the Rollout does not list stays 100/0 stable through a canary.
