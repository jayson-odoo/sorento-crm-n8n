# PR #142 — cross-repo contract conformance review (read-only)

**Target:** `jayson-odoo/sorento-crm` PR #142, branch `feat/spec-raw-text-search`
**Reviewed at:** `90b6034bd` (tip), merge-base `43e6f553c`
**Contract record:** `spec-coverage-measured-20260813.md` (C-1/C-2/C-3/S1/S4/D7 clauses) +
`spec-backward-search-contract.md` (shape B)
**Method:** static read of `git show origin/feat/spec-raw-text-search:<path>`. No checkout, no
working-tree mutation, no test run, no server. All line numbers are **branch** line numbers.

Diff surface: 16 files, +3301/−190. Backend services touched: `references.py`,
`product_spec_search.py`, `product_spec_understanding.py`, `product_set_service.py`,
`product_service.py`, `entity_resolver.py`; API: `products.py`, `product_specifications.py`;
MCP: `catalog.py`. Six new/extended test files.

---

## S1 — raw text in `query`, explicit `free_terms` still win

**Verdict: PASS (with one migration-relevant nuance).**

- `understand_phrase` now runs **unconditionally** on the spec path via a shared helper.
  `references.py:2050-2060` calls
  `product_spec_understanding.derive_search_inputs(db, payload.query, specs=…, free_terms=…, allow_model=payload.understand_phrase, …)`.
  The LLM half stays behind the flag; the word-level read is always on
  (`product_spec_understanding.py:461-462` returns the deterministic `fallback` when
  `allow_model` is false).
- **Explicit wins, per key:** `product_spec_understanding.py:409-412` —
  `stated = {keys of caller specs}`; derived entries are appended only where
  `entry["key"] not in stated`. A caller-pinned `extracted_specs` entry is never overwritten.
  Pinned by `tests/test_resolve_raw_text.py:147` (`test_explicit_caller_fields_still_win`).
- **Byte-identical when off:** the whole block is inside `if payload.spec_fallback and (…)`
  (`references.py:2013`). Pinned by `tests/test_resolve_raw_text.py:161`
  (`test_without_the_flag_nothing_changes`).
- Rides along: nine best-effort resolver legs are now wrapped in `db.begin_nested()`
  (`entity_resolver.py:2417, 2509, 2563, 2604, 2645, 2682, 2720, 3818, 4400`) — a failed
  trgm/vector probe no longer aborts the request transaction. `git diff -w` shows **+36 lines,
  0 deletions** in that file: indentation and comments only, no SQL changed.

### ⚠️ Nuance the migration slice must price in — `free_terms` merge is a UNION, not a replacement

`product_spec_understanding.py:413-415` merges derived free terms **on top of** the caller's:

```
merged_terms = merged_terms + [term for term in understanding.free_terms if term not in merged_terms]
```

and `understand_phrase` always emits the **whole phrase** as a free term
(`product_spec_understanding.py:453-459`, and `:525` on the LLM path). So "explicit wins" is
per-KEY for `extracted_specs` but **additive** for `free_terms`.

Consequence for the migration window: a transitional n8n body that sends BOTH the old
`free_terms` array AND a raw `query` will rank against `caller_terms + [raw sentence]` — a
scoring input the current live caller has never produced. This is exactly the masking the
contract's "swap query→raw AND drop N-0 in ONE slice" instruction was written to avoid, and it
is now confirmed in code rather than assumed. **Do the swap and the N-0 deletion atomically.**

### RECORDED OPEN QUESTION — answered: **NO separate field. `query` is shared.**

`ResolveReferenceRequest.query` is unchanged (`references.py:1124`:
`query: str = Field(default="", description="Free-text query or a single code to resolve.")`).
No new raw-text field was added anywhere in the model (`references.py:1119-1270`).

The same string is fed to **both** machines in `resolve_reference_post`:

1. `_resolve_input(db, payload.query, payload.tokens, …)` — the normal probes
   (`references.py:1967-1977`), which run code-token regex extraction, `_synthesize_alpha_tokens`
   (`references.py:224-252`), stopword stripping, AND/OR mode, `allowed_entity_types` cross-product;
2. `derive_search_inputs(db, payload.query, …)` — the spec deriver (`references.py:2051`).

