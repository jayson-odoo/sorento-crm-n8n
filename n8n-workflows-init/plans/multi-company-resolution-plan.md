# Change A: `multi-company-resolution` — surface the company, group the candidate list

**Scope tag (n8n half): `deterministic`** (plan §8 — Code-node rendering + gate logic; the parser is
pinned via `mock_reformulator_output`, `resolve-entity` runs real/read-only).
**Build target: the clone `txiPzSxy3Pclsz6v` ONLY.** Promotion is user-gated and out of scope.
**UAC family: `§MC`** (`tests/uac/MC.md`).
**CRM half is SPEC ONLY** — `/Users/tehjayson/Documents/foundryx/sorento_crm` is read-only from this
repo. Nothing in §2 may be implemented from here.

Export baseline for every line number in this document, verified
`python3 n8n-workflows-init/scripts/export-workflows.py --verify` on 2026-08-07:
live spine **`f9205b03`**, clone **`3a196c44`**, `sub-semantic-parser` `8a813ddc`,
`sub-get-results` `61b65e5f`, `sub-get-results-TEST` `da0644da`.

> 🚩 **Live has drifted three times in one day from other people's work.** Re-run `--verify` and
> re-derive every line number before acting on this document.

Builds directly on `dym-probe-before-offer` (plan `dym-probe-before-offer-plan.md`, review
`tests/reviews/dym-probe-before-offer.md` §9 — APPROVE, clone `3a196c44`, live `f9205b03`,
promote **held by the user pending this decision**).

---

## 0. TL;DR — the primary defect is NOT the one this change was scoped around

> 🔴 **REFRAMED 2026-08-07, after the CRM trace landed.** This change was briefed as a display problem.
> It is not. Read §0 before §1.

1. **🔴 `entity_resolver.py`'s raw-SQL probes are a multi-tenant isolation leak.** Company isolation is a
   session-level `do_orm_execute` interceptor that **short-circuits at `if not state.is_select` for a
   `TextClause`**. Every raw `text()` probe in the resolver — trgm product, customer, order, promotion,
   transporter; the tier-3 embedding lookup; the variant graph; RAG phrase resolution — runs with **no
   company predicate at all**, for any caller, regardless of grants. §2.2.
2. **The twin that started all of this is that leak, not entitled data.** Exec `11471806`'s two
   `MWC7625-SH-S10` rows are both under **`alternatives`**, both `match_tier: "trgm"` — the unscoped raw
   path. Combined with `UNIQUE(company_id, product_code)`, identical `product_code` under two uuids means
   two `company_id`s. **It was another company's product, surfaced to a contact who may hold no grant on
   it.** §1.3.
3. **Ordinary ORM probes ARE scoped — my earlier framing was wrong, do not inherit it.** `_probe_product`
   selects no `company_id` *column*, but SQLAlchemy 2.0.45 honours `with_loader_criteria` for
   column-tuple selects (`_ORMColumnEntity.setup_compile_state` → `extra_criteria_entities` →
   `_adjust_for_extra_criteria`), so `db.query(Product.id, Product.product_code, …)` **is** filtered.
   The leak is the `text()` path only. §2.2.
4. **The contact→company model is ALREADY one-to-many.** No data-model change.
   `respond_contact_companies` is a real M2M with `UNIQUE(respond_contact_id, company_id)`; the scope
   resolver returns a **`List[str]`** that becomes `company_id IN (…)`. §2.1.
5. **Grouping is still wanted, but it is now the SECOND change, not the fix.** With the fuzzy path
   scoped, a same-code twin can only reach a customer when the contact genuinely holds both grants —
   which the user has confirmed happens. §3.
6. **The display defect is OBSERVED, not predicted.** Production log, 2026-08-05, twice:
   ```
   incoming search needs to be more specific. Multiple matches found — please choose:
   1. MWCX8609-RL-S10 — has incoming
   2. MWCX8609-RL-S10 — has incoming
   ```
   Frequency: **2 of 132** numbered candidate lists in `n8n_test.chat_histories` (ids `9151509`,
   `9151511`). ⚠️ **Which bucket those twins came from is NOT established** — see §1.2's open item; if
   they came from `matches` they are a dual-grant case, if from an unscoped probe they are the leak
   again, and the two imply different amounts of remaining work.
7. **`multi_uuid_code` is NOT an offer exclusion and therefore cannot be "retired".** It only
   suppresses the has/no **suffix**; the code still renders. Verified in production output
   (`chat_histories` id `9151571`, §1.3). What actually hides the twin is a *different* line:
   `tokenCandidates()` dedups by `canonical_code`. §3.4.

---

## 1. The problem, measured

### 1.1 The schema invariant (do not re-derive)

`sorento_crm_backend/app/models/product.py:182` —
`Index("uq_products_company_product_code", "company_id", "product_code", unique=True)`.
Product code is unique **per company**. One code under two uuids is **two companies' products**, by
schema invariant (LESSONS §61c).

`Product` is `class Product(Base, CompanyScopedMixin)` (`product.py:94`); `company_id` is declared on the
mixin (`app/models/base.py:120-127`) as ORM-`nullable=True` but **Postgres `NOT NULL`** for `products`
(migration `305_company_composite_unique.py:88,152`) — an intentional divergence documented at
`base.py:105-115`.

### 1.2 Surface 1 — the require-specific picker renders two identical lines (OBSERVED)

`disallowed-entity-gate.js:205-209` (byte-identical live and clone):

