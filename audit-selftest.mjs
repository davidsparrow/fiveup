// Does audit-migrations.mjs actually catch anything?
//
// A validator that only ever reports CLEAN is indistinguishable from no
// validator, and this one reports CLEAN on 1204 checks. So each case below
// introduces exactly one defect, runs the real audit, and asserts the audit
// reports it — and then asserts the audit returns to CLEAN afterwards, which
// is what proves the restore worked rather than leaving the repo tampered.
//
//   node audit-selftest.mjs            # all cases
//   node audit-selftest.mjs triggers   # only cases whose name contains this
//
// Every case works by STRING-PATCHING A MIGRATION FILE, never by writing to
// the database. The one live-state assertion — section 6's TRUNCATE
// invariant — is exercised through the AUDIT_TRUNCATE_ROLES seam, pointed at
// `service_role`, which legitimately does hold TRUNCATE on all 31 tables.
// Granting TRUNCATE to `anon` for real and relying on a cleanup step to take
// it away is the shape of mistake that left test users in production twice
// (see CLAUDE.md); this script writes nothing.
//
// Files are restored in a `finally`, from bytes read before the patch. If a
// run is killed anyway, `git checkout supabase/migrations` is the recovery.

import { readFileSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';

const MIG = (f) => `supabase/migrations/${f}`;
const SCHEMA = MIG('20260307123000_initial_schema.sql');
const GROUPS = MIG('20261017120000_phase22_groups_and_caps.sql');
const IDENT = MIG('20261015130000_phase20_member_identities.sql');

// A case is: patches to apply, and the substrings the audit must then report.
// `expect` entries are matched case-sensitively against the whole output.
const CASES = [
  {
    name: 'triggers · level, function and events',
    patches: [
      // FOR EACH STATEMENT where live is FOR EACH ROW. This is the phase 21
      // failure mode: a statement-level trigger fires even when the UPDATE
      // matched no rows, which broke every account deletion in the system.
      [SCHEMA,
        'create trigger trg_assets_set_updated_at\nbefore update on public.assets\nfor each row execute function public.set_updated_at();',
        'create trigger trg_assets_set_updated_at\nbefore update on public.assets\nfor each statement execute function public.set_updated_at();'],
      // Right name, wrong function — the object exists and does the wrong thing.
      [SCHEMA,
        'create trigger trg_validate_match_assets\nbefore insert or update on public.matches\nfor each row execute function public.validate_match_assets();',
        'create trigger trg_validate_match_assets\nbefore insert or update on public.matches\nfor each row execute function public.set_updated_at();'],
      // A narrowed event list: validates on INSERT but no longer on UPDATE.
      [SCHEMA,
        'create trigger trg_validate_feedback_submission\nbefore insert or update on public.feedback_submissions',
        'create trigger trg_validate_feedback_submission\nbefore insert on public.feedback_submissions'],
    ],
    expect: [
      'assets.trg_assets_set_updated_at differs',
      'FOR EACH STATEMENT → FOR EACH ROW',
      'matches.trg_validate_match_assets differs',
      'function set_updated_at → validate_match_assets',
      'feedback_submissions.trg_validate_feedback_submission differs',
      'events insert → insert+update',
    ],
  },
  {
    name: 'policies · a changed literal, and a clause that no longer parses',
    patches: [
      // One enum value swapped inside a policy's status filter.
      [GROUPS,
        "or (visibility in ('listed', 'open') and status in ('forming', 'active'))",
        "or (visibility in ('listed', 'open') and status in ('forming', 'closed'))"],
      // A column that does not exist: the deparser refuses it rather than
      // normalising it into agreement.
      [IDENT,
        'using (user_id = auth.uid() or public.is_admin());',
        'using (user_idd = auth.uid() or public.is_admin());'],
    ],
    expect: [
      'public.groups.groups_select_visible USING differs',
      "'closed'",
      "public.member_identities.member_identities_select_own USING: the migration's clause does not parse",
    ],
  },
  {
    name: 'policies · AND/OR regrouping with an identical token sequence',
    patches: [
      // THE case that justifies deparsing instead of normalising. Strip the
      // parens from either form and the token streams are byte-identical:
      //   ... and status in (...) or is_admin() or is_moderator()
      // Only a real parse tree tells them apart, and they are very different
      // rules: the tampered one exposes a listed group in ANY status to an
      // admin, and no longer exposes forming/active groups to moderators.
      [GROUPS,
        "  or (visibility in ('listed', 'open') and status in ('forming', 'active'))\n  or public.is_admin()\n  or public.is_moderator()",
        "  or (visibility in ('listed', 'open') and (status in ('forming', 'active') or public.is_admin()))\n  or public.is_moderator()"],
    ],
    expect: ['public.groups.groups_select_visible USING differs'],
  },
  {
    name: 'policies · role, command, and a dropped WITH CHECK',
    patches: [
      // anon instead of authenticated, and FOR ALL instead of FOR SELECT —
      // the policy name, table and clause all stay correct.
      [GROUPS,
        'on public.groups for select to authenticated',
        'on public.groups for all to anon'],
      // The write side of a FOR ALL policy, silently absent.
      [GROUPS,
        'on public.groups for all to authenticated\nusing (public.is_admin())\nwith check (public.is_admin());',
        'on public.groups for all to authenticated\nusing (public.is_admin());'],
    ],
    expect: [
      'groups_select_visible applies TO authenticated but its migration says anon',
      'groups_select_visible is FOR SELECT but its migration says FOR ALL',
      'groups_admin_manage WITH CHECK: migration defines none, live has one',
    ],
  },
  {
    name: 'invariants · section 6 fires on a role that does hold TRUNCATE',
    // No patch at all: the seam points the invariant at service_role, which
    // holds TRUNCATE on every public table by design. If section 6 can see
    // that, it can see anon regaining it.
    patches: [],
    env: { AUDIT_TRUNCATE_ROLES: 'service_role' },
    expect: [
      'hold TRUNCATE on public.groups',
      'RLS does not apply to TRUNCATE',
      'still granted to service_role',
    ],
  },
];

function run(env = {}) {
  return new Promise((resolve) => {
    execFile('node', ['audit-migrations.mjs'], { env: { ...process.env, ...env }, maxBuffer: 1 << 24 },
      (err, stdout, stderr) => resolve(`${stdout}${stderr}`));
  });
}

const only = process.argv[2];
const cases = only ? CASES.filter((c) => c.name.includes(only)) : CASES;
if (cases.length === 0) {
  console.error(`no case matches "${only}"`);
  process.exit(2);
}

let failed = 0;
const originals = new Map();

try {
  for (const c of cases) {
    console.log(`\n── ${c.name}`);
    for (const [file, from, to] of c.patches) {
      if (!originals.has(file)) originals.set(file, readFileSync(file, 'utf8'));
      const body = readFileSync(file, 'utf8');
      if (!body.includes(from)) {
        console.log(`   ✗ PATCH TARGET GONE in ${file}\n     ${from.split('\n')[0]}`);
        failed++;
        continue;
      }
      writeFileSync(file, body.replace(from, to));
    }

    const out = await run(c.env);
    const missed = c.expect.filter((e) => !out.includes(e));
    if (out.includes('CLEAN —') && c.expect.length) {
      console.log('   ✗ audit reported CLEAN with a defect present');
      failed++;
    }
    for (const e of c.expect) console.log(`   ${missed.includes(e) ? '✗ NOT REPORTED' : '✓ reported'}  ${e}`);
    failed += missed.length;

    for (const [file, body] of originals) writeFileSync(file, body);
    originals.clear();
  }

  // The other half of the proof: with nothing patched, the audit is clean.
  // Without this, a self-test that patched a file and failed to restore it
  // would still "pass" every case above.
  console.log('\n── restored tree must be CLEAN');
  const clean = await run();
  if (clean.includes('CLEAN —')) {
    console.log(`   ✓ ${/CLEAN — (\d+) checks/.exec(clean)?.[1]} checks clean`);
  } else {
    console.log('   ✗ audit is NOT clean after restore — run `git checkout supabase/migrations`');
    console.log(clean.split('\n').filter((l) => l.startsWith('  [')).slice(0, 10).join('\n'));
    failed++;
  }
} finally {
  for (const [file, body] of originals) writeFileSync(file, body);
}

console.log(`\n${failed === 0 ? 'SELF-TEST PASS — every case was caught' : `SELF-TEST FAIL — ${failed} expectation(s) unmet`}`);
process.exit(failed === 0 ? 0 : 1);
