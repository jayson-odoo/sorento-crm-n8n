# Node diff — `dym-all-and-domaincarry` (#4 select-ALL + #5 pick-domain-carry)

**Scope:** `parser`. Single node changed: **`output_exchange`** (`847a1173-5e8d-48bf-ae3d-b1be218b0e88`).
**Target this round:** CLONE parser fork **`wI5RkNGW3EOJfBdo`** (`sub-semantic-parser FORK domain-continuity-carry`) ONLY.
**NOT touched:** LIVE parser `XTODTw-dJcV0uRdC056hG`, live spine `9qVyfUxmRQqrpGRMDLRuz`, clone spine `txiPzSxy3Pclsz6v` (compile-current-state / build-suggest-offer unchanged, spine NOT republished), #1 (build-suggest-offer).
**No promote.** No UAC executions. This round republished ONLY the parser fork.

## Publish result (fork `wI5RkNGW3EOJfBdo`)
- Pre-edit: `versionId == activeVersionId == b31839e6` (clean, no pending draft).
- Post-publish: `versionId == activeVersionId == a570efc0-c885-41ea-9345-fa291e678b53`, `active: true`, `isArchived: false`.
- Draft-vs-active before publish: ONLY node differing = `output_exchange`; connections identical.
- **`output_exchange` jsCode SHA-256 = `292db8dc565b9b900c3b5a8d6db44fcbabbe5430eb9282a7401f4d9fbad51551`** (draft==active byte-identical to the validated deploy file).
- **`AI Agent` systemMessage SHA-256 = `fb7f1258d5ea16c8ea6f8968d4f42ecf24c65909f6e87cdbe99a5c9d28e380e6` — UNCHANGED from the pre-edit fork** (confirms #4/#5 are output_exchange-only, no prompt change).
- `node --check` OK; zero trailing-whitespace lines; update returned only the documented pre-existing warnings (Postgres Chat Memory disconnected, OpenAI builtInTools — LESSON 13); zero auto-assigned credentials.

## Build-time LIVE re-diff (LESSON 57)
- LIVE `XTODTw` `output_exchange` (node same id `847a1173`, 740 lines) carries **NEITHER** #4 (`_dymActive`) **NOR** #5 (`dym_pick_domain_forced`) — grep count 0.
- The fork already diverged from LIVE by **126 diff-lines BEFORE this change** — the accumulated, unpromoted #1/#2-v3/dym-single-use/rev4/state-monitor work: `applyDymPick`, `tryDymPick`, `dymNumberedMultiSelect`, `dym_offer`, `dym_slot`, `dym_last_result_set`, `dym_candidates` fallback, `reference_target`, `_parser_raw` snapshot.
- **DRIFT NOTE for the eventual promote:** the memory item "fork wI5RkNGW3EOJfBdo now byte-identical to live XTODTw" is STALE — the fork is NOT byte-identical to live. A future live promote MUST build the target as **LIVE `XTODTw` output_exchange bytes + ALL hunks (v3 + #4 + #5)**, by node NAME, byte-SHA gated both sides (LESSON 57/58) — never block-copy this fork.
- This change vs the fork's own prior body: exactly the two additive hunks below, no unrelated lines touched (the fork body had zero trailing whitespace, so the strip was a no-op elsewhere).

---

## Hunk #5 — a confirmed dym PICK carries the offer's domain (STRICT gate, R-DC-1 stricter)
Inside the shared `applyDymPick(_hit, _offer, _priorEnts, _useSlot)`, immediately before `return _final;`:

```js
  const _isBareCode  = norm(_hit.code) === norm(String(parent_input.latest_user_message ?? '').split(/\s*reply to:/i)[0]);
  const _viaNumbered = (_useSlot === false);
  if ((_isBareCode || _viaNumbered) && _offer && _offer.domain) {
    output.output.domain_hint            = _offer.domain;              // load-bearing: RAG filter + gate + deriveRouting
    output.output.intent_hint            = _pv.intent_hint ?? null;    // realign to offer intent; drop contaminated check_product
    output.output.dym_pick_domain_forced = _offer.domain;             // diagnostic (drop-when-absent in replay norm())
  }
```

- **Before:** a contaminated bare-code pick (LLM re-classifies the picked code as `intent_hint:check_product` + `domain_hint:master_products`) makes `_explicit=true` → rev4 carry gate suppressed → the pick answers as a CATALOGUE lookup (route `purchasing_product`). This is the exact repro.
- **After (intent):** on an UNAMBIGUOUS confirmed pick — whole message IS the picked code (`_isBareCode`), OR the pick came through the numbered/dym-select handler (`_viaNumbered`, i.e. `dymNumberedMultiSelect` passes `_useSlot=false`; `tryDymPick` passes `_useSlot=true`) — force `domain_hint = _offer.domain` and realign `intent_hint` to the offer turn's intent (dropping the contaminated `check_product`). `routing` is NOT hand-set; `deriveRouting` (~L649, runs after both pick sites) recomputes it from the forced domain.
- **Strict gate = the key regression guard:** an offered code embedded in a NEW-domain phrase ("promotions for `<code>`") has `norm(code)!==msg` AND is not numbered → NOT forced → the parser's own domain passes through. No-op when `_offer.domain` is absent.
- **Pick-gated:** `applyDymPick` runs ONLY on a real pick (`tryDymPick` found a candidate, or a numbered dym row resolved). A non-pick reply never reaches it → `domain_hint`/`intent_hint`/`routing` untouched.
- Existing retention/replacement (in-place source-token replace, prior-entity retention, date carry, `dym_pick_applied`, code-reply byte-behavior) is intact — #5 only appends the gated domain force.

## Hunk #4 — "all" selects ALL dym suggestions (STRUCTURAL gate, R-ALL-1)
Inside the ALL/SEMUA block, a FIRST branch added before the existing non-dym branch:

```js
  const _dymActive = Array.isArray(prevState.dym_last_result_set) && prevState.dym_last_result_set.length > 0;
  if (_isAll && _noPos && _dymActive) {
    output.output.reference_positions = prevState.dym_last_result_set.map(r => Number(r.idx)).filter(Number.isInteger);
    output.output.reference_target    = 'dym';
    output.output.scope_intent        = null;
    output.output.message_type        = 'business_query';
    output.output.select_all_expanded = true;
  } else if (_isAll && _pickCtx && _lrsAll.length > 0 && _noPos) {
    /* …EXISTING non-dym expansion branch, byte-identical… */
  }
```

- **Before:** with a v3 partial-miss, `selection_context=null` and suggestions live in the separate `dym_last_result_set` → `_pickCtx=false` → the ALL block never fires for a dym offer → "all" fell to the LLM broaden reading.
- **After (intent):** when a dym offer is active (STRUCTURAL: non-empty `dym_last_result_set`; no marker regex — R-ALL-1 decided structural), "all" forces `reference_target='dym'` + every dym idx. Ordering confirmed: this block is BEFORE `dymNumberedMultiSelect` (~L420), which consumes the forced route and loops every suggestion via `applyDymPick` (ADD-BOTH) — each pick then inherits #5's domain-carry (`_viaNumbered=true`). Does NOT set `entity_op='reuse'` (applyDymPick sets replace_combine per pick).
- **Regression guard:** `_dymActive` false → control falls to the EXISTING non-dym branch VERBATIM (byte-identical); a plain broaden with no offer → neither branch fires (LLM broaden intact).

---

## Local 0-egress proofs (39/39 PASS — offline `output_exchange` units, 0 LLM tokens, no egress)
Harness drives the DEPLOYED active body (`active_output_exchange.js`, SHA `292db8dc`) and the current LIVE `XTODTw` body for the fail-on-purpose gates.

| # | proof | result |
|---|---|---|
| (a) | #4 "all" WITH dym offer [§ALL-0] → `reference_target='dym'`, `select_all_expanded`, `scope_intent=null`, positions cleared to `[]`, entities ACCUMULATE all 4 picks + resolved stock RETAINED, domain forced inventory, `dym_pick_applied`. **Fail-on-purpose:** LIVE body does NOT set `reference_target=dym`. | PASS (9/9) |
| (b) | #4 "all" NO dym offer [§ALL-R] → node output BYTE-IDENTICAL to LIVE; existing branch fires (`entity_op='reuse'`, `reference_target` not dym). | PASS (4/4) |
| (c) | #5 bare-code CONTAMINATED pick [§DC5-0] → `domain_hint='inventory'`, routing `warehouse`/`general_enquiries`, `intent_hint` realigned to `check_stock`, `dym_pick_applied`, `dym_pick_domain_forced='inventory'`, picked code in entities. **Fail-on-purpose:** LIVE body keeps `master_products` + routes `purchasing_product`. | PASS (9/9) |
| (d) | #5 NUMBERED pick [§DC5-0b] → `domain_hint='inventory'` forced via applyDymPick, `dym_pick_domain_forced`, picked row resolved, routing `warehouse`. | PASS (4/4) |
| (e) | REGRESSION: "promotions for `<offered code>`" → `domain_hint` stays `promotion` (NOT inventory), `dym_pick_domain_forced` ABSENT, routing NOT warehouse, `dym_pick_applied=true` (pick retained, domain NOT forced). | PASS (5/5) |
| (f) | REGRESSION [§DC5-REGR-newquery]: new unrelated "what promotions do you have" after offer → `domain_hint` stays `promotion`, `dym_pick_applied` NOT set, `dym_pick_domain_forced` ABSENT. | PASS (4/4) |
| (g) | no-dym normal turn [§DC5-noreg] → node output BYTE-IDENTICAL to LIVE; `dym_pick_domain_forced` and `select_all_expanded` ABSENT. | PASS (4/4) |

Fail-on-purpose gates (a) and (c) go RED on the current LIVE body → the instruments are real (MEMORY: green-that-cannot-fail). Byte-identical gates (b) and (g) prove no-pick/no-dym turns are unchanged; the byte-diff vs the changed cases is non-empty.

## Replay `norm()` registration (LESSON 40 — for the tester/reviewer)
Register `dym_pick_domain_forced` and `select_all_expanded` as **drop-when-absent / flag-when-present** so they don't diff the ~2.2k golden turns.

## Confirmations
- systemMessage SHA unchanged (`fb7f1258`) — #4/#5 are output_exchange-only.
- Spine (clone `txiPzSxy3Pclsz6v`, live `9qVyfUxmRQqrpGRMDLRuz`) NOT touched; #1 NOT touched; LIVE parser `XTODTw` NOT touched.
- Zero-egress is structural on the clone (both hunks are additive Code, add no egress node).
