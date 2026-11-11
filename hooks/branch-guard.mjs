// PreToolUse(Bash|PowerShell): during an active factory run, refuse git commands
// that could change a protected branch (default: master, main) or rewrite history.
// The factory may only write to its own phase branch and merge into the
// integration branch.
import { execSync } from 'node:child_process';
import { readInput, activeRun } from './lib.mjs';

const input = readInput();
const state = activeRun(input);
if (!state) process.exit(0);

const cmd = String(input.tool_input?.command || '');
if (!/\bgit\b/.test(cmd)) process.exit(0);

const protectedBranches = state.protected_branches?.length ? state.protected_branches : ['master', 'main'];
const names = protectedBranches.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const mentionsProtected = new RegExp(`(^|[\\s:/'"])(${names})($|[\\s'";&|])`).test(cmd);

function currentBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd: input.cwd || process.cwd(), encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

let reason = '';
if (/\bgit\b[^;&|]*\bpush\b[^;&|]*(\s--force\b|\s-f\b|\s--force-with-lease\b|\s\+\S)/.test(cmd)) {
  reason = 'Force push is not allowed during a factory run.';
} else if (/\bgit\b[^;&|]*\b(push|checkout|switch|merge(?!-)|rebase|reset|branch\s+-[dDmM])\b/.test(cmd) && mentionsProtected) {
  reason = `The command names a protected branch (${protectedBranches.join(', ')}). The factory merges only into "${state.integration_branch || 'develop'}".`;
} else if (/\bgit\b[^;&|]*\b(commit|merge(?!-)|rebase|reset|cherry-pick|revert)\b/.test(cmd)) {
  const head = currentBranch();
  if (protectedBranches.includes(head)) {
    reason = `HEAD is on protected branch "${head}". Switch to the phase branch first.`;
  }
}

if (reason) {
  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: `dark-factory branch guard: ${reason}`
    }
  }));
}
process.exit(0);
