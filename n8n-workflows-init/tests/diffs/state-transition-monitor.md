# Node-diff — state-transition monitor (C1, C2, C3, C4)

Change-id: `state-transition-monitor`
Plan: `n8n-workflows-init/plans/state-transition-monitor-n8n-plan.md` §C
Coder run date: 2026-07-22
Scope tag: **parser** (C2 lives inside `output_exchange`; real-parser tier required for §ST-1/§ST-3/§ST-4)

Build targets — **clone + fork ONLY. No live workflow was edited.** C5 (live promotion) NOT done:
it is user-gated and separately blocked on CRM prerequisite P1 (§H). See end of file.

| workflow | id | before (versionId/active) | after (versionId/active) | published? |
|---|---|---|---|---|
| fork `sub-semantic-parser FORK domain-continuity-carry` | `wI5RkNGW3EOJfBdo` | `d2fea43e` == active | `9dc769e3` == active | **YES** (LESSONS §37) |
| clone `sorento-consume-main TEST` | `txiPzSxy3Pclsz6v` | `78f3bc46` == active | `4182ce3b` == active | **YES** |
| replay orchestrator `sorento-regression-replay` | `aROEBlQyyoQaB7a1` | `c9dc1e8a`, active `null` | `6d89d532`, active `null` | **N/A** — `active:false` manual-trigger workflow; the draft is what runs on manual fire. Nothing to publish (there is no active version). |

---

## STEP 0 recon (re-verified live against CURRENT state, 2026-07-22)

1. **Fork `wI5RkNGW3EOJfBdo` ≡ live `XTODTw-dJcV0uRdC056hG`** — per-node `parameters` sha diff across
   all shared nodes, run against current live active state:

   ```
   When Executed by Another Workflow  live=46dca2e1fa  fork=46dca2e1fa  SAME
   output_exchange                    live=e1736aa21a  fork=e1736aa21a  SAME
   AI Agent                           live=73e4c9fefb  fork=73e4c9fefb  SAME
   mock-reformulator-output           live=e8e471012a  fork=e8e471012a  SAME
   test-reformulator-bypass           live=01f5888415  fork=01f5888415  SAME
   suggest-follow-up                  live=bfe94eeddb  fork=bfe94eeddb  SAME
   OpenAI Chat Model                  live=883545dd3c  fork=883545dd3c  SAME
   ```
   All shasums match the plan §A3 values exactly — **no drift since 2026-07-21**. Fork's only
   divergence from live remains the dangling 8th node `Postgres Chat Memory` (inert, not promoted).
   Both fork and live were clean (`versionId == activeVersionId`) at recon time.
   **This sha diff MUST be re-run by the reviewer/promoter immediately before C5 step 2** (V-ST-h).

2. **`output_exchange` insertion anchors — ACTUAL current line numbers** (fork, 715-line body):
   - Parse-block closing brace: **line 71** (`}` closing the `if/else` JSON-parse block; plan said 71 — correct).
   - `// ── §10 follow-up (3)` comment: line **73** (blank line 72 separates).
   - Final `return output`: **line 714**, and it is the **only** `return output` in the file
     (plan said "line 715"; line 715 is a trailing blank line — the anchor is unambiguous regardless).
   - `_parser_raw` absent pre-edit (confirmed additive).

3. **Clone `txiPzSxy3Pclsz6v` wiring** (from active JSON):
   - `Call 'sub-query-reformulator'` → `wI5RkNGW3EOJfBdo` (fork) ✓
   - `Call 'sub-respond-save-message-redis'2` → `tWm5DYLxfypmVC1T` (the TEST sink,
     RPUSHes the unconsumed `sorento-respond-message-TEST`) ✓
   - logger `data` expression contained a `"turn_id"` key and NO `state_trace` pre-edit ✓
   - No `scheduleTrigger` node exists on the clone (no shared-prod-list consumption risk).

4. **Clone clean** — `versionId == activeVersionId == 78f3bc46` pre-edit (no dirty draft) ✓

**Nothing was stale. No corrections needed to the plan's recon.** The only nit is the C2 return
anchor being line 714 not 715 (immaterial — one `return output`).

---

## C2 — fork `wI5RkNGW3EOJfBdo`, node `output_exchange` (`/jsCode`)

**Intent:** snapshot the RAW semantic-parser LLM object BEFORE any code post-processing and expose it
as a top-level sibling `output._parser_raw`, so the incoming-logger (C1) can record `parser_raw`.

**Purely additive** — verified by `diff` of the byte-exact source before/after: **0 removed lines,
0 changed lines**, two additive hunks. `parser_applied` (= `output.output`) is byte-identical to
today on every turn. Written byte-exact and **sha-verified** (target `3d19bab1…` == written `3d19bab1…`).

### Hunk (a) — after the parse-block closing brace (line 71), before `// ── §10 follow-up (3)`:

```js
}                                          // ← existing: closes the JSON-parse if/else (line 71)
+
+// ── state-transition monitor: snapshot the RAW LLM object BEFORE any post-processing.
+// Everything below this line mutates output.output; this is the only point where the
+// pre-code shape still exists. Top-level key only (see plan §B5).
+const _parser_raw_snapshot = (() => {
+  try { return JSON.parse(JSON.stringify(output.output ?? null)); } catch (e) { return null; }
+})();

// ── §10 follow-up (3) — hoist raw LLM signals ...   // ← existing (was line 73)
```

The snapshot is correct in BOTH parse branches: after line 71 `output.output` is the normalized
parser object regardless of which branch ran, including the `idx === -1` degenerate case where it is
a raw string (snapshotting a malformed emission is desirable, not a bug — plan §A5).

### Hunk (b) — replace the single final `return output` (line 714):

```js
   output.output.date_mode         = null;
 }

+output._parser_raw = _parser_raw_snapshot;
 return output          // ← unchanged
```

`_parser_raw` is a **top-level sibling of `output`**, NOT inside `output.output` (plan §B5) — so it
is consumed by exactly one reader (the C1 logger) and stripped by one `norm()` rule (C4), never
carried into the parser-object golden diff.

`suggest-follow-up` (downstream) mutates only `output.output.*`; a top-level `_parser_raw` passes
through untouched — confirmed by reading its body, no edit needed (see C3).

Fork **published** → new activeVersionId `9dc769e3` (so the clone, which resolves only the published
sub, sees it — LESSONS §37).

---

## C1 — clone `txiPzSxy3Pclsz6v`, node `Call 'sub-respond-save-message-redis'2` (`/workflowInputs/value/data`)

**Intent:** add one `state_trace` key to the incoming-message logger blob, capturing the per-turn
conversation-state transition `{v, before, parser_raw, parser_applied, after}` on the single
`type:"incoming"` row per turn.

**Single additive key** inserted after `"turn_id"` inside the existing `={{ JSON.stringify({ … }) }}`.
Written byte-exact and **sha-verified** (target `e3a9318110…` == written stored value; the only diff
was a `jq -r` trailing-newline artifact, not part of the stored value). Confirmed **no** stray
`parameters.parameters.*` nesting (LESSONS §32b) — node `parameters` keys are `options,workflowId,workflowInputs`.

### Hunk:

```js
   "message_id": `${$('tf-message').first().json.message.messageId}`,
   "turn_id": `${$execution.id}`,
+  "state_trace": (() => {
+    const RS = ['last_result_set', 'referenced_result_set', 'dym_candidates'];
+    const trim = (o) => {
+      if (o === null || o === undefined) return null;
+      if (typeof o !== 'object') return o;                      // non-objects unchanged (raw-string parser_raw survives)
+      let c;
+      try { c = JSON.parse(JSON.stringify(o)); } catch (e) { return null; }
+      for (const k of RS) {
+        const v = c[k];
+        if (Array.isArray(v)) {
+          const f = v.length ? v[0] : null;
+          c[k] = { n: v.length, first: f ? (f.label ?? f.code ?? f.canonical_code ?? f.raw ?? f.uuid ?? null) : null };
+        }
+      }
+      return c;
+    };
+    let before = null, parser_raw = null, parser_applied = null, after = null;
+    try { if ($("get-session-vars").isExecuted) { before = $("get-session-vars").first().json.session_vars.variables ?? null; } } catch (e) { before = null; }
+    try {
+      if ($("Call 'sub-query-reformulator'").isExecuted) {
+        const p = $("Call 'sub-query-reformulator'").first().json;
+        parser_applied = p.output ?? null;
+        parser_raw     = p._parser_raw ?? null;
+      }
+    } catch (e) { parser_applied = null; parser_raw = null; }
+    try { if ($("compile-current-state").isExecuted) { after = $("compile-current-state").first().json.variables ?? null; } } catch (e) { after = null; }
+    return { v: 1, before: trim(before), parser_raw: trim(parser_raw), parser_applied: trim(parser_applied), after: trim(after) };
+  })()
 }) }}
```