```js
const flatLabels = specific_options.flatMap(o => o.candidates.map(c => c.label));
const numbered = flatLabels.map((l, i) => `${i + 1}. ${l}`).join('\n');
gate_clarification =
  `${domain} search needs to be more specific. Multiple matches found — please choose:\n${numbered}`;
```

`label` is `m.canonical_code || m.display?.product_name || m.uuid` (`:140`, `:163`). Cross-company twins
share both the code and the product name, so both labels are the same string.

How the twins get there: when the user types the code **exactly**, `prodExacts` contains **both** twins,
so `prodExacts.length === 1` is false and control falls to `products.length > 1` → `specific_options`
(`:155-166`, AND-mode; `:121-133`, OR-mode). This is structurally forced, and it is what the two
production rows show.

Note what is *not* broken: `compatible_entities = entities.filter(e => optUuids.has(e.uuid))` (`:216-217`)
keeps both uuids, and the numeric pick resolves by uuid. **The pick is sound; only the display is
unusable.**

> ⚠️ **OPEN — which bucket fed this picker?** `specific_options` is built from `r.matches` (OR-mode) or
> `resolver.intersection` (AND-mode), **not** from `alternatives`. So unlike §1.3's D1 case, these twins
> did **not** arrive via the trgm alternatives path. Either (a) the contact genuinely holds both grants
> and this is a real dual-grant display defect, or (b) a *prefix*-tier probe on this path is also raw
> SQL and unscoped. **Not established.** §5-MC-V2b pulls the execution behind `chat_histories`
> `9151509`/`9151511` and records the bucket, the tier and the two uuids. Until it does, do not cite
> this observation as evidence for either the leak or the dual-grant case.

### 1.3 Surface 2 — D1 drops the twin entirely, and the survivor renders bare

Live clone exec **`11471806`** (`txiPzSxy3Pclsz6v`, 2026-08-06T17:56), token `mwc7625-sh-s11`:
`resolve-entity` returned `MWC7625-SH-S10` **twice** — uuids `0f2fe976-c76c-417a-a7ce-e2ca7b6ad1b8`
and `a7dfc428-f106-4367-8a59-3be98d2510e4`, both `match_tier:"trgm"`, both `similarity: 0.75`, both
`display:{product_name:"MWC7625-SH-S10", is_variant:false}`. **No company field anywhere in the payload.**

**Both rows are under `alternatives`, both `match_tier: "trgm"`** (settled by pulling the execution
2026-08-07). That is the unscoped raw-SQL path (§2.2). Two corroborating facts make the company
inference airtight: pg `similarity()` is a pure string function, so an identical `0.75` twice means
**byte-identical `product_code`**; and `UNIQUE(company_id, product_code)` then forces **different
`company_id`**. Additionally, the OR-mode alternatives path (`entity_resolver.py:3722-3733`) does **no**
dedupe by `canonical_code`, unlike the AND-mode path (`:3413-3420`) — which is why both twins survived
into the payload at all.

`tokenCandidates()` (`build-suggest-offer.js:147-161`) dedups on `canonical_code` (`:157`), so the second
uuid is discarded and **arrival order decides which company the rendered line represents**.

Post-`dym-probe-before-offer`, the shipped `multi_uuid_code` guard then suppresses the suffix. Production
output, `chat_histories` id `9151571` (2026-08-07T01:24):

```
Couldn't find "MWC7625-SH-S100". Did you mean:
1. MWC7625-SH-S10
2. MWC7625-SH-S12 — no certificate
3. MWC7625-SH-P — no certificate
Reply with a code to continue, or would you like me to escalate to purchasing_certification team?
```

Line 1 — the **closest** match, the one the customer is most likely to want — is the only line carrying
no information. That is the shipped behaviour working exactly as designed, and it is why the user is
asking for something better.

### 1.4 What this does to the F-DUPE premise

`dym-probe-before-offer-plan.md` §8b reasoned:

> "Both probe tools are company-scoped, so the twin returns zero rows … the annotation would read
> `— no <noun>`: true of the other company's product, printed where the customer reads their own."

**The conclusion was right and the mechanism was wrong** — which matters, because the mechanism is what
tells you when the guard stops being needed. The twin returns zero rows not because the *contact* is
scoped to one company, but because the **probe** is scoped (MCP data tools honour
`contact_id`/`space_id`) while the **resolver's fuzzy path is not scoped at all**. The guard was
compensating, in n8n, for a CRM isolation leak.

Two consequences:

- Once §2.2's fix lands, a same-code twin can only reach a customer when the contact genuinely holds
  **both** grants — the case the user has now confirmed is real. In that case both twins are entitled
  data and both *would* return probe rows, so the guard's original justification no longer applies.
- It still cannot be dropped, for a different reason: the probe's render envelope carries no company, so
  the annotation cannot be attributed per company. §3.5.

---

## 2. CRM half — SPEC ONLY (`/Users/tehjayson/Documents/foundryx/sorento_crm`, read-only from here)

### 2.1 Contact → company is one-to-many TODAY. Nothing to build. ✅

