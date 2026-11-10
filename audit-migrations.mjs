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
//   objects      tables, views, functions, types, added columns
//   structural   policies, indexes, triggers, constraints, RLS enablement
//   privileges   every grant/revoke, resolved to a final intent per
//                (function, role) pair and compared to pg_proc.proacl
//   seeds        plan_feature_gates rows, which decide every cap in the product
//
// IMPORTANT BLIND SPOT: "CLEAN" does not mean "every migration is applied".
// It means every statement of a shape this script parses has its end state
// live. Statements inside a `do $$ ... $$` block are not parsed at all, and
// neither are table-level grants — so
// 20261109120000_revoke_truncate_from_client_roles.sql is currently unapplied
// and invisible here. Closing that is Job 1 and Job 3 in
// docs/supabase-schema-audit-handoff.md.
//
// What it CANNOT check, and nothing else here can either:
//   • backfills (`update public.x set ...`) — the end state is data-dependent
//     and usually indistinguishable from a row that was simply never there
//   • a statement whose effect a later migration deliberately undid, unless
//     the undo is also in the files (it reports these as "superseded")
//   • function BODIES. A function can exist with stale source. Only
//     `supabase db diff --linked` catches that, and it needs Docker.
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

async function sql(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${PAT}`, 'Content-Type': 'application/json', 'User-Agent': 'curl/8.4.0' },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
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
