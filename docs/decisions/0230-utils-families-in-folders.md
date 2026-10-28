# 0230. Six families of utils modules live in folders of their own, each with its own guide

- Status: Accepted. Extends [0047](0047-guide-split-by-directory.md): the rule that a guide sits at the tightest directory containing every path it names now reaches folders under `utils/`.
- Date: 2026-10-27
- Decider: the maintainer (TJ), on 2026-10-27, in the session that opened the pull request for #773
- Issues and PRs: #773
- Cited in code as: none
- Guide: [`CLAUDE.md`](../../CLAUDE.md), the Documentation table, the convention on nested `CLAUDE.md` files, the "A new source module gets a bullet" rule, and Architecture, "The module layouts live beside the code they describe"; [`frontend/src/utils/forecastGrid/CLAUDE.md`](../../frontend/src/utils/forecastGrid/CLAUDE.md) and [`frontend/src/utils/popup/CLAUDE.md`](../../frontend/src/utils/popup/CLAUDE.md)

## Context

`frontend/src/utils/CLAUDE.md` measured 155,350 characters on 2026-10-27 on `main` at 24f7165, past the 150,000-character limit 0047 split the guides for. Every module in `utils/` stood flat in one folder, so the rule that a guide sits at the tightest directory containing every path it names left nowhere to put a second guide.

## Decision

- Six families move into folders under `frontend/src/utils/`, each with a `CLAUDE.md` of its own: `forecastGrid/`, `popup/`, `model/`, `results/`, `chart/` and `calendar/`.
- Every file keeps its name: `src/utils/forecastGrid/forecastGrid.ts`, `src/utils/popup/popupChrome.ts`. No folder has an `index.ts`, and a test stands beside its module.
- Each family's bullets move into its folder's guide with their wording unchanged but for the path.
- The two linter globs that named `src/utils/*.ts` read `src/utils/**`: the files of `style-one-placement` in `frontend/tools/eslint/checks/styles.js`, and the ignores of `archive-reach-published` in `frontend/tools/eslint/checks/data.js`. A folder under `utils/` cannot step outside a check.
- The Documentation table in the root `CLAUDE.md` lists all six guides.

## Evidence

The bullets of each family, measured 2026-10-27 at 24f7165:

| Family | Modules | Characters of bullets |
|---|---|---|
| `forecastGrid` | 5 | 13.7k |
| `popup` | 3 | 11.2k |
| `model` | 3 | 12.9k |
| `results` | 3 | 7.8k |
| `chart` | 3 | 6.2k |
| `calendar` | 6 | 4.7k |

With the first two families moved, `frontend/src/utils/CLAUDE.md` measured 130,475 characters (`wc -c`, 2026-10-27), `forecastGrid/CLAUDE.md` 13,737 and `popup/CLAUDE.md` 11,356.

A `popoverBox(` call planted in `src/utils/popup/popupFit.ts` failed `make lint-frontend` under `style-one-placement`, and a hex colour planted in `src/utils/forecastGrid/forecastGridArrows.ts` failed it under `value-hex` (2026-10-27).

## Alternatives rejected

- **Trimming the longest bullets** (#773, option B): it buys a few thousand characters once, cuts detail a session reads before writing code, and the file grows back.
- **Several guide files in `utils/`, joined by `@` imports** (#773, option C): Claude Code loads an imported file with the one that imports it, so a session reads the same number of characters.
- **A folder name in place of each file's prefix** (`forecastGrid/lattice.ts`), or an `index.ts` per folder: a file's name is how every guide, record and comment finds it, and a renamed file would break each of them.

## Consequences

- A new module in one of the six families gets its bullet in that folder's guide, and a new family folder adds a row to the root Documentation table in the same pull request.
- A linter check that names a moved file by path names it at its new path. A glob over `src/utils/` reads `src/utils/**`, or a folder steps outside it.
- Nothing enforces the size limit. A guide that nears 150,000 characters splits along a family again.
