---
# Dark factory project config. Paths are relative to the repository root.

plan: docs/plan.md                 # the agreed implementation plan (source of truth)
unit_kind: phase                   # what one run covers: phase | milestone | epic
next_unit_hint: "first unit whose heading is not marked done"
read_first:                        # every agent reads these before work
  - CLAUDE.md
docs_to_update:                    # the scribe updates these at the close of a run
  - docs/plan.md
adr_dir: docs/adr                  # empty = never write ADRs
run_dir: docs/factory              # run directories go here (committed)

git:
  integration_branch: develop      # the factory merges finished runs here
  protected_branches: [master, main]
  phase_branch: "factory/{run_id}"
  push: true                       # push the integration and phase branches at the end
  park_mode: stash                 # stash | branch — where unfinished work of a parked ticket goes
commit_format: "feat({scope}): {ticket} {title}"
ignore_dirty: []                   # untracked paths that do not block preflight

commands:
  fast: "<compile + unit tests>"   # implementer and fixer run this
  gate: "<full build + all tests>" # tester and close run this
  extra_gates:                     # run only when the change touches `when`
    - when: ["frontend/**"]
      run: "<frontend build + tests>"

review:
  lenses: [correctness, standards, spec-security]
  blocker_min_confidence: 0.5
  major_min_confidence: 0.7

limits:
  max_fix_rounds: 3
  decisions_per_ticket: 2
  parallel_agents: 6

tracker:
  github: true
  label: factory
  labels: { ready: ready-for-agent, human: ready-for-human }

standards_map:                     # which standards apply to which change
  "**/*": []
---

# House rules for factory agents

Project-specific rules every agent must follow, in addition to the project instructions
(CLAUDE.md). Keep this short; link to docs instead of copying them.
