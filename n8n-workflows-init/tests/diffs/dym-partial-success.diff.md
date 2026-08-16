# Node diff — `dym-partial-success` (CHANGE #2)

**Target (clone only):** `sorento-consume-main TEST` `txiPzSxy3Pclsz6v`
**Live spine `9qVyfUxmRQqrpGRMDLRuz`: NOT touched.**
**Edited node:** `compile-current-state` (clone id `7a130a0c-530f-4bfb-a8f2-059ec71c2ea2`) — the ONLY node changed.

## Publish / deploy facts
- Applied via `update_workflow` → 1 op (`setNodeParameter /jsCode`), 0 auto-assigned credentials.
- `publish_workflow` → `success:true`.
- Post-publish: `versionId == activeVersionId == b7f8ddf8-15bf-4246-9b00-3e3973d43382`, `active:true`.
- Deployed jsCode SHA-256 (draft AND active, byte-exact to source file): `58a5d9eaca9c6e011d79851a728630b8772a3cc4c7ce17b6b3ce210ec128f21d`
- `node --check` on the source: OK. Zero trailing whitespace on all lines.
- Validation: only the known pre-existing warnings (Transcribe expression-prefix, the 5 orphaned egress `DISCONNECTED_NODE`s, `OpenAI Chat Model` builtInTools) — LESSON 13, not fixed.

## Untouched (verified by SHA / non-edit)
- `build-suggest-offer` (clone id `7972abd8`) SHA-256 unchanged: `2cc445251bbfeaf7fe2ce8041621afeb0054a0da0aedc1f583c6b479d7f95393` — **CHANGE #1 intact, not reverted or altered.**
- `output_exchange`, `disallowed-entity-gate` / `If3`, `get-results`, `central-exchange` — not in the op set; unchanged.
- Only ONE `setNodeParameter` op was applied; no add/remove/rewire.

## The change (three hunks — no other bytes changed; `diff -w` vs prior node = only these)

Prior node = the clone's `compile-current-state` before this change (SHA `3236f97a…`; 295 lines incl. 4 pre-existing trailing-whitespace lines at 87/113/129/140). Those 4 cosmetic trailing-space runs (after a `;` / on blank lines — zero runtime-output effect) were stripped so the deployed body has no trailing whitespace; nothing else outside the 3 hunks changed.

### Hunk 1 — `selection_context` made reassignable (was `const`, ~line 195)
```
- const selection_context = _merge ? 'member_offer' : (_sug ? 'suggest_offer' : (_mem ? (_mem.selection_context || null) : (_isDisambig ? 'disambiguation' : null)));
+ let   selection_context = _merge ? 'member_offer' : (_sug ? 'suggest_offer' : (_mem ? (_mem.selection_context || null) : (_isDisambig ? 'disambiguation' : null)));
```
Intent: the partial-miss block reassigns `selection_context` to `'suggest_offer'` when it arms a picker. Value unchanged on every path that does not arm; `let` vs `const` has no runtime-output effect.

### Hunk 2 — NEW partial-success block, inserted AFTER the disclaimer IIFE and BEFORE the dym lifecycle
Placement is exactly as the planner mandated (§2.3/§2.5, risk 3):
- runs AFTER the disclaimer IIFE → the disclaimer reads the ORIGINAL stock `last_result_set` (no double-fire);
- `let _partialOffer = null;` is declared just above the `_newOffer` computation so hunk 3 can read it;
- `userResponse` is appended post-disclaimer; `last_result_set`/`selection_context` overrides happen BEFORE they are written into `output.variables`; the offer is visible to `_newOffer`.

Behavior:
- Gate `_answered` = the disclaimer's `answered` condition (`!isEscalateBranch && includeResponse && userResponse non-empty && last_result_set.length>0`) PLUS `qf.message_type==='business_query' && !manualResponse`. Non-answered / escalate / clarify / manualResponse → early return, no-op.
- Defensive parity guard: early return if `getResultObj().is_clarification===true` or `gate.require_specific===true` (both false on a true happy answer).
- D1 detection **ported byte-for-byte from build-suggest-offer**: `cap3`, `UUID_RE`/`isUuid`, `humanLabel` (drops null-label → never leaks a uuid), `isExact`, `allowedTypes = gate.gate_debug.allowed_lookup`, `_mkOffer`, `tokenCandidates(res)` (token's OWN `matches`+`alternatives`, drop-exact, honor allowedTypes, dedupe by canonical_code, no cross-borrow), `missResolutions = r.resolutions.filter(resolved!==true && no exact match)` (excludes the resolved answer token; legacy single-resolution fallback preserved). Missed tokens capped at 5 (`surfaced = missResolutions.slice(0,5)`).
- `surfaced.length===0` → early return → **pure no-op** (this is the no-miss / all-resolved happy path).
- Per surfaced token: `picks = cap3(tokenCandidates(res)).map(m=>({m,label:humanLabel(m)})).filter(p=>p.label)`. Numbered when `picks.length>=1` (contributes to global contiguous `idx 1..M`), else a plain `"<token>" — not found.` line (no idx).
- `userResponse += "\n\nCouldn't find these:\n" + <lines> + "\n\n" + footer`, footer = `Reply a number to check it, or ask again.` when `M>=1`, else `Ask again with the correct code.`
- **Only when `M>=1`:** `last_result_set = _numbered` (`{idx,label,value,product,uuid,entity_type}`, `value=canonical_code` unless uuid-coded then `value=label`, `product=canonical_code`); `selection_context='suggest_offer'`; `_partialOffer = _mkOffer(_dymCands)` where each `dym_candidate = {code, uuid, entity_type, for_raw:<its token>, for_hint, for_canonical}` with per-token `_srcEnt` lookup (no borrow).
- `M===0` (all surfaced tokens plain) → appends plain lines + no-number footer only; `last_result_set` / `selection_context` / offer LEFT AS TODAY.
- `quick_reply` left unset on this path (numbers typed → no buttons).

### Hunk 3 — `_newOffer` sources the partial offer so it survives the `_answered` kill (~line 224 prior)
```
  const _newOffer = (_sug && _sug.dym_offer && Array.isArray(_sug.dym_offer.candidates) && _sug.dym_offer.candidates.length)
-   ? _sug.dym_offer : null;
+   ? _sug.dym_offer : (_partialOffer || null);
```
Intent: on the answered happy path `_sug` is null, so `_newOffer` falls to `_partialOffer`. Lifecycle rule 1 (`if (_newOffer) return {..._newOffer, ttl:3, picked:[]}`) then sets the offer, beating rule 5 (`_answered` → DIE). `output.variables.dym_offer:_dymOffer` and `dym_candidates:_dymOffer.candidates` are emitted unchanged. When `_partialOffer` is null (no miss / M===0), this expression evaluates to `null` — identical to the prior `: null`.

## No-miss happy path is byte-identical (regression invariant, §PS-R)
When all tokens resolve: hunk-2 block early-returns at `surfaced.length===0`; `_partialOffer` stays null; no `userResponse` append; `last_result_set` stays the stock rows; `selection_context` computed exactly as before (the `const`→`let` change is value-identical); hunk-3 `_newOffer` = `null` exactly as before → dym lifecycle rule 5 kills any carried offer on the answered turn, unchanged. Output byte-identical to the prior node. (§PS-R asserts this against LIVE `compile-current-state` runtime output — the tester runs the same pinned fixture against both jsCodes and diffs.)

## Deviations / risks for the reviewer
- **Plain-line format:** the task specifies `"<token>" — not found.` for zero-candidate tokens; the plan §2.3 wrote a bare `"<token>"`. I followed the task directive (`— not found.`). UAC §PS-zerocand only asserts "a plain ZZZQ999 line", which either satisfies; §PS-1 has no plain tokens so this does not affect the primary case.
- **Clone has NO Schedule Trigger** (triggerCount=0; only `When Executed by Another Workflow`) — the safety pre-check "confirm Schedule Trigger disabled" is moot; there is no shared-list-consuming trigger to disable.
- **`last_result_set` repurpose** (planner risk 1) is unchanged in exposure by this build — it is armed only when `M>=1` and only on a path that previously armed nothing pickable. The hard gate is UAC §PS-safety (bare number does not resolve a stock row on the UNEDITED node) — tester's job.
- Em-dash (U+2014) in `"<token>" — did you mean:` matches build-suggest-offer's and UAC §PS-1's expected text; the deployed body's SHA equals the source file's, so the tool-call channel introduced no unicode/whitespace drift.
