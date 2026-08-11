// ── dym-annotate (dym-probe-before-offer) ──────────────────────────────────────
// Turns the dym-probe render envelope into "which offered codes actually HAVE the
// thing", and hands build-suggest-offer back the NOT-FOUND payload it expects.
//
// LOAD-BEARING: build-suggest-offer starts from `{...$input.first().json}`. Wiring
// dym-probe straight into it would replace the not-found payload and lose
// escalate_message / is_clarification / found_summary. So re-source it by name.
//
// FAIL OPEN. Any doubt ⇒ ok:false ⇒ zero annotation ⇒ today's un-annotated offer.
// Failure is detected by PAYLOAD SHAPE, never by node status (an unwired error
// output makes a broken run report success).
// ── LANE CONFIG — the ONLY two lines that differ between the two deployed copies ──
// This node is deployed twice, once per dym lane:
//   `dym-annotate`          (not-found lane) → build-suggest-offer D1
//   `dym-annotate-partial`  (results lane)   → compile-current-state partial-resolution
// Everything below this block is BYTE-IDENTICAL across both copies — the attribution
// rules, the predicates and the fail-open contract live in exactly one place, and a
// normalised diff of the two bodies is empty apart from these two literals.
const _PAYLOAD_SRC = 'not-found-error-message';   // the payload the downstream renderer expects back
const _XF_SRC      = 'dym-transform';             // this lane's planner

const out   = (() => { try { return { ...$(_PAYLOAD_SRC).first().json }; } catch (e) { return {}; } })();
const xf    = (() => { try { return $(_XF_SRC).first().json ?? {}; } catch (e) { return {}; } })();
const probe = (() => { try { return $input.first().json ?? {}; } catch (e) { return {}; } })();

const norm = (s) => String(s ?? '').trim().toLowerCase();

// ── C3 mitigation (ii): PAGE SATURATION. The backend default page size is
// `app/schemas/common.py:37  limit: int = 50` and NOTHING in the envelope reports truncation, so a
// full page is the only signal available that rows may have been cut. Detection-by-proxy, and it is
// the only defence if the per-domain probe_cap's rows-per-candidate assumption is wrong. A
// saturated page ⇒ ok:false ⇒ ZERO annotation ⇒ byte-identical to the un-annotated offer. It can
// only ever withhold an annotation.
// Cost of a false positive: an exactly-50-row honest answer loses its annotation for that turn.
// Cost of a false negative: a confident `- no <noun>` about a product that HAS the thing.
const _PAGE_SATURATION = 50;

const meta = {
  ok:           false,
  tool:         xf.probe_tool ?? null,
  noun:         xf.probe_noun ?? null,
  predicate:    xf.probe_predicate ?? null,
  probed:       (Array.isArray(xf.dym_candidate_codes) ? xf.dym_candidate_codes : []).map(norm),
  answer_count: 0,
  reason:       null,
};
let available = [];

// title, else the field whose label looks like "Product Code" — the shipped
// attribution used by annotate-incoming-picker / build-suggest-offer D3. Verbatim.
const codeOf = (a) => {
  let c = a && a.title;
  if (!c && a && Array.isArray(a.fields)) {
    const f = a.fields.find(x => /product\s*code/i.test(x && x.label));
    c = f && f.value;
  }
  return c ? norm(c) : null;
};
const fieldVal = (a, re) => {
  if (!a || !Array.isArray(a.fields)) return null;
  const f = a.fields.find(x => x && re.test(String((x && x.label) ?? '')));
  return f ? f.value : null;
};

const answers = Array.isArray(probe.answers) ? probe.answers
              : (Array.isArray(probe.items) ? probe.items : null);

