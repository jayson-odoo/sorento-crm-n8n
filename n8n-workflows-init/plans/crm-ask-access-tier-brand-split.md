# CRM ask — split access entitlement into BRAND × TIER (two axes)

> ## ✅ ANSWERED 2026-08-15 — durable artifact is CRM-side
> The CRM session replied (relay via peer "Debug slow conversation variables API endpoint").
> **Authoritative contract now lives in `sorento_crm/documentation/plans/UAC-brand-tier-entitlement-split.md`
> on PR https://github.com/jayson-odoo/sorento-crm/pull/156 (docs only, no code).** Read that, not
> this file, for current detail. Summary of the four answers:
> 1. **Field shapes agreed as proposed**: additive per-contact `brands[]` + `tiers[]` beside legacy
>    `name[]`; no rename/removal without a named cutover; promotions tagged brand + tier; read path
>    takes both filters on ONE call; empty/omitted `brands` = "all brands this contact is entitled
>    to" with the server applying the gate.
> 2. **Admin UI sets the two axes independently** — an explicit AC, not a maybe.
> 3. **Migration sequencing agreed**: additive first → n8n switches consumers → compound names
>    retired last; cutover date NAMED by CRM, never inferred from a deploy. No ETA until D1–D3 land.
> 4. **End-user brand scoping still OPEN** — recorded as D1, the user's call.
>
> **Three USER decisions block the CRM plan (surfaced to jayson):**
> - **D1** — is `end_user` tier brand-scoped (our assumption) or globally visible? 5 live contacts
>   hold `end_user` alone — not hypothetical.
> - **D2** — should Mocha-scoped contacts see promotions at all? All 29 promotions (incl. all 14
>   Cabana ones) are OWNED by the Sorento company; Mocha owns zero, so a Mocha-only contact sees an
>   empty list regardless of entitlement. Options: re-stamp ownership / company-neutral promotion
>   visibility / accept as intended.
> - **D3** — who re-confirms the 5 all-seven-names contacts, and by when. Never auto-granted.
>
> Promoted into ACs (plan against these): `scope` discriminator ships WITH this change
> (AC-SCOPE-01..04, absence = NO CLAIM verbatim); tier-only-never-brand ask recorded as AC-ASK-03
> with reasoning. **Nothing changes what n8n builds today — the compat mapper on compound names
> stays correct before, during and after.**

**For:** the `sorento_crm` agent. **Raised from:** `sorento_crm_n8n`, 2026-08-11.
**Decided by the user (jayson), grilled over three rounds — the shape below is settled intent,
the contract details are what we need to agree.**

## The problem the current model causes

Access levels today are COMPOUND: `Sorento Dealer`, `Cabana Dealer`, `Mocha Office`, `End User`…
One string carries two independent axes — WHICH BRAND the contact may see, and WHICH TIER of
document (office / dealer / end user pricing). Customer-visible fallout on the n8n side:

- The access-level ask had to enumerate 5–7 compound options in one WhatsApp message
  (measured live, contacts 477071889 / 404285551), and respond.io quick-replies can't multi-select.
- The current live workaround sends the FULL entitlement union with no ask at all — so a query
  answers with every tier's copy of the same promo (OFFICE.pdf + DEALER.pdf rows side by side).
- Promotion rows carry no brand (prior ask item 4, still open), so brand can only be inferred
  from the compound level name — which the parser was never supposed to parse.

## Target model (user-decided)

Per contact, TWO independent entitlement fields:

| axis | values | meaning |
|---|---|---|
| `brands` | subset of `sorento, cabana, mocha` | which brands' documents the contact may see |
| `access_levels` | subset of `office, dealer, end_user` | which tier of document |

- **The brand gate stays**: a Cabana-only dealer must never see Sorento dealer files.
  (Explicitly confirmed — collapsing to tier-only with cross-brand visibility was rejected.)
