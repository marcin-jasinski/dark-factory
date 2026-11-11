// Shared helpers for the dark-factory hooks. No dependencies: Node built-ins only.
//
// Two state files live in <repo>/.claude/ (both gitignored):
//   factory-run.json        written by the orchestrator; hooks only read it (except to halt at a cap)
//   factory-run.hooks.json  written only by the hooks: owner session, counters
// Keeping the hook counters in their own file means the orchestrator rewriting its
// state file can never reset the continuation cap, the agent budget or the owner.
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

export const RUN_FILE = join('.claude', 'factory-run.json');
export const HOOKS_FILE = join('.claude', 'factory-run.hooks.json');

export function readInput() {
  try {
    const raw = readFileSync(0, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

/**
 * The repository root that holds .claude/factory-run.json. The session's cwd can be a
 * subdirectory (after a `cd`), so walk up from it; CLAUDE_PROJECT_DIR is tried first.
 */
export function projectRoot(input) {
  const starts = [process.env.CLAUDE_PROJECT_DIR, input.cwd, process.cwd()].filter(Boolean);
  for (const start of starts) {
    let dir = resolve(start);
    for (;;) {
      if (existsSync(join(dir, RUN_FILE))) return dir;
      const up = dirname(dir);
      if (up === dir) break;
      dir = up;
    }
  }
  return null;
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomic(file, data) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
  renameSync(tmp, file);
}

/** Returns { root, state } for the active run, or null when no factory run is active. */
export function activeRun(input) {
  const root = projectRoot(input);
  if (!root) return null;
  const state = readJson(join(root, RUN_FILE));
  if (!state || state.status !== 'running') return null;
  return { root, state };
}

export function saveRun(root, state) {
  writeJsonAtomic(join(root, RUN_FILE), state);
}

/** Hook-owned counters for the active run. Reset when the run id changes. */
export function loadHookState(root, runId) {
  const s = readJson(join(root, HOOKS_FILE));
  if (s && s.run_id === runId) return s;
  return { run_id: runId, owner_session: null, continuations: 0, stalled: 0, agent_calls: 0, by_agent: {}, last_mark: null };
}

export function saveHookState(root, s) {
  writeJsonAtomic(join(root, HOOKS_FILE), s);
}

/** True when the run belongs to this session, or no session has claimed it yet. */
export function ownedBy(hookState, input) {
  return !hookState.owner_session || !input.session_id || hookState.owner_session === input.session_id;
}

export function git(root, args) {
  try {
    return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}