| fact | evidence |
|---|---|
| M2M table exists | `sorento_crm_backend/app/models/company.py:57` `RespondContactCompany`, `__tablename__ = "respond_contact_companies"` |
| N companies per contact is legal | `UniqueConstraint("respond_contact_id", "company_id", …)` (`company.py:66-69`) — on the **pair**, not on the contact |
| `RespondContact` has NO `company_id` | `app/models/access.py:143-155`; the only `ALTER TABLE respond_contacts ADD COLUMN` in the whole `alembic/versions` tree is `portal_slug` (`224_portal_slug_device_trust.py:33`) |
| created by | `alembic/versions/302_multi_company_scaffold.py:93-114` (`revision = "302_multi_company"`), backfilling **one** row per contact to the Sorento default id (`:204-215`) |
| resolver returns a LIST | `app/services/contact_access_type_service.py:342` `resolve_contact_company_ids(respond_io_id, space_id) -> List[str]` |
| becomes a set predicate | `app/services/company_scope_resolver.py:191-202` → `frozenset(company_ids)`; `app/services/company_scope.py:15-19` → `company_id IN (ids)` |
| write side is replace-all | `app/services/contact_service.py:270` `set_contact_companies(contact_id, company_ids: list[str])`; FE multi-select `ContactEditDialog.tsx:329-348`, field `company_ids`, superadmin-gated |
| the AC-F7 plural is implemented | `sorento_crm_mcp/sorento_crm_mcp/server.py:89-102`; ~20 `ToolSpec`s carry the same "that contact's company/companies" text (e.g. `catalog.py:58-59`) |

**Answer to the brief's question 2: it is already one-to-many. It is NOT a data-model change.** The
probe already scopes to **all** of the contact's companies.

`space_id` is **not** a company axis: it is the Respond.io workspace id, `String(64)`, non-unique
(`app/models/respond_workspace.py:27,67`), with **no FK to `companies` in either direction**. It is the
disambiguator half of the contact identity key `(respond_io_id, workspace.space_id)`. Note that n8n
hardcodes it: `space_id: "364817"` appears as a literal in every spine `semantic_input` expression and in
the `resolve-entity` / `check-access` / `get-access-types` URLs. Correct today; a second workspace would
break it silently. **Filed, not bundled.**

**Gap to close (CRM tests):** `sorento_crm_backend/tests/test_mcp_scope_resolver.py` covers the
Mocha-only case (`:122`) and both fail-closed cases (`:131`, `:137`) but **no test asserts the union** —
a contact in both companies yielding a two-element frozenset. AC-F2 of
`documentation/plans/UAC-multi-company-isolation.md` specifies it. Add that test.

### 2.2 🔴 A-0 — SECURITY: the resolver's raw-SQL probes bypass company isolation entirely

**This is the first deliverable of Change A and it outranks everything else in this document.**

Company isolation is a single session-level interceptor:

- `app/main.py:172-178` — `app.include_router(api_router, prefix="/api/v1", dependencies=[Depends(apply_company_scope)])`
- `app/services/company_scope_resolver.py:296-313` — `apply_company_scope` → `set_company_scope(db, scope)`
- `app/services/company_scope.py:15-19` — `do_orm_execute` stamps `company_id IN (…)` on
  `CompanyScopedMixin` models

**What IS covered — correcting my own earlier framing.** `_probe_product` (`entity_resolver.py:681-712`)
selects a **column tuple**, not an entity:

```python
    rows = (
        db.query(Product.id, Product.product_code, Product.product_name, Product.is_active)
        .filter(_ws_insensitive_lower(Product.product_code).in_(list(norm_to_token.keys())))
        .all()
    )
```

The obvious worry — that `with_loader_criteria` skips column-tuple selects — was traced through
SQLAlchemy 2.0.45 and **refuted**: `_ORMColumnEntity.setup_compile_state` registers the entity in
`extra_criteria_entities`, and `_adjust_for_extra_criteria` applies the predicate. **Column-tuple ORM
selects are scoped.** The change request's premise that `_probe_product` "applies no company filter" is
wrong at the level that matters; do not inherit it.

**What is NOT covered.** `do_orm_execute` short-circuits at `if not state.is_select` for a `TextClause`,
so **every raw `text()` probe in `entity_resolver.py` runs unscoped**:

| site | what it leaks |
|---|---|
| `:2483-2501` `_trgm_lookup` product probe — `FROM products WHERE product_code % :p` | **other companies' product codes and names** |
| `:2523` trgm customer probe | customer names |
| `:2559` trgm order probe | order numbers |
| `:2595` trgm promotion probe | promotion names |
| `:2627`, `:2660` trgm transporter probes | transporter names |
| `:2383-2396` `_tier3_embedding_lookup` | whatever the embedding index spans |
| `:2787` variant-graph lookup | variant relations |
| `:3874` `_rag_resolve_phrase` | phrase-resolved entities |

`grep -n "company" entity_resolver.py` returns **two** hits, both regex stopword lists (`:251`, `:277`).
The module has no company handling of any kind.

**The smoking gun that this is a missed gap-closure, not a design decision:** the repo already ships
`app/services/company_scope_sql.py:25` `company_sql_predicate`, and it is already used by
`variant_link_service.py` and `marketing_service.py`. `entity_resolver.py` **never imports it**. And
`tests/test_raw_sql_company_scope.py:3` states the gap outright: *"The central `do_orm_execute` filter
only covers ORM SELECTs."* The resolver was simply missed in that wave.

**Failure mode in production, and why it is worse than it looks:** exact-code lookups are scoped and
fuzzy suggestions are not. So a contact typing an exact code gets nothing for another company's
product — correct — while the **did-you-mean list built from the fuzzy path happily suggests it**, and a
customer who then picks it is routed at a product they hold no grant on. Cross-tenant disclosure via the
suggestion surface, invisible from the exact-lookup surface.

