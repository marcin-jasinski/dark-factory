---
description: Settle one design question with the agent panel (3 solvers + judge) and record the decision — outside a full run.
argument-hint: "<the question>"
---

Question: $ARGUMENTS

1. Read `.claude/factory.md`. Use the run directory of the active run if there is one;
   otherwise `<run_dir>/adhoc/` (create it).
2. Find the next free question number there. Write the question file
   (`questions/Q<NN>-<slug>.md`, `status: open`, `impact: high`): restate the question
   precisely, add context with file paths you find in a short search, list the options
   you can see, and the constraints from the docs.
3. Invoke the Skill `dark-factory:consensus` for that question.
4. Show the user the decision (one paragraph), the method, the vote, the dissent, and
   the ADR path if one was written. Do not implement anything.
