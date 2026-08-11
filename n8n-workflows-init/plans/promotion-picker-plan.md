# Promotion picker — drop the access-level prompt, require a scope, offer a numbered list

Removes the access-level clarification turn from the promotion domain. A bare "any promotion?" is
answered with a **require-specific** prompt (same shape as incoming), not a list. A **scoped**
promotion query — product, brand, category, promotion name or flyer — is answered directly, filtered
by the contact's live entitlement without ever asking for it, and when it returns more than one
promotion the customer picks by number and gets the file(s).

Status: **planned after a full grill (26 decisions, 2026-08-09). Nothing built.**
Build target: a new fork, NOT the clone — see §7.
UAC: `n8n-workflows-init/tests/uac/PP.md`.

> ⚠️ **This plan was rewritten end-to-end.** The first draft proposed listing a contact's entire
> promotion entitlement. The user rejected that: a promotion cannot be answered without a specific
> search. Decisions Q2 (no cap), Q20 (group by company), Q22/Q24 (zero-promotion company choice) were
> settled against the old shape and are **dead** — they are recorded in §9 so they are not
> re-proposed.

---

## 0. The turn

1. **"any promotion?"** — no `promo_scope` entity → **`require_specific`**, mirroring the existing
   wording. No list. No access-level question.
2. **"promotion for SRTKS4028B"** — or brand / category / promotion name / flyer; any `promo_scope`
   entity qualifies → `crm_marketing_promotions_list`, `access_levels` = the **union of the contact's
   live entitlement**, never asked for.
3. **1 promotion** → send the file immediately.
   **>1** → numbered list, *description — period*, **no files**.
   **0** → escalate to the named product's company.
4. **Pick** — `1` · `1 and 2` · `1,2` · `all` → re-call MCP with `promotion_ids` → presign → send.
   A quote-reply resolves against the **quoted** list via `referenced_result_set`.

---

## 1. Decisions (all user-settled; Q-numbers are the grill's)

| # | decision |
|---|---|
| D1 | Scope by the **union of the contact's live access types**. The field stays — only its source changes. |
| D2 | Exactly one promotion ⇒ **send the file**, no picker. |
| D3 | Build on a **new fork**, not `txiPzSxy3Pclsz6v` (container-status is mid-build there). |
| D4 | `access_levels` **stops being session state**. |
| Q1 | Each row is **promotion description — period**. |
| Q3/Q13 | Roster persistence: **leave `last_result_set` exactly as today**, including its wipe on a barren turn. The customer is asked to reply with a number, so it does not need to survive. |
| Q4 | **"all" is supported** and selects every listed promotion. |
| Q5 | A promotion with **no file** is still listed; on pick it replies with the details as text. |
| Q6 | The picker fires **whenever >1 promotion**, however the query arrived. Skipped only at exactly 1. |
| Q7 | **Promoted as its own bundle**, separate from container-status. |
| Q11 | The picker node sits **immediately after `validator`**. |
| Q12 | **Reuse `selection_context = 'suggest_offer'`** — no parser change, no new arm at `compile-current-state.js:209`, quote-reply works day one. |
| Q14 | On the pick turn, **re-call MCP** with `promotion_ids`. Never persist file URLs. |
| Q23 | A customer naming an access level they do not hold is **told so**, then shown their real list. |
| Q25 | **Any `promo_scope` entity** satisfies the scope requirement — product, brand, category, promotion, flyer. |
| Q26 | The require-specific prompt **mirrors the existing wording**, so the existing node is reused. |

---

## 2. Evidence for the two defects being fixed

### 2a. The access question is redundant

```
If  (intent_hint == 'check_promotion')  → get-access-types → Aggregate → If4
If4 TRUE  (parser access_levels ∩ contact names ≠ ∅  OR  names.length == 1) → resolve-entity
If4 FALSE → access-level-choice-message → tag-access-choice → escalate-catalog ('access_choice')
```

`get-access-types` (`GET /api/v1/external/contact-access-types/active`) has **already returned** when
the question is asked. The entitlement is known; the prompt only narrows it to one.

### 2b. The chosen level goes stale — the reported bug

`export/sub-semantic-parser/nodes/output_exchange.js:912`

```js
if (output.output.access_levels.length == 0) {
  output.output.access_levels = $('When Executed by Another Workflow').first().json.previous_conversation_state?.access_levels || []
}
```

with `export/live-spine-sorento-consume-main/nodes/compile-current-state.js:491`
(`"access_levels": qf.access_levels`). Say "office" once and every later promotion turn that does not
restate a level inherits it. **Ask for office, then ask for dealer, get office.**

### 2c. `access_levels` is a real CRM filter — do not delete the field

