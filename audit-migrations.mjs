// Which migration statements have NOT reached the live database?
//
// This repo is not linked to the Supabase CLI and the live database has no
// `supabase_migrations.schema_migrations` table, so there is no record of what
// ran. Object existence is not enough either: a migration can be half
// applied — functions created but a GRANT missed, an index absent, a seed row
// never inserted. The 41 migrations here carry ~1060 statements, and only
// about a quarter of them create a named object.
//
// So this script reconstructs the EXPECTED END STATE from the migration files,
// in chronological order, and compares it against live introspection. The
// question it answers is "did the last word on this object actually land",
// which is the question that matters when statements overwrite each other —
// a later `revoke` after an earlier `grant` is the whole point.
//
// What it checks:
//   1 objects     tables, views, functions, types, added columns
//   2 structural  policies, indexes, triggers, constraints, RLS enablement
//   3 privileges  every grant/revoke, resolved to a final intent per
//                 (function, role) pair and compared to pg_proc.proacl
//   4 bodies      every function's source against pg_proc.prosrc
//   5 seeds       plan_feature_gates rows, which decide every cap in the product
//   6 invariants  states no future table may reintroduce, whoever creates it
//   7 triggers    timing, events, row-vs-statement level, function, WHEN
//   8 policies    every USING and WITH CHECK clause, deparsed and compared
//
// IMPORTANT BLIND SPOT: "CLEAN" does not mean "every migration is applied".
// It means every statement of a shape this script parses has its end state
// live. Statements inside a `do $$ ... $$` block are not parsed at all, and
// neither are table-level grants — which is how
// 20261109120000_revoke_truncate_from_client_roles.sql sat unapplied while
// this script reported 910/910 clean. That migration is applied now, and
// section 6 asserts its INTENT directly rather than parsing its statements,
// which is the general answer to the do-block gap: assert the end state you
// want, not the SQL that produced it.
//
// Sections 6–8 close the "present but wrong" gap for triggers and policies.
// Still only checked for EXISTENCE, never for correctness of definition:
// CHECK constraint expressions (7), index definitions (45), table-level
// grants (6), `alter column` (6) and `comment on` (23). See
// docs/supabase-schema-audit-handoff.md, Job 3.
//
// What it CANNOT check, and nothing else here can either:
//   • backfills (`update public.x set ...`) — the end state is data-dependent
//     and usually indistinguishable from a row that was simply never there
//   • a statement whose effect a later migration deliberately undid, unless
//     the undo is also in the files (it reports these as "superseded")
//   • a trigger's or policy's own existence being correct in the first place:
//     sections 7 and 8 compare definitions, and defer absence to section 2
//     rather than reporting the same gap twice.
//
//   node audit-migrations.mjs
//
// Every finding is printed in full; the per-class lines carry the counts. If
// you extend this, extend the self-test described in
// docs/supabase-schema-audit-handoff.md too — a validator that only ever
// reports clean is indistinguishable from no validator.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const MIG_DIR = 'supabase/migrations';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trimStart().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }),
);
const PAT = env.SUPABASE_PERSONAL_ACCESS_TOKEN;
const REF = (env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/^https:\/\//, '').split('.')[0];

async function sql(query, attempt = 0) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json', 'User-Agent': 'curl/8.4.0' },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  // The Management API throttles. Section 8 makes far more calls than the
  // first five sections combined, and an un-retried 429 does not fail the
  // run — it arrives as a per-clause error and reads exactly like a real
  // finding. Retrying here keeps the distinction honest.
  if (res.status === 429 && attempt < 6) {
    await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
    return sql(query, attempt + 1);
  }
  if (!res.ok) throw new Error(`query failed (${res.status}): ${body}`);
  const parsed = JSON.parse(body);
  if (!Array.isArray(parsed)) throw new Error(`query error: ${parsed.message ?? body}`);
  return parsed;
}

// Comments are stripped before parsing: commented-out DDL is not a statement,
// and several migrations document the SQL they replaced.
const files = readdirSync(MIG_DIR).filter((f) => f.endsWith('.sql')).sort();
const sources = files.map((f) => {
  const raw = readFileSync(join(MIG_DIR, f), 'utf8');
  return {
    name: f,
    // Comments stripped for STATEMENT DETECTION only: several migrations
    // document the SQL they replaced, and commented-out DDL is not a
    // statement.
    body: raw.replace(/--[^\n]*/g, ''),
    // Kept intact for BODY COMPARISON. pg_proc.prosrc preserves the comments
    // inside a function, so comparing against the stripped text reported
    // every commented function as stale — 27 false positives on the first
    // run of this section.
    raw,
  };
});

// ── Type-name normalisation ─────────────────────────────────────────────────
//
// A migration writes `public.create_group(text, uuid, ..., smallint, uuid)`;
// Postgres reports `oidvectortypes` as canonical names. These have to agree or
// every privilege check is a false positive.
const TYPE_ALIASES = {
  int: 'integer', int4: 'integer', int8: 'bigint', int2: 'smallint',
  bool: 'boolean', timestamptz: 'timestamp with time zone',
  timetz: 'time with time zone', varchar: 'character varying',
  float8: 'double precision', float4: 'real', decimal: 'numeric',
};

function normType(t) {
  let s = String(t ?? '').trim().toLowerCase().replace(/^public\./, '');
  const arr = s.endsWith('[]');
  if (arr) s = s.slice(0, -2).trim();
  s = s.replace(/\s+/g, ' ');
  s = TYPE_ALIASES[s] ?? s;
  return arr ? `${s}[]` : s;
}

function normSig(name, argString) {
  const args = String(argString ?? '').trim();
  const parts = args === '' ? [] : args.split(',').map(normType);
  return `${String(name).toLowerCase().replace(/^public\./, '')}(${parts.join(', ')})`;
}

