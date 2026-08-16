#!/usr/bin/env node
// ── S1 · POST-DEPLOY CONTRACT PROBES against the LIVE CRM (CRM PR #142) ──────────────────
//
// ⚠️  STATUS: **UNRUN**, not passing. Nothing in the spec-raw-text-migration evidence chain
//     may be scored on this file until somebody executes it and files `s1-probe-post142.json`.
//     The reason it is unrun is recorded, not hand-waved:
//
//       The read-only CRM proxy `zz-crm-probe-spec-shapeA` (`UYkE8VLZ8DzJa3TT`) has
//       **`availableInMCP: false`**. Every MCP operation on it — `get_workflow_details`,
//       `publish_workflow` — returns:
//           "Workflow is not available in MCP. Enable MCP access from the workflow card in
//            the workflows list, or from the workflow settings."
//       That is an access block, and the coder seat does not route around one. The CRM
//       credential (`crm-n8n-auth`) lives in n8n, not in this repo, and the seat may not use a
//       repo-held credential against a live host, so there is no second path by design.
//
//     TO UNBLOCK (exact UI action, one toggle):
//       n8n -> Workflows -> `zz-crm-probe-spec-shapeA` -> the card's ⋮ menu (or the workflow's
//       Settings panel) -> enable **Available in MCP**. Then an agent can publish it (that is
//       what activates the webhook), run this file, unpublish it, and confirm the webhook 404s.
//
// USAGE once the proxy is reachable — the credential never leaves n8n:
//
//   PROBE_WEBHOOK='https://automate-sorento.foundryx.my/webhook/<the zz-crm-probe path>' \
//   node s1-probe.js                       # writes s1-probe-post142.json
//
// Everything here is a POST that only READS (§0 permits CRM reads against prod; it permits
// nothing else, and this file must never gain a write).
//
// ── WHAT EACH PROBE IS FOR ───────────────────────────────────────────────────────────────
//  S1-1  the NEW request shape: raw `query`, `spec_fallback:true`, NO `free_terms` at all.
//        This is the exact body the clone now sends. Asserts spec rows arrive,
//        `display.specifications` is present and values-only, top-level `spec_asked` is
//        present and never contains `class`, `preferred_specs` is present, and
//        `unrecognized_terms` is present-and-possibly-empty (never absent-as-meaningful).
//  S1-2  SA-P1 re-probe post-deploy (a described product still resolves through the spec tier).
//  S1-3  SA-P2 inertness parity — the same body with and without the flags on a CODE query.
//  S1-4  SA-P4 gibberish floor.
//  S1-C  ⭐ THE COUNTERWEIGHT, and the one people skip: a FULLY-COVERED code phrase must still
//        SUPPRESS the fallback even with `spec_fallback:true`. Without it S1-2 alone would pass
//        on a CRM that had started firing spec search on everything.
//  DEV-1 a spec row whose `specifications.brand` is a real catalogue spelling ("SORENTO" /
//        "NO LOGO"-class). This is the FIXTURE the three-line render rule needs; if no probe
//        yields one, the renderer's brand exemption is untested against real data and must be
//        reported as such rather than assumed.
//  DEV-2 a code-shaped token AND a descriptive phrase in ONE query: the code must SURVIVE in
//        `unresolved_tokens` (CRM `_is_code_shaped` never clears it) while the descriptive
//        token clears. This is what makes the mixed hit+miss reply reachable in the wild.
//  SR-8  "sorento ..." must no longer headline SORENTOBAG / SORENTO188 code junk (D7,
//        `_suppress_brand_prefix_junk`), and — the counterweight — junk must STAY when the
//        ranker answered nothing.
//
// A probe that CONTRADICTS the plan is a STOP, not a note: the renderer was built against
// these fields.
'use strict';

const fs = require('fs');
const path = require('path');

const WEBHOOK = process.env.PROBE_WEBHOOK;
if (!WEBHOOK) {
  console.error([
    'S1 probes NOT RUN — PROBE_WEBHOOK is not set.',
    '',
    'This is the expected state while `zz-crm-probe-spec-shapeA` (UYkE8VLZ8DzJa3TT) has',
    'MCP access disabled. Record the S1 probes as UNRUN in the run log; do NOT infer them',
    'from the offline suite, which proves the REQUEST is well-formed and never that the',
    'SERVICE answers it as designed (LESSONS §70: merged is not deployed).',
  ].join('\n'));
  process.exit(3);
}

