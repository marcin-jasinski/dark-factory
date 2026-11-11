// Shared helpers for the dark-factory hooks. No dependencies: Node built-ins only.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export const RUN_FILE = join('.claude', 'factory-run.json');

export function readInput() {
  try {
    const raw = readFileSync(0, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function runPath(input) {
  return join(input.cwd || process.cwd(), RUN_FILE);
}

/** Returns the active run state, or null when no factory run is active. */
export function activeRun(input) {
  const file = runPath(input);
  if (!existsSync(file)) return null;
  try {
    const state = JSON.parse(readFileSync(file, 'utf8'));
    if (state.status !== 'running') return null;
    return state;
  } catch {
    return null;
  }
}

export function saveRun(input, state) {
  writeFileSync(runPath(input), JSON.stringify(state, null, 2) + '\n', 'utf8');
}

/** True when the run belongs to this session, or no session has claimed it yet. */
export function ownedBy(state, input) {
  return !state.owner_session || !input.session_id || state.owner_session === input.session_id;
}