let pass = 0;
const findings = [];
const note = (cls, detail, mig) => { findings.push({ cls, detail, mig }); };
const okItem = () => { pass++; };

// ═══ 1 · Objects ════════════════════════════════════════════════════════════

const expected = { tables: [], views: [], functions: [], types: [], columns: [] };
const dropped = { functions: new Set(), tables: new Set(), renamedTables: new Map() };

for (const { name, body } of sources) {
  for (const m of body.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)/gi))
    expected.tables.push({ mig: name, obj: m[1].toLowerCase() });
  for (const m of body.matchAll(/create\s+(?:or\s+replace\s+)?view\s+public\.([a-z0-9_]+)/gi))
    expected.views.push({ mig: name, obj: m[1].toLowerCase() });
  for (const m of body.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\(/gi))
    expected.functions.push({ mig: name, obj: m[1].toLowerCase() });
  for (const m of body.matchAll(/create\s+type\s+public\.([a-z0-9_]+)/gi))
    expected.types.push({ mig: name, obj: m[1].toLowerCase() });
  // One ALTER TABLE can add several columns in a comma-separated list, and
  // eight of them here do (one adds ten). Matching only the first column per
  // statement silently skipped 22 of the 43 `add column` statements in this
  // repo — an audit that quietly checks half the statements is worse than no
  // audit, so this walks each ALTER's whole body.
  for (const alter of body.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?public\.([a-z0-9_]+)([\s\S]*?);/gi)) {
    const table = alter[1].toLowerCase();
    for (const col of alter[2].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)/gi)) {
      expected.columns.push({ mig: name, obj: `${table}.${col[1].toLowerCase()}` });
    }
  }

  // The undo side, so a deliberate removal is not reported as a gap.
  for (const m of body.matchAll(/drop\s+function\s+(?:if\s+exists\s+)?public\.([a-z0-9_]+)/gi))
    dropped.functions.add(m[1].toLowerCase());
  for (const m of body.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?public\.([a-z0-9_]+)/gi))
    dropped.tables.add(m[1].toLowerCase());
  for (const m of body.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?public\.([a-z0-9_]+)\s+rename\s+to\s+([a-z0-9_]+)/gi))
    dropped.renamedTables.set(m[1].toLowerCase(), m[2].toLowerCase());
}

const live = {
  tables: new Set((await sql(`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE'`)).map((r) => r.table_name.toLowerCase())),
  views: new Set((await sql(`select table_name from information_schema.views where table_schema='public'`)).map((r) => r.table_name.toLowerCase())),
  functions: new Set((await sql(`select p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'`)).map((r) => r.proname.toLowerCase())),
  types: new Set((await sql(`select t.typname from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='public'`)).map((r) => r.typname.toLowerCase())),
  columns: new Set((await sql(`select table_name||'.'||column_name as c from information_schema.columns where table_schema='public'`)).map((r) => r.c.toLowerCase())),
};

console.log('\n── 1 · objects ─────────────────────────────────────────────');
for (const cls of ['tables', 'views', 'functions', 'types', 'columns']) {
  let missing = 0, superseded = 0;
  for (const item of expected[cls]) {
    if (live[cls].has(item.obj)) { okItem(); continue; }
    const base = item.obj.split('.')[0];
    const wasDropped =
      (cls === 'functions' && dropped.functions.has(item.obj)) ||
      (cls === 'tables' && (dropped.tables.has(item.obj) || dropped.renamedTables.has(item.obj))) ||
      (cls === 'columns' && (dropped.tables.has(base) || dropped.renamedTables.has(base)));
    if (wasDropped) { superseded++; okItem(); continue; }
    missing++;
    note('object', `${cls.slice(0, -1)} ${item.obj} absent`, item.mig);
  }
  console.log(`  ${cls.padEnd(10)} ${String(expected[cls].length).padStart(3)} expected · ${missing} missing${superseded ? ` · ${superseded} dropped/renamed later` : ''}`);
}

// ═══ 2 · Structural ═════════════════════════════════════════════════════════

const exp2 = { policies: [], indexes: [], triggers: [], constraints: [], rls: [] };
const dropped2 = { policies: new Set(), triggers: new Set(), constraints: new Set() };

for (const { name, body } of sources) {
  // Any schema, not just public: the storage bucket migration puts two
  // policies on storage.objects, and they were invisible to a public-only
  // regex — which is exactly the kind of silent omission this script exists
  // to avoid.
  for (const m of body.matchAll(/create\s+policy\s+"([^"]+)"\s+on\s+(?:([a-z0-9_]+)\.)?([a-z0-9_]+)/gi))
    exp2.policies.push({
      mig: name,
      schema: (m[2] ?? 'public').toLowerCase(),
      table: m[3].toLowerCase(),
      obj: m[1].toLowerCase(),
    });
  for (const m of body.matchAll(/drop\s+policy\s+(?:if\s+exists\s+)?"([^"]+)"\s+on\s+public\.([a-z0-9_]+)/gi))
    dropped2.policies.add(m[1].toLowerCase());        // by name: a rename moves the table, not the policy name
  for (const m of body.matchAll(/create\s+(?:unique\s+)?index\s+(?:concurrently\s+)?(?:if\s+not\s+exists\s+)?([a-z0-9_]+)\s+on\s+public\.([a-z0-9_]+)/gi))
    exp2.indexes.push({ mig: name, table: m[2].toLowerCase(), obj: m[1].toLowerCase() });
  for (const m of body.matchAll(/create\s+trigger\s+([a-z0-9_]+)[\s\S]{0,240}?\s+on\s+public\.([a-z0-9_]+)/gi))
    exp2.triggers.push({ mig: name, table: m[2].toLowerCase(), obj: m[1].toLowerCase() });
  for (const m of body.matchAll(/drop\s+trigger\s+(?:if\s+exists\s+)?([a-z0-9_]+)\s+on\s+public\.([a-z0-9_]+)/gi))
    dropped2.triggers.add(m[1].toLowerCase());
  for (const m of body.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?public\.([a-z0-9_]+)[\s\S]{0,120}?add\s+constraint\s+([a-z0-9_]+)/gi))
    exp2.constraints.push({ mig: name, table: m[1].toLowerCase(), obj: m[2].toLowerCase() });
  for (const m of body.matchAll(/drop\s+constraint\s+(?:if\s+exists\s+)?([a-z0-9_]+)/gi))
    dropped2.constraints.add(m[1].toLowerCase());
  for (const m of body.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?public\.([a-z0-9_]+)\s+enable\s+row\s+level\s+security/gi))
    exp2.rls.push({ mig: name, table: m[1].toLowerCase(), obj: m[1].toLowerCase() });
}