const QS = process.env.PROBE_QS || 'contact_id=437264483&space_id=364817';
const post = (payload) => fetch(WEBHOOK, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ qs: QS, payload }),
}).then((r) => r.json()).then((w) => (typeof w.body === 'string' ? JSON.parse(w.body) : w.body));

// ── THE BODIES ───────────────────────────────────────────────────────────────────────────
// `migrated` is byte-for-byte the field set the clone now sends (see
// resolve-entity-http.after.jsonBody.txt): raw text in `query`, NO `free_terms`.
const migrated = (raw, tokens, hints, matchMode = 'and') => ({
  query: raw,
  match_mode: matchMode,
  tokens,
  allowed_entity_types: hints,
  access_levels: [],
  domain: 'master_products',
  fallback_to_all_types: true,
  limit: 15,
  spec_fallback: true,
  understand_phrase: false,
});
// The pre-flag body, for the parity/inertness comparisons.
const bare = (b) => {
  const o = { ...b };
  delete o.spec_fallback; delete o.understand_phrase; delete o.free_terms;
  return o;
};

const specRows = (r) => [
  ...((r && r.intersection) || []),
  ...(((r && r.resolutions) || []).flatMap((t) => t.matches || [])),
].filter((m) => m && m.match_tier === 'spec_search');

let fail = 0;
const out = [];
const rec = (id, why) => { const o = { id, why, checks: [] }; out.push(o); return o; };
const add = (o, okFlag, msg, extra) => {
  o.checks.push({ ok: okFlag, msg, extra });
  if (!okFlag) fail++;
  console.log(`  ${okFlag ? '✓' : '✗'} ${o.id}  ${msg}${extra !== undefined ? '  ' + JSON.stringify(extra) : ''}`);
};