- A promotion (and its file) is tagged with `brand` + `access_level` (tier).
- The promotions read path (`crm_promotions_list` / get-results promotion tool + the entity
  resolver) accepts **both** filters together: `brands: [...]`, `access_levels: [...]` —
  n8n always sends both; an empty/omitted brands means "all brands the contact is entitled to"
  (server applies the entitlement gate, as it does today for levels).

n8n side (ours, not yours): the semantic parser keeps emitting brand as an ENTITY
(`{raw: "Cabana", hint: "brand"}`); we derive a normalized brand deterministically and send it as
the `brands` filter. Tier comes from the customer's words ("dealer price list") or a numbered
tier ask (office / dealer / end user, multi-selectable) when the contact holds >1 tier.

## Migration constraints (hard requirements from our side)

1. **Zero downtime / inert rollout.** We will ship a compatibility mapper
   (`"Sorento Dealer" → {brand: sorento, tier: dealer}`, `"End User" → {brand: *, tier: end_user}`)
   that consumes TODAY's compound names, so n8n works before, during and after your migration.
   For that to hold:
   - the entitlement read (`Aggregate` source — the access-types/contact-entitlement endpoint)
     must not change shape SILENTLY. Additive is fine (new `brands[]` + `tiers[]` fields beside
     the legacy `name[]`), rename/removal is not — tell us the cutover and we delete the mapper.
2. **Both-axes filtering must be one call.** Brand and tier land on the SAME tool invocation;
   two sequential filtered calls would double latency on the busiest promo path.
3. **`End User` mapping decision needed from you**: today it has no brand prefix. Is an
   end-user-tier document brand-scoped in the new model (our assumption: yes, brand axis applies
   to all tiers) or globally visible?
4. Existing open item 4 (promotion rows carry `brand` in resolver display) folds into this —
   same field, now load-bearing rather than display-only.

## 🔴 Amendment 2026-08-11 — brand is NOT expressible as company (peer evidence)

