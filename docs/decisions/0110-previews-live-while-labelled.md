# 0110. A preview environment lives for as long as its PR carries the label, in a namespace of its own

- Status: Accepted. Supersedes 0108.
- Date: 2026-10-06
- Decider: the maintainer, on #637 (2026-10-06)
- Issues and PRs: #637, #656, #595, #330; Kubernetes-Manifests#1391
- Cited in code as: #637
- Guide: [`docs/CICD.md`](../CICD.md), PR preview environments

## Context

The security review (#595, finding CM-8) found `bluebird-pr-330` running in `bluebird-system` beside production on 2026-10-01. It was 19 days old, on an image that predated four fixes, with its whole API published to the LAN and `LOG_LEVEL=TRACE`. While the maintainer was away, #656 (released 0.92.35, record 0108) added a daily workflow. It removed `create pr container` from any PR that had not been updated for 14 days. The maintainer then decided #637 differently.

## Decision

- A preview has no age limit. It lives for as long as its PR carries `create pr container`, and the maintainer ends it by removing the label or closing the PR. `preview-age-out.yml` and its test are removed.
- Previews keep `LOG_LEVEL=TRACE`.
- Previews run in their own namespace, `bluebird-pr-system`, and no longer in production's `bluebird-system`. Kubernetes-Manifests#1391 makes the change. The namespace is created as a plain resource beside the `bluebird-pr` AppProject, with `istio-injection: enabled` and Pod Security `restricted` on `enforce`, `warn` and `audit`. Every preview shares that one namespace; there is not one per PR.

## Evidence

The maintainer prefers an explicit label to a clock. A preview that is still wanted should not disappear because its PR went quiet. A clock also counts any update as activity, bot comments and rebases included, so it measured something other than whether the preview was in use.

The chart renders every object into `.Release.Namespace` and hard-codes no namespace. A render of the preview template for PR 663 on 2026-10-06 used kustomize 5.8.1 and helm v4.3.0 with chart 0.15.67. It differed only in the four objects' `namespace` and in the VirtualService's mesh host. A preview renders its own Gateway beside its VirtualService and serves plain HTTP on its LAN hostname, so no shared Gateway reference and no certificate depend on the namespace. The live preview pod (the app, `istio-proxy` and `istio-validation`) was read on 2026-10-06 and met every `restricted` rule.

## Alternatives rejected

- 0108's age-out after 14 days without an update. The maintainer prefers the label as the only switch.
- One namespace per PR. Each preview would have to create its own namespace, so the `bluebird-pr` project would need to permit the cluster-scoped `Namespace` kind. Argo CD does not delete a namespace it created, so every closed PR would leave an empty one behind.
- Dropping previews to `DEBUG` (#637 option B). The maintainer keeps `TRACE` for debugging.

## Consequences

Nothing in this repository enforces the rule any more: no workflow removes the label, and no test pins one. A forgotten preview runs until its label goes. The image it runs may then miss fixes released after it was built, which is how #330's preview was found. The namespace keeps such a preview's objects apart from production's. It does not separate their network traffic: that needs a NetworkPolicy and a CNI that enforces one (Kubernetes-Manifests#1310). `docs/CICD.md` names the namespace.
