# Run: `parser-domain-continuity-carry` — §23 + 18-chain continuation suite — 2026-07-15 (tester)

Change: domain continuity moved LLM prompt → downstream `output_exchange` code. Plan
`plans/parser-domain-continuity-carry.md` (§C7 = 18 mined chains); UAC `tests/UAC.md` §V0/§23 (A/B/C/D).

## Targets (verified live before asserting)
- Clone `txiPzSxy3Pclsz6v` — active, versionId `6af34046-2f4a-4773-8a9d-7e929ea41efd`.
- Reformulator fork the clone calls = **`wI5RkNGW3EOJfBdo`** ("sub-semantic-parser FORK
  domain-continuity-carry"), active. Wiring: clone `Call 'sub-query-reformulator'` → `wI5RkNGW3EOJfBdo` ✓.
- **Published fork proven to run the edits** (empirically, not by versionId): AI Agent `.text` has the
  `Previous domain:` line DELETED + the `Previous response:` sanitize regex (Edit 1a/1b); `output_exchange`
  has `domain_signal`, `domain_inherited_compatible`, `domain_reused_entityless`, `domain_inherit_blocked`,
  `_sig` gate. Confirmed on live sub-execs (e.g. 8715742/8715955 carry `domain_signal` + diagnostics).
- **⚠️ `domain_signal` is BINARY `explicit|none`** in the shipped fork (systemMessage `"explicit|none"`),
  NOT the plan's three-valued `explicit|inferred|none`. Both carry blocks gate on `_explicit =
  domain_signal === 'explicit'` and fire the carry when `!_explicit` (i.e. `none`). See DESIGN NOTE 1.
- Driver: **`chat-stateful` console lane** — chat webhook `58a0adb6-…/chat` (`{action,sessionId,chatInput}`)
  → dispatcher `2D0cw2Y1aPW2LOlU` → clone → REAL fork. Contact `437264483` (FULL). Session row
  `respond_contacts_test.437264483` reset ONCE before each chain, NEVER mid-chain. NOT pinned replay.
- Assertion source: fork sub-exec `output_exchange` output (`domain_hint`, `domain_signal`, `entities`,
  diagnostics, `broaden_dropped`) via `get_execution`/REST single-exec GET. `domain_signal` passes through
  `output_exchange` unchanged, so FINAL ds == the LLM's this-turn signal (V0b source).

## VERDICT: PASS — coordinator hole CLOSED, charmant bug FIXED, 17/18 chains clean; §0 zero-egress every turn.
No hard regression, no egress leak. **2 triage flags + 1 domain_signal inconsistency** (all soft / not
caused by this change); 1 design note on the binary-signal collapse. Details below.

---

## §23-A — continuity must NOT regress

| case | turns | exec (T2) | LLM ds | FINAL dh | mechanism | verdict |
|---|---|---|---|---|---|---|
| **A1 ★** | eta SRTWB7249 → **SRTWC286-SH** (bare) | 8715955 | none | **incoming** | `domain_inherited_compatible` (LLM emitted dh=null) | **PASS** — bare code stayed incoming, NOT master_products; SRTWC286-SH entity retained (not broaden_dropped). Coordinator hole CLOSED. |
| **A5** | eta SRTWB7249 → list price of SRTWC286-SH | 8716045 | explicit | master_products | none (explicit wins) | **PASS** — decisive "list price" → no carry; `domain_inherited_*` absent. Pairs with A1 (signal both ways). |
| **A2** | delivery kean wah → SMC202606-0001 (bare) | 8716354 | none | order | `domain_inherited_compatible`+`domain_reused_entityless` | **PASS** — order carried. |
| **A3i** | any promotion sorento → **sink mixer** | 8716381 | **explicit** | master_products | none | **TRIAGE** — LLM read "sink mixer" as a decisive product-category query (ds=explicit) → switched to master_products, did NOT carry promotion. LLM's this-turn call, not a carry-mechanism bug (see FLAG 1). |
| **A3ii** | list price srtwc286-sh → how much wc286-sh? | 8716416 | explicit | master_products | none (LLM classified directly) | **PASS** — master_products held. (T1 8716394 ds=**none** on "list price" — see FLAG 2.) |
| **A4** | info SRTBF117 → **and the price?** (entity-less) | 8716449 | none | master_products | `domain_reused_entityless` (Edit 2a) | **PASS** — reuse-path carry fired; SRTBF117 reused (current_message:false); mt=business_query (not overwritten). |

## §23-B — contamination fixed

| case | turns | exec (T2) | LLM ds | FINAL dh | verdict |
|---|---|---|---|---|---|
| **B1 ★ (charmant repro, live bug 8655477)** | Check eta Srtwt9611 gm → **Any delivery for charmant hardware** | 8716676 | explicit | **order** | **PASS** — dh=order (NOT incoming); `charmant hardware` customer entity PRESENT, NOT in broaden_dropped; reply = charmant orders, NOT the stale SRTWT9611 incoming file. Every HARD-FAIL condition avoided. LLM classified order directly (ds=explicit); the compat-gate was a moot safety net. |
| **B2** | any promotion sorento → list price of srtwc286-sh | 8716629 | explicit | master_products | **PASS** — decisive price override survives; product retained; not carried as promotion. |

## §23-C — 18 mined chains (real reformulator)  ["carry" rows = FIRM]

| # | pair | expected | FINAL dh (T→T) | ds | mechanism | verdict |
|---|---|---|---|---|---|---|
| C1 ★ (carry) | any incoming 286 → SRTWC286-SH | incoming→incoming | incoming→**incoming** | none | `domain_inherited_compatible` | **PASS** — carry fired on bare code |
| C2 (switch) | SRTWC286-SH → Certificate sc07 | →product_attachment | incoming→**product_attachment** | explicit | explicit wins | **PASS** ✅switch |
| C3 (positional) | Certificate sc07 → 3 | →product_attachment | product_attachment→**product_attachment** | none | `domain_inherited_compatible` (op=reuse positional) | **PASS** |
| C4 (carry) | container ecmu5054141 → Ymmu6308003 DC1 | incoming→incoming | incoming→**incoming** | explicit | LLM direct (continuity held) | **PASS** (broaden_dropped warehouse:DC1, benign) |
| C5 (carry) | list price srtwc286-sh → how much wc286-sh | master_products→same | master_products→**master_products** | explicit | LLM direct | **PASS** |
| C6 (carry) | cert wc286 → certificate wc286 | product_attachment→same | product_attachment→**product_attachment** | explicit | LLM direct | **PASS** |
| C7 (switch) | how much wc286-sh → cert wc286 | →product_attachment | master_products→**product_attachment** | explicit | explicit wins | **PASS** ✅switch |
| C8 (carry) | stock srtscbd331-uf → acc-ks7001-yg stock | inventory→same | inventory→**inventory** | explicit | LLM direct | **PASS** |
| C9 (switch) | acc-ks7001-yg → [Hai] → BEAU5970247 GRN | →goods_receive | inventory→(casual)→**goods_receive** | explicit | explicit wins (casual mid = dh null, no carry) | **PASS** ✅switch (reply "don't support goods receive/SPO") |
| C10 (switch) | Enyxion delivery → Srtwc8517-250mm stock | order→inventory | order→**inventory** | explicit | explicit wins; prior customer:Enyxion dropped (correct), current entity retained | **PASS** ✅switch |
| C11 (switch) | Srtwc8517-SH-UF stock → …-250 eta | inventory→incoming | inventory→**incoming** | explicit | explicit wins | **PASS** ✅switch |
| C12 (carry) | …-250 eta → cks6647 eta | incoming→same | incoming→**incoming** | explicit | LLM direct | **PASS** |
| C13 (switch) | order one siew SRTKT72SS → stock balance srtkt71-ss | order→inventory | order→**inventory** | explicit | explicit wins; customer:one siew dropped (correct), srtkt71-ss retained | **PASS** ✅switch |
| C14 ★ (switch, entity-less) | info SRTBF11834 → technical drawing measurement | →product_attachment | master_products→**product_attachment** | explicit | explicit wins; SRTBF11834 reused (current_message:false) | **PASS** ✅switch, prior product retained |
| C15 (carry) | technical photo SRTWT2634-RG → product photo SRTWT2634 | product_attachment→same | product_attachment→**product_attachment** | explicit | LLM direct | **PASS** |
| C16 (carry) | wc 8152 stock → **Yes** | inventory→inventory | inventory→**null** | none (mt=casual) | casual excluded from carry | **TRIAGE** — bare "Yes" classified casual → dh=null → safe clarify reply. Not a regression from this change (casual exclusion pre-exists). See FLAG 3. |
| C17 (no-prior) | Srtwc286 (T1 no prior) → stock srtwc286-250mm | →inventory | (T1 null, NO carry diag) → **inventory** | explicit(T2) | T1: `domain_inherited_*` ABSENT (no spurious carry) | **PASS** — structural assertion met |
| C18 (carry) | order syntalun cks319 → check for customer syntalun | order→order | order→**order** | explicit | LLM direct (compat-carry moot) | **PASS** (customer ∉ DOMAIN_BLOCKED_HINTS.order confirmed; LLM classified order directly) |

**Carry-row scorecard (firm):** C1 ✓(carry fired) · C4 ✓ · C5 ✓ · C6 ✓ · C8 ✓ · C12 ✓ · C15 ✓ · **C16 TRIAGE** · C18 ✓.
**Switch rows:** C2/C7/C9/C10/C11/C13/C14 all switched to the EXPECTED domain (no third-domain drift, no wrong-carry); on every switch the current entity was retained and the prior incompatible scope correctly dropped.

## §23-D — off-continuity inertness
Covered by C17 T1 (bare "Srtwc286", empty prev state): `domain_inherited_compatible`/`domain_inherit_blocked`
ABSENT, no spurious carry. First-turn queries throughout (A/B/C T1s) show no carry diagnostics when prev
state empty. Change is inert with no prior state. **PASS.**

## §V0b — domain_signal LLM validation (binary explicit|none)
- **explicit** correctly set on decisive-term turns: eta/ETA, delivery-for-customer, stock, GRN,
  certificate, technical drawing/photo, "list price" (C5 T1, A5, B2). ✓
- **none** correctly set on bare-code / positional / entity-less-reuse turns: SRTWC286-SH, SMC202606-0001,
  "3", "and the price?", bare "Srtwc286", casual. ✓ — this is what lets the carry fire on the coordinator
  hole (A1/C1).
- **Inconsistencies (FLAG 2):** "list price of srtwc286-sh" got **ds=none** at A3ii T1 (8716394) but
  **ds=explicit** at C5 T1 (8717006)/A5/B2 — identical decisive phrase, run-to-run LLM variance. Also
  C13 T1 "check order…" → ds=none (order). All benign in this suite (no wrong carry resulted), but a
  decisive term marked `none` alongside an INCOMPATIBLE prior domain would misfire the carry — latent risk.

---

## §0 zero-egress (S1–S6) — HOLDS on EVERY turn
Verified from clone execution runData on representative execs across every turn-type — carry
(clone 8716819), not-supported/GRN (8717138), not-found+escalate-offer (8716992), order-held (8717432),
inventory (8717110), + A5 T2 (8716044):
- **S1** — `egress_ran=NONE`: `send-message-files/images/video` never executed; send always routed via
  `sorento-sub-respond-sendmsg-respond2` → sub **`ublq9nSlrpz63xan`** (chat fork) → `{success:true}`
  (reply to redis `chat:reply`, no `api.respond.io/.../message` POST). `production=false`.
- **S2** — `Call 'sub-human-intervention'` never executed (no turn was an escalation CONFIRMATION; the
  "escalate?" offers are display-only). No assign/SLA/PIC/queue write.
- **S3** — `save-session-vars` (prod PUT) + `update-human-intervened` never executed; session R/W to
  `n8n_test.respond_contacts_test` via pg.
- **S4** — get-results ran READ tools only (crm_incoming_stock_list / stock / order / master-products /
  attachment reads returned data); never `crm_it_support_ticket_create`.
- **S5** — chat-stateful mode (pg session R/W ran); every invoked sub carried `is_test`.
- **S6** — real reformulator fork (gpt-5.4-mini) once per turn (parser-scope driver cost, not a violation);
  consume-main `Basic LLM Chain` (gpt-4.1-mini) ran ONLY on legitimate clarification turns
  (C16 T2 "Yes", C17 T1 bare "Srtwc286") — allowed per §0-S6. No new/unexpected token sink observed.

---

## FLAGS / findings

**FLAG 1 — A3i "sink mixer" did not carry promotion (TRIAGE, not a bug).** After "any promotion for
sorento", "sink mixer" got ds=explicit → master_products (LLM read it as a decisive product-category
query). The carry correctly did not fire (explicit wins by design). Removing the "Previous domain:" anchor
(the fix's intent) means the LLM now classifies from this-turn-only, and "sink mixer" reads as a product.
Defensible; flagged for planner/reviewer judgment on whether promotion-context bare terms should carry.

**FLAG 2 — binary `domain_signal` is run-to-run inconsistent on "list price".** Same phrase → explicit
(C5 T1/A5/B2) vs none (A3ii T1). Benign here, but a decisive term mis-signalled `none` with an
incompatible prior domain present would produce a WRONG carry. The whole fix leans on this signal being
right (plan §C6 V-P0b). Recommend the reviewer weigh signal robustness before promotion.

**FLAG 3 — C16 bare "Yes" → casual → domain dropped to null (TRIAGE, not a regression from this change).**
The plan's C16 asserts "bare Yes must not drop/rewrite domain"; observed dh went inventory→null because the
LLM classified "Yes" (after a stock LISTING, no yes/no question) as `message_type:casual`, which BOTH carry
blocks deliberately exclude (`message_type !== 'casual'`). This exclusion pre-exists the change (old 2a dead
code had the same guard) and message_type is not touched by the domain-carry edits, so this is not a
regression introduced here. Reply was a safe clarification (no wrong data, no egress).

**DESIGN NOTE 1 — binary vs three-valued domain_signal.** The plan specified `explicit|inferred|none`; the
shipped fork collapses to `explicit|none`. Functionally OK for the coordinator hole ONLY BECAUSE the LLM
reliably emits `none` (not `explicit`) for bare codes — observed on every bare code in this suite
(A1/A2/C1/C3/C17 T1). The binary design makes "inferred" and "none" indistinguishable, so correctness rests
entirely on the LLM never marking a bare-code inferred guess as `explicit`. Held throughout this run;
recorded as a design dependency for the reviewer.

**Mechanism coverage note.** The Edit-2b compat carry (`domain_inherited_compatible`) fired e2e on A1/C1
(bare code after incoming, OVERRIDE to prev domain) and A2. Edit-2a reuse carry
(`domain_reused_entityless`) fired on A4/A2/C3. The `domain_inherit_blocked` safety net did NOT trigger
e2e — every incompatible switch (charmant B1, C10, C13) was classified `explicit` by the LLM and handled
directly; the block path is proven by the offline V0-c unit, not e2e (expected).

**Get-results / token sinks.** No orphaned get-results agent LLM and no new token sink (e.g. reformulator)
observed beyond the one reformulator fork call per turn. get-results ran as deterministic MCP reads.

## Acceptance vs plan §C8
1. All A carry/override correct — **PASS** (A1/A2/A4 carry; A5 override). A3i triaged (LLM this-turn call).
2. B flip to correct — **PASS** (B1 charmant → order, customer retained, no stale file; B2 override).
3. C chains reviewed — **17/18 PASS**, C16 triaged (casual, not a regression); all switches to expected
   domain, all firm-carry rows carried except C16.
4. Offline units — NOT re-run by tester this cycle (coder/§V0 gate); e2e supersedes for the carry mechanism.
5. Zero egress §0 S1-S6 — **PASS** every turn.
6. Only the parser sub changed — clone/spine untouched; fork `wI5RkNGW3EOJfBdo` only.

**Recommendation: APPROVE for reviewer sign-off** — the coordinator hole is closed (A1/C1), the charmant
contamination bug is fixed (B1), continuity holds on all firm carry rows except the pre-existing casual
"Yes" case, and zero egress holds throughout. Reviewer to weigh FLAG 2 (signal robustness) + DESIGN NOTE 1
(binary collapse) before live promotion. Session row reset to `{"variables":{}}` after the suite.

---

# REVISION 3 — 2026-07-16 (re-test after Flag-2 hardening rev3)

Coordinator applied rev3 to fork `wI5RkNGW3EOJfBdo` (new active **`4267927c-77bb-4586-9c82-ce2a95902cfc`**):
(1) **deterministic effective-signal** in `output_exchange` — bare-message → force `none`; decisive
`intent_hint` + non-null domain → force `explicit`; else fall through to the LLM signal; new diagnostics
`domain_signal_effective` + `domain_signal_source`. (2) AI Agent Human label `User answered:` →
`Current user message:`. The carry now keys on `domain_signal_effective`, not the raw LLM `domain_signal`.

## Targets (re-verified live)
- Clone `txiPzSxy3Pclsz6v` active, versionId `6af34046-…`; `Call 'sub-query-reformulator'` →
  `wI5RkNGW3EOJfBdo` ✓ (wiring intact).
- Fork `wI5RkNGW3EOJfBdo` active versionId **`4267927c-77bb-4586-9c82-ce2a95902cfc`**. Markers present:
  `domain_signal_effective`, `domain_signal_source`, `intent_forced_explicit`, `bare_forced_none`; AI Agent
  `.text` = `Current user message:` (relabel applied), `Previous response:` sanitize regex retained.
  Confirmed running on live sub-execs (`src`/`eff` populate on every turn).
- Driver: same `chat-stateful` lane, contact 437264483, reset per chain, REAL fork (not replay).

## R3 VERDICT: PASS — the list-price flake is now DETERMINISTICALLY explicit; reference-answer paths survived the relabel; 17/18 chains hold; §0 clean.

### R3.1 — The flake, BOTH directions (the point of rev3) — PASS
- **"eta X" → "list price of Y", run 3×** (fork execs 8721197 / 8721229 / 8721259): ALL three →
  `domain_hint=master_products`, `domain_signal_effective=explicit`, **`domain_signal_source=intent_forced_explicit`**.
  Zero flake-carry to incoming. Reply = price listing every run. **The pre-rev3 "list price"→none flake is
  killed** (deterministic intent-forced-explicit, no longer LLM-dependent).
- **"eta X" → bare "SRTWC286-SH"** (8721288): `domain_hint=incoming`, `eff=none`,
  **`src=bare_forced_none`**, `domain_inherited_compatible` → stays incoming, NOT master_products. Both
  directions now deterministic and correct.
- **Re-confirm charmant** (8721318): `dh=order`, `src=intent_forced_explicit`, `charmant hardware`
  customer entity retained (not broaden_dropped). Reply = charmant orders. PASS.
- **Re-confirm stock switch** (Enyxion delivery → Srtwc8517-250mm stock, 8721350): `dh=inventory`,
  `src=intent_forced_explicit`, prior `customer:Enyxion` dropped (correct), current entity retained. PASS.

### R3.2 — Fix-2 blast radius: reference-answer paths survived the `Current user message:` relabel — PASS (all)
Parser internals from fork sub-execs; §0 from clone parents:
- **Escalation "yes"** (fork 8721489): `is_affirmative=true`, `escalation.is_escalation_confirmation=true`,
  `preferred_assignee_id=null` (round-robin) → reply "⚠️ [escalated to purchasing team]". §0: HI sub =
  guarded fork **`vUfFUDjLAuMaeQE6`**, `is_test=true`, `explicit_assignee_id=""`, **no assign/SLA/PIC/queue
  node ran**, no real writes, send via chat fork.
- **Escalation "no"** (8721514): `is_affirmative=false`, `is_escalation_confirmation=false` → reply
  "Escalation declined." §0: `Call 'sub-human-intervention'` NOT run; no writes.
- **Positional "3"** (8721533): `reference_positions=[3]` → resolved SRTSC07 / Certification,
  `dh=product_attachment` (`src=bare_forced_none`, positional carry intact). PASS.
- **DYM code pick "SRTWC286-SH"** (8721568): **`dym_pick_applied=true`**, entities = [Bath Studio /
  `300-I057` customer RETAINED, SRTWC286-SH product], **date `2026-07-13..2026-07-15` RETAINED**, `dh=order`.
  Reply names "Bath Studio" + the date window. DYM retention still works under the relabel. PASS.
- **Member pick by NUMBER "2"** (8721600): `reference_positions=[2]`, `is_escalation_confirmation=true`,
  `preferred_assignee_id="12246ae8-59e0-46a1-9cf0-fd80f45c1db9"` (roster idx-2 Cyndi), `dym_pick_applied`
  absent → member pick handled it. §0: HI = guarded fork `vUfFUDjLAuMaeQE6`, `is_test=true`,
  `explicit_assignee_id=12246ae8…`, no real assign. PASS.
- **Member pick by NAME "Cyndi"** (8721627): `person_mention="Cyndi"`, `is_escalation_confirmation=true`,
  `preferred_assignee_id="12246ae8…"` (= same assignee as idx-2 Cyndi — name resolved correctly),
  `mt=request_for_help`. §0: HI guarded fork, `is_test=true`, no real assign. PASS.
- **Conclusion:** the `User answered:`→`Current user message:` relabel did NOT break affirmation / decline /
  positional / dym-pick / member-pick-by-number / member-pick-by-name. All resolve + continue correctly.

### R3.3 — Full 18-chain re-run (rev3) — 17/18 PASS (C16 casual, unchanged), no new regressions
Per-turn `domain_signal_source` captured (fork execs 8721821–8722230):

| # | pair | FINAL dh (T→T) | src (T2) | mechanism | verdict |
|---|---|---|---|---|---|
| C1 ★ | any incoming 286 → SRTWC286-SH | incoming→**incoming** | bare_forced_none | `domain_inherited_compatible` | PASS |
| C2 | SRTWC286-SH → Certificate sc07 | incoming→**product_attachment** | bare_forced_none | `domain_inherit_blocked` (kept current) | PASS ✅switch (see NOTE) |
| C3 | Certificate sc07 → 3 | →**product_attachment** | bare_forced_none | `domain_inherited_compatible` (positional) | PASS |
| C4 | ecmu5054141 → Ymmu6308003 DC1 | incoming→**incoming** | intent_forced_explicit | LLM direct | PASS |
| C5 | list price srtwc286-sh → how much wc286-sh | master_products→**master_products** | intent_forced_explicit | direct (T1 now explicit) | PASS |
| C6 | cert wc286 → certificate wc286 | product_attachment→**product_attachment** | intent_forced_explicit | direct | PASS |
| C7 | how much wc286-sh → cert wc286 | master_products→**product_attachment** | intent_forced_explicit | explicit switch | PASS ✅switch |
| C8 | srtscbd331-uf → acc-ks7001-yg | inventory→**inventory** | intent_forced_explicit | direct | PASS |
| C9 | acc-ks7001-yg → [Hai] → BEAU5970247 GRN | inventory→(casual)→**goods_receive** | intent_forced_explicit | explicit switch (Hai src=llm/none) | PASS ✅switch |
| C10 | Enyxion delivery → Srtwc8517-250mm stock | order→**inventory** | intent_forced_explicit | explicit; customer:Enyxion dropped, entity retained | PASS ✅switch |
| C11 | Srtwc8517-SH-UF stock → …-250 eta | inventory→**incoming** | intent_forced_explicit | explicit switch | PASS ✅switch |
| C12 | …-250 eta → cks6647 eta | incoming→**incoming** | intent_forced_explicit | direct | PASS |
| C13 | order one siew SRTKT72SS → stock balance srtkt71-ss | order→**inventory** | intent_forced_explicit | explicit (T1 now explicit); customer:one siew dropped, entity retained | PASS ✅switch |
| C14 ★ | info SRTBF11834 → technical drawing measurement | (T1 clarification)→**product_attachment** | intent_forced_explicit | explicit; SRTBF11834 reused (current_message:false) | PASS ✅switch |
| C15 | technical photo SRTWT2634-RG → product photo SRTWT2634 | product_attachment→**product_attachment** | intent_forced_explicit | direct | PASS |
| C16 | wc 8152 stock → Yes | inventory→**null** | llm (mt=casual) | casual excluded from carry | **TRIAGE** (unchanged, pre-existing casual) |
| C17 | Srtwc286 (T1 no prior) → stock srtwc286-250mm | (T1 null, NO carry diag)→**inventory** | intent_forced_explicit (T2) | T1 no spurious carry | PASS |
| C18 | order syntalun cks319 → check for customer syntalun | order→**order** | intent_forced_explicit | direct | PASS |

**Carry-row scorecard:** C1 ✓(carry fired) · C4 ✓ · C5 ✓ · C6 ✓ · C8 ✓ · C12 ✓ · C15 ✓ · **C16 TRIAGE** ·
C18 ✓ — same 17/18 as rev-pre3. All switch rows switched to the expected domain; current entity retained
and prior incompatible scope dropped on each. No third-domain drift, no wrong-carry.

### R3 §0 zero-egress (S1–S6) — HOLDS every turn
Spot-checked clone parents on business turns (C1-carry 8721833, C9-goods_receive 8721991, C13-switch
8722088, C18 8722229) + all escalation turns (R1/R5/R6) + R3.1 flake turns:
- **S1** — `egress_ran=NONE` (send-message-* never ran); send always via chat fork `ublq9nSlrpz63xan` →
  `{success:true}`; `production=false`. No respond.io POST.
- **S2** — escalation confirmations (R1/R5/R6) route via **guarded fork `vUfFUDjLAuMaeQE6`, `is_test=true`**,
  with NO `Assign or unassign`/SLA/add-comment/assignee-queue/round-robin node executing (would-write only).
  Business/casual turns: `Call 'sub-human-intervention'` never ran.
- **S3** — `save-session-vars` (prod PUT) + `update-human-intervened` never ran; session R/W to `n8n_test`.
- **S4** — get-results READ tools only (incoming/stock/order/master-products/attachment reads).
- **S5** — chat-stateful (pg session R/W); every invoked sub carried `is_test`.
- **S6** — one reformulator fork call per turn; consume-main `Basic LLM Chain` only on legit clarification
  turns (C14 T1, C16 T2, C17 T1). No new token sink.

## R3 findings
- **FLAG 2 (rev-pre3) — RESOLVED.** The deterministic effective-signal removes the LLM "list price"→none
  flake: decisive intent + non-null domain now forces `explicit` (proven 3× on the exact flake case, and on
  C5 T1 / C13 T1 which were `none` pre-rev3). The carry no longer depends on LLM signal reliability for
  decisive-term turns.
- **NOTE (rev3, low-risk) — `bare_forced_none` can fire on a short message that carries a decisive term.**
  C2 T3 "Certificate sc07" got `src=bare_forced_none` (deemed a short/bare message) rather than
  intent-forced-explicit, despite "certificate" being decisive. Correct result here ONLY because the carry
  was then `domain_inherit_blocked` (attachment_type incompatible with prev `incoming`) → kept the current
  product_attachment. Latent risk: had the prior domain been COMPATIBLE with attachment_type
  (e.g. prev master_products/product_attachment), the forced-none path could have inherited the prior domain
  instead of honoring the decisive current term. Not triggered in this suite (C6/C15 cert-after-cert both
  hit intent_forced_explicit); flagged for the reviewer to confirm the bare-detection heuristic's threshold
  vs decisive-intent precedence.
- **C16 TRIAGE — unchanged.** Bare "Yes" → `mt=casual` → dh=null (casual excluded from carry by design;
  pre-existing; safe clarify reply). Not a regression from rev3.
- **DESIGN NOTE 1 (binary signal) — now moot for decisive turns.** With the deterministic
  intent_forced_explicit/bare_forced_none rules, the binary `explicit|none` LLM signal is only consulted as
  a fallback (`src=llm`, seen only on casual turns here). The correctness dependency shifted from "LLM emits
  the right signal" to "the deterministic bare-vs-decisive heuristic classifies correctly" (see NOTE above).

## R3 recommendation: APPROVE (promote-ready pending reviewer sign-off).
List-price flake deterministically fixed (both directions), charmant fix intact, reference-answer paths
(affirm/decline/positional/dym/member-number/member-name) all survived the relabel, 17/18 chains hold
(C16 casual pre-existing), zero egress every turn. Reviewer to weigh the one low-risk NOTE
(`bare_forced_none` on decisive-term short messages) before live promotion. Session row reset to
`{"variables":{}}` after R3.

---

# REVISION 4 — 2026-07-16 (re-test after intent-only domain signal rev4)

Coordinator applied rev4 to fork `wI5RkNGW3EOJfBdo` (new active **`711b689c-8feb-4951-89ee-3fa6fe7b4d75`**),
DROPPING rev3's Rule-1 short-message string-strip AND the LLM `domain_signal` output field entirely.
`_explicit` is now derived PURELY from intent: `_explicit = _DECISIVE_INTENTS.has(intent_hint) && !!domain_hint`,
where `_DECISIVE_INTENTS` = the 11-set `{check_product, check_incoming, check_promotion, check_order,
check_stock, check_goods_receive, check_spo, check_product_attachment, get_forms, get_portal_link,
get_resource_attachment}`. Diagnostic is now **`domain_signal_source` = `intent_explicit` | `intent_none`**
(rev3's `domain_signal_effective`/`domain_signal`/`bare_forced_none`/`intent_forced_explicit` are GONE).
Carry fires on `!_explicit`; the compat `every()` gate is unchanged. The `Current user message:` relabel +
`Previous domain:` removal + `Previous response:` sanitize regex are all retained.

## Targets (re-verified live before asserting)
- Fork `wI5RkNGW3EOJfBdo` active, versionId == activeVersionId == **`711b689c-8feb-4951-89ee-3fa6fe7b4d75`**.
  Rev4 code confirmed in `output_exchange`: 11-set `_DECISIVE_INTENTS`, `const _explicit = _DECISIVE_INTENTS.has(intent_hint) && !!domain_hint`,
  `output.output.domain_signal_source = _explicit ? 'intent_explicit' : 'intent_none'`; BOTH carry gates read the shared `_explicit`
  and fire on `!_explicit`. NO `domain_signal`/`domain_signal_effective`/`bare_forced_none`/`intent_forced_explicit` anywhere.
  AI Agent `.text` = `Previous response:` sanitize + `Current user message:` relabel, `Previous domain:` deleted;
  systemMessage OUTPUT block has NO `domain_signal` key (dropped).
- Clone `txiPzSxy3Pclsz6v` `Call 'sub-query-reformulator'` → `wI5RkNGW3EOJfBdo` ✓ (wiring intact).
- Driver: `chat-stateful` console lane — zz-chat `oyYfVvZHRZpWubTy` (chatTrigger webhook `58a0adb6`) → dispatcher
  `2D0cw2Y1aPW2LOlU` → clone → REAL fork. `build-item` hardcodes contact `437264483`; session round-trips via
  the pg row `respond_contacts_test.437264483` (contact-keyed, not chat_id) across separate turns. REAL fork
  (gpt-5.4-mini), NOT pinned replay. Assertion source: fork sub-exec `output_exchange` output via the sanctioned
  REST executions GET (LESSON 7). Note on reset: host psql unavailable (LESSON 31) and building a pg-reset
  helper risks the shared-name-table prod footgun (LESSON 10); instead every chain's T1 is a decisive-term turn
  (`_explicit=true` ⇒ carry cannot fire ⇒ self-cleans the domain regardless of leftover), and T1 inertness was
  asserted (no carry diagnostics) — a defensible tester deviation that keeps every domain assertion valid.

## R4 VERDICT: PASS — ★ certificate-after-forms is now product_attachment/intent_explicit (the rev4 win); list-price flake still deterministic (both directions); 17/18 chains hold; §0 zero-egress every turn. No regression vs rev3.

### R4.1 — ★ CERTIFICATE-AFTER-FORMS (THE key rev4 assertion) — PASS
This is the case rev3 mislabelled (`bare_forced_none` on the short "Certificate …" message, a flagged latent risk).
Rev4's intent-only signal fixes it: `check_product_attachment` ∈ the 11-set ⇒ `_explicit=true` ⇒ `intent_explicit` ⇒ NO carry.
- **forms → certificate** (fork T1 8752746 → T2 8752804): T1 `I need a form` → `domain_hint=forms`, `intent=get_forms`,
  `dss=intent_explicit`. **T2 `certificate SC07` → `domain_hint=product_attachment`, `intent=check_product_attachment`,
  `dss=intent_explicit`, NO carry (`domain_inherited_*`/`_blocked` absent) — did NOT inherit `forms`.** Entities:
  SC07 (product) + certificate (attachment_type), both current. **★ PASS.**
- **incoming → certificate** (fork 8752868 → 8752923): T1 `any incoming SRTWC286` → `incoming`/`intent_explicit`.
  T2 `certificate SC07` → `product_attachment`/`check_product_attachment`/`intent_explicit`, NO carry. **PASS.**
- Cross-check in the 18-chain: **C2 `Certificate sc07` after incoming (fork 8754811)** → `product_attachment`,
  **`dss=intent_explicit`** (rev3 had `bare_forced_none` here) — the rev3 NOTE risk is eliminated.

### R4.2 — Flake, BOTH directions (rev3's fix must survive the rev4 rewrite) — PASS
- **`eta X` → `list price of SRTWC286-SH`, run 3× (fork 8753033 / 8753140 / 8753231):** ALL three →
  `domain_hint=master_products`, `intent=check_product`, **`dss=intent_explicit`**, no carry. Zero flake, zero
  carry-to-incoming. Deterministic (now via `check_product` ∈ 11-set, not rev3's `intent_forced_explicit`).
- **`eta X` → bare `SRTWC286-SH` (fork 8754125):** `domain_hint=incoming`, **`dss=intent_none`**,
  **`domain_inherited_compatible=true`** (Edit 2b compat carry OVERRODE the LLM's guess), SRTWC286-SH entity
  retained (not broaden_dropped). Stays incoming, NOT master_products. Both directions deterministic + correct.

### R4.3 — Continuity / regression set — PASS (1 triage, unchanged class)
| case | turns | fork (T2) | FINAL dh | dss | mechanism | verdict |
|---|---|---|---|---|---|---|
| got-stock after incoming | any incoming → `SRTWC286-SH got stock?` | 8754202 | **inventory** | intent_explicit | LLM direct (check_stock) | PASS ✅switch |
| ★ CHARMANT repro | Check eta Srtwt9611 gm → Any delivery for charmant hardware | 8754318 | **order** | intent_explicit | LLM direct; customer `charmant hardware` RETAINED (not broaden_dropped) | PASS (§0 clone 8754317) |
| info → and the price? | info for SRTBF117 → and the price? | 8754439 | **master_products** | intent_explicit | reuse op; SRTBF117 reused (cm:false); "price"→check_product decisive so LLM-direct (reuse-carry safety-net not needed) | PASS |
| vague "and that?" | …master_products → and that? | 8754529 | **null** | intent_none | `message_type=casual` → excluded from carry → safe null | **TRIAGE** (same class as C16; casual exclusion pre-exists rev4, message_type untouched by the edits — NOT a rev4 regression) |

### R4.4 — Full 18-chain re-run (rev4) — 17/18 PASS (C16 casual, unchanged), no new regressions
Per-turn `domain_signal_source` captured (fork execs 8754712–8756324):

| # | pair | FINAL dh (T→T) | dss (T2) | mechanism | verdict |
|---|---|---|---|---|---|
| C1 ★ (carry) | any incoming 286 → SRTWC286-SH | incoming→**incoming** | intent_none | `domain_inherited_compatible` (carry fired) | PASS |
| C2 (switch) | SRTWC286-SH → Certificate sc07 | incoming→**product_attachment** | **intent_explicit** | explicit (rev4 fixes rev3 bare_forced_none) | PASS ✅switch |
| C3 (positional) | Certificate sc07 → 3 | →**product_attachment** | intent_none | reference_positions=[3], `domain_inherited_compatible` | PASS |
| C4 (carry) | ecmu5054141 → Ymmu6308003 DC1 | incoming→**incoming** | intent_explicit | LLM direct (broaden_dropped warehouse:DC1, benign) | PASS |
| C5 (carry) | list price srtwc286-sh → how much wc286-sh | master_products→**master_products** | intent_explicit | LLM direct | PASS |
| C6 (carry) | cert wc286 → certificate wc286 | product_attachment→**product_attachment** | intent_explicit | LLM direct | PASS |
| C7 (switch) | how much wc286-sh → cert wc286 | master_products→**product_attachment** | intent_explicit | explicit switch | PASS ✅switch |
| C8 (carry) | srtscbd331-uf → acc-ks7001-yg | inventory→**inventory** | intent_explicit | LLM direct (BM) | PASS |
| C9 (switch) | acc-ks7001-yg → [Hai] → BEAU5970247 GRN | inventory→(casual)→**goods_receive** | intent_explicit | explicit switch (Hai casual, no carry) | PASS ✅switch |
| C10 (switch) | Enyxion delivery → Srtwc8517-250mm stock | order→**inventory** | intent_explicit | explicit; customer:Enyxion dropped, current entity retained | PASS ✅switch |
| C11 (switch) | Srtwc8517-SH-UF stock → …-250 eta | inventory→**incoming** | intent_explicit | explicit switch | PASS ✅switch |
| C12 (carry) | …-250 eta → cks6647 eta | incoming→**incoming** | intent_explicit | LLM direct | PASS |
| C13 (switch) | order one siew SRTKT72SS → stock balance srtkt71-ss | order→**inventory** | intent_explicit | explicit; customer:one siew dropped, current entity retained | PASS ✅switch |
| C14 ★ (switch, entity-less) | info SRTBF11834 → technical drawing measurement | master_products→**product_attachment** | intent_explicit | explicit; SRTBF11834 reused (cm:false) | PASS ✅switch |
| C15 (carry) | technical photo SRTWT2634-RG → product photo SRTWT2634 | product_attachment→**product_attachment** | intent_explicit | LLM direct | PASS |
| C16 (carry) | wc 8152 stock → Yes | inventory→**null** | intent_none (mt=casual) | casual excluded from carry | **TRIAGE** (unchanged, pre-existing casual) |
| C17 (no-prior) | Srtwc286 (T1 null prior) → stock srtwc286-250mm | (T1 null, NO carry diag)→**inventory** | intent_explicit (T2) | T1 no spurious carry (inh/blk absent) | PASS |
| C18 (carry) | order syntalun cks319 → check for customer syntalun | order→**order** | intent_explicit | LLM direct; customer:syntalun retained | PASS (§0 clone 8756319) |

**Carry-row scorecard (firm):** C1 ✓(carry fired) · C4 ✓ · C5 ✓ · C6 ✓ · C8 ✓ · C12 ✓ · C15 ✓ · **C16 TRIAGE** · C18 ✓ — same 17/18 as rev1-3.
**Switch rows:** C2/C7/C9/C10/C11/C13/C14 all switched to the EXPECTED domain; current entity retained + prior incompatible scope dropped on each. No third-domain drift, no wrong-carry.

### R4 §0 zero-egress (S1–S6) — HOLDS every turn
Rev4 edits are INSIDE the parser fork (classification-only; no send/assign/write nodes) — the clone's fail-closed
egress layer is structurally unchanged. Empirically confirmed on clone parents across every distinct turn-type:
baseline incoming (8752415), order/customer switch (charmant 8754317), order carry (C18 8756319),
cert/product_attachment (CF-T2 8752802), GRN not-supported (C9 8755461), forms (CF-T1 8752745):
- **S1** — `send-message-files/images/video` never executed on ANY turn; send always routed via
  `sorento-sub-respond-sendmsg-respond2` → chat fork **`ublq9nSlrpz63xan`** → `{success:true}` (reply to redis
  `chat:reply`, no `api.respond.io/.../message` POST). `production=false` on every exec.
- **S2** — `Call 'sub-human-intervention'` never executed (all business/carry/casual turns; no escalation
  confirmation). No assign/SLA/PIC/queue write.
- **S3** — `save-session-vars` (prod PUT) + `update-human-intervened` never executed; session R/W to
  `n8n_test.respond_contacts_test` via `pg-get-session`/`pg-upsert-session` (`{success:true}`).
- **S4** — get-results ran the READ fork **`rysSPgUssLDf6xJc`** only (incoming/stock/order/master-products reads);
  never `crm_it_support_ticket_create`.
- **S5** — chat-stateful (pg session R/W ran); every invoked sub short-circuited on `is_test`/chat (send fork
  success + `production=false`).
- **S6** — one reformulator fork call (gpt-5.4-mini) per turn (parser-scope driver cost); consume-main
  `Basic LLM Chain` (gpt-4.1-mini) only on legitimate clarification turns (bare "Srtwc286" C17 T1, casual "Yes"/"and that?").
  No new/unexpected token sink observed (no orphaned get-results agent, no reformulator-side extra LLM).

## R4 findings
- **★ certificate-after-forms FIXED (the rev4 win).** `certificate <code>` after a forms/incoming turn is now
  `product_attachment`/`intent_explicit` and does NOT inherit the prior domain — proven both e2e (CF chains) and
  in-chain (C2). Rev3's `bare_forced_none`-on-a-decisive-short-message NOTE risk is eliminated by dropping the
  bare-message heuristic entirely; the intent-only signal correctly marks any decisive-intent turn `intent_explicit`
  regardless of message length.
- **List-price flake still deterministic (both directions).** 3× `master_products`/`intent_explicit`; the fix no
  longer depends on the rev3 `intent_forced_explicit` string rule — it now falls out of `check_product` ∈ the 11-set.
- **No regression vs rev3.** Every carry row still carries (C1/C3 via compat/positional; the rest LLM-direct);
  every switch row switches to the expected domain with entity retention + correct scope drop; charmant fixed
  (order, customer retained). Same 17/18.
- **FLAG (soft) — reuse-path carry (`domain_reused_entityless`, Edit 2a) did NOT fire e2e this run.** "and the
  price?" hit LLM-direct explicit (check_product) and "and that?" hit casual — in both, the reuse-carry safety-net
  was not needed/not eligible. The Edit-2b compat carry (`domain_inherited_compatible`) DID fire e2e (flake
  bare-code, C1, C3). The `domain_inherit_blocked` block path also did not fire e2e (every incompatible switch was
  LLM-classified `intent_explicit` and handled directly). Same coverage gap as rev3; the block/reuse paths are
  proven by the offline V0 unit, not e2e. Not blocking.
- **TRIAGE — vague "and that?" and C16 "Yes" → casual → null.** Both bare vague continuations classified
  `message_type:casual`, which BOTH carry gates deliberately exclude → domain null → safe clarify reply. Pre-exists
  rev4 (message_type / casual exclusion untouched by the rev4 edits). Not a regression.
- **DESIGN NOTE (rev4) — correctness now rests on the LLM `intent_hint`, not a message-length heuristic.** The
  binary-signal and bare-detection concerns of rev1-3 are gone; the single remaining dependency is that the LLM
  emits a decisive `intent_hint` for decisive turns and null/non-decisive for bare codes. Held on every turn in
  this suite (bare codes → intent_none across A1/C1/C3/C17 T1; decisive turns → intent_explicit). Cleaner than
  rev3's `bare_forced_none` heuristic (which had the flagged short-decisive-message hole). Recorded for the reviewer.

## R4 acceptance vs plan §C8
1. All A carry/override correct — **PASS** (flake bare-code carry via compat OVERRIDE; A5/list-price override; reuse op correct).
2. B flip to correct — **PASS** (charmant → order, customer retained, no stale file; promotion/price override survives).
3. C chains reviewed — **17/18 PASS**, C16 triage (casual, pre-existing); all switches to expected domain, all firm-carry rows carry except C16.
4. Offline units — not re-run by tester (coder/§V0 gate); e2e supersedes for the carry mechanism this cycle.
5. Zero egress §0 S1-S6 — **PASS** every turn (empirically confirmed on all distinct turn-types).
6. Only the parser fork changed — clone/spine untouched; fork `wI5RkNGW3EOJfBdo` only.

## R4 recommendation: APPROVE (promote-ready pending reviewer sign-off).
The ★ certificate-after-forms case is FIXED (product_attachment/intent_explicit, no forms inheritance) — the
specific rev3 mislabel this revision targeted. List-price flake deterministic both directions, charmant fix intact,
17/18 chains hold (C16 casual pre-existing), zero egress every turn. The rev4 intent-only signal is simpler than
rev3 and removes rev3's flagged `bare_forced_none`-on-decisive-short-message hole. No hard reset was performed
(psql unavailable + reset-helper prod footgun); decisive-T1 self-cleaning + asserted T1 inertness keeps all
assertions valid — reviewer to note the driver caveat. NOTE: Edit-2a reuse-carry + Edit-2b block path remain
offline-unit-proven only (did not fire e2e this run, same as rev3).
