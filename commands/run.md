---
description: Start (or resume) an autonomous factory run on one unit of the implementation plan — no approvals until the result is merged into the integration branch.
argument-hint: "[unit, e.g. \"Phase 15\"; empty = next unfinished unit]"
---

Invoke the Skill `dark-factory:orchestrator` and follow it exactly.

Unit requested by the user: `$ARGUMENTS` (empty means: the next unfinished unit of the plan).

If `.claude/factory-run.json` has `status: running` for a different unit, do not start a
new run: tell the user which run is active and that `/dark-factory:resume` continues it
and `/dark-factory:halt` stops it.

After preflight passes, work without asking the user anything until the run is `done` or `halted`.
