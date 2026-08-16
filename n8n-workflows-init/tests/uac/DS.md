# UAC §DS

> ⚠️ **`00-SAFETY-always-read.md` (§0) applies to every case here.**

## §DS. Domain-switch-word cases

### §DS-0 ★ — offline `output_exchange` unit, switch-over-reuse (0-token) — PRIMARY GATE
- **Input (synthetic pin):** prev state `{domain_hint:'inventory', entities:[{raw:'SRTWT902',hint:'product'}]}`;
  LLM output `{message_type:'clarification', domain_hint:null, intent_hint:null, entity_op:'reuse', entities:[]}`;
  `latest_user_message:'promo'`.
- **Assert:** `output.output.domain_hint==='promotion'`; `domain_switched_by_keyword==='promotion'`;
  `domain_reused_entityless` ABSENT (reuse carry suppressed); carried `SRTWT902` still in
  `output.output.entities` (product compatible with promotion); routing (deriveRouting) = `marketing_promotion_*`.
- **Fail-on-purpose:** on UNPATCHED `output_exchange` this same input yields `domain_hint:'inventory'` +
  `domain_reused_entityless:true` — the assert on `domain_hint==='promotion'` MUST go red. (Prove the gate can fail.)
- **Safety:** §0 all (offline, no egress).

### §DS-0b — offline unit, other switch domains + filler tolerance
- **Inputs (same prev inventory+SRTWT902, LLM null-intent reuse):** `latest_user_message` ∈
  { `order`, `incoming`, `catalogue`, `any promo?`, `show me the catalogue`, `stock ada?` }.
- **Assert:** domain switches to `order` / `incoming` / `master_products` / `promotion` / `master_products` /
  `inventory` respectively; `domain_switched_by_keyword` = that domain each time; filler-wrapped variants still
  fire (filler stripped to one switch token); carried entity present or blocklist-pruned per compatibility.
- **Safety:** §0 all.

### §DS-R1 ★ — real query does NOT double-fire — HARD REGRESSION GATE (offline unit)
- **Input:** prev inventory; LLM `check stock for SRTW902` shape with current entity
  `{raw:'SRTW902',hint:'product',current_message:true}` (`intent_hint:check_stock` → `_explicit`).
- **Assert:** `_switchDomain` null → `domain_switched_by_keyword` ABSENT; domain resolves via the normal path
  (inventory), NOT via #6. #6 must NOT touch it.
- **Safety:** §0 all.

### §DS-R2 ★ — genuine continuation (NO domain word) still carries — HARD REGRESSION GATE (offline unit)
- **Input:** prev inventory + `entities:[SRTWT902]`; LLM `how about SRTWT5902` with current entity
  `{raw:'SRTWT5902',hint:'product',current_message:true}`, `intent_hint:null`.
- **Assert:** `_switchDomain` null; rev4 entity-bearing carry fires → `domain_hint==='inventory'`,
  `domain_inherited_compatible===true`; `domain_switched_by_keyword` ABSENT. Continuity preserved, #6 inert.
- **Safety:** §0 all.

### §DS-R3 ★ — dym pick (bare code) is still a PICK, not a switch — HARD REGRESSION GATE (offline unit)
- **Input:** an active dym offer; `latest_user_message` = an offered CODE (e.g. `SRTWT902`).
- **Assert:** the dym-pick path (#5) resolves the pick as today; `_switchDomain` null (a code is unmapped in
  `_DOMAIN_SWITCH_WORDS`) → `domain_switched_by_keyword` ABSENT; #6 does not fire. Confirms code-vs-word triggers
  cannot collide.
- **Safety:** §0 all.

### §DS-R4 — ambiguous / excluded words do NOT switch (offline unit)
- **Inputs (prev inventory, null-intent reuse):** `latest_user_message` ∈ { `balance`, `delivery`, `price`,
  `promo stock` }.
- **Assert:** `_switchDomain` null for all (excluded words + mixed-domain message) → `domain_switched_by_keyword`
  ABSENT → rev4 carry runs (reuses inventory) unchanged. Guards the contamination boundary (D8/R1).
- **Safety:** §0 all.

### §DS-1 ★ — repro e2e (`chat-stateful`, real reformulator) — FLAGSHIP
- **Trigger:** T1 `check stock for SRTW902` → dym offer → T2 pick `SRTWT902` (inventory shown) → T3 `promo`.
- **Assert (T3):** `output.output.domain_hint==='promotion'`; `domain_switched_by_keyword==='promotion'`;
  routing recomputed to `marketing_promotion_*` (NOT `warehouse`); get-rag/get-results ran on PROMOTION (NOT the
  stock file returned at T2); carried SRTWT902 present in entities.
- **LLM precondition (record):** T3 raw `_parser_raw` has `intent_hint:null` / `domain_hint:null` (`!_explicit`).
  If the live LLM decisively classifies bare "promo" as promotion, #6 is simply unneeded that turn (domain
  already promotion) — record, not a failure.
- **Safety:** §0 all — reply via `chat:reply`, no respond.io send/comment (S1), no assign/SLA/PIC (S2), no
  session-PUT (S3), get-results read-only (S4), `is_test===true` on every sub (S5), S6 `parser`-bound, S7
  sink-delta+attribution clean.

### §DS-2 — other switches e2e (`chat-stateful`)
- **Trigger:** after a T1/T2 stock turn: (a) T3 `order` → domain `order`, routing `customer_service`; (b) fresh
  chain, T3 `incoming` → domain `incoming`, routing `purchasing`.
- **Assert:** `domain_switched_by_keyword` = the switched domain; routing recomputed; carried entity retained if
  compatible, else blocklist-pruned (customer under inventory/incoming drops → broad).
- **Safety:** §0 all.

