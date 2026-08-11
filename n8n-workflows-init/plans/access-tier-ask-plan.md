# Plan — tier-only access ask + always-attach answers (brand × tier split)

Status: DESIGN LOCKED (3 grilling rounds, 2026-08-11). CRM contract pending — ask sent to the
CRM peer session; contract doc: `crm-ask-access-tier-brand-split.md`. n8n build may start
against today's data via the compat mapper (§3). Live stays on the entitlement-union stopgap
(spine `2524fbbd`) until this ships as one reviewed bundle.

## 1. Settled decisions (user-confirmed, do not relitigate)

| # | decision |
|---|---|
| D1 | Access ask RESTORED, but tier-only: `office / dealer / end user`. Never the 5–7 compound options. |
| D2 | Ask fires ONLY when: promotion query AND no tier stated/derivable AND contact entitled to >1 distinct tier. Single-tier contact → use it silently. |
| D3 | Ask is a NUMBERED typed list (no WhatsApp quick-reply buttons), multi-selectable: "1", "1 and 2", "all". |
| D4 | The chosen tier is NOT persistent. Per-query only; a new promotion query re-asks. (Kills the PP-0b sticky-carry class.) |
| D5 | Answers ALWAYS attach the file(s), no cap, no list-then-pick for promo answers. |
| D6 | Brand is its own axis. Parser keeps emitting brand as an ENTITY (`hint: "brand"`); NO new top-level LLM `brand` field (second source of truth + LLM scalar drift). Normalized brand derived deterministically in `output_exchange`. |
| D7 | Brand gate stays: contact's brand entitlement limits what they see. CRM will hold `brands[]` and `tiers[]` per contact; until then the compat mapper derives both from compound names. |
| D8 | Zero downtime / inert rollout. Mapper consumes today's `name[]`; CRM's additive fields activate the clean path; mapper deleted at CRM cutover. |

## 1b. Amendments from the first UAC run (2026-08-11, tester DO-NOT-PROMOTE)

Three blockers; all three are additions to the decisions above, not reversals of them.

| # | decision |
|---|---|
| D9 | **Brand is read from TWO sources, unioned**: brand entities AND the brand half of a COMPOUND stated access level. Measured: "cabana dealer promo for X" makes the LLM emit `access_levels:["Cabana Dealer"]` and NO brand entity, while "cabana promo for X dealer" emits the entity — an entities-only read made the brand gate depend on word order (fork execs 12041502/12041565). `parseLevel` already recovers the brand; consume it. This does NOT reverse D6 — still no new LLM field, still deterministic derivation. The union must run on the RAW LLM levels, before tier-token normalisation destroys the brand half. |
| D10 | **The brand gate fails closed IN n8n**, never by trusting the CRM's response to `access_levels: []`. When `brand_gate_empty`, the answer block and ALL attachments are suppressed; the customer gets the notice + escalation offer only. An access boundary may not depend on another system's undocumented empty-filter semantics — the first build shipped that assumption as a comment asserting it as fact. |
| D11 | **A pending non-tier pick outranks the ask.** `needsTierAsk` takes a `pendingPick` discriminator: a positional pick or continuation against a roster that is not the tier ask (suggest_offer / member_offer / disambiguation / a promo answer being followed up) suppresses the ask entirely. Without it the ask fired on top of an already-resolved pick and discarded it (execs 12041783, 12041879) — plan §2 row 5 was unimplementable as written. |

Mapper (`tests/offline/access-tier/mapper.js`) already carries D9 + D11: `statedBrands()` and
`needsTierAsk(..., {pendingPick})`, 40/40 probe, 9/9 mutations. D10 is a spine wiring change.

Also open, NOT this feature's bug: the CRM entity resolver returns 0 matches / 0 alternatives for
harness contact `437264483` while control contact `477071889` resolves the same tokens exact on the
same lane (execs 12040466 vs 12040525); the pre-change clone reproduces it. Environment/CRM-side —
raise with the CRM peer; it blocks the uac lane, not the design.

## 2. Journey (customer boundary first)

1. "promo for SRTBF11710" — contact entitled {Sorento Dealer, Sorento Office, End User}
   → tiers {dealer, office, end_user} >1, none stated →
   "Which access level do you need?\n1. Office\n2. Dealer\n3. End user\nReply with the number(s) — e.g. \"1\", \"1 and 2\", or \"all\"."
2. "2" → re-run with tier=dealer (+ brand from entities if any) → answer WITH files attached
   (both dealer PDFs in the SRTBF11710 case). No roster gate.
3. "promo for SRTBF11710 dealer" → no ask, straight to files.
4. Contact entitled only {End User} → no ask ever, tier applied silently.
5. Next new promo query → re-ask (D4). Follow-up on the SAME answer (e.g. "the august one") is a
   continuation, not a new ask.