`export/sub-get-results/nodes/entity-ids-transformer.js:82` passes it to
`crm_marketing_promotions_list`, and the CRM **post-filters promotions by it**
(`entity_resolver.py`, `AND_MODE_LIMIT` comment). Dropping the field returns every promotion to
everyone. D1 changes its **value**, not its existence.

---

## 3. Design

### S1 — Require a scope on the bare ask

`disallowed-entity-gate` today sets `require_specific` **only when there are candidates**
(`disallowed-entity-gate.js:224`, `if (specific_options.length > 0)`), and renders
`"<domain> search needs to be more specific. Multiple matches found — please choose:\n<numbered>"`.

Add **one branch** to the same node: promotion domain, **zero `promo_scope` entities** resolved →
`require_specific = true`, same leading sentence, **without** the "Multiple matches found — please
choose:" clause and without a list. Same flag, same `disambiguation` context, same downstream, **no
new rendering surface** (Q26).

`promo_scope` membership is already defined at `output_exchange.js:372`
(`brand`, `category`, `promotion`, `flyer`) and `:348` (`product`) — read it, do not restate it.

### S2 — Kill the access question

`If4`'s OR-pair becomes a single `names.length > 0` test. The FALSE arm and everything downstream of
it (`access-level-choice-message` → `tag-access-choice` → `escalate-catalog 'access_choice'`) is
**kept wired** for the 0-access-type case.

⚠️ Do **not** delete `access-level-choice-message`. `escalate-catalog.js:49` reads it **by name**; a
deleted node is a crash, an orphaned one is correct.

`access_levels` handed to `resolve-entity` / `get-results` becomes:

- the customer's **explicitly named** levels this turn, **intersected with the contact's entitlement**
  — raw use is the leak D1 exists to prevent
