# NODE-DIFF — `cross-domain-stock-incoming` review fixes (F1 / F2 / executeOnce)

Date 2026-08-03. Target: **clone `txiPzSxy3Pclsz6v` ONLY**.
Authority: `tests/reviews/cross-domain-stock-incoming.md` §7 (F1), §8 (F2), §10a (executeOnce).

| | |
|---|---|
| clone version BEFORE | `043358ae-fa17-47ec-bc4b-056d2db77ae8` |
| clone version AFTER (published) | **`6d479172-50e4-4be3-9e88-895a86b2701b`** (`versionId == activeVersionId`) |
| backup of the pre-change clone | `n8n-workflows-init/backups/clone-txiPzSxy3Pclsz6v-043358ae-20260803-before.json` (gitignored via `*-before.json` — a full REST GET embeds `activeVersion`, which carries hardcoded keys; LESSONS §59b) |
| live spine | `9qVyfUxmRQqrpGRMDLRuz` **untouched** — `versionId == activeVersionId == a40cd16d-c404-4d82-bc46-8a2e756e9dc1`, `updatedAt 2026-08-02T23:34:18Z` (read-only GET only) |
| transport | one REST PUT (python-built from a fresh REST GET → zero hand-transcription; PUT auto-publishes). `settings` sent as `{executionOrder, callerPolicy}` only; `binaryMode`/`availableInMCP` survived (merge, not replace) |
| nodes changed | **exactly 2** — `crossdomain-compose`, `crossdomain-probe`. Connections byte-identical. No node added/removed/renamed. |
| deployed body (byte-exact copy) | `tests/diffs/cross-domain-stock-incoming-review-fixes.crossdomain-compose.new.js` — sha256 `9d8c57100c9fc870bbd62bee346596f052dff3190f4a759c394f812d6231f073`, verified == the node's `jsCode` after publish |
| local proof harness | `tests/diffs/cross-domain-stock-incoming-review-fixes.marker-proof.js` (`node <file>`; old vs new insert on 11 live message shapes) |

Not done here, by contract: no promote, no UAC execution, no live edit.

---

## FIX 1 — `crossdomain-compose`: case-insensitive markers (review §7)

Only the total-miss (`else`) marker block changed. The `isAnswered` (partial) branch, the `PHRASE`
const, both PHRASE sinks, the fail-silent guards and the `.first()` reads are untouched.

**BEFORE** (deployed @ `043358ae`, lines 47–59):

```js
  const MARKERS = ['Related products:', 'Try:', 'Did you mean', 'Would you like me to escalate'];
  let idx = -1;
  for (const mk of MARKERS) {
    const i = out.user_response.indexOf(mk);
    if (i !== -1 && (idx === -1 || i < idx)) idx = i;
  }
  if (idx === -1) {
    out.user_response = `${out.user_response}\n${xb.block}`;
  } else {
    out.user_response = out.user_response.slice(0, idx).replace(/\s+$/, '')
      + `\n${xb.block}\n\n`
      + out.user_response.slice(idx);
  }
```

**AFTER** (deployed @ `6d479172`; comments in the node body, elided here):

```js
  const MARKERS = [
    'Related products:',             // bso D3 sibling picker
    'Try:',                          // bso D2 alternatives, list mode
    'Did you mean',                  // bso D1 single-token code mode + D1 multi-token (`did you mean:`)
    'Here are the closest matches:', // bso D1 numbered mode + D2 numbered mode (uuid alternatives)
    'Would you like me to escalate', // catch-all: the frozen phrase, on every offer branch
  ];
  const hay = out.user_response.toLowerCase();
  let idx = -1;
  for (const mk of MARKERS) {
    const i = hay.indexOf(mk.toLowerCase());
    if (i !== -1 && (idx === -1 || i < idx)) idx = i;
  }
  if (idx === -1) {
    out.user_response = `${out.user_response}\n${xb.block}`;
  } else {
    const nl  = out.user_response.lastIndexOf('\n', idx);
    const dot = out.user_response.lastIndexOf('. ', idx);
    const at  = Math.max(nl === -1 ? 0 : nl + 1, dot === -1 ? 0 : dot + 2);
    const head = out.user_response.slice(0, at).replace(/\s+$/, '');
    out.user_response = (head ? `${head}\n` : '') + `${xb.block}\n\n` + out.user_response.slice(at);
  }
```

Three deltas, in order of significance:

1. **Case-insensitive match.** Only a lower-cased *copy* (`hay`) is searched; every slice is taken from
   the ORIGINAL `out.user_response`, so no casing in the customer text changes. "Earliest marker wins"
   is unchanged (same loop, same comparison).
