// Applies SQL files to the Saathi Supabase project through the Management API.
//
//   node scripts/apply-migration.mjs supabase-migration-21-vendor-mgmt.sql
//   node scripts/apply-migration.mjs supabase-migration-1{7,8,9}-*.sql   # in order
//
// Why this exists rather than `supabase db push`: the repo's migration files
// are flat at the root, not a supabase/migrations ledger, and the ledger that
// does exist has drifted from what is actually applied — a push would fail on
// files whose objects are already live. This talks to the same endpoint the
// dashboard SQL editor does, one file per request, in the order given.
//
// TOKEN. Never passed as an argument (arguments land in shell history and in
// the process list) and never printed. Looked for in this order:
//
//   1. $SUPABASE_PAT
//   2. ~/.secrets/supabase-saathi.pat   <- the durable one; see docs/operations.md
//
// A personal access token for the account that owns the project, from
// Supabase dashboard -> Account -> Access Tokens. It grants full control of
// every project on that account, so it belongs in .secrets and nowhere near
// this repository.
//
// Success is HTTP 200/201 with an empty array: the query ran and returned no
// rows, which is what DDL does. Anything else is printed in full and the exit
// code is non-zero, so a half-applied wave is visible rather than assumed.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PROJECT_REF = process.env.SAATHI_SUPABASE_REF || 'zrbwrtqofplfzkvawqra';
const SECRET_FILE = join(homedir(), '.secrets', 'supabase-saathi.pat');

function readToken() {
  const fromEnv = (process.env.SUPABASE_PAT || '').trim();
  if (fromEnv) return { token: fromEnv, source: 'SUPABASE_PAT' };
  try {
    const fromFile = readFileSync(SECRET_FILE, 'utf8').trim();
    if (fromFile) return { token: fromFile, source: SECRET_FILE };
  } catch {
    // Falls through to the instructions below.
  }
  return null;
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node scripts/apply-migration.mjs <file.sql> [more.sql ...]');
  process.exit(2);
}

const found = readToken();
if (!found) {
  console.error(
    'No Supabase token.\n'
    + `  Put a personal access token in ${SECRET_FILE}\n`
    + '  (Supabase dashboard -> Account -> Access Tokens), or export SUPABASE_PAT.\n'
    + '  The file holds the token and nothing else — no key= prefix, no quotes.',
  );
  process.exit(2);
}
console.log(`token source: ${found.source}`);
console.log(`project: ${PROJECT_REF}`);

let failed = 0;
for (const file of files) {
  let query;
  try {
    query = readFileSync(file, 'utf8');
  } catch (error) {
    console.error(`SKIP  ${file}  (${error.message})`);
    failed += 1;
    continue;
  }

  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${found.token}`, 'Content-Type': 'application/json' },
    // JSON.stringify, not a hand-built body: PowerShell's ConvertTo-Json
    // mangles SQL this size, which is the reason this is a Node script and not
    // an Invoke-RestMethod one-liner.
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  const ok = res.ok;
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${res.status}  ${file}${ok ? '' : `\n${text.slice(0, 2000)}`}`);
  if (!ok) {
    failed += 1;
    // Stop on the first failure. These files build on each other — migration 20
    // replaces a function migration 17 creates — so carrying on after a failure
    // would apply later files against a database that never got the earlier one.
    break;
  }
}

process.exit(failed ? 1 : 0);
