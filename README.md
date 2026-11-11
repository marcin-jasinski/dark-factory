# dark-factory

A Claude Code plugin that turns an **agreed implementation plan** into merged code with
no human approvals after the plan. You say `/dark-factory:run`; it plans the unit,
settles open questions by agent vote, writes tickets, then implements, tests, reviews
and fixes each ticket, updates the docs, and merges into your integration branch.

You audit afterwards: every decision, vote and finding is a file in the repository.

## Pipeline

```
/dark-factory:run "Phase 15"
  preflight      clean tree, phase branch from develop, baseline gate (records pre-existing failures)
  plan           planner → scope.md, questions/Q*.md (answered | open | blocker), breakdown.md
  decide         per open question: 3 solvers in parallel (pragmatist / architect / skeptic)
                 → judge tallies → debate round on a split → judge decides → decisions/D*.md (+ ADR)
  tickets        ticket-writer → tickets/*.md (self-contained, ACs, test plan, depends_on)
  build          per ticket:
                   implementer (tests + code, fast checks; escalates load-bearing questions to the panel)
                   quality gate: tester → reviewers ×3 lenses ‖ test guard (script) → triage (script)
                                 → fixer → judge on disputes; later rounds re-review only the fix
                   ≤ 3 rounds → commit on phase branch | park the ticket (stash or parked branch)
  close          holistic review → scribe updates plan/roadmap/index → merge develop into the phase
                 branch → full gate there → merge --no-ff into develop (same tree, no re-gate) → push
```

Everything is mirrored to GitHub Issues (one tracking issue per run, one issue per
ticket, decisions as comments). The Markdown files stay the source of truth.

## Parts

| Kind | Name | Job |
|---|---|---|
| command | `/dark-factory:init` | Write `.claude/factory.md` from the repo's own docs and build files |
| command | `/dark-factory:run [unit]` | Start or resume a run |
| command | `/dark-factory:resume [note]` | Continue a running or halted run; a note can answer a blocker |
| command | `/dark-factory:status` | Read-only run state |
| command | `/dark-factory:halt [reason]` | Stop cleanly, park the current ticket |
| command | `/dark-factory:decide <question>` | Use the panel on one question, outside a run |
| skill | `orchestrator` | The pipeline and the run state machine |
| skill | `consensus` | Panel → tally → debate → judge → decision record |
| skill | `quality-gate` | Test / review / triage / fix loop per ticket |
| skill | `tracker-sync` | One-way mirror to GitHub Issues |
| agent | `planner` (opus) | Scope, open questions, draft breakdown |
| agent | `solver` (opus / sonnet by impact) | One panel ballot through one lens |
| agent | `judge` (opus) | Binding decisions; rules on disputed findings |
| agent | `ticket-writer` (opus) | Self-contained tickets |
| agent | `implementer` (inherit) | One ticket, tests first, never commits |
| agent | `tester` (sonnet) | Independent AC → test check, full gate |
| agent | `reviewer` (opus; standards: sonnet) | One lens: correctness / standards / spec-security / holistic |
| agent | `fixer` (inherit) | Smallest fix, or dispute with evidence |
| agent | `scribe` (sonnet) | Docs and `REPORT.md` |
| script | `quality-gate/scripts/triage.mjs` | Deterministic triage of review findings |
| script | `quality-gate/scripts/test-guard.mjs` | Flags deleted tests, skip/focus markers and lost assertions |
| hook | `keep-running` (Stop) | The run's session cannot end its turn while the run is `running` (total and no-progress caps) |
| hook | `branch-guard` (PreToolUse) | No commit/merge/push/reset on protected branches, no force push, no `clean -x`/`stash --all` (they delete the run state), during a run |
| hook | `claim-run` (PreToolUse) | Binds the run to the session that orchestrates it; counts agent calls per role and model; enforces the agent budget |
| hook | `session-context` (SessionStart) | After a compaction, puts the orchestrator back on the run |

Models are set per role in `.claude/factory.md` → `models` and passed on each spawn; the
agent's front matter is only the fallback. `inherit` = the orchestrating session's model.

## How decisions are made

| Rule | Result |
|---|---|
| The docs or an ADR already answer it | No vote. The planner cites the source. |
| Low impact | One pragmatist ballot, judge confirms. |
| A verified hard objection (violates an ADR, a non-negotiable rule, security, or is wrong) | That option is out, whatever its votes. |
| 3 of 3 agree | Adopted (`unanimous`). |
| 2 of 3, mean confidence ≥ 0.6, no verified objection from the dissent | Adopted (`majority`). |
| Split | One debate round: all ballots visible to all solvers, then the judge (`debate` or `judge`). |
| Load-bearing (boundary, data model, public API, dependency, security) | Also written as an ADR. |
| Needs a human-only input, or contradicts an accepted ADR | `blocker`: the dependent tickets are parked; the rest of the run goes on. |

Panelists do not see each other in round 1, so you get three independent opinions, not one opinion said three times.

## Review triage

Done by a script, not by the model. Fixed: blockers with confidence ≥ 0.5; majors with
confidence ≥ 0.7 or raised at the same location by two lenses. Everything else is recorded as a deferred finding in the ticket and the report
— not fixed (minimal implementation). The fixer may dispute a finding; the judge rules.
Weakening, deleting or skipping a test to get green is itself a blocker — detected
mechanically by the test guard, not only by reviewers.

## Install

Local, while you develop the plugin:

```bash
claude --plugin-dir D:/Dokumenty/Projekty/dark-factory
```

Or as a local marketplace (in Claude Code):

```
/plugin marketplace add D:/Dokumenty/Projekty/dark-factory
/plugin install dark-factory@dark-factory
```

Requirements: Node.js (hooks), `git`, `gh` (optional, for the mirror).

## Unattended permissions

A run that stops on a permission prompt is not a dark factory. Use one of:

- Desktop app: **Auto** permission mode.
- CLI: `claude --permission-mode acceptEdits` plus an allowlist for the build/test
  commands, `git` and `gh` in `.claude/settings.local.json`.
- `--permission-mode bypassPermissions` **only** inside a container or VM.

The branch guard hook still blocks protected branches in every mode.

## Limits you should know

- Subagents cannot spawn subagents, so the orchestrator must run in the main session.
- The Stop hook forces at most `max_continuations` (default 40) continuations per run, and at
  most `max_stalled_continuations` (default 5) in a row without progress; then it halts the run
  and gives the session one turn to park and report.
- `max_agent_calls` (default 300) is a hard budget: the agent hook denies spawns past it.
- Tickets run one at a time in one checkout. Read-only agents (panel, reviewers) run in parallel.
- Cost: a high-impact question is 4–7 opus calls (medium/low: sonnet panel + opus judge); a
  ticket is about 6–15 agent calls. `REPORT.md` lists the real counts per role and model.
