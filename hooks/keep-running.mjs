// Stop hook: while a factory run is active, the orchestrating session may not end
// its turn. It is told to continue from the run file.
//
// Two caps stop a runaway loop:
// - `max_continuations` (default 40): forced continuations per run in total;
// - `max_stalled_continuations` (default 5): forced continuations in a row with no
//   progress (no agent spawned and no new commit since the previous one).
// At a cap the run is set to halted and the session gets ONE last turn to carry out
// the halting procedure (park, commit the run directory, report); after that the
// status is no longer "running" and the session may stop.
import { readInput, activeRun, saveRun, loadHookState, saveHookState, ownedBy, git } from './lib.mjs';

const input = readInput();
const run = activeRun(input);
if (!run) process.exit(0);
const { root, state } = run;

const hs = loadHookState(root, state.run_id);
if (!ownedBy(hs, input)) process.exit(0);
if (!hs.owner_session && input.session_id) hs.owner_session = input.session_id;

const intOr = (v, d) => (Number.isInteger(v) && v > 0 ? v : d);
const max = intOr(state.max_continuations, 40);
const maxStalled = intOr(state.max_stalled_continuations, 5);

const mark = `${hs.agent_calls}:${git(root, ['rev-parse', 'HEAD'])}`;
hs.stalled = hs.last_mark === mark ? hs.stalled + 1 : 0;
hs.last_mark = mark;
hs.continuations += 1;

let capReason = '';
if (hs.continuations > max) capReason = `Stop hook cap reached (${max} forced continuations).`;
else if (hs.stalled >= maxStalled) capReason = `No progress in ${maxStalled} forced continuations in a row (no agent spawned, no commit).`;

saveHookState(root, hs);

if (capReason) {
  state.status = 'halted';
  state.halt_reason = capReason;
  saveRun(root, state);
  process.stdout.write(JSON.stringify({
    decision: 'block',
    systemMessage: `dark-factory: run "${state.run_id}" halted — ${capReason}`,
    reason:
      `Dark factory run "${state.run_id}" was halted by the Stop hook: ${capReason} ` +
      'Do NOT continue the pipeline. Carry out only the orchestrator "Halting" procedure now: park the current ticket ' +
      'if the working tree holds its uncommitted change, commit the run directory on the phase branch, tracker sync ' +
      'action halt, and print the end-of-run summary to the user. status is already "halted".'
  }));
  process.exit(0);
}

const where = state.current ? ` Current step: ${JSON.stringify(state.current)}.` : '';
process.stdout.write(JSON.stringify({
  decision: 'block',
  reason:
    `Dark factory run "${state.run_id}" is still active (forced continuation ${hs.continuations}/${max}).${where} ` +
    'Re-read .claude/factory-run.json and the run directory, then continue the orchestrator protocol ' +
    '(Skill dark-factory:orchestrator) from the next unfinished step. Do not ask the user anything. ' +
    'Only if every ticket is done or parked and the phase is closed, or a hard blocker makes all remaining work impossible, ' +
    'set "status" to "done" or "halted" in .claude/factory-run.json and write the final report.'
}));
process.exit(0);
