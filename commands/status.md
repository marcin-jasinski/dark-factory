---
description: Show the state of the current or last factory run — stage, tickets, decisions, blockers. Read-only.
---

Read-only. Do not spawn agents and do not change any file.

1. Read `.claude/factory-run.json` and `.claude/factory.md`. No run file → say so and list the
   run directories under the config's `run_dir`, newest first.
2. Read the run directory: `journal.md` (last 10 lines), `tickets/*.md` front matter,
   `decisions/*.md` front matter, `questions/*.md` front matter.
3. Print, in at most 25 lines: run id, unit, status, stage, current step, forced
   continuations used/max; a ticket table (id, status, fix rounds, commit); decisions per
   method; open blocker questions with their question line; the last journal lines.
