// PreToolUse(Bash|PowerShell): during an active factory run, refuse git commands
// that could change a protected branch (default: master, main), rewrite published
// history, or destroy the run's gitignored state. The factory may only write to its
// own phase branch and merge into the integration branch.
import { readInput, activeRun, git } from './lib.mjs';

const input = readInput();
const run = activeRun(input);
if (!run) process.exit(0);
const { root, state } = run;

const cmd = String(input.tool_input?.command || '');
if (!/\bgit\b/.test(cmd)) process.exit(0);

const protectedBranches = state.protected_branches?.length ? state.protected_branches : ['master', 'main'];
const names = protectedBranches.map((b) => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
const mentionsProtected = new RegExp(`(^|[\\s:/'"])(${names})($|[\\s'";&|])`).test(cmd);

// One git invocation = from "git" to the next command separator.
const G = String.raw`\bgit\b[^;&|\n]*`;
const forcePush = new RegExp(
  String.raw`${G}\bpush\b[^;&|\n]*(\s--force(-with-lease|-if-includes)?\b|\s-[a-zA-Z]*f[a-zA-Z]*\b|\s\+\S)`
);
const cleanIgnored = new RegExp(String.raw`${G}\bclean\b[^;&|\n]*\s-[a-zA-Z]*[xX]`);
const stashAll = new RegExp(String.raw`${G}\bstash\b[^;&|\n]*(\s--all\b|\s-[a-zA-Z]*a[a-zA-Z]*\b)`);

let reason = '';
if (forcePush.test(cmd)) {
  reason = 'Force push is not allowed during a factory run.';
} else if (cleanIgnored.test(cmd) || stashAll.test(cmd)) {
  reason = 'This would remove gitignored files, including the run state in .claude/. Use `git clean -fd` or `git stash -u` without -x/-X/--all.';
} else if (new RegExp(String.raw`${G}\b(push|checkout|switch|merge(?!-)|rebase|reset|branch\s+-[dDmM])\b`).test(cmd) && mentionsProtected) {
  reason = `The command names a protected branch (${protectedBranches.join(', ')}). The factory merges only into "${state.integration_branch || 'develop'}".`;
} else if (new RegExp(String.raw`${G}\b(commit|merge(?!-)|rebase|reset|cherry-pick|revert|push)\b`).test(cmd)) {
  const head = git(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
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
