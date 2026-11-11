// Stop hook: while a factory run is active, the orchestrating session may not end
// its turn. It is told to continue from the run file. A hard cap on continuations
// stops a runaway loop; the orchestrator ends the run by setting status to
// "done" or "halted".
import { readInput, activeRun, saveRun, ownedBy } from './lib.mjs';

const input = readInput();
const state = activeRun(input);
if (!state || !ownedBy(state, input)) process.exit(0);

const max = Number.isInteger(state.max_continuations) ? state.max_continuations : 40;
const used = Number.isInteger(state.continuations) ? state.continuations : 0;
if (used >= max) {
  state.status = 'halted';
  state.halt_reason = `Stop hook cap reached (${max} forced continuations).`;
  saveRun(input, state);
  process.exit(0);
}

state.continuations = used + 1;
saveRun(input, state);

const where = state.current ? ` Current step: ${JSON.stringify(state.current)}.` : '';
process.stdout.write(JSON.stringify({
  decision: 'block',
  reason:
    `Dark factory run "${state.run_id}" is still active (forced continuation ${used + 1}/${max}).${where} ` +
    'Re-read .claude/factory-run.json and the run directory, then continue the orchestrator protocol ' +
    '(Skill dark-factory:orchestrator) from the next unfinished step. Do not ask the user anything. ' +
    'Only if every ticket is done or parked and the phase is closed, or a hard blocker makes all remaining work impossible, ' +
    'set "status" to "done" or "halted" in .claude/factory-run.json and write the final report.'
}));
process.exit(0);