// ── FAIL-OPEN DETECTION. Three n8n behaviours are possible when dym-probe's sub throws;
// all three are covered, and the order below is deliberate. Do not tidy either branch away.
//
//  1. `{error: …}` on the node's output  — ⚠️ THIS IS WHAT THIS n8n VERSION ACTUALLY DOES.
//     OBSERVED on the induced-failure run. The `probe.error` branch below is therefore
//     LOAD-BEARING, not a defensive extra. It is the branch the live failure took.
//  2. input-passthrough — the sentinel branch. NOT the observed behaviour here; its offline
//     fixture covers a HYPOTHETICAL n8n behaviour, so it is unit-exercised but was not the
//     branch the live failure took.
//  3. node halts — never reaches this node at all; caught consumer-side by `isExecuted`
//     in build-suggest-offer / compile-current-state.
//
// 🔴 WHY THE SENTINEL STAYS, AND STAYS FIRST — it is not generic hedging.
// Under behaviour 2 the item passed through is dym-transform's output, which is a SPREAD OF
// THE NOT-FOUND PAYLOAD, and that payload can legitimately carry an `answers` key (it
// originates from Aggregate1 on the get-results path). Shape-sniffing alone would then read a
// FAILED probe as a successful EMPTY one: `ok:true, answer_count:0` ⇒ a confident
// `- no <noun>` on EVERY candidate. That is the worst failure mode in this change — the same
// class as the cross-company over-claim the UUID union was rejected to avoid. The sentinel is
// the only defence against that identified misdetection, and it costs one stripped boolean
// and one `if`. Checking it FIRST is what makes the misdetection unreachable.
if (probe && probe._dym_probe_input === true) {
  meta.reason = 'probe_error';                 // behaviour 2 (hypothetical here) — see above
} else if (probe && probe.error) {
  meta.reason = 'probe_error';                 // behaviour 1 — OBSERVED on this n8n. LOAD-BEARING.
} else if (!answers) {
  meta.reason = 'no_answers_array';
} else if (answers.length >= _PAGE_SATURATION) {
  // C3 (ii). Checked BEFORE either predicate: both attribute by code, and an attribution built on a
  // truncated page is wrong in the one direction that matters (a missing code reads as "no").
  meta.answer_count = answers.length;
  meta.reason = 'page_saturated';
} else if (meta.predicate === 'qty_gt_zero') {
  meta.answer_count = answers.length;
  // One row per product x per ACTIVE WAREHOUSE, and a genuine 0 is still returned,
  // so presence is not has-stock. Sum "Quantity On Hand"; "—"/absent/unparseable = 0.
  const sums = new Map();
  for (const a of answers) {
    const c = codeOf(a);
    if (!c) continue;
    const raw = fieldVal(a, /^\s*quantity\s*on\s*hand\s*$/i);
    const n = Number(String(raw ?? '').replace(/[^0-9.\-]/g, ''));
    sums.set(c, (sums.get(c) || 0) + (Number.isFinite(n) ? n : 0));
  }
  available = [...sums.entries()].filter(([, v]) => v > 0).map(([k]) => k);
  meta.ok = true;
} else if (meta.predicate === 'row_present_with_type') {
  meta.answer_count = answers.length;
  // Defence in depth: a probe that lost its attachment_type_ids narrowing returns
  // EVERY attachment of every type, which would label a brochure-only product
  // "has certificate". Rows without an Attachment Type do not count, and an
  // all-untyped non-empty answer set is treated as unscoped ⇒ annotate nothing.
  const has = new Set();
  let typed = 0;
  for (const a of answers) {
    const t = fieldVal(a, /attachment\s*type/i);
    const tv = String(t ?? '').trim();
    if (tv === '' || tv === '—') continue;
    typed += 1;
    const c = codeOf(a);
    if (c) has.add(c);
  }
  if (answers.length > 0 && typed === 0) {
    meta.reason = 'unscoped_probe';
  } else {
    available = [...has];
    meta.ok = true;
  }
} else {
  meta.reason = 'unknown_predicate';
}

if (!meta.ok) available = [];

out.dym_available_codes = available;
out.dym_probe_meta = meta;
return out;
