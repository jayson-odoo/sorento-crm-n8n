// ── build-miss-member-offer (miss-company-routing — PLAIN HALF ONLY) ────────
// On an ANSWERED turn that missed a company, keep the found results + the presenter's miss line
// and offer escalation. TWO arms exist in this body; on LIVE only ONE of them is reachable.
//
// PLAIN arm (the arm that ships): input is miss-roster-plan's items directly — miss-roster-gate
// TRUE -> miss-roster-plan -> here. No roster was fetched and no picker is rendered. Output is the
// central-exchange envelope + `miss_plain_offer: true` + the plan identity (`miss_roster_plan`,
// carrying the lane `team`); compile-current-state's Case A' appends the frozen phrase.
//
// MEMBERS arm (retained, UNREACHABLE on live): renders the miss company's member picker from a
// get-cs-members-miss roster. Neither `get-cs-members-miss` nor `miss-members-gate` is deployed
// here, so nothing can feed this arm a roster. It is unreachable through TWO independent barriers,
// either of which alone is sufficient:
//   (a) miss-roster-plan stamps `members: false` on every row, so `real.every(p => p.members ===
//       false)` is true for any non-sentinel plan and the plain arm returns first;
//   (b) even with (a) bypassed, `$input` here is miss-roster-plan's OWN items, not http
//       fullResponse items — `rosterAt()` finds neither `body` array nor a bare array, yields zero
//       members, and the `!members.length` guard returns the untouched envelope.
// It matters that this stays unreachable, not merely unused: compile-current-state's Case A — the
// only `last_result_set` CONCATENATION on live — keys on the `miss_member_offer` flag this arm
// alone sets, and the arm's wiring half (get-cs-members-miss + miss-members-gate) is not deployed.
// Its multi-company close ("reply with the company name") became parseable 2026-08-25 — the live
// parser's deterministic company_pick arm shipped (company-pick part 3) — so the COPY is no longer
// a barrier; reachability still is, until Piece 2 ships the wiring + flag deliberately. The arm is
// kept rather than deleted so that promotion is a wiring + flag change, rendering already reviewed.
//
// Mirrors build-cs-member-offer's roster parsing / dedupe / row shape (cs_last_result_set-shaped
// rows incl. company_id/company_name/brand_code/company_ids/companies) so the parser's Δ3 pick arm
// and escalation-context treat these rows identically to an ordinary member offer. Numbering
// CONTINUES after the reply's existing numbered blocks: base = max(numbers printed in the response
// text, answers.length).
//
// Zero members from every miss company — or ANY surprise — ⇒ envelope passthrough exactly (turn
// byte-identical; ccs's merge hunk keys on miss_member_offer === true AND non-empty rows).
const env = $('central-exchange').first().json;
const pass = [{ json: { ...env } }];
try {
  const plan = (() => { try { return $('miss-roster-plan').all().map(i => i.json); } catch (e) { return []; } })();
  // PLAIN arm — every non-sentinel plan item says members === false: emit the envelope +
  // miss_plain_offer:true + miss_roster_plan (plan identity incl. the lane team for ccs's frozen
  // phrase). NO miss_member_offer, NO miss_member_rows, NO miss_offer_text.
  // A plan item MISSING the flag falls through to the roster parse below, which yields [] members
  // on plan-item input ⇒ envelope passthrough (fail-closed: never a broken turn, never a surprise
  // picker). Zero non-sentinel items (the _miss_plan_empty sentinel, which is also what a capped
  // multi-company miss degrades to) ⇒ same passthrough.
  const real = plan.filter(p => p && p._miss_plan_empty !== true && (p.company_id || p.company_name));
  if (real.length && real.every(p => p.members === false)) {
    const planOut = real.map((p, i) => ({ plan_idx: (p.plan_idx != null) ? p.plan_idx : i, company_id: p.company_id || null, company_name: p.company_name || null, brand_code: p.brand_code || null, team: (typeof p.team === 'string' && p.team) ? p.team : null }));
    return [{ json: { ...env, miss_plain_offer: true, miss_roster_plan: planOut } }];
  }
  const resp = $input.all().map(i => i.json);
  const rosterAt = (i) => {
    const r = resp[i];
    if (!r || r.error) return [];                              // onError item ⇒ empty roster for that company
    if (Array.isArray(r.body)) return r.body;                  // fullResponse shape
    if (Array.isArray(r)) return r;                            // legacy: one item, json=array
    return [];
  };
  const isRow = (m) => m && m.user_id && m.respond_user_id;   // respond.io assign can't reach members without respond_user_id
  const members = [];
  const seen = new Map();
  plan.forEach((p, i) => {
    // fail-closed: a real miss company always carries id+name (from lookup_companies); the
    // empty-plan sentinel and any degenerate item contribute nothing.
    if (!p || p._miss_plan_empty === true || (!p.company_id && !p.company_name)) return;
    for (const m of rosterAt(i).filter(isRow)) {
      const prev = seen.get(m.user_id);
      if (prev) {   // dedupe by user_id across companies; membership is a set (build-cs-member-offer rev-6)
        if (p.company_name && !prev.companies.includes(p.company_name)) prev.companies.push(p.company_name);
        if (!prev.company_ids.includes(p.company_id || null)) prev.company_ids.push(p.company_id || null);
        continue;
      }
      const row = { ...m, company_id: p.company_id || null, company_name: p.company_name || null, brand_code: p.brand_code || null, companies: p.company_name ? [p.company_name] : [], company_ids: [p.company_id || null] };
      seen.set(m.user_id, row);
      members.push(row);
    }
  });
  if (!members.length) return pass;
  // numbering base: continue after the reply's existing numbered blocks
  const nums = String(env.response || '').match(/^\s*(\d+)\.\s/gm) || [];
  const maxNum = nums.reduce((a, s) => Math.max(a, parseInt(s, 10) || 0), 0);
  const base = Math.max(maxNum, Array.isArray(env.answers) ? env.answers.length : 0);
  const rows = members.map((m, i) => ({
    idx: base + i + 1, label: m.name, uuid: m.user_id, respond_user_id: m.respond_user_id,
    company_id: m.company_id || null, company_name: m.company_name || null, brand_code: m.brand_code || null,
    company_ids: Array.isArray(m.company_ids) ? m.company_ids : [m.company_id || null],
    companies: Array.isArray(m.companies) ? m.companies : (m.company_name ? [m.company_name] : []),
  }));
  // rev-5 intersection rule: persist only the plan items whose company actually contributed a
  // member — the pool identity must describe the roster SHOWN, not the calls made.
  const shown = new Set();
  for (const r of rows) for (const id of (Array.isArray(r.company_ids) ? r.company_ids : [])) shown.add(id || null);
  const used = plan.filter(p => p && !p._miss_plan_empty && shown.has(p.company_id || null));
  // Member lines are plain `n. Name` everywhere — no per-member `(Company)` suffix. ONE miss
  // company ⇒ flat list + the original yes-sentence. MORE than one miss company ⇒ grouped under
  // bold `*Company:*` headers (a shared member keeps ONE number and is listed under each group it
  // belongs to — build-cs-member-offer's rev-6 rule) and the closing sentence asks for the company
  // name. `used` (the plan items that contributed a member) is the SAME signal
  // compile-current-state's miss arm keys its phrase/axes on (_mcPlan.length === 1), so wording and
  // pool identity stay in lockstep.
  const multi = used.length > 1;
  let lines;
  if (!multi) {
    lines = rows.map(r => `${r.idx}. ${r.label}`).join('\n');
  } else {
    // Group on company_id, but fall back to a normalized company_name when the id is absent on
    // BOTH sides. A roster whose lookup_companies entries carried no `id` gives every plan item and
    // every row `company_id: null`, and a bare `(id || null) === (p.company_id || null)` then
    // matches null against null — every member prints under every company header. Names are the
    // only identity left in that case, so use them; a row with neither id nor name matches nothing
    // and is simply not grouped, which is the fail-closed direction.
    const key = (id, name) => (id || null) !== null
      ? `id:${id}`
      : (name ? `name:${String(name).toLowerCase().trim()}` : null);
    const inCo = (r, p) => {
      const want = key(p.company_id, p.company_name);
      if (want === null) return false;
      const ids = Array.isArray(r.company_ids) ? r.company_ids : [r.company_id || null];
      const names = Array.isArray(r.companies) ? r.companies : (r.company_name ? [r.company_name] : []);
      if (ids.some(id => key(id, null) === want)) return true;
      return names.some(n => key(null, n) === want);
    };
    const grouped = [];
    for (const p of used) {
      const group = rows.filter(r => inCo(r, p));
      if (!group.length) continue;
      grouped.push(`*${p.company_name || 'Other'}:*`);
      for (const r of group) grouped.push(`${r.idx}. ${r.label}`);
    }
    lines = grouped.join('\n');
  }
  const close = multi
    ? `If you have no preference, reply with the company name (${used.map(p => `*${p.company_name || 'Other'}*`).join(' / ')}) and we'll assign accordingly.`
    : `If you have no preference, just reply 'yes' and we'll assign automatically.`;
  const offer = `Please choose who to route to (reply with the number):\n${lines}\n\n${close}`;
  return [{ json: { ...env, miss_member_offer: true, miss_member_rows: rows, miss_offer_text: offer, miss_roster_plan: used } }];
} catch (e) {
  return pass;   // fail-closed: any surprise leaves the turn untouched
}