**Regression scope for the n8n migration slice is therefore the FULL resolve surface, not just
the spec path.** Every resolution family whose `resolve-entity` body currently carries the
parser restatement (`user_goal`) will start feeding a raw customer sentence into the code-token
extractor. Concretely, re-run: code parity (bare/pasted codes inside a sentence), SA/SR,
order/customer/date, attachment/`domain_hint` (`_ALPHA_TOKEN_TYPES` synthesizes tokens by
whitespace-splitting the **whole** query — a long sentence produces many more probe tokens than a
restatement did), and AND-mode compound filters. The CRM contract did not narrow this for you.

---

## C-1 — the gate, the replacement, the footer strip

**Verdict: gate PASS · replacement PASS · free-term strip DEVIATION.**

### (a)(b)(c) trigger set — PASS

`references.py:2013-2017`:

```
if payload.spec_fallback and (
    _result_has_zero_matches(result)
    or _product_words_unanswered(result)
    or _has_unresolved_tokens(result)
):
```

All three contracted triggers are present and OR-ed:

| trigger | helper | branch lines |
|---|---|---|
| (a) zero matches anywhere | `_result_has_zero_matches` | `references.py:1273-1280` |
| (b) unanswered PRODUCT-token words | `_product_words_unanswered` | `references.py:1283-1302` |
| (c) [S2] any-token-zero-matches | `_has_unresolved_tokens` | `references.py:1305-1318` |

(b) is correctly product-scoped (`claim.get("entity_type") == "product"`, `:1300`) and
fails-closed on a missing coverage block (`:1302` returns False) — the "a widening must never
fire on absence of evidence" rule is honoured.

### Spec candidates REPLACE, never merge — PASS

`_emit_spec_matches` (`references.py:1831-1957`):
- AND shape: `result["intersection"] = spec_matches` (`:1905`) — assignment, not extend —
  followed by a rebuild of `by_entity_type` (`:1906-1909`), `empty` (`:1910`) and a recompute of
  `_attach_and_coverage(result)` (`:1915`) over the replacing rows.
- OR shape: one new resolution is **appended** (`:1916`) with `match_tier="spec_search"`
  (`:1863`) and `alternatives: []` (`:1894`). Junk brand rows stay in their own resolutions and
  stay distinguishable by tier, exactly as contracted.

### CRM strips unresolved tokens matching a supplied `free_term` (case-insensitive) — **DEVIATION**

The contracted mechanism no longer exists. Review finding F2 replaced it with a stricter,
different rule (`references.py:1936-1957`):

```
answered_words = bound_words | ⋃ _searchable_words(candidate)   # :1936-1938
result["unresolved_tokens"] = [t for t in unresolved
                               if _is_code_shaped(t) or not _answered(t)]   # :1953-1957
```

- `_answered(t)` (`:1940-1946`) clears a token only when **every** `_content_words` word in it is
  in `answered_words`.
- `answered_words` is built from (i) `understanding.bound_phrases` restricted to keys a **shown
  row actually matched** (`references.py:2081-2099`) and (ii) each shown candidate's own
  summary / class / spec values (`_searchable_words`, `references.py:1787-1810`).
- **Caller-supplied `free_terms` are not consulted at all** in the strip. The contract's
  "caller-driven, so it only happens because we own `free_terms`" premise is void.
- New carve-out: a **code-shaped** token is never cleared (`:1953-1956`, `_is_code_shaped` at
  `:1813-1828`, now reusing `entity_resolver._CODE_RE` with a measurement exemption at
  `:1781-1784`). "ZZTKS999 kitchen sink" keeps the code in the footer even when sinks were found.

**What the n8n renderer / migration slice must change:**
1. **Keep N-3.** It was to be demoted to belt-and-braces for the no-free_terms case. It is now
   the only guard for any token the CRM's word-level rule declines to clear — which now includes
   tokens the old rule would have cleared (a free term whose words do not appear in any shown
   row's values/rendered text/class survives; see `test_spec_review_findings.py:240`,
   `test_f2_a_second_unanswered_description_survives`).
2. **Expect code tokens to persist in `unresolved_tokens` alongside a full spec answer.** The
   miss renderer must be able to say "sinks found, code X not found" in the same reply, or it
   will either drop the code miss or contradict the shortlist.
3. This strip also now applies on the **shape-B require path** (`references.py:2003` calls
   `_emit_spec_matches` with no `bound_words`), which previously used the old whole-query rule.
   Shape-B footer behaviour changed as a side effect.

---

## C-2 — `unrecognized_terms` on shape A; two channels never merged

**Verdict: PASS.**

- Emitted top-level on the shape-A path: `references.py:2125-2135`.
- Computed by a **separate** function from a **separate** input: `unrecognized_terms(db, query=…,
  free_terms=…, registry_rows=…, brands=…)` at `product_spec_search.py:625-664`, which checks
  words against `_search_vocabulary` (registry keys/labels/values/synonyms + class labels +
  category synonyms + brand names — `product_spec_search.py:527-572`).
