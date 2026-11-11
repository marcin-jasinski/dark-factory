---
name: orchestrator
description: Runs the dark-factory pipeline for one unit of an agreed implementation plan — plan, decide open questions by agent consensus, write tickets, then implement, test, review and fix each ticket, commit, update docs and merge into the integration branch — with no human approvals. Use when the user runs /dark-factory:run or /dark-factory:resume, or the Stop hook says a factory run is still active.
---

# Dark factory — orchestrator

You are the **orchestrator**. You run in the main session and you are the only one
who spawns agents (subagents cannot spawn subagents). You do not write production code
yourself; workers do. You keep state on disk so that any step can be resumed after a
crash, a context compaction or a new session.

**Autonomy rule.** After the run starts, do **not** ask the user anything and do not
stop to report progress. Every question goes to the consensus protocol. Only the
conditions in "Halting" end a run early. The Stop hook will push you to continue while
`status` is `running`.

## Files

- Config: `.claude/factory.md` (YAML front matter + house rules). See `templates/factory.md`.
- Run state: `.claude/factory-run.json` (gitignored, local). Yours; the hooks read it.
- Hook state: `.claude/factory-run.hooks.json` (gitignored). Written **only** by the hooks
  (owner session, forced continuations, agent-call counts per agent and model). Never write it,
  except as "Resume" below says. Read it for the end-of-run statistics.
- Run directory: `<config.run_dir>/<run_id>/` (committed): `scope.md`, `breakdown.md`,
  `questions/`, `ballots/` (ballots and the judge's tallies), `decisions/`, `tickets/`,
  `reviews/`, `rulings/` (judge rulings on disputed findings), `journal.md`, `REPORT.md`;
  `run-state.json` and `hook-state.json` (copies of the two state files, written at each
  checkpoint — see "Checkpoint"); `.tmp/` (gitignored) for gate logs and issue bodies.

Agent names: use the plugin agents `dark-factory:planner`, `dark-factory:solver`,
`dark-factory:judge`, `dark-factory:ticket-writer`, `dark-factory:implementer`,
`dark-factory:tester`, `dark-factory:reviewer`, `dark-factory:fixer`, `dark-factory:scribe`
(if the Agent tool lists them without the `dark-factory:` prefix, use the listed name).

## Context economy (you are the long-lived context)

You run for the whole unit; every token you read stays until compaction. So:
- Give every agent absolute paths for its inputs — never paste file contents into a prompt.
  Every agent starts cold: its prompt must name every input it needs; "as above" means nothing to it.
- Act on agents' short return lines. Do not read the files agents write unless a decision
  depends on them; when you must, read only front matter (`head -n 15`), not bodies.
- Triage is a script (`dark-factory:quality-gate`); do not read findings files.
- Long command output (gates, builds) goes to `<run>/.tmp/<name>.log`; read only the summary
  and the first failure (`tail`, `grep`), never the whole log.
- Append journal lines with the shell (`printf '%s\n' "<line>" >> <run>/journal.md`), not by
  re-reading and rewriting the file.
- Edit `.claude/factory-run.json` in place (change the fields you mean to change on the current
  file); never write it whole from memory.

## Models

Spawn each agent with the Agent tool's `model` set from config `models` (template defaults
below). The agent's own front matter is the fallback when the config has no entry;
`inherit` means: omit `model`, use this session's model.

| Role | Default | Why |
|---|---|---|
| planner, ticket-writer | opus | Once per run; their output is the spec every later agent works from — errors here multiply. |
| judge | opus | Binding decisions with no human check; verifies cited evidence. |
| solver | by question impact: high → opus, medium/low → sonnet | Panel cost scales ×3–6 per question; the opus judge verifies sonnet ballots. |
| reviewer | correctness, spec-security, holistic → opus; standards → sonnet | Rule-matching against cited standards does not need the strongest model; finding real defects does. |
| implementer, fixer | inherit | Run the orchestrating session on the model you want writing code. Set it explicitly to pin it. |
| tester | sonnet | Maps ACs to tests and runs the gate; the reviewers catch weak reasoning. |
| scribe | sonnet | Docs and report from structured files. |