**A-0, the spec:** apply `company_sql_predicate` (`company_scope_sql.py:25`) at **every** raw `text()`
site listed above. Follow the shape already used in `variant_link_service.py` / `marketing_service.py`
rather than inventing a second idiom. Add a regression test in the style of
`tests/test_raw_sql_company_scope.py` covering at minimum the trgm product probe, plus a test pinning
the **column-tuple** ORM case, which no test covers today
(`tests/test_company_scope.py:142-166` only exercises whole-entity `db.query(model)`) — the
SQLAlchemy-source argument above is sound but currently **unpinned**.

### 2.2b 🚩 OPEN QUESTION FOR THE USER — which API key does n8n present?

`_resolve_api_key_scope` (`company_scope_resolver.py:191-202`) reads `contact_id`/`space_id` from
**query params**, which is where n8n puts them even on the POST route — good. But `_api_key_valid`
hmac-compares against a **single legacy** `settings.external_api_key`, while route authentication goes
through `IntegrationKeyService.resolve` (a hash lookup over per-integration keys).

**If n8n presents a per-integration key that is not the legacy value, the route authenticates fine while
the scope falls to `UNSET`.** `UNSET` maps to `false()` (`app/models/base.py:52-57`), i.e. **0 rows**, on
every ORM path — so exact-code resolution would go silently dead while fuzzy suggestions kept flowing
from every company. That is a specific, checkable, and quite bad silent-partial-scoping mode.

Settling it needs an environment value not readable from this repo. **Carry as a question for the
user / CRM operator**, and treat it as a gate on A-0 being *sufficient*: fixing the raw-SQL sites does
not help if the scope resolves to `UNSET` in the first place.

### 2.3 A-1 — surface the company on resolver matches (the actual CRM ask)

**Recommended shape: put it in the existing free-form `display` dict.** Cheapest and non-breaking.

Why `display` and not a top-level key — `ResolutionResult.as_dict` (`entity_resolver.py:600-637`) is a
**hand-written 7-key whitelist** per match (`entity_type`, `canonical_code`, `uuid`, `match_field`,
`match_tier`, `similarity`, `display`). A new top-level field on `ResolvedEntity`
(`entity_resolver.py:474-484`) would be **silently dropped** unless five projections are edited in
lockstep: `ResolutionResult.as_dict` `matches` (`:611-618`) **and** `alternatives` (`:623-630`),
`IntersectionResolutionResult.as_dict` (`:3303`), and the four hand-rolled match builders in
`app/api/v1/system/references.py` (`:164-181`, `:336-350`, `:381-396`, `:439-453`, `:544-562`).
`display` is already free-form, already whitelisted, and already what n8n reads for labels
(`disallowed-entity-gate.js:140` reads `m.display?.product_name`).

**Change, phase 1 — products only:**

| file | change |
|---|---|
| `app/services/entity_resolver.py:681-712` `_probe_product` | add `Product.company_id` to the SELECT, `.outerjoin(Company, Company.id == Product.company_id)` for `Company.name`, extend the positional unpack, and emit `display={"product_name": name, "is_active": bool(is_active), "company_id": str(cid) if cid else None, "company_name": cname}` |
| same, `_prefix_probe_product` (in the `:1495-2300` family) | same |
| same, `_and_probe_product` (in the `:2963-3285` family) | same |
| `app/api/v1/system/references.py` | the 4 synthesizers listed above emit product matches too — add the same two `display` keys or they render company-less inconsistently |

**Do NOT** blanket-edit all ~39 probes. Only `product` has a per-company uniqueness collision that
reaches a customer-facing list. Certificates and attachments can follow if a collision is ever observed.

**Response-contract risk: none.**
- Neither `/resolve` route declares `response_model` (`references.py:1388` GET, `:1476` POST); both
  return the raw dict from `_resolve_input`.
- No `extra="forbid"` anywhere on this path (the backend's only one is
  `app/schemas/canonical_masters.py:27`, unrelated).
- `_apply_limit` (`references.py:251-283`) copies with `dict(tr)` — new keys survive truncation.
- Resolve is **not** an MCP tool, so no MCP keep-list/drop-list applies.
- No existing test asserts an exact key set on a match. Shape tests:
  `tests/test_entity_resolver_trgm.py:256-277`, `tests/test_certificate_resolver.py`,
  `tests/test_resolve_domain_alias.py`.

**Migration impact: none.** No schema change; `companies.name` already exists (`company.py:21-33`).

### 2.4 A-4 — the render envelope (phase 2, and the honest reason it is needed)

The brief asks whether `presenters.py` needs company too. **Yes — but only for phase 2.**

`_product_attachments` (`sorento_crm_mcp/sorento_crm_mcp/presenters.py:438-475`) emits per item:
`Product Code`, `Product Name`, `Description`, `Dimensions`, `Attachment Type`, `File Name`,
`Certificate Number`, `Valid Until`, `Validity` — and **no product uuid and no company**. `_stock` is the
same shape.

Consequence: `dym-annotate` keys its has/no annotation on the **code string**. For a code that exists in
two companies it cannot attribute a probe row back to one of them. So **grouping alone cannot restore the
suffix for a duplicated code** — the suffix stays suppressed (§3.5).

To unlock per-company annotation, add a `Company` field to `_product_attachments` and `_stock` items.
That is additive to a `view=render` envelope with no `response_model`, and `dym-annotate` would then key
on `(code, company)`. **Phase 2. Do not bundle** — it changes the shape every rendered answer carries.