const livePolicies = new Set((await sql(`select policyname from pg_policies`)).map((r) => r.policyname.toLowerCase()));
const liveIndexes = new Set((await sql(`select indexname from pg_indexes where schemaname='public'`)).map((r) => r.indexname.toLowerCase()));
const liveTriggers = new Set((await sql(`select t.tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal`)).map((r) => r.tgname.toLowerCase()));
const liveConstraints = new Set((await sql(`select con.conname from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'`)).map((r) => r.conname.toLowerCase()));
const liveRls = new Set((await sql(`select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relrowsecurity`)).map((r) => r.relname.toLowerCase()));

console.log('\n── 2 · structural ──────────────────────────────────────────');
const structural = [
  ['policies', exp2.policies, livePolicies, dropped2.policies],
  ['indexes', exp2.indexes, liveIndexes, new Set()],
  ['triggers', exp2.triggers, liveTriggers, dropped2.triggers],
  ['constraints', exp2.constraints, liveConstraints, dropped2.constraints],
  ['RLS', exp2.rls, liveRls, new Set()],
];
for (const [label, items, liveSet, droppedSet] of structural) {
  let missing = 0, superseded = 0;
  for (const item of items) {
    if (liveSet.has(item.obj)) { okItem(); continue; }
    if (droppedSet.has(item.obj) || dropped.tables.has(item.table) || dropped.renamedTables.has(item.table)) {
      superseded++; okItem(); continue;
    }
    missing++;
    note('structural', `${label} ${item.table}.${item.obj} absent`, item.mig);
  }
  console.log(`  ${label.padEnd(12)} ${String(items.length).padStart(3)} expected · ${missing} missing${superseded ? ` · ${superseded} dropped/renamed later` : ''}`);
}

// ═══ 3 · Privileges — the final word per (function, role) ═══════════════════
//
// The class that matters most here. CLAUDE.md records that
// `revoke all ... from public` leaves Supabase's by-name grants to anon and
// authenticated untouched, which left match_candidates_for readable by any
// member. A missed revoke is invisible until someone looks.

const ROLE_RE = /^[a-z_][a-z0-9_]*$/;
const privStmts = [];
const grantRe = /\b(grant|revoke)\s+([a-z, ]+?)\s+on\s+function\s+public\.([a-z0-9_]+)\s*\(([^)]*)\)\s*(?:from|to)\s+([^;]+);/gi;

for (const { name, body } of sources) {
  for (const m of body.matchAll(grantRe)) {
    const roles = m[5].split(',').map((r) => r.trim().toLowerCase()).filter((r) => ROLE_RE.test(r));
    if (roles.length === 0) continue;
    privStmts.push({
      mig: name, pos: m.index, action: m[1].toLowerCase(),
      privs: m[2].toLowerCase().replace(/\s+/g, ' ').trim(),
      sig: normSig(m[3], m[4]), roles,
    });
  }
}
privStmts.sort((a, b) => (a.mig === b.mig ? a.pos - b.pos : a.mig < b.mig ? -1 : 1));

// Last statement wins, per (signature, role).
const intent = new Map();
for (const s of privStmts) {
  for (const role of s.roles) {
    intent.set(`${s.sig}|${role}`, { ...s, role });
  }
}

const liveFns = await sql(`
  select p.proname, oidvectortypes(p.proargtypes) as args,
         coalesce(array_to_string(p.proacl, '|'), '') as acl
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'`);

const aclBySig = new Map();
for (const r of liveFns) {
  aclBySig.set(normSig(r.proname, r.args), r.acl);
}

// A role has EXECUTE when the ACL carries "<role>=...X". PUBLIC appears as a
// bare "=X/owner" entry with no grantee.
function hasExecute(acl, role) {
  for (const entry of String(acl).split('|').filter(Boolean)) {
    const eq = entry.indexOf('=');
    if (eq < 0) continue;
    const grantee = entry.slice(0, eq);
    const privs = entry.slice(eq + 1).split('/')[0];
    const isMatch = role === 'public' ? grantee === '' : grantee === role;
    if (isMatch && privs.includes('X')) return true;
  }
  return false;
}