- else the **full entitlement union** (`Aggregate.name`)
- intersection empty → tell them (*"You don't have access to Mocha Dealer promotions — here's what
  you do have:"*), then their real list (Q23)

The parser's per-turn emission is unchanged and is a **closed enum**: `Sorento Dealer, Mocha Dealer,
Mocha Office, Cabana Dealer, Cabana Office, End User, Sorento Office`. It is explicitly *not* an
entity ("Do not treat access levels as entities").

### S3 — Stop persisting the choice

- drop the `access_levels` key from `compile-current-state.js:491`
- drop the previous-state fallback at `output_exchange.js:912-913`

**Order matters — one atomic hunk across both workflows, parser first or simultaneously.** If the
spine stops writing while the parser still reads, the parser reads a stale key from an old session
blob and behaviour depends on when that contact last set a level.

### S4 — The picker (`build-promo-picker`)

New node immediately after `validator` (Q11), gated on promotion domain and `answers.length > 1`.

It **cannot** be `build-suggest-offer` — that node is on the miss path (inbound `dym-annotate`,
`dym-gate[1]`, `sibling-probe`, `annotate-incoming-picker`; outbound `tag-not-found`) and never sees
get-results answers. Different graph position, **same state contract**.

Emits:

- `suggest_last_result_set = [{ idx, label, uuid, company_id, company_name }, …]` — labels **bare**,
  no decoration (`build-suggest-offer.js:270` documents why decoration breaks the pick)
- `suggest_selection_context = 'suggest_offer'` (Q12)
- a numbered `response`: `1. <description> — <period>`
- **attachments suppressed this turn** so `attach-merge` → `if-got-attachments` sees none

`compile-current-state.js:139` already lists `Promotion Name` in its label priority and each roster
row already carries `filename` — promotions index correctly today, so this is projection, not new
plumbing.

### S5 — The pick turn

- positional pick resolves against `last_result_set`, or against `referenced_result_set` when the
  customer quote-replied (the parser already prefers it — `output_exchange.js:510`)
- `"all"` selects every listed position; the parser's ALL handler already gates on
  `selection_context === 'suggest_offer'`, which Q12 gives us for free
- resolved UUIDs → `promotion_ids` → get-results → attachments → the existing send path
  (`attach-merge → if-got-attachments → Edit Fields → Split Out → Remove Duplicates →
  Loop Over Items1 → get-presigned-url → Switch → send-message-files/images/video`)
- multi-pick sends **all** selected files
- a picked promotion with **no** attachment replies with its details as text (Q5)

### S6 — Zero promotions

Escalate to the company of the **named product/promotion** — available today: matches and
alternatives carry `company_id` / `company_name`, and `promotion` is in `_company_scoped_models()`.
Because S1 guarantees something was always named, the entitlement-derived fallback the first draft
needed no longer has a path.

---

## 4. Required before any build — measure the baseline

Not yet run. Fork in `uac` mode, `previous_conversation_state: {}` (uac mode otherwise reads
437264483's stale prod session — `uac-mode-reads-prod-session`), per `clone-canary-item-envelope`.

| # | message | record |
|---|---|---|
| B1 | "any promotion?" — contact with ≥2 access types | does `If4` go FALSE and prompt? exact buttons |
| B2 | B1, answer "Sorento Dealer", then a NEW turn "any promotion?" carrying the resulting state | does it silently reuse the level? **This is the RED** |
| B3 | "any promotion?" — contact with exactly 1 access type | confirms the `names.length == 1` shortcut |
| B4 | "any promotion?" — contact with 0 access types | confirms the no-access message |
| B5 | "promotion for \<a product with ≥2 promotions\>" | how many attachments fire today; the rendered string verbatim; **the real promotion count** |

**B5 is load-bearing.** The only volume figure available is a CRM code comment ("22 Sorento+End-User
promotions") describing an entitlement-wide count, not a product-scoped one. If a product-scoped list
is 3, the picker is trivial; if it is 30, revisit rendering before building.

---

## 5. Landmines carried in

1. **Enumerate renderers by rendered string** — `grep -rln "<the string>"` over `nodes/`. The
   did-you-mean contradiction had four builder surfaces; the one the customer saw was found by grep,
   not by reasoning about edges.
2. **Assert at the customer boundary**, not on `build-promo-picker`'s return value.
3. **`escalate-catalog` reads `access-level-choice-message` by name.** A `$('x')`-only grep misses the
   `$("x")` form.
4. **Offline probes cannot see a CRM contract mismatch.** A wrong MCP parameter name is dropped
   silently and short-circuits without calling the backend. S2 changes an MCP parameter's value — it
   must be proven against the real CRM.
5. **`sim-inject-session` coerces an absent `referenced_result_set` to `[]`, and the guard is
   `Array.isArray(...)`, which `[]` passes.** A quote-reply fixture that does not set it explicitly
   exercises nothing and reports green.
6. **Fixtures from a real execution**, never hand-synthesised.

---

## 6. Related work — flagged, not owned

**`plans/multi-company-resolution-plan.md` is stale.** It declares itself blocked on the
`entity_resolver.py` raw-SQL isolation leak (A-0). That fix is on CRM `main`: `_company_scope_sql`
is applied across the raw probes, `_attach_company_info` stamps `company_id`/`company_name` on
matches and alternatives, and `promotion` is in `_company_scoped_models()`. The plan needs
re-baselining and its **held promote may now be releasable**. Different plan, different owner — this
plan depends on the company fields it describes but does not implement any of it.

---

## 7. Build target

Fork the clone `txiPzSxy3Pclsz6v` (proposed name **`sorento-consume-main PROMO-PICKER`**) plus a
parser fork for the S3 hunk. Register **both** in `scripts/export-workflows.py` — an unexported fork
is invisible to `--verify`, which is how the ideation parser fork drifted unnoticed.

## 8. Promote order

One bundle, each step byte-gated:

1. parser fork hunk (S3 half) — remove the previous-state fallback
2. spine — S1, S2, S3 half (`compile-current-state`), S4, S5, S6

Build every live target as **LIVE + own hunks, by node NAME**; never block-copy the fork
(`stale-byte-identical-fork-claim`). Record the rollback versionId in
`tests/manifests/promotion-picker/README.md` **before** the first write.

## 9. Rejected / dead — do not re-propose

| idea | why it died |
|---|---|
| List the contact's whole promotion entitlement | User: a promotion cannot be answered without a specific search. Replaced by S1. |
| No cap, newest first (Q2) | Was needed only for the entitlement-wide list. A product-scoped list is small. |
| Group the list by company (Q20) | Same. Once a product is pinned, its company is pinned, so a scoped list is single-company. |
| Zero-promotion company choice (Q22/Q24) | S1 guarantees something was named, so the company is always derivable (S6). |
| Extend `build-suggest-offer` to serve both paths (Q8) | It is on the miss path and never sees get-results answers. |
| Lift `cap3` (Q9) | `cap3` governs the did-you-mean miss path only — never in conflict. |
| New `promo_offer` selection_context (Q12) | Would need a parser hunk, a new precedence arm, and a CRM key for quote-reply. |
| Make `last_result_set` survive barren turns (Q13) | Global blast radius for no gain — the customer is asked to reply immediately. |
| Reuse turn-1 attachment URLs on the pick (Q14) | Stored URLs go stale and fail in front of the customer; presign happens at send time for a reason. |

## 10. Out of scope

- The same treatment for other access-gated domains. Promotion only.
- Any CRM-side change.
- Container-status / `field_vocabulary` — different bundle, different session.