**Traps preserved exactly as the plan mandated (coder did NOT "improve"):**
- `after` uses `?? null` **never** `?? {}` — `after: null` is a meaningful dead-end-branch signal (§0/§D).
- `.isExecuted` guard **AND** try/catch both kept — first covers "node never ran", second covers
  "node ran but the property chain is absent" (e.g. the parser's error output where `.json` is an error).
- `before` sourced ONLY from the in-memory `$("get-session-vars")` reference (pre-turn); never a
  CRM re-read (which would return POST-turn state — §B1 trap; a `before==after` always is the signature).
- `trim()` returns non-objects unchanged → the `output_exchange` `idx === -1` raw-string `parser_raw`
  survives intact.
- Double-quoted node refs `$("Call 'sub-query-reformulator'")` etc. (the node names contain single
  quotes — plan §C1).
- **No** `state_trace` added as a first-class `workflowInputs.value` sub-input — the save sub forwards
  only `data`; a sibling input would be silently dropped (plan §C1).
- `connections` NOT touched.

Clone **published** → new activeVersionId `4182ce3b`.

---

## C3 — fork `wI5RkNGW3EOJfBdo`, node `suggest-follow-up` — **EXPLICIT NO-OP (no edit)**

Recorded per plan §C3 so the reviewer does not hunt for a missing hunk. `suggest-follow-up` is
`const output = $input.first().json; … return output;` and mutates only `output.output.*`. A
top-level `_parser_raw` sibling passes through untouched. Verified by reading the node body; its
`parameters` sha is unchanged before/after this change (`bfe94eeddb`, still == live). **No edit made.**

---

## C4 — replay orchestrator `aROEBlQyyoQaB7a1`, node `Diff` (`/jsCode`) — `norm()` rule

**Intent:** register `_parser_raw` as stripped in the replay differ so it does not diff on every
real-parser golden turn (LESSONS §40). Node syntax-checked locally (`node --check` OK) before write.

### Hunk (one line added in `norm()`, immediately after the `person_mention` rule, before `similarity`):

```js
       if (k === 'person_mention' && (v[k] === null || v[k] === undefined)) continue; // (existing)
+      if (k === '_parser_raw') continue; // state-transition-monitor C2/C4: _parser_raw is a top-level sibling on the parser sub output — a PURE MIRROR of output.output (== parser_applied), which is diffed in full at this same node. Stripping it on BOTH sides loses nothing observable (LESSON 21: legitimate strip, not a blanket ignore). It is absent in golden and present post-C2 on every real-parser replay turn; without this it would regress all ~2.2k turns (LESSON 40).
       if (k === 'similarity' && typeof v[k] === 'number') { ... }               // (existing)
```

Placed alongside the established `person_mention` additive-key precedent. This is a legitimate strip,
NOT a blanket ignore that hides regressions (LESSONS §21): `_parser_raw` is a pure mirror of data
whose post-processed form (`output.output` = `parser_applied`) is still diffed in full at the same
node — nothing observable is lost. The §C4 reasoning is recorded in-node (above). `connections` NOT touched.

**Note (transcription fidelity):** the `Diff` node body had to be rewritten whole (setNodeParameter
replaces the leaf). The re-fetched node was inspected and matches the intended content including the
inserted rule and its exact placement; `node --check` passed on the source; `connections` byte-identical
before/after. This is a non-live, `active:false` manual-fire harness tool (recoverable, no egress path).

---

## Verification summary

- **Connections untouched** (V-ST-i): fork connections sha `c472a7d24f40` before == after;
  clone connections sha `57effd9ce266` before == after. Replay `Diff` connections byte-identical.
  No §ST-6 clone-connection remediation was performed by the coder (that is the tester's gate).
- **Only target nodes changed:** fork — only `output_exchange` params differ; all 6 other shared
  nodes + `Postgres Chat Memory` byte-identical. Clone — only `Call 'sub-respond-save-message-redis'2`
  differs; `tf-message`/`compile-current-state`/`get-session-vars`/`Call 'sub-query-reformulator'`
  unchanged.
- **Byte-exactness:** C2 sha `3d19bab1…` matched; C1 stored-value sha `e3a9318110…` matched.
- **Validation:** `update_workflow` returned **no errors** on any of the three edits. The warnings
  emitted are all pre-existing and documented (LESSONS §13, plan §E): the clone's orphaned egress
  nodes (`send-message-files/images/video`, `update-human-intervened`, **`save-session-vars`
  DISCONNECTED** — confirms plan S9), OpenAI `builtInTools`, `Transcribe a recording`
  expression-prefix; the fork's dangling `Postgres Chat Memory`; the replay orchestrator's
  `Get Exec Id` executionId type. (This SDK-based n8n-mcp has no validate-by-id op; the
  `update_workflow` response is the validation gate.)
- **Zero egress:** build-only. No UAC executions were run (tester's job). The clone remains
  fail-closed: logger targets the TEST sink `tWm5DYLxfypmVC1T` (RPUSH unconsumed
  `sorento-respond-message-TEST`); `save-session-vars` remains orphaned.

## C5 (live promotion) — NOT DONE

C5 was **not** performed. It is **user-gated** and separately blocked:
- **P1 (HARD BLOCKER, CRM side):** `chat_histories.state_trace jsonb NULL` column + a tolerant
  insert that ignores the new key must be live BEFORE C5 step 3, or every production incoming-message
  insert breaks (total chat-history outage). Confirm the endpoint tolerates an unknown key explicitly.
- Promotion order (plan §C5): P1 → publish spine auth change ALONE (§A2; note per the coordinator this
  auth work is now already published live — the reviewer/promoter must re-confirm `get-session-vars`
  draft==active before the state_trace publish, V-ST-g) → live parser sub `XTODTw` C2 hunks (re-run
  the §A3 fork≡live sha diff first, V-ST-h; do NOT carry the dangling `Postgres Chat Memory`) →
  live spine `9qVyfUxmRQqrpGRMDLRuz` C1 leaf. Sub-before-spine, backup versionIds, sha-verify,
  add exactly one leaf via setNodeParameter (never block-copy `workflowInputs.value` — LESSONS §48).