console.log('\n── 3 · privileges ──────────────────────────────────────────');
let privMissing = 0, privUnmatched = 0, privGone = 0;
for (const [, s] of intent) {
  const acl = aclBySig.get(s.sig);

  if (acl === undefined) {
    // The function itself is gone — a dropped function's grants are moot.
    const bare = s.sig.split('(')[0];
    if (dropped.functions.has(bare) || !live.functions.has(bare)) { privGone++; okItem(); continue; }
    privUnmatched++;
    note('privilege', `cannot match signature ${s.sig} (overload spelled differently?)`, s.mig);
    continue;
  }

  // An empty ACL means default privileges: the owner has everything and
  // PUBLIC has whatever the default is — for functions, EXECUTE.
  const granted = acl === '' ? true : hasExecute(acl, s.role);
  const wanted = s.action === 'grant';

  if (granted === wanted) { okItem(); continue; }
  privMissing++;
  note('privilege',
    `${s.sig} — last word was ${s.action.toUpperCase()} ${s.privs} ${wanted ? 'TO' : 'FROM'} ${s.role}, but live ACL ${granted ? 'HAS' : 'lacks'} execute for ${s.role}  [acl: ${acl || '(default)'}]`,
    s.mig);
}
console.log(`  ${String(intent.size).padStart(3)} final (function, role) intents from ${privStmts.length} statements`);
console.log(`  ${privMissing} not matching live ACL · ${privGone} on dropped functions · ${privUnmatched} unmatched signatures`);

// ═══ 4 · Function bodies — existence is not freshness ══════════════════════
//
// `create or replace function` is idempotent, so a function can exist with
// the source from an EARLIER migration and nothing anywhere complains. That
// is the one failure mode object-existence checks cannot see, and the reason
// `supabase db diff` exists. It does not need Docker, though: the live source
// is in pg_proc.prosrc, and the intended source is the last definition in the
// migration files. Compare them directly.
//
// Normalised on whitespace only. Anything else — comment stripping, case —
// would risk calling a genuinely different body equal.

const bodyIntent = new Map();   // normalised signature -> { mig, body }

for (const { name, raw } of sources) {
  // create [or replace] function public.NAME(ARGS) ... as $tag$ BODY $tag$
  const re = /create\s+(?:or\s+replace\s+)?function\s+public\.([a-z0-9_]+)\s*\(([\s\S]*?)\)\s*returns[\s\S]*?\sas\s+(\$[a-z0-9_]*\$)([\s\S]*?)\3/gi;
  for (const m of raw.matchAll(re)) {
    // Argument list carries names and defaults; reduce it to types for the
    // signature, the same way oidvectortypes reports them.
    const argTypes = m[2].trim() === '' ? '' : m[2]
      .split(/,(?![^(]*\))/)
      .map((a) => {
        const noDefault = a.split(/\s+default\s+/i)[0].trim();
        const parts = noDefault.split(/\s+/);
        return parts.length > 1 ? parts.slice(1).join(' ') : parts[0];
      })
      .join(', ');
    bodyIntent.set(normSig(m[1], argTypes), { mig: name, body: m[4] });
  }
}

const liveSrc = new Map();
for (const r of await sql(`
  select p.proname, oidvectortypes(p.proargtypes) as args, p.prosrc
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.prosrc is not null`)) {
  liveSrc.set(normSig(r.proname, r.args), r.prosrc);
}

const squash = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();

console.log('\n── 4 · function bodies ─────────────────────────────────────');
let stale = 0, bodyGone = 0, bodyUnmatched = 0;
for (const [sig, want] of bodyIntent) {
  const liveBody = liveSrc.get(sig);

  if (liveBody === undefined) {
    const bare = sig.split('(')[0];
    if (dropped.functions.has(bare) || !live.functions.has(bare)) { bodyGone++; okItem(); continue; }
    bodyUnmatched++;
    note('body', `cannot match signature ${sig} to a live function`, want.mig);
    continue;
  }

  if (squash(liveBody) === squash(want.body)) { okItem(); continue; }
  stale++;
  note('body',
    `${sig} — live source differs from its last definition (live ${squash(liveBody).length} chars, file ${squash(want.body).length})`,
    want.mig);
}
console.log(`  ${String(bodyIntent.size).padStart(3)} function definitions · ${stale} stale · ${bodyGone} dropped later · ${bodyUnmatched} unmatched`);

// ═══ 5 · Seeds — the caps that drive the product ════════════════════════════

