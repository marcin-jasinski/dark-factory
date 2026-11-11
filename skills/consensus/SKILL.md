---
name: consensus
description: Decides one open design question with no human — three independent solver agents (pragmatist, architect, skeptic) write scored ballots, a judge tallies them, an optional debate round handles splits, and the result is a binding decision record (plus an ADR when load-bearing). Use from the dark-factory orchestrator, or when the user runs /dark-factory:decide.
---

# Consensus protocol

Input: a question file (`questions/Q<NN>-<slug>.md` with front matter `id`, `status: open`,
`impact`). If you start from a bare question (from `/dark-factory:decide`), first write the
question file yourself: question, context with file paths, known options, constraints.

Paths: `ballots/Q<NN>.r<round>.<lens>.md`, `decisions/D<NN>-<slug>.md` (same `NN` as the
question), all in the run directory. Use absolute paths in agent prompts.

Models (config `models`, see the orchestrator's "Models"): solvers by the question's
impact — `models.solver.<impact>` (defaults: high → opus, medium/low → sonnet); the judge
always `models.judge` (opus). The judge verifies the evidence each ballot cites, so a
cheaper panel is safe below high impact; high-impact questions get the strongest panel.

## Step 1 — Panel size

- `impact: low` → **fast path**: one `solver` with lens `pragmatist`, then the `judge`
  with `allow_round_2: false`. The judge adopts the ballot unless it finds a verified hard
  objection. Method is recorded as `judge`.
- `impact: medium | high` → full panel (below).

## Step 2 — Round 1 (independent)

Spawn three `solver` agents **in one message** (they run in parallel and must not see
each other): lenses `pragmatist`, `architect`, `skeptic`, `round: 1`, each with its own
ballot path, the question path and the config path.

## Step 3 — Tally

Spawn `judge` (mode A) with the question, the three ballot paths, `round: 1`,
`allow_round_2: true`, the decision path, the config path and `adr_dir` from config.

- Decided → go to Step 5.
- `NEEDS_ROUND_2: <options>` → Step 4.

## Step 4 — Round 2 (debate, once)

Spawn three `solver` agents again in one message, same lenses, `round: 2`, each with
**all** round-1 ballot paths and the surviving options. Then spawn `judge` with all six
ballots, `round: 2`, `allow_round_2: false`. The judge now always decides (method
`debate` if a majority formed, else `judge`) or returns a blocker.

## Step 5 — Record

1. Read the decision front matter. Set the question's `status: decided` and `decision: D<NN>`.
2. `status: blocker` → set the question's `status: blocker`. The orchestrator parks what it blocks.
3. Append one journal line: `<time> Q<NN> decided <method> -> <one-line decision>`.
4. Tracker sync action `decision` (posts the decision summary on the tracking issue).

## Cost discipline

- Never run the panel for a question the docs answer; the planner's `answered` status is
  final unless the judge later finds the cited source does not settle it.
- At most `limits.parallel_agents` agents per message; queue the rest.
- Round 2 runs at most once per question.
- Solvers return 3 lines; act on those and the judge's 4 lines. Do not read ballots yourself.