- `spec_unmet` is computed independently from asked-vs-satisfied keys
  (`product_spec_search.py:1112-1122`) and assigned at `references.py:2106`. The two never share
  a code path, never share an array, and the field names match shape B's
  `predicate.unrecognized_terms` (`references.py:2001`). Distinction preserved.
- Precision guards worth knowing: stopwords and any token containing a digit are never reported
  (`_content_words`, `product_spec_search.py:575-595`); a caller term that is *wholly* alien is
  reported **verbatim as the whole term**, a *partly* alien one word-by-word
  (`product_spec_search.py:648-662`).

⚠️ **Renderer note (F6 gate, not in the frozen text):** `references.py:2124` computes
`descriptive = bool(found["candidates"]) or bool(specs)` and emits `[]` when false. So on a
non-descriptive turn ("quotation for Encik Baharudin") the field is **present and empty** rather
than naming the person's name. The field is always on the wire when the spec path ran — a
renderer must not read absent-vs-empty as meaningful. Pinned at
`test_spec_review_findings.py:352`.

---

## C-3 surface 1 — `display.specifications` on resolve spec rows

**Verdict: PASS. The registry-side enum-token pin is a DEVIATION (see below).**

`references.py:1867-1882` — every spec match's `display` carries, in this order:

```
"class": candidate.get("class"),
"specifications": candidate.get("specifications"),
"matched_specs": candidate.get("matched_specs", []),
"preferred_specs": candidate.get("preferred_specs", []),
```

- **Compact values-only:** `values_only()` (`product_spec_search.py:134-146`) unwraps the storage
  envelope `{"value": 1.2, "unit": "mm"}` → `1.2`. No evidence / provenance / unit on this
  surface. Pinned: `test_spec_values_on_rows.py:191` asserts no nested dicts and `"free_terms"
  not in specifications`.
- **Lists stay lists** (`product_spec_search.py:139-140`), **numbers stay numbers** (pinned
  `test_spec_values_on_rows.py:184-186`: `== 1.2` and `isinstance(..., (int,float))` and
  `isinstance(..., bool) is False`).
- **Always present alongside `matched_specs`:** the key is always emitted. On the shape-A path
  the value is always an object (candidates originate from a `ProductSpecifications` row;
  `product_spec_search.py:1048`). On the shape-B require path it may be `null` — see the SHAPE B
  section.
- **Keys come exclusively from stored values:** `values_only` iterates the stored `values` dict
  only. `free_terms` is a `matched_specs` marker (appended at `product_spec_search.py:998`) and
  can never be a `specifications` key. The unguarded
  `specifications[k] for k in matched_specs` join is safe — it simply misses on `free_terms`.

### Enum lower_snake `^[a-z0-9]+(_[a-z0-9]+)*$` pinned registry-side — **DEVIATION (two parts)**

1. **It is a pytest, not a registry-side constraint or validator.** The only occurrence of the
   regex in the whole branch is `tests/test_spec_values_on_rows.py:309`
   (`test_every_enum_token_is_lowercase_underscore_separated`, `:312-334`). Repo-wide grep for
   `a-z0-9]+(_` over `*.py` on the branch returns that one hit — no model validator, no DB
   CHECK, no API-layer validation on the spec-registry write path. Staff editing synonyms /
   allowed values through the registry UI can introduce a semantic underscore and **no
   production guard fires**; only CI on a future PR would catch it, and only for seeded rows.
2. **The exempt set is `{class, brand}`, not `{class}`** (`test_spec_values_on_rows.py:322`,
   with the docstring at `:319-320`: *"`class` is exempt … and so is `brand` (display-cased
   brand names, 'SORENTO')"*). The frozen contract's renderer rule was **two lines**: `class`
   verbatim, everything else `replace('_',' ')` + titlecase.

   **n8n renderer must change to three lines:** `class` verbatim, **`brand` verbatim**,
   everything else humanised. Blind-humanising a brand value rewrites the catalogue's own
   spelling — `"SORENTO"` → `"Sorento"`, and `"NO LOGO"` (a real catalogue brand value that this
   PR deliberately made bindable, F8, `test_spec_review_findings.py:420`) → `"No Logo"`. Brand
   values also legitimately contain **spaces** ("American Standard",
   `product_spec_understanding.py:227-228` calls this out explicitly), which the underscore-only
   assumption never anticipated.

---

