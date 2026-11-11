// PreToolUse(Agent|Task): the first session that spawns an agent while a run is
// active becomes the run's owner. The Stop hook then only keeps that session going.
import { readInput, activeRun, saveRun } from './lib.mjs';

const input = readInput();
const state = activeRun(input);
if (state && !state.owner_session && input.session_id) {
  state.owner_session = input.session_id;
  saveRun(input, state);
}
process.exit(0);