Record the model in the journal line of each agent step (`<time> <ticket> review/correctness@opus <result>`).

## Run state (`.claude/factory-run.json`)

```json
{
  "run_id": "phase-15",
  "unit": "Phase 15",
  "status": "running",
  "stage": "plan | decide | ticket | build | close | done",
  "current": { "ticket": "P15-02", "step": "review", "round": 1 },
  "base_commit": "<sha of the integration branch when the run started>",
  "phase_branch": "factory/phase-15",
  "integration_branch": "develop",
  "protected_branches": ["master", "main"],
  "baseline_failures": [],
  "tracking_issue": null,
  "max_continuations": 40,
  "max_stalled_continuations": 5,
  "max_agent_calls": 300,
  "started": "<ISO time>",
  "halt_reason": null
}
```

The three limits are copied from config `limits` at start; the hooks enforce them
(Stop hook: total and no-progress continuations; agent hook: the agent-call budget — a spawn
past the budget is denied and you must halt).

Update `stage` and `current` **before** you start each step and append one line to
`journal.md` **after** each step (`<time> <ticket> <step> <result>`). On resume, the
journal plus ticket front matter tell you where to continue; a step that was started but has
no journal line is repeated.

## Checkpoint

Every commit you make on the phase branch is a checkpoint, so that a new session on a new
machine (for example a cloud session after its container was reclaimed) can resume the run
from the remote:

1. **Before the commit:** copy `.claude/factory-run.json` to `<run>/run-state.json` and
   `.claude/factory-run.hooks.json` (if present) to `<run>/hook-state.json` (`cp`; do not
   edit the copies), and stage both with the run directory.
2. **After the commit, if `git.push: true`:** `git push -u origin <phase_branch>`. If the
   ticket was just parked with `park_mode: branch`, also `git push -u origin factory/parked/<ticket>`.
   Never push a protected branch or the integration branch here. Never force-push.
   A failed push is not a halt reason: append a journal line, continue, and push again at the
   next checkpoint (it carries all earlier commits).

Only committed and pushed work survives the loss of the machine. A ticket that was in progress
is then repeated from its last committed state.

## Restore from the remote

Used when `.claude/factory-run.json` does not exist (a new clone or a new machine). Only
when `git.push: true`.

1. `git fetch origin`. Find the run: the requested unit's `phase_branch`, or else every
   remote branch that matches the `phase_branch` pattern
   (`git for-each-ref --format='%(refname:short)' 'refs/remotes/origin/<pattern with * for {run_id}>'`).
2. Skip a branch that is already merged
   (`git merge-base --is-ancestor origin/<phase_branch> origin/<integration>` succeeds) — that
   run is done. Read `<run_dir>/<run_id>/run-state.json` on the rest
   (`git show origin/<phase_branch>:<path>`); keep those with `status` `running` or `halted`.
3. None → there is no run to restore. More than one → do not choose; list them to the user and stop.
4. One → `git switch <phase_branch>` (creates the local branch that tracks the remote one; the
   working tree must be clean outside `ignore_dirty`). Copy `<run>/run-state.json` to
   `.claude/factory-run.json` and `<run>/hook-state.json` (if present) to
   `.claude/factory-run.hooks.json`. Append a journal line `restored from origin/<phase_branch>`.
   If `current.ticket` has `status: in_progress`, its uncommitted change is lost: the ticket
   starts again at step 1 "Implement" with the same ticket file.
5. Continue with "Resume" (the run state now exists).

## Resume

Used by `/dark-factory:resume` and by Stage 0 when a run is already `running`. Read the run
state, the journal tail and the ticket front matter. Then, in `.claude/factory-run.hooks.json`,
set `owner_session` to `null` and `continuations` and `stalled` to `0` (keep `agent_calls`):
the next agent you spawn claims the run for this session, so the Stop hook keeps **this**
session going and not the one that crashed. If the run was halted by the agent budget, raise
`max_agent_calls` in the run state only when the user's note asks for it. Continue at the
recorded stage and step.

