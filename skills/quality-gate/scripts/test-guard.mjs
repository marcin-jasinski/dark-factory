#!/usr/bin/env node
// Mechanical check that the uncommitted change did not weaken the test suite.
// Flags, against HEAD:
//   - deleted test files                                   (blocker, 0.9)
//   - added skip / ignore / focus markers in test files    (blocker, 0.9)
//   - fewer assertion lines in a test file than before     (blocker, 0.6 — may be a
//     legitimate refactor; the fixer can dispute it and the judge rules)
// Writes a findings file in the reviewer format (lens: test-guard), so triage picks it up.
//
// Usage: node test-guard.mjs --out <findings.md> [--ticket <id>] [--base HEAD]
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const args = process.argv.slice(2);
const opt = { out: null, ticket: '', base: 'HEAD' };
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--out') opt.out = args[++i];
  else if (args[i] === '--ticket') opt.ticket = args[++i];
  else if (args[i] === '--base') opt.base = args[++i];
}
if (!opt.out) {
  console.error('usage: test-guard.mjs --out <findings.md> [--ticket <id>] [--base HEAD]');
  process.exit(2);
}

const git = (a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const root = git(['rev-parse', '--show-toplevel']).trim();

const TEST_FILE = [
  /(^|\/)(tests?|__tests__|specs?|testing)\//i,
  /(^|\/)test_[^/]*\.py$/,
  /_test\.(go|py|rb|exs?)$/,
  /[._-](test|spec)s?\.[cm]?[jt]sx?$/,
  /Tests?\.(java|kt|kts|cs|scala|groovy|swift|php)$/,
  /(Spec|IT)\.(java|kt|groovy|scala)$/
];
const isTest = (p) => TEST_FILE.some((r) => r.test(p));
const ASSERT = /\b(assert\w*|expect\w*|should\w*|verify\w*|t\.(Errorf?|Fatalf?)|require\.\w+)\b/;
const SKIP = /@(Disabled|Ignore)\b|\b(it|test|describe|context)\.(skip|only|todo)\(|\bx(it|describe|test)\(|\bf(it|describe)\(|pytest\.mark\.(skip|xfail)|@unittest\.skip|\bt\.Skip(Now|f)?\(|\[Ignore\]|Skip\s*=\s*"|#\[ignore\]|\bpending\(/;

const findings = [];
const add = (severity, confidence, location, claim, evidence, fix) =>
  findings.push({ id: `TG${findings.length + 1}`, severity, confidence, location, claim, evidence, fix });

// Deleted test files.
for (const line of git(['diff', '--name-status', opt.base]).split('\n')) {
  const [status, path] = line.split('\t');
  if (status === 'D' && path && isTest(path)) {
    add('blocker', 0.9, `${path}:1`, 'A test file was deleted.', `git diff --name-status ${opt.base}: D ${path}`, 'Restore the test file; change tests only when they contradict an AC or decision, and say why.');
  }
}

// Changed tracked test files: assertion count and new skip markers.
const diff = git(['diff', '-U0', '--no-color', opt.base]);
let file = null;
let newLine = 0;
const perFile = new Map();
for (const line of diff.split('\n')) {
  if (line.startsWith('+++ ')) {
    file = line.slice(4).replace(/^b\//, '');
    if (file === '/dev/null' || !isTest(file)) file = null;
    continue;
  }
  if (!file) continue;
  const h = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)/);
  if (h) { newLine = Number(h[1]); continue; }
  const s = perFile.get(file) || { removed: 0, added: 0, firstLine: newLine };
  if (line.startsWith('-') && !line.startsWith('---')) {
    if (ASSERT.test(line)) s.removed++;
  } else if (line.startsWith('+') && !line.startsWith('+++')) {
    if (ASSERT.test(line)) s.added++;
    if (SKIP.test(line)) add('blocker', 0.9, `${file}:${newLine}`, 'A skip/ignore/focus marker was added to a test.', line.slice(1).trim(), 'Remove the marker and make the test pass, or dispute with evidence.');
    newLine++;
  }
  perFile.set(file, s);
}
for (const [path, s] of perFile) {
  if (s.removed > s.added) {
    add('blocker', 0.6, `${path}:${s.firstLine}`, `The test file lost ${s.removed - s.added} assertion line(s) (${s.removed} removed, ${s.added} added).`, `git diff ${opt.base} -- ${path}`, 'Restore the assertions, or dispute: show the behaviour is still asserted elsewhere or the test contradicted an AC/decision.');
  }
}

// New untracked test files with skip markers.
for (const path of git(['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean)) {
  if (!isTest(path)) continue;
  let text = '';
  try { text = readFileSync(join(root, path), 'utf8'); } catch { continue; }
  text.split('\n').forEach((l, i) => {
    if (SKIP.test(l)) add('blocker', 0.9, `${path}:${i + 1}`, 'A new test is skipped/ignored/focused.', l.trim(), 'Remove the marker and make the test pass.');
  });
}

const q = (v) => JSON.stringify(String(v));
const body = findings
  .map((f) => [`- id: ${f.id}`, `  severity: ${f.severity}`, `  confidence: ${f.confidence}`, `  location: ${f.location}`, `  claim: ${q(f.claim)}`, `  evidence: ${q(f.evidence)}`, `  fix: ${q(f.fix)}`].join('\n'))
  .join('\n');
mkdirSync(dirname(opt.out), { recursive: true });
writeFileSync(opt.out, `---\nlens: test-guard\nticket: ${opt.ticket}\nverdict: ${findings.length ? 'changes' : 'approve'}\n---\n${body}\n`, 'utf8');
console.log(`test-guard: ${findings.length ? `${findings.length} finding(s)` : 'clean'} -> ${opt.out}`);