const wantedGates = new Set();
for (const { body } of sources) {
  // ('plan', 'feature_key', ...) tuples inside a plan_feature_gates insert.
  for (const ins of body.matchAll(/insert\s+into\s+public\.plan_feature_gates[\s\S]*?;/gi)) {
    for (const tup of ins[0].matchAll(/\(\s*'(sprout|bloom|flourish)'\s*,\s*'([a-z0-9_]+)'/gi)) {
      wantedGates.add(`${tup[1].toLowerCase()}|${tup[2].toLowerCase()}`);
    }
  }
}
const liveGates = new Set((await sql(`select plan_code::text as p, feature_key as k from public.plan_feature_gates`)).map((r) => `${r.p}|${r.k}`));

console.log('\n── 5 · seeds ───────────────────────────────────────────────');
let gateMissing = 0;
for (const g of wantedGates) {
  if (liveGates.has(g)) { okItem(); continue; }
  gateMissing++;
  const [plan, key] = g.split('|');
  note('seed', `plan_feature_gates has no row for (${plan}, ${key})`, '—');
}
console.log(`  plan_feature_gates  ${wantedGates.size} seeded pairs expected · ${gateMissing} missing · ${liveGates.size} live`);

// ═══ 6 · Standing invariants — what no future table may reintroduce ═════════
//
// Sections 1–5 all ask the same question: "did this statement land?" This one
// asks a different one — "is the database in a state we have decided it must
// ALWAYS be in, whoever put it there?" The difference matters because a table
// added in D5 arrives with Supabase's default `grant all on all tables in
// schema public to anon, authenticated`, so a hole closed by a migration
// reopens on the next `create table` unless something keeps checking.
//
// TRUNCATE is the one write PostgreSQL does not filter through RLS. For every
// other verb the grant is permissive and the policy decides — that is
// Supabase's intended model, and `anon` holding INSERT on a dozen
// RLS-protected tables is not a bug. For TRUNCATE the grant is the ONLY gate.
// 29 of 31 tables were in that state; `20261109120000` revoked it and
// narrowed the default privilege.
//
// Narrowing the default is not sufficient, which is the reason this assertion
// exists rather than trusting that migration. `alter default privileges` binds
// to the GRANTING role. `supabase_admin` holds its own default ACL on schema
// public that still includes TRUNCATE for anon and authenticated, `postgres`
// is not a member of supabase_admin and is not a superuser, so that ACL cannot
// be changed from here. A table created by Supabase's own tooling rather than
// by a migration would still arrive with the hole open.

console.log('\n── 6 · standing invariants ─────────────────────────────────');

// The one testability seam in this script. `audit-selftest.mjs` points this
// at a role that DOES hold TRUNCATE (`service_role`), which is how section 6
// is proved to fire without granting a privilege on a production table and
// relying on a cleanup step to take it away again. Unset, it is anon and
// authenticated — the two roles PostgREST actually serves requests as.
const CLIENT_ROLES = (process.env.AUDIT_TRUNCATE_ROLES ?? 'anon,authenticated')
  .split(',').map((r) => r.trim()).filter(Boolean);
const roleList = CLIENT_ROLES.map((r) => `'${r}'`).join(', ');

const pubTables = (await sql(
  `select count(*)::int as n from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'`))[0].n;

const truncHolders = await sql(`
  select c.relname, pg_get_userbyid(c.relowner) as owner,
         (select string_agg(r, ' and ' order by r)
            from unnest(array[${roleList}]) r
           where has_table_privilege(r, 'public.'||quote_ident(c.relname), 'TRUNCATE')) as who
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'
    and exists (select 1 from unnest(array[${roleList}]) r
                 where has_table_privilege(r, 'public.'||quote_ident(c.relname), 'TRUNCATE'))
  order by c.relname`);

if (truncHolders.length === 0) okItem();
for (const r of truncHolders) {
  note('invariant', `${r.who} hold TRUNCATE on public.${r.relname} (owner ${r.owner}) — RLS does not apply to TRUNCATE, so the grant is the only gate`,
    '20261109120000_revoke_truncate_from_client_roles.sql');
}
console.log(`  TRUNCATE on tables     ${String(pubTables).padStart(3)} tables · ${truncHolders.length} still granted to ${CLIENT_ROLES.join('/')}`);

// And the default that would hand it to the NEXT table. supabase_admin's own
// default ACL is reported separately because it is not ours to change — it is
// a known residue, not drift, and failing the audit on it would make the
// audit permanently red for something no migration can fix.
const defAcls = await sql(`
  select pg_get_userbyid(d.defaclrole) as granting_role, d.defaclacl::text as acl
  from pg_default_acl d join pg_namespace n on n.oid = d.defaclnamespace
  where n.nspname = 'public' and d.defaclobjtype = 'r'`);

let defBad = 0, defResidue = 0;
for (const r of defAcls) {
  for (const entry of r.acl.replace(/^\{|\}$/g, '').split(',')) {
    const [role, rest] = entry.split('=');
    if (!CLIENT_ROLES.includes(role)) continue;
    if (!String(rest ?? '').split('/')[0].includes('D')) continue;
    if (r.granting_role === 'supabase_admin') { defResidue++; continue; }
    defBad++;
    note('invariant', `default privileges granted by ${r.granting_role} still give ${role} TRUNCATE on new tables in schema public`,
      '20261109120000_revoke_truncate_from_client_roles.sql');
  }
}
if (defBad === 0) okItem();
console.log(`  default privileges     ${String(defAcls.length).padStart(3)} default ACLs on tables · ${defBad} granting TRUNCATE to a client role` +
  (defResidue ? ` · ${defResidue} unchangeable supabase_admin residue (see comment)` : ''));

// The asset-screenshots bucket, asserted rather than parsed. 20260308130000
// is now a `do` block — guarded on `storage.buckets` existing, so that the
// migration set can replay into the CLI's shadow database, which has no
// Storage service — and the parser reads no statement inside a procedural
// block. Its two policies are still visible to sections 2 and 8, because
// PL/pgSQL binds lazily and the DDL in there is plain rather than dynamic, so
// a `create policy` regex still finds it in the file. The bucket row is not,
// and a private bucket turning public is exactly the kind of change nobody
// would notice.
const bucket = await sql(`
  select id, public from storage.buckets where id = 'asset-screenshots'`);
if (bucket.length === 0) {
  note('invariant', 'storage bucket asset-screenshots does not exist', '20260308130000_asset_screenshots_storage_bucket.sql');
} else if (bucket[0].public !== false) {
  note('invariant', 'storage bucket asset-screenshots is PUBLIC — it holds member screenshots and must be private', '20260308130000_asset_screenshots_storage_bucket.sql');
} else okItem();
console.log(`  asset-screenshots      ${bucket.length === 0 ? 'ABSENT' : `present · public = ${bucket[0].public}`}`);

// ── Statement scanning, for the two sections below ──────────────────────────
//
// Sections 1–3 can get away with regexes because they only need an object
// name. Comparing a DEFINITION needs the whole statement, and `using (...)`
// and `with check (...)` nest parens and quote literals, so the statement has
// to be scanned rather than matched.

function stmtAt(body, at) {
  let i = at, depth = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === "'") {                      // '' is an escaped quote, not a close
      i++;
      while (i < body.length && !(body[i] === "'" && body[i + 1] !== "'")) {
        if (body[i] === "'") i++;
        i++;
      }
      i++;
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ';' && depth === 0) return body.slice(at, i);
    i++;
  }
  return body.slice(at);
}

