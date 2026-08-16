# UAC §DC5

> ⚠️ **`00-SAFETY-always-read.md` (§0) applies to every case here.**

## §DC5. Did-you-mean PICK stays in the offer's domain (#5)

### §DC5-0 ★ — offline `output_exchange` unit, CONTAMINATED code-pick (0-token) — PRIMARY GATE
- **Pin:** `previous_conversation_state = { dym_offer:{id:'e1',domain:'inventory',candidates:[{code:'C2181XUW-P-ENG',
  uuid:'u1',entity_type:'product',for_raw:'C21263XUW-P-ENG',for_hint:'product'}],picked:[]},
  entities:[{raw:'C21263XUW-P-ENG',hint:'product',…}], intent_hint:'check_stock', domain_hint:'inventory' }`;
  `latest_user_message='C2181XUW-P-ENG'`; raw LLM `output.output` = `{entities:[{raw:'C2181XUW-P-ENG',
  current_message:true}], domain_hint:'master_products', intent_hint:'check_product', message_type:'business_query'}`.
- **Assert AFTER the node:** `domain_hint==='inventory'`; `routing.suggested_team==='warehouse'` &
  `suggested_agent==='general_enquiries'` (deriveRouting on the forced domain); `intent_hint==='check_stock'`
  (realigned to `prevState.intent_hint`); `dym_pick_applied===true`; `dym_pick_domain_forced==='inventory'`;
  entities = the picked code (replacing the source token) with prior entities retained.
- **Fail-on-purpose (MANDATORY):** run the CURRENT LIVE `output_exchange` on the identical input →
  `domain_hint` stays `master_products`, `routing.suggested_team==='purchasing_product'` (catalogue route) →
  RED. This is the exact repro (`check stock` pick → catalogue) proven wrong pre-#5.
- **Safety:** §0 all (offline — no egress, 0 LLM tokens).

### §DC5-0b — offline unit, NUMBERED-path pick
- **Pin:** `reference_target='dym'`, `dym_last_result_set=[{idx:2,value:'C2',for_raw:'A',entity_type:'product',uuid:'u2'}]`,
  `dym_offer.domain='inventory'`, `reference_positions=[2]`; raw LLM domain/intent null (bare number).
- **Assert:** picked row resolved; `domain_hint==='inventory'` (forced via `applyDymPick`); `dym_pick_domain_forced==='inventory'`.
  Confirms both code + numbered paths share the force.
- **Safety:** §0 all.

### §DC5-1 ★ — real reformulator flagship: pick a suggested code → STOCK not catalogue  (contact `437264483`) — `parser`
- **Trigger:** `chat-stateful`. T1 = `check stock for C21263XUW-P-ENG` (a miss with a did-you-mean offer).
  T2 = type a suggested code (e.g. `C2181XUW-P-ENG`).
- **Expected:** answer is STOCK for that code (or `No stock records found for <code>` if empty), **NOT** a
  `master_products` catalogue answer; NO "list price / discontinued / Here are the matching products". Parser
  `domain_hint == dym_offer.domain`; routing warehouse.
- **Scoring (LESSON 39):** stock-domain answer OR safe abandon = PASS; catalogue answer = HARD FAIL, RECORD.
  Run ≥3×. Numbered variant: T2 = `"2"`.
- **Safety:** §0 all; full clone; S6 reformulator only; S7a/S7b zero/attributed.

### §DC5-REGR-newquery ★ — NEW query after an offer → domain NOT forced (no-clobber)  (contact `437264483`) — `parser` — **CRITICAL**
- **Trigger:** T1 = stock did-you-mean offer (as §DC5-1). T2 (fresh) = an UNRELATED query, one per run:
  `what promotions do you have`, `show me the order for <customer>`, a DIFFERENT product `check stock for <other>`.
