// ── ONE tool per turn (tool-loop-removal, 2026-08-03) ───────────────────────────
// Emits EXACTLY ONE item, always. The per-tool splitOut + splitInBatches fan-out
// that used to sit between this node and get-results is deleted, so nothing
// downstream serialises multiple items any more: two items here would run the whole
// get-results → compile → send chain twice, i.e. two WhatsApp messages to one
// customer. `return [{ json: … }]` is a one-element literal, so the arity is
// structural — it does not depend on how many embeddings the tool registry holds.
//
// Selection = highest `similarity`, tiebreak `name` ASC (deterministic for
// golden-master). Explicitly NOT the first array element: sub-get-rag's final Code
// node collapses source_id → name and does `map[name].similarity += …`, so the SQL
// best-first insertion order is not provably the maximum once any tool has two
// source_ids.
const rag = $("Execute 'sub-get-rag'").first().json || {};
const raw_tools = Array.isArray(rag.tools) ? rag.tools : [];

// Tolerant read of the entity gate. The previous body did
// `entities.some(e => e.entity_type === 'product')` and THREW when
// compatible_entities was undefined; that throw is deliberately removed here and
// the value is recorded rather than dropped (the old `hasProduct` was dead code).
let has_product = null;
try {
  const entities = $('disallowed-entity-gate').first().json.compatible_entities;
  has_product = Array.isArray(entities)
    ? entities.some(e => e && e.entity_type === 'product')
    : null;
} catch (e) {
  has_product = null;
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const score = (t) => {
  const n = Number(t && t.similarity);
  return Number.isFinite(n) ? n : -Infinity;
};
const label = (t) => String((t && t.name) ?? '');
const sorted = raw_tools
  .slice()
  .sort((a, b) => cmp(score(b), score(a)) || cmp(label(a), label(b)));

const best = sorted[0];
// 0 tools in → 0 items out. Preserves today's behaviour exactly (the old splitOut
// emitted 0 items on an empty tools[] and the loop body never ran). Pre-existing
// dead-end, backlog in UAC §TL-EMPTY — deliberately NOT turned into a throw here.
if (!best) return [];

return [
  {
    json: {
      ...best,
      _tool_pick: {
        chosen: label(best),
        rejected: sorted.slice(1).map(t => ({ name: label(t), similarity: score(t) })),
        count: raw_tools.length,
        has_product,
      },
    },
  },
];