2. **One marker added** — `Here are the closest matches:`. Required: the two numbered arms
   (bso L252 D1-uuid, L393 D2-uuid) carry *no* other marker above their list; their only other
   marker (`…or would you like me to escalate…`) sits **below** the numbered list, so anchoring on it
   would place the block below the picker — the very thing Q16/O1 forbids.
3. **Insert point snaps to the start of the winning marker's sentence/line** (`Math.max(lineStart,
   sentenceEnd)`, both provably ≤ `idx`). Needed because two arms carry the marker **mid-line**:
   - bso L219 `"tok" — did you mean:` → a raw-index insert tears the picker's own header off its token.
   - bso L345 date arm `… Reply with a date to continue, or would you like me to escalate …`.
   On every arm whose marker follows a sentence end (`… found for X. Related products:`) the snap
   resolves to `idx` itself, i.e. **byte-identical to the tested build** — proven below.

### Marker census — verified against LIVE `build-suggest-offer` (416L) + `not-found-error-message` (248L) @ `a40cd16d`

Zero edits were made to either of those two nodes (that was the point of the composer architecture).
`bso` = build-suggest-offer, `nf` = not-found-error-message, `ccs` = compile-current-state.

| # | arm (source line) | literal the arm emits | marker that anchors it (case-insensitive) | before | after | insert lands |
|---|---|---|---|---|---|---|
| 1 | bso L88 — D3 sibling picker | `No incoming stock (ETA) found for X. Related products:` + numbered list | `Related products:` | ✅ anchored | ✅ anchored, **byte-identical** | above numbered list |
| 2 | bso L219+L225 — **D1 multi-token** | `Couldn't find some items:` / `"tok" — did you mean:` / `Reply a number to pick, or 'yes' to escalate to T.` | `Did you mean` (lower-case in source) | ❌ **END fallback** | ✅ anchored @39 → **snap 27** | after the `Couldn't find some items:` lead-in, above the candidate blocks + above the escalate invite |
| 3 | bso L252 — D1 numbered (uuid/promotion) | `Couldn't pin down "tok". Here are the closest matches:` + numbered + `…or would you like me to escalate…` | **`Here are the closest matches:`** (new marker) | ❌ **END fallback** | ✅ anchored @29 | above numbered list |
| 4 | bso L272 — D1 single-token code mode | `Couldn't find "tok". Did you mean A or B? …` | `Did you mean` | ✅ | ✅ **byte-identical** | above the invite |
| 5 | bso L348 — D2 `Try:` mode | `No stock for X. Try: A, B. …` | `Try:` (earliest — wins over the later lower-case escalate) | ✅ | ✅ **byte-identical** | above `Try:` |
| 6 | bso L345 — D2 **date** arm | `[Here's what you want:…] No delivery on D. C has delivery on …. Reply with a date to continue, or would you like me to escalate to T team?` | `Would you like me to escalate` (lower-case in source) | ❌ **END fallback** | ✅ anchored @146 → **snap 112** | above the `Reply with a date…` invite |
| 7 | bso L393 — D2 numbered (uuid alts) | `No incoming stock (ETA) for X. Here are the closest matches:` + numbered + lower-case escalate | **`Here are the closest matches:`** (new marker) | ❌ **END fallback** | ✅ anchored @39 | above numbered list |
| 8 | nf L234 — plain miss | `Could not find … . Would you like me to escalate to T team?` | `Would you like me to escalate` (capital) | ✅ | ✅ **byte-identical** | above the question |
| 9 | nf L155 — found/not-found breakdown | `Here's what you want:… Couldn't find: "z". But no … matched these. Would you like me to escalate to T team?` | `Would you like me to escalate` | ✅ | ✅ **byte-identical** | above the question |
| 10 | ccs L50 — `_merge` (suggest + CS member roster) | suggest_response + `To escalate, choose who to route to …` | whichever marker the embedded suggest arm carries (here `Related products:`) | ✅ | ✅ **byte-identical** | above both lists |
| 11 | nf L176/L187/L149/L134 — **clarification arms** (vague-token / require_specific / needsScope / missing-attachment-type) | `I captured "x" but couldn't tell which part is which…` etc. | **none — no marker, no escalate invite at all** | END fallback | END fallback (unchanged) | end of message |

Row 11 deliberately keeps the END fallback: those arms contain no list and no escalate offer, so there
is nothing for the block to be "above". They are also all but unreachable with a block —
`require_specific` goes `If3`-TRUE and never reaches `validator` (review §10e), and the vague-token arm
needs a `confident:false` token to co-occur with a resolved-exact product that returned zero rows. If
the reviewer wants that arm anchored, it needs a marker literal from `nf`, not a change here.