- **Expected:** T2 resolves as the parser classified it — `domain_hint` = `promotion`/`order`/the new
  product's domain, **NOT** `inventory`-forced; the answer is the NEW query (promotions / order / other
  product). `applyDymPick` did NOT run (no candidate `_codeMatches`, `reference_target` not `'dym'`).
- **Fail-on-purpose (the point of this case):** assert `domain_hint !== 'inventory'` (for the promo/order
  variants) — it would be `inventory` ONLY if #5 mis-fired on a non-pick. A pass here that could not detect a
  clobber is void; the assertion must be the negative one.
- **Scoring:** correct new-query domain = PASS; any inventory-force = HARD FAIL.
- **Safety:** §0 all; full clone; S6 reformulator only; S7a/S7b zero/attributed.

### §DC5-REGR-abort — casual abort after an offer → no pick, no force  (contact `437264483`) — `parser`
- **Trigger:** T1 offer; T2 = `no` / `never mind` / `thanks` (fresh each).
- **Expected:** existing casual/abort behavior unchanged (no dym pick, no domain force, escalation-decline
  arm behaves as today); `dym_pick_applied` NOT set, `dym_pick_domain_forced` absent.
- **Fail-on-purpose:** confirm `dym_pick_domain_forced` does not appear (would appear only if `applyDymPick` ran).
- **Safety:** §0 all.

### §DC5-REGR-unrelatedcode — bare code NOT in the offer → resolves on its own domain  (contact `437264483`) — `parser`
- **Trigger:** T1 offer; T2 = a bare code that is NOT one of the offered candidates.
- **Expected:** it resolves as a FRESH query (parser's own domain / continuity), NOT forced to the offer's
  stock domain. `_codeMatches` false for every candidate → `tryDymPick` returns → no override.
- **Fail-on-purpose:** assert the code was NOT reconciled as a pick (`dym_pick_domain_forced` absent) and the
  domain is the parser's, not a forced `inventory`.
- **Safety:** §0 all.

### §DC5-noreg ★ — no-dym normal turn BYTE-IDENTICAL — HARD REGRESSION GATE
- **Trigger (offline unit):** a normal turn with no dym offer and no pick.
- **Assert:** node output byte-identical to current LIVE `output_exchange`, apart from the new diagnostic keys
  which must be ABSENT here (`dym_pick_domain_forced`, `select_all_expanded` not present). Register both as
  drop-when-absent in the replay `norm()` (LESSON 40). Byte-diff vs §DC5-0 must be NON-empty.
- **Safety:** §0 all.

**Promotion:** additive hunks on `output_exchange`; folds into #2's parser publish (parser sub FIRST then
spine), target by node NAME, byte-SHA gated both sides (LESSON 57/58), user-gated, backup-first. Post-promote
verify on REAL turns (LESSON 56): a contaminated code-pick routes to stock; "all" resolves every suggestion; a
new-query-after-offer keeps its own domain.

---

# Change: `domain-switch-word` (#6) — a bare/dominant domain word SWITCHES domain — plan `../plans/domain-switch-word-plan.md`

Scope: **`parser`** (edits `output_exchange` inside the reformulator sub — mock-blind, REQUIRES the real
reformulator; offline `output_exchange` unit runs the pure-code logic 0-token). Fork under test =
`wI5RkNGW3EOJfBdo`; live promote target = `XTODTw`. Repro = clone spine `txiPzSxy3Pclsz6v` exec **10826285**:
`check stock for SRTW902` → dym → pick `SRTWT902` (inventory) → bare `promo` → STOCK again (rev4 reuse-path
carry reused `inventory`). Fix adds a deterministic `_switchDomain` signal (keyword→domain, current-message
only) that suppresses both continuity carries and sets `domain_hint` before blocklist-apply/deriveRouting.
All cases contact `437264483` (FULL access), multi-turn via **`chat-stateful` or `regress-capture`** (uac mode
can't round-trip; **replay is BLIND — the pinned mock bypasses `output_exchange`**). Every case bound by §0
(S1-S8). Diagnostic key: `domain_switched_by_keyword`.
