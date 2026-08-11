# Node diff — `dym-partial-disambiguation` (CHANGE #2) — CLONE build

Built + published on the CLONE artifacts only. **LIVE parser `XTODTw-dJcV0uRdC056hG` and LIVE spine
`9qVyfUxmRQqrpGRMDLRuz` were NOT touched.** Change #1 (`build-suggest-offer`, sha `2cc44525…`) left
untouched. Do NOT promote — reviewer gate + tester UAC §PD first.

## Targets & deployed state

| workflow | id | node(s) | deployed versionId==activeVersionId | active |
|---|---|---|---|---|
| clone parser fork `sub-semantic-parser FORK domain-continuity-carry` | `wI5RkNGW3EOJfBdo` | `AI Agent`.systemMessage, `output_exchange`.jsCode | `49a70727-f779-4f7d-9676-70f1902c3d0f` | true |
| clone spine `sorento-consume-main TEST` | `txiPzSxy3Pclsz6v` | `compile-current-state`.jsCode | `26db5bc1-f83f-450f-8f9c-af3a1664be23` | true |

### Deployed byte-SHAs (fresh REST GET after publish, `jq -r` of the node body, sha256 first 16)
| node | deployed | intended | match |
|---|---|---|---|
| `AI Agent` systemMessage | `bfb434ba236f92db` | `bfb434ba236f92db` | ✅ |
| `output_exchange` jsCode | `82435c1e055f3cd6` | `82435c1e055f3cd6` | ✅ |
| `compile-current-state` jsCode | `16e4a007f3e79cf1` | `16e4a007f3e79cf1` | ✅ |

