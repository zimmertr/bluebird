# 0186. The shared cache runs three instances, each on a volume of its own, under two operator replicas

- Status: Accepted. Supersedes 0175 in part (its single instance and its static volume).
- Date: 2026-10-18
- Decider: the maintainer (TJ), 2026-10-18, while #761 released: three instances, every volume provisioned dynamically, and two operator replicas, over the one instance and the static volume 0175 shipped with. The operator's spread rule and keeping 10 GiB a volume are Claude's.
- Issues and PRs: #760, #761, bluebird-helm#385, Kubernetes-Manifests#1617
- Cited in code as: #760
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Kubernetes deployment; [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md), Kubernetes Deployment; [`docs/CICD.md`](../CICD.md)
- Related: 0175 (the shared cache), 0176 (every search reads the places table)

## Context

0175 ran one instance on a static FlashPool volume, because the database is a cache the fill can rebuild. That covers losing the data, not losing the database for a minute. 0176 took destination discovery out of the browser, so every search reads the database, and without it a search goes to Overpass and the trailhead and crag markers go dark. With one instance, every drain of its worker, a Talos upgrade for one, is an outage of about a minute while the pod moves. The maintainer asked for three on 2026-10-18, before the chart that creates the database had merged.

## Decision

**The database runs three instances**, the `cluster` chart's default, with its PodDisruptionBudget on. CloudNativePG's preferred anti-affinity spreads them one to a worker where it can. A drain or a failed instance hands over to a standby in seconds, and the app's `uri` names the `-rw` service, which follows the primary.

**Each instance gets its own 10 GiB volume from `proxmox-flashpool`**, provisioned dynamically. The static volume pre-bound to `bluebird-database-1` and its zvol are gone. CloudNativePG names a replacement instance `-4`, `-5` and so on, which a static volume cannot anticipate, and with two standbys a named zvol keeps nothing a replica does not.

**The operator runs two replicas**, spread by hostname with `nodeTaintsPolicy: Honor`. Failover is the operator's job. With one replica, a worker that took the primary and the operator down together left the database without a primary until Kubernetes rescheduled the operator, minutes later. Leader election hands over in seconds.

## Evidence

Every node reports zone `earth` in region `sol-milkyway` (read 2026-10-18), so all seven VMs run on one Proxmox host and every volume sits on one pool. Three instances cover a worker, a VM or Postgres failing, not the host or the pool. 0176 measured a planet-sized table of 1.4 million places at 204 MB with its index. With a fill's second copy and the WAL, each instance should hold 1 to 3 GB, unmeasured until the first fill. CloudNativePG's `cluster` chart 0.9.0 defaults to `instances: 3` and `enablePDB: true`, and its operator chart 0.29.1 to `replicaCount: 1`.

## Alternatives rejected

- **Keep one instance.** Every drain of its worker sends searches to Overpass for about a minute.
- **Three instances, the first on the static volume.** The volumes are mixed, and the static one is orphaned the first time that instance is replaced.
- **One operator replica.** A failover that loses the operator's node waits for a reschedule.

## Consequences

The cluster claims 30 GiB on FlashPool where it claimed 10. Whether the pool reserves all of it depends on whether `FlashPool` is sparse, which the cluster cannot read. A fill's writes replicate to two standbys. `proxmox-flashpool` retains a volume whose claim is deleted, so a replaced instance leaves its volume to delete by hand. Argo CD syncs the database at wave -1 and the app at 0, with no volume wave. The previews' Secret names `bluebird-database-rw`, the primary; `bluebird-database-ro` would put their reads on the standbys.
