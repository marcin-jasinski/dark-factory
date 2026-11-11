---
name: quality-gate
description: The per-ticket test, review and fix loop of the dark factory — an independent tester, parallel lens reviewers, a mechanical test-weakening check, deterministic (scripted) triage of findings, a fixer, and a judge for disputed findings, repeated until clean or the round limit. Returns PASS or PARK. Use from the dark-factory orchestrator after a ticket is implemented.
---

# Quality gate (one ticket)

Inputs: the ticket path, the config, the run directory. The working tree holds the
uncommitted change of the ticket. Paths: `reviews/<ticket>.r<round>.<lens>.md`.
Scripts: `scripts/triage.mjs` and `scripts/test-guard.mjs` in **this skill's directory**
(call them with `node <absolute path>`; run them from the repository root).

Set `current.step` in the run state before each step; append a journal line after it.
Spawn every agent with the model from config `models` (see the orchestrator's "Models").

## Round loop (`round` = 1 .. `limits.max_fix_rounds` + 1)

### 1. Test

Spawn `tester` with config, ticket, `round`, and (round ≥ 2) the fixer's list of changed
files. Failures whose test names are in `baseline_failures` do not count.

If the tester returned `FAIL` with a build or compile error, skip steps 2–3 in this round:
go to step 4 with only the test failures. Reviews of code that does not compile are wasted.

### 2. Review + test guard

- Run `node <skill>/scripts/test-guard.mjs --out <run>/reviews/<ticket>.r<round>.test-guard.md --ticket <id>`.
  It flags deleted test files, added skip/ignore/focus markers and lost assertions — the
  mechanical half of "never weaken a test". It costs no tokens; run it every round.
- Spawn one `reviewer` per lens in config `review.lenses` **in one message** (parallel).
  Round 1: every lens reviews the full change.
  Round ≥ 2: spawn only the lenses that had accepted findings in the previous round, plus
  `correctness` always. Give each reviewer `round`, its own previous findings file and the
  fixer's list of changed files: it verifies its previous accepted findings and reviews
  only the fix for **new** blocker/major issues. This keeps the loop converging instead of
  every round surfacing a fresh layer of minor findings.

### 3. Triage (the script does this — rules, not judgement)

```
node <skill>/scripts/triage.mjs --blocker <review.blocker_min_confidence> --major <review.major_min_confidence> \
  --append-deferred <ticket path> <run>/reviews/<ticket>.r<round>.*.md
```

It prints `{accepted:[…], deferred_count, counts}`. A finding is **accepted** when it is a
blocker at ≥ blocker confidence, a major at ≥ major confidence, or a major/blocker at the
same location (same file, ±3 lines) as a major/blocker from another lens. Everything else
is appended to the ticket's notes under "Deferred findings" (deduplicated across rounds) —
not fixed (minimal implementation), but the run report lists them. Do not read the
findings files yourself; the script output is what you act on.

Also carry over findings the judge ruled `valid` and items the fixer returned `NOT_FIXED`.

If the tester said `PASS` and nothing is accepted or carried over → return **PASS**.

### 4. Fix

If `round` > `limits.max_fix_rounds` → return **PARK** "gate not green after N rounds:
<open items>".

Spawn `fixer` with the accepted findings (the script's JSON entries) and the new test
failures. Then:
- `DISPUTED` items → spawn `judge` in mode B, one call per disputed item (parallel in one
  message). `invalid` → drop. `defer` → deferred list. `valid` → stays open for the next round's fixer.
- `NOT_FIXED` items → carry into the next round.

Increment the ticket's `fix_rounds` and start the next round.

## Notes

- The tester and reviewers always look at the **working tree**, so each round sees the latest fixes.
- Never weaken a test, delete a test, or add a skip/ignore to get green. The test guard
  flags it as a blocker; the fixer may dispute only with evidence (the test contradicted
  an AC or a decision), and the judge rules.
- A failure that is not related to the ticket and is not in `baseline_failures` (a flaky test):
  re-run the gate once. Still failing → treat it as the ticket's failure.
