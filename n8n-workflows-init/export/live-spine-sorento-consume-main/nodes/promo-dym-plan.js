// ── promo-dym-plan (D18) ─────────────────────────────────────────────────────────────────
// Fans a did-you-mean offer out into ONE ITEM PER CANDIDATE so the downstream probe can ask the
// CRM, per candidate, "does this code actually have any promotion this contact may see?" before
// we suggest it.
//
// WHY per candidate and not the batched dym-probe every other domain uses: promotion rows carry
// NO product reference. Measured on a real two-product query (4 rows): every row is
// {title, fields:[Promotion, Start Date, End Date], flags}. dym-annotate's `codeOf(row)`
// attribution therefore matches nothing, and a batched probe would stamp "- no promotion" on
// EVERY candidate — the exact misdetection dym-annotate's sentinel comment calls the worst
// failure mode in that change. One deterministic call per candidate instead.
//
// Pairs entities BY CODE, never by index: dym_probe_entities and dym_candidate_codes are built by
// separate loops in dym-transform, and an index assumption between two independently-built arrays
// is the kind that holds until someone filters one of them.
const xf = $('dym-transform').first().json;
const codes = Array.isArray(xf.dym_candidate_codes) ? xf.dym_candidate_codes : [];
const ents  = Array.isArray(xf.dym_probe_entities) ? xf.dym_probe_entities : [];

const norm = (s) => String(s ?? '').trim().toLowerCase();
const byCode = new Map();
for (const e of ents) {
  const k = norm(e && (e.canonical_code || e.code || e.raw));
  if (k && !byCode.has(k)) byCode.set(k, e);
}

const items = [];
for (const c of codes) {
  const e = byCode.get(norm(c));
  if (!e) continue;                    // no entity to scope with ⇒ cannot probe it honestly
  items.push({ json: { ...xf, probe_code: c, probe_entity: e } });
}
// Never return [] — that would skip every downstream node including dym-annotate, and
// build-suggest-offer would render its un-annotated offer with no signal that the probe was
// attempted. One inert item keeps the lane intact and dym-annotate fails open.
if (items.length === 0) return [{ json: { ...xf, probe_code: null, probe_entity: null, probe_plan_empty: true } }];
return items;