// The balanced parenthesised group following a keyword, without its outer
// parens — `using (a and (b or c))` → `a and (b or c)`.
function groupAfter(stmt, re) {
  const m = re.exec(stmt);
  if (!m) return null;
  let i = m.index + m[0].length;
  while (i < stmt.length && /\s/.test(stmt[i])) i++;
  if (stmt[i] !== '(') return null;
  const start = i;
  let depth = 0;
  for (; i < stmt.length; i++) {
    if (stmt[i] === "'") { i++; while (i < stmt.length && stmt[i] !== "'") i++; continue; }
    if (stmt[i] === '(') depth++;
    else if (stmt[i] === ')') { depth--; if (depth === 0) return stmt.slice(start + 1, i); }
  }
  return null;
}

const sqz = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

// ═══ 7 · Trigger definitions ════════════════════════════════════════════════
//
// Section 2 checks that a trigger with this name exists. That cannot see the
// failure mode CLAUDE.md records: a trigger declared FOR EACH STATEMENT where
// the migration says FOR EACH ROW fires even when the UPDATE matched no rows,
// which is how phase 21 broke every account deletion in the system. Nor can it
// see a trigger pointed at the wrong function, or firing on INSERT only when
// the migration says INSERT OR UPDATE.
//
// Compared field by field rather than as text, because `pg_get_triggerdef`
// reprints canonically — it always says EXECUTE FUNCTION even for a migration
// that wrote EXECUTE PROCEDURE, and always schema-qualifies. Parsing both
// sides with the same function is what makes the two comparable.
//
// NOTE the default: a `create trigger` with no `for each` clause is
// FOR EACH STATEMENT in PostgreSQL. That is deliberately reproduced here, so
// an omitted clause reads as the statement-level trigger it actually is
// rather than as the row-level one the author probably meant.