**Local proof** (`node tests/diffs/cross-domain-stock-incoming-review-fixes.marker-proof.js`, old vs
new logic over the 11 verbatim shapes above): **7 arms byte-identical to the previously tested build,
4 arms fixed, 0 regressions.** For every arm with a numbered list the harness asserts
`indexOf(block) < indexOf(first "N. " line)` and `indexOf(block) < indexOf(escalate invite)` — both
TRUE on all 11. This is a logic-level proof only; the tester must still confirm on a real turn
(inventory turn = one resolved-empty product + ≥2 unresolved tokens → the D1 multi-token arm, row 2).

Locked decisions re-checked: bullets only (renderer untouched); `PHRASE` still one const feeding both
`user_response` and state `response`, wording/case/`${xb.team}` unchanged; `last_result_set` /
`selection_context` still never written; uncapped; decision (d) untouched (renderer not edited).

---

## FIX 2 — `crossdomain-compose`: `_xdApplied` no longer leaves the node (review §8)

**BEFORE** (line 63, last statement before the return):

```js
out._xdApplied = { mode: isAnswered ? 'partial' : 'total_miss', team: xb.team, lines: xb.block.split('\n').length };
return [{ json: out }];
```

**AFTER** — the line is **deleted** (not gated behind a flag; the review preferred the simple removal):

```js
// NOTE (review F2): no debug key is attached to the returned item. On live this node feeds
// `save-session-vars`, the conversation-variables PUT, which sends `JSON.stringify($json)` — the
// WHOLE item — so any stray top-level key here is persisted into the real customer session.
return [{ json: out }];
```

Verified: the string `_xdApplied` no longer occurs anywhere in the clone (it had exactly one
occurrence — its own definition; **no consumer**, so the deletion is inert for every existing test).
Both early-return paths already returned the untouched input `o`, so no other exit could emit it.

---

## FIX 3 — `crossdomain-probe`: `executeOnce: true` (review §10a) — applied, but see the caveat

**BEFORE**: node had no `executeOnce` key. **AFTER**: `"executeOnce": true` (node-level property, set
via the PUT; MCP equivalent is `setNodeSettings {executeOnce:true}`). `onError:
continueRegularOutput`, `workflowId.value = rysSPgUssLDf6xJc` (the FORK) and every
`workflowInputs` expression are byte-unchanged.

### Which item wins — checked, unchanged

Measured on exec `11033897` (REST `includeData`), the real double-probe turn:

```
tool-filter          runs=1 out=[1]        Split Out1 runs=1 out=[2]   (crm_inventory_stock_balance_list,
Call 'sub-get-results' runs=2 out=[1,0] each                            crm_inventory_warehouses_list)
validator            runs=2 out=[1] each   crossdomain-zeroset runs=2 out=[1] each
crossdomain-gate     runs=2 out=[1,0] each crossdomain-probe   runs=2 out=[1] each
crossdomain-render   runs=2 out=[1] each   crossdomain-compose runs=1
```

- The fan-out produces **2 runs of 1 item each**, not 1 run of 2 items.
- `_xd` on zeroset run 0 and run 1 was **identical** (same `missing`, same `probe_entities`), and
  `_xdBlock` on render run 0 and run 1 was **character-identical**. So run 0 is the right item on the
  tested turns, exactly as the review states.
- Everything downstream already pins to run 0 (`crossdomain-render` reads
  `$('crossdomain-zeroset').first()`; `crossdomain-compose` reads `$('crossdomain-render').first()`),
  so this change **does not alter which item wins**.

### 🚩 Caveat the reviewer must not skip: `executeOnce` is expected to be INERT here

`executeOnce` in n8n core truncates each connection's input to its **first ITEM within a run**
(`runNode`: `input.slice(0, 1)`); it does **not** suppress additional **runs** of a node created by an
upstream multi-run fan-out. The probe already receives exactly **1 item per run** (`crossdomain-zeroset`
always returns a single item), so the flag is a no-op on this topology and, on the measured evidence,
will **not** halve the CRM reads. It is harmless (zero risk of changing which item is processed) and
the checklist item is now literally satisfied in the JSON — but the double read is **not** fixed.

**Instrument, don't assume** (LESSONS §61): the tester can settle this in one run — count
`runData['crossdomain-probe'].length` and the number of `sub-get-results` sub-executions attributed to
it. If it is still 2, the effective fix is a run-index guard, which I did **not** apply (it is a 4th
change, outside this task, and it changes which edge carries the item to `If6`):

