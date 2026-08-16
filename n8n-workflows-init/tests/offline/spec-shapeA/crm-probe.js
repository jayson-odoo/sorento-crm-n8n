#!/usr/bin/env node
// ── SA-P1..P4 — CONTRACT PROBES AGAINST THE LIVE CRM ─────────────────────────────────────
//
// ⚠️  NOT RUN BY THE CODER SEAT. `sorento-coder` is barred from probing production hosts and
//     from using any credential that lives in this repo against a live endpoint. These four
//     probes are therefore **UNRUN**, not passing, and nothing in the SA evidence chain may
//     be scored on them until somebody with the CRM credential executes this file and files
//     the output. Read `probe.js`'s header for what IS proven offline.
//
// What they exist to catch: a contract mismatch between the body this change ships and the
// deployed `/api/v1/system/references/resolve`. Reading `sorento_crm_backend/app/api/v1/
// system/references.py` proves the SOURCE agrees; it does not prove the RUNNING service does
// (LESSONS §70: merged is not deployed — a FastMCP/FastAPI process registers its schema at
// start-up, so a merged endpoint is indistinguishable from an unavailable one until called).
//
// USAGE (whoever has the credential — never hardcode it, never commit the output verbatim if
// it contains anything customer-identifying):
//
//   CRM_BASE='https://<crm-host>/api/v1/system' \
//   CRM_API_KEY='<the crm-n8n-auth header value>' \
//   CRM_AUTH_HEADER='x-api-key' \
//   CRM_CONTACT_ID='437264483' CRM_SPACE_ID='364817' \
//   node crm-probe.js            # writes crm-probe-results.json
//
// Everything is a POST that only READS. §0 permits CRM reads against prod; it permits nothing
// else, and this file must never gain a write.
'use strict';

const fs = require('fs');
const path = require('path');
const { freeTerms } = require('./free-terms.js');

const { CRM_BASE, CRM_API_KEY } = process.env;
const AUTH_HEADER = process.env.CRM_AUTH_HEADER || 'x-api-key';
const CONTACT_ID = process.env.CRM_CONTACT_ID || '';
const SPACE_ID = process.env.CRM_SPACE_ID || '';

if (!CRM_BASE || !CRM_API_KEY) {
  console.error([
    'SA-P1..P4 NOT RUN — no CRM endpoint/credential supplied.',
    '',
    'This is the expected state for the coder seat: it may not probe production hosts, and',
    'the CRM credential is held by n8n (`crm-n8n-auth`), not by this repo. Record these four',
    'probes as UNRUN in the run log. Do NOT infer them from the offline suite: probe.js proves',
    'the REQUEST is well-formed and inert, never that the SERVICE answers it as designed.',
  ].join('\n'));
  process.exit(3);
}

// The same entity shapes probe.js uses, so the two layers cannot disagree about what is sent.
const raws = (...vals) => vals.map((raw) => ({ raw, hint: 'category', canonical_code: null, current_message: true, confident: true }));

// Baseline body = exactly the eight fields the spine sends today.
const baseBody = (query, entities, matchMode = 'and') => ({
  query,
  match_mode: matchMode,
  tokens: entities.map((e) => e.raw),
  allowed_entity_types: entities.map((e) => e.hint),
  access_levels: [],
  domain: 'master_products',
  fallback_to_all_types: true,
  limit: 15,
});

const withSpec = (body, entities) => ({
  ...body,
  spec_fallback: true,
  free_terms: freeTerms(entities),
  understand_phrase: false,
});

