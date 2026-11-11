---
description: Set up the dark factory in this repository — writes .claude/factory.md from the project's own docs and build files, gitignores the run state, creates tracker labels.
---

This is the one interactive command: you may ask the user to confirm the config at the end.

1. If `.claude/factory.md` exists, show it and ask whether to rewrite it. Stop if not.
2. Read the template `templates/factory.md` in the `dark-factory:orchestrator` skill's directory.
3. Find the real values in this repository:
   - `plan`: the implementation plan / roadmap (search `docs/` for plan, roadmap, milestones). Note how a unit is marked done.
   - `read_first`: the project instructions (CLAUDE.md, AGENTS.md), the docs index, glossary, architecture summary.
   - `docs_to_update`: plan, roadmap, docs index, configuration docs.
   - `adr_dir`, `run_dir` (default `docs/factory`).
   - `git`: the integration branch (`develop` if it exists, else ask), protected branches (`master`, `main`, and the default branch of the remote).
   - `commands`: from the build files (pom.xml, build.gradle, package.json, Makefile, CI workflow). `fast` must finish in a few minutes; `gate` is the full suite. Add `extra_gates` for sub-projects (for example a frontend folder).
   - `standards_map`: map file globs to the standards files the docs index lists.
   - House rules: the project's non-negotiable rules that a worker must not miss, as short links to their docs. The language rule for reports, if any.
4. Write `.claude/factory.md`. Add `.claude/factory-run.json` to `.gitignore`. Add `<run_dir>/**/.tmp/` to `.gitignore`.
5. If `tracker.github` is true and `gh auth status` works, create the labels (see the `dark-factory:tracker-sync` skill).
6. Check the permission setup for unattended work and tell the user what is missing:
   the run needs file edits, the build and test commands, `git` and `gh` without prompts.
   Recommend: run in Auto mode (desktop app) or `claude --permission-mode acceptEdits` with
   an allowlist for the build commands, `git` and `gh`; or `bypassPermissions` only inside a container.
7. Show the config and the next command: `/dark-factory:run`.
