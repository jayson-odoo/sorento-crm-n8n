# Review — `parser-domain-continuity-carry`

Reviewer: sorento-reviewer · Date: 2026-07-15 · scope: **parser** (edits inside reformulator sub)
Inputs reviewed: plan `plans/parser-domain-continuity-carry.md` (C0-C8), diff `tests/diffs/parser-domain-continuity-carry.md`
(rev-1 + rev-2), run `tests/runs/domain-continuity-18chain-20260715.md`. Live state re-verified via MCP.

## VERDICT: **APPROVE** (promotion user-gated)

The change fixes two real live bugs (charmant domain-contamination exec 8655477 + the coordinator bare-code
hole) with **zero egress** and **no regression of live behavior**. One residual correctness risk (FLAG 2,
signal flakiness) is a **net improvement over the live baseline** and is not a promote-blocker — a cheap
hardening is recommended as a fast-follow (see below). Approving as safe and correct-enough to ship.

---

## Independent verification (MCP, this cycle)

- **Live `XTODTw` UNTOUCHED** — versionId==activeVersionId `53ea677a-e078-482e-bea2-17efe5859189`,
  updatedAt `2026-07-14T03:36` (predates this cycle's 2026-07-15 work). Promotion target only. ✓
- **Fork `wI5RkNGW3EOJfBdo`** — active, draft==active. **⚠ versionId is now `732fdeeb-bced-432c-becb-64db0463a888`,
  NOT the rev-2 doc's `639cf44f`** (a later republish bumped it). I inspected the CURRENT fork bodies directly;
  they match the reviewed rev-2 design exactly (see below). **Promote-time action:** re-sha the LIVE fork
  bodies at `732fdeeb`; the rev-2 doc shas (systemMessage `97baa9ee…`, jsCode `784cfc31…`, versionId
  `639cf44f`) are STALE — do not gate on them.
- **Fork is classification-only** — node types: `executeWorkflowTrigger`, `lmChatOpenAi`, `code`×3, `agent`,
  `memoryPostgresChat`, `if`. **No** httpRequest / respond-io / send / assign node. Structural zero egress
  inside the sub, independent of this change. ✓
- **`AI Agent.text`** = exactly the 2-line Edit-1a (Previous-domain line deleted) + Edit-1b (sanitize regex).
  Verified verbatim. ✓
- **`AI Agent.systemMessage`** = binary `"domain_signal": "explicit|none"` (OUTPUT block) + entity-free
  "domain CLARITY" definition. **Zero `inferred` occurrences remain** (grep count 0). ✓
- **`output_exchange.jsCode`** (`node --check` OK):
  - 2a reuse-carry (L263-270): `const _explicit = domain_signal==='explicit'; if(!_explicit){carry dh+intent}`,
    excludes `casual`/`request_for_help`, does **NOT** overwrite `message_type`. ✓
  - 2b entity-bearing carry (L459-477): runs **BEFORE** blocklist-apply (L479+); single `DOMAIN_BLOCKED_HINTS`
    const (declared L420, in scope, **not duplicated**); `curEnts=current_message===true`; `every()` compat
    gate; OVERRIDE on compatible; `domain_inherit_blocked` on incompatible. ✓
  - `DOMAIN_BLOCKED_HINTS.incoming` (L427) includes `customer` → charmant customer entity incompatible with
    prev `incoming` → no carry, entity retained (grounds B1/V0-c). `DOMAIN_BLOCKED_HINTS.order` (L426) excludes
    `customer` → C18 compatible. ✓

## Review checklist

### 1. Node-diff correctness — PASS
Both carry blocks correct; explicit-wins path correct; compatibility gate uses the same live blocklist map;
2b ordered before blocklist-apply so the corrected domain drives the filter; charmant retention proven at
code layer (V0-c offline) and e2e (B1 exec 8716676: dh=order, `charmant hardware` present, no stale SRTWT9611).
No egress node exists in this sub to alter.

### 2. Binary-vs-three-valued deviation — ACCEPTED (binary is the right call)
Plan specified `explicit|inferred|none`; shipped `explicit|none`, carry on `!explicit`. Judgment: **accept.**
Rationale: (a) the code never consumed the inferred/none distinction — both are `!explicit` → carry-eligible —
so collapsing removes an LLM burden with no code benefit; (b) the three-valued form actively harmed: tying
"inferred" to entity presence taught the LLM "entity present ⇒ inferred", which misfired the got-stock case
(fork exec 8681042: "got stock" → inferred → wrong carry overriding inventory with incoming). Rev-2 reframes
`domain_signal` as pure domain-CLARITY (entity-free) + binary, which fixes got-stock (LLM emits `explicit`).
(c) The coordinator hole still closes because the LLM reliably emits `none` for bare codes (observed on every
bare code in the suite: A1/A2/C1/C3/C17-T1). Correctness now rests on "LLM never marks a bare-code guess
explicit" — a narrower, more reliable contract than the three-valued one.

### 3. ★ FLAG 2 (signal robustness) — REAL residual, NOT a blocker; harden as fast-follow
Tester observed identical "list price of srtwc286-sh" → `ds=none` (A3ii-T1, exec 8716394) vs `ds=explicit`
(C5-T1/A5/B2) — ~25% flake on that phrase, run-to-run LLM variance.

**Worst case (analyzed):** a decisive term mis-signalled `none` after a prior domain, where the current entity
is COMPATIBLE with that prior domain → 2b OVERRIDES to the wrong prior domain. Concretely: "eta X" (incoming)
→ "list price of Y" flaked to `ds=none`; `product` is NOT in `DOMAIN_BLOCKED_HINTS.incoming` → compatible →
carry `incoming` → user asked price, gets incoming data. **The compatibility gate does NOT protect this** —
`product` is compatible with incoming/inventory/master_products/product_attachment, so a product-decisive
term (list price / dimension / cert / photo) flaked to `none` after any product-adjacent prior domain
mis-carries. This is exactly the class of bug the change fixes, reappearing via signal flake.

**Severity:** wrong-DATA, not egress (safety intact regardless). **Bounded and NOT a regression:** on LIVE
today, "list price" after "eta X" sees prompt anchors `Previous domain: incoming` + `Previous turn (incoming)`
→ prompt contamination → live ALREADY tends to carry incoming (the same or worse wrong outcome). The new
code-carry is right when `ds=explicit` (~75%) and wrong when `ds=none` (~25%) → **strictly better than live.**
Hence not a promote-blocker.

**Recommended hardening (fast-follow, cheap):** add a deterministic decisive-term backstop in `output_exchange`
before the 2b/2a gates — force `_explicit=true` when the LLM's own `intent_hint` is a decisive intent
(get_price/check_eta/check_stock/get_certificate/get_dimension/…) OR when `latest_user_message` contains an
unambiguous decisive phrase ("list price"/"selling price"/"eta"/"delivery for"/"stock"/"grn"/"cert"/
"dimension"). Must be CONSERVATIVE (only ever upgrade to explicit on unambiguous phrases — never mark a bare
code explicit, which would re-open the coordinator hole). This makes correctness independent of LLM signal
flake. Recommendation: **accept-as-is is defensible (net-positive, no egress); I recommend harden-before-promote**
given it is a reproduced, non-rare, customer-visible wrong-data misfire and the fix is one hunk. Deferring to
user judgment — either path is authorized by this APPROVE.

### 4. Zero-egress (§0 S1-S6) — RE-CONFIRMED PASS
Parser sub is structurally incapable of egress (verified node types above). Clone fail-closed structure
intact (tester runData): S1 no send-message-files/images/video, send routed via chat fork `ublq9nSlrpz63xan`
→ `{success:true}` to redis `chat:reply`, no `api.respond.io/.../message` POST, `production=false`; S2 no
human-intervention / assign / SLA / PIC write; S3 no prod session PUT / update-human-intervened (session R/W
to `n8n_test.respond_contacts_test`); S4 get-results READ tools only, never `crm_it_support_ticket_create`;
S5 chat-stateful, every sub carried `is_test`; S6 one reformulator fork per turn (parser-scope driver cost),
`Basic LLM Chain` only on legitimate clarification (C16-T2, C17-T1). Holds on EVERY turn across representative
execs (8716819/8717138/8716992/8717432/8717110/8716044).

### 5. Non-regressions — PASS
- **C16 bare "Yes"→casual→null domain:** both carry blocks exclude `casual` (L263, L459); this guard
  pre-exists (old dead code had it) and `message_type` is untouched by these edits → **not newly broken.**
  "Yes" after a bare listing (no yes/no question) classified casual is pre-existing LLM behavior; reply was a
  safe clarification. Triage, not regression.
- **Response-string leak mitigated only in the parser prompt** (spine `compile-current-state` L95/L131
  unchanged): correct scope for a parser-only promote. The regex neutralizes the leak at its only
  contamination-relevant consumption point (the parser prompt). Source-fix explicitly flagged as a separate
  future spine change. Acceptable.

### 6. Scope/tier — CORRECT
scope=parser; edits inside the reformulator sub (AI Agent prompt + systemMessage + output_exchange). Tested via
`chat-stateful` real-reformulator lane, NOT pinned replay (which is blind to a prompt+output_exchange change —
LESSON 28). Matches the parser tier requirement.

### Plan adherence — PASS
All five hunks present (1a/1b/1c on AI Agent; 2a/2b on output_exchange), on two nodes of the parser sub only.
Compatibility gate, explicit-wins, charmant retention, declaration-order (single const) all as specified. The
one deviation (binary signal) is documented and judged sound. Clone fail-closed structure unchanged (is_test
preserved, egress orphaned).

---

## PROMOTE CHECKLIST → live sub `XTODTw-dJcV0uRdC056hG` (user-gated)

**Recommended order (per sibling-promote guidance): reformulator changes to `XTODTw` FIRST, then any spine
change later. The `compile-current-state` leak-at-source fix is a SEPARATE future spine change — do NOT bundle.**

**Optional-but-recommended pre-step:** apply the FLAG-2 deterministic decisive-term backstop to the fork,
re-run the got-stock + "list price after eta" cases via chat-stateful, then promote the hardened fork. If
skipping, promote as-is (net-positive, no egress) and track FLAG 2 as a known residual.

1. **Re-verify live base is unchanged at promote time.** Confirm `XTODTw` versionId==activeVersionId still
   `53ea677a` (it is now). Capture the prior versionId + the CURRENT live `AI Agent.text`,
   `AI Agent.options.systemMessage`, `output_exchange.jsCode` as backup BEFORE any write.
2. **Re-sha the CURRENT fork `732fdeeb` bodies** (NOT the stale rev-2 doc shas). Source promoted bytes from the
   live fork params, not from memory or the diff doc (LESSON 25).
3. **★ CRITICAL bundling — port ONLY the domain-continuity hunks, do NOT wholesale-replace `output_exchange`.**
   The fork's `output_exchange` is `live + domain hunks`; live already carries decline-flag (`escalation_declined`)
   and dym-candidate-map (`tryDymPick`) logic co-resident in the same node. A wholesale param replace would
   silently REVERT any decline-flag/dym change that landed on live AFTER the fork was cut (2026-07-14). Splice
   ONLY: (2a) the reuse-path carry block (L263-270) and (2b) the entity-bearing carry block (L459-477). Diff the
   live `output_exchange` against the fork and confirm the ONLY deltas are the two domain blocks before writing.
4. **Apply the AI Agent hunks:** (1a+1b) replace `.parameters.text` with the 2-line sanitized version;
   (1c) `.parameters.options.systemMessage` — the binary `domain_signal` OUTPUT enum line + the entity-free
   CLARITY definition block. Confirm the promoted systemMessage has ZERO `inferred` occurrences and the OUTPUT
   enum reads `"explicit|none"`.
5. **Use `setNodeParameter` (single-leaf, byte-exact)** for each of the three leaves — never `updateNodeParameters`
   deep-merge that could strand siblings (LESSON 32).
6. **sha-gate: verify the DRAFT == intended BEFORE publish; publish; verify ACTIVE == intended AFTER publish**
   (LESSON 24/25). Auto-revert (`publish_workflow` prior versionId) on any mismatch. Confirm draft==active after.
7. **`node --check` the promoted `output_exchange.jsCode`** on live before publish.
8. **Post-promote smoke (chat-stateful or regress-capture, real reformulator, NOT pinned replay):** re-run
   B1 charmant (→order, customer retained, no stale file), A1 bare-code-after-eta (→incoming, not master_products),
   A5 list-price-after-eta (→master_products), got-stock (→inventory). Re-confirm §0 S1-S6 zero egress on live sub.
9. **Regression-diff registration:** register `domain_signal` in the replay `norm()` as flagged-on-change
   (never null → retain), and register the new diagnostics (`domain_inherited_compatible`,
   `domain_reused_entityless`, `domain_inherit_blocked`) as drop-when-absent so they don't false-positive the
   golden baseline (LESSON 40).
10. **NEVER edit live mid-cycle.** Do all work on the fork; the live write is a single reviewed, backed-up,
    sha-gated splice.

**Do NOT promote:** the SPINE `compile-current-state` leak-at-source fix (separate spine change) or the clone
repoint (test-only).

---

# RE-REVIEW — REVISION 3 (FLAG-2 hardening: deterministic effective-signal + neutral Human label)

Reviewer: sorento-reviewer · Date: 2026-07-16 · scope: **parser** (same fork `wI5RkNGW3EOJfBdo`).
Inputs: diff `tests/diffs/parser-domain-continuity-carry.md` REVISION 3, run
`tests/runs/domain-continuity-18chain-20260715.md` REVISION 3. Live state re-verified via MCP this cycle.
This re-review covers ONLY the rev3 delta + adjudicates the one new NOTE (`bare_forced_none` on decisive
purpose-word entities). The pre-rev3 APPROVE above stands.

## REV3 VERDICT: **APPROVE** (promotion user-gated)

Rev3 delivers the FLAG-2 fast-follow I recommended and does it well: the "list price"→`none` flake is now
**deterministically** `intent_forced_explicit` (proven 3× on the exact flake case), bare codes stay `none`
via a higher-priority Rule 1, reference-answer paths survived the Human-label relabel, and zero-egress holds
on every turn. The one new NOTE (`bare_forced_none` swallowing a decisive purpose-word entity) is a **real
but near-unreachable residual** — the existing compatibility gate covers it across every realistic prior
domain (evidence below). It is **wrong-DATA not egress, not a regression vs live, and not a promote-blocker.**
I **recommend** (not require) the code-shaped-strip refinement as the next hardening; exact rule given below.
Either path (promote as-is / harden-then-promote) is authorized by this APPROVE.

## Independent verification (MCP, this cycle)

- **Fork `wI5RkNGW3EOJfBdo`** — active, **draft==active `4267927c-77bb-4586-9c82-ce2a95902cfc`**
  (matches the rev3 doc), updatedAt 2026-07-15T15:46Z. ✓
- **Live `XTODTw` UNTOUCHED** — versionId==activeVersionId `53ea677a`, updatedAt **2026-07-14T03:36**
  (predates rev3). Promotion target only. ✓
- **Live spine `9qVyfUxmRQqrpGRMDLRuz` UNTOUCHED** — versionId==activeVersionId `bcdb5633`, updatedAt
  2026-07-13. ✓
- **`AI Agent.text`** = exactly the rev3 2-line form: `Previous response:` sanitize regex RETAINED,
  line-2 label = `Current user message:` (Fix 2 relabel applied). Verified verbatim. ✓
- **`AI Agent.systemMessage`** = rev2 binary `"domain_signal": "explicit|none"`; **zero `inferred`**
  occurrences (grep 0) — UNCHANGED by rev3, as claimed. ✓
- **`output_exchange.jsCode`** (`node --check` → **OK**, 44,928 bytes):
  - `_effectiveDomainSignal` IIFE declared ONCE (L200-228), diagnostics assigned L229-230,
    `_explicitEff` derived L231 — single shared source, in scope at both sites. ✓
  - **Both carry sites read the shared `_explicitEff`:** reuse-path L308 (`const _explicit = _explicitEff;`)
    and entity-bearing L504 (`const _explicit = _explicitEff;`). No second effective-signal derivation. ✓
  - **Carry BODIES + compat gate byte-unchanged** from the pre-rev3 reviewed version: reuse-path carry
    (L309-313) and entity-bearing carry (L505-519) are the same reviewed logic; the compat `every()` gate
    (L510-511) against the same `DOMAIN_BLOCKED_HINTS` map (L464-476) is intact. rev3 delta = the two RHS
    swaps + the new IIFE + 2 comment rewords. ✓
  - **decline-flag `escalation_declined` present ×2; dym `tryDymPick`/`dym_candidates`/`dym_pick_applied`
    present ×6** — co-resident, not clobbered by the rev3 insertion (LESSON-25/bundling concern from step 3
    of the promote checklist still holds for the live splice). ✓

## Rule-priority correctness (Fix 1) — PASS
Rule 1 (bare→none) L204-218 → Rule 2 (decisive intent+domain→explicit) L220-224 → Rule 3 (LLM signal) L226-227.
Priority is correct: bare-code protection (Rule 1) outranks the decisive-intent upgrade (Rule 2), so a bare
code that the LLM flakes to a decisive intent still forces `none` (coordinator hole stays closed — offline
unit (b), e2e 8721288 `src=bare_forced_none`). `_DECISIVE_INTENTS` (L195-199) is the 11-set the diff claims
and includes `check_product_attachment`. ✓

## ★ NOTE ADJUDICATION — `bare_forced_none` can swallow a decisive purpose-word entity

**(a) Is the latent risk real / worth fixing?** REAL in principle, but **near-unreachable in practice** — the
compat gate already covers it. Grounding (I extracted the live `DOMAIN_BLOCKED_HINTS` map, L464-476):

The wrong outcome requires: a message that reduces to empty after entity-strip (so Rule 1 fires `none`)
whose emptiness is caused by a DECISIVE purpose-word entity being stripped (`attachment_type` =
certificate/photo/drawing — the only purpose-word class with a decisive intent in `_DECISIVE_INTENTS`), AND
a prior domain that is (i) ≠ the term's true domain (product_attachment) and (ii) COMPATIBLE with ALL current
entities so the carry fires. Checking `attachment_type` against every prior domain:

- **`attachment_type` is BLOCKED in 8 of 10 domains:** master_products, promotion, inventory, order,
  incoming, portal_link, resource_attachment, goods_receive, spo_allocation all list `attachment_type` →
  incompatible → `domain_inherit_blocked` → keeps the current (correct) domain. This is exactly why tester
  C2 T3 ("Certificate sc07" after `incoming`) was correct — `incoming` blocks `attachment_type`.
- **Not blocked in `product_attachment`** — but carrying `product_attachment` there is the CORRECT domain
  (self-carry, harmless).
- **Not blocked in `forms`** — the one genuine wrong-carry precondition (prev `forms` → "certificate")
  BUT: a real "certificate sc07" also carries a product-code entity, and `forms` **blocks `product`**
  (L468) → `every()` fails → no carry. Only a lone bare "certificate" (no code) after a `forms` turn
  escapes — not a realistic chain.

So for the single decisive purpose-word class, the compat gate + the `every()`-over-all-current-entities
semantics neutralize every realistic prior domain. Empirically the suite confirms it: cert-after-cert
(C6/C15) hit `intent_forced_explicit`; cert-after-incoming (C2) hit the safe `domain_inherit_blocked`; **no
wrong-carry occurred in 18 chains + the flake battery.** Severity if it ever fired = wrong-DATA, safety
intact. And it is **not a regression vs live** — live's `Previous domain:`/`Previous turn (<domain>)` anchors
contaminate the same case at least as badly. Hence: worth a cheap fix, but NOT a blocker.

**(b) Is "strip only code-shaped identifiers" the right rule, and does it preserve Rule 1's purpose?** Yes.
The refinement correctly redefines "bare" as "contains only identifier tokens" rather than "only tokens the
LLM happened to extract" — which is the right invariant and removes the LLM-extraction dependence that rev3
was meant to kill. Exact recommended rule, in Rule 1's strip loop (L208-213), strip a raw ONLY when it is an
identifier:

```
if (!_r) continue;
const _hint = String((_e && _e.hint) || '').toLowerCase();
const _isPurposeWord = _hint === 'attachment_type' || _hint === 'category' || _hint === 'brand';
const _isCodeShaped  = /\d/.test(_r);          // all real codes here carry a digit (SRTWC286-SH, sc07, SMC202606-0001, ecmu5054141)
if (_isPurposeWord && !_isCodeShaped) continue; // KEEP alphabetic purpose words in the remainder
// else strip as before
```

- **Bare code protection preserved:** `SRTWC286-SH`/`sc07`/`SMC…` all contain a digit → stripped → empty →
  `bare_forced_none` → carry prior domain (coordinator hole + bare-code flake protection intact).
- **Decisive purpose-word gap closed:** "certificate sc07" → keep "certificate", strip "sc07" → remainder
  "certificate" (non-empty) → falls through to Rule 2 → `intent_forced_explicit` (given the decisive
  `check_product_attachment` intent) → honors the current term, no mis-carry.

**Customer-name edge (as flagged):** a bare customer name (alphabetic, not code-shaped, hint `customer`) is
NOT in the `_isPurposeWord` set above, so it is still STRIPPED → still `bare_forced_none` — i.e. the
refinement leaves the customer path exactly as it is today (compat gate: `customer` is blocked in
incoming/inventory/master_products/product_attachment/promotion/order etc., so a bare customer name after a
non-order prior does not wrongly carry; after `order` it carries `order`, which is correct). **Do NOT add
`customer` to the keep-set** — that would move customer names into Rule 2 and could force explicit on a bare
name where the compat-gated carry is the safer behavior. Keeping the refinement scoped to
`attachment_type` (+ optionally `category`/`brand`, which have no decisive intent so are inert either way)
is the correct, minimal rule. This scoping resolves the edge the task raised.

**Verdict on the NOTE:** APPROVE as-is; the refinement is **recommended, not required.** If the user wants
full determinism on decisive purpose-word entities, apply the scoped rule above to the fork, re-run the
cert-after-{master_products, forms, product_attachment} mini-chains via the `chat-stateful` lane
(assert `src=intent_forced_explicit` and the switch to `product_attachment`), then promote the hardened fork.
Otherwise promote as-is and track this as a known narrow residual.

## Re-confirmations (rev3 is new code)

- **Zero-egress (§0 S1-S6) — RE-CONFIRMED.** Parser sub is classification-only (node types: trigger,
  lmChatOpenAi, code×3, agent, memoryPostgresChat, if — no httpRequest/respond-io/send/assign); structural
  zero egress independent of rev3. Tester R3 §0 shows on every turn: S1 `egress_ran=NONE`, send via chat
  fork `ublq9nSlrpz63xan`→`{success:true}`, `production=false`, no respond.io POST; S2 escalation
  confirmations route via guarded HI fork `vUfFUDjLAuMaeQE6` with `is_test=true` and NO
  assign/SLA/PIC/queue/round-robin node executing (would-write only); S3 no prod session PUT /
  update-human-intervened (session R/W to `n8n_test`); S4 get-results READ tools only, never
  `crm_it_support_ticket_create`; S5 every sub carried `is_test`; S6 one reformulator fork/turn +
  `Basic LLM Chain` only on legit clarification. Holds across the spot-checked execs. ✓
- **Reference-answer blast radius (Fix 2 relabel) — CLEARED.** Tester R3.2 proves affirm ("yes"), decline
  ("no" → "Escalation declined."), positional ("3"), dym-pick (customer + date window RETAINED),
  member-pick-by-number ("2" → assignee idx-2) and member-pick-by-name ("Cyndi" → same assignee) all resolve
  under `Current user message:`. The relabel did not break any reference path. ✓
- **decline-flag + dym co-residence — CONFIRMED content-identical** (grep counts above; diff doc's
  "content diff = empty, only line numbers shifted +44"). The rev3 insertion did not clobber the
  post-fork-cut live logic. The bundling caveat (promote step 3) still applies at the live splice. ✓
- **Scope/tier — CORRECT.** parser tier, tested via `chat-stateful` real-reformulator lane (NOT pinned
  replay, which is blind to prompt+output_exchange changes — LESSON 28). ✓

## Prior PROMOTE CHECKLIST — still valid, with rev3 deltas

The 10-step checklist above stands. Register these rev3 changes at promote time:
- **Re-sha at the CURRENT fork version `4267927c`** (NOT the stale rev2 `639cf44f` / rev1 shas). Source
  promoted bytes from the live fork params (LESSON 25). rev3 shifted the `output_exchange` splice anchors
  (+44 lines from the inserted IIFE) and the `AI Agent.text` line-2 label — **re-sha the live-vs-fork diff
  fresh; do not gate on any doc-recorded line numbers.**
- **Port the new deterministic block too:** the `_DECISIVE_INTENTS` set + `_effectiveDomainSignal` IIFE +
  the two `const _explicit = _explicitEff;` swaps + the `AI Agent.text` `Current user message:` relabel are
  part of this promote. The `AI Agent.systemMessage` is UNCHANGED by rev3 (still the rev2 binary form) —
  promote it once from the rev2 body; do not re-edit.
- **Replay `norm()` registration (LESSON 40):** in addition to the prior diagnostics
  (`domain_inherited_compatible`/`domain_reused_entityless`/`domain_inherit_blocked`, drop-when-absent) and
  `domain_signal` (flagged-on-change), register the NEW diagnostics **`domain_signal_effective`** and
  **`domain_signal_source`** as drop-when-absent so they don't false-positive the golden baseline. They
  appear on every parser output post-promote.
- **If applying the recommended refinement first,** promote the hardened `output_exchange` (re-sha again
  after the strip-loop edit) — do not promote a fork that differs from what was re-tested.

---

# RE-REVIEW — REVISION 4 (de-overfit: intent-only effective signal; DROP the LLM `domain_signal` field + rev3 string-strip)

Reviewer: sorento-reviewer · Date: 2026-07-16 · scope: **parser** (same fork `wI5RkNGW3EOJfBdo`).
Inputs: diff `tests/diffs/parser-domain-continuity-carry.md` REVISION 4, run
`tests/runs/domain-continuity-18chain-20260715.md` REVISION 4. Live state re-verified via MCP this cycle.
This re-review covers ONLY the rev4 delta (a simplification of rev3). The rev1/rev2/rev3 APPROVEs above stand.

## REV4 VERDICT: **APPROVE** (promotion user-gated) — and domain-continuity-carry is now **FULLY PROMOTE-READY**

Rev4 is a genuine simplification that also *removes* the one open rev3 concern I flagged (the
`bare_forced_none`-on-a-decisive-short-message hole). It replaces rev3's fragile message-strip heuristic
with a one-line intent-only derivation and drops the LLM `domain_signal` output field entirely. The net
effect is the payoff: the AI Agent `systemMessage` returns **byte-identical to the ORIGINAL LIVE**, so the
promote no longer needs a systemMessage splice at all. Correctness holds (17/18, the rev3 cert-after-forms
edge is fixed), co-residency is preserved, and zero-egress is structural + re-confirmed. The single remaining
residual is narrower and *never-observed-live*. Approving; either promote-now is authorized.

## Independent verification (MCP, this cycle)

- **Fork `wI5RkNGW3EOJfBdo`** — active, **draft==active `711b689c-8feb-4951-89ee-3fa6fe7b4d75`** (matches the
  rev4 doc), updatedAt 2026-07-15T21:45Z. ✓
- **Live `XTODTw` UNTOUCHED** — versionId==activeVersionId `53ea677a`, updatedAt **2026-07-14T03:36**
  (predates rev4). Promotion target only. ✓
- **Live spine `9qVyfUxmRQqrpGRMDLRuz` UNTOUCHED** — versionId==activeVersionId `bcdb5633`, updatedAt
  2026-07-13. ✓
- **Fork is classification-only** — 8 nodes (executeWorkflowTrigger, lmChatOpenAi, code×3, agent,
  memoryPostgresChat, if); grep for httpRequest/respondio/send/assign node types = **0**. Structural zero
  egress inside the sub, independent of this change. ✓
- **`AI Agent.text`** = the rev3 2-line form UNCHANGED by rev4: `Previous response:` sanitize regex retained,
  line-2 label `Current user message:` retained, `Previous domain:` deleted. Verified verbatim. ✓
- **`AI Agent.systemMessage`** — **sha256(16) `c47d6754906a07cc` == the ORIGINAL LIVE systemMessage sha**
  recorded in this doc's rev1 lossless-fork proof. `grep domain_signal` = **0**. The OUTPUT block goes
  `domain_hint` → `scope_intent` with no `domain_signal` key between. **Confirms `domain_signal` was purely
  additive across rev1-3 → removing it returns the prompt byte-for-byte to live → NO systemMessage splice at
  promote.** ✓
- **`output_exchange.jsCode`** — sha256(16) `216ea6d0ecb861cf` (43,078 bytes, matches rev4 doc), `node --check`
  → **OK**:
  - Intent-only derivation (L196-202): `_DECISIVE_INTENTS` = the exact 11-set, then
    `const _explicit = _DECISIVE_INTENTS.has(output.output.intent_hint) && !!output.output.domain_hint;` and
    `output.output.domain_signal_source = _explicit ? 'intent_explicit' : 'intent_none';` (diagnostic only). ✓
  - **All rev3 artifacts GONE:** `_effectiveDomainSignal`, `_explicitEff`, `domain_signal_effective`,
    `bare_forced_none`, `intent_forced_explicit` = **0 occurrences each**. ✓
  - **Both carry sites read the shared top-level `_explicit`** and fire on `!_explicit`: reuse-path
    (`case 'reuse'`, L279 `if (!_explicit)`) and entity-bearing (L474 `if (!_explicit)`). No per-site
    re-derivation. ✓
  - **Carry bodies + compat gate byte-unchanged** from the rev3-reviewed logic: reuse-path carries
    domain+intent, sets `domain_reused_entityless`, does NOT overwrite `message_type`; entity-bearing computes
    `curEnts` (current_message===true), runs the compat `every()` gate (L480) against
    `DOMAIN_BLOCKED_HINTS[prevDom]` (L479), OVERRIDE→`domain_inherited_compatible` on compatible else
    `domain_inherit_blocked`, and runs BEFORE blocklist-apply. rev3→rev4 delta = the IIFE→one-liner swap + 2
    comment rewords + 2 deleted local `const` lines, exactly as the diff claims. ✓

### 1. Correctness (intent-only `_explicit` at both carry sites) — PASS
The shared `_explicit` is the single gate; both carry blocks fire on `!_explicit`; the compat `every()` gate
is unchanged. Matches tester rev4 R4: certificate-after-forms → **product_attachment / intent_explicit** (the
rev3 mislabel edge killed), list-price flake → **master_products ×3** (intent_explicit), bare-code-after-eta →
**incoming** via `domain_inherited_compatible` (intent_none), charmant → **order** with `charmant hardware`
customer retained, got-stock → **inventory**; **17/18** chains (C16 casual, pre-existing, not a rev4
regression). Verified against those.

### 2. Accepted residual — ACCEPTABLE, not a blocker
The only residual is: a bare code the LLM flakes to a decisive intent → `_explicit=true` → no carry →
continuity breaks (tester offline case (d), synthetic). This is **cleaner than rev3's trade-off**: rev3's
Rule-1 string-strip covered this synthetic case but introduced an **OBSERVED** edge (decisive purpose-word
entities like "certificate" stripped → wrongly forced `none` — the rev3 NOTE I adjudicated). rev4 chooses
correctness on the observed cert case over the unobserved bare-flake case. Grounding for acceptability: across
this suite + all prior runs the LLM emitted `intent_hint=null` (→ intent_none) for **every** real bare code
(A1/C1/C3/C17-T1) — bare→decisive-intent was never observed live. Severity if it ever fired = wrong-DATA, not
egress (safety intact); and it is not a regression vs live (live's `Previous domain:` anchors contaminate the
same class at least as badly). Clearly documented in the diff (case (d) "ACCEPTED RESIDUAL"). **Judged
acceptable.**

### 3. `domain_signal` fully removed — CONFIRMED
- `output_exchange`: only 2 `domain_signal` substrings remain — a comment ("no LLM domain_signal field") and
  the `output.output.domain_signal_source = …` diagnostic assignment. **No read of `output.output.domain_signal`
  anywhere.** ✓
- `suggest-follow-up` (fork): 0 occurrences. ✓
- `AI Agent.systemMessage`: 0 (byte-identical to original live). ✓
- Clone spine consumers: the systemMessage returning byte-identical to original live **proves the field was
  purely additive** — it never existed on live, so no clone/spine node was ever written to read it (coder's
  independent grep of the clone = 0 corroborates). Only `domain_signal_source` (a new diagnostic) remains on
  the parser output. ✓

### 4. Co-residency (decline-flag + dym) — CONFIRMED content-identical
`escalation_declined` ×2; `tryDymPick`/`dym_candidates`/`dym_pick_applied` ×2 each — counts unchanged rev3→rev4,
and the rev4 diff touches none of those lines (only the 3 signal hunks). The bundling caveat (promote step 4 —
splice, do NOT wholesale-replace `output_exchange`) still applies at the live write. ✓

### 5. Zero-egress (§0 S1-S6) — RE-CONFIRMED PASS
Parser sub is structurally incapable of egress (node types verified above; classification-only). Tester R4 §0
holds on every turn: S1 `send-message-files/images/video` never ran, send routed via chat fork
`ublq9nSlrpz63xan` → `{success:true}` to redis `chat:reply`, no `api.respond.io/.../message` POST,
`production=false`; S2 no human-intervention / assign / SLA / PIC / queue write; S3 no prod session PUT /
update-human-intervened (session R/W to `n8n_test.respond_contacts_test`); S4 get-results READ fork
`rysSPgUssLDf6xJc` only, never `crm_it_support_ticket_create`; S5 every invoked sub carried `is_test`; S6 one
reformulator fork/turn + `Basic LLM Chain` only on legitimate clarification. Confirmed across the spot-checked
clone parents. ✓

### Scope/tier — CORRECT
parser tier; edits inside the reformulator fork (`output_exchange.jsCode` + `AI Agent`); tested via the
`chat-stateful` real-reformulator lane (NOT pinned replay, which is blind to a prompt+output_exchange change —
LESSON 28). Matches the change's declared scope. Tester's decisive-T1 self-cleaning driver deviation (no hard
pg reset; host psql unavailable + reset-helper prod footgun) is defensible — every chain's T1 is a
decisive-term turn (`_explicit=true` → carry cannot fire → self-cleans domain) and T1 inertness was asserted,
keeping every domain assertion valid.

## PROMOTE CHECKLIST → live sub `XTODTw-dJcV0uRdC056hG` (user-gated) — rev4 SIMPLIFIED

The prior 10-step checklist stands with these rev4 replacements (the payoff = one fewer live hunk):

1. **Re-verify live base unchanged at promote time.** Confirm `XTODTw` versionId==activeVersionId still
   `53ea677a` (it is now). Capture the prior versionId + CURRENT live `AI Agent.text` and
   `output_exchange.jsCode` as backup BEFORE any write.
2. **★ NO systemMessage splice.** rev4 removed the `domain_signal` OUTPUT key + its definition, returning the
   fork systemMessage byte-identical to live (sha `c47d6754906a07cc`). Do **NOT** touch
   `AI Agent.options.systemMessage` at promote — it already equals live. (This was a hunk in rev1-3; it is
   GONE in rev4.)
3. **`AI Agent.text` — the ONLY AI Agent change:** replace `.parameters.text` with the 2-line form — delete
   the `Previous domain:` line, sanitize `Previous response:` (the `Previous turn (<domain>)` strip regex),
   relabel line 2 to `Current user message:`. Fork sha `73bfdc8a3e894f53`.
4. **★ CRITICAL bundling — splice ONLY, do NOT wholesale-replace `output_exchange`.** The live
   `output_exchange` co-hosts decline-flag (`escalation_declined`) + dym (`tryDymPick`) logic that may have
   advanced on live AFTER the fork cut. Diff live-vs-fork and confirm the ONLY deltas are the domain hunks,
   then splice: the intent-only block (`_DECISIVE_INTENTS` 11-set + the shared `_explicit` +
   `domain_signal_source`) and the two carry-site `if (!_explicit)` reads + their bodies. Fork
   `output_exchange` sha `216ea6d0ecb861cf`.
5. **`setNodeParameter` (single-leaf, byte-exact)** for the two leaves (`AI Agent.text`,
   `output_exchange.jsCode`) — never `updateNodeParameters` deep-merge (LESSON 32).
6. **sha-gate: verify DRAFT==intended BEFORE publish; publish; verify ACTIVE==intended AFTER publish**
   (LESSON 24/25). Re-sha the LIVE fork bodies fresh at `711b689c` — **all prior-rev shas are STALE**. Source
   promoted bytes from the live fork params, not from memory/diff doc. Auto-revert on any mismatch.
7. **`node --check` the promoted `output_exchange.jsCode`** on live before publish.
8. **Post-promote smoke (chat-stateful / regress-capture, real reformulator, NOT pinned replay):** cert-after-forms
   (→product_attachment), list-price-after-eta (→master_products), bare-code-after-eta (→incoming), charmant
   (→order, customer retained), got-stock (→inventory). Re-confirm §0 S1-S6 on the live sub.
9. **Replay `norm()` registration (LESSON 40):** register the NEW diagnostic **`domain_signal_source`** as
   drop-when-absent, and the carry diagnostics (`domain_inherited_compatible`/`domain_reused_entityless`/
   `domain_inherit_blocked`) as drop-when-absent. **DROP the now-removed `domain_signal` /
   `domain_signal_effective` from any prior norm registration** (rev1-3 registered them; they no longer exist).
10. **NEVER edit live mid-cycle.** Do all work on the fork; the live write is a single reviewed, backed-up,
    sha-gated 2-leaf splice.

**Do NOT promote:** the SPINE `compile-current-state` leak-at-source fix (separate future spine change) or the
clone repoint (test-only).

## PROMOTE-READY STATEMENT
**domain-continuity-carry is FULLY promote-ready.** It closes the coordinator bare-code hole (A1/C1) and the
charmant contamination bug (B1) with zero egress and no live-behavior regression; rev4 additionally removes the
last open rev3 concern (the `bare_forced_none` decisive-short-message hole) and *simplifies the promote to a
2-leaf splice* (no systemMessage change). The one remaining residual (unobserved bare→decisive-intent flake) is
wrong-DATA-only, never seen live, and documented. Promotion is user-gated; this APPROVE authorizes it as safe
and correct.
