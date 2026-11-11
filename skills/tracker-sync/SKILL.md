---
name: tracker-sync
description: Mirrors a dark-factory run to GitHub Issues — one tracking issue per run, one issue per ticket, decisions as comments, labels for state. Markdown files in the run directory stay the source of truth; this is a one-way mirror. Use from the dark-factory orchestrator and consensus protocol.
---

# Tracker sync (GitHub mirror)

Do nothing if config `tracker.github` is `false`. A failure here never stops the run:
log it to the journal (`tracker-sync failed: <error>`) and go on.

Use `gh` in the repository. Write bodies to a temp file in the run directory's `.tmp/`
(gitignored by the `<run_dir>/**/.tmp/` entry that `/dark-factory:init` adds) and pass `--body-file`; never inline long bodies.
Never put secrets, prompts or model output that the project forbids exporting into an issue.

Labels (create once with `gh label create <name> --color <hex> --force`):
`config.tracker.label` (default `factory`), `factory:<run_id>`, and the triage labels
from config `tracker.labels` (`ready` → default `ready-for-agent`, `human` → default `ready-for-human`).

## Actions

- **start** — create the tracking issue: title `Factory run: <unit>`, body = goal from
  the plan unit and "Run directory: <path> on branch <phase_branch>". Labels: factory,
  factory:<run_id>. Save the number in `factory-run.json` → `tracking_issue`.
- **tickets** — for each ticket without `issue:`: create an issue, title `<id>: <title>`,
  body = Goal + Acceptance criteria + "Tracked in #<tracking_issue>". Labels: factory,
  factory:<run_id>, ready label. Save the number in the ticket's `issue:`. Then edit the
  tracking issue body to add a task list `- [ ] #<n>` in execution order.
- **decision** — comment on the tracking issue: `**D<NN>** (<method>, <class>): <decision paragraph>`, plus the ADR path if any.
- **ticket-done** — `gh issue close <n> --comment "Done in <sha> on <phase_branch>."`.
- **ticket-parked** — comment the park reason; remove the ready label, add the human label.
- **close** — comment the outcome and the path of `REPORT.md`; close the tracking issue
  when every ticket is done, else leave it open.
- **halt** — comment the halt reason and next steps; leave it open; add the human label.