### §DS-3 — off-continuity inert (single-turn, no prior state) — regression
- **Trigger:** 5-8 single-turn corpus messages whose first token is a domain word but which carry an entity
  (e.g. `stock for AP7540P`, `promo for brand X`), no prior state.
- **Assert:** `domain_switched_by_keyword` ABSENT; domain unchanged vs a pre-change run (no spurious switch when
  the message legitimately IS a query). §0 all.

**Promotion (§DS-promote):** four additive/one-line hunks on `output_exchange` (A insert map+`_switchDomain`,
B/C `&& !_switchDomain` on the two carry gates, D apply switch). Splice ONLY the #6 blocks onto live `XTODTw`
(co-resident with rev4+decline-flag+dym — NEVER wholesale-replace), target by node NAME, byte-SHA gated both
sides (LESSON 57/58), strip trailing whitespace, parser sub FIRST then spine (spine untouched here), user-gated,
backup-first. Register `domain_switched_by_keyword` as drop-when-absent in the replay `norm()` (LESSON 40).
Post-promote verify on a REAL turn (LESSON 56): bare `promo` after a stock turn routes to promotion, not stock.

---

# Change: `tool-loop-removal` — delete the per-tool loop from the spine

Plan: **`../plans/tool-loop-removal-plan.md`**. Scope tag: **`deterministic`** (plan §8 names "RAG
selection" in that tier). Build target clone **`txiPzSxy3Pclsz6v`**; live spine
`9qVyfUxmRQqrpGRMDLRuz` must stay at `a40cd16d` for the whole build.

**What changed:** `tool-filter` now returns exactly ONE flat tool item (highest `similarity`, tiebreak
`name` ASC); `Split Out1` and `Loop Over Items` are deleted; `If6 out1` takes over the loop's `out0` and
feeds `Aggregate1` directly. Full diff in plan §5.

**Why this UAC is unusually broad:** the removed nodes sit on the single path every answered turn AND
every miss turn takes, for all 7 domains. There is no domain gate and no feature flag. Coverage is
per-domain by construction, not by sampling.

### ⚠️ THE ONE THING THIS SUITE EXISTS TO CATCH
`Loop Over Items out0` is the join that carries "no result" into `Aggregate1 → not-found-error-message`,
where every miss template and the frozen escalate phrase live. If `If6 out1 → Aggregate1` is missing or
wrong, **every not-found turn dead-ends: the customer gets nothing and the execution still reports
`status: success`** (memory `unwired-error-output-masks-failure`; LESSONS §61a, measured on clone
`get-access-types` exec `9523682`). Therefore:

> **BINDING RULE for this whole section: no case may be scored on execution status.** Every miss case
> asserts **per-node runData presence** — `runData['Aggregate1'].length >= 1` **and**
> `runData['not-found-error-message'].length >= 1` — plus a non-empty `escalate_message`. A case whose
> only evidence is `status:success` is **void**, not weak (cf. §0 S7b's retracted execution-count gate).

### Drivers, discipline, and pre-conditions (read before running anything)

- **Single-turn cases:** `tests/harness/drive-clone.py <tag> "<message>"` → `zz-canary-run`
  (`POST /webhook/zz-run-hint`), mode `uac`, contact `437264483`. Returns the egress log.
- **Multi-turn cases (`-CONT`, `-DYM`, X6/X7/X8):** the chat console
  `https://automate-sorento.foundryx.my/webhook/58a0adb6-3c45-42cf-bf1c-bf09c430a142/chat`
  (`zz-chat` `oyYfVvZHRZpWubTy`), mode `chat-stateful`, session R/W → `respond_contacts_test`. `uac` mode
  cannot test follow-ups (session write is orphaned; LESSONS §31/§42).
- **Deterministic cases** inject `message.mock_reformulator_output` to pin `domain_hint` per domain at 0
  token cost (LESSONS §28). This is exactly the right tool here: the change is downstream of the parser,
  and per-domain coverage needs *deterministic* domain routing.
- **P-CLONE (blocking):** clone `activeVersionId` recorded at the top of the run log, and **discard the
  first turn after any publish** — a run fired seconds after a write can execute the PREVIOUS version.
  This produced a documented FALSE PASS on the crossdomain feature (FP1).
- **P-EXEC (blocking):** every case records its **executionId**. The crossdomain review's central
  evidence complaint was a run log that mapped no case to an exec — do not repeat it.
- **P-BASE (blocking, run BEFORE the edit):** capture the pre-change baseline on the clone for
  §TL-R2/§TL-AGG — a 1-tool miss turn's `Aggregate1` output and the full `user_response`. Without it the
  byte-identical gates are unfalsifiable. Reference values from live: exec **`11060071`** (1-tool incoming
  miss, `Aggregate1` = `{response_intro:["No matching results found."]}`) and exec **`11049139`**
  (2-tool inventory miss, `{response_intro:["No matching results found.","No matching results found."]}`).
- **P-CONTACT (prerequisite, unchanged):** the partial / ask-for-access contact is still **TBD** (plan
  §7.1). §TL-ACC-partial is **BLOCKED** until it exists; record it as blocked, never as passed.
- **Do not run concurrently** with a golden capture/replay — both share `respond_contacts_test` for
  `437264483` and the `main-message-list-test` list (LESSONS §30).

**Every case below is bound by §0 (S1–S8).** In addition, all cases carry the three structural
assertions from plan §10(TL-b): `runData['tool-filter'][0].data.main[0].length === 1`,
`runData["Call 'sub-get-results'"].length === 1`,
`runData['sorento-sub-respond-sendmsg-respond2'].length <= 1`. **A run with 2 sendmsg runs is a HARD
FAIL and halts the cycle** — on live that is two WhatsApp messages to one customer.

---