const CASES = [
  { id: 'SA-P1', why: 'a described product resolves through the spec tier', query: 'trying to find a wall hung basin', entities: raws('wall hung basin') },
  { id: 'SA-P2', why: 'a code query is UNCHANGED by the three new fields (the inertness claim)', query: 'trying to check SRTWC286', entities: raws('SRTWC286'), parity: true },
  { id: 'SA-P3', why: 'known v1 gap: cabana resolves as a promotion, so the fallback never fires', query: 'trying to find a cabana bathtub', entities: raws('cabana bathtub') },
  { id: 'SA-P4', why: 'gibberish stays a miss', query: 'trying to find a purple levitating sink', entities: raws('purple levitating sink') },
  // Review round (tests/reviews/spec-search-shapeA-wiring.md §C/§D):
  // SA-P6 — the WIDENED arm (`_product_words_unanswered`, ae3393810), which SA-P2 is blind to
  // because a fully-covered code token cannot trip it. Not a parity case: with the fields sent,
  // a partial-coverage phrase's result set is INTENDED to be replaced — this case MEASURES the
  // replacement and records the two §D preconditions (customer token left in unresolved_tokens;
  // trgm alternatives retained on the token's own resolution) that live compile-current-state
  // turns into a dual render.
  { id: 'SA-P6', why: 'widened arm: partial code coverage → spec rows REPLACE the intersection; record §D preconditions', query: 'trying to find a wall hung basin', entities: raws('wall hung basin'), widenedArm: true },
  // SA-P7 — the executed RED baseline at the contract boundary: SA-P1's body WITHOUT the three
  // fields must produce ZERO spec_search rows. Converts the family's RED-first from a
  // mechanism argument into an executed control (review "Required changes" item 2).
  { id: 'SA-P7', why: 'RED baseline: SA-P1 body without the three fields yields zero spec rows', query: 'trying to find a wall hung basin', entities: raws('wall hung basin'), redBaseline: true },
];

