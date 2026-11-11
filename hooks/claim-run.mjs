// PreToolUse(Agent|Task): during an active run,
// - the first session that spawns an agent becomes the run's owner (the Stop hook
//   then only keeps that session going; /dark-factory:resume clears the owner);
// - every spawn is counted per agent type (for the report and stall detection);
// - when `max_agent_calls` in the run state is reached, further spawns are denied and
//   the orchestrator is told to halt. This is the run's hard cost budget.
import { readInput, activeRun, loadHookState, saveHookState } from './lib.mjs';

const input = readInput();
const run = activeRun(input);
if (!run) process.exit(0);
const { root, state } = run;

const hs = loadHookState(root, state.run_id);
if (!hs.owner_session && input.session_id) hs.owner_session = input.session_id;
// Another session's agents (for example a /dark-factory:decide in a second window) are not counted.
if (input.session_id && hs.owner_session !== input.session_id) process.exit(0);

const max = Number.isInteger(state.max_agent_calls) && state.max_agent_calls > 0 ? state.max_agent_calls : null;
if (max !== null && hs.agent_calls >= max) {
  saveHookState(root, hs);
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason:
        `dark-factory budget: this run has used ${hs.agent_calls}/${max} agent calls (limits.max_agent_calls). ` +
        'Do not spawn more agents. Halt the run now (orchestrator "Halting" section) with reason "agent budget exhausted".'
    }
  }));
  process.exit(0);
}

const type = String(input.tool_input?.subagent_type || 'general-purpose');
const model = String(input.tool_input?.model || 'default');
const key = `${type}@${model}`;
hs.agent_calls += 1;
hs.by_agent[key] = (hs.by_agent[key] || 0) + 1;
saveHookState(root, hs);
process.exit(0);
