---
description: Show the state of the current or last factory run — stage, tickets, decisions, blockers. Read-only.
---

Read-only. Do not spawn agents and do not change any file.

1. Read `.claude/factory-run.json`, `.claude/factory-run.hooks.json` (if present) and `.claude/factory.md`. No run file → say so and list the
   run directories under the config's `run_dir`, newest first, and the remote phase branches
   (`git branch -r`) — `/dark-factory:resume` restores a run checkpointed there. Do not fetch.
2. Read the run directory: `journal.md` (last 10 lines), `tickets/*.md` front matter,
   `decisions/*.md` front matter, `questions/*.md` front matter.
3. Print, in at most 25 lines: run id, unit, status, stage, current step, forced
   continuations used/max, agent calls used/`max_agent_calls` (by agent and model, top 5); a ticket table (id, status, fix rounds, commit); decisions per
   method; open blocker questions with their question line; the last journal lines.
