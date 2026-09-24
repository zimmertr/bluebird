# 0047. The module layouts live in nested guide files beside the code

Verbatim guide text at 971fede, copied before the edit to the template.

## From `CLAUDE.md`, line 140

**The module layouts live beside the code they describe**, one nested `CLAUDE.md` per side: [`backend/CLAUDE.md`](backend/CLAUDE.md) and [`frontend/src/CLAUDE.md`](frontend/src/CLAUDE.md). Each names every module in its own tree, what that module OWNS and why it is separate. They are not in this file because together they were 109k of its 165k characters, and a session needs one only when it edits that tree — Claude Code loads a nested file when a session touches its directory, so a backend change does not carry the frontend's list and a docs change carries neither.

## From `CLAUDE.md`, line 39

- **The table above is the list of nested `CLAUDE.md` files, and adding or removing one updates it in the same PR.** Each nested file sits at the tightest directory that contains every path it names, so Claude Code loads it for the whole of one side and for nothing else: `backend/CLAUDE.md` covers `app/` and `scripts/`, `frontend/src/CLAUDE.md` covers `src/`. Nothing enforces this either, and an unlisted one is a file no session knows to update.
