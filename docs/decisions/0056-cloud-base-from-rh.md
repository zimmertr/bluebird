# 0056. Cloud base is detected on relative humidity, not on level cloud fraction

- Status: Accepted
- Date: 2026-09-23 (git: the merge of #483)
- Decider: TJ (git: author and merger of #483)
- Issues and PRs: #117, #483
- Cited in code as: #117
- Guide: [`CLAUDE.md`](../../CLAUDE.md), The Python and TypeScript mirrors, the paragraph under the table that opens "The cloud base detects saturation"

## Context

The cloud base needs a saturation signal at each pressure level. Open-Meteo offers both relative humidity and a cloud fraction at each level.

## Decision

The cloud base detects saturation on relative humidity. The level cloud fraction must not replace it.

## Evidence

Measured 2026-09-22 on GFS and ECMWF: Open-Meteo's `cloud_cover_{p}hPa` is a fixed function of that same relative humidity, so it adds variables and no information.

## Alternatives rejected

- The level cloud fraction: relative humidity in disguise.
- The other variants tested against METARs: `docs/DATA.md` lists them and why each was declined.

## Consequences

The saturation threshold, Espy's rate and the ISA level heights are mirror row 26, and the cloud request's variable count is row 27.
