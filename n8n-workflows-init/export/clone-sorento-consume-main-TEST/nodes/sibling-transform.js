// sibling-transform (PHASE 1) — strict-prefix/boundary family filter over the uncapped
// products-list read. Emits ONE item carrying the sibling family array so sibling-probe
// runs exactly once (batched). PHASE-2 SEAM: union across multiple base codes builds here.
const norm = s => String(s ?? '').trim().toLowerCase();
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const gate = (() => { try { return $('disallowed-entity-gate').first().json ?? {}; } catch (e) { return {}; } })();
const compat = Array.isArray(gate.compatible_entities) ? gate.compatible_entities : [];
// PHASE 1: single base code = the first exactly-resolved product (non-uuid code).
const baseEntity = compat.find(e => e && String(e.entity_type).toLowerCase() === 'product'
  && e.code && !UUID_RE.test(String(e.code)));
const baseCode = baseEntity ? String(baseEntity.code) : '';
const baseN = norm(baseCode);

// products-list response (defensive across container shapes)
const resp = $input.first().json ?? {};
const rows = Array.isArray(resp) ? resp
  : (Array.isArray(resp.data) ? resp.data
  : (Array.isArray(resp.items) ? resp.items
  : (Array.isArray(resp.products) ? resp.products
  : (Array.isArray(resp.results) ? resp.results
  : (resp.data && Array.isArray(resp.data.items) ? resp.data.items : [])))));

// strict family: code === base, OR startsWith(base) with a boundary delimiter or EOS
const BOUNDARY = new Set(['-', '/', ' ']);
const inFamily = (code) => {
  const c = norm(code);
  if (!c || !baseN) return false;
  if (c === baseN) return true;
  if (!c.startsWith(baseN)) return false;
  const next = c.charAt(baseN.length);
  return next === '' || BOUNDARY.has(next);
};

const seen = new Set();
const siblings = [];
for (const row of rows) {
  const code = row && (row.product_code ?? row.code);
  const uuid = row && (row.id ?? row.uuid ?? null);
  if (!code || !inFamily(code)) continue;
  const key = norm(code);
  if (seen.has(key)) continue;
  seen.add(key);
  siblings.push({ uuid: uuid || null, entity_type: 'product', code: String(code) });
}

return [{ json: { siblings, base_codes: baseCode ? [baseCode] : [], sibling_count: siblings.length } }];
