# CI/CD and Deployment Flow

How a change travels from a pull request to `bluebirdforecast.com`, across the
three repositories and the supporting services that automate the path.

> **Keep this current.** Any change that alters the flow — a workflow in
> `bluebird` or `bluebird-helm`, an image/chart/tag convention, or the
> `Kubernetes-Manifests` wiring — must update this document in the same change.
> The diagrams also describe two sibling repos, so changes made *there* should
> come back here too; nothing enforces that automatically.

## Systems

| System | Role |
| --- | --- |
| **`zimmertr/bluebird`** | Application monorepo (FastAPI backend + React SPA), built into a single Docker image. |
| **`zimmertr/bluebird-helm`** | Helm chart (`charts/bluebird`, whose `name:` is `bluebird-helm`), published as an **OCI** artifact. Its `pr.yml` runs `Lint & render` and, on a same-repo chart PR, `Publish prerelease chart`, which pushes `<version>-pr<N>.g<sha>` to the same OCI repo with `artifacthub.io/prerelease` set. That flag only labels the version on Artifact Hub; the `ignore` entry in `artifacthub-repo.yml` is what keeps PR builds off the listing, so Artifact Hub never offers one as the default version. Its `edge-404.yml` runs `Edge 404 matches the app` on chart PRs and on pushes to `main`, comparing the gateway's own `404` with this repo's `backend/edge_not_found.json` (#565). It is **not** a required check, so a mismatch shows red and blocks nothing, the automated `appVersion` bump included. Both workflows also walk a table of request shapes through the rendered routes and check which route answers each, the encoded slash `/api%2F` among them (`.github/scripts/check_edge_routes.py`, #620); in `Lint & render` that walk does block a PR, because it reads the chart alone. Its `pr-title.yml` is the same `PR Title` check as this repo's. |
| **`zimmertr/Kubernetes-Manifests`** | GitOps repo Argo CD watches. `public/bluebird/` is the stable app; `public/bluebird-pr/` is the per-PR preview `ApplicationSet`. `main` forbids direct commits; every write lands via a PR gated on the `Validate manifests` check. |
| **Docker Hub** | `zimmertr/bluebird` (release images), `zimmertr/bluebird-pr` (preview images), and the OCI chart at `oci://registry-1.docker.io/zimmertr/bluebird-helm`. |
| **Artifact Hub** | Indexes the published OCI chart and security-scans its rendered **default image** (why the chart's `appVersion` must always name a real, published image tag). |
| **Cluster** | Argo CD (`argo-system`) syncing into `bluebird-system`; Argo Rollouts (canary + `AnalysisTemplate`), Istio `VirtualService`/`Gateway`, and cert-manager for `bluebirdforecast.com`. |

Everything consumes the chart **OCI-natively** (kustomize `helmCharts` and an
Argo CD `repoURL: oci://…`); nothing uses a classic Helm repo index.

## Release and promotion

Solid arrows are automated; dashed arrows are a human action, or a read that
doesn't itself trigger the next step.

```mermaid
flowchart TD
    dev(["Developer / TJ"])

    subgraph BB["GitHub: zimmertr/bluebird"]
        bbMain["main"]
        bbRel["release.yml"]
        bbScan["scan job<br/>Trivy by digest,<br/>linux/amd64 + linux/arm64"]
        ghRelease["GitHub Release vSemVer"]
    end

    subgraph HELM["GitHub: zimmertr/bluebird-helm"]
        helmPR["PR: chore/bump-appversion<br/>(self-merging)"]
        helmMain["main (charts/**)"]
        helmRel["release.yml"]
    end

    subgraph KM["GitHub: zimmertr/Kubernetes-Manifests"]
        kmCheck["pr.yml — Validate manifests<br/>required check: YAML parse<br/>+ kustomize build of affected apps"]
        kmImagePR["PR: chore/bluebird-image<br/>(self-merging)"]
        kmStablePR["PR: chore/bluebird-stable-chart<br/>(self-merging)"]
        kmPreviewPR["PR: chore/bluebird-preview-chart<br/>(self-merging)"]
        kmStable["public/bluebird<br/>kustomization.yml"]
        kmPreview["public/bluebird-pr<br/>applicationset.yml"]
    end

    subgraph DH["Docker Hub"]
        dhImage["zimmertr/bluebird:SemVer"]
        dhChart["OCI chart<br/>zimmertr/bluebird-helm"]
    end

    ah["Artifact Hub"]

    subgraph CL["Cluster"]
        argocd["Argo CD"]
        rollout["Argo Rollout<br/>canary + Istio"]
        prod(["bluebirdforecast.com"])
    end

    dev -.->|merge app PR| bbMain
    bbMain --> bbRel
    bbRel -->|GitVersion, then build| dhImage
    bbRel --> bbScan
    bbScan -->|passed| ghRelease
    dhImage -.->|pushed digest, both platforms| bbScan
    bbScan -->|passed: open/update PR: image newTag| kmImagePR
    bbScan -->|passed: open/update PR| helmPR

    helmPR -->|auto-merge once lint passes| helmMain
    helmMain --> helmRel
    ghRelease -.->|appVersion from releases/latest| helmRel
    helmRel -->|helm push| dhChart
    helmRel -->|then, in a separate job, ORAS push to the artifacthub.io tag<br/>when artifacthub-repo.yml changed; never blocks the release| dhChart
    dhChart --> ah
    helmRel -->|open/update PR: chart version| kmStablePR
    helmRel -->|open/update PR: targetRevision| kmPreviewPR

    kmCheck -.->|gates| kmImagePR
    kmCheck -.->|gates| kmStablePR
    kmCheck -.->|gates| kmPreviewPR
    kmImagePR -->|auto-merge once green| kmStable
    kmStablePR -->|auto-merge once green| kmStable
    kmPreviewPR -->|auto-merge once green| kmPreview

    kmStable --> argocd
    dhChart -->|OCI pull| argocd
    argocd -->|sync + kustomize inflate| rollout
    dhImage -->|image pull| rollout
    rollout --> prod
```

**Path 1 — App release** (`bluebird/release.yml`, on merge to `main` or a
manual dispatch from `main`, runs concurrency-serialized). Every job carries
`if: github.ref == 'refs/heads/main'`, so a dispatch from any other branch
skips them all: that branch would otherwise be built, pushed and bumped into
production, because GitVersion gives it a prerelease version that sorts above
the newest release (#632).

1. **Determine Version** — GitVersion (Mainline) computes the SemVer from the
   squash commit's title (see [Conventions](#conventions)). **Release guard:**
   a release is three things made in order, the image
   `zimmertr/bluebird:<semver>`, the git tag `v<semver>` and the GitHub release.
   Every downstream job skips only when **all three** already exist. Each job
   makes its own piece only when it is missing, so a run that died part way is
   finished by a re-run (see [Finishing a failed release](#finishing-a-failed-release)).
2. **Build & Push** — builds a **multi-arch manifest (`linux/amd64` +
   `linux/arm64`, arm64 via QEMU)** with SBOM + provenance attestations (the
   attestation manifests appear as "unknown/unknown" rows in Docker Hub's UI),
   pushes it to Docker Hub as `zimmertr/bluebird:<semver>`, and pushes the
   `v<semver>` git tag. Capped at `timeout-minutes: 30`: because releases
   serialize, a job hung on a registry timeout would otherwise dam every
   queued release for up to GitHub's 6-hour default.

   The job asks Docker Hub itself whether the image exists, rather than reading
   Determine Version's answer, because "Re-run failed jobs" keeps that answer
   from the first attempt. An existing image skips the build, and only if its
   `org.opencontainers.image.revision` label is this commit: Mainline gives every
   commit its own version, so an image from another commit is never a re-run,
   and the job stops rather than tag a commit the image was not built from. The
   tag step leaves a `v<semver>` that already names this commit alone and stops
   on one that names another.

   Only the *backend* halves of the image are built per architecture. The
   frontend stage carries `--platform=$BUILDPLATFORM`, so the SPA is compiled
   once on the runner's own architecture and both images copy the same
   `dist/` — see [Where the time goes](#where-the-time-goes) for what the
   emulated version of that stage cost.

   The job's `digest` output is the index digest the push produced, or on a
   re-run that skipped the build, the registry's digest for the image it
   checked. Step 3 scans exactly that.

   **Build identity.** Three build args are passed here and baked into the
   image as env vars: `APP_VERSION` (the GitVersion SemVer), `APP_COMMIT`
   (`github.sha`), and `APP_BUILT_AT` (stamped by a `date -u` step, because
   `github.event.repository.updated_at` is the last push rather than this
   build). They are what `GET /api/version` reports and what fills
   `info.version` in `/openapi.json`. `pr-preview.yml` passes the same three,
   with `APP_VERSION=pr-<number>`, so a preview environment can be verified the
   same way. Anything built without them (a local `docker build`, `docker
   compose up`) honestly reports `dev`.

   These args are declared at the very **end** of the Dockerfile, immediately
   before `USER`. `APP_BUILT_AT` changes on every build, so declaring them any
   earlier would invalidate the `pip install` layer every time and throw away
   the build cache.
3. **Scan Pushed Image** — Trivy, once per platform (`linux/amd64` and
   `linux/arm64`), against `zimmertr/bluebird@<digest>` from step 2, with the
   same `trivy.yaml` and `.github/actions/trivy-crit-high` as the PR gate and
   the weekly scan. It fails on a fixable Critical/High finding. Steps 4, 5
   and 6 all need it, so production, the chart's default image and the GitHub
   release move only onto a scanned digest. See
   [The release scan](#the-release-scan).
4. **Create GitHub Release** — auto-generated notes, through `gh release
   create --verify-tag`, skipped when the release already exists. It is marked
   **Latest** unless a newer release already is, so a release finished late
   does not move `releases/latest`, which the chart's `appVersion` resolver
   reads. Waits on step 3, then runs in parallel with step 5, which does not
   depend on it.
5. **Update Kubernetes-Manifests** — starts as soon as the scan passes,
   because nothing here needs the GitHub Release to exist. A **self-merging
   PR** on the fixed `chore/bluebird-image` branch sets `images.newTag:
   <semver>` in
   `public/bluebird/kustomization.yml`. Once `Validate manifests` goes green it
   squash-merges itself, Argo CD auto-syncs, and the new image rolls to prod. No
   human step. See [Writes into Kubernetes-Manifests](#writes-into-kubernetes-manifests)
   for why every write is shaped this way. Steps 5 and 6 both do nothing when
   a newer release than this one exists, so a re-run that finishes an old
   release never moves prod or the chart back onto it.
6. **Bump Helm Chart appVersion** — waits on the scan like step 5, and
   unlike step 5 also on step 4:
   `bluebird-helm/release.yml` resolves `appVersion` at package time from this
   repo's `releases/latest`, so opening this PR before the release exists races
   the resolver onto the previous version. Force-pushes a fixed
   `chore/bump-appversion` branch on `bluebird-helm` setting `Chart.yaml`
   `appVersion=<semver>`, opens
   **or updates in place** a single PR (Dependabot-style dedup), then arms
   **squash auto-merge** so it lands itself once `Lint & render` passes. No human
   step. Requires `GH_PAT` with contents + pull-requests write on `bluebird-helm`,
   and `allow_auto_merge` enabled on that repo.

   Same shape as every write into `Kubernetes-Manifests`, for the same reasons:
   `bluebird-helm/main` requires both a PR *and* the `Lint & render` check, and
   auto-merge must be re-armed on the update path because GitHub disables it on
   any force-push to the head branch. See
   [Writes into Kubernetes-Manifests](#writes-into-kubernetes-manifests).

**Path 2 — Chart release** (`bluebird-helm/release.yml`, on merge to `main`
touching `charts/**`, `artifacthub-repo.yml`, or the workflow itself, or a
manual dispatch, which the same ref check confines to `main`):

1. GitVersion computes the **chart** SemVer from the same title patterns.
   **Release guard:** the same three pieces as Path 1 (the OCI chart, checked
   with `helm show chart oci://…`, the git tag and the GitHub release), and
   the same rule: the job skips only when all three exist, and otherwise makes
   only what is missing. The chart carries no commit, so unlike the image it is
   not checked against this commit; a tag that names another commit still stops
   the run.
2. Resolves `appVersion` **at package time** from `bluebird`'s `releases/latest`
   (the value committed to `Chart.yaml` is only a local-render fallback — the
   resolver is the source of truth).
3. `helm package --version <chartver> --app-version <appver>` and `helm push`
   to the OCI repo, when the chart is missing; then the tag and the GitHub
   release, each when missing, marked Latest unless a newer chart release is.
4. Then, in a separate job, when the merge changed `artifacthub-repo.yml` (or
   on a manual run), pushes it with ORAS to the OCI repo's `artifacthub.io`
   tag; a failure there never blocks the release.
5. **bump-manifests** moves `Kubernetes-Manifests` onto the new chart via two
   PRs, one per consumer:
   - preview: `chore/bluebird-preview-chart` sets `targetRevision: <chartver>`
     in `public/bluebird-pr/applicationset.yml` (the ephemeral per-PR envs).
     Always **self-merging** — nothing it touches reaches prod.
   - stable: `chore/bluebird-stable-chart` sets `helmCharts[0].version:
     <chartver>` in `public/bluebird/kustomization.yml` (prod, triggers the
     canary rollout). Also **self-merging**.

   Neither PR moves when a newer chart release exists, for the same reason as
   Path 1's steps 5 and 6.

   They are separate branches rather than one PR touching both files so a
   preview bump is never blocked behind a prod change, and either can be closed
   independently. The chart release workflow is `concurrency`-serialized
   (`group: chart-release`): both branches are force-pushed, so two concurrent
   runs would clobber each other and leave the surviving PR pinned to whichever
   version pushed last.

   The fixed branch matters: version-suffixed branch names were the norm here
   until they stranded 6 open PRs across three chart releases while prod stayed
   pinned to an old chart. A new branch per version means `gh pr create` opens a
   new PR every time instead of advancing the existing one.

**Path 3 — GitOps sync** (Argo CD → cluster): Argo CD reconciles
`public/bluebird/`. Kustomize inflates the OCI `helmCharts` entry with
`values.yml`, overlays the namespace and the three `AnalysisTemplate`s
(`api-test`, `error-rate` and `version-check`), and pins
the image via `images.newTag`. The chart renders an **Argo Rollout** plus the
Istio `VirtualService`/`Gateway`; cert-manager terminates TLS. The rollout
itself is a four-step canary — a scale step that starts one canary pod at zero
user traffic, then three blocking analyses, then promotion in a single cutover — described
in [Inside the prod canary](#inside-the-prod-canary-argo-rollouts) below.

### Finishing a failed release

A release that fails part way leaves some of its pieces published, and the
image and the tag are immutable, so nothing is deleted or pushed again. A
chart release in `bluebird-helm` recovers the same way, by re-running its
`release.yml`.

1. **Re-run the run.** "Re-run all jobs" or "Re-run failed jobs" on the failed
   `release.yml` run. Each job makes only what is still missing, in order: the
   image, the tag, the scan, the release, then the two bump PRs. This is the whole
   recovery when the failure was transient. A scan that failed on a finding is
   not transient; see [The release scan](#the-release-scan).
2. **If the tag push itself keeps failing**, push the tag by hand at the run's
   commit, then re-run all jobs, which makes the release and both bump PRs:

   ```sh
   docker buildx imagetools inspect zimmertr/bluebird:<semver> \
     --format '{{ index (index .Image "linux/amd64").Config.Labels "org.opencontainers.image.revision" }}'
   # prints the commit; tag that commit and nothing else
   git tag -a v<semver> <commit> -m "Release v<semver>"
   git push origin v<semver>
   ```

   This is the 2026-07-21 case: GitHub refused the tag pushes for v0.16.0 and
   v0.16.1 with `refusing to allow a GitHub App to create or update workflow
   .github/workflows/pr.yml without workflows permission`, which a re-run with
   the same token would meet again. Push with credentials that carry the
   `workflow` scope.
3. **If the run cannot be re-run** (GitHub allows it for 30 days), do the
   rest by hand:
   `gh release create v<semver> --repo zimmertr/bluebird --title v<semver>
   --generate-notes --verify-tag`, then a PR in `Kubernetes-Manifests` setting
   `images.newTag: <semver>` in `public/bluebird/kustomization.yml`, and a PR in
   `bluebird-helm` setting `appVersion: "<semver>"` in
   `charts/bluebird/Chart.yaml`, titled `chore(release): bump chart appVersion
   to <semver>`.

If a newer release has shipped in the meantime, a re-run still tags and
releases the old version, but does not mark it Latest and opens no bump PR, so
prod stays on the newer one. Do the same by hand: `--latest=false`, and no
bump PRs. Left alone, the version stays an image with no tag, as v0.16.0 and
v0.16.1 do, and the next merge releases the version after it.

### The release scan

The PR gate scans an amd64 image it builds from the PR branch. Production
pulls a different build: `Build & Push` builds again from the squash commit,
and three things can make that image differ from anything a gate saw. This
repository's branch protection does not require a PR to be up to date with
`main` (`strict: false`, read 2026-10-06), so two green PRs can merge into a
combination no PR built; `apk upgrade` and the Python lock's
transitive set resolve when the image is built; and the release adds
`linux/arm64`, which no other gate scans. The weekly scan reads the amd64 half
only, up to a week later. So `Scan Pushed Image` scans the release's own push
before production moves (#634):

- **By digest.** The image ref is `zimmertr/bluebird@<digest>`, from
  `Build & Push`'s `digest` output, so the bytes scanned are the bytes
  pushed rather than whatever a name resolves to when the scan runs.
- **Once per platform.** A matrix over `linux/amd64` and `linux/arm64`, with
  `fail-fast: false` so both report. The digest names the multi-platform
  index; `TRIVY_PLATFORM` picks the half each leg reads, and without it both
  legs would read amd64.
- **One definition of a failure.** The same `trivy-action` pin,
  `ignore-unfixed`, `trivy.yaml` and `.github/actions/trivy-crit-high` as the
  PR gate and the weekly scan, so the three judge an image alike.
- **No credential.** The image is public, so the job does not log in to
  Docker Hub and holds nothing a scanner could read.

`Create GitHub Release`, `Update Kubernetes Manifests` and `Bump Helm Chart
appVersion` all need the scan. A scan that fails therefore leaves production
and the chart's default image on the previous release and makes no GitHub
release, while the image and the `v<semver>` tag stay published, as with any
failure after the push. The release is held as well as the two bumps because
`bluebird-helm`'s own release resolves the chart's `appVersion` from
`releases/latest` at package time: a failed version marked Latest would
become the chart's default image at the next chart release, whatever the
bump job did (maintainer, 2026-10-06). The fix is
the next release, the same remedy as the [scheduled image
scan](#scheduled-image-scan): merge the open Dependabot base-image PR, or if
there is none, clear the buildx cache and release. Re-running the run does
not help a real finding; it does help a scan that failed on a download, and
"Re-run failed jobs" keeps `Build & Push`'s digest from the first attempt.

A version whose scan failed is left as an image and a tag with no release,
like the image-without-a-tag case under [Finishing a failed
release](#finishing-a-failed-release), and the weekly scan, which reads the
Latest release, keeps scanning the version production runs.

The job is newer than the [release path](#the-release-path) measurements
below, and adds its time to every release and to the merge-to-live path.
`release.yml` can only run as a real release, so the first release after the
job merged is the first measurement.

### Two independent knobs reach prod

- **Image tag** — Path 1, a self-merging PR (`chore/bluebird-image`).
- **Chart version (stable)** — Path 2 → Path 3, a self-merging PR
  (`chore/bluebird-stable-chart`); prod, and the one that triggers a canary.
- **Chart version (preview)** — Path 2, a self-merging PR
  (`chore/bluebird-preview-chart`); ephemeral per-PR environments only, so it
  never touches prod.

A routine code change ships via the image tag alone; the chart version only
moves when the chart itself changes (or its default `appVersion` is bumped).
A chart change is reviewed in `bluebird-helm`, on the PR that writes it, where
the diff is the actual edit rather than a version string; the
`Kubernetes-Manifests` bump is the delivery of an already-reviewed chart.

### Writes into Kubernetes-Manifests

`Kubernetes-Manifests/main` **forbids direct commits**. All three automated
writes above go through a PR, and the thing they wait on is `pr.yml` /
**`Validate manifests`**, a required check in that repo which:

1. YAML-parses every changed `.yml`/`.yaml`. This is the failure mode the bump
   jobs can actually cause — the two chart bumps rewrite version lines with
   targeted `sed` (the image bump uses `kustomize edit set image`), and a regex
   matching more than intended corrupts the file.
2. Renders every kustomization affected by the PR with `kustomize build
   --enable-helm` (nearest-ancestor mapping from changed files, skipping
   `deprecated/` and `*.disable*`). The render pulls each `helmCharts` chart,
   so a chart version that doesn't resolve fails the PR instead of failing an
   Argo CD sync. It pulls no image: `images.newTag` is only a string to
   kustomize, so an image tag that does not exist passes this check and fails
   later, when the canary pod cannot pull it. A PR that touches
   `pr.yml` itself adds `public/bluebird` to its own render list, so a tool bump
   cannot pass green on an empty target list.

A fourth writer into that repo is not one of these jobs: Renovate
(`.github/renovate.json`) auto-merges minor and patch updates after a seven-day
release age, gated on the same `Validate manifests` check. It does not touch
the `zimmertr/bluebird` image tag or the `bluebird-helm` chart version: both
are disabled there (Kubernetes-Manifests#1363), because the release jobs above
are their only writers, and a higher tag that appeared in Docker Hub without
passing this repo's checks must not reach production by being newer.

Three constraints hold this together, and breaking any one of them silently
strands the automation:

- **Auto-merge needs something to wait on.** `gh pr merge --auto` is rejected on
  a PR with nothing blocking it (`Pull request is in clean status`). The
  required check is what makes the queue non-empty; without it, arming
  auto-merge errors out. Each Kubernetes-Manifests writer falls back to a plain
  `gh pr merge --squash` to cover the narrow window where the check already went
  green; Path 1's `bluebird-helm` appVersion PR is the exception and arms
  `--auto` only.
- **Auto-merge is re-armed on every release**, on the update path as well as
  the create path, because GitHub disables it on any force-push to the head
  branch — and every one of these jobs force-pushes its fixed branch each
  release. On a failing required check GitHub disarms auto-merge itself and
  notifies the arming account.
- **"Require branches to be up to date" must stay off** (`strict: false`). These
  branches are cut fresh off `main` and force-pushed; nothing ever rebases them,
  so requiring an up-to-date branch would deadlock whichever PR merged second.

The `GH_PAT` used for all of this needs contents + pull-requests write on
`Kubernetes-Manifests` (see [The release credentials](#the-release-credentials)),
and `allow_auto_merge` must be on there. Concurrent
writes to the *same* file are safe: the image tag and the stable chart version
both live in `public/bluebird/kustomization.yml` but on lines far enough apart
that a three-way merge of the two branches never conflicts.

### The release credentials

**What `GH_PAT` is today.** One personal access token of the owner's, stored
as a repository-level Actions secret in both `bluebird` and `bluebird-helm`
and in no environment. Three jobs hold it: `update-manifests` and
`bump-chart-appversion` here, and `bump-manifests` in `bluebird-helm`. Each
clones the target repository with it, force-pushes a fixed branch, opens or
edits the PR, and arms auto-merge. It has to be a token other than
`GITHUB_TOKEN` for two reasons: `GITHUB_TOKEN` cannot write to another
repository, and a merge made with it does not fire the target's `on: push`
workflows, so the chart bump would land and never publish. Its exact scope and
expiry cannot be read from a workflow; the jobs need contents and
pull-requests write on `Kubernetes-Manifests` and `bluebird-helm` and nothing
else.

What it can do is larger than what the jobs do with it. `Kubernetes-Manifests`
requires a PR and the `Validate manifests` check but no approving review, so a
holder of the token can open, arm and merge a PR there that changes any
directory, and Argo CD syncs it. A writer to that repository is cluster-admin
by construction: its `root-appprojects` application syncs every
`appproject.yml`, so a narrower Argo CD project cannot contain one. The
containment is on the write side.

**What keeps it in.** No job that holds a write credential runs third-party
code before it: every `uses:` in the three repositories is a full commit SHA
with its version in a comment (a tag is a pointer its owner can move, and an
action in a job can rewrite every later step through `$GITHUB_PATH` and
`$GITHUB_ENV`), and `update-manifests` installs `kustomize` from the upstream
release tarball checked against its published SHA-256 rather than through a
setup action. Dependabot reads the version comments and moves each pin by PR.
GitVersion and Helm are pinned to exact versions for the same reason. A value
from the event or a step output reaches a `run:` script through `env:`, never
pasted into it. Every `actions/checkout` sets `persist-credentials: false`
except the two that push a tag (`build-and-push` here and the chart's
`publish`). `backend/tests/test_workflow_pins.py` fails an unpinned action, a
pasted expression, a release job without the `main` check, or a base image
without a digest in this repository.

**What the maintainer still owes (#632).** These are repository settings and
credentials, which no pull request can make:

1. In `bluebird` and `bluebird-helm`, create an environment named `release`
   with a deployment branch policy of `main` only (Settings, Environments,
   "Selected branches and tags", add `main`).
2. Replace `GH_PAT` with a credential that only does this job. Preferred: a
   GitHub App owned by the account, installed on `Kubernetes-Manifests` and
   `bluebird-helm` only, with Contents and Pull requests read and write; store
   its app ID and private key as `release` environment secrets, and mint a
   one-hour token per run with `actions/create-github-app-token` (pinned by
   SHA like every other action). Its merges still fire `on: push`, and bot
   commits stop carrying the owner's identity. Acceptable: a fine-grained
   token limited to those two repositories with the same two permissions and
   an expiry, stored as a `release` environment secret.
3. Move `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` into the same environment
   (the preview and prerelease jobs still need Docker Hub, so those keep a
   repository secret or get an environment of their own), and delete the
   repository-level `GH_PAT`.
4. Give the jobs that use them `environment: release`: `build-and-push`,
   `update-manifests` and `bump-chart-appversion` here; `publish`,
   `artifacthub-metadata` and `bump-manifests` in `bluebird-helm`. A job
   that names an environment it cannot deploy to fails rather than running
   without it, which is the point of the branch policy.
5. Turn on "Require actions to be pinned to a full-length commit SHA" in each
   repository's Actions settings, now that every reference is.
6. Once the bot has an identity of its own, `Validate manifests` can refuse
   a PR from it whose diff is anything but the one expected line. While the
   bot is the owner, a branch-name check would stop nothing.

### What a stable chart bump costs

Most chart releases are `appVersion`-only and change nothing in prod's render:
`bluebird.labels` — the only helper carrying `app.kubernetes.io/version` — is
applied to *object* metadata, while the Rollout's pod template uses
`bluebird.selectorLabels`, which omits it; and `bluebird.image` does default to
`.Chart.AppVersion`, but KM's `images:` transformer pins an explicit `newTag`
that wins. The pod template is unchanged, so merging such a bump triggers no
canary at all.

A chart release that *does* change prod — a new default, a new resource — rolls
out as a canary like any other pod-template change, and `Validate manifests` has
already rendered it against prod's `values.yml`.

The case to watch is a chart change that needs a matching edit to
`public/bluebird/values.yml`, which the bot does not make. Helm silently ignores
a value whose key the chart no longer reads, so the render still succeeds while
that setting quietly reverts to the chart default. Nothing in this pipeline
catches it; the place to catch it is the `bluebird-helm` PR that renames or
drops the value, by shipping the `Kubernetes-Manifests` edit alongside it.

> A branch-guarded render-diff step used to sit at the end of `Validate
> manifests`, failing any `chore/bluebird-stable-chart` PR whose prod render
> moved. Removed in Kubernetes-Manifests #550. It keyed on `github.head_ref`, so
> its only escape was reopening the identical one-line diff from a
> differently-named branch (#494 → #497), and because the bot branch is fixed
> and force-pushed, one held version blocked every later one. It held 2 of 30
> bumps, both intended chart-default changes, and left prod eight chart versions
> behind.

## Inside the prod canary (Argo Rollouts)

Every path above ends the same way: Argo CD applies a change to the Rollout's
**pod template** — the image tag (Path 1) or the chart/values (Path 2 → 3) —
and the Argo Rollouts controller takes over. This section is what "canary
rollout" means concretely in this cluster. There are **no `pause` steps and no
manual promotion**: a release either promotes itself to 100% or aborts itself
back to stable, which is what makes the unattended loops in the next section
safe — a Dependabot auto-merge faces exactly the same gates as a hand-cut
release.

The moving parts ("KM" = `Kubernetes-Manifests/public/bluebird/`):

| Resource | Comes from | Role |
| --- | --- | --- |
| `Rollout bluebird` | chart `workload.yaml`; strategy, steps, and history limits from KM `values.yml` | the workload — `useRollout: true` turns the chart's Deployment into a Rollout |
| `Service bluebird` / `bluebird-canary` | chart | stable/canary endpoints; the controller injects `rollouts-pod-template-hash` selectors so each always tracks the right ReplicaSet |
| `VirtualService bluebird` | chart | the three weighted routes `bluebird-stable`, `bluebird-api-public` and `bluebird-api-keyed`, whose destination weights the controller owns |
| `AnalysisTemplate version-check` | KM `resources/analysisTemplate-versionCheck.yml` | identity gate — the canary must serve the exact image being rolled out |
| `AnalysisTemplate api-test` | KM `resources/analysisTemplate-apiTest.yml` | functional gate — a real `/api/analyze` through Overpass and Open-Meteo |
| `AnalysisTemplate error-rate` | KM `resources/analysisTemplate-errorRate.yml` | soak gate — the canary's 5xx share read from Prometheus, three times a minute apart |

The first two gates are Argo `web` providers and the third is a `prometheus`
provider, so the controller makes every call itself: a release starts no Job
pods and mounts no scripts.

### The data plane

cert-manager terminates TLS at the Istio ingress gateway, which routes by the
`bluebird` VirtualService. Its named routes `bluebird-stable` (the SPA), `bluebird-api-public` (the API
allowlist) and `bluebird-api-keyed` (the keyed analyze routes) each carry two
weighted destinations —
the stable and canary Services — and the Rollouts controller owns those weights
while a release is in flight. The public hostnames reach the gateway through a
Cloudflare Tunnel; [TRAFFIC.md](TRAFFIC.md) has that half:

```mermaid
flowchart LR
    user(["User"])
    gw["Istio ingress gateway<br/>TLS: cert-manager"]

    subgraph NS["namespace bluebird-system"]
        vs["VirtualService bluebird<br/>routes bluebird-stable, bluebird-api-public,<br/>bluebird-api-keyed"]
        ssvc["Service bluebird<br/>(stable)"]
        csvc["Service bluebird-canary"]
        srs["stable ReplicaSet<br/>pods labeled role=stable"]
        crs["canary ReplicaSet<br/>pods labeled role=canary"]
    end

    user --> gw --> vs
    vs -->|"weight 100 - W"| ssvc --> srs
    vs -->|"weight W (controller-managed)"| csvc --> crs
```

`trafficRouting.istio` in KM `values.yml` is what hands those weights to the
controller. It is not optional decoration: the `setCanaryScale` step below is
rejected without it, because absent a router Argo derives the canary's traffic
share from its replica count — the very dial `setCanaryScale` overrides. Prod
sat `Degraded` on exactly that once, when a comment-trimming commit deleted the
block and left the step behind.

### The four steps

Prod runs an HPA, `minReplicas: 3` to `maxReplicas: 10`, and the chart omits
`spec.replicas` so Argo CD never fights it. The canary is pinned to a single pod for the whole
gate, so a release adds one pod rather than a second full set, and it adds it
without moving any user traffic onto it.

```mermaid
flowchart TD
    apply["Argo CD applies a new pod template<br/>(image newTag via Path 1, chart/values via Path 2)"]
    detect["Rollouts controller detects the new revision"]

    subgraph GATE["Steps 0–3 — the whole gate runs at 0% user traffic"]
        scale["setCanaryScale: replicas 1<br/>one new-version pod behind Service bluebird-canary<br/>VirtualService still 100/0"]
        vc["AnalysisRun version-check (web provider)<br/>GET canary /api/version<br/>must match the image tag being rolled out"]
        at["AnalysisRun api-test (web provider)<br/>POST canary /api/analyze<br/>must return at least one ranked peak"]
        er["AnalysisRun error-rate (prometheus provider)<br/>canary 5xx share below 5%<br/>count 3, interval 60s — 120 s of wall clock"]
    end

    done["Promoted — canary ReplicaSet scales to 3 and becomes stable,<br/>Service bluebird repointed at it, old ReplicaSet scaled down"]
    abort["Aborted — canary scaled to 0, VirtualService never left<br/>100% stable, Rollout Degraded<br/>(Argo CD: Synced + Degraded)"]
    fix["Fix forward: the next release via Path 1<br/>(no rollback; see When a release is bad)"]

    apply --> detect --> scale --> vc
    vc -->|"passes"| at
    at -->|"passes"| er
    er -->|"passes"| done
    vc -->|"fails"| abort
    at -->|"fails"| abort
    er -->|"fails"| abort
    abort -.-> fix
```

**Step 0 — `setCanaryScale: {replicas: 1}`.** One pod of the *new* version comes
up behind `Service bluebird-canary`, whose hash selector the controller has
already repointed at the canary ReplicaSet. The VirtualService is untouched at
100/0, so ordinary users keep hitting stable for the entire gate. The step
completes only once that pod counts as Available, which means both analyses
below are guaranteed to run against a Ready pod and neither needs its own
startup grace.

**Step 1 — `version-check`, the identity gate.** A `web` provider GETs
`http://bluebird-canary.bluebird-system.svc.cluster.local:8000/api/version` and
reads `$.version`. The step passes the image being rolled out into the template
via `fieldRef` on `spec.template.spec.containers[0].image`, so the condition is
`hasSuffix("{{args.version}}", ":" + result)` — the canary must report the exact
release, not merely something semver-shaped. The `:` is load-bearing: it anchors
the comparison so a canary reporting `0.29.6` cannot satisfy an image tagged
`10.29.6` or `0.29.60`. `count: 1`, `failureLimit: 0` — nothing external is in
the path, so there is nothing legitimate to flake and nothing to retry.

**Step 2 — `api-test`, the functional gate.** Same provider, a single POST to
the canary's `/api/analyze` with a fixed body: a known-good polygon (Tiger
Mountain, Issaquah WA), `destination_types: [peak]`, `forecast_mode: current`,
`limit: 3`. One condition covers the whole chain — `len(result.results) >= 1` is
satisfiable only if Overpass discovered candidates, the ranking produced rows,
and Open-Meteo attached a forecast to them. `count: 1`, `failureLimit: 0`, 120 s
timeout. The flip side is deliberate: an extended Overpass or Open-Meteo outage
*blocks* releases rather than skipping validation, on the grounds that a release
which cannot serve a real analysis is not healthy whatever the reason.

Both gates hit the canary Service in-cluster rather than the public hostname,
which is why the controller needs no route back in through the gateway. The
cost is that ingress and TLS are no longer on the gate path; they are covered by
the stable traffic that never stopped flowing.

**Step 3 — `error-rate`, the soak gate.** A `prometheus` provider reads the
canary pods' 5xx share —
`bluebird_forecast_http_requests_total{role="canary",status=~"5.."}` over the
same series without the status filter, both as a 2-minute rate — and requires
it below `0.05`. `count: 3`, `interval: 60s`, `failureLimit: 1`: three readings
a minute apart, of which one may fail. **This is 120 s of wall clock and the
single largest segment of the whole merge-to-live path** (see [Where the time
goes](#where-the-time-goes)).

One 5xx must not abort a release (#519). The canary's 2-minute window holds
about sixteen requests, so one 5xx is over the 0.05 threshold on its own, and
one `api-test` retry after an upstream 502 would fail two readings in a row.
The query therefore answers `0` in two cases, and the true ratio otherwise:

- **Fewer than two 5xx in the window** (a `>= bool 2` factor on the 5xx
  `increase()`). Two is the smallest count that one retry cannot reach:
  `increase()` of a single 5xx reads at most 1.33 after extrapolation
  (measured on the 2026-09-23 canary). A real outage gives many 5xx in two
  minutes and still fails; two 5xx in sixteen requests is 0.125.

  That count holds only on a series that existed before its first 5xx.
  `increase()` measures from an earlier sample, so a series created by its
  first 5xx reads 0 for that one, and the gate would forgive two 5xx on it.
  The pod therefore creates, at 0 when it starts, every 5xx series the
  canary's own requests can produce (`CANARY_ROUTES` in
  `backend/app/telemetry.py`): `GET /healthz`, `GET /api/version` and
  `POST /api/analyze`, each at 500 and at every 5xx its OpenAPI entry
  declares, all with `client="api"`. A 5xx on any other series (another
  route, an undeclared status, or `client="web"`) is still not counted until
  the second one on that series. At weight 0 the canary serves nothing else.
- **Fewer than 10 requests in the window.** The kubelet probes alone send 16
  per window (readiness every 10 s, liveness every 30 s; the measured median
  over 40 pods), and a window under 10 is one that a pod start or stop cuts
  short. 10 stays under 16, so a canary that runs normally is always judged.

Every term keeps `or vector(0)`, so an empty series answers 0 and never errors
the measurement.

Two things about it are worth stating plainly, because they bound what the
120 s buys. The `role` label is real — it reaches Prometheus through the
Rollout's `canaryMetadata`, verified against the live series — so the query is
not silently scoped to nothing. But the canary sits at **0% user traffic** for
the entire gate, so the only requests in that window are the two analysis
probes above plus the kubelet's `/healthz` probes. What the gate therefore
detects is a pod that 5xxs on its own, or on a health probe, rather than a pod
that 5xxs under real load. `or vector(0)` / `clamp_min(…, 1e-9)` make the no-traffic case read as a
clean `0` rather than as an error, which is why an idle canary passes rather
than flaking.

**Promotion.** There is no weighted soak: once step 3 passes, the step index
moves past the end of the list, which lifts the `setCanaryScale` pin. The canary
ReplicaSet scales up to whatever the HPA asks for, three at the floor, *becomes* stable — the controller
repoints the `bluebird` Service's hash selector at it and returns the route to
100/0 against the new pods — and the old ReplicaSet scales down. The cutover is
therefore all-at-once after the gate rather than gradual. History is kept
deliberately short for Argo CD UI legibility by a single knob:
`revisionHistoryLimit: 1`, current plus one previous ReplicaSet. That one knob
bounds `AnalysisRun`s too, because a run whose ReplicaSet is gone is deleted
outright, so what survives is the gates of the last two releases. The
`successfulRunHistoryLimit` / `unsuccessfulRunHistoryLimit` counts are
deliberately **not** set: the controller's defaults sit above that cap and
never bind, and a count low enough to bind is a trap. Those counts are per
Rollout rather than per release, so anything below the number of analysis steps
deletes a gate's run the instant it passes — which is what a former
`successfulRunHistoryLimit: 1` did, leaving green releases looking like they
had only ever run one gate.

**Abort.** If any of the three analyses fails — or someone runs `kubectl argo
rollouts abort` — the canary ReplicaSet scales to zero and the Rollout reports
**Degraded**. Nothing has to snap back: the stable ReplicaSet was never scaled
down and the VirtualService never left 100% stable, so no user request was ever
served by the version that failed.

### How this coexists with Argo CD

The `bluebird` Application is generated by the `public` ApplicationSet
(`Kubernetes-Manifests/public/applicationset.yml`) with automated sync, prune,
and **`selfHeal`** — which would instantly revert the controller's weight
edits mid-rollout. The ApplicationSet therefore carries an
`ignoreDifferences` jq rule matching exactly the destination weights on the
three routes the controller weights (`-stable`, `-api-public`, `-api-keyed`),
so live weight drift is invisible to the diff. A weighted route missing from
that rule is one `selfHeal` would put back mid-rollout. Argo CD's health assessment understands Rollouts natively: the app shows
*Progressing* during a canary, *Healthy* at promotion, and *Degraded* after an
abort **while still being Synced** — an aborted rollout is Rollouts state, not
git drift, so `selfHeal` won't retry it. Remediation flows through git like
everything else: ship the fix as the next release via Path 1; the next
pod-template change supersedes the aborted revision and starts a fresh canary.
`kubectl argo rollouts retry` exists for one-off flakes, but the normal path is
git. [When a release is bad](#when-a-release-is-bad) is the whole procedure.

## When a release is bad

The rule is **fix forward**: a bad release is repaired by the next release,
never by putting an older version back. There is no rollback procedure, and
none is supported. Three facts make it the only rule that holds here:

- **A merge to `main` releases.** `Update Kubernetes Manifests` cuts
  `chore/bluebird-image` fresh from `Kubernetes-Manifests/main` on every
  release and sets `newTag` to that release, so a hand pin to an older tag
  lasts only until the next merge, and nothing warns when it is overwritten.
- **A version cannot be withdrawn.** Docker Hub tag immutability is on for
  every tag of `zimmertr/bluebird` (rule `.*`), and this repository has GitHub
  immutable releases on. A bad image, its `v<version>` tag and its GitHub
  release stay public for good, so the next version is the only one that can
  carry the fix.
- **The cluster follows git.** `Kubernetes-Manifests/main` takes no direct
  commit, and the `bluebird` Application runs `selfHeal`, which puts back
  anything changed on the live objects, a `kubectl argo rollouts undo`
  included.

The pipeline is also the only supported way to deploy. An image built by hand
reports `dev` from `/api/version` unless it is given the build args of Path 1,
step 2, so the canary's `version-check` refuses it; and it carries one
architecture and no SBOM or provenance. Decision record
[0083](decisions/0083-fix-forward-no-hand-deploy.md) has the reasoning. A
release run that fails before its image reaches the cluster is a different
problem, with its own recovery: [Finishing a failed release](#finishing-a-failed-release).

### Is it the release, or something else?

Start here. Every command below only reads.

```bash
# The version serving users: the stable pods answer this.
curl -s https://bluebirdforecast.com/api/version

# The rollout: its step and status, the stable and canary images, and one
# AnalysisRun per gate.
kubectl argo rollouts get rollout bluebird -n bluebird-system

# What each gate measured. A run is named bluebird-<hash>-<revision>-<step>:
# step 1 is version-check, 2 is api-test and 3 is error-rate.
kubectl -n bluebird-system get analysisrun
kubectl -n bluebird-system get analysisrun <name> \
  -o jsonpath='{range .status.metricResults[*].measurements[*]}{.phase}{"\t"}{.message}{"\n"}{end}'

# Whether Argo CD applied what git says.
kubectl -n argo-system get application bluebird

# What the pods logged. The label leaves out the preview pods, which share
# the namespace.
kubectl -n bluebird-system logs -l app.kubernetes.io/instance=bluebird -c bluebird \
  --since=30m --prefix | grep -E '\[(WARNING|ERROR)'
```

Then open the `Bluebird` dashboard in Grafana (its source is
`Kubernetes-Manifests/observability/kube-prometheus-stack/files/bluebird-dashboard.json`).
**Pods by build** shows which version each pod runs. **Errors by status** and
**API latency** say whether users are hurt, and **Container restarts per hour**
catches a crash loop. A problem that starts when **Pods by build** changes over
is the release. A problem that starts while the build holds still is most often
an outside service. **Errors by status** does not split by route; in Grafana's
Explore the same counter does:

```promql
sum by (route, status) (increase(bluebird_forecast_http_requests_total{status=~"5.."}[15m]))
```

### Which outside service?

The pod counts every call it makes to a provider, and the dashboard's Suppliers
row plots each count. The table gives the series, its panel, and the text to
look for in the logs above.

| Provider | What the pod fetches | Metric and panel | Log text |
| --- | --- | --- | --- |
| Overpass | discovery and pasted coordinates (`POST /api/destinations`, and the API's analyze routes) | `bluebird_forecast_overpass_requests_total` by `mirror` and `outcome`, and `bluebird_forecast_overpass_fallback_total` by `mirror`: **Overpass attempts by mirror and outcome**, **Overpass failovers per hour** | `Overpass endpoint <url> failed:` |
| Open-Meteo | the API's analyze routes only: the canary's `api-test` and keyed callers | `bluebird_forecast_openmeteo_requests_total` by `service`, `outcome` and `quota`, and `bluebird_forecast_openmeteo_rate_limited_total` by `scope`: **Open-Meteo attempts by outcome**, **Open-Meteo 429s per hour by scope** | `request failed:`, `rate limited (` |
| NIFC, the Forest Service, NOAA HMS, SNODAS | the four overlay snapshots | `bluebird_forecast_snapshot_refresh_failures_total` by `provider`: **Overlay snapshot refresh failures per hour** | `refresh failed (`, `fetch failed with nothing cached to fall back on` |
| Nominatim | the search box (`GET /api/geocode`) | none | `Nominatim request failed:` |

Two cases need a second look:

- **The web app's forecasts never touch the pod.** Each visitor's browser
  fetches Open-Meteo itself (Outbound in [TRAFFIC.md](TRAFFIC.md#outbound-what-calls-what)),
  so a forecast outage that users see is absent from every series above. Ask
  Open-Meteo directly:
  `curl -s -o /dev/null -w '%{http_code}\n' 'https://api.open-meteo.com/v1/forecast?latitude=47.49&longitude=-121.95&hourly=temperature_2m&forecast_days=1'`.
- **A shed is the pod's own budget, not the provider.**
  `bluebird_forecast_upstream_shed_total` by `provider` and `mechanism`
  (**Upstream sheds**) and the log tokens `event=budget_exhausted`,
  `event=gate_shed` and `event=weight_shed` mean the pod refused work before
  it reached the provider. [LIMITS.md](LIMITS.md) has the caps and the
  `429`/`502`/`503` each one answers with.

An outside outage is not a release problem, and nothing needs to ship. A
release that starts during a lasting Overpass or Open-Meteo outage fails
`api-test` and aborts on its own, which is the gate working
([Step 2](#the-four-steps)).

### Ship the fix

1. Open a PR in the repository that holds the defect: this one for the app,
   `bluebird-helm` for the chart. The fix can be a revert of the bad PR. Give
   it a `fix:` title: GitHub's revert button titles it `Revert "..."`, and a
   revert ships as a new patch version like any other fix, never as the old
   version.
2. Merge it. Path 1 builds the next version and opens `chore/bluebird-image`,
   which merges itself once `Validate manifests` passes; a chart fix travels
   Path 2 instead. [Merge to live](#merge-to-live) has the time each stage
   takes.
3. Follow it:

   ```bash
   gh run list -R zimmertr/bluebird --workflow release.yml --limit 3
   gh pr list -R zimmertr/Kubernetes-Manifests --head chore/bluebird-image --state all --limit 1
   kubectl argo rollouts get rollout bluebird -n bluebird-system --watch
   ```

4. The fix is live when `/api/version` reports the new version.

A defect in `public/bluebird/values.yml` or in an analysis template is fixed by
a `Kubernetes-Manifests` PR to that file. That is a configuration change and
goes through `Validate manifests` like every other write; a PR that sets
`newTag` to an older version is not a fix, for the reasons above.

### While the canary runs

There is nothing to do. Users stay on the stable version through all three
gates, because the canary takes no user traffic until it is promoted. What the
operator sees meanwhile:

- Argo CD shows `bluebird` as `Progressing`. `kubectl argo rollouts get` shows
  the step, the canary image beside the stable one, and the running
  AnalysisRun. `/api/version` still reports the old version, and **Pods by
  build** shows one pod of the new version beside the stable set.
- When a gate fails, the Rollout aborts itself: the canary scales to zero, the
  Rollout reports `Degraded`, and Argo CD shows `Synced` and `Degraded`.
  `/api/version` never changed, and no user request reached the failed
  version. Read the failed AnalysisRun's measurements with the command above,
  then ship the fix as the next release. It supersedes the aborted revision and
  starts a fresh canary.
- Do not promote by hand: `kubectl argo rollouts promote --full` skips the
  gates that are left (revision 209 went out that way, see
  [Merge to live](#merge-to-live)). Do not `undo` either, for the `selfHeal`
  reason above. When the failed measurement is plainly an outside outage, such
  as `received non 2xx response code: 502` from `api-test`,
  `kubectl argo rollouts retry rollout bluebird -n bluebird-system` runs the
  gates again on the same version once the provider is back. It moves no
  version, so it is not a rollback.

## Where the time goes

Measured on 2026-09-15 from the GitHub Actions API, the Argo CD `Application`'s
sync history, and the Argo Rollouts controller's own log (issue #368). Every
number below is an observation, not a budget. Re-measure before citing one: the
method is written beside each figure so it can be repeated.

### The pull request path

`pr.yml`, 15 successful runs carrying `Lighthouse Budgets` (that job landed in
#367; runs before it had a 62 s median, and the older figure is not comparable).

| Job | Median | Range |
| --- | --- | --- |
| `Lighthouse Budgets` | 92 s | 81–124 s |
| `Docker Build` | 57 s | 38–63 s |
| `Backend Tests` | 29 s | 27–33 s |
| `Frontend Typecheck & Tests` | 26 s | 24–31 s |
| `Python Lint` | 9 s | 6–10 s |
| **whole run** | **147 s** | 140–193 s |

A sixth job stood in this table when it was measured, `Aggregation vectors in
sync` at a 6 s median, and #380 removed it: the browser's suite now reads the
backend's committed vectors rather than a copy, so there are no two files to
diff. The whole-run figure is unchanged, because that job was never on the
critical path.

The frontend job grew 5 s on 2026-09-15 when ESLint joined it (issue #379):
2 s to install the linter's own package and 3 s to lint 57 sources. It is not on
the critical path, so the whole run is unchanged.

The frontend job moved from Node 22 to Node 26 on 2026-09-22, when it began to
read `.node-version` (issue #401). Over four runs it measured a 31 s median
(26 to 43 s) against 29 s (25 to 35 s) for the twelve runs before. `setup-node`
now takes 5 to 6 s where it took under 1 s, because the runner image carries
Node 22 in its tool cache and downloads 26. Lint and Vitest ran no slower on 26.
The job is still off the critical path.

**The critical path is two jobs long**, and only two. Four jobs start within
about 3 s of each other; three of them finish while `Docker Build` is still
building. `Lighthouse Budgets` `needs` it, so it starts at about 63 s and adds
its own 92 s. Everything else is free.

Inside `Docker Build`, by median: the image build 21 s, the Trivy scan 11 s,
building the hadolint **Docker action** 5.5 s, `setup-buildx` 4 s, job setup
3 s, the smoke test 3 s.

Inside `Lighthouse Budgets`: the audit itself 52 s, then **24 s of getting back
to an image that already existed** — `setup-buildx` 8 s and a cache-replay
build 16 s. That hand-off was chosen over passing a 200 MB image between jobs
and has never been timed against the alternative; 24 s is what it costs, and it
is now on the path a person waits on.

Three consequences, and two of them are reasons *not* to optimise:

- **Nothing done to the three short jobs moves the wall clock.** They finish
  inside `Docker Build`. This is why caching pip in the Python jobs was measured
  and then removed rather than kept: see the `setup-python` comments in
  `pr.yml`.
- **The Trivy database is already cached.** `trivy-action` wraps its own
  `actions/cache` around both the pinned binary (42 MB, 2.1 s to restore) and
  the vulnerability DB (80 MB, 3.7 s), keyed `cache-trivy-<date>` with
  `restore-keys: cache-trivy-`. `image-scan.yml` and `release.yml`'s scan use
  the same action and therefore the same key, so they already share one copy. There is nothing
  to add.
- **The npm cache was costing more than it saved.** `npm ci` measured 4 s on a
  cold cache and 4–5 s on a warm one, while restoring the cache cost 2 s inside
  `setup-node`. It also held 50 entries and 2.80 GB. Removed.

**`pr.yml` triggers on `pull_request` only.** It used to carry a `push` trigger
as well, and ran the whole workflow twice per commit: the two events name
different refs, so the `concurrency` group could not collapse them, and all 20
sampled runs were such a pair. They ran in parallel, so nobody waited longer —
the cost was a second set of runners per commit and two races to write the same
cache keys, which fed straight into the budget problem below. The trade is that
a branch pushed with no pull request open gets no checks until one is opened.
Every check branch protection requires is a `pull_request` check anyway.

Branch protection requires five contexts: `Python Lint`, `Docker Build`,
`Frontend Typecheck & Tests`, `Backend Tests` and `Browser Smoke & Axe`
(read from the branch protection API on 2026-10-01). **A job here cannot be
renamed or deleted on its own**: branch protection matches the name exactly,
and a name it requires that no longer reports strands every open pull request.
`Aggregation vectors in sync` was required too from 2026-09-15 until #380 deleted
the job, and it had to leave the required list in the same change.

### The repository's Actions cache

Measured 2026-09-15, and the single largest source of variance in every build
number on this page: **10.73 GB across 1,297 entries**, against GitHub's 10 GB
per repository. Over the limit means evicting least-recently-used entries
continuously, and what gets evicted is the buildx layer cache that `Docker
Build`, `Lighthouse Budgets` and `Build & Push` all read. A layer cache that is
sometimes there is what `Docker Build` ranging 38–63 s and `Build & Push`
ranging 36–142 s look like.

Where it was going:

| Holder | Entries | Size |
| --- | --- | --- |
| caches on **closed** pull requests' merge refs | 428 | 3.40 GB |
| `setup-node` npm caches, one ~56 MB copy per branch | 50 | 2.80 GB |
| everything else, mostly live buildx scopes | 819 | 4.53 GB |

GitHub scopes a cache to the ref that wrote it and **never reclaims a closed
pull request's** — 18 closed, merged pull requests were still holding 32% of
the whole budget. `cache-cleanup.yml` now deletes a pull request's caches when
it closes, and the npm cache is gone, which together is about 6.2 GB that stops
competing with the Docker layers.

Caches expire on their own after 7 days unread, so the cleanup only removes
entries that were going to die anyway; it removes them on the day the pull
request closes instead. To reclaim an existing backlog by hand, from a token
with `actions: write`:

```bash
gh cache list --limit 100 --json id,ref --jq '.[] | select(.ref | startswith("refs/pull/")) | .id' \
  | xargs -n1 gh cache delete
```

### The release path

`release.yml`, 20 full releases. Jobs hand off in about 2 s.

| Job | Median | Range |
| --- | --- | --- |
| `Determine Version` | 16 s | 12–31 s |
| `Build & Push` | 92 s | 36–142 s |
| `Create GitHub Release` | 13 s | 11–16 s |
| `Update Kubernetes Manifests` | 11 s | 8–18 s |
| `Bump Helm Chart appVersion` | 10 s | 8–13 s |
| **whole run** | **151 s** | 88–311 s |

`Scan Pushed Image` (#634) is newer than these runs and is not in the table;
it runs between `Build & Push` and every later job, so its time adds to the
whole run and to the first segment of [Merge to live](#merge-to-live).

`Build & Push` is the multi-arch build, and within it one step dominates.
In release run `34916818009` the **arm64 `npm run build` took 35.6 s against
3.0 s for the identical amd64 step** — the emulation penalty on the one stage
whose output does not depend on the architecture at all. Everything else in the
arm64 half was a cache hit. That is why the Dockerfile's frontend stage is
pinned with `--platform=$BUILDPLATFORM`: the stage runs once, natively, and both
images copy the same `dist/`. Verified output-neutral by building the frontend
for amd64 and cross-building it from arm64 and hashing `/app/static` in each
resulting image: identical, 21 files.

`Update Kubernetes Manifests` does **not** wait on `Create GitHub Release`.
Nothing it does needs the release to exist — it links to a URL that resolves by
the time a human opens the PR — so waiting put 13 s of release-note generation
in front of every production deploy. `Bump Helm Chart appVersion` still does
wait, and must: `bluebird-helm/release.yml` resolves `appVersion` at package
time from `repos/zimmertr/bluebird/releases/latest`, so opening that PR early
races the resolver onto the previous version.

### Merge to live

The path a human actually waits on, end to end. Segment medians, from the
sources named in the last column.

| Segment | Median | Range | Measured from |
| --- | --- | --- | --- |
| squash-merge → image bump PR opened | 133 s | 88–168 s | `release.yml` run start → `Update Kubernetes Manifests` end (n=20) |
| image bump PR open → merged | 20 s | 14–47 s | `chore/bluebird-image` PR `created_at` → `merged_at` (n=30) |
| merged → Argo CD begins syncing | 43 s | 4–182 s | merge commit → `Application.status.history[].deployStartedAt` (n=9) |
| Argo CD applies the sync | 4 s | 3–8 s | `deployStartedAt` → `deployedAt` (n=9) |
| canary pod up (`setCanaryScale`) | 21 s | 21 s | Rollout step 0 → 1 (revisions 206, 207) |
| `version-check` | 1 s | — | Rollout step 1 → 2 (revision 206) |
| `api-test` | 13 s | 13–55 s | Rollout step 2 → 3 (revisions 206, 207) |
| `error-rate` | **120 s** | fixed | Rollout step 3 → 4 (revisions 206, 207) |
| promotion + service cutover | 23 s | 21–25 s | step 4 → `RolloutCompleted` |
| stable scale-up, old ReplicaSet down | 30 s | 30–31 s | `RolloutCompleted` → `RolloutHealthy` |
| **total** | **~6 min 50 s** | | |

Two segments are larger than anything else and neither is a workflow:

- **`error-rate`, 120 s.** `count: 3 × interval: 60s`, fixed by the template.
  It is the biggest single segment of the path and it is a deliberate gate, not
  a knob. Its limits are written up under [Step 3](#the-four-steps).
- **Argo CD detection, 0–182 s.** There is **no webhook**: the Argo CD server is
  a cluster-internal `LoadBalancer` with no public ingress, so `main` moving in
  `Kubernetes-Manifests` is discovered by polling. The cluster runs the chart
  defaults, `timeout.reconciliation: 120s` with
  `timeout.reconciliation.jitter: 60s`, which is exactly the 0–180 s window the
  nine observations fall in. Shortening the interval shortens the segment
  proportionally and a webhook would cut it to about a second, but both are
  cluster changes rather than workflow ones, and 43 s sits next to the 120 s
  gate that follows it. Left at the chart defaults deliberately (TJ,
  2026-09-15).

One more thing the canary log says, and the reason the numbers above exclude
revision 209: that release was promoted by hand. The controller logged
`Rollout completed update to revision 209: Full promotion requested`, and
`error-rate` was terminated after 1 of its 3 readings, 12 s into its 120 s.
Revisions 206 and 207 ran the full gate, which is why they are the ones
measured.

## PR preview environments

Every PR builds an image; **owner-authored** PRs additionally get a live,
per-PR preview environment.

```mermaid
flowchart LR
    dev(["Developer / TJ"])

    subgraph BB["zimmertr/bluebird"]
        pr["PR opened / updated"]
        checks["pr.yml<br/>typecheck, ESLint, Vitest, ruff, mypy, pytest, OpenAPI + API-type drift,<br/>hadolint, docker build + Trivy scan (sticky comment),<br/>Lighthouse budgets, browser smoke + axe"]
        title["pr-title.yml<br/>PR Title: GitVersion reads the title<br/>(also on a title edit)"]
        preview["pr-preview.yml<br/>pull_request_target (same-repo gate)"]
        label["label: create pr container"]
        comment["sticky preview-URL comment"]
        ageout["preview-age-out.yml<br/>daily: label off quiet PRs"]
    end

    dhpr["Docker Hub<br/>zimmertr/bluebird-pr:pr-N-headsha"]

    subgraph CL["Cluster"]
        appset["ApplicationSet bluebird-pr<br/>pullRequest generator"]
        app["Application bluebird-pr-N"]
        env(["pr-N.ganymede.sol.milkyway"])
    end

    dev -->|open / push| pr
    pr --> checks
    pr --> title
    pr --> preview
    preview -->|build + push| dhpr
    preview -->|owner PR only| label
    preview --> comment
    label -->|Argo polls every 150s| appset
    appset --> app
    dhpr -->|image override| app
    app --> env
    pr -.->|PR closed: automated prune| env
    ageout -.->|removes| label
```

- `pr.yml`'s backend job runs `scripts/generate_openapi.py --check` after pytest.
  `backend/openapi.json` is committed so an API change lands as a reviewable diff
  instead of hiding inside Python, and this step fails the PR when the app and
  the snapshot disagree. Regenerate with `cd backend && python
  scripts/generate_openapi.py`. The script pins `APP_VERSION` to `dev` before
  importing the app, so `info.version` stays deterministic and a released build
  never reads as drift.
- `pr.yml`'s frontend job runs on the Node major named in `.node-version`,
  which `setup-node` reads through `node-version-file`. That file is the one
  place the major is written: the root `Makefile` reads it for every local
  check, and the `Dockerfile` keeps a literal `node:<major>-alpine` tag, because
  a `FROM` line reads no file and a build argument would hide the tag from
  Dependabot. `backend/tests/test_node_version.py` fails when that tag and the
  file disagree, so CI always tests the runtime the image builds with.
- `pr.yml`'s frontend job runs `npm run check:api` before the typecheck. The
  SPA's wire types are hand-written, and `frontend/src/api-schema.d.ts` —
  generated from the committed snapshot above — is what the typecheck holds them
  against, so the same contract change has to land on both sides of the repo in
  one PR. Regenerate with `cd frontend && npm run generate:api`. The generator
  is a package of its own (`frontend/tools/api-types`, with its own lockfile and
  its own Dependabot entry) because it needs the TypeScript 5 compiler API while
  the app runs TypeScript 7; the script installs it, so the job adds no step.
- `pr.yml`'s frontend job then runs **ESLint** (`npm run lint`), after the
  typecheck and before Vitest. It is `frontend/tools/eslint`, a second package
  apart for a sharper version of the same reason: typescript-eslint refuses
  TypeScript 7 outright, so the linter carries its own TypeScript 6. The rules
  are typescript-eslint recommended, `react-hooks/rules-of-hooks` and
  `react-hooks/exhaustive-deps` as errors, and the syntactic class and metric
  bans that used to be regular expressions inside `styles.test.ts` and
  `metrics.test.ts`, plus the per-file checks under `tools/eslint/checks/` that
  used to be `?raw` text tests (issue #408). Warnings fail the job
  (`--max-warnings 0`), which is what makes a suppression that silences nothing
  a build error. The script then runs `tools/eslint/selftest.js`, which lints
  the fixtures and fails unless each ban reports its own violation and nothing
  else, and each per-file check reports every message it carries: a selector
  that matches nothing otherwise reads as a clean tree.
- `pr.yml`'s docker-build job loads the amd64 image into the runner and scans it
  with **Trivy** (`ignore-unfixed`: Debian/Alpine no-fix CVEs never gate). The
  report lands in the job step summary and as a **sticky PR comment** (matched by
  a hidden `<!-- bluebird-image-scan -->` marker, not `--edit-last`, so it can't
  clobber the preview-URL comment). The job fails only on **fixable
  Critical/High** findings. File-level exclusions live in **`trivy.yaml`** at the
  repo root, read by this job, by `release.yml`'s scan of the pushed image and
  by `image-scan.yml` below, so the gate that admits an image and the gates
  that check it later cannot disagree. Each
  entry there carries its reasoning; today the only one is pip's vendored-source
  SBOM, which Trivy would otherwise read as installed inventory. What counts as
  a Critical/High is one composite action, **`.github/actions/trivy-crit-high`**,
  called by this job, by `release.yml` and by `image-scan.yml`: two workflows once spelled the
  same `jq` filter, so a filter corrected in one could keep admitting images in
  the other. The same job then runs the image and **smoke tests** what only a
  built image can show: the build arguments reach `/api/version`, Swagger UI is
  served from the image, and the license notices ship (#571):
  `/third-party-licenses.txt` and `/swagger-ui/swagger-ui-bundle.js.LICENSE.txt`
  answer, the first names every direct dependency in `frontend/package.json`
  and `backend/requirements.in`, and `/app/LICENSE` is in the image. The
  build itself fails before that when a bundled or installed package has no
  license text, so this job is where a missing notice turns a PR red.
- `pr.yml`'s **Lighthouse Budgets** job runs after `docker-build`, rebuilds from
  that job's warm Actions cache, serves the real image, and audits `/` three
  times with **Lighthouse CI**. It fails the PR when the first screen crosses a
  byte or timing budget. The budgets and the reasoning live in
  **`.github/lighthouserc.js`**; two choices there make it a gate rather than a
  weather report: every third-party host is blocked (a gate that goes red when
  OpenFreeMap is slow teaches everyone to ignore it), and the default mobile
  preset is used, whose throttling is a simulation and therefore reproducible to
  the millisecond. It reports as `Lighthouse Budgets`, and adding it to branch
  protection is a manual step in the repository settings. It also asserts the
  **accessibility category** as an error, because that score is a set of pass
  or fail markup checks rather than a timing curve.
- `pr.yml`'s **Browser Smoke & Axe** job (issue #412) also runs after
  `docker-build` and rebuilds the image from the same cache. It serves the
  image on the runner, installs **Chromium alone** with
  `npx playwright install --with-deps chromium` (the browser folder is cached
  under the exact Playwright version, since each release pins its own Chromium
  build), and runs the suite in **`frontend/e2e/`**: draw a ring and analyze,
  open a share link, click the map under the legend stack and scroll the
  stack, and run **axe** on the panel, the results, and the Layers
  popover. Every third-party host is answered from fixtures, and a request that
  no handler claims fails the test, so the job spends no Open-Meteo quota and
  cannot go red on someone else's outage. Axe fails on serious and critical
  violations only, and there are none today. A violation can only be accepted
  by an entry in `KNOWN` in `accessibility.spec.ts`, and an entry that stops
  occurring fails too. It is a required check. On a
  red run the HTML report, with a trace and a screenshot per failure, is
  uploaded as the `playwright-report` artifact. The pinned
  `mcr.microsoft.com/playwright` image is for local runs only
  (`docs/DEVELOPMENT.md`); on a runner it would be a 956 MB pull every time.
- `pr-title.yml`'s **PR Title** job fails a PR whose title none of
  `GitVersion.yml`'s three patterns reads, since that title becomes the squash
  commit's and decides the release. It runs on `opened`, `edited`, `reopened`
  and `synchronize`, so fixing the title fixes the check without a push, and it
  is a workflow apart from `pr.yml` so a title edit does not restart the whole
  suite. The patterns are read from `GitVersion.yml` by
  `.github/scripts/check_pr_title.py`, never copied, and
  `backend/tests/test_release_titles.py` holds them to the table the engine was
  run on. It needs no secret, so fork and Dependabot PRs run it the same way.
  Each run notes the bump the merge will release, and a major as a warning.
  It is not a required check; adding it to branch protection is a manual step
  in each repository's settings.
- `pr-preview.yml` runs under **`pull_request_target`** (so it can reach the base
  repo's secrets to push images) behind a **hard same-repo gate** — fork PRs
  never execute with secrets. It builds `zimmertr/bluebird-pr:pr-<N>-<head_sha>`,
  and skips the build when that tag is already in Docker Hub: a re-run or a
  reopen on the same head commit asks for the same tag, and the image already
  there is from the same source.
- **Preview tags should be immutable, and that is a Docker Hub setting, not a
  workflow.** `zimmertr/bluebird` and the chart repository have immutable
  tags on (rule `.*`); `zimmertr/bluebird-pr` did not when #634 was filed. Without it, anyone
  holding the Docker Hub token can replace the image behind a live preview's
  tag, and previews run in `bluebird-system` beside production. Turning it on
  is the maintainer's step (Docker Hub, `zimmertr/bluebird-pr`, Settings,
  immutable tags with the rule `.*`); the existing-tag skip above is what keeps
  a re-run from failing once it is on.
- For the owner's own PRs it applies the **`create pr container`** label and posts
  a sticky comment with the preview URL. Other authors (e.g. Dependabot) still
  build an image but get no label, so no preview pod spins up.
- Argo CD's `bluebird-pr` `ApplicationSet` uses a `pullRequest` generator that
  polls GitHub for the label every 150s and templates `bluebird-pr-<N>` from the
  OCI chart, overriding the image tag, setting `publishFullApi: true` (the #240
  allowlist is off in a preview, so its analyze routes need no key), and
  injecting the `PREVIEW_BANNER` / `PREVIEW_PR` / `PREVIEW_COMMIT` env
  (surfaced by `/api/config` → the SPA banner) plus `LOG_LEVEL=TRACE`. Closing
  the PR prunes the environment, and `cache-cleanup.yml` deletes that PR's
  Actions caches.
- **A preview ages out after 14 days without an update.** `preview-age-out.yml`
  runs daily (and on demand) with `pull-requests: write` and nothing else, lists
  the open PRs carrying `create pr container`, and removes the label from each
  whose `updatedAt` is older than `PREVIEW_MAX_AGE_DAYS`, the one constant at the
  top of the workflow. Removing the label is the whole teardown: the generator
  stops templating `bluebird-pr-<N>` on its next poll, the ApplicationSet deletes
  the Application, and its resources finalizer prunes what it deployed. Any
  update counts as activity (a push, a comment, a label, a review), and a push to
  an owner's PR re-adds the label through `pr-preview.yml`, so a preview comes
  back with the next commit or by adding the label by hand. Before this, a
  preview lived for as long as its PR stayed open: #330's had been up for 19 days
  on 2026-10-01, on an image that predated four fixes (#637). Record: [0108](decisions/0108-previews-age-out.md)
- Two calls from #637 are still the maintainer's. One is removing the label
  from #330 (or closing it); the workflow's first run does the same on its own,
  because #330 has not been updated since 2026-09-14. The other is whether
  previews keep `LOG_LEVEL=TRACE`, which Kubernetes-Manifests sets and which
  stays until the maintainer says otherwise. The 14 days is a pick awaiting the
  same confirmation.

## Unattended maintenance

Two loops keep shipped artifacts current with nobody initiating a change: a
weekly re-scan of the released image, and Dependabot dependency PRs with patch
auto-merge. Both funnel into Path 1, so the [prod
canary](#inside-the-prod-canary-argo-rollouts) still gates everything they
produce. The next two sections give the details.

```mermaid
flowchart LR
    subgraph SCAN["Weekly image re-scan"]
        cron["image-scan.yml<br/>cron, Trivy"]
        released["Docker Hub<br/>latest released image"]
        sarif["Security tab<br/>SARIF alerts"]
        email["failure email<br/>fixable Crit/High only"]
    end

    subgraph DEP["Dependency updates"]
        bot["Dependabot<br/>weekly PRs"]
        am["dependabot-auto-merge.yml"]
        note["armed comment on PR"]
        merge["squash auto-merge<br/>after required checks"]
        review(["TJ reviews<br/>minor / major"])
    end

    rel["release.yml<br/>Path 1: canary to prod"]

    cron -->|scan| released
    cron --> sarif
    cron -->|only when actionable| email
    email -.->|fix: merge base-image PR| bot

    bot --> am
    am -->|patch| note
    am -->|patch| merge
    bot -->|minor / major| review
    merge --> rel
    review -.-> rel
```

## Scheduled image scan

PR-time scanning gates what gets *published*, but CVEs are disclosed after
images ship. The released image rots while nothing rebuilds it.
`image-scan.yml` (weekly cron + `workflow_dispatch`) re-scans the **latest
released** `zimmertr/bluebird:<semver>` with Trivy:

The moment of release is covered by [the release scan](#the-release-scan),
which scans both platforms of the pushed digest before production moves. This
job is the later check: CVEs disclosed after that scan, on the amd64 half.

- **Always:** SARIF upload → code-scanning alerts in the repo **Security tab**.
- **Gate:** the job fails — triggering GitHub's workflow-failure email — only
  when a **fixable Critical/High** vulnerability exists, i.e. only when there
  is something to do. It re-scans as JSON and counts through the same
  **`.github/actions/trivy-crit-high`** the PR gate uses, so the two gates
  judge an image by one definition. Expected remediation: merge the open
  Dependabot base-image PR (below), which cuts a patch release on the fresh
  base and rolls it out through Path 1.

**When there is no base-image PR to merge.** Alpine fixes a package days to
weeks before the `python:3.14-alpine` image rebuilds carrying it, so the
pinned image can be the newest one published while the packages under it are
not. Dependabot moves the base only when the image is rebuilt, so it has
nothing to open, and this is the case that failed the 2026-09 scans (seven fixable HIGH util-linux CVEs against a
base tag that was already the newest published). The Dockerfile answers it
with `RUN apk upgrade --no-cache` in the runtime stage, which pulls the
current Alpine index at build time rather than waiting on the base.

That layer is a snapshot, not a live upgrade: BuildKit keys it on the base
digest plus the command, so between base moves every build serves the cached
copy. A fix Alpine publishes into that gap is therefore invisible until the
base moves. **The remedy is a cacheless rebuild** — `gh cache delete --all`,
then release — not a dependency bump. The weekly scan here is what makes that
gap visible, which is the only reason the cache is safe to keep.

This job scans a published image rather than a checkout, so its `actions/checkout`
step exists purely to read `trivy.yaml`. That is deliberate: without the PR gate's
exclusions, an image could pass `pr.yml` and then fail here on findings that gate
had already ruled out.

Docker Hub's Scout insights cover the same registry-side rot but only update
the Hub dashboard; the cron's failure email is the push-based signal.

## Dependabot auto-merge

Dependabot opens weekly PRs (`pip` in `/backend`, `npm` in `/frontend`,
`/frontend/tools/api-types` and `/frontend/tools/eslint`, `github-actions` and
`docker` base images in `/`).
The type generator's package ignores TypeScript **major** bumps: it is pinned to
5 because `openapi-typescript` loads the compiler API and peers on `^5.x`, which
is why it is a package apart from the app in the first place. The linter's
package ignores them for the same reason, one major later: typescript-eslint
throws on TypeScript 7 rather than degrading, so that package stays on 6. `dependabot-auto-merge.yml` enables **squash
auto-merge for patch (bugfix) bumps only** — GitHub completes the merge once
`main`'s required checks pass; **minor and major bumps wait for manual review**.
When it arms auto-merge it also posts a marker-guarded comment on the PR saying
so (and how to stop it), so the self-merge is visible from the PR page rather
than something to infer from the merge timeline.

Three things narrow what an auto-merged patch can bring with it (#633):

- **Every npm and pip entry waits seven days** after a release before proposing
  it (`cooldown: default-days: 7` in `.github/dependabot.yml`). A patch
  auto-merges as soon as the required checks pass and a merge to `main`
  deploys, so before the cooldown a release published the day before the
  weekly run was live the same morning (vite 8.3.1, #556: opened 06:48, merged
  06:51 on 2026-10-01). The npm worms of 2025 were pulled within hours to a few
  days of publication. The wait applies to version updates only: GitHub
  documents that Dependabot's **security** updates do not wait for it, so a
  fix for a published advisory still arrives at once. The `github-actions` and
  `docker` entries carry no cooldown here.
- **No `npm ci` runs install scripts.** The image build, both `npm ci` steps in
  `pr.yml`, the two tool-package installs in `frontend/package.json` and the
  `Makefile` all pass `--ignore-scripts`. The app's lockfile holds two packages
  with a script, `fsevents` (macOS only) and `@scarf/scarf` (install telemetry
  pulled in by `swagger-ui-dist`), and no package needs one on Linux, so a
  build-chain release that adds a script cannot run it on the runner or in the
  builder. The bundle the image serves was byte-identical with and without the
  flag (2026-10-06).
- **The backend installs from a hashed lock.** `backend/requirements.in` holds
  the direct pins and `backend/requirements.txt` is pip-compile's lock of it,
  every indirect distribution included and every one hashed; the image
  installs it with `pip install --require-hashes`, so a package missing from it
  or a download that does not match fails the build. Dependabot's pip entry
  reads the `.in` files and recompiles both locks (`requirements-dev.txt` is
  the same lock plus the test tools), and the dependency graph reads
  `requirements.txt`, which is what puts Starlette and the rest of the indirect
  set in front of the alerts. Regenerating the lock by hand is `make
  lock-backend` ([DEVELOPMENT.md](DEVELOPMENT.md#the-backends-dependency-lock)).

In practice only `pip`/`npm` patches auto-merge. Every GitHub Action is pinned
to a commit SHA with its exact version in a comment (#632), so Dependabot
raises action patch bumps too, and the job arms auto-merge on them; they still
wait for a person, for the `Workflows` reason below. The Dockerfile's base
images are pinned as `tag@digest`, with the tags floating at the minor
(`python:3.14-alpine`, `node:26-alpine`): a new minor or major is a runtime
bump that waits for review, and a rebuild of the image under the same tag
arrives as a digest PR. A Node major bump also fails `Backend Tests` until the
same PR moves `.node-version` to match, which is what keeps CI on the image's
runtime. Base-OS *patch* fixes no longer arrive unannounced at the next build:
they come as that digest PR. The merge PAT is intentionally scoped to Contents +
Pull requests (not `Workflows`), so a workflow-file edit is not something it can
land on its own, and every action bump waits for a person even though the job
arms auto-merge on its patches.

The merge step runs with a PAT (`AUTO_MERGE_PAT`, stored as a **Dependabot**
secret — Actions secrets are empty in Dependabot-triggered runs), *not* the
default `GITHUB_TOKEN`. That's deliberate: a `GITHUB_TOKEN`-driven merge would be
suppressed by GitHub's recursion guard and never fire `release.yml`'s `on: push`,
so the patch would land on `main` but never ship. With the PAT, an auto-merged
patch deploys through Path 1 like any other merge — the prod canary still gates
the rollout.

The same trap applies to Path 1 step 6's auto-merged `appVersion` bump, which is
why that `gh pr merge` runs under `GH_PAT`: a `GITHUB_TOKEN`-driven merge there
would land the bump on `bluebird-helm/main` without ever firing Path 2, leaving
the chart unpublished.

## A single change, end to end

```mermaid
sequenceDiagram
    actor Dev as Developer / TJ
    participant BB as bluebird
    participant DH as Docker Hub
    participant KM as Kubernetes-Manifests
    participant HELM as bluebird-helm
    participant ARGO as Argo CD

    Dev->>BB: merge PR to main
    BB->>DH: push bluebird:0.21.1
    BB->>DH: scan the pushed digest, amd64 and arm64 (Trivy)
    BB->>KM: open/update image newTag=0.21.1 PR + arm auto-merge
    BB->>HELM: open/update appVersion bump PR + arm auto-merge
    KM->>KM: auto-merge image PR (after Validate manifests)
    KM->>ARGO: auto-sync
    ARGO->>ARGO: canary rollout (new image)
    Note over Dev,ARGO: New code is now live via the image tag.
    HELM->>HELM: auto-merge appVersion PR (after lint)
    HELM->>DH: helm push chart (new version)
    HELM->>KM: open/update preview + stable chart PRs
    KM->>KM: auto-merge preview PR (after Validate manifests)
    KM->>KM: auto-merge stable PR (after Validate manifests)
    KM->>ARGO: auto-sync
    ARGO->>ARGO: no canary — the chart change only moves object-metadata labels
```

That last step is specific to an `appVersion`-only chart release, where the pod
template never changes. A chart release that alters prod's render lands the same
way and rolls out as a canary — see [What a stable chart bump
costs](#what-a-stable-chart-bump-costs).

## Conventions

- **PR title → bump** (both repos). The squash commit's title is the PR title,
  and GitVersion reads that line alone:

  | PR title | Bump |
  | --- | --- |
  | any type below with `!` before the colon: `feat!:`, `fix(ui)!:`, `chore!:` | major |
  | `feat:`, `feat(scope):` | minor |
  | `fix`, `perf`, `refactor`, `chore`, `docs`, `style`, `test`, `ci`, `build`, each with an optional `(scope)` | patch |

  The body never counts: a `BREAKING CHANGE:` footer, or a body line that
  starts `fix!:`, changes nothing, so a major is always the title's `!`
  ([0080](decisions/0080-major-from-the-title-only.md)). A title that starts
  `BREAKING CHANGE:` names no type, so it is not read, and the PR Title check
  refuses it. GitVersion matches without regard to case. A `!` anywhere else
  in the title (`fix: stop the crash!`) is not a major. Dependabot's
  `build(deps):` and the release bot's `chore(release):` titles are patches.
  A title no pattern reads still releases a patch, which is why the `PR Title`
  check exists. The patterns live in `GitVersion.yml`, identical in both
  repositories.
- **Cutting 1.0.0: the app first, then the chart.** The chart goes to 1.0
  with the app (TJ, 2026-10-01), and neither major happens by itself: each
  repository needs a merged PR whose title carries `!`. Merge in this order:

  1. The app PR with `!` in its title. It releases `zimmertr/bluebird:1.0.0`,
     and Path 1 step 6 opens the automatic chart PR, titled `chore(release):
     bump chart appVersion to 1.0.0`. That title has no `!`, so by itself it
     releases a chart **patch** (for example 0.15.22) whose default image is
     the app's 1.0.0. It merges itself; let it, and let that chart release
     finish.
  2. Then a chart PR of your own with `!` in its title, for example `chore!:
     ...`. It must change a file under `charts/**` (or `artifacthub-repo.yml`),
     because the chart release workflow fires only on those paths, and it
     should not touch the `appVersion` line the automatic PR edits. Merging it
     releases chart **1.0.0**, and the package-time resolver gives it the app's
     1.0.0 as its `appVersion`.

  Not the other way round: a chart `!` PR merged before the app's 1.0.0
  exists releases chart 1.0.0 with the newest pre-1.0 app as its default image,
  and the automatic PR that follows the app's 1.0.0 then releases chart 1.0.1.
  Do not put the `!` on the automatic PR either: auto-merge is armed the
  moment it opens, so retitling it races its own merge. The engine runs behind
  this order are in [0080](decisions/0080-major-from-the-title-only.md).
- **Release guards** in both release pipelines make a re-run finish a release
  rather than repeat it: each piece (image or chart, git tag, GitHub release) is
  made only when missing, and a run whose version has all three is a no-op. See
  [Finishing a failed release](#finishing-a-failed-release).