function parseTrigger(text) {
  const s = sqz(text).replace(/;$/, '');
  const name = (/\btrigger\s+(?:if\s+not\s+exists\s+)?"?([a-z0-9_]+)"?/i.exec(s)?.[1] ?? '').toLowerCase();
  const cut = s.search(/\bfor\s+each\b|\breferencing\b|\bexecute\s+(?:function|procedure)\b/i);
  const head = cut === -1 ? s : s.slice(0, cut);
  const tail = cut === -1 ? '' : s.slice(cut);
  const timing = (/\b(before|after|instead\s+of)\b/i.exec(head)?.[1] ?? '').toLowerCase().replace(/\s+/g, ' ');
  const onIdx = head.toLowerCase().lastIndexOf(' on ');
  const evText = onIdx === -1 ? head : head.slice(0, onIdx);
  const events = [...evText.matchAll(/\b(insert|delete|truncate|update)\b(?:\s+of\s+([a-z0-9_,\s"]+?))?(?=\s*(?:or\b|$))/gi)]
    .map((m) => (m[2]
      ? `update of ${m[2].split(',').map((c) => c.trim().replace(/"/g, '').toLowerCase()).sort().join(',')}`
      : m[1].toLowerCase()))
    .sort();
  const tbl = onIdx === -1 ? null : /^\s*(?:"?([a-z0-9_]+)"?\.)?"?([a-z0-9_]+)"?/i.exec(head.slice(onIdx + 4));
  const fn = /\bexecute\s+(?:function|procedure)\s+(?:"?([a-z0-9_]+)"?\.)?"?([a-z0-9_]+)"?/i.exec(tail);
  return {
    name,
    table: tbl ? tbl[2].toLowerCase() : null,
    timing,
    events,
    level: (/\bfor\s+each\s+(row|statement)\b/i.exec(tail)?.[1] ?? 'statement').toLowerCase(),
    fn: fn ? fn[2].toLowerCase() : null,
    when: groupAfter(tail, /\bwhen\b/i),
  };
}

// Last definition wins: a later migration that drops and recreates a trigger
// under the same name is the one that describes the live object.
const wantTriggers = new Map();
for (const { name, body } of sources) {
  for (const m of body.matchAll(/create\s+(?:or\s+replace\s+)?(?:constraint\s+)?trigger\s+/gi)) {
    const t = parseTrigger(stmtAt(body, m.index));
    if (!t.name || !t.table) continue;
    wantTriggers.set(`${t.table}.${t.name}`, { ...t, mig: name });
  }
}

const liveTrigDefs = new Map(
  (await sql(`select c.relname as tbl, t.tgname, pg_get_triggerdef(t.oid) as def
              from pg_trigger t
              join pg_class c on c.oid = t.tgrelid
              join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and not t.tgisinternal`))
    .map((r) => [`${r.tbl.toLowerCase()}.${r.tgname.toLowerCase()}`, r.def]),
);

console.log('\n── 7 · trigger definitions ─────────────────────────────────');
let trigWrong = 0, trigGone = 0, trigStatement = 0;
for (const [key, want] of wantTriggers) {
  const def = liveTrigDefs.get(key);
  if (def === undefined) {
    // Absence is section 2's finding, not this one's — reporting it twice
    // would inflate the count and say nothing new.
    trigGone++;
    continue;
  }
  const live = parseTrigger(def);
  const diffs = [];
  if (want.timing !== live.timing) diffs.push(`timing ${want.timing || '(none)'} → ${live.timing || '(none)'}`);
  if (want.events.join('+') !== live.events.join('+')) diffs.push(`events ${want.events.join('+') || '(none)'} → ${live.events.join('+') || '(none)'}`);
  if (want.level !== live.level) diffs.push(`FOR EACH ${want.level.toUpperCase()} → FOR EACH ${live.level.toUpperCase()}`);
  if (want.fn !== live.fn) diffs.push(`function ${want.fn} → ${live.fn}`);
  if (sqz(want.when).toLowerCase() !== sqz(live.when).toLowerCase()) diffs.push(`WHEN ${sqz(want.when) || '(none)'} → ${sqz(live.when) || '(none)'}`);
  if (live.level === 'statement') trigStatement++;
  if (diffs.length === 0) { okItem(); continue; }
  trigWrong++;
  note('trigger', `${key} differs from its migration (file → live): ${diffs.join('; ')}`, want.mig);
}
console.log(`  ${String(wantTriggers.size).padStart(3)} definitions · ${trigWrong} mismatched · ${trigGone} dropped later · ${liveTrigDefs.size} live`);
console.log(`  ${trigStatement} live trigger(s) are FOR EACH STATEMENT${trigStatement === 0 ? ' — the phase 21 failure mode is absent' : ' — check each one is deliberate'}`);

// ═══ 8 · Policy expressions — the actual access-control rules ═══════════════
//
// The highest-value class, and the one a name check is most useless on: a
// policy named `groups_select_visible` can exist and permit anything. 52 live
// policies carry ~77 USING and WITH CHECK clauses, and nothing until now
// compared a single one of them against the migration that wrote it.
//
// The hard part is that `pg_get_expr` does not return the text anyone wrote.
// It deparses the stored parse tree, so a file's
//   `a.owner_user_id = auth.uid() or a.status = 'active'`
// comes back as
//   `((a.owner_user_id = auth.uid()) OR (a.status = 'active'::text))`
// — fully parenthesised, keywords upper-cased, literals explicitly cast,
// `public.` dropped where the search_path covers it. Normalising that by hand
// means guessing at the deparser, and guessing wrong in the lenient direction
// gives a comparison that passes everything.
//
// So the file clause is not normalised — it is handed to the same deparser.
// `create temporary view v as select 1 from <table> where (<file clause>)`
// stores the file's clause as a parse tree against the real table, and
// `pg_get_viewdef(v, false)` prints it with the identical non-pretty,
// fully-parenthesised rules `pg_get_expr` uses. The two strings then match
// exactly, modulo indentation. No heuristics, nothing to tune.
//
// This is read-only in effect: a temporary view lives in the session's own
// `pg_temp` schema and dies with the connection, and each probe is created and
// read inside a single Management API request. It also means a clause that no
// longer type-checks against the live table — a renamed column, a dropped
// function — fails loudly instead of being quietly normalised into agreement.

const CMD = { r: 'select', a: 'insert', w: 'update', d: 'delete', '*': 'all' };

const pgArray = (v) => {
  if (Array.isArray(v)) return v.map(String);
  const s = String(v ?? '').trim();
  if (!s.startsWith('{')) return s === '' ? [] : [s];
  const inner = s.slice(1, -1).trim();
  return inner === '' ? [] : inner.split(',').map((x) => x.trim().replace(/^"|"$/g, ''));
};

const wantPolicies = new Map();
for (const { name, body } of sources) {
  for (const m of body.matchAll(/create\s+policy\s+/gi)) {
    const stmt = stmtAt(body, m.index);
    const nm = /create\s+policy\s+(?:"([^"]+)"|([a-z0-9_]+))/i.exec(stmt);
    const on = /\bon\s+(?:"?([a-z0-9_]+)"?\.)?"?([a-z0-9_]+)"?/i.exec(stmt);
    if (!nm || !on) continue;
    const schema = (on[1] ?? 'public').toLowerCase();
    const table = on[2].toLowerCase();
    const obj = (nm[1] ?? nm[2]).toLowerCase();
    wantPolicies.set(`${schema}.${table}.${obj}`, {
      mig: name, schema, table, obj,
      cmd: (/\bfor\s+(all|select|insert|update|delete)\b/i.exec(stmt)?.[1] ?? 'all').toLowerCase(),
      permissive: !/\bas\s+restrictive\b/i.test(stmt),
      roles: (/\bto\s+([a-z0-9_,\s]+?)(?=\s+(?:using|with\s+check)\b|$)/i.exec(stmt)?.[1] ?? '')
        .split(',').map((r) => r.trim().toLowerCase()).filter(Boolean).sort(),
      using: groupAfter(stmt, /\busing\b/i),
      check: groupAfter(stmt, /\bwith\s+check\b/i),
    });
  }
}

const livePolicyDefs = new Map(
  (await sql(`
    select n.nspname as schema, c.relname as tbl, p.polname, p.polcmd::text as cmd, p.polpermissive,
           coalesce((select array_agg(pg_get_userbyid(o) order by pg_get_userbyid(o)) from unnest(p.polroles) o), '{}') as roles,
           pg_get_expr(p.polqual, p.polrelid) as qual,
           pg_get_expr(p.polwithcheck, p.polrelid) as with_check
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'storage')`))
    .map((r) => [`${r.schema.toLowerCase()}.${r.tbl.toLowerCase()}.${r.polname.toLowerCase()}`, r]),
);

// Hand a batch of clauses to the deparser and read back their canonical
// forms. Batched because the Management API throttles: 72 clauses as 72
// requests hit 429s partway through, and a throttled probe is indistinguishable
// from a clause that does not parse unless you are careful. One request creates
// up to BATCH temporary views and reads all of their definitions back.
//
// A batch runs as one transaction, so a single clause that does not type-check
// rolls back the rest. That is what the per-clause fallback is for: it finds
// out WHICH clause failed instead of blaming the batch.
const PROBE_BATCH = 12;

function whereOf(def) {
  const m = /\bWHERE\s+([\s\S]*?);?\s*$/.exec(String(def ?? ''));
  // A clause the parser folds to a constant leaves no WHERE behind.
  return m ? sqz(m[1]).replace(/;$/, '') : 'true';
}

const probeView = (i) => `_audit_probe_${i}`;
const probeSql = (i, t) =>
  `create or replace temporary view ${probeView(i)} as select 1 as c from ${t.schema}.${t.table} where (${t.clause});`;
const probeRead = (i) => `pg_get_viewdef('pg_temp.${probeView(i)}'::regclass, false) as d${i}`;

async function canonicaliseAll(tasks) {
  const out = new Map();
  for (let i = 0; i < tasks.length; i += PROBE_BATCH) {
    const slice = tasks.slice(i, i + PROBE_BATCH);
    try {
      const rows = await sql(
        slice.map((t, j) => probeSql(i + j, t)).join('\n') + '\n' +
        'select ' + slice.map((_, j) => probeRead(i + j)).join(', ') + ';',
      );
      slice.forEach((_, j) => out.set(i + j, { ok: whereOf(rows[0][`d${i + j}`]) }));
    } catch {
      for (const [j, t] of slice.entries()) {
        try {
          const rows = await sql(`${probeSql(i + j, t)}\nselect ${probeRead(i + j)};`);
          out.set(i + j, { ok: whereOf(rows[0][`d${i + j}`]) });
        } catch (err) {
          out.set(i + j, { err: sqz(err.message) });
        }
      }
    }
  }
  return out;
}

console.log('\n── 8 · policy expressions ──────────────────────────────────');

// Pass 1 — the metadata comparisons, and collect every clause to be deparsed.
const clauseTasks = [];
let polGone = 0, polMeta = 0;
for (const [key, want] of wantPolicies) {
  const live = livePolicyDefs.get(key);
  if (live === undefined) { polGone++; continue; }   // absence is section 2's finding

  // The Management API returns a Postgres array as its text form, `{a,b}`,
  // not as JSON. Spreading that string iterates its CHARACTERS, which turned
  // every single policy into a role mismatch on this section's first run —
  // 54 findings that were all one missing parse.
  const liveRoles = pgArray(live.roles).map((r) => r.toLowerCase()).sort();
  if (want.roles.length && want.roles.join(',') !== liveRoles.join(',')) {
    polMeta++;
    note('policy', `${key} applies TO ${liveRoles.join(', ') || '(none)'} but its migration says ${want.roles.join(', ')}`, want.mig);
  } else okItem();

  if (CMD[live.cmd] !== want.cmd) {
    polMeta++;
    note('policy', `${key} is FOR ${String(CMD[live.cmd]).toUpperCase()} but its migration says FOR ${want.cmd.toUpperCase()}`, want.mig);
  } else okItem();

  if (live.polpermissive !== want.permissive) {
    polMeta++;
    note('policy', `${key} is ${live.polpermissive ? 'PERMISSIVE' : 'RESTRICTIVE'} but its migration says ${want.permissive ? 'PERMISSIVE' : 'RESTRICTIVE'}`, want.mig);
  } else okItem();

  for (const [label, fileClause, liveClause] of [
    ['USING', want.using, live.qual],
    ['WITH CHECK', want.check, live.with_check],
  ]) {
    const hasFile = fileClause !== null && sqz(fileClause) !== '';
    const hasLive = liveClause !== null && liveClause !== undefined;
    if (!hasFile && !hasLive) { okItem(); continue; }
    if (hasFile !== hasLive) {
      polMeta++;
      note('policy', `${key} ${label}: migration ${hasFile ? 'defines a clause, live has none' : 'defines none, live has one'}${hasLive ? ` (live: ${sqz(liveClause)})` : ''}`, want.mig);
      continue;
    }
    clauseTasks.push({ key, label, want, schema: want.schema, table: want.table, clause: fileClause, live: liveClause });
  }
}

// Pass 2 — deparse them all, then compare.
const canon = await canonicaliseAll(clauseTasks);
let polWrong = 0, polBroken = 0;
for (const [i, t] of clauseTasks.entries()) {
  const r = canon.get(i);
  if (r?.err !== undefined) {
    polBroken++;
    note('policy', `${t.key} ${t.label}: the migration's clause does not parse against live ${t.schema}.${t.table} — ${r.err.slice(0, 300)}`, t.want.mig);
    continue;
  }
  if (r.ok === sqz(t.live)) { okItem(); continue; }
  polWrong++;
  note('policy', `${t.key} ${t.label} differs from its migration\n        migration (deparsed): ${r.ok}\n        live:                 ${sqz(t.live)}`, t.want.mig);
}

console.log(`  ${String(wantPolicies.size).padStart(3)} definitions · ${clauseTasks.length} clauses deparsed and compared`);
console.log(`  ${polWrong} clause mismatch(es) · ${polMeta} role/command/permissive/presence mismatch(es) · ${polBroken} not parsing · ${polGone} dropped later · ${livePolicyDefs.size} live`);

// ═══ Report ═════════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════');
if (findings.length === 0) {
  console.log(`CLEAN — ${pass} checks, every statement's end state is live.`);
} else {
  console.log(`${findings.length} statement(s) whose effect is NOT in the live database (${pass} checks passed):\n`);
  for (const f of findings) {
    console.log(`  [${f.cls}] ${f.detail}`);
    console.log(`      ${f.mig}`);
  }
}
console.log('\nNot covered: data backfills (`update public.x set ...`), whose end');
console.log('state is data-dependent, and anything in a schema other than public or');
console.log('storage. For an independent second opinion on schema shape:');
console.log('  supabase link --project-ref ' + REF);
console.log('  supabase db diff --linked          # needs Docker running');
process.exit(findings.length === 0 ? 0 : 1);