6. Tier the contact does not hold stated ("office" but only end_user entitled) → Q23-style notice +
   answer at their real entitlement (existing gate machinery).

## 3. Compat mapper (the inert bridge)

One function, one place (spine, before get-results input):
`"Sorento Dealer" → {brand: "sorento", tier: "dealer"}`, `"Mocha Office" → {mocha, office}`,
`"End User" → {brand: null (all entitled brands), tier: "end_user"}`.
- Input: `Aggregate.name[]` (today's compound entitlement).
- Output: `entitled_brands[]`, `entitled_tiers[]`.
- When CRM's additive `brands[]`/`tiers[]` fields exist on the entitlement read, prefer them;
  mapper becomes dead code → delete (record a delete-by note when CRM gives cutover).
- get-results/access filter: until CRM accepts `{brands, access_levels(tier)}`, RECOMPOSE compound
  names from (chosen tiers × entitled brands ∩ query brand) — e.g. tier=dealer, entitled brands
  {sorento, cabana}, query brand cabana → `["Cabana Dealer"]`. This is the ONLY place compound
  names are minted, and it dies with the mapper.

## 4. Change surface (build on fork `RnpxEnAV3g20MmKj`, promote later)

- **If4 / ask trigger**: replace with tier logic — proceed when tier resolvable (stated, derivable,
  or single-tier contact); else route to the tier-ask renderer. ⚠️ If4 is an If node — LESSONS §71:
  param-hash EVERY node in the promote diff.
- **Tier-ask renderer**: numbered 3-option message + persist a tier roster
  (`selection_context: 'tier_offer'`, `last_result_set` = the 3 tiers) so the existing positional
  machinery (numbers/"all"/multi) resolves the reply. New context value must not collide with
  `suggest_offer`/`member_offer`/`disambiguation` precedence in output_exchange + compile-current-state.
- **Parser (`output_exchange`)**: tier-pick reconciliation (positions against tier roster → tier
  value(s), NOT entities); tier words in the message ("dealer price", "harga dealer") → stated tier;
  normalized brand derivation from entities. Ask turn must not clobber the pending query — the
  original scope (product/category entities) is carried to the answer turn (same shape as S5
  scope-reuse, but for the ask round-trip).
- **promo-picker**: S4 list-gating REMOVED (D5) — sort (S4b), strict not-found, per-product
  decomposition, scope echo, Q23 notice all STAY. Roster/pick lane stays only as the vestigial
  positional path for old sessions; new answers attach immediately.
- **get-results input (`semantic_input`)**: tiers chosen/derived → compound recomposition (§3)
  replaces the union expression.
- **compile-current-state**: tier_offer arm (persist roster + context), D4 non-persistence (tier
  never written to session vars).

## 5. Open items / blockers

- CRM contract reply (field names, End User brand-scoping, migration sequencing) — ask sent.
- Tier vocabulary for the parser: "dealer/office/end user" + Malay variants — enumerate in offline
  fixtures from real transcripts before writing the derivation.
- UAC family: new file `tests/uac/TA.md` (tier-ask) — cases per journey rows 1–6 + collision cases
  (tier ask pending, customer sends a NEW query / a member-offer number / casual).
- Offline probes first (per pipeline): mapper unit probe, tier-derivation probe, ask-trigger probe,
  each with mutate.sh fail-on-purpose.

## 6. Explicitly rejected

- Top-level LLM `brand` output field (D6 rationale).
- Persistent tier carry (D4).
- File-count cap on answers (D5 — user: send them all).
- Tier-only entitlement without a brand axis (cross-brand leak — rejected in Q6).

## 7. Narrow-holder shapes — measured, and what they do NOT require (2026-08-11)

Our fixtures all use the 7-name entitlement, sampled from **bot traffic** = the staff/test cluster.
CRM shape histogram of the 13 narrow holders (peer, no identities):

```
end_user-only  : 5   ['end_user']
cross-brand    : 4   3x ['cabana_office','sorento_office']
                     1x ['cabana_office','mocha_office','sorento_office']
brand-coherent : 4   3x ['dealer']   (legacy unprefixed token MEANING Sorento Dealer)
                     1x ['dealer','end_user','sorento_office']
```

**Cross-brand holders exist (4 of 13) — but they are SAME-TIER multi-brand.** The multi-tier
cross-brand shape this section originally worried about (`Cabana Dealer` + `Sorento Office`, where
a tier label silently switches brand) has **zero live instances**. Verified through the real mapper:
every observed narrow shape resolves correctly, and only the two multi-tier shapes fire the ask.

### The brand axis does NOT need its own ask — measured, not assumed

The peer predicted that a same-tier multi-brand holder gets no ask and is then sent every brand's
copy, reviving the duplicate-file problem. The filter statement is true (`recompose` returns
`["Cabana Office","Sorento Office"]`); the harm is not. Live exec 12031183, a PRODUCT-scoped promo
answer under all-seven entitlement, returned:

```
2 promotions x 3 TIERS = 6 files, ALL SORENTO
```

Not one Cabana or Mocha row, despite the contact holding every brand's levels — because a product
belongs to ONE brand and its promotions are that brand's. **Tier is the duplication axis; brand is
not, for product-scoped queries.** That is why the tier ask alone takes this case from 6 files to 2.

Brand still matters for **category-scoped / brand-less broad** queries, which do span brands
("promotion for bathroom furniture" → 15). For a cross-brand holder that means seeing every brand
they hold — judged CORRECT (distinct documents they are entitled to), not noisy (the tier case was
a defect because it was the SAME document three times). Revisit only if that judgement is wrong.

### What stays open

- Multi-tier cross-brand labelling (`2. Dealer (Cabana)`): **conditional, currently unreachable.**
  Post-split, any brands x tiers combination becomes expressible, so this moves from "cannot occur"
  to merely "unpopulated" — a weaker guarantee. Build it the day such a holder is created.
- **Two gates disagreeing** — asked the peer whether `respond_contact_companies` scoping also
  filters the promotion read. If a cross-brand holder is company-scoped to Mocha only, do their
  `Cabana Office` rows return anything? That is the one shape where "no brand ask" could still be
  wrong.
- Migration note handed to the CRM: the legacy unprefixed `['dealer']` token means **Sorento
  Dealer**; a naive `split('_')` mangles it.

### Fixture debt (now actionable)

Traffic-derived fixtures can never contain these shapes — the narrow holders barely chat. Synthesize
spine-level cases from the histogram above rather than waiting for traffic: end_user-only,
`['dealer']` legacy, and the same-tier cross-brand pair. Today only the mapper unit-tests them
(M2/M3/R5/R6/A2); TA-6R is the sole narrow case at the spine level, and it uses a pinned fixture.

## 8. Company scope vs entitlement — the two gates DO disagree, live (2026-08-11)

CRM peer, answering our two-gates question:

- `apply_company_scope` is a **router-level dependency on every `/api/v1/*` request**; an ORM filter
  enforces it on every query. Resolver, promotion read, attachments — one mechanism, no opt-out.
- **Every promotion in the system is owned by the Sorento company** (Sorento 29, Mocha 0), including
  all 14 Cabana-described promos. Brand ⊥ company cuts painfully here.
- Therefore a contact company-scoped to **Mocha only sees ZERO promotions, ever**, no matter what
  access levels they hold. Entitlement says yes; company scope silently says no; the response is a
  well-formed empty. **No ask can repair this** — rows are filtered out before entitlement is
  consulted.

### Live impact check (ours, n8n side)

Swept every contact with token-bearing turns in recent live history (26 contacts): **none shows the
all-empty signature.** Every one resolves at least some turns; the partial empties are ordinary
misses. So no real customer is currently stuck in the empty-scope state on the promotion path.

The one contact that IS in it is our own test contact `437264483`, and the timing corroborates the
peer's membership hypothesis rather than a code cause:

```
05:08:53Z  LIVE  contact 437264483  -> 8 matches   ✓
06:50:29Z  FORK  contact 437264483  -> 0 matches   ✗
06:51:04Z  FORK  contact 477071889  -> 2 matches   ✓  (same lane, same tokens, 35s later)
```

Same URL construction on both lanes (`?contact_id=…&space_id=364817`, verified) — so the lane is not
the variable; the contact's membership changing between 05:08 and 06:50 is.

### What this means for THIS feature

On an empty-scope contact the tier ask makes the experience **worse, not better**: today they get
"no promotion found" in one turn; with the ask they are asked to pick a tier and *then* told nothing
was found — a wasted round-trip on a query that was guaranteed empty before it ran.

🔴 **Do NOT build an n8n heuristic for this** (e.g. inferring empty-scope from zero-matches, or from
the slow-and-empty latency signature). Both are guesses about another system's internal state, and
the last time we encoded an assumption about CRM empty-semantics as if it were fact, it shipped as
D10's fail-open. The correct fix is the CRM's additive `scope: "contact_empty"` discriminator, which
lets us render "I couldn't verify your account — escalating" instead of "no promotion found".
Until it exists, this degradation is **accepted and documented**, not worked around.

Business question raised to the CRM peer's user, not ours to decide: if Mocha-branded promotions are
meant to reach Mocha-company contacts, either promotions need company re-stamping / multi-company
visibility, or those contacts need Sorento membership for promo purposes.

### Fixture addition (synthesized, per §7's fixture debt)

Add a **Mocha-company-scoped contact** shape: non-empty entitlement, zero rows returned. It is the
one shape that guarantees an empty answer to an entitled ask, and no traffic fixture will ever
contain it — such contacts get nothing worth screenshotting.
