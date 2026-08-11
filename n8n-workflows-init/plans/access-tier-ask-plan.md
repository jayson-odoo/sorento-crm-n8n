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

## 7. OPEN — narrow-holder cross-brand ask (found 2026-08-11, after the population correction)

Our fixtures all use the 7-name entitlement, sampled from **bot traffic** — which is the staff/test
cluster, not the population. Real CRM distribution: 8 contacts hold 1 name, 3 hold 2, 2 hold 3,
5 hold all 7. So the NARROW holder is the majority and is absent from every fixture we have.

Reachable consequence, worked through the real mapper:

```
entitlement ["Cabana Dealer", "Sorento Office"]
  ask renders  "1. Office  2. Dealer"
  picks Dealer -> ["Cabana Dealer"]   (silently CABANA)
  picks Office -> ["Sorento Office"]  (silently SORENTO)
```

Filtering is CORRECT — the contact gets exactly what they hold. The *question* is what misleads: it
presents a pure tier choice while secretly also switching brand. Under the all-seven assumption this
shape cannot occur, which is why D1–D11 never considered it.

Decision needed before promote **only if cross-brand narrow holders actually exist** — asked the CRM
peer for a shape histogram of the 13. If they exist:
- label the option with its brand where the held set is cross-brand: `2. Dealer (Cabana)`;
- keep the bare tier label when the held set is brand-coherent (the common case), so nothing
  changes for anyone whose tiers all map to the same brand.
If they do not exist, record that as the reason this stays unbuilt — not silence.

⚠️ Also a standing fixture debt: no offline case covers a 1-name or 2-name holder end-to-end
(the mapper unit-tests them, the spine suites do not). TA-6R uses a pinned single-tier entitlement;
that is the only narrow coverage we have.
