---
description: Stop the active factory run cleanly — the current ticket is parked, state is kept for /dark-factory:resume.
argument-hint: "[reason]"
---

Read `.claude/factory-run.json`. If no run has `status: running`, say so and stop.

1. If the working tree has an uncommitted ticket change, park it as the orchestrator's
   Stage 4 "Park" step says (stash or parked branch per config), with reason "halted by user".
2. Set `status: halted`, `halt_reason: "halted by user: $ARGUMENTS"`. Append a journal line.
3. Commit the run directory on the phase branch: `chore(factory): halt <run_id>`.
4. Run the Skill `dark-factory:tracker-sync` action `halt`.
5. Print the same summary as `/dark-factory:status`.

Do not merge, push or delete anything.