(async () => {
  // ── S1-1 · the migrated shape ─────────────────────────────────────────────────────────
  {
    const o = rec('S1-1', 'raw query + spec_fallback, NO free_terms — the body the clone now sends');
    const raw = 'please get me double bowl kitchen sink with thickness 1.2mm';
    const r = await post(migrated(raw, ['double bowl kitchen sink'], ['category']));
    o.response_keys = Object.keys(r || {}).sort();
    const rows = specRows(r);
    o.spec_row_count = rows.length;
    add(o, rows.length > 0, `spec rows arrive on the raw-text body (got ${rows.length})`);
    const withDisplay = rows.filter((m) => m.display && Object.prototype.hasOwnProperty.call(m.display, 'specifications'));
    add(o, rows.length > 0 && withDisplay.length === rows.length,
      'every spec row carries display.specifications (present even when null)');
    const vals = withDisplay.map((m) => m.display.specifications).filter(Boolean);
    add(o, vals.every((s) => Object.values(s).every((v) => v === null || typeof v !== 'object' || Array.isArray(v))),
      'specifications is VALUES-ONLY (no {value,unit} envelopes survive)');
    add(o, vals.every((s) => !('free_terms' in s)), '`free_terms` is never a specifications key');
    add(o, rows.every((m) => Array.isArray(m.display && m.display.preferred_specs)),
      'every spec row carries preferred_specs (parallel array)');
    add(o, rows.every((m) => {
      const ms = new Set((m.display && m.display.matched_specs) || []);
      return ((m.display && m.display.preferred_specs) || []).every((k) => !ms.has(k));
    }), 'matched_specs ∩ preferred_specs is EMPTY on every row (S4-3 behavioural disjointness)');
    // 🔴 the field the renderer's filter is built on
    add(o, Array.isArray(r && r.spec_asked), '`spec_asked` is present TOP-LEVEL and an array',
      r && r.spec_asked);
    add(o, Array.isArray(r && r.spec_asked)
      && r.spec_asked.every((x) => x && typeof x === 'object' && typeof x.key === 'string'),
      '`spec_asked` entries are {key, value} objects');
    add(o, Array.isArray(r && r.spec_asked)
      && !r.spec_asked.some((x) => String(x && x.key).toLowerCase() === 'class'),
      '`spec_asked` does NOT contain `class` on the deterministic path (S4 dev-1 artefact)');
    add(o, Array.isArray(r && r.unrecognized_terms),
      '`unrecognized_terms` is present (possibly empty — absent-vs-empty is NOT meaningful)',
      r && r.unrecognized_terms);
    add(o, Array.isArray(r && r.spec_unmet), '`spec_unmet` is present', r && r.spec_unmet);
    // The point of the whole slice: the qualifier words reached the deriver.
    const asked = ((r && r.spec_asked) || []).map((x) => String(x.key).toLowerCase());
    const unmet = ((r && r.spec_unmet) || []).map((x) => String(x && x.key).toLowerCase());
    add(o, asked.includes('thickness') || unmet.includes('thickness'),
      '🔴 THE SLICE: "thickness 1.2mm" reached the CRM — it is asked-for or reported unmet',
      { asked, unmet });
    o.matched_specs_sets = [...new Set(rows.map((m) => JSON.stringify((m.display || {}).matched_specs || [])))];
    o.sample_specifications = vals.slice(0, 3);
  }

  // ── S1-2 · SA-P1 re-probe ─────────────────────────────────────────────────────────────
  {
    const o = rec('S1-2', 'SA-P1 post-deploy: a described product still resolves through the spec tier');
    const r = await post(migrated('do you have wall hung basin', ['wall hung basin'], ['category']));
    const rows = specRows(r);
    o.spec_row_count = rows.length;
    add(o, rows.length >= 1, `≥1 spec_search match (got ${rows.length})`);
    add(o, rows.every((m) => m.match_field === 'specifications'), 'every spec match is match_field="specifications"');
    add(o, rows.every((m) => typeof m.uuid === 'string' && m.uuid.length > 0), 'every spec match carries a uuid');
    o.top = rows.slice(0, 5).map((m) => ({ code: m.canonical_code, cls: (m.display || {}).class }));
  }

  // ── S1-3 · SA-P2 inertness parity on a CODE query ─────────────────────────────────────
  {
    const o = rec('S1-3', 'SA-P2 post-deploy: a code query is UNCHANGED by the flags');
    const body = migrated('check stock SRTWC286', ['SRTWC286'], ['product']);
    const [withFlags, without] = [await post(body), await post(bare(body))];
    const norm = (x) => JSON.stringify(x, (k, v) => (k === 'elapsed_ms' ? undefined : v));
    const same = norm(withFlags) === norm(without);
    add(o, same, 'response identical with and without spec_fallback/understand_phrase',
      same ? undefined : {
        only_with: Object.keys(withFlags || {}).filter((k) => !(k in (without || {}))),
        only_without: Object.keys(without || {}).filter((k) => !(k in (withFlags || {}))),
      });
    add(o, specRows(withFlags).length === 0, 'zero spec rows on a fully-resolving code query');
  }

  // ── S1-C · ⭐ THE COUNTERWEIGHT ───────────────────────────────────────────────────────
  {
    const o = rec('S1-C', 'COUNTERWEIGHT: a fully-covered code PHRASE still suppresses the fallback');
    // Not a bare code — a sentence whose product token is fully covered. This is the shape a
    // widened gate would start firing on, and the shape S1-3 cannot see.
    const r = await post(migrated('do you have stock for SRTWC286 please', ['SRTWC286'], ['product']));
    const rows = specRows(r);
    add(o, rows.length === 0,
      `the fallback did NOT fire on a fully-covered code phrase (got ${rows.length} spec rows)`);
    add(o, !('spec_asked' in (r || {})) || (r.spec_asked || []).length === 0,
      'nothing was asked-for — the spec machinery did not run', r && r.spec_asked);
  }

  // ── S1-4 · SA-P4 gibberish floor ──────────────────────────────────────────────────────
  {
    const o = rec('S1-4', 'SA-P4 post-deploy: gibberish stays a miss');
    const r = await post(migrated('purple levitating sink', ['purple levitating sink'], ['category']));
    const rows = specRows(r);
    o.spec_row_count = rows.length;
    o.floor_missed = r && r.floor_missed;
    add(o, true, `observational: ${rows.length} spec rows, floor_missed=${JSON.stringify(r && r.floor_missed)}`);
    add(o, rows.length === 0, '🔴 nonsense must NOT start returning rows (SR-6 is the same claim)');
  }

  // ── DEV-1 · a real catalogue brand spelling, for the render rule ──────────────────────
  {
    const o = rec('DEV-1', 'find a spec row whose specifications.brand is a real catalogue spelling');
    const PHRASES = ['stainless steel kitchen sink', 'wall hung toilet bowl', 'basin tap',
                     'rain shower set', 'concealed cistern', 'urinal'];
    const seen = [];
    for (const p of PHRASES) {
      const r = await post(migrated(p, [p], ['category']));
      for (const m of specRows(r)) {
        const b = ((m.display || {}).specifications || {}).brand;
        if (typeof b === 'string' && b) seen.push({ phrase: p, code: m.canonical_code, brand: b });
      }
      if (seen.length >= 5) break;
    }
    o.brands_seen = seen.slice(0, 10);
    add(o, seen.length > 0, `a brand value was observed on a spec row (${seen.length} rows)`);
    // The render rule only matters when the catalogue spelling is NOT plain titlecase.
    const nonTitle = seen.filter((x) => x.brand !== x.brand.toLowerCase()
      .replace(/\b[a-z]/g, (c) => c.toUpperCase()));
    o.non_titlecase_brands = [...new Set(nonTitle.map((x) => x.brand))];
    add(o, true, `brands whose spelling a blind titlecase WOULD rewrite: ${JSON.stringify(o.non_titlecase_brands)}`);
    if (!nonTitle.length) {
      console.log('    ⚠️ DEV-1 INCONCLUSIVE: no observed brand differs from titlecase, so the');
      console.log('       renderer exemption is untested against real data. Say so; do not assume.');
    }
  }

  // ── DEV-2 · a code token SURVIVES beside a resolving descriptive phrase ───────────────
  {
    const o = rec('DEV-2', 'code-shaped token survives the CRM strip while the descriptive token clears');
    const raw = 'wall hung basin and SRTZZ999';
    const r = await post(migrated(raw, ['wall hung basin', 'SRTZZ999'], ['category', 'product'], 'and'));
    const unresolved = (r && r.unresolved_tokens) || [];
    o.unresolved_tokens = unresolved;
    o.fallback_match_mode = r && r.fallback_match_mode;
    o.spec_row_count = specRows(r).length;
    const low = unresolved.map((t) => String(t).toLowerCase());
    add(o, low.includes('srtzz999'),
      '🔴 the CODE token is STILL unresolved (references.py: _is_code_shaped is never cleared)');
    add(o, specRows(r).length > 0, 'and a spec shortlist came back on the SAME response');
    add(o, !low.includes('wall hung basin'),
      'the descriptive token CLEARED (its words appear in a shown row) — the mixed hit+miss shape');
  }

  // ── SR-8 · brand routing, both directions ────────────────────────────────────────────
  {
    const o = rec('SR-8', 'D7: "sorento" no longer headlines SORENTOBAG/SORENTO188 code junk');
    const raw = 'sorento double bowl kitchen sink with 1.2mm thickness';
    const r = await post(migrated(raw, ['sorento double bowl kitchen sink'], ['category']));
    const all = [...((r && r.intersection) || []),
                 ...(((r && r.resolutions) || []).flatMap((t) => t.matches || []))];
    const junk = all.filter((m) => /^(SORENTOBAG|SORENTO\d+|\*+)/i.test(String(m.canonical_code || '')));
    o.junk_codes = junk.map((m) => m.canonical_code);
    o.spec_row_count = specRows(r).length;
    add(o, junk.length === 0, `no SORENTO-prefix junk in the answer (got ${JSON.stringify(o.junk_codes)})`);
    add(o, specRows(r).length > 0, 'and the descriptive half produced a real spec answer');
    const brandAsked = ((r && r.spec_asked) || []).some((x) => String(x.key).toLowerCase() === 'brand');
    add(o, true, `observational: brand in spec_asked = ${brandAsked} (D7 says a stated brand EARNS its key)`);
  }

  const dest = path.join(__dirname, 's1-probe-post142.json');
  fs.writeFileSync(dest, JSON.stringify({ ran_at: new Date().toISOString(), cases: out }, null, 1));
  console.log(`\nwrote ${dest}`);
  console.log(fail > 0
    ? '\n🔴 A PROBE CONTRADICTED THE PLAN. STOP — do not adjust the renderer to match; report it.'
    : '\nall S1 probes green');
  process.exit(fail > 0 ? 1 : 0);
})().catch((e) => { console.error('probe failed:', e && e.message); process.exit(2); });
