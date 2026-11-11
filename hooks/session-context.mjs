// SessionStart(compact|resume): after a context compaction (or a resumed session) the
// orchestrator has lost the skill text and its working notes. If this session owns an
// active run, put the re-entry instructions back into its context.
import { readInput, activeRun, loadHookState, ownedBy } from './lib.mjs';

const input = readInput();
const run = activeRun(input);
if (!run) process.exit(0);
const { root, state } = run;
if (!ownedBy(loadHookState(root, state.run_id), input)) process.exit(0);

const where = state.current ? ` Recorded step: ${JSON.stringify(state.current)}.` : '';
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'SessionStart',
    additionalContext:
      `You are the orchestrator of dark-factory run "${state.run_id}" (unit "${state.unit}", stage "${state.stage}").${where} ` +
      'Your earlier context was compacted. Invoke the Skill dark-factory:orchestrator again, re-read ' +
      '.claude/factory-run.json, the run journal and the ticket front matter, and continue from the next unfinished step. ' +
      'The files are the truth; do not rely on your memory of earlier steps. Do not ask the user anything.'
  }
}));
process.exit(0);