`node --check` PASS on both deployed Code nodes. No trailing whitespace in any body. Credentials preserved
(fork: `openAiApi=sorento-openai`, `postgres=n8n_test-db`; spine: 28/28 credentialed nodes intact).
`build-suggest-offer` on the clone spine re-verified `2cc445251bbfeaf7` (change #1 UNCHANGED). Clone spine
has NO Schedule/Respond.io trigger — only `executeWorkflowTrigger` (driven by `zz-canary-run`); no
shared-prod-list consumption hazard.

## Build-time LIVE re-diff (stale-fork guard, LESSON 57) — status: **CLEAN**

Re-fetched LIVE parser `XTODTw` and clone fork `wI5RkNGW3EOJfBdo` at build time. Both surfaces the change
touches are **byte-identical** (so the eventual promote is a clean live+hunks):

| surface | LIVE `XTODTw` sha | fork `wI5RkNGW3EOJfBdo` sha | identical |
|---|---|---|---|
| `AI Agent` systemMessage | `f2b53abba6b66a7d` | `f2b53abba6b66a7d` | ✅ |
| `AI Agent` text template | `b9b564fe7e3cd0fa` | `b9b564fe7e3cd0fa` | ✅ |
| `output_exchange` jsCode | `faf39d353ace0cf4` | `faf39d353ace0cf4` | ✅ |

Both LIVE `XTODTw` and the fork were clean (versionId==activeVersionId, no divergent draft):
LIVE `8d5f7c2d…`, fork `27efa4f7…` — matching the plan §0 claim.

**compile-current-state base:** the clone spine's pre-existing `compile-current-state` (`58a5d9ea…`) was the
**HALTED v1** (per task). It was NOT used as the base. The new body was built on **LIVE spine
`compile-current-state` bytes** (live workflow `9qVyfUxmRQqrpGRMDLRuz`, node `0804657c`, live jsCode sha
`7d4532bc…`, live versionId `a505f2e1…`) + only the redesign hunks. So the eventual promote is live+hunks;
the halted v1 is fully replaced, not layered on.

---

## HUNK A — parser `AI Agent` systemMessage (PROMPT)  [live `c637b079`]

Additive only. (1) a new `REFERENCE TARGET` rule appended after the POSITIONAL REFERENCES block; (2) a new
`reference_target` output key after `reference_positions`. Enum `result|dym|ambiguous|null`; meaningful only
when `reference_positions` non-empty AND the `[<N> did-you-mean suggestions active]` marker is present.

```diff
@@ POSITIONAL REFERENCES block (after "…reference_positions = [].") @@
+== REFERENCE TARGET (which set a positional reply means) ==
+reference_target classifies WHICH addressable set a positional reply points at. It is meaningful ONLY when
+reference_positions is non-empty AND "Previous response" contains the marker "[<N> did-you-mean suggestions active]" …
+  - marker ABSENT -> reference_target = null. (…downstream treats null exactly as the result set — today's behaviour, unchanged.)
+  - marker PRESENT:
+    - RESULT-qualified phrase ("the 2nd one","how about the third","price of the first product","product 2") -> "result".
+    - DYM-qualified phrase ("suggestion 2","the 3rd suggestion","the 2nd option/did-you-mean") -> "dym".
+    - BARE numeral, NO qualifier ("2","number 3"):
+      - marker does NOT carry "[results numbered]" (only the suggestion list is numbered) -> "dym".
+      - marker ALSO carries "[results numbered]" (answer is a numbered 1..N list; TWO numbered lists) -> "ambiguous" (do NOT guess).
+…After a clarify the user replies QUALIFIED ("product N"/"suggestion N") -> "result"/"dym", never "ambiguous" again.

@@ OUTPUT keys @@
   "reference_positions": [],
+  "reference_target": "result|dym|ambiguous|null — WHICH set a positional reply targets; null unless a did-you-mean marker is present (see REFERENCE TARGET)",
   "person_mention": "string_or_null — …",
```

LLM classifies only; it never resolves (LESSON 38). No other prompt text disturbed.

---

## HUNK B — parser `output_exchange` (Code)  [live `847a1173`]

Two changes, everything else byte-identical:

**B1. Shared retention helper (refactor, runtime-identical for the code-reply path).**
The `tryDymPick` IIFE's in-place retention/replacement body was extracted verbatim into a hoisted
`function applyDymPick(_hit, _offer)`; the IIFE now finds `_hit` exactly as before and calls
`applyDymPick(_hit, _offer)`. Same `_hit`/`_offer` in → same mutation out — the existing code-reply dym path
is unchanged (proven: `reference_target=null` and full-miss paths byte-identical, below).

**B2. New numbered-DYM handler + AMBIGUOUS branch**, inserted immediately BEFORE the existing
`// ── REFERENCE POSITIONS → ENTITIES ──` byIdx block (line ~399). Gated hard:

```js
(function dymDisambiguation(){
  if (!output.output || output.output.is_menu_label) return;
  const _rt = output.output.reference_target || null;            // null/absent = today
  const _positions = …reference_positions…;  if (_positions.length === 0) return;
  const _dymSet = prevState.dym_last_result_set || [];  if (_dymSet.length === 0) return;   // no dym set -> untouched byIdx
  if (_rt === 'ambiguous') {                                      // resolve NOTHING
    output.output.reference_positions = [];
    output.output.dym_clarify_needed  = true;
    output.output.dym_clarify_pos     = _positions.slice();
    return;
  }
  if (_rt === 'dym') {                                            // map position -> dym row -> applyDymPick
    const _offer = prevState.dym_offer…;
    const _byIdx = new Map(_dymSet.map(r => [Number(r.idx), r]));
    for (const _p of _positions) { const _row = _byIdx.get(Number(_p)); if(!_row) continue;
      const _hit = { code:_row.value??_row.product, uuid:_row.uuid, entity_type:_row.entity_type,
                     for_raw:_row.for_raw, for_hint:_row.for_hint, for_canonical:_row.for_canonical };
      applyDymPick(_hit, _offer);
      output.output.reference_positions = [];  break;            // consumed -> stock byIdx no-ops
    }
  }
})();
```

- `reference_target==='dym'` → maps position → `dym_last_result_set[idx]` → runs the SAME `applyDymPick`
  (retains prior entities incl. the resolved stock entity, replaces the source token's entity via `for_raw`,
  sets `dym_pick_applied=true`, `dym_offer_pick_code`), then clears `reference_positions` so the stock byIdx
  block no-ops.
- `reference_target==='ambiguous'` → resolves nothing, clears `reference_positions`, sets
  `dym_clarify_needed=true` + `dym_clarify_pos`.
- `result` / `null` / no `dym_last_result_set` / no positions → block returns early → `reference_positions`
  reach the UNTOUCHED byIdx block → byte-identical. Full-miss dead-end (#1) has no `dym_last_result_set`
  (its dym set is in `last_result_set` w/ `selection_context='suggest_offer'`) → skipped → change #1 intact.

---

## HUNK C — spine `compile-current-state` (Code)  [live `0804657c` → new; clone node `7a130a0c`]

Built on LIVE bytes (`7d4532bc…`). Five sub-hunks:

**C1. Partial-miss block** (declarations + IIFE), inserted after the friendly-disclaimer IIFE, before the
dym-single-use LIFECYCLE block. Reuses `build-suggest-offer`'s D1 detection (`missResolutions`,
`tokenCandidates`, `humanLabel`, `cap3`, `allowedTypes`, uuid-drop). On an ANSWERED partial-miss turn it:
  - **does NOT overwrite `last_result_set`** (stays stock) and **does NOT set `selection_context`** (stays
    null) — the WITHDRAWN halt behaviour; the stock positional affordance is preserved;
  - builds `_dymLastResultSet` = M superset rows `{idx,label,value,product,uuid,entity_type,for_raw,for_hint,for_canonical}`
    (idx 1..M contiguous, `for_raw`=source token);
  - feeds `_partialOffer` into the `_newOffer` slot (survives the `_answered` kill, lifecycle rule 1);
  - appends the `Couldn't find these:` numbered block to `userResponse`;
  - appends the marker to `response` (compressed/parser-facing): `` [${M} did-you-mean suggestions active]`` and,
    if the RESULT body was rendered as a numbered ≥2-line list (detected on the customer text), ALSO
    `[results numbered]`.
  - `surfaced.length===0` (no genuine miss) → early `return` → pure no-op → byte-identical.

**C2.** `_newOffer` fallback: `? _sug.dym_offer : (_partialOffer || null);` (was `: null;`).
**C3.** `const _dymOffer` → `let _dymOffer` (so the clarify branch can override; runtime-invisible).
**C4. Clarify branch** (`if (qf.dym_clarify_needed === true)`), inserted after the `_dymOffer` IIFE, before
output assembly: emits the deterministic prompt
`By "N", do you mean the Nth <noun> I found, or the Nth suggestion? Reply e.g. "<noun> N" or "suggestion N".`
(noun domain-aware: order/attachment/product), re-persists `last_result_set` (stock), `_dymLastResultSet`,
`_dymOffer` (ttl/picked untouched) from prior session vars, and re-emits both markers by reusing the prior
compressed `response`. `selection_context` stays null. No egress node.
**C5.** Conditional key emit before `return output;`:
`if (_dymLastResultSet) output.variables.dym_last_result_set = _dymLastResultSet;` and
`if (qf.dym_clarify_needed===true) output.variables.dym_clarify_pending = true;` — so a no-dym turn gains
NEITHER key (byte-identical).

---

## Byte-identical / regression proofs (local pure-logic harness, 0 egress)

Ran the current LIVE `compile-current-state` jsCode and the new jsCode against identical pinned `$()` inputs:

- **No-miss happy inventory turn (§PD-compile-R HARD gate): LIVE output === NEW output, byte-identical.**
  NEW has NO `dym_last_result_set` key; `response` = `Previous turn (inventory): returned 1 records`
  (no marker). ✅
- **Partial-miss inventory (§7 fixture):** `last_result_set` = stock (`SRTWT902`, NOT overwritten);
  `selection_context = null`; `dym_last_result_set` len 4, idx 1..4, `for_raw` = source token (1-3 `SRTW808`,
  4 `SRTW809`); `dym_offer {id, domain:inventory, ttl:3, 4 candidates, picked:[]}` survived; `response` =
  `…returned 1 records [4 did-you-mean suggestions active]` (PROSE → NO `[results numbered]`);
  `user_response` = stock answer + `Couldn't find these:` numbered 1..4 + footer. ✅ (matches plan §7.1–§7.6)
- **Partial-miss order (numbered body):** `response` = `…returned 2 records [2 did-you-mean suggestions active][results numbered]`. ✅
- **Clarify branch (order follow-up):** `user_response` =
  `By "2", do you mean the 2nd order I found, or the 2nd suggestion? Reply e.g. "order 2" or "suggestion 2".`;
  stock + dym sets re-persisted; `dym_offer` survived (id/ttl unchanged); both markers re-emitted;
  `selection_context` null; `dym_clarify_pending=true`. ✅

`output_exchange` new blocks (isolated unit):
- `reference_target='dym'`, `[2]` → replaces `dym_last_result_set[2]` (`SRTW8082-P`) in place via `for_raw`,
  RETAINS stock `SRTWT902`, `dym_pick_applied=true`, positions cleared. ✅
- `reference_target='ambiguous'`, `[2]` → resolves nothing, `dym_clarify_needed=true`, `dym_clarify_pos=[2]`,
  positions cleared. ✅
- `reference_target=null` → output byte-identical (no-op). ✅
- no `dym_last_result_set` (full-miss dead-end #1) → handler skipped, output byte-identical. ✅

> NOTE (design decision surfaced for reviewer): `[results numbered]` is emitted by `compile-current-state`
> by inspecting whether the customer-facing result body (`userResponse`, pre-dym-append) contains ≥2
> leading-numbered lines (`/(^|\n)[ \t]*\d+[.)]\s/`). This reads the node's own about-to-send render (no
> parser/domain coupling — plan §2.1.4 only rejected a domain→render map inside the PARSER). Tester should
> confirm the order/attachment §PD-ambiguous fixture renders ≥2 numbered lines so the bracket fires.

## Deviations / risk
- No deviations from the plan spec. Live↔fork were byte-identical (the plan's carried claim held) → promote
  will be a clean live+hunks; no changed-promote path.
- Deploy transport was **REST GET→PUT round-trip** (byte-exact via `jq --rawfile`, no transcription drift),
  NOT MCP `setNodeParameter` — chosen because both bodies are 24–49 KB with multibyte chars and the byte-SHA
  gate is the deliverable. REST GET does not redact credentials (LESSON 55) so the round-trip preserved all
  28 spine + 2 fork credentials (re-asserted post-PUT). Both are `executeWorkflowTrigger`-only (no webhook →
  clean HTTP 200, no 409). `settings` sent as `{executionOrder:"v1"}` only (merged; `binaryMode`/
  `availableInMCP`/`callerPolicy` preserved).
- `validate_workflow` (this MCP surface) validates SDK *code*, not a targeted node-body edit on an existing
  135-node workflow, so it is not applicable here; the equivalent gate is satisfied by n8n's own PUT
  validation (HTTP 200 + `active:true`) + `node --check` PASS on every edited Code node + byte-SHA match.