> add `{{ $runIndex }} === 0` as a second AND condition on `crossdomain-gate` → run 1 takes the FALSE
> branch, which already wires straight to `If6`, so the item still reaches `If6` and the probe runs
> once. Needs its own review because it changes the per-run edge mix into `If6`.

### `executeOnce` on `crossdomain-zeroset` / `crossdomain-gate`? — **NO**, and deliberately

- Both are pure per-item Code/If with a single input item per run, so `executeOnce` would be inert
  there for the same reason — cost nothing, prove nothing.
- Worse, it would be *misleading*: it reads as "this runs once per turn" when it does not, and
  `crossdomain-zeroset` is the SINGLE SOURCE of the zero-set (plan Q13/H1). Anything suggesting its
  multiplicity is solved invites a future reader to trust run 0 without checking.
- `crossdomain-zeroset` must also keep passing the validator item through on **every** run: it is the
  only path from `validator` to `If6`. Nothing may reduce items there.

### 🚩 NEW FINDING (F4) — pre-existing, not caused by these fixes, and NOT fixed here

`crossdomain-zeroset` computes `returnedCodes` from the **per-run (per-TOOL) validator envelope**, but
`missing` is a claim about the **turn**. On a multi-tool turn the runs can disagree: if
`crm_inventory_stock_balance_list` (run 0) answers product X while `crm_inventory_warehouses_list`
(run 1) returns no product-code rows, run 1 computes `missing:[X]` → gate TRUE → probe → render, and if
run 0's gate was FALSE then `crossdomain-render` executed **only** on run 1, so `.first()` returns the
run-1 block. The turn then shows X's stock **and** "But there is INCOMING stock (ETA) for the requested
products:" plus an armed escalate offer — a spurious offer on a turn that did answer (adjacent to the
review's RISK-3). Both tools returned nothing on the tested turn (`has_result:false` on both runs), so
no test covers this. The correct denominator is the **union of returnedCodes across runs**; that is a
design change to the zero-set (plan Q7/Q13 territory), so it is reported, not built.

---

## Post-write verification (all PASS on the published `6d479172`)

Re-derived from a fresh REST GET after the PUT, not from the PUT response:

- `crossdomain-compose.jsCode` **byte-identical** to the reviewed file (sha256 `9d8c5710…`); no
  `parameters.parameters.*` footgun (LESSONS §32b); `_xdApplied` absent; `const PHRASE` still exactly once.
- `crossdomain-probe`: `executeOnce:true`, `onError:continueRegularOutput`, `workflowId=rysSPgUssLDf6xJc`
  (fork — **not** live `Fss5aAaXthJSWpZCgKiKR`), parameters otherwise byte-identical.
- **Exactly 2 nodes differ** vs the pre-change clone; node-name set unchanged; **connections byte-identical**.
- **S-CRED 28/28 credentials intact** after the PUT; the 3 postgres nodes (`pg-get-session`,
  `pg-upsert-session`, `log-incoming-chat-history-n8ntest`) all → `n8n_test-db` `Dnnofg8Xb27VQOhI`,
  never a prod DB.
- **5 egress nodes still orphaned (0 inbound):** `send-message-files`, `-images`, `-video`,
  `update-human-intervened`, `save-session-vars`.
- **8 sendmsg callers** all → `ublq9nSlrpz63xan` (`sub-sendmsg-CHAT`), all passing `is_test` truthy; no
  caller anywhere points at live `aoydkG1dbItXR5jXFEQsP` / `Fss5aAaXthJSWpZCgKiKR` /
  `UrETd-jm46tFj3Xw7w8vL`. `Call 'sub-respond-save-message-redis'2` → harness fork `tWm5DYLxfypmVC1T`.
- 4 get-results callers (`Call 'sub-get-results'`, `probe-incoming`, `sibling-probe`,
  `crossdomain-probe`) all → `rysSPgUssLDf6xJc`.
- No new `is_test` introduced anywhere. No new node, no new credential, no LLM node, no parser edit.
- Clone has **no Schedule Trigger and no respond.io trigger** (sole trigger =
  `When Executed by Another Workflow`), and `redis-pop-main-message-list` pops `test:q:{{contact}}` —
  the shared prod `main-message-list` is never touched.
- `node --check` clean on the deployed body.
- **`validate_workflow <id>` could not be run:** on this MCP surface `validate_workflow` validates
  *SDK source code*, not a workflow id (LESSONS §32 preamble). Substituted: `node --check`, the
  byte-SHA gate, the 2-nodes-differ / connections-identical delta audit, and the structural S-checks above.
