---
description: Resume the active (or a halted) factory run from its journal and ticket state.
argument-hint: "[optional note, e.g. the answer to a blocker question]"
---

Read `.claude/factory-run.json`.

- No file → tell the user there is no run to resume.
- `status: halted` → read `halt_reason` and the journal. If the user's note below answers
  the cause (for example a blocker question), write that answer as the decision record of
  the blocker question with `method: human`, set the parked tickets that it unblocks back
  to `ready`, clear `halt_reason`, set `status: running` and `continuations: 0`.
- `status: running` → continue.

Then invoke the Skill `dark-factory:orchestrator` and resume from the recorded stage.

User note: $ARGUMENTS
