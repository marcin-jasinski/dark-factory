---
name: quality-gate
description: The per-ticket test, review and fix loop of the dark factory — an independent tester, parallel lens reviewers, deterministic triage of findings, a fixer, and a judge for disputed findings, repeated until clean or the round limit. Returns PASS or PARK. Use from the dark-factory orchestrator after a ticket is implemented.
---

# Quality gate (one ticket)

Inputs: the ticket path, the config, the run directory. The working tree holds the
uncommitted change of the ticket. Paths: `reviews/<ticket>.r<round>.<lens>.md`.

Set `current.step` in the run state before each step; append a journal line after it.

## Round loop (`round` = 1 .. `limits.max_fix_rounds` + 1)

### 1. Test

Spawn `tester` with config and ticket. Failures whose test names are in
`baseline_failures` do not count.

### 2. Review

Spawn one `reviewer` per lens in config `review.lenses` **in one message** (parallel).
In round ≥ 2, spawn only the lenses that had accepted findings in the previous round,
plus `correctness` always.

Skip review in this round if the tester returned `FAIL` with a build or compile error —
fix that first (go to step 4 with only the test failures).

### 3. Triage (you do this — rules, not judgement)

Read the findings files. A finding is **accepted** when:
- `severity: blocker` and `confidence ≥ review.blocker_min_confidence` (default 0.5), or
- `severity: major` and (`confidence ≥ review.major_min_confidence` (default 0.7) or the
  same location and claim appears in two lenses).

Everything else (minor, nit, low confidence) → append to the ticket's `## Notes` under
"Deferred findings" (one line each, with id and location). They are not fixed — minimal
implementation — but the run report lists them.

If the tester said `PASS` and no finding is accepted → return **PASS**.

### 4. Fix

If `round` > `limits.max_fix_rounds` → return **PARK** "gate not green after N rounds:
<open items>".

Spawn `fixer` with the accepted findings and the new test failures. Then:
- `DISPUTED` items → spawn `judge` in mode B, one call per disputed item (parallel in one
  message). `invalid` → drop. `defer` → deferred list. `valid` → stays open for the next round's fixer.
- `NOT_FIXED` items → carry into the next round.

Increment the ticket's `fix_rounds` and start the next round.

## Notes

- The tester and reviewers always look at the **working tree**, so each round sees the latest fixes.
- Never weaken a test, delete a test, or add a skip/ignore to get green. If a reviewer or
  tester finds that the fixer did so, that is a `blocker`.
- A failure that is not related to the ticket and is not in `baseline_failures` (a flaky test):
  re-run the gate once. Still failing → treat it as the ticket's failure.