## C-3 surface 2 — `crm_master_products_list` / `include_specifications`

**Verdict: PASS on every clause, including the MCP declaration.**

- **Param exists, default false:** `products.py:131-140` —
  `include_specifications: bool = Query(False, description="… `specifications: {values, rendered_text, sources}`, or null when the product has no derived row. Off by default …")`.
  Non-boolean → 422 (FastAPI coercion, pinned `test_spec_raw_text_hardening.py:156`);
  unauthenticated → 401 (`:165`).
- **Byte-identical when off:** the opt-out path returns the declared `response_model`, which
  drops any undeclared key; the opt-in path hand-serializes and returns a raw `JSONResponse`
  (`products.py:61-80`, rationale at `:64-68`; dispatch at `:201-203`). Pinned by a literal
  `opted_out.text == plain.text` byte comparison plus `"specifications" not in plain.text`
  (`test_spec_values_on_rows.py:268-277`), and a key-set diff of exactly `{"specifications"}`
  (`:290-295`).
- **Block shape `{values, rendered_text, sources}`:** `product_service.py:548-586`, one batched
  `IN` query for the page (`:567-571`) — cost pinned at exactly one extra statement
  (`test_spec_raw_text_hardening.py:212`).
- **Present-but-NULL when no spec row:** `products.py:79` — `serialized["specifications"] =
  by_product.get(str(row.id))` → `None` for a product absent from the map. Pinned
  `test_spec_values_on_rows.py:298-303` (`"specifications" in row` **and** `is None`).
- **DECLARED MCP param ⇒ restart mandatory:** `sorento_crm_mcp/sorento_crm_mcp/catalog.py:77`
  adds `"include_specifications"` to the `CATALOG` param tuple, with the in-line rationale
  *"the compiled tool builds its signature from THIS tuple, so a param missing here never reaches
  the backend however well the description documents it."* Tool description updated at `:58-62`,
  and it documents the four sources verbatim. **Confirmed: the MCP process must be restarted at
  deploy or `crm_master_products_list` will silently reject / drop the new param.**

---

## S4 deviation (1) — `spec_asked` = qualifier keys ONLY, never `class`

**Verdict: PASS on the deterministic path · DEVIATION-RISK when `understand_phrase: true`.**

- `spec_asked` is assigned at `references.py:2111` from `found["asked_for"]`, built at
  `product_spec_search.py:1112-1116, 1128` as `[{key, value}]` over the merged `specs` list —
  i.e. after free terms resolve, and **house preferences are structurally absent** (they are
  applied in a separate loop at `:1006-1013` and land in `preferred`, never in `specs`).
- **Class cannot bind on the word-level path:** the `class` registry row ships with
  `"synonyms": {}` (`product_spec_registry.py:345-355`), and
  `resolve_terms_to_specs_with_spans` binds only through `merged_synonyms(row)`
  (`product_spec_search.py:433-447`). "kitchen sink" reaches the ranker as a free term and
  scores through the `implied_classes` signal path (`product_spec_search.py:979-985`), which
  appends `"class"` to `matched` but never to `specs`. So `matched_specs` may carry `"class"`
  while `spec_asked` does not — exactly as contracted. Pinned
  `test_spec_values_on_rows.py:245-262` (`assert "class" not in asked` **and**
  `assert display["specifications"]["class"]`).

⚠️ **Two ways class CAN enter `spec_asked`, both data/flag dependent — not structurally locked:**

1. **LLM path.** With `understand_phrase: true`, `_vocabulary()` populates
   `allowed_values` for `class` from the catalogue (`product_spec_understanding.py:161-168`,
   `open_vocabulary_values`, `:110-130`) and puts the `class` row in the validation `index`
   (`:182`). `_validated_pairs` (`:244-276`) therefore **accepts** a model-returned
   `{"key": "class", "value": "Kitchen Sink"}`, it flows into `merged` specs (`:512-514`) and
   straight into `asked_for`. There is no `class` exclusion anywhere on that path.
2. **Registry edit.** Registry synonyms are UI-editable and merged
   (`merged_synonyms`), so a staff-added `class` synonym re-opens the word-level route too.

**n8n action:** the recorded S4 upgrade design —
`Matched-on filter = matched_specs ∩ (spec_asked-keys ∪ {class})`, rendering the class VALUE not
the key name — is **safe under both readings** and should be built as recorded. Do **not** build
anything that asserts `class ∉ spec_asked`. Keep `understand_phrase` off on the fast path (it
also costs 2-3s, `references.py:1246-1247`).

