# 0047. The module layouts live in nested guide files beside the code

- Status: Accepted
- Date: 2026-09-17 (git: the merge of #458)
- Decider: TJ (git: author and merger of #458)
- Issues and PRs: #392, #428, #458
- Cited in code as: none
- Guide: [`CLAUDE.md`](../../CLAUDE.md), Architecture, "The module layouts live beside the code they describe", and the Documentation convention on nested `CLAUDE.md` files

## Context

The root `CLAUDE.md` had grown past the size the harness reads it under. The two module layout lists (#392, shipped as #428) were most of it.

## Decision

The module layouts live in nested `CLAUDE.md` files beside the code they describe. Each sits at the tightest directory that contains every path it names, so Claude Code loads it for the tree a session edits and for nothing else. The Documentation table in the root file lists every nested file.

## Evidence

The two lists were 109k of the root file's 165k characters. At 971fede the root file was 62.4k characters.

## Alternatives rejected

- One root file: over the harness's limit, and every session loaded both lists.

## Consequences

Adding or removing a nested file updates the Documentation table in the same pull request; nothing enforces it. A new source module gets its bullet in the nested file beside it. Tailwind v4 reads a markdown file under `frontend/src/` as raw text, so each one there needs an `@source not` line in `frontend/src/index.css`.
