// A token whose matches SURVIVED to compatible_entities was not missed — it passed (an ambiguous
// product's variants all get queried on the answer lane; the exact same matches sit in the gate
// output). Without this, a gated turn re-labels the passed product a miss and asks about the wrong
// token ("Couldn't find Srtwc286" while the customer was the miss — measured, exec 13184999).
const _compatKeys = (() => {
  try {
    const g = $('disallowed-entity-gate').first().json ?? {};
    const s = new Set();
    for (const c of (g.compatible_entities ?? [])) {
      if (c && c.uuid) s.add(String(c.uuid));
      if (c && c.code) s.add(String(c.code));
    }
    return s;
  } catch (e) { return new Set(); }
})();
const _passedThrough = (res) => Array.isArray(res?.matches)
  && res.matches.some(m => m && (_compatKeys.has(String(m.uuid)) || _compatKeys.has(String(m.canonical_code))));
let missResolutions = [];
