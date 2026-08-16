// ── crossdomain-zeroset ─────────────────────────────────────────────────
// SINGLE SOURCE OF TRUTH for "asked but returned nothing" (plan cross-domain-stock-incoming §3 node 1).
// Passes the validator item through UNTOUCHED except for one namespaced key `_xd`, so If6 and the
// entire downstream miss path see exactly what they see today.
const pass = $input.first().json;
const out = { ...pass };
const OFF = (why) => { out._xd = { active: false, why }; return [{ json: out }]; };

const qfNode = $("Call 'sub-query-reformulator'");
const qf = (qfNode.isExecuted ? (qfNode.first().json.output || {}) : {});
const dh = qf.domain_hint;
if (dh !== 'inventory' && dh !== 'incoming') return OFF('domain');
if (qf.message_type !== 'business_query') return OFF('message_type');

const norm = s => String(s).trim().toUpperCase();
const OTHER_TOOL = dh === 'incoming' ? 'crm_inventory_stock_balance_list' : 'crm_incoming_stock_list';
const TEAM       = dh === 'incoming' ? 'purchasing' : 'warehouse';

// ── returned set. compile-current-state's getResultObj() prefers central-exchange, which does not
// exist yet at this point in the chain — so read validator and REPLICATE central-exchange's unwrap.
// Parity is proven by the shadow gate (plan §8 2b), never assumed.
let env = pass;
if (env && env.output && typeof env.output === 'object') env = env.output;
const items = Array.isArray(env.answers) ? env.answers : (Array.isArray(env.items) ? env.items : []);
const fieldVal = (it, label) => {
  const f = ((it && it.fields) || []).find(x => String((x && x.label) || '').trim().toLowerCase() === label);
  return f ? f.value : null;
};
const returnedCodes = new Set();
for (const it of items) {
  const v = fieldVal(it, 'product code');
  if (v != null && String(v).trim() !== '' && String(v).trim() !== '—') returnedCodes.add(norm(v));
}

// ── requested set — rule lifted from live #3 (dym-zerostock-itemize): TYPED-exact U DYM-PICKED.
// NOT compatible_entities: that set drops match_tier and carries resolver-expanded siblings the
// customer never typed.
const _rz = (() => { try { return $('resolve-entity').first().json || {}; } catch (e) { return {}; } })();
const _isProd = m => m && String(m.entity_type).toLowerCase() === 'product';
const requested = [];
const _seen = new Set();
const _add = (code, uuid, strict) => {
  if (code == null || code === '') return;
  const n = norm(code); if (!n) return;
  if (_seen.has(n)) {
    if (strict) { const ex = requested.find(x => x._n === n); if (ex) ex.strict = true; }
    return;
  }
  _seen.add(n);
  requested.push({ _n: n, code, uuid: uuid || null, strict: !!strict });
};
const _or = Array.isArray(_rz.resolutions) ? _rz.resolutions : null;
const _uuidByCode = new Map();
for (const r of (_or || [])) {
  for (const m of ((r && r.matches) || [])) {
    if (_isProd(m) && m.canonical_code && !_uuidByCode.has(norm(m.canonical_code))) _uuidByCode.set(norm(m.canonical_code), m.uuid);
  }
}
if (_or) {
  for (const r of _or) {
    const prods = ((r && r.matches) || []).filter(_isProd);
    if (!prods.length) continue;
    const exacts = prods.filter(m => m.match_tier === 'exact');
    if (exacts.length) { for (const m of exacts) if (m.canonical_code) _add(m.canonical_code, m.uuid, false); }
    else if (prods.length === 1 && prods[0].canonical_code) _add(prods[0].canonical_code, prods[0].uuid, false);
  }
} else {
  const _tok = new Set((Array.isArray(_rz.tokens) ? _rz.tokens : []).map(norm));
  const _int = Array.isArray(_rz.intersection) ? _rz.intersection
             : (_rz.by_entity_type ? Object.values(_rz.by_entity_type).flat() : []);
  for (const m of _int) if (_isProd(m) && m.canonical_code && _tok.has(norm(m.canonical_code))) _add(m.canonical_code, m.uuid, false);
}
// DYM-PICKED (strict) — prior cumulative picks + this turn's pick
try {
  const s = $('get-session-vars').first().json;
  const v = (s && s.session_vars && s.session_vars.variables) || (s && s.variables) || null;
  const prev = (v && v.dym_offer && Array.isArray(v.dym_offer.picked)) ? v.dym_offer.picked : [];
  for (const c of prev) _add(c, _uuidByCode.get(norm(c)), true);
} catch (e) {}
if (qf.dym_offer_pick_code) _add(qf.dym_offer_pick_code, _uuidByCode.get(norm(qf.dym_offer_pick_code)), true);

// ── missing: TYPED -> prefix-family satisfaction; PICKED -> strict exact.
// NOTE the deliberate divergence from live #3: it bails when returnedCodes is empty; we must NOT,
// because that is exactly the total-miss case this feature exists for.
const missing = [];
for (const rq of requested) {
  let ok = false;
  if (rq.strict) ok = returnedCodes.has(rq._n);
  else for (const rc of returnedCodes) if (rc === rq._n || rc.startsWith(rq._n)) { ok = true; break; }
  if (!ok) missing.push({ code: rq.code, uuid: rq.uuid, _n: rq._n, entity_type: 'product' });
}
const probeable = missing.filter(m => m.uuid);

out._xd = {
  active: probeable.length > 0,
  origin_domain: dh,
  other_tool: OTHER_TOOL,
  team: TEAM,
  requested: requested.map(r => r.code),
  returned_codes: [...returnedCodes],
  missing,
  probe_entities: probeable.map(m => ({ uuid: m.uuid, entity_type: 'product', code: m.code })),
};
return [{ json: out }];