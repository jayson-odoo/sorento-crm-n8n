# Node diff — `dym-candidate-map` (did-you-mean pick RETAINS prior customer + date)

Plan: `../../plans/dym-candidate-map-plan.md`. UAC: `../UAC.md` §V-DYM0 + §24. Scope tag **`parser`**.
Bug ground: live sub `XTODTw` exec **8666864** (T2 pick dropped customer + date).

## Targets (verified this cycle; NO live edits)
| workflow | id | role | before versionId | after versionId (active) |
|---|---|---|---|---|
| `sorento-consume-main TEST` (clone spine) | `txiPzSxy3Pclsz6v` | build/store (Edit A,B) | `af6c94e7-1ee5-451d-bda6-592b95589165` | `f690da38-1e35-497a-b207-6548ae3f7e14` |
| `sub-semantic-parser FORK domain-continuity-carry` | `wI5RkNGW3EOJfBdo` | consume (Edit C,D) | `f7e6afd0-83c2-4887-94b0-fef5e1c59c07` | `b552ea26-8701-463d-bb87-1767ad0d5b12` |

Both: draft == active (published). Clone `Call 'sub-query-reformulator'` → fork `wI5RkNGW3EOJfBdo` (re-confirmed). Live spine `9qVyfUxmRQqrpGRMDLRuz` and live sub `XTODTw` UNTOUCHED. No promotion.

3 nodes / 6 hunks. All writes via `setNodeParameter /jsCode` (single leaf, byte-exact, siblings preserved — `output_exchange.mode=runOnceForEachItem` intact). Post-write re-fetch diff = byte-identical to local (modulo a jq trailing-newline artifact). `node --check` on all three; 33/33 offline units (§V-DYM0 a–i + precedence §24c-1/2/3) pass against the stored code.

---

## `dym_candidates` shape (one entry per offered suggestion)
```js
{ code, uuid, entity_type, for_raw, for_hint, for_canonical }
// code          = the suggested option the user taps/types (canonical_code)
// for_raw       = ★ the SOURCE token originally typed (res.token / askedCode) — the linkage key
// for_hint      = hint of the source entity (from parser q.entities matched to for_raw)
// for_canonical = the source entity's ambiguous canonical, if any (fallback matcher)
```
Map is code→source-token (NOT positional). Coexists with `last_result_set` (= member roster on the merged turn).

---

## Edit A — `build-suggest-offer` (`7972abd8`, clone) — BUILD the map  [4 hunks]
Node passthrough unchanged; ADDITIVE `out.dym_candidates`.
- **A0 (shared):** after the D1 `picks` are computed, compute `_srcEnt` = the parser `q.entities` entry whose `raw` (ci) == `d1.token`. Used by both D1 branches for `for_hint`/`for_canonical`.
- **A1 — D1 numbered mode:** after `out.suggest_last_result_set`, add `out.dym_candidates = picks.map(p => ({code:p.m.canonical_code, uuid, entity_type, for_raw:d1.token, for_hint:_srcEnt?.hint||entity_type, for_canonical:_srcEnt?.canonical_code||null}))`. Keyed on the pick's CODE, never the label.
- **A2 — D1 code mode:** identical addition after its `suggest_last_result_set`.
- **A3 — D2 non-uuid alternatives:** `out.dym_candidates = out.suggest_last_result_set.map(r => ({code:r.product||r.value, …, for_raw:askedCode, for_hint:compat[0]?.entity_type||null, for_canonical:compat[0]?.(code||canonical_code)||null}))`.
- **A4 — D2 uuid alternatives:** identical addition after its `suggest_last_result_set`.
- **D3 (incoming sibling picker) untouched** → `dym_candidates` stays unset on that path (positional pick, no ambiguous source token). Every non-suggestion return path also leaves it unset → cleared by Edit B.

## Edit B — `compile-current-state` (`7a130a0c`, clone) — STORE + always-CLEAR  [1 hunk]
In the persisted `output.variables` blob (round-trips whole as next turn's `previous_conversation_state`, no whitelist), add one key:
```js
"dym_candidates": (_sug && Array.isArray(_sug.dym_candidates)) ? _sug.dym_candidates : []
```
`_sug` = `build-suggest-offer` output when `suggest_offer===true` (survives the `_merge`/`member_offer` case). Writing `[]` on every non-offer turn is the CLEAR mechanism (variables rebuilt whole each turn → map lives exactly one consumption). `last_result_set`/`selection_context` semantics unchanged (member roster still wins for positional/name picks).

## Edit C — `output_exchange` (`847a1173`, fork) — CONSUME (reconciliation)  [1 hunk]
New IIFE `tryDymPick()` inserted AFTER the FLYER injection and BEFORE the entity-op executor (so the executor sees corrected entities + scope_exclusive). Anchored on code content.
- Reads `previous_conversation_state.dym_candidates`; matches the picked code by `norm(c.code)===_msg` OR a current-message entity's raw/canonical == code. No hit → early return (today's behaviour).
- Finds the prior entity to replace by `for_raw` (primary) → `for_canonical` → unambiguous single-`for_hint` fallback. **No string/prefix matching** — this is what makes FUZZY picks (`cwc2816`→`CWCX2816`) work.
- Builds the reconciled entity set EXPLICITLY: picked code replaces the source entity in place (resolved to `code`, uuid/canonical carried as resolve hints), ALL other prior entities RETAINED, every entity flagged `current_message:true`. (Do NOT rely on scope_exclusive/axis merge — in `order`, product+customer share `order_scope`, so the axis filter would otherwise drop the retained customer.)
- Forces `entity_op='replace_combine'`, `scope_exclusive=false` (ignores the LLM's `scope_exclusive=true`), `message_type='business_query'`; carries prior `domain_hint`/`intent_hint` and prior `date_filter_start/end/mode` when this turn named none. Sets `dym_pick_applied=true`.
- Executor consequence (order): `current`=reconciled set, `keptPrior`=prior.filter(not order_scope)=[] → `finalEntities`=exactly the reconciled set. Order ∈ `DATE_FILTER_DOMAINS` → carried date survives the date gate.

## Edit D — `output_exchange` member-block guard (fork)  [1 hunk]
```diff
- if (_selCtx === 'member_offer') {
+ if (_selCtx === 'member_offer' && output.output.dym_pick_applied !== true) {
```
A dym code pick on the merged `member_offer` turn skips the member block entirely (Edit C already owns the turn). Bare number/name → member pick, bare yes/no → escalate/decline — all unchanged (proven: §24c-1/2/3 units).

`suggest-follow-up` (`00db72a7`), `disallowed-entity-gate`, `resolve-entity`, get-results/get-rag, D3, member-pick tiers (beyond the Edit-D guard), `deriveRouting`, date-gate policy, blocklist — all untouched.

---

## Offline results (§V-DYM0, run against the STORED clone+fork code — 33/33 PASS)
- **a** D1 code-mode → 3 candidates `{code∈SH set, for_raw:'Srtwc286', for_hint:'product'}`.
- **b** D1 fuzzy (`cwc2816`→`CWCX2816`) → `{code:'CWCX2816', for_raw:'cwc2816', for_hint:'product'}` (linkage from resolver grouping, not prefix).
- **c** D2 alternatives → every entry `for_raw===askedCode`.
- **d** non-suggestion path → `dym_candidates` unset (→ Edit B writes `[]`).
- **e ★ flagship (repro of 8666864):** prev [customer I bath 300-I057, product Srtwc286] + date 07-13→07-15 + `dym_candidates`; pick `SRTWC286-SH` → entities = [customer 300-I057 RETAINED, SRTWC286-SH resolved in-place], `scope_exclusive===false`, `date_filter_start==='2026-07-13'` & `_end==='2026-07-15'` carried, `domain_hint==='order'`, `dym_pick_applied===true`, exactly 2 entities (no stray dup).
- **f** fuzzy pick → `cwc2816` prior replaced by `CWCX2816` (no prefix relation).
- **g** single-token → entities=[SRTWC286-SH], no regression.
- **h** code NOT in map (`SRTUFV101`) → `dym_pick_applied` absent, entities/scope_exclusive untouched.
- **i** no `dym_candidates` in prev → inert, `dym_pick_applied` absent.
- **precedence (Edit D):** §24c-1 number `2` → member pick (`preferred_assignee_id`=roster idx-2, no dym); §24c-2 `yes` → round-robin escalate (`is_escalation_confirmation:true`, no preferred, no dym); §24c-3 code on merged turn → dym pick, member block skipped, customer retained.

Harness: `scratchpad/dym-units.test.js` (+ `.fetched.test.js` run against stored code).

## Zero egress
State + classification only. No egress node added/changed. Clone remains fail-closed (re-confirmed post-write: `send-message-files/images/video`, `update-human-intervened`, `save-session-vars`, `Call 'sub-respond-save-message-redis'2` still DISCONNECTED_NODE = 0 inbound). All shared-sub calls still `is_test`-guarded. Edit C/D fire only when `dym_candidates` exists in prev state + a matching code — prod-safe (live never populates it until the spine-side A/B are promoted). Validation warnings on both workflows are the pre-existing/expected set (LESSON 13): hardcoded x-api-key, orphaned egress DISCONNECTED_NODE, OpenAI builtInTools, transcribe prefix, Postgres Chat Memory subnode.

## For the tester
Consume cases (§24a–g) need the REAL fork (mock-blind — LESSON 28) + a stateful driver (`chat-stateful` or `regress-capture`; uac mode cannot round-trip state — LESSON 31). Replay is BLIND to Edit C (pins `mock_reformulator_output`) — do NOT use pinned replay for consume cases. Reset `respond_contacts_test` ONCE before T1 of each chain, never between turns.

---

## REVISION 2 (2026-07-15, coder) — FIX FINDING 1 (date-relaxation customer-drop regression) + FINDING 2 (for_hint align)

Fixes the HARD REGRESSION from `tests/runs/dym-candidate-map-suite-20260715.md` FINDING 1: a date-relaxation offer ("No delivery on <range> — reply with a date to continue") was building `dym_candidates` keyed on DATES (`code:"2026-07-06"`, `for_raw:"I BATH STUDIO"` = the customer). A subsequent date reply — which the bot itself invited — matched `tryDymPick`, replaced the customer entity with the date, and dropped customer scope (repro exec 8711232). Fix scopes dym to CODE corrections only, both sides.

### New target versions (NO live edits; live spine `9qVyfUxmRQqrpGRMDLRuz` + live sub `XTODTw` UNTOUCHED)
| workflow | id | before versionId | after versionId (active) |
|---|---|---|---|
| clone spine (Edit A build side) | `txiPzSxy3Pclsz6v` | `f690da38-1e35-497a-b207-6548ae3f7e14` | `6af34046-2f4a-4773-8a9d-7e929ea41efd` |
| reformulator fork (Edit C consume side) | `wI5RkNGW3EOJfBdo` | `b552ea26-8701-463d-bb87-1767ad0d5b12` | `732fdeeb-bced-432c-becb-64db0463a888` |

Both: draft == active (published; the public REST PUT writes active directly — verified). Clone `Call 'sub-query-reformulator'` → fork `wI5RkNGW3EOJfBdo` (re-confirmed). Compile-current-state (Edit B) + fork member-guard (Edit D) UNCHANGED. Settings preserved (`availableInMCP:true`, `callerPolicy`, `binaryMode` all intact). `output_exchange.mode=runOnceForEachItem` preserved. Both edited nodes re-fetched post-write = byte-identical to local `.fix.js`.

### Build side — `build-suggest-offer` (`7972abd8`, clone)
1. **New helpers** (top): `isDateLike(s)` (matches `YYYY-MM-DD` / `D-M-Y` ISO+slash forms) and `isCodeShaped(s)` = non-empty, alphanumeric, and NOT date-like.
2. **A3 (D2 non-uuid alternatives) — THE FIX:** wrap the `out.dym_candidates` construction in `if (axis !== 'date') { … .filter(c => isCodeShaped(c.code)); }`. On the date-relaxation arm (`axis==='date'`, tied to `relaxed_axis:'date'`) it now emits NOTHING → `compile-current-state` writes `dym_candidates:[]` (the clear). On the code arm it additionally drops any date-valued / non-code-shaped candidate.
3. **A4 (D2 uuid alternatives):** same `if (axis !== 'date') { … .filter(isCodeShaped) }` guard (defensive; uuid alts are never dates).
4. **A1/A2 (D1 numbered + code mode) — FINDING 2 align:** `for_hint` now prefers the RESOLVED `entity_type` over the parser hint: `for_hint: p.m.entity_type || (_srcEnt && _srcEnt.hint) || null` (was `(_srcEnt && _srcEnt.hint) || p.m.entity_type`). `for_raw` remains the linkage key. (A3/A4 already used `compat[0].entity_type` for `for_hint` — already aligned.)

### Consume side — `output_exchange` (`847a1173`, fork) `tryDymPick`
5. **Belt-and-suspenders date guard:** new local `_isDateLike`; `_codeMatches` now short-circuits `!_isDateLike(c.code) && (…)` so a date-valued candidate can NEVER match — even a stray date entry can't hijack dym. A date reply therefore falls through to normal date handling (date_filter update + entities retained), never `tryDymPick`.

### Offline units (33/33 PASS against the STORED fix — `scratchpad/dym-units.fix.test.js`; original 33-unit suite also re-run green on the fix)
- **(a) flagship STILL passes:** D1 code-mode builds 3 candidates; T2 pick retains customer + date, `dym_pick_applied:true`, `scope_exclusive:false`, `for_hint:'product'` (= entity_type, not parser 'order').
- **(b) REGRESSION FIXED:** date-relaxation offer → `suggest_offer` still built, but `dym_candidates` UNSET (→ compile clears to `[]`); a subsequent date reply → `dym_pick_applied` ABSENT, customer RETAINED, no date-as-customer entity, `date_filter` applied normally.
- **(c) consume guard:** a stray date-valued candidate never matches `tryDymPick`; customer preserved.
- **(code) real code correction on the same shape STILL fires** (`dym_pick_applied:true`, customer retained) — the fix does not over-block.
- **(d) unregressed:** §24c-1 number→member pick, §24c-2 yes→round-robin, §24c-3 code→dym (member block skipped), code-not-in-map→no dym, non-suggestion→dym unset, D2 code arm still builds with `for_hint=entity_type`.
- **(e) for_hint = entity_type** asserted in (a) and (d).

### Validation
`node --check` PASS on both edited bodies. `validate_workflow` (this SDK server) validates SDK-code strings, not a live 97-node workflow by id, so it is not applicable to an in-place edit; the equivalent guarantees hold: n8n accepted both REST PUTs with HTTP 200 (server-side structural validation), byte-fidelity confirmed, and only the two Code-node `jsCode` leaves changed vs the prior tester-validated build. Pre-existing validation warnings (LESSON 13) unchanged.

### Zero egress (re-confirmed post-write)
State + classification only; no egress node added/changed. Clone still fail-closed: `send-message-files/images/video`, `update-human-intervened`, `save-session-vars`, `Call 'sub-respond-save-message-redis'2` all inbound=0 (DISCONNECTED). Shared-sub calls still `is_test`-guarded (human-intervention + reformulator pass `is_test:true`). No promotion.