### 2.5 CRM work order (Change A) — A-0 first, and it is a security fix

| step | what | blocking? |
|---|---|---|
| **A-0** 🔴 | **SECURITY.** `company_sql_predicate` into every raw `text()` site in `entity_resolver.py` (§2.2), + a raw-SQL scope regression test + a column-tuple ORM scope test. **Ship this first, on its own, as a security fix.** | 🔴 **blocks the n8n grouping promote** |
| **A-0b** 🚩 | Answer §2.2b — which API key does n8n present? If the scope resolves to `UNSET`, A-0 is necessary but not sufficient. **User/operator question.** | 🔴 |
| **A-1** | company_id + company_name into `display` on the 3 product probes + the 4 `references.py` synthesizers (§2.3) | blocks grouping becoming *visible* — not its landing |
| **A-2** | add the missing **union** test to `tests/test_mcp_scope_resolver.py` (§2.1) | no |
| **A-3** | de-dupe the OR-mode `alternatives` path by `canonical_code` to match AND-mode (`entity_resolver.py:3722-3733` vs `:3413-3420`) — **decide, do not assume**: after A-0 a surviving twin is a genuine dual-grant case and dedupe would hide it. Likely **do not** dedupe; record the decision. | no |
| **A-4** | `Company` field in `presenters.py` `_product_attachments` / `_stock` | phase 2 |

---

## 3. n8n half — group the candidate list by company

### 3.1 The fail-open contract (this is what makes the sequencing safe)

**Grouping activates only when every candidate carries a non-null company AND ≥2 distinct companies are
present.** Otherwise every renderer is **byte-identical to today**.

Before A-1 ships, `display.company_name` is `undefined` on every match, so the whole change is
**structurally inert**. That is the answer to the brief's sequencing question: **the n8n change may land
and be promoted before the CRM A-1 change, dark.** Same posture as the pending-allocation badge (memory
`alloc-badge-phase-c`). §MC-10 is the byte-identity gate that proves it.

🔴 **But NOT before A-0.** Grouping takes a candidate list and labels each entry with the company it
belongs to, prominently. Doing that on top of an unscoped fuzzy path would *format and advertise* the
leak — turning an accidental cross-tenant disclosure into a labelled one. **A-0 gates the grouping
promote even though the grouping code is inert without A-1.**

### 3.2 Where the company enters n8n

One read, in one shape, everywhere:

```js
const _coOf = (m) => {
  const d = (m && m.display) || {};
  const n = d.company_name ?? m.company_name ?? null;
  return (typeof n === 'string' && n.trim()) ? n.trim() : null;
};
```

`resolve-entity` already sends `?contact_id={{…findcontact….id}}&space_id=364817`
(live spine `resolve-entity` node, `url`), so **no n8n change is needed to make the CRM scope-aware.**

### 3.3 Renderer census — by RENDERED STRING, not by graph inbound (LESSONS §63)

`grep -rnE '\$\{i *\+ *1\}\.|\$\{idx\}\.' export/clone-sorento-consume-main-TEST/nodes/*.js` — the
complete set of numbered candidate renderers on this spine:

| # | node:line | list | source of candidates | company-grouped? |
|---|---|---|---|---|
| R1 | `build-suggest-offer.js:348` | D1 single-token **code mode** | resolver `matches`/`alternatives` | ✅ headers |
| R2 | `build-suggest-offer.js:301` | D1 single-token **numbered mode** | resolver | ✅ headers |
| R3 | `build-suggest-offer.js:259` | D1 **multi-token** | resolver, per token | ✅ `(Company)` suffix |
| R4 | `compile-current-state.js:399` | partial-resolution | resolver, per token | ✅ `(Company)` suffix |
| R5 | `disallowed-entity-gate.js:207` | require-specific picker | resolver `specific_options` | ✅ headers — **the observed defect** |
| R6 | `annotate-incoming-picker.js:22` | annotates R5's text | — (regex over R5) | inherits R5 |
| R7 | `build-suggest-offer.js:93` | D3 sibling picker | `family-fetch` → a **company-scoped tool** | ❌ single-company by construction — **asserted, §MC-11** |
| R8 | `build-suggest-offer.js:475` | D2 alternatives | the **domain tool's** `alternatives[]` — company-scoped | ❌ same — **asserted, §MC-11** |
| R9 | `build-cs-member-offer.js:22` | CS member roster | people | ❌ **considered and excluded** — people have no company axis in this sense |

> The brief said "all four annotated surfaces". That set is the *dym-probe annotation* coverage. The set
> that can show a cross-company twin is different and larger: **R1–R6**. R7/R8 are excluded by argument
> (their candidates come back from a company-scoped tool, so they are already one company) — and that
> argument is **asserted in §MC-11, not assumed**, because the same class of assumption produced three
> defects in the previous change (`dym-probe-before-offer-plan.md` §8d).

### 3.4 The line that actually hides the twin

`tokenCandidates()` (`build-suggest-offer.js:157`, and its byte-copies in `dym-transform.js:86` and
`compile-current-state.js:325`) dedups on `canonical_code`:

```js
if (seen.has(code)) continue;
seen.add(code); keep.push(m);
```

**Change:** dedup on `code + ' ' + (company ?? '')` **when every candidate in the accumulator has a
company**; otherwise dedup on `code` exactly as today. Both twins then survive into `picks`.

