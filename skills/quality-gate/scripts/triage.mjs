#!/usr/bin/env node
// Deterministic triage of review findings for one ticket round. Rules, not judgement:
//   accepted = blocker with confidence >= --blocker
//            | major   with confidence >= --major
//            | major/blocker whose location (same file, within 3 lines) is also flagged
//              as major/blocker by another lens (corroborated)
//   deferred = everything else
//
// Usage:
//   node triage.mjs [--blocker 0.5] [--major 0.7] [--append-deferred <ticket.md>] <findings.md>...
// Prints one JSON object: { accepted: [...], deferred_count, counts }.
// With --append-deferred, deferred findings are appended to the end of the ticket file
// (its last section is "## Notes"), skipping ones already listed.
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
import { basename } from 'node:path';

const args = process.argv.slice(2);
const opt = { blocker: 0.5, major: 0.7, append: null };
const files = [];
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--blocker') opt.blocker = Number(args[++i]);
  else if (a === '--major') opt.major = Number(args[++i]);
  else if (a === '--append-deferred') opt.append = args[++i];
  else files.push(a);
}

const unquote = (v) => {
  const t = v.trim();
  if (/^"[\s\S]*"$/.test(t)) {
    try { return String(JSON.parse(t)); } catch { /* fall through */ }
  }
  return t.replace(/^(["'])([\s\S]*)\1$/, '$2');
};

function parse(file) {
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  let lens = basename(file).split('.').slice(-2, -1)[0] || 'unknown';
  let body = text;
  const fm = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    const m = fm[1].match(/^lens:\s*(.+)$/m);
    if (m) lens = unquote(m[1]);
    body = text.slice(fm[0].length);
  }
  const out = [];
  let cur = null;
  let lastKey = null;
  for (const line of body.split('\n')) {
    const start = line.match(/^\s*-\s+id:\s*(.*)$/);
    if (start) {
      cur = { lens, id: unquote(start[1]) };
      out.push(cur);
      lastKey = 'id';
      continue;
    }
    if (!cur) continue;
    const kv = line.match(/^\s+([a-z_][\w-]*):\s?(.*)$/i);
    if (kv) {
      lastKey = kv[1].toLowerCase();
      cur[lastKey] = unquote(kv[2]);
    } else if (line.trim() && lastKey) {
      cur[lastKey] = `${cur[lastKey]} ${line.trim()}`.trim();
    }
  }
  for (const f of out) {
    f.severity = String(f.severity || 'minor').toLowerCase().split(/[\s|]/)[0];
    f.confidence = Number.parseFloat(f.confidence);
    if (!Number.isFinite(f.confidence)) f.confidence = 0;
    const loc = String(f.location || '').match(/^(.*?):(\d+)/);
    f._file = loc ? loc[1] : String(f.location || '');
    f._line = loc ? Number(loc[2]) : null;
  }
  return out;
}

const all = files.filter((f) => existsSync(f)).flatMap(parse);
const serious = (f) => f.severity === 'blocker' || f.severity === 'major';
const near = (a, b) => a._file && a._file === b._file && (a._line === null || b._line === null || Math.abs(a._line - b._line) <= 3);

const accepted = [];
const deferred = [];
for (const f of all) {
  let why = null;
  if (f.severity === 'blocker' && f.confidence >= opt.blocker) why = 'blocker';
  else if (f.severity === 'major' && f.confidence >= opt.major) why = 'major';
  else if (serious(f) && all.some((g) => g !== f && g.lens !== f.lens && serious(g) && near(f, g))) why = 'corroborated';
  (why ? accepted : deferred).push(why ? { ...f, accepted_as: why } : f);
}

const clean = ({ _file, _line, ...f }) => f;

if (opt.append && deferred.length) {
  const ticket = readFileSync(opt.append, 'utf8');
  // The same finding usually comes back every round: dedupe on "location: claim".
  const seen = new Set();
  const lines = [];
  for (const f of deferred) {
    const key = `${f.location || '?'}: ${f.claim || ''}`.trim();
    if (seen.has(key) || ticket.includes(key)) continue;
    seen.add(key);
    lines.push(`- ${f.lens}/${f.id} ${f.severity} ${f.confidence} ${key}`);
  }
  if (lines.length) appendFileSync(opt.append, `\n### Deferred findings\n${lines.join('\n')}\n`, 'utf8');
}

const counts = {};
for (const f of all) counts[f.severity] = (counts[f.severity] || 0) + 1;
process.stdout.write(JSON.stringify({ accepted: accepted.map(clean), deferred_count: deferred.length, counts }) + '\n');