## Stage 0 — Start (or resume)

1. Read `.claude/factory.md`. If it does not exist, stop and tell the user to run `/dark-factory:init`.
2. If `.claude/factory-run.json` exists with `status: running` → do "Resume" above. Skip the rest of Stage 0.
   If it does not exist and `git.push: true` → do "Restore from the remote" for the requested
   unit. A restored `running` run → "Resume", skip the rest of Stage 0. A restored `halted`
   run → stop and tell the user that `/dark-factory:resume` continues it.
3. Resolve the unit: the argument, or if none, the first unit in the plan that is not
   complete (per config `plan` + `next_unit_hint`). Derive `run_id` (for example `phase-15`).
4. Preflight (any failure here is reported to the user and the run does not start — this is the only point where you may talk to the user):
   - Working tree clean except paths in config `ignore_dirty`.
   - `git fetch` ok; integration branch exists.
   - Create `phase_branch` from the latest integration branch (`git switch -c <phase_branch> origin/<integration>` or local if `push: false`). If it already exists, switch to it.
   - Run `commands.gate` once on the clean base. Record failing test names in `baseline_failures` — they are not the factory's fault and do not block a ticket, but must not get worse.
5. Write `factory-run.json` with `status: running` (limits from config `limits`), create the run directory, the first journal line, then sync the tracker (Skill `dark-factory:tracker-sync`, action `start`).
   From here on, every commit on the phase branch follows "Checkpoint".

## Stage 1 — Plan

Spawn `planner` with `config`, `unit`, `run_dir`. Then read `questions/*.md` front matter.

## Stage 2 — Decide

For every question with `status: open`, run the **consensus protocol** (Skill
`dark-factory:consensus`). Questions that do not depend on each other can run at the same
time: spawn all their round-1 solvers in one message (3 per question, at most
`limits.parallel_agents` agents in one message).

- `blocker` questions (from the planner or the judge): mark every work item in their
  `blocks` list as parked-to-be. Do not halt the run while other work can go on.
- `answered` questions need no action.

## Stage 3 — Tickets

Spawn `ticket-writer`. Read `tickets/INDEX.md`. Set ticket `status: parked` for tickets
that only exist to do blocked work (reason: the blocker question id). Commit the run
directory on the phase branch: `chore(factory): plan <unit>` (no code yet). Tracker sync action `tickets`.

## Stage 4 — Build (per ticket, in INDEX order)

Skip tickets whose `depends_on` contains a parked or failed ticket; park them with
reason "depends on <id>". For each ready ticket:

1. **Implement.** Set ticket `status: in_progress`. Spawn `implementer`.
   - `NEEDS_DECISION` → write the question as `questions/Q<NN>-<slug>.md` (status open,
     impact high), run the consensus protocol, append the decision to the ticket's
     "Decisions to apply", spawn `implementer` again (it continues from the working tree).
     At most `limits.decisions_per_ticket` times; then park.
   - `FAILED` → one retry with a fresh `implementer` and the failure text; then park.
2. **Gate.** Run the quality gate (Skill `dark-factory:quality-gate`). It returns
   `PASS` or `PARK <reason>`.
3. **Commit (on PASS).** Check `git status --porcelain`: it must hold only the ticket's
   change and run-directory files. Stage those paths explicitly (`git add -- <paths> <run dir>`),
   not `git add -A`; anything unrelated is a defect to report in the ticket notes, not to commit.
   Commit on the phase branch with config `commit_format`, for example
   `feat(phase15): P15-02 <ticket title>` and a body listing ACs and decision ids.
   Never `--no-verify`. If a commit hook fails, treat its output as a test failure and run one more fix round.
   Record the sha in the ticket (`commit:`), set `status: done`, tick the ACs. Tracker sync action `ticket-done`.
