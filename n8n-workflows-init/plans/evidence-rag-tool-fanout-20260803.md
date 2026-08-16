# EVIDENCE — how many CRM tools does the RAG actually return? (2026-08-03)

Question raised while scoping `cross-domain-stock-incoming` F3/F4: is the per-tool loop ever exercised, or
does RAG only ever yield 1 tool (in which case the loop could be removed)?

**Method:** paged live spine `9qVyfUxmRQqrpGRMDLRuz` executions via REST with `includeData=true`, extracted
`tool-filter` output length, `validator` run count and `domain_hint` per execution.
**Sample:** 231 turns with tool data, `2026-08-02T15:50:44Z` → `2026-08-03T10:35:12Z` (~19h, limited by
execution retention). Raw: `scratchpad/all-tools.tsv`.

## Result

| domain | tools offered | validator runs | n |
|---|---|---|---|
| inventory | **2** | 1 | 123 |
| inventory | **2** | **2** | **12** |
| incoming | 1 | 1 | 44 |
| product_attachment | 1 | 1 | 20 |
| order | 1 | 1 | 15 |
| promotion | 1 | 1 | 9 |
| master_products | 1 | 1 | 5 |
| portal_link | 1 | 1 | 3 |

- **Only `inventory` ever offers more than one tool — and it does so on 135/135 turns**, always the same pair:
  `crm_inventory_stock_balance_list` (sim ≈0.50) + `crm_inventory_warehouses_list` (sim ≈0.46).
- Every other domain (7 of them) offers exactly 1 tool. For those the loop is a no-op.
- The loop only takes a **second** iteration when the first tool returned nothing: 12 of 135 inventory turns.
  That is precisely the miss case `cross-domain-stock-incoming` fires on.
- **In 12/12 of those, the second tool also returned nothing** (`has_result=false`, 0 rows). It has never
  rescued a miss. Execs: `11049139 11046370 11043879 11035684 11020687 11020472 11018614 11018539 11017093
  11013801 11008970 10999199`.

## Why the second tool is offered at all

`sub-get-rag` (`tWP33QOFT7SxThfT`) is a pure pgvector top-k with **no similarity floor**:
```sql
WHERE source_type = $2 AND is_current = true AND source_id LIKE '%' || $4 || '%'
ORDER BY distance ASC LIMIT $3
```
and the spine calls it with **`limit: 5`**. `tool-filter` on the spine is a **dead-code passthrough** — it
computes `entities`/`hasProduct`, ignores them, and returns `raw_tools` verbatim:
```js
// pick incoming tool by scope: product present → by_product; else → shipments (date/general)
const entities = $('disallowed-entity-gate').first().json.compatible_entities
const hasProduct = entities.some(e => e.entity_type === 'product');
var raw_tools = $("Execute 'sub-get-rag'").first().json.tools;
return { "tools": raw_tools }
```
So the inventory domain has 2 registered tools, both clear the (nonexistent) threshold, and both get tried.
`crm_inventory_warehouses_list` **lists warehouses** — it structurally cannot answer a per-product stock
query. Its appearance is a mis-ranked RAG hit, not a designed fallback. That's a stronger argument than the
12/12 sample: it will never rescue a stock miss.

## Bearing on the decisions

- **"Remove the loop"** — the loop is generic multi-tool machinery; the defect is one mis-ranked tool on one
  domain. Removing generic machinery to work around a ranking bug has a wide live blast radius and would
  foreclose multi-tool turns permanently (relevant: the parser-config-registry plan grows the tool registry).
- **Targeted alternative (own diff):** give `tool-filter` an actual filter — a similarity floor, or the
  scope logic its own comment describes. Saves one wasted CRM read on every inventory miss turn. Independent
  of the crossdomain feature.
- **F4 caveat:** if inventory becomes single-tool, F4 becomes unreachable *by upstream coincidence*. Per
  `green-that-cannot-fail`, that is not the same as fixed — the crossdomain block would silently break the
  day any domain gains a second productive tool.

## Evidence limits

19h window, 231 turns, bounded by execution retention. The "inventory always offers 2" claim is safe (a
deterministic ranking over a fixed registry). The "second tool never helps" claim rests on 12/12 plus the
semantic argument above, not on a long history.
