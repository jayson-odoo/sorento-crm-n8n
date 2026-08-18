// ── build-miss-member-offer (miss-company-routing) ──────────────────────────
// Renders the MISS company's member picker on an ANSWERED order turn (captain case A: keep the
// found results + the presenter's miss line, then go straight to the miss company's picker).
// Input: one fullResponse item per miss-roster-plan item (index-aligned, onError degrades to an
// error item = empty roster). Mirrors build-cs-member-offer's roster parsing / dedupe / row shape
// (cs_last_result_set-shaped rows incl. company_id/company_name/brand_code/company_ids/companies)
// so the parser's Δ3 pick arm and escalation-context treat these rows identically to an ordinary
// member offer. Numbering CONTINUES after the reply's existing numbered blocks (the envelope
// answers are persisted as last_result_set rows 1..N by ccs's compressed view; "a stray 2 must
// still pick" the right row): base = max(numbers printed in the response text, answers.length).
// Output: the central-exchange envelope item passed through (the miss lane sits between
// central-exchange and dym-transform-partial, which appends to whatever item it receives), plus
// miss_member_offer / miss_member_rows / miss_offer_text / miss_roster_plan when ≥1 member was
// found. Zero members from every miss company — or ANY surprise — ⇒ envelope passthrough exactly
// (turn byte-identical; ccs's merge hunk keys on miss_member_offer === true AND non-empty rows).
const env = $('central-exchange').first().json;
const pass = [{ json: { ...env } }];
try {
  const plan = (() => { try { return $('miss-roster-plan').all().map(i => i.json); } catch (e) { return []; } })();
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
  const lines = rows.map(r => `${r.idx}. ${r.label}${r.companies.length ? ` (${r.companies.join(' / ')})` : ''}`).join('\n');
  const offer = `Please choose who to route to (reply with the number):\n${lines}\n\nIf you have no preference, just reply 'yes' and we'll assign automatically.`;
  // rev-5 intersection rule: persist only the plan items whose company actually contributed a
  // member — the pool identity must describe the roster SHOWN, not the calls made.
  const shown = new Set();
  for (const r of rows) for (const id of (Array.isArray(r.company_ids) ? r.company_ids : [])) shown.add(id || null);
  const used = plan.filter(p => p && !p._miss_plan_empty && shown.has(p.company_id || null));
  return [{ json: { ...env, miss_member_offer: true, miss_member_rows: rows, miss_offer_text: offer, miss_roster_plan: used } }];
} catch (e) {
  return pass;   // fail-closed: any surprise leaves the turn untouched
}