4. **Park (on PARK).** Save the ticket's code for the human, but **never the run directory**
   (its journal, reviews and ticket files are the run's state and must stay in the tree):
   - `park_mode: stash` → `git stash push -u -m "factory <ticket> parked" -- . ":(exclude)<run dir>"`.
   - `park_mode: branch` → `git switch -c factory/parked/<ticket>`, stage the change without the
     run directory (`git add -A -- . ":(exclude)<run dir>"`), commit, `git switch <phase_branch>`
     (the uncommitted run-directory files come along).
   Check that the tree is clean outside the run directory. Set `status: parked` with the reason,
   commit the run directory (`chore(factory): park <ticket>`). Tracker sync action `ticket-parked`.

Context hygiene: after each ticket, your own notes about it are no longer needed —
rely on the files. If your context grows large, the journal and ticket files are the truth.

## Stage 5 — Close

1. If no ticket is done → halt (see "Halting"), reason "no ticket passed".
2. **Whole-run review.** Spawn `reviewer` with lens `holistic`, `phase_diff_base: <base_commit>`
   and `findings: <run>/reviews/holistic.md`. Triage it with the quality gate's script.
   Accepted findings → fixer rounds on the phase branch (at most `limits.max_fix_rounds`), each
   followed by the full gate; commit as `fix(<scope>): whole-run review fixes`. If the gate is not
   green after the last round, `git revert` the fix commit(s) (no `reset --hard`) and record the
   findings as deferred.
3. **Docs.** Spawn `scribe` with `config`, `run_dir`, `diff_base: <base_commit>`, `hook_state`
   (absolute path of `.claude/factory-run.hooks.json`) and `report_template` (absolute path of
   `templates/REPORT.md` in this skill's directory). Commit `docs(<scope>): factory run <run_id>`.
4. **Bring in the integration branch.** `git fetch` (when `push: true`). If the integration
   branch moved since `base_commit` (`git merge-base --is-ancestor <integration> HEAD` fails),
   merge it **into the phase branch**. On conflict, let a `fixer` resolve them with the gate as
   proof, then commit. Unresolvable → `git merge --abort` and halt with the phase branch intact.
5. **Integration gate — on the phase branch.** Run `commands.gate` and every
   `commands.extra_gates` entry, output to `.tmp/` logs. Must be green (baseline failures excepted).
   Not green → one fixer round, gate again; still red → halt with the phase branch intact.
   The integration branch is never touched until the exact tree to be merged is green.
6. **Merge.** `git switch <integration>`, `git pull --ff-only` (when `push: true`); if that pulled
   anything new, switch back and repeat step 4. Then
   `git merge --no-ff <phase_branch> -m "Merge <phase_branch>: <unit> (factory run)"`.
   The integration branch is an ancestor of the phase branch, so this cannot conflict and the
   merged tree is the gated tree: verify with `git diff --quiet <phase_branch> HEAD` instead of
   running the gate again. (No post-merge revert: reverting a merge commit makes a later
   re-merge of the same branch silently drop its changes.)
7. If `push: true`: `git push origin <integration>` and `git push -u origin <phase_branch>`. Never push a protected branch. Never force-push.
8. Tracker sync action `close`. Set `status: done`, `stage: done`. Print the summary (below) to the user.

## Halting

Set `status: halted` with `halt_reason`, commit the run directory (a checkpoint: it is pushed), sync the tracker
(action `halt`), print the summary. Halt only when:
- preflight fails, or the baseline gate cannot run at all (build tool missing, database container cannot start);
- every remaining ticket is parked or blocked;
- a git operation would need a protected branch, a force push or a history rewrite;
- the same unexpected error happens three times in a row;
- an agent spawn is denied by the agent budget (`max_agent_calls`);
- the Stop hook halted the run (cap or no progress) — then do only this procedure.

When halting with a ticket's change still in the working tree, park it first (Stage 4 "Park").

Never halt to ask a question that the consensus protocol can answer.

## Summary to the user (end of run)

Max 20 lines, in the language the project instructions require:
outcome (`merged into <integration>` / `halted: <reason>`), tickets done/parked with
reasons, decisions by method (count `judge` decisions — those are the first ones the
human should audit), ADRs written, manual checks still open, agent calls by role and model
(from the hook state), link to `REPORT.md`.
