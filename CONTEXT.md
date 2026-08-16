# Sorento Chatbot — Product Description Search

Context for the capability that lets a WhatsApp customer describe a product in
natural language (specs, not codes) and get back the matching Sorento product
code(s). Spans the n8n chatbot spine and the Sorento CRM product master.

## Language

**Master Product**:
A catalog SKU row in the CRM product master — carries `product_code`,
`product_name`, and free-text `description`. The thing a customer ultimately
wants the code for.
_Avoid_: item, SKU (use only when talking about the raw stock-list export).

**Description** (free-text):
The uppercase, abbreviation-heavy human string on a Master Product
(e.g. `SORENTO S/STEEL KITCHEN SINK SRTKS4028B (798X500X220X1.2MM)`). Rich but
noisy — brand-prefixed, inconsistent units, specs embedded inline. Customer
language rarely matches it verbatim.
_Avoid_: name (that's the shorter `product_name`).

**Specification**:
CRM-owned **structured** product attributes, derived/curated once (at ingestion),
distinct from the free-text Description. Trap type (S/P), bowl count, thickness,
product class, dimensions, etc. Business logic that resolves messy conventions
lives HERE, in the CRM — never re-evaluated per query in n8n.
_Avoid_: attribute bag, metadata.
**Amended 2026-08-04:** the attributes listed above were aspirational. Measurement of the live
catalog shows **bowl count** (110 of 22,366 descriptions) and **thickness** (136) are absent
from the source data, so neither is a v1 attribute; `bowl_count` is registered inactive until a
source exists. The v1 attributes that do have a real source are class, brand, mounting, WC form,
material, finish, dimensions, control type, trap type, plus the thinner keys measured present.
Specs are populated from existing columns, deterministic description mining, and code
conventions supervised by existing values — not from description curation. See
`docs/adr/0002` (amended) and `sorento_crm/documentation/plans/products/PLAN-spec-search.md`.

**Trap type**:
A Specification attribute: S-trap vs P-trap. Encoded in the wild via a code
convention (`-P` suffix = P-trap, bare counterpart = S-trap) that is **too dirty
to parse at query time** (collides with `-P-ENG`, `-PL11`, `-PALSTIC`; often
absent from Description entirely). Resolved to a clean stored value in the CRM
Specification, not derived live.

**Candidate**:
One ranked {code, description, in-stock?} row the bot offers the customer in the
did-you-mean picker. The feature returns top-N Candidates for the customer to
confirm; it does NOT auto-commit a single code.

**Spec Registry**:
The CRM-owned enumeration of which Specification keys exist and their allowed
values (material, trap_type S/P, length, thickness, width, radius, bowl_count,
class…). Single source of truth: the parser reads it to know the spec vocabulary
to extract against, and the CRM search filters against the same vocab. Plugs into
the existing parser-config registry (`GET /agent-config`, redis-cached, rendered
into the parser prompt) — see `n8n-workflows-init/plans/parser-config-registry-plan.md`.
_Avoid_: spec list, taxonomy (reserve "taxonomy" for domain/intent/entity).

**Spec extraction**:
The parser step that maps the customer phrase onto Spec Registry keys+values.
MUST be evidence-bound: only emit a spec the customer actually referenced — never
echo the registry back. Over-extraction (emitting the same specs every turn
because the registry always offers them) is the primary failure mode to guard.

**Miss discriminator**:
On a resolve-entity miss, the branch chooser. A **code miss** (customer gave a
real-but-unfound code) → the existing alternative/sibling-picker path, unchanged.
A **description miss** (specs/free-terms, no usable code) → Spec search. Decided by
the parser's code-attempt-vs-descriptive tag, backstopped by a deterministic
code-shape regex to guard LLM misclassification.

**Spec search** (the feature):
An **entity-resolution fallback**, NOT a new domain. When resolve-entity fails to
match a product by code/name (a **description miss**), the CRM runs a **soft weighted rank** (no hard excludes)
over Master Products by spec-match + numeric-closeness + trigram(description, free
terms), returns top-N Candidates. The customer picks one; the flow resumes the
domain they originally intended — **master-products / product-info** ("give me
the code for a 1.2mm kitchen sink") OR **stock-check** ("do you have … in
stock"). Candidate always carries code+description; in-stock is annotated too
(essential for stock intent, harmless for a code lookup). Slots into the existing
resolve-miss → did-you-mean picker machinery (see suggest-on-miss-plan,
query-forward-sibling-picker-plan).
**Amended 2026-08-04:** v1 allows exactly ONE resumed domain, **master_products**, via a domain
allowlist. Measured consequence: 63 of the 67 descriptive messages in the 3,195-message corpus
are promotion-scoped ("any cabana kitchen sink promo"), so v1 fires rarely on real traffic;
enabling `promotion` / `inventory` / `incoming` is one allowlist entry each, gated on its own UAC
cases. Also: discontinued products are **shown, never filtered** (2,721 of 11,584 codes are
flagged) — the Candidate carries `is_discontinued` and n8n labels it, a display-only annotation.

**Relevance floor**:
The minimum top-Candidate score below which Spec search shows NO candidates and
instead falls through to the existing escalate/clarify path ("share a code, model
name, or photo"). Stops the never-empty soft-rank from surfacing confidently-wrong
Candidates.

**Search scope**:
The product universe Spec search ranks over = the SAME company/access scope
today's product reads apply (`contact_id` + `space_id` + `access_levels`). Brand
is a rankable attribute, never a filter — every brand in the master is
Sorento-sellable.

**Rule family**:
A (brand, class) pair, e.g. (Cabana, Kitchen Sink), which is the unit a **Derivation rule** and
its human review apply to. Roughly 40 to 60 families cover the catalog, which is why review is
per family and not per product.
_Avoid_: category (that's the raw `category_code` row), group.

**Derivation rule**:
A machine-applicable pattern over `product_code` (a regex plus a per-capture-group transform)
that produces a Specification value for a whole **Rule family**. A rule is never trusted on
proposal: it is scored against the rows in the family that ALREADY carry the value, and applied
only if it reproduces them above an accuracy bar. Everything a rule writes is reversible by its
rule id. The model proposes, the data judges, the human confirms.
_Avoid_: heuristic, mapping.

**Rendered spec sentence**:
The code-free natural-language sentence built ONLY from a product's Specification values plus
class and brand ("Sorento kitchen sink. Stainless steel. Wall mounted. 1000 x 500 x 140 mm."),
embedded as its own `product_spec` source type and the ONLY text **Spec search** matches at
query time. Never a copy of the Description, and it contains no product code by construction,
which is what keeps the code-only product resolution rule intact.
_Avoid_: search blob, indexed description.

## Flagged ambiguities

_(none open)_

## Example dialogue

**Customer:** kitchen sink 1.2mm double bowl, give me the product code

**Parser** (against the Spec Registry) extracts, each with evidence:
`{thickness: 1.2mm, evidence:"1.2mm"}`, `{bowl_count: 2, evidence:"double bowl"}`,
free-terms: `"kitchen sink"`. Evidence gate confirms each substring is in the
message — nothing phantom slips through.

resolve-entity finds no code/name → **description miss** → Spec search. CRM
soft-ranks Master Products (scope-filtered): bowl_count + thickness closeness +
`trigram(description, "kitchen sink")`. Top score clears the **relevance floor**.

**Bot:** Found these — which one?
1. `SPSRTKS6020` — SORENTO KITCHEN SINK 540x440x220x1.2mm (in stock: 80)
2. `SRTKS4028B` — SORENTO S/STEEL KITCHEN SINK (798X500X220X1.2MM) (in stock: 12)
3. `SZS-8801` — SIGNATURE S/STEEL KITCHEN SINK 2T (825X455X220X1.2MM) (in stock: 0)

Customer picks 1 → flow resumes the **master-products / product-info** domain
(here, just returning the code). Had they asked "do you have…", it resumes
**stock-check** instead — same fallback, different resumed domain.