## S4 deviation (2) — `sources` has FOUR values, `category` on the class key

**Verdict: PASS.**

`product_service.py:579-583` passes provenance through verbatim
(`{key: entry["source"] for key, entry in row.provenance.items()}`), so the wire carries whatever
derivation stamped. The four producers exist:

| value | where stamped |
|---|---|
| `derived` | default of `SpecOut.set(...)`, `product_spec_derivation.py:637` |
| `flyer` | `product_spec_derivation.py:1064` (`source="flyer" if origin == "flyer" else "derived"`) |
| `category` | `product_spec_derivation.py:966` — `out.set("class", category.class_label, category.category_code, source="category")`, i.e. **stamped on the class key**, exactly as contracted |
| `human` | reviewer edits via `api/v1/master_data/product_specifications.py` (`"source": "human"`), and honoured as never-overwritten (`product_spec_derivation.py:12`) |

The MCP tool description documents all four (`catalog.py:60-61`). Note these are pre-existing
(the derivation module is not in this PR's diff) — the contract clause holds, it was simply never
a new build.

## S4 deviation (3) — matched/preferred disjointness is BEHAVIORAL

**Verdict: PASS.**

No subtraction anywhere. `matched` and `preferred` are two independent lists built in the same
loop body (`product_spec_search.py:906-1013`) and emitted separately at `:1051-1052`
(`sorted(set(matched))` / `sorted(set(preferred))`). Disjointness arises because the preference
loop skips any key the customer stated: `product_spec_search.py:1006-1008` —
`for key, weighted in house_preferences.items(): if key in stated: continue`. The clone-side
**hard assertion stays worth keeping**; a key in both remains a ping-worthy signal, and the CRM
side pins it too (`test_spec_raw_text_hardening.py:437`:
`set(display["matched_specs"]) & set(display["preferred_specs"])` empty on every spec-tier match).

## matched_specs = customer-earned only · `preferred_specs` parallel array · brand interaction

**Verdict: PASS.**

- Both arrays ship on every spec row (`references.py:1877, 1880`).
- Preference keys never reach `matched_specs`: pinned `test_spec_values_on_rows.py:213-219`
  (`"material" in preferred_specs` **and** `"material" not in matched_specs`).
- **D7 interaction verified:** a customer who says "sorento" earns `brand` in `matched_specs`
  and the preference skips it even when `brand=SORENTO` is weighted —
  `test_spec_values_on_rows.py:222-230` (`"brand" in matched_specs`, `"brand" not in
  preferred_specs`). Mechanism: the brand binds into `specs` (`product_spec_search.py:486-488`),
  so `brand ∈ stated`, so the preference `continue`s.
- Unmet arithmetic is unaffected by the split — it reads `matched_specs` as the satisfied set
  (`product_spec_search.py:1117`) and a preference only ever applies to an unstated key. Pinned
  `test_spec_values_on_rows.py:233-242`.

---

## D7 — brand routing

**Verdict: PASS.**

- **Brands bind AS brands, sourced from the `brands` table:** `resolve_terms_to_specs_with_spans`
  falls through to `_brand_match_in_haystack(haystack, rows, brand_names(db))` when no registry
  synonym bound `brand` (`product_spec_search.py:459-462`) and appends
  `{"key": "brand", "value": brand_binding}` with its span (`:486-488`). Auto-sourced, never
  hand-seeded (the registry `brand` row still ships `"synonyms": {}`,
  `product_spec_registry.py:357-370`). Pinned `test_resolve_brand_routing.py:193`.
- **Code-prefix junk never headlines:** `_suppress_brand_prefix_junk`
  (`references.py:1321-1381`) keeps a product match only when
  `str(m["canonical_code"]).strip().lower() == token` (`:1366-1369`) — i.e. the **exact full
  code**; SORENTOBAG / SORENTO188 are dropped. Non-product matches are untouched (`:1367`), and
  `resolved` / `ambiguous` / `unresolved_tokens` / `ambiguous_tokens` are all re-derived
  (`:1372-1381`). Pinned `test_resolve_brand_routing.py:180`.
- **Fires only with candidates in hand:** called under `if found["candidates"]:`
  (`references.py:2072-2073`) — junk beats silence. Counterweight pinned
  `test_resolve_brand_routing.py:223` (`test_junk_stays_when_the_ranker_answered_nothing`).
- **Exact full codes still resolve as codes:** pinned `test_resolve_brand_routing.py:210`
  (`test_an_exact_full_code_still_resolves_as_a_code`).
- **Misstated brand → `spec_unmet`:** "cabana …" over a Sorento-only shortlist yields
  `spec_unmet == [{"key": "brand", …}]` (`test_spec_values_on_rows.py:233-242`), never a silent
  substitution.

---

## SHAPE B PROBE — did the `require` machinery ship in THIS PR?

**Verdict: NO — the machinery is PRE-EXISTING (already on `origin/main`). This PR touches
`product_set_service.py` for one narrow thing: F9.**

Evidence — all of the following are on `origin/main` already:
`product_set_service.py:141` `REQUIRE_LEGS`, `:149` `resolve_product_set`, `:169-175`
`UNKNOWN_REQUIRE_KEY` 422, `:159-167` `qualifying_total` / `truncated` /
`unrecognized_terms`; `references.py:1815` `if payload.require:` and `:1828`
`result["predicate"] = {…}`, with "When present it supersedes `spec_fallback`" already in the
field description. This matches the memory record (shape B shipped in PR #124).

**What PR #142 changes there — and it is a DEVIATION from the recorded contract:**

The recorded contract said *"Shape-B `require` matches emit `specifications: {}` /
`preferred_specs: []` (empty defaults, no derived block on that path) — values there = small
follow-up to request WHEN the SB n8n build starts."*

Review finding F9 **delivered that follow-up early**. `product_set_service.py:279-303`
(require-only branch):

- one batched `IN` query over `ProductSpecifications` for the shown ids (`:272-280`);
- `"specifications": values_only(values) if values is not None else None` (`:293`) — **real
  values, or `null`**, explicitly *not* `{}` (comment at `:291-292`: *"None, never {}: nothing
  was recorded … an empty block would read as 'recorded, and empty'"*);
- `"preferred_specs": []` (`:297`) — unchanged, as recorded;
- `"matched_specs": []` (`:296`) — unchanged (no customer words were scored on this path);
- `"class"` is now populated from the spec row (`:290`) where it was hardcoded `None` before.

`_emit_spec_matches` copies `None` faithfully rather than defaulting (`references.py:1876`).
Pinned `test_spec_review_findings.py:473` (values shown, `preferred_specs == []`) and `:490`
(a row with no spec block is `None`).

**What the n8n SB plan must change:** delete the "request values later" follow-up — they are
here. Budget for `display.specifications` being **`null`** on require-path rows (it never is on
the shape-A path), and keep `preferred_specs: []` / `matched_specs: []` as the require-path
signature. Also note the shape-B footer side effect recorded under C-1 above.

---

## SAFETY — raw SQL / company scope

**Verdict: PASS for this PR (no new raw SQL). One pre-existing leak noted, with an amplification
caveat.**

- **No new `text()` / `db.execute` anywhere in the diff.** `entity_resolver.py` shows nine
  `db.execute(text(...))` blocks as changed lines, but `git diff -w` reduces the whole file to
  **+36 / −0** — every one of those is a re-indent under a new `with db.begin_nested():` plus a
  three-line comment. No SQL string, parameter, or predicate was altered.
- **New service code is ORM-only.** `product_service.specifications_for_products`
  (`product_service.py:567-571`) is a plain `db.query(ProductSpecifications).filter(...in_(ids))`
  — goes through the `do_orm_execute` / `CompanyScopedMixin` listener. The F9 read in
  `product_set_service.py:272-280` is the same shape. `filter_specs`
  (`product_spec_search.py:667-733`) builds ORM/JSONB expressions, no raw text.
- **`certificate_products` join goes through `Certificate`** as required:
  `product_set_service.py:88-116` — `_leg_certificate` joins
  `CertificateProduct.product_id == Product.id` **and** `Certificate.id ==
  CertificateProduct.certificate_id`, with the docstring stating the reason
  (`:94-95`: *"Joins through `Certificate` because `certificate_products` has no company_id"*).
  Never bare. Unchanged by this PR.
- ⚠️ **Pre-existing, NOT introduced here — the `crm-resolver-half-scoped-leak` class survives.**
  `_tier3_embedding_lookup` (`entity_resolver.py:2403-2414`) issues raw
  `text()` over `embedding_chunks`/`embedding_documents` with **no company predicate** (only
  `is_current` + `source_type`), and `_rag_resolve_phrase` (`:~4380-4400`) is the same shape.
  By contrast the trgm legs DO carry `_company_scope_sql(db)` (`:2506, 2560, 2601, 2642, 2679,
  2717`). This is the known open leak and is out of scope for a #142 verdict.
  **Amplification caveat worth a ping:** the savepoint change makes those unscoped legs *more
  reliably reached* — before, a failure there poisoned the transaction and the request degraded;
  now the leg completes and its rows are returned. A leak that used to be masked by a broken
  transaction can now surface. Not a blocker for the n8n contract, but it belongs on the
  security follow-up.

---

## Summary

| # | contract item | verdict | key evidence (branch) |
|---|---|---|---|
| S1 | raw text in `query` + `spec_fallback:true`; explicit fields win | **PASS** | `references.py:2013, 2050-2060`; `product_spec_understanding.py:409-412` |
| S1n | `free_terms` merge is a UNION, not a replacement | **NUANCE** | `product_spec_understanding.py:413-415, 453-459` |
| S1q | OPEN QUESTION: separate raw-text field? | **ANSWERED — NO** | `references.py:1124, 1967-1977, 2051` — `query` is shared by both machines ⇒ full-surface regression |
| C-1a | gate fires on (a) zero / (b) unanswered product words / (c) any-token-zero | **PASS** | `references.py:2013-2017`, helpers `:1273, :1283, :1305` |
| C-1b | spec candidates REPLACE the partial intersection | **PASS** | `references.py:1905-1915` |
| C-1c | strip unresolved tokens matching a supplied `free_term` (case-insensitive) | **DEVIATION** | `references.py:1936-1957` — word-level answered-ness + code-shape exemption; caller `free_terms` not consulted |
| C-2 | `unrecognized_terms` on shape A; two channels never merged | **PASS** | `references.py:2106, 2125-2135`; `product_spec_search.py:625-664, 1112-1122` |
| C-3.1 | `display.specifications` compact, lists/numbers, always present | **PASS** | `references.py:1867-1882`; `product_spec_search.py:134-146, 1048` |
| C-3.1p | `^[a-z0-9]+(_[a-z0-9]+)*$` pinned **registry-side** | **DEVIATION** | only `tests/test_spec_values_on_rows.py:309-334`; no validator/constraint. **And `brand` is exempt too** (`:319-322`) |
| C-3.2 | `include_specifications` opt-in, byte-identical off, null when no row | **PASS** | `products.py:61-80, 131-140`; `product_service.py:548-586` |
| C-3.2m | DECLARED MCP param ⇒ restart at deploy | **PASS (confirmed)** | `sorento_crm_mcp/.../catalog.py:58-62, 77` |
| S4-1 | `spec_asked` = qualifier keys only, never `class` | **PASS (deterministic) / RISK (LLM flag)** | `product_spec_search.py:1112-1116`; `product_spec_registry.py:345-355`; risk at `product_spec_understanding.py:161-168, 244-276` |
| S4-2 | `sources` = derived \| flyer \| human \| category (class key) | **PASS** | `product_service.py:579-583`; `product_spec_derivation.py:637, 966, 1064` |
| S4-3 | matched/preferred disjointness BEHAVIORAL, not subtracted | **PASS** | `product_spec_search.py:1006-1008, 1051-1052` |
| S4-4 | `matched_specs` earned-only + parallel `preferred_specs`; brand earns | **PASS** | `references.py:1877-1880`; `test_spec_values_on_rows.py:213-230` |
| D7 | brands resolve as brands; exact codes survive; misstated → `spec_unmet` | **PASS** | `product_spec_search.py:459-462, 486-488`; `references.py:1321-1381, 2072-2073` |
| SB | `require` machinery shipped in THIS PR? | **NO — pre-existing on `main`** | `origin/main:product_set_service.py:141, 149, 169-175`; `origin/main:references.py:1815, 1828` |
| SB-F9 | require-path rows emit `specifications: {}` / `preferred_specs: []` | **DEVIATION (widened)** | `product_set_service.py:279-303` — real values **or `null`**; `preferred_specs: []` holds |
| SAFE | new raw SQL bypassing company scope? | **PASS (none new)** | `git diff -w` on `entity_resolver.py` = +36/−0; new reads are ORM |
| SAFE2 | `certificate_products` joined through `Certificate` | **PASS** | `product_set_service.py:88-116` |
| SAFE3 | pre-existing unscoped vector legs | **NOTED (pre-existing, amplified)** | `entity_resolver.py:2403-2414`, `~4380-4400` |

### OVERALL: **MERGE-SAFE-FOR-N8N — CONDITIONAL**

Nothing in the PR breaks the frozen contract in a way that would corrupt a rendered reply, and
every contracted field exists with the contracted name, shape and semantics. But four recorded
statements the n8n renderer/migration slice was built against are no longer true, and three of
them change n8n code. Conditions, in the order they bite:

1. **Renderer humanise rule becomes three lines, not two** — `class` verbatim, **`brand`
   verbatim**, everything else `replace('_',' ')` + titlecase. Ship this BEFORE deploy or brand
   values get re-spelled in customer-visible text ("SORENTO"→"Sorento", "NO LOGO"→"No Logo").
2. **Keep N-3 miss suppression at full strength** — it is no longer belt-and-braces. And teach
   the miss renderer to emit a code-miss line alongside a populated spec shortlist, since
   code-shaped tokens now deliberately survive the CRM strip.
3. **Do query→raw + N-0 free_terms deletion in ONE slice**, and scope the regression sweep to the
   WHOLE resolve surface (code parity, order/customer/date, attachment/`domain_hint`, AND-mode) —
   not just the spec families. `query` is the shared field; there is no separate raw-text channel.
4. **Update the SB plan**: the require-path spec-values follow-up is already delivered; handle
   `specifications: null` on that path.

Non-blocking but ping-worthy: the enum-token guarantee is a CI test over seeded registry rows,
not a registry-side constraint — a UI synonym edit can break the render contract in production
with no guard firing. Worth asking the CRM side for a real validator on the spec-registry write
path. And `spec_asked` excluding `class` holds only while `understand_phrase` stays false; build
the Matched-on filter as `matched_specs ∩ (spec_asked-keys ∪ {class})` exactly as recorded, never
on an assertion that class is absent.

---

## Addendum 2026-08-15 — both non-blocking findings independently verified by the CRM session

The CRM backend session re-derived both against `origin/feat/spec-raw-text-search` (not taken on
report). Both CONFIRMED; both slightly worse than stated above.

**Finding 1 (enum-token format, no registry-side guard) — stronger than "no validator":**
- The seeded-rows test scope is by construction: it runs against `blank_session`, so a prod UI
  edit is *untested by construction*, not merely in practice.
- The write path (`PUT /spec-registry/{key}`) applies only `w.strip()`; `user_values` takes
  arbitrary strings. ⚠️ **CORRECTED by the CRM session before building:** the pin is on enum
  VALUES (`allowed_values`, `user_values`, synonym-map KEYS) — NOT on synonym WORDS. Customer
  words like `wall hung` legitimately carry spaces; a guard on words would have broken most of
  the registry's phrasings. Do not re-import the "words" framing.
- The write path ALREADY ASSUMES the convention it does not enforce: `spec_registry.py:765`
  auto-fills a missing synonym with `str(value).replace("_", " ")` — the renderer's humanisation
  rule executing server-side. A value saved as `Free_Standing` or `wall-hung` gets a
  self-synonym generated under a rule its own format violates.
- Fix precedent exists in the same file: `_validate_reachable` (a test-invariant promoted to a
  runtime guard, same `_reject` helper pattern). The token-format validator should mirror it —
  own error code, called from both `create_spec_key` and `update_spec_key`, `class`+`brand`
  exempt exactly as the test exempts them.
- ✅ **BUILT as CRM PR #160 `fix/spec-registry-token-format`** (2026-08-15): `_validate_value_tokens`
  on `create_spec_key` + `update_spec_key`, mirrors `_validate_reachable`, 28 tests; runs BEFORE
  the auto-fill self-synonym so a malformed value never ships paired with a bad synonym;
  exemptions `class`, `brand`, `_self`; one test pins the guard regex byte-identical to the
  seeded test's; regression vs the LIVE prod-copy registry: 55 rows, 0 would fail. No overlap
  with #142 (its diff has no `spec_registry.py`) — nothing to re-review on the contract.

**Finding 2 (`class` can reach `spec_asked` via understand_phrase) — reframed:**
`class ∉ spec_asked` is NOT a designed invariant the LLM path violates — it is an ARTEFACT of
what the deterministic path happens to put in `specs`. Nothing asserts it on either path
(`_validated_pairs` keeps any registry-recognised key; `class` is never special-cased in
`product_spec_understanding.py`; `asked_for` at `product_spec_search.py:1112` has no key
exclusion). Consequence for n8n: the union filter `matched_specs ∩ (spec_asked ∪ {class})` is
the CORRECT reading of a never-stated rule, not a workaround awaiting a CRM fix — it stays right
whichever path runs, and restores the symmetry the match side already has (`class` is
special-cased into `matched_specs` at `product_spec_search.py:980-985`). Never simplify it away.

Neither changes the MERGE-SAFE-FOR-N8N: CONDITIONAL verdict.