⚠️ **Cost, recorded rather than hidden:** `cap3` is applied after this, so a surviving twin consumes one
of the three slots and can push out a genuinely different product. Measured exposure: **2 of 132**
numbered lists (§1.2). Accepted for phase 1; re-measure after a week of real traffic (§7).

⚠️ **`parity.js` invariant 1** (`tests/offline/dym-probe-before-offer/parity.js`) asserts
`build-suggest-offer`'s `tokenCandidates` is byte-identical to `dym-transform`'s copy. **The dedup edit
must be applied to BOTH copies identically, and `parity.js` must be re-run** — it is the single most
likely thing to break at this step (review §9.5 D12).

### 3.5 What happens to the has/no suffix

For a code that appears under two companies, `dym-annotate` cannot attribute a probe row to one of them
(§2.4). So:

- The `multi_uuid_code` guard in `dym-transform.js:266-281` **stays**, with `reason` renamed
  `multi_company_code` and `dym_excluded_codes[]` gaining `company_count`.
- Both twin lines render **bare** (no suffix) until CRM A-4 lands.
- Every non-twin sibling in the same list is still annotated normally.

**This is the correct answer to the brief's item 4 — and the reasoning changed twice, so state it
precisely.** "Retire the exclusion" is not the right move, but *not* for the reason the previous plan
gave.

- **Its original justification is now void.** §8b of the previous plan justified it as "the twin returns
  zero rows because both probe tools are company-scoped". After A-0, a surviving twin means the contact
  holds **both** grants, so both twins would return probe rows. That argument no longer supports the
  guard.
- **A different justification keeps it alive.** The probe's render envelope carries no company and no
  product uuid (§2.4), so a has/no claim cannot be attributed to one of two same-code products. The
  guard refuses to make a claim it cannot attribute — still true, and independent of scoping.
- **What actually hides the twin is §3.4**, not the guard. The guard only suppresses the suffix; the code
  renders either way (verified in production, §1.3).

Net effect of this change on that surface: from "the closest match carries no information and its twin is
invisible" to "the closest match is shown **once per company**, each correctly labelled by company, with
the has/no claim withheld until CRM A-4". Strictly more information, no new claims.

**Retire the guard when A-4 lands**, not before — and rename it now (`multi_company_code`) so the next
reader does not re-derive the void justification from the old name.

### 3.6 Render forms — and why two of them

**Headers** where the list has ONE subject token (R1, R2, R5). **Per-line `(Company)` suffix** where the
list is *already* grouped by token (R3, R4) — nesting company groups inside token groups produces an
unreadable four-level list.

