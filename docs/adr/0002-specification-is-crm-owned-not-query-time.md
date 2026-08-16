# Specification is CRM-owned structured data, not query-time derivation

Product specs used for matching (trap type S/P, material, bowl count, class,
dimensions, thickness…) are stored as a **curated CRM Specification layer**,
populated once via a hybrid pipeline (deterministic derivation of clean signals +
LLM draft + human review queue), scoped initially to active sales finish-goods.
The n8n chatbot never derives specs at query time.

This is deliberate and non-obvious: the "-P suffix = P-trap, bare = S-trap"
convention *looks* parseable, but in the real catalog the `-P` suffix collides
with `-P-ENG` / `-PL11` / `-PALSTIC` and trap type is frequently absent from the
description entirely. Encoding that heuristic live in n8n would bake in silent
wrong answers; resolving it once, under review, in the CRM keeps the business logic
authoritative and correctable.

## Consequences

- The feature is **inert until population exists** — population is the critical
  path, a standalone CRM sub-project (schema + enrichment + review UI), not part of
  the chatbot change.
- Spec vocabulary lives in a **Spec Registry** (keys + allowed values) that the
  parser reads to constrain extraction and the CRM search filters against — single
  source of truth, to fold into the design-locked parser-config-registry later.
- Specification writes happen in CRM-land (migrations + enrichment against a CRM
  DB), never through the n8n harness — so the harness zero-egress rule is untouched.

## Amendment 2026-08-04: the conclusion holds, the mechanism was wrong

This ADR assumed specs could be curated **out of the product description**. Measured against
the live catalog, that premise fails. Of 22,366 active products: `single/double/triple bowl`
appears in 110 descriptions (0.5%), a dimension quad carrying thickness in 136 (0.6%), S-trap or
P-trap named in 12. Descriptions average **47 characters** and `product_name` averages **10**
(it is the product code again). The two attributes this ADR names as examples, bowl count and
thickness, are effectively absent from the text.

What the descriptions *do* carry, over 11,584 distinct active codes: mounting (`WALL` 726,
`PEDESTAL` 312, `CONCEALED` 276), WC form (`ONE PIECE` 404, `CLOSE COUPLED` 112), material
(`S/STEEL` 991, `CERAMIC` 489), control type (`MIXER` 958, `PILLAR` 352).

So the population mechanism is amended. In priority order, a spec value comes from:

1. existing structured columns (`dimensions_*` — 61 to 79% filled on sanitaryware classes
   though only 14.6% globally, `is_discontinued`, category, brand),
2. deterministic description mining (mounting, form, material, control type, accessory),
3. **code conventions supervised by existing values** — the rows that already carry a value are
   a free label set, so a per-family rule (`CKS1050` gives 1000 x 500) is scored against them
   and applied only if it reproduces them. The model proposes, the data judges, the human
   confirms **the rule**, roughly 40 to 60 decisions rather than 11,414,
4. nothing. A NULL spec is a correct answer, and is strictly better than a guess: a wrong spec
   actively boosts a wrong candidate, a NULL merely leaves the row to the other ranking legs.

Unchanged by this amendment: specs stay CRM-owned, resolved once under review, never derived at
query time; the Spec Registry stays the single source of vocabulary; the harness rule is
untouched. Also unchanged and now confirmed by measurement: the `-P` collision families
(`-P-ENG`, `-PL11`, `-PALSTIC`) are real, `-P` must be class-gated (`CB5105-P` is a bib tap with
no trap), and `-S` is **not** S-trap (`BRC2112UWP-S` is a package code). S-trap is inferred only
from being the bare twin of a `-P` code, which yields about 100 codes.

`bowl_count` has no machine source at all and is registered inactive until one exists.

See `sorento_crm/documentation/plans/products/PLAN-spec-search.md` section 2 for the full
measurement table.