The CRM already has a per-contact **company** scope (`respond_contact_companies`, admin-managed,
fail-closed to zero rows when empty — that is what produced our "resolver returns nothing for one
contact" report). It is tempting to conclude the brand axis is redundant. It is not:

- Companies are **Sorento** and **Mocha**; products are duplicated per company (~11.4k each since
  the 2026-07-26 duplication).
- **Cabana has no company of its own.** Our resolver rows confirm it: `company_name` is only ever
  "Sorento" or "Mocha", and the Cabana product CBS212-WH resolves with company **"Sorento"**
  (exec 11894257).
- Therefore company scoping can express "Mocha only" but **cannot** express "Cabana but not
  Sorento". Mapping brand→company would leave Cabana entitlement inexpressible — the exact case
  that motivated this ask.

Two more facts that must shape the migration:

1. 🔴 **CORRECTED 2026-08-11 — an earlier revision of this line was WRONG and would have driven a
   destructive migration.** It read: *"every contact we sampled holds all seven names … the brand
   word in a level name is a LABEL, not a permission … deriving brand entitlement from level names
   would grant everyone every brand."* The first clause was a **sample presented as a population**.
   Actual CRM distribution (peer, all 18 contacts with entitlements): **8 hold 1 name, 3 hold 2,
   2 hold 3, 5 hold all 7**. So for **13 of 18 contacts the compound names ARE real, intentional
   entitlement** — `cabana_dealer`-only contacts exist.

   Why the two measurements disagreed, and it is not a contradiction: our sample was drawn from
   **n8n execution history**, i.e. contacts that have actually messaged the bot (8 distinct, 7 of
   them all-seven, one holding 6). The all-seven cluster is essentially the staff/test population;
   the narrow 13 exist in the CRM but have not chatted recently. Both numbers are correct about
   different populations — ours says nothing about entitlement design, only about who talks to us.

   **Migration rule (supersedes both earlier versions):** SPLIT each narrow holder's compound names
   into `{brands, tiers}` — never zero them, never ignore them. Do NOT auto-derive for the all-seven
   holders: flag those (5 today) for explicit admin re-confirmation, since granting them every brand
   is presumably not the intent. That is a short human decision list, not an automated step.
2. **Two gates can now disagree** (company scope at CRM, brand gate in n8n). A Mocha-only contact
   asking for a Cabana promo must get ONE coherent answer. n8n needs to distinguish "scoped out of
   everything" from "genuinely no matching promotion" — the peer's proposed additive
   `scope: "contact_empty"` on a zero-company scope covers it. **Agreed, and it should land with
   this contract, not separately** (same read, same failure mode). Consumption rule per #121:
   absence must mean NO CLAIM, never "scope was fine", or we must consume it fail-open and it stops
   discriminating.

## What we need back from you

- Agreement (or counter-proposal) on the field names/shapes above for: contact entitlement,
  promotion tagging, tool params, resolver row display.
- Whether entitlement admin UI can set the two axes independently ("this contact: brands
  sorento+cabana, tiers dealer" — the user explicitly wants to configure brand access per contact).
- Migration plan sketch: additive fields first (n8n switches consumers), compound names retired
  last. Rough sequencing/ETA so we can schedule the n8n bundle.
- The `End User` brand-scoping decision (item 3).

## Sequencing on our side (for context, no action needed)

n8n builds now against today's data via the compat mapper: tier ask (numbered, multi-select,
per-query, only when >1 tier entitled and none stated), always-attach answers, brand from
entities. Your additive fields activate the clean path the day they exist — same
inert-until-data pattern as the brand routing (#16) that is already live and waiting on row brand.

---

## ✅ CRM ANSWERED — 2026-08-13 (relayed from the sorento_crm session)

Durable CRM-side artifact: `documentation/plans/UAC-brand-tier-entitlement-split.md`
on PR https://github.com/jayson-odoo/sorento-crm/pull/156 (docs only, no code).
**Read that for the full detail** — the summary below exists so the answers are not
lost to a dead socket, which is how this exchange nearly ended.

Answers to the four asks in §"What we need back from you":

1. **Field shapes — AGREED AS PROPOSED.** Per-contact `brands[]` and `tiers[]` alongside the
   legacy `name[]`; additive, with no rename or removal without a named cutover. Promotions get
   tagged brand + tier. The read path accepts both filters on one call; an empty/omitted `brands`
   means "all brands this contact is entitled to", with the server applying the gate exactly as
   it does for levels today.
2. **Admin UI setting the two axes independently — YES**, and it is an explicit AC, not a maybe.
3. **Migration sequencing — AGREED**: additive fields first → we switch consumers → compound
   names retired last, and the CRM **names the cutover date** rather than inferring it from our
   deploy. No ETA until D1–D3 below land.
4. **End-user brand scoping — STILL OPEN**, recorded as D1. Deliberately left un-thumbed for the
   user.

Two items of ours they PROMOTED from footnote to shipped scope:
- The `scope` discriminator ships WITH this change (same read, same failure mode) as
  AC-SCOPE-01…04, carrying our consumption rule verbatim: **absence means NO CLAIM, never
  "scope was fine"**.
- Our "ask tier only, never brand" decision is recorded as AC-ASK-03 with its reasoning, so a
  later reader does not mistake it for an oversight and "fix" it.

### 🔴 Three decisions block the CRM plan — ALL are the user's

- **D1. Is the `end_user` tier brand-scoped (our assumption) or globally visible?**
  Not hypothetical: five live contacts hold `end_user` alone.
- **D2. Should Mocha-scoped contacts see promotions at all?** All 29 promotions are owned by the
  Sorento company (including all 14 Cabana ones); Mocha owns zero. So a Mocha-only-scoped contact
  sees an empty list regardless of entitlement. Options: re-stamp ownership / make promotion
  visibility company-neutral / accept as intended.

  ⚠️ **CORRECTION 2026-08-13 to our own framing.** We suggested answering D2 "generally", as one
  question about unpopulated companies. The CRM session pushed back and is RIGHT: the QUESTION
  generalises, the ANSWER must not. The instances differ in WHAT is missing:
  - **#134** (MOCHA has no `purchasing` team → hard 404, ~40% of live intervention requests) and
    **#141** (MOCHA holds 3 SLA policy bindings vs SRT's full set → conversation-SLA create 400s,
    one layer past #134) are missing **CONFIGURATION**. Falling back to the default company's team
    set / policy binding crosses no data boundary — which is what both issues already propose,
    with a `routing_fallback` marker.
  - **D2 is missing DATA.** A runtime "fall back to Sorento's promotions" would show a
    Mocha-scoped contact Sorento-OWNED ROWS — precisely what multi-company isolation prevents.
    **D2 must NOT be answered with a fallback**; it is decided once and stamped in the data.

  Read naively, our "answer it generally" would have meant applying #134's fallback pattern to
  promotions — opening a cross-company leak while looking like consistency. Recorded so nobody
  re-derives the wrong half.

  Two supporting facts from the CRM code (their trace, full detail in the PR #156 doc):
  - `company_id` on a `CompanyScopedMixin` model is **auto-stamped from the request scope on
    insert**, so "all 29 promotions are Sorento-owned" records WHO UPLOADED THEM, not a decision
    that Mocha may not see them. Option (a) therefore reads as "we accept the artefact" — never
    as "the artefact expresses intent".
  - Option (b) needs no new machinery: `__company_shared__ = True` already exists
    (`app/models/base.py:103`), attachments use it, and the entity resolver honours it
    (`entity_resolver.py:3788`). A NULL `company_id` reads under any scope.

  ✅ **RETRACTED 2026-08-13 — an n8n-side claim that was WRONG.** We asserted here that the CRM
  resolver still leaks cross-company data and that a D2 fallback would therefore be "the second
  leak". **It is fixed** — `709ef9910` (`fix(resolve): scope fuzzy matches to the contact's
  companies`), 2026-08-07 18:12 +0800, on `origin/main`; independently verified 2026-08-13
  (commit is an ancestor of main, `_company_scope_sql` applied at all 7 raw-SQL probe sites,
  fail-closed `" AND FALSE"` on UNSET/empty scope, Python backstop for the embedding probe that
  cannot carry a SQL clause, and a named regression test for the exact symptom:
  `tests/test_resolve_entity_company_scope.py:105`). So a D2 fallback would be the FIRST
  cross-company leak, not the second — which if anything strengthens the case against it.

  Two lessons kept deliberately:
  - **Why our memory was stale**: it was written ~11:27 MYT on 2026-08-07 and the fix landed
    ~18:12 MYT the SAME DAY. It was accurate when captured and wrong within hours.
  - **Why a grep said "unfixed"**: `entity_resolver.py` does not import the shared
    `company_sql_predicate`; it defines a LOCAL `_company_scope_sql` at line 3700. Searching for
    the shared helper finds nothing and the file looks untouched. `tests/test_raw_sql_company_scope.py`
    still describing the general gap is consistent with the local fix, not evidence against it.

  **Loud vs silent, worth naming:** #134 and #141 fail LOUD (404 / 400) and got filed as bugs.
  D2 fails SILENT — a well-formed empty 200. That asymmetry is why D2 sat undetected while its
  two siblings got tickets, and it is the argument for the `scope` discriminator.
- **D3. Who re-confirms the five contacts holding all seven names, and by when?** Never
  auto-granted.

### Impact on n8n work

**None today.** The compat mapper over the compound names stays correct before, during and after
the migration, so anything built now against current data keeps working. The clean path activates
the day the additive fields exist — the same inert-until-data pattern as the brand routing that
is already live and waiting on row brand.