Header form (matching the user's own words, "Sorento 1 2 3, then Mocha 4 5 6"):

```
Couldn't find "MWC7625-SH-S100". Did you mean:
Sorento:
1. MWC7625-SH-S10 - has certificate
2. MWC7625-SH-S12 - no certificate
Mocha:
3. MWC7625-SH-S10
Reply with a number to continue, or would you like me to escalate to purchasing_certification team?
```

Suffix form (R3/R4):

```
"mwc7625-sh-s11" — did you mean:
  1. MWC7625-SH-S10 (Sorento)
  2. MWC7625-SH-S10 (Mocha)
  3. MWC7625-SH-S12 (Sorento) - no certificate
```

Binding rules:
- **Numbering is globally contiguous across groups** — `1,2,3,4,5,6`, never restarting per group.
- **Group order = order of first appearance** in the resolver's ranking. Never alphabetize; that would
  destroy the similarity ranking the same way the rejected `localeCompare` tiebreak would have
  (review §9.2, F-RANK).
- **Interaction with the has-first sort (R1 only):** company grouping is the OUTER partition, has-first
  the INNER one. Sort has-first **within** each company group. `Array.prototype.sort` is stable, so
  resolver order survives inside each `(company, has)` bucket.
- **Header lines must not match** `/^\s*\d+\.\s+(.+?)\s*$/` — the annotation regex in
  `build-suggest-offer.js:222` and `annotate-incoming-picker.js:23`. `Sorento:` does not. Asserted,
  §MC-6.

### 3.7 🔴 The pick round-trip — the one thing that can break the change

| surface | pick mechanism | duplicated code safe? |
|---|---|---|
| R5 picker | number → `compatible_entities` filtered by `optUuids` (`disallowed-entity-gate.js:216-217`); resolved by **uuid** | ✅ already safe — display-only fix |
| R2 numbered mode | number → `suggest_last_result_set[idx]` → `output_exchange` REFERENCE-POSITIONS block resolves `uuid: row.uuid` (`output_exchange.js:552-554`) | ✅ safe |
| R4 partial | number → `dym_last_result_set[idx]` → `dymNumberedMultiSelect` → `applyDymPick(_hit)` with `_hit.uuid` (`output_exchange.js:508-511`) | ✅ safe |
| **R1 code mode** | **bare-code button** → `tryDymPick` → `_cands.find(c => norm(c.code) === _msg)` (`output_exchange.js:236-242`) | 🔴 **NOT safe — first match wins, arbitrary company** |
| R3 multi-token | numbers only (`build-suggest-offer.js:278`) | ✅ safe |

**Required consequence:** when the R1 candidate set contains a code that appears more than once,
`build-suggest-offer` must **switch that offer to numbered mode** — `suggest_quick_reply` becomes
`[...nums, YES, NO]`, the footer becomes "Reply with a number to continue", and
`suggest_last_result_set[i].uuid` carries the discriminator. Otherwise a tapped button is a coin flip
between two companies' products.

**The shipped invariant `suggest_quick_reply[i] === suggest_last_result_set[i].value` is CODE-MODE
ONLY.** In today's numbered mode `suggest_quick_reply` is `"1,2,3,Yes escalate,No it's okay"` while
`suggest_last_result_set[i].value` is the label (`build-suggest-offer.js:305-310`). §DP-11b asserts it
only on code-mode cases. §MC-7 restates it correctly per mode; **do not carry the brief's framing of it
across unchanged.**

`suggest_quick_reply` **never carries a company name, a header, or a suffix** — §MC-7a, with
§MC-FP-2 proving that assertion can go red.

### 3.8 Node/edge diff (by NAME, for the coder)

**No new nodes. No new edges.** Five `jsCode` edits:

| node | edit |
|---|---|
| `disallowed-entity-gate` | carry `company: m.display?.company_name ?? null` into `specific_options[].candidates` at `:138-142` **and** `:161-165`; grouped render at `:205-209`. `compatible_entities` / `optUuids` **untouched**. |
| `build-suggest-offer` | `_coOf` helper; company-aware dedup in `tokenCandidates` (§3.4); grouped render R1 `:343-357` + R2 `:301-306`; suffix render R3 `:255-270`; numbered-mode fallback for duplicated codes (§3.7); R5 annotation regex left byte-identical |
| `dym-transform` | company-aware dedup in its `tokenCandidates` copy (parity, §3.4); `multi_uuid_code` → `multi_company_code`, `dym_excluded_codes[]` gains `company_count` |
| `dym-transform-partial` | identical body to `dym-transform` (parity invariant 3) |
| `compile-current-state` | company-aware dedup in its `tokenCandidates` copy; suffix render R4 `:399` |

Coder rules that bite here:
- ONE `update_workflow` call, ≤100 ops, atomic (LESSONS §33).
- `setNodeParameter` paths are relative to `parameters` — `/jsCode`, never `/parameters/jsCode`
  (LESSONS §32b).
- Target by node **NAME** (LESSONS §58c). Publish the clone afterwards (LESSONS §37).
- Re-run `export-workflows.py`, then **re-run `parity.js`** — three `tokenCandidates` copies now move
  together.

---

## 4. Prerequisites

| id | prerequisite | blocking? |
|---|---|---|
| **P1** 🔴 | **CRM A-0 shipped** — the raw-SQL sites scoped (§2.2). Gates the grouping **promote**; the clone build may proceed. | 🔴 **YES, for promote** |
| **P1b** 🚩 | §2.2b answered — which API key n8n presents. **User/operator question.** | 🔴 YES |
| **P2** | §5-MC-V2 — how many companies is `437264483` granted? After A-0 this decides whether a real dual-company fixture exists at all. | 🔴 YES |
| **P3** | CRM A-1 shipped, or a pinned `fixture-resolve-entity` carrying `display.company_name`, for any case that must show grouping | YES for §MC-1..6 |
| **P4** | Session hygiene: `mode=regress-capture`, `respond_contacts_test` reset between independent cases (LESSONS §31; memory `uac-mode-reads-prod-session`) | YES |
| **P5** | A known cross-company twin code. Confirmed today: `MWC7625-SH-S10`, `MWCX8609-RL-S10`. Re-confirm at test time. | YES |
| **P6** | Partial/ask-for-access contact still **TBD** — not needed by any §MC case; carried forward | no |

---

## 5. Verification tasks (planner-defined) — `§5-MC`

Read-only, run **before** the coder wires anything. Each must print its compared-population count — an
empty checker output is **never** a pass (LESSONS §61).

- **§5-MC-V1 🔴 — A-0 landed and the leak is closed.** After the CRM fix, re-drive the `mwc7625-sh-s11`
  turn and assert `resolutions[].alternatives[]` contains **at most one** `MWC7625-SH-S10` unless
  §5-MC-V2 shows the contact holds both grants. Then assert the same for a **single-grant** contact
  (`457216562` is the no-access contact; use any single-grant contact available) — that one must return
  **exactly one**. Two contacts, opposite expectations: a check that can only pass for the right reason.
  **Print both alternatives arrays.**
- **§5-MC-V2 — how many companies is `437264483` granted?** Read-only. Note the join is on the
  **internal** `respond_contacts.id`, not `respond_io_id`, and no endpoint is keyed by `respond_io_id`
  (both existing contact endpoints are superadmin-JWT-gated), so SQL is the practical route:
  ```sql
  SELECT c.name
  FROM respond_contact_companies rcc
  JOIN respond_contacts rc ON rc.id = rcc.respond_contact_id
  JOIN companies c        ON c.id = rcc.company_id
  WHERE rc.respond_io_id = '437264483';
  ```
  **Print the count and the names.** `1` ⇒ no dual-grant fixture exists on this contact and §MC-1..6 must
  run pinned. `≥2` ⇒ real fixture.
- **§5-MC-V2b 🚩 — settle §1.2's open item.** Pull the execution behind `chat_histories` `9151509` /
  `9151511` (2026-08-05, `MWCX8609-RL-S10`) and record, for each twin: which bucket (`matches` /
  `intersection` / `alternatives`), which `match_tier`, and both uuids. **`matches`/`intersection` ⇒
  dual-grant display defect. A trgm/embedding tier ⇒ the leak reached the picker too, and A-0's test
  matrix must cover that path.** If the execution has aged out, say so and re-drive the turn rather than
  inferring.
- **§5-MC-V3 — is there a real dual-company twin to test with?** Call
  `crm_master_products_list` (read-only, via MCP) with `contact_id=437264483&space_id=364817` and
  `query=MWC7625-SH-S10`. Assert ≥2 rows with distinct ids. **This is the fixture for §MC-1..6.**
  Zero or one row ⇒ every grouping case must run on a **pinned** `fixture-resolve-entity`, and that
  must be stated on each case rather than silently substituted.
- **§5-MC-V4 — company name is actually present on a match.** After CRM A-1, run one real
  `resolve-entity` turn and assert `resolutions[].matches[].display.company_name` is a non-empty string
  on ≥1 product match. **Print the full match.** Fail ⇒ every §MC grouping case is N/A, not
  skipped-green; the inert path (§MC-10) is what ships.
- **§5-MC-V5 — R7/R8 really are single-company.** From runData on a D3 sibling turn and a D2
  alternatives turn, assert every candidate resolves to one company (or that the payload carries no
  company at all, i.e. it never came through the resolver). Print both candidate sets. This converts
  §3.3's exclusion argument from an assumption into a check.
- **§5-MC-V6 — the annotation regex is header-safe.** Statically: run
  `disallowed-entity-gate`'s grouped output through `build-suggest-offer.js:221-227` and
  `annotate-incoming-picker.js:22-27` offline and assert header lines are returned unchanged and every
  numbered line is still matched.

---

## 6. Acceptance criteria

0. 🔴 **A-0 (CRM, security):** every raw `text()` probe in `entity_resolver.py` carries
   `company_sql_predicate`; a single-grant contact's fuzzy `alternatives` contain **no** other company's
   product code; a regression test pins both the raw-SQL case and the column-tuple ORM case. **This
   criterion gates every one below it.**
1. A require-specific picker whose candidates span two companies renders **one group per company**, with
   a header naming the company, numbering **globally contiguous**, and the **customer-visible message**
   (`save-session-vars.user_response` / the sendmsg payload) carries it — not merely
   `disallowed-entity-gate`'s output object (LESSONS §63 rule i).
2. A D1 offer whose candidates span two companies renders grouped, **switches to numbered mode**, and a
   numeric reply resolves the **uuid of the picked group's** product — verified by driving the follow-up
   turn, not by inspecting the offer.
3. A duplicated code renders once **per company**, both lines **bare** (no has/no suffix), with
   `dym_excluded_codes[].reason === 'multi_company_code'` and `company_count === 2`.
4. Single-company candidate sets, and every set where any candidate lacks a company, are
   **byte-identical to today** at the customer boundary.
5. `suggest_quick_reply` never contains a company name, a header, `(`, or a has/no suffix.
6. R7 (D3 siblings) and R8 (D2 alternatives) are **asserted** single-company, not assumed.
7. Every §MC assertion has been **shown to fail on purpose** (§MC-FP) under §0 S9's three-part mutation
   procedure before it is trusted.
8. §0 S1–S9 hold on every case.

## 7. Rollback / watch

Clone-only build. Rollback = `publish_workflow` the prior clone versionId (`3a196c44` at plan time) and
re-run `export-workflows.py`.

Watch for a week after any promote: rate of grouped renders, `dym_excluded_codes` volume with
`multi_company_code`, and — the §3.4 cost — how often a surviving twin displaces a distinct product from
`cap3`.

## 8. Out of scope / file separately

- **CRM A-4** — company in the `presenters.py` render envelope (unlocks per-company has/no). Phase 2.
- **A-3** — whether the OR-mode `alternatives` path should dedupe by `canonical_code` like AND-mode
  does (`entity_resolver.py:3722-3733` vs `:3413-3420`). After A-0 the answer is probably **no** (a
  surviving twin is then a genuine dual-grant case that the customer should see), but it is a decision
  someone must make explicitly rather than leave as an inconsistency.
- **`space_id: "364817"` hardcoded** in every spine expression and CRM URL. Correct today, silent
  breakage on a second workspace.
- 🚩 **CORRECTION TO A STANDING CLAIM — the live `sub-get-results` is NOT unscoped.** CLAUDE.md, memory
  `live-calls-getresults-test-fork`, `dym-probe-before-offer-plan.md` §9 and review §6.2/§9.5-D14 all
  state that only the fork `rysSPgUssLDf6xJc` forwards `contact_id`/`space_id`, and that live
  `sibling-probe`/`crossdomain-probe` therefore call company-scoped tools **unscoped**. That is **false**.
  `export/sub-get-results/nodes/entity-ids-transformer.js:80-81` (live `Fss5aAaXthJSWpZCgKiKR`,
  versionId `61b65e5f`, verified current) reads:
  ```js
  out.contact_id = semantic_input?.contact_id;
  out.space_id = semantic_input?.space_id;
  ```
  and **every** spine caller populates `semantic_input` with
  `contact_id: $("sorento-sub-respond-findcontact-respond").first().json.id.toString()` and
  `space_id: "364817"`. `diff` of the live and TEST bodies shows **one** hunk: the fork adds a redundant
  re-assignment at `:90-91`. Both are scoped. **Consequence:** review §9.5 item D14 ("both probes →
  `rysSPgUssLDf6xJc`, NOT `Fss5aAaXthJSWpZCgKiKR`") rests on a false premise and must be re-derived
  before the `dym-probe-before-offer` promote. Not corrected here — it belongs to that change's
  checklist.
- **Order/`master_products` domains** for grouping — same treatment, one more renderer each.
- Everything already listed in `dym-probe-before-offer-plan.md` §9.