async function post(body) {
  const qs = CONTACT_ID ? `?contact_id=${encodeURIComponent(CONTACT_ID)}&space_id=${encodeURIComponent(SPACE_ID)}` : '';
  const res = await fetch(`${CRM_BASE.replace(/\/$/, '')}/references/resolve${qs}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', [AUTH_HEADER]: CRM_API_KEY },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* keep the raw text for the report */ }
  return { status: res.status, json, text: json ? undefined : text.slice(0, 400) };
}

const specMatches = (r) => (r && Array.isArray(r.resolutions) ? r.resolutions : [])
  .flatMap((t) => t.matches || []).filter((m) => m.match_tier === 'spec_search');

// AND-mode responses carry rows in `intersection`, not `resolutions[].matches` — the widened
// arm (`_product_words_unanswered`) REPLACES that block, so a spec-row check that only reads
// `resolutions` is blind there (exactly how SA-P2 stayed green while §C was open).
const specRowsAnywhere = (r) => [
  ...specMatches(r),
  ...((r && Array.isArray(r.intersection) ? r.intersection : []).filter((m) => m.match_tier === 'spec_search')),
];

(async () => {
  const out = [];
  let fail = 0;
  for (const c of CASES) {
    const base = baseBody(c.query, c.entities);
    const withNew = withSpec(base, c.entities);
    const rec = { id: c.id, why: c.why, request: withNew, checks: [] };
    const add = (okFlag, msg, extra) => { rec.checks.push({ ok: okFlag, msg, extra }); if (!okFlag) fail++; console.log(`  ${okFlag ? '✓' : '✗'} ${c.id}  ${msg}${extra ? `  ${JSON.stringify(extra)}` : ''}`); };

    const after = await post(withNew);
    rec.status = after.status;
    add(after.status === 200, `HTTP 200 (got ${after.status})`, after.text);
    if (after.status !== 200) { out.push(rec); continue; }

    if (c.parity) {
      // SA-P2 — the request WITHOUT the three fields must come back field-identical. This is
      // the claim the whole change rests on; the CRM enforces it via _result_has_zero_matches,
      // but "prove it, don't trust it" (UAC SA.md).
      const before = await post(base);
      const norm = (r) => JSON.stringify(r, (k, v) => (k === 'elapsed_ms' ? undefined : v));
      const same = norm(before.json) === norm(after.json);
      add(same, 'response identical with and without the three new fields (elapsed_ms ignored)',
        same ? undefined : { only_after: Object.keys(after.json || {}).filter((k) => !(k in (before.json || {}))), only_before: Object.keys(before.json || {}).filter((k) => !(k in (after.json || {}))) });
      rec.baseline_keys = Object.keys(before.json || {}).sort();
    }

    // §E invariant (review rev-2): §D's closure rests on the CRM returning early on a
    // successful AND run with NO per-token resolutions — so whenever spec rows are present,
    // `resolutions` must hold exactly the one emitted spec entry. If this ever fails, §D
    // (dual-render did-you-mean offering the displaced rows) has silently reopened.
    if (specRowsAnywhere(after.json).length > 0) {
      const n = (after.json.resolutions || []).length;
      add(n === 1, `§E invariant: spec rows present ⇒ resolutions.length === 1 (got ${n})`);
    }

    const ms = specMatches(after.json);
    rec.spec_match_count = ms.length;
    rec.spec_unmet = after.json.spec_unmet;
    rec.floor_missed = after.json.floor_missed;
    rec.semantic_used = after.json.semantic_used;
    rec.top = ms.slice(0, 5).map((m) => ({ code: m.canonical_code, uuid: m.uuid, field: m.match_field, tier: m.match_tier, sim: m.similarity }));

    if (c.id === 'SA-P1') {
      add(ms.length >= 1, `at least one spec_search match (got ${ms.length})`);
      add(ms.every((m) => m.match_field === 'specifications'), 'every spec match carries match_field="specifications"');
      add(ms.every((m) => typeof m.uuid === 'string' && m.uuid.length > 0), 'every spec match carries a uuid');
      const res = (after.json.resolutions || []).find((t) => (t.matches || []).some((m) => m.match_tier === 'spec_search'));
      if (res) add((res.resolved === (ms.length === 1)) && (res.ambiguous === (ms.length > 1)),
        'resolved/ambiguous mirror prefix semantics (len==1 / len>1)', { resolved: res.resolved, ambiguous: res.ambiguous, n: ms.length });
      // §70's rule: assert the NAME against the thing it claims. A spec-tier row must not
      // silently be a code match wearing a new label.
      add(ms.every((m) => m.match_tier === 'spec_search' && m.match_field !== 'product_code'),
        'no spec-tier row is actually a code match relabelled');
    }
    if (c.id === 'SA-P3' || c.id === 'SA-P4') {
      add(true, `observational: ${ms.length} spec matches, floor_missed=${JSON.stringify(after.json.floor_missed)}`);
    }

    if (c.redBaseline) {
      // SA-P7: the SAME body minus the three fields must yield zero spec rows anywhere in the
      // response — the executed RED at the contract boundary.
      const bare = await post(base);
      const bareSpec = specRowsAnywhere(bare.json);
      add(bare.status === 200 && bareSpec.length === 0,
        `RED baseline: without the three fields, zero spec rows anywhere (got ${bareSpec.length})`);
      rec.red_baseline_keys = Object.keys(bare.json || {}).sort();
    }

    if (c.widenedArm) {
      // SA-P6: with the fields, a partial-coverage phrase's AND intersection is REPLACED by
      // spec rows (intended post-promote behaviour — measure it, don't assume it), and the §D
      // preconditions are recorded verbatim for the reviewer.
      const before = await post(base);
      const beforeCodes = (before.json?.intersection || []).map((m) => m.canonical_code);
      const afterSpec = specRowsAnywhere(after.json);
      const afterCodeRows = (after.json?.intersection || []).filter((m) => m.match_tier !== 'spec_search');
      add(beforeCodes.length > 0, `without fields: the partial-coverage code intersection exists (got ${beforeCodes.length} rows)`);
      add(afterSpec.length > 0, `with fields: spec rows present (got ${afterSpec.length}) — the widened arm fired`);
      add(afterCodeRows.length === 0, `with fields: intersection fully REPLACED, no code-partial rows remain (got ${afterCodeRows.length})`);
      // §D preconditions — recorded, not asserted: their customer-visible consequence lives in
      // the spine renderer and is settled by the clone case, not here.
      rec.d_preconditions = {
        unresolved_tokens: after.json?.unresolved_tokens,
        customer_token_resolution: (after.json?.resolutions || []).map((t) => ({
          token: t.token, matches: (t.matches || []).length, alternatives: (t.alternatives || []).length,
        })),
        before_intersection_codes: beforeCodes.slice(0, 8),
      };
      add(true, `§D record: unresolved_tokens=${JSON.stringify(after.json?.unresolved_tokens)} per-token=${JSON.stringify(rec.d_preconditions.customer_token_resolution)}`);
    }
    out.push(rec);
  }
  const dest = path.join(__dirname, 'crm-probe-results.json');
  fs.writeFileSync(dest, JSON.stringify({ ran_at: new Date().toISOString(), base: CRM_BASE, cases: out }, null, 1));
  console.log(`\nwrote ${dest}`);
  process.exit(fail > 0 ? 1 : 0);
})();
