// A second check on the public copy, run after ops/export-public.mjs and
// before any push. It looks for things that script does not: the stored key
// itself, any gmail address, this computer's host name. It prints counts and
// file names only, never the matched text.
//
//   node ops/prepublish-check.cjs
//
// Exit 0 means nothing was found. Any other exit means: do not push.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const OUT = path.join(REPO, 'public-copy');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

if (!fs.existsSync(OUT)) {
  console.log('no public-copy folder: run ops/export-public.mjs first');
  process.exit(2);
}

// Every value in .env.local, read here and never printed.
const secrets = [];
try {
  for (const line of fs.readFileSync(path.join(REPO, '.env.local'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*[A-Za-z_][A-Za-z0-9_]*\s*=\s*(\S+)/);
    if (m && m[1].length >= 12) secrets.push(m[1]);
  }
} catch { /* no key file */ }

const gitEmail = execSync('git config user.email', { cwd: REPO, encoding: 'utf8' }).trim().toLowerCase();
const host = os.hostname().toLowerCase();
const user = os.userInfo().username.toLowerCase();

// Each of these must find nothing.
const mustBeEmpty = [
  ['a value stored in .env.local', secrets.length ? (t) => secrets.some((s) => t.includes(s)) : null],
  ['the first 12 characters of such a value', secrets.length ? (t) => secrets.some((s) => t.includes(s.slice(0, 12))) : null],
  ['the private repository\'s git email', gitEmail.length > 5 ? (t, low) => low.includes(gitEmail) : null],
  ['a gmail address', (t) => /[A-Za-z0-9._%+-]+@gmail\.com/i.test(t)],
  ['this computer\'s host name', host.length > 3 ? (t, low) => low.includes(host) : null],
  ['this computer\'s user name', user.length > 3 ? (t, low) => low.includes(user) : null],
  ['an Authorization header or bearer token', (t) => /authorization["']?\s*[:=]\s*["']?bearer\s+[A-Za-z0-9._-]{16,}/i.test(t)],
  ['a Windows machine name', (t) => /\b(?:DESKTOP|LAPTOP)-[A-Z0-9]{6,}\b/.test(t)],
].filter(([, f]) => f);

const files = walk(OUT);
const found = Object.fromEntries(mustBeEmpty.map(([l]) => [l, []]));
for (const f of files) {
  const t = fs.readFileSync(f, 'utf8');
  const low = t.toLowerCase();
  for (const [label, test] of mustBeEmpty) if (test(t, low)) found[label].push(path.relative(OUT, f).split(path.sep).join('/'));
}

let bad = 0;
console.log('files searched:', files.length, '| values read from .env.local:', secrets.length);
for (const [label, hits] of Object.entries(found)) {
  if (hits.length) bad++;
  console.log(`${label}: ${hits.length}${hits.length ? ' -> ' + hits.slice(0, 6).join(', ') + (hits.length > 6 ? ` and ${hits.length - 6} more` : '') : ''}`);
}

const names = files.map((f) => path.relative(OUT, f).split(path.sep).join('/'));
const envFiles = names.filter((n) => /(^|\/)\.env/.test(n)).length;
const redactions = names.includes('ops/export-redactions.json');
console.log('files named .env*:', envFiles);
console.log('export-redactions.json present:', redactions);
if (envFiles || redactions) bad++;

// The copy's own git identity must be GitHub's no-reply address.
let copyEmail = '';
try { copyEmail = execSync('git config user.email', { cwd: OUT, encoding: 'utf8' }).trim(); } catch { /* not a repository yet */ }
const noReply = /@users\.noreply\.github\.com$/i.test(copyEmail);
console.log('the copy commits with a GitHub no-reply address:', noReply);
if (!noReply) bad++;

console.log(bad ? `NOT CLEAN: ${bad} check(s) failed. Do not push.` : 'clean');
process.exitCode = bad ? 1 : 0;
