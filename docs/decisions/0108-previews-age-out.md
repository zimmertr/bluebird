# 0108. A preview environment is torn down after 14 days without an update, by removing its label

- Status: Accepted
- Date: 2026-10-06
- Decider: Claude, in the 2026-10-06 security fix pass, under the maintainer's instruction to pick N for #637 and flag it; the 14 days awaits the maintainer's confirmation
- Issues and PRs: #637, #595, #330
- Cited in code as: #637
- Guide: [`docs/CICD.md`](../CICD.md), PR preview environments

## Context

Argo CD's `bluebird-pr` ApplicationSet deploys every open pull request that carries the `create pr container` label, and `pr-preview.yml` adds that label to each of the owner's PRs. Nothing removed it short of closing the PR, so a preview lived for as long as its PR stayed open. The security review (#595, finding CM-8) read `bluebird-pr-330` running in `bluebird-system` on 2026-10-01, 19 days old, on an image built before #561, #563, #564 and #569 merged, with its whole API published to the LAN and `LOG_LEVEL=TRACE`.

## Decision

- `.github/workflows/preview-age-out.yml` runs daily and on `workflow_dispatch`. It lists the open PRs carrying `create pr container` and removes the label from each whose `updatedAt` is older than `PREVIEW_MAX_AGE_DAYS`, the one `env:` constant at the top of the file, set to 14.
- Its only permission is `pull-requests: write`. It checks nothing out and uses no action; every value reaches the script through `env:`.
- Removing the label is the whole teardown. The ApplicationSet's generator stops templating `bluebird-pr-<N>`, the ApplicationSet deletes that Application, and the Application's `resources-finalizer.argocd.argoproj.io` prunes what it deployed. Nothing touches Argo or the cluster directly.
- Any update to the PR counts as activity. A push to an owner's PR re-adds the label through `pr-preview.yml`, and adding it by hand also brings the preview back.

## Evidence

Read 2026-10-06, without touching the cluster: `public/bluebird-pr/applicationset.yml` in Kubernetes-Manifests filters its `pullRequest` generator on the label, polls every 150 s, and gives each Application the resources finalizer with `prune: true`. No ApplicationSet controller policy is set in that repository's Argo CD values, so the default `sync` policy deletes an Application the generator no longer produces. PR #330 carried the label and had last been updated 2026-09-14T07:20:38Z.

## Alternatives rejected

- No age limit, relying on the owner to close or unlabel PRs. That is how #330's preview ran for 19 days.
- Deleting the Argo Application or the Deployment from a workflow. It needs cluster credentials in GitHub Actions, and the generator would recreate the Application while the label stays.
- Closing the stale PR. It removes work the owner may still want; removing the label is undone by one push.
- Age measured from the PR's creation. A PR under active work would lose its preview mid-review.

## Consequences

`backend/tests/test_preview_age_out.py` fails if the workflow is missing, gains a permission, spells the limit twice, or stops listing and unlabelling by `updatedAt`. A preview the owner still wants disappears after 14 quiet days and comes back with the next push. Bot activity on a PR (a Dependabot rebase, a sticky comment rewrite) counts as an update and resets the clock. The workflow's first run removes the label from #330, which #637 had left as the maintainer's step. Whether previews keep `LOG_LEVEL=TRACE` is unchanged and is the maintainer's call.
