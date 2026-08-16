# State-transition monitor — n8n side. BUILD + UAC spec (C1–C5)

Successor to `obs-latency-contract-build.md`. That change shipped `turn_id` / `message_id` /
`sent_at` on the chat_histories ingest path; this one rides the **same row** to emit the per-turn
conversation-state transition, so entities that vanish between turns become visible.

CRM side (the `chat_histories.state_trace jsonb NULL` column + a tolerant insert) is a **separate
plan** and is a **hard prerequisite** — see §G/P1.

- **scope: `parser`.** The `parser_raw` layer is produced inside `output_exchange`, which the
  deterministic mock lane **bypasses entirely** (`test-reformulator-bypass`[0] →
  `mock-reformulator-output` is terminal; `output_exchange` and `suggest-follow-up` never run). So
  `parser_raw` is structurally unobservable under `mock_reformulator_output`. Cases §ST-1/§ST-3/
  §ST-4 require a **real parser run**; §ST-2/§ST-5/§ST-6/§ST-7 may run deterministic. Tester budgets
  the parser tier.
- **DOCS-ONLY at planning time.** Nothing below has been built. No workflow was edited, published,
  or executed during the recon that produced this spec.

Recon date **2026-07-21**. Every id, versionId, node name and expression below was read live from
MCP on that date, plus one historical execution (`9395526`).

---

## §0. Locked contract (v1) — do not redesign

New column `chat_histories.state_trace jsonb NULL`. Written **only** on the `type='incoming'` row,
**exactly one per turn**, joinable to the outgoing rows by the already-promoted `turn_id`.

```json
{
  "v": 1,
  "before":          {...},        // session_vars.variables as they were PRE-turn
  "parser_raw":      {...}|null,   // semantic-parser LLM output BEFORE code post-processing
  "parser_applied":  {...},        // the parser sub's returned output (post-code, *_applied flags)
  "after":           {...}|null    // compile-current-state's variables; null = turn wrote no state
}
```

**Trim rule**, applied identically to all four layers: any of `last_result_set`,
`referenced_result_set`, `dym_candidates` is replaced by `{"n": <length>, "first": <first label or
code>}`. Rosters and result sets are multi-KB (exec `9395526` carried a 17-row `last_result_set` in
`before` **and** a 2-row one in `after`); untrimmed this bloats the corpus table on every turn.

**`"after": null` is MEANINGFUL** — the turn ended on a branch that never writes session_vars. Do
not "fix" it to `{}`. §D enumerates exactly which branches produce it.

---

## §A. Recon answers — grounded, do not re-derive

### A1. Live graph facts (spine `9qVyfUxmRQqrpGRMDLRuz`, 101 nodes)

| fact | value | source |
|---|---|---|
| spine versionId / activeVersionId | **`902043a4-97b5-4a2d-89a1-33e855be9964` / `8b4615fc-b75e-4385-b7eb-3c51b6ad68c7`** — **NOT equal** | `get_workflow_details` 2026-07-21 |
| draft-vs-active delta | **exactly one node: `get-session-vars`** (id `1b06a306-cab3-4667-8d50-873c3a15ca7e`). Connections **byte-identical**. | §A2 |
| clone `txiPzSxy3Pclsz6v` | versionId == activeVersionId == `394082d4-a074-45ee-be5c-23afddc90b59`, 135 nodes, **no draft divergence** | live |
| live parser sub `XTODTw-dJcV0uRdC056hG` (`sub-semantic-parser`) | published `06388c41-…`, **7 nodes**, draft == active | live |
| clone's parser fork `wI5RkNGW3EOJfBdo` | published `d2fea43e-…`, **8 nodes**, draft == active | live |
| incoming logger `Call 'sub-respond-save-message-redis'2` | wired off `if-message-is-audio` output **1** (FALSE), alongside `get-session-vars`. Live target = real save sub `UrETd-jm46tFj3Xw7w8vL`. Already carries `message_id` + `turn_id` (obs-latency C1, promoted). | live active JSON |
| `save-session-vars` | `PUT …/conversation-variables/{id}`, body `{{ JSON.stringify($json) }}`, fed **only** by `compile-current-state`[0] | live active JSON |

**Execution order confirmed empirically on exec `9395526`** (a real inventory turn):

| node | executionIndex | note |
|---|---|---|
| `get-session-vars` | **8** | sibling off `if-message-is-audio`[1]; only source of prior state |
| `Call 'sub-query-reformulator'` | 9 | sub-exec `9395527` on `XTODTw-dJcV0uRdC056hG`, 2786 ms |
| `compile-current-state` | **32** | |
| `save-session-vars` | **35** | the PUT |
| `Call 'sub-respond-save-message-redis'2` | **37** | and `"lastNodeExecuted": "Call 'sub-respond-save-message-redis'2"` |

`lastNodeExecuted` naming the logger is the decisive evidence: **the logger is the last node of the
turn**, ~5.8 s after start, after the reply was sent and after `save-session-vars`. This is what
makes the single-row design possible.

### A2. ⚠️ The spine draft is NOT clean — an unrelated auth conversion is staged

The draft's `get-session-vars` adds two leaves the active version does not have:

```
DRAFT   : "authentication":"genericCredentialType","genericAuthType":"httpHeaderAuth", <plus the same hardcoded x-api-key header>
ACTIVE  : <no authentication block; hardcoded x-api-key header only>
```

URL, headers and `options` are otherwise **byte-identical**; only the auth block differs. This is
the user's in-progress conversion of the CRM API calls from a hardcoded `x-api-key` header to the
header-auth credential `crm-n8n-auth`. **Every other CRM httpRequest node on the spine — including
`save-session-vars`, `resolve-entity`, `check-access`, `get-access-types` — is currently
draft==active and still on the hardcoded key**, so the conversion is partial.

Attribution caveat: `get_workflow_details` **redacts credentials on read** (LESSONS §47), so the
*presence* of the `authentication` param is all that is observable. That the bound credential is
`crm-n8n-auth` is the coordinator's statement, **not** something this recon can confirm.

**All parameter citations in this document are from the ACTIVE version unless marked DRAFT.** The
one node where it matters is `get-session-vars`, above.

**Sequencing (binding, LESSONS §51 — stage an unowned draft delta as its own publish):**

1. The **auth change lands FIRST**, as its own reviewed, user-gated publish, with its own
   verification that CRM reads still succeed. It is entirely independent of state_trace.
2. Only then is state_trace applied to the spine draft and published.

Publishing state_trace onto today's spine draft would ship the auth conversion as a **rider**, and
a CRM-read auth failure would look like a state_trace regression. Publishing the auth change from a
draft that already carries state_trace has the same problem inverted. **Do not merge the two
publishes.** V-ST-g gates this.

### A3. ⚠️ Clone wiring — verified, and one CLAUDE.md correction is now itself stale

Read from the clone's active version:

| clone node | targets | note |
|---|---|---|
| `Call 'sub-query-reformulator'` | **`wI5RkNGW3EOJfBdo`** (`sub-semantic-parser FORK domain-continuity-carry`) | ✅ CLAUDE.md's 2026-07-21 correction is right; the pre-2026-07-21 claim that it calls live `XTODTw` is wrong. `CpxE8LroLzCkrAQN` is not wired anywhere. |
| `Call 'sub-respond-save-message-redis'2` | `tWm5DYLxfypmVC1T` (`sub-respond-save-message-redis TEST`) | **sinked**, not orphaned — see §E |
| 8 sendmsg callers | `ublq9nSlrpz63xan` (`sub-sendmsg-CHAT`) | unchanged |
| `Call 'sub-get-results'`, `probe-incoming`, `sibling-probe` | `rysSPgUssLDf6xJc` (`sub-get-results TEST`) | pre-existing |

**LOUD CORRECTION — the fork/live promotion hazard the brief warned about does not exist.**
A per-node `parameters` sha diff of fork `wI5RkNGW3EOJfBdo` (active) vs live `XTODTw` (active):

```
output_exchange                    live=e1736aa21a  fork=e1736aa21a  SAME
suggest-follow-up                  live=bfe94eeddb  fork=bfe94eeddb  SAME
AI Agent                           live=73e4c9fefb  fork=73e4c9fefb  SAME
mock-reformulator-output           live=e8e471012a  fork=e8e471012a  SAME
test-reformulator-bypass           live=01f5888415  fork=01f5888415  SAME
When Executed by Another Workflow  live=46dca2e1fa  fork=46dca2e1fa  SAME
```

All six shared nodes are **byte-identical**. `output_exchange` is 715 lines on both. The
domain-continuity-carry and ideation-intake deltas the fork was named for have **already been
promoted** (live `06388c41`, matching MEMORY's "ideation+voice PROMOTED LIVE 2026-07-21").

The fork's only divergence is an **8th node, `Postgres Chat Memory`**, whose connections are
`{"ai_memory":[[]]}` — **dangling, not attached to `AI Agent`**. Functionally inert.

**Consequence:** C2 can be built on the fork and promoted to live as a clean single-node diff, with
**no unpromoted rider**. Reviewer must nonetheless re-run this sha diff immediately before promote —
if any node has diverged since 2026-07-21, someone landed work on the fork and the hazard is back.

### A4. Parser output shape at the spine — confirmed from exec 9395526

`Call 'sub-query-reformulator'` output at the spine is `{ "output": { …parser fields…,
domain_signal_source, scope_exclusive_applied, entity_op_applied, entities_filtered,
entities_emptied_by_filter } }`. So:

- `parser_applied` = `$("Call 'sub-query-reformulator'").first().json.output`
- `parser_raw`     = `$("Call 'sub-query-reformulator'").first().json._parser_raw` (new, C2)

`get-session-vars` output shape (same exec): `{ respond_io_id, session_vars: { variables, user_response } }`.
Note **`session_vars.referenced_result_set` does not exist** on that payload, yet
`Call 'sub-query-reformulator'` reads it — a pre-existing undefined-input, out of scope, do not fix.
So `before` = `.session_vars.variables`; the trim rule's `referenced_result_set` branch is a no-op
there and only fires if the CRM starts returning it.

`compile-current-state` output = `{ variables, user_response, quick_reply }`. So `after` =
`.variables`.

### A5. `output_exchange` — the exact insertion point

The node opens with `deriveRouting()` (lines 1–49), then:

```js
51:  let output = {};
52:  let parent_input = $('When Executed by Another Workflow').first().json
54:  if ($json.output && typeof $json.output === 'object') {
55:    output = $json.output;
56:  } else {
        …strip ``` fences, find first '{', JSON.parse…
64:      output = { output: raw };            // idx === -1: no JSON found, raw string
69:      output.output = JSON.parse(cleanSlice);
71:  }
73:  // ── §10 follow-up (3) — hoist raw LLM signals + coerce string-"null" hints ──
…
715: return output
```

**Line 71 (immediately after the closing brace of the parse block) is the snapshot point**, and it
is correct in *both* branches: after line 71, `output.output` is normalized to the parser object
regardless of which path ran. Everything from line 73 onward is post-processing.

The `idx === -1` degenerate branch leaves `output.output` a **raw string** — snapshotting that is
desirable (it captures a malformed LLM emission), not a bug.

`suggest-follow-up` (35 lines, downstream of `output_exchange`) is
`const output = $input.first().json; … return output;` and mutates only `output.output.*`. **A
top-level `_parser_raw` passes through untouched — C2 needs no edit there.** Verified by reading the
node, not inferred.

---

## §B. Corrections and traps (read before writing any code)

### B1. TRAP — the pre-turn snapshot is reachable ONLY via `$('get-session-vars')`

`save-session-vars` (idx 35) has **already PUT the new state** before the logger fires (idx 37).
Re-reading `…/conversation-variables/{id}` from the logger, or from inside the save sub, returns
**POST-turn state**. There is no second read anywhere on the spine — `get-session-vars` is the only
source of prior state in the entire workflow. `before` must come from the **in-memory node
reference** `$("get-session-vars").first().json.session_vars.variables` and from nothing else.

A `before` that equals `after` on every turn is the signature of having fallen into this trap.

### B2. TRAP — clone connection ORDER may invert the logger's position

On live, `if-message-is-audio`'s output-1 array is:

```json
[ {"node":"Call 'sub-respond-save-message-redis'2"}, {"node":"get-session-vars"} ]
```

and the observed order was `get-session-vars` at index **8**, logger at index **37** — i.e. the
array's *second* entry ran first and the *first* entry ran last.

On the clone the same pin has **three** entries in a **different order**:

```json
[ {"node":"guard-h-record"}, {"node":"sim-inject-gate"}, {"node":"Call 'sub-respond-save-message-redis'2"} ]
```

The logger is now **last in the array**, i.e. in the position that ran *first* on live. If n8n's
scheduling is order-dependent in the way the live evidence suggests, the clone's logger may execute
**before** `compile-current-state`, and every clone run would emit `after: null` — a false negative
that looks exactly like a correctly-detected dead-end branch.

**Mandatory pre-check, before any assertion about `after` is trusted (this is §ST-6):** run one
happy-path clone turn and read `executionIndex` for `Call 'sub-respond-save-message-redis'2` vs
`compile-current-state`. Require `logger > compile-current-state`. If it is not, reorder the clone's
`if-message-is-audio` output-1 connection array so the logger is **first**, mirroring live, and
re-verify. Do **not** proceed to §ST-1 until §ST-6 passes.

Corollary for promotion: the live array order must not be touched. C1 changes a node *parameter*
only; it must not rewrite `connections`.

### B3. Branch guard is mandatory — an unguarded `$('compile-current-state')` THROWS

`compile-current-state` does not execute on the branches in §D. In n8n, `$('X')` on an unexecuted
node raises, and a throw inside the logger's `data` expression **fails the incoming-message log for
that turn** — i.e. an unguarded reference silently deletes the chat history of exactly the turns
most worth debugging. Use `.isExecuted` as the primary guard *and* wrap the property chain in
`try/catch`. Same for `$("Call 'sub-query-reformulator'")` (it does not execute if the turn
short-circuits before the parser, and on its **error output** it produces an error item, not a
parser payload).

### B4. One turn emits MANY outgoing messages — this is why the trace rides the incoming row

- the attachment loop (`Loop Over Items1` → `send-message-files/images/video`) fires **per item**;
- a voice turn sends `send-transcript-confirm` **and** the answer;
- an escalation fans to `sub-human-intervention`, which sends **3×** internally (LESSONS §49 —
  the true sendmsg caller count is 15, not 8).

Attaching state_trace to any sendmsg caller would emit N copies per turn, N unknown in advance, and
would miss the branches that send nothing. The incoming row is the only per-turn singleton on the
path. **Exactly one `state_trace` per turn is a contract property, asserted in §ST-7.**

### B5. `_parser_raw` must be a TOP-LEVEL sibling of `output`, never inside `output.output`

Inside `output.output` it would appear in every parser-node golden diff on all ~2,216 replay turns
(LESSONS §40) and would be carried into any future code that spreads the parser object. Top-level,
it is consumed by exactly one reader (the logger) and stripped by one `norm()` rule (C4).

### B6. `parser_raw` is null on the deterministic lane — by design, not a defect

`test-reformulator-bypass`[0] → `mock-reformulator-output` (`return [{json:{output: t.mock_reformulator_output}}]`)
is **terminal**; `output_exchange` never runs. Any run injecting `mock_reformulator_output` yields
`parser_raw: null` and `parser_applied` = the injected mock. Assert this explicitly (§ST-2) so a
future change to the mock lane is caught, and never read a null `parser_raw` on a mocked run as a
C2 failure.

---

## §C. Build spec

Build order: **C2 (fork) → C1 (clone) → C3 (verify no-op) → C4 (replay norm) → UAC → review →
user-gated promote (C5)**. Never edit the live spine or any live sub during build.

### C2 — `output_exchange`: stamp the pre-code LLM object. **Lands on: fork `wI5RkNGW3EOJfBdo`.**

Two edits to `parameters.jsCode`, written with `setNodeParameter` at path **`/jsCode`** (LESSONS
§32b — never `/parameters/jsCode`). This is a 715-line body: source it, patch it, write it back
byte-exact; do not retype (LESSONS §25).

**(a)** Insert immediately after the closing `}` of the parse block (currently line 71), before the
`// ── §10 follow-up (3)` comment:

```js
// ── state-transition monitor: snapshot the RAW LLM object BEFORE any post-processing.
// Everything below this line mutates output.output; this is the only point where the
// pre-code shape still exists. Top-level key only (see plan §B5).
const _parser_raw_snapshot = (() => {
  try { return JSON.parse(JSON.stringify(output.output ?? null)); } catch (e) { return null; }
})();
```

**(b)** Replace the final `return output` (currently line 715) with:

```js
output._parser_raw = _parser_raw_snapshot;
return output
```

Nothing else changes. The diff is **additive**: no existing key is read, written or reordered, so
`parser_applied` on every existing turn is byte-identical to today.

Publish the fork (LESSONS §37 — the clone sees only the published version).

### C3 — `suggest-follow-up`: **no edit.** Verified pass-through (§A5).

Record it in the node-diff as an explicit no-op with the reason, so the reviewer does not go looking
for a missing hunk.

### C1 — the incoming logger blob. **Lands on: clone `txiPzSxy3Pclsz6v` (promoted to live spine at C5).**

Node: `Call 'sub-respond-save-message-redis'2`. Add **one key** to the object inside the existing
`data` expression (`={{ JSON.stringify({ … }) }}`), after `"turn_id"`. Write via `setNodeParameter`
at path **`/workflowInputs/value/data`**.

Use **double quotes** for the node reference — `$("Call 'sub-query-reformulator'")` — the node name
contains single quotes and nesting them inside a JSON-encoded parameter is a known escaping
footgun.

```js
  "state_trace": (() => {
    const RS = ['last_result_set', 'referenced_result_set', 'dym_candidates'];
    const trim = (o) => {
      if (o === null || o === undefined) return null;
      if (typeof o !== 'object') return o;
      let c;
      try { c = JSON.parse(JSON.stringify(o)); } catch (e) { return null; }
      for (const k of RS) {
        const v = c[k];
        if (Array.isArray(v)) {
          const f = v.length ? v[0] : null;
          c[k] = {
            n: v.length,
            first: f ? (f.label ?? f.code ?? f.canonical_code ?? f.raw ?? f.uuid ?? null) : null
          };
        }
      }
      return c;
    };
    let before = null, parser_raw = null, parser_applied = null, after = null;
    try {
      if ($("get-session-vars").isExecuted) {
        before = $("get-session-vars").first().json.session_vars.variables ?? null;
      }
    } catch (e) { before = null; }
    try {
      if ($("Call 'sub-query-reformulator'").isExecuted) {
        const p = $("Call 'sub-query-reformulator'").first().json;
        parser_applied = p.output ?? null;
        parser_raw     = p._parser_raw ?? null;
      }
    } catch (e) { parser_applied = null; parser_raw = null; }
    try {
      if ($("compile-current-state").isExecuted) {
        after = $("compile-current-state").first().json.variables ?? null;
      }
    } catch (e) { after = null; }
    return {
      v: 1,
      before:         trim(before),
      parser_raw:     trim(parser_raw),
      parser_applied: trim(parser_applied),
      after:          trim(after)
    };
  })()
```

Notes the coder must not "improve":

- `trim()` returns non-objects unchanged so the `output_exchange` `idx === -1` degenerate case
  (a raw string `parser_raw`) survives intact.
- `after` uses `?? null`, never `?? {}`. §0 says `null` is meaningful.
- `.isExecuted` is checked *and* the body is in `try/catch`; the guards are not redundant — the
  first covers "node never ran", the second covers "node ran but the property chain is absent"
  (e.g. the parser's **error output**, where `.json` carries an error, not `{output}`).
- No `state_trace` key is added to `workflowInputs.value` as a first-class sub input. The save sub
  forwards **only `data`** (confirmed obs-latency §A1); a sibling input would be silently dropped.
- **Do not touch `connections`.** C1 is a parameter-only edit (§B2 corollary).

### C4 — replay diff: register `_parser_raw` as ignored. **Lands on: replay orchestrator `aROEBlQyyoQaB7a1` › `Diff`.**

`_parser_raw` will be present and non-null on **every** real-parser turn, so without a rule it
diffs on all ~2,216 golden turns and drowns the baseline (LESSONS §40).

Add to `norm()`: **strip the `_parser_raw` key** from the parser node's output on both sides.

This is a legitimate strip, not a blanket ignore that hides regressions (LESSONS §21): `_parser_raw`
is a pure *mirror* of data whose post-processed form (`output.output` = `parser_applied`) is diffed
in full at the same node. Nothing observable is lost. Record that reasoning in the node comment so a
future reviewer does not have to re-derive it.

### C5 — Promotion (user-gated, after reviewer APPROVE). Strictly ordered.

0. **CRM prerequisite P1 must be live first** (§G).
1. **Publish the spine auth change ALONE** (§A2). Verify CRM reads still succeed. This is a separate
   review and a separate user gate.
2. **Live parser sub `XTODTw-dJcV0uRdC056hG`**: apply C2's two hunks to `output_exchange`. Re-run
   the §A3 sha diff first — fork and live must still be byte-identical on all 6 shared nodes, else
   HALT. Do **not** carry the fork's dangling `Postgres Chat Memory` node across. Publish.
3. **Live spine `9qVyfUxmRQqrpGRMDLRuz`**: apply C1's single leaf to
   `Call 'sub-respond-save-message-redis'2` `/workflowInputs/value/data`. Re-run the draft-vs-active
   diff immediately before publishing (LESSONS §24) — the only acceptable differing node at that
   moment is **none** (step 1 having already landed the auth change). Publish.
4. Sub before spine (LESSONS §37). Backup prior versionIds; sha-verify draft pre-publish and active
   post-publish; auto-revert on mismatch (LESSONS §25).
5. **Never block-copy `workflowInputs.value`** from the clone (LESSONS §48). Add exactly the one
   leaf via `setNodeParameter`.

---

## §D. Which branches produce `after: null` — enumerated

Computed by reverse-reachability from `compile-current-state` over the spine's **active**
connections graph. `compile-current-state` is fed by exactly four edges: `central-exchange`[0],
`cs-offer-gate`[1], `build-cs-member-offer`[0], `build-ideate-reply`[0].

**`after: null` (7 exits — every edge that leaves the can-reach set):**

| # | branch edge | meaning |
|---|---|---|
| 1 | `is-human-intervened`[1] → `update-human-intervened` | human takeover; fires before the parser |
| 2 | `if-voice-allowed`[1] → `send-voice-not-allowed` | voice not permitted for this contact |
| 3 | `If5`[1] → `sorento-sub-respond-sendmsg-respond5` | **no access** |
| 4 | `Call 'sub-query-reformulator'`[1] → `set-ran-query-formulator` | parser sub error (`onError: continueErrorOutput`) |
| 5 | `Call 'sub-get-results'`[1] → `set-ran-query-formulator` | get-results sub error |
| 6 | `Basic LLM Chain`[1] → `set-ran-query-formulator` | clarification-LLM error |
| 7 | `divert-suggest-yes`[1] → `Call 'sub-human-intervention'` | **escalation** |

On #4 the parser node *did* execute (error output) — `parser_applied` and `parser_raw` will both be
`null` via the `try/catch`, not via `.isExecuted`. That distinction is exactly why both guards exist.

**Populated `after` (everything reaching `central-exchange`[0] / `cs-offer-gate`[1] /
`build-cs-member-offer` / `build-ideate-reply`):** the happy answer path, the not-found /
did-you-mean / suggest-offer path, the clarification path (`Basic LLM Chain`[0] → `central-exchange`),
the CS-member-offer path, and the ideate path.

`before` and `parser_applied` are populated on **all** of the above except #1 and #2, which
short-circuit upstream of the parser (`before` is still populated on #2 and #3; on #1 the turn never
reaches `if-message-is-audio` and no row is logged at all).

---

## §E. Zero-egress safety — §0 checklist deltas

All cases are bound by `tests/UAC.md` §0 **S1–S6**, with these deltas.

- **S3 (already amended by obs-latency, restated because it is load-bearing here).** The clone is
  **4 orphaned + 1 SINKED**. `Call 'sub-respond-save-message-redis'2` is **wired and it executes** —
  it is not disconnected. Its safety comes from *what it can reach*: it targets
  `tWm5DYLxfypmVC1T` (`sub-respond-save-message-redis TEST`), whose only egress is an RPUSH to the
  literal list `sorento-respond-message-TEST`, which no consumer reads
  (`redis-consume-queue-mongo` `Srs08P0Ha3Cv--YPx0-Yn` pops `sorento-respond-message` only).
  **Assert both from the workflow JSON every run, not from memory:** (a) the node's target
  workflowId is `tWm5DYLxfypmVC1T`; (b) that fork's `Redis.list` is the literal
  `sorento-respond-message-TEST` with no expression.
  **What "sinked, not orphaned" means for this change specifically:** every UAC case here *writes a
  real blob* — a bad `state_trace` expression does not fail silently, it lands in the sink where it
  can be read back. That is the fidelity we want, and it is also why S7 cannot be skipped.
- **S7 (as replaced by LESSONS §45 — sink-delta + payload attribution, NOT bare `LLEN`).**
  `LLEN sorento-respond-message` is a **prod-shared, fast-drained** list; a count comparison is both
  false-positive and false-negative prone and must not be used as the gate. Required instead:
  1. **Sink accounting:** `LLEN sorento-respond-message-TEST` increases by **exactly 1 per turn
     executed**. A short-fall means the logger did not run — treat as FAIL, not as "no egress".
  2. **Prod attribution:** any observed movement on `sorento-respond-message` is attributed by
     **payload shape** — post-change harness blobs carry the `state_trace` key, which no pre-change
     blob and no live-traffic blob has until C5 step 3 lands. A prod-list blob containing
     `state_trace` during the build phase is a **hard HALT**.
  3. An unretrievable consumer execution is **UNATTRIBUTABLE → FAIL**, never inconclusive-pass.
- **S9 (NEW — no state write from a test run).** `save-session-vars` remains **orphaned** on the
  clone. Assert 0 inbound connections, and assert zero PUTs to `…/conversation-variables/` in the
  run. `state_trace` reads `compile-current-state`'s in-memory output; it must never be sourced by
  re-reading or re-writing the CRM.
- **S6 resolves to `parser`.** The parser LLM (`gpt-5.4-mini` inside the fork) **does** execute on
  §ST-1/§ST-3/§ST-4. No *other* LLM may execute: `Basic LLM Chain`, `whisper-transcribe` and
  `Transcribe a recording` must show zero executions in every case.
- **S1/S2/S4/S5** unchanged.

---

## §F. UAC cases

Add to `tests/UAC.md` as `§ST-1` … `§ST-7`. Contact `437264483` (Jayson, FULL access) unless stated.
Prior state is controlled through the clone's `sim-inject-session` lane
(`redis-pop-main-message-list.json.message.previous_conversation_state`), which feeds the clone's
`get-session-vars` NoOp — LESSONS §31's "injection does not reach the parser" is **superseded** by
that lane's existence, verified in the clone's active JSON.

### §ST-6 — Execution-order gate (RUN FIRST; blocks every other case)

- **Trigger:** any happy-path turn, contact `437264483`, `mode: uac`, `mock_reformulator_output`
  injected (deterministic — this case tests scheduling, not content).
- **Expect-path:** `if-message-is-audio`[1] → all three siblings execute.
- **Expect-output:** from `get_execution` runData, `executionIndex` of
  `Call 'sub-respond-save-message-redis'2` is **strictly greater than** that of
  `compile-current-state`, **and** greater than that of `get-session-vars`.
  Also record `lastNodeExecuted`.
- **On failure:** reorder the clone's `if-message-is-audio` output-1 connection array so the logger
  is first (mirroring live), re-run. **Do not run §ST-1..§ST-5 until this passes** — every `after`
  assertion is meaningless otherwise (§B2).
- **Safety:** §0 all + S3 + S7 + S9.

### §ST-1 — Happy path: all four layers populated (PRIMARY, C1+C2)

- **Trigger:** turn 2 of a two-turn sequence, contact `437264483`, `mode: uac`, **real parser**
  (no `mock_reformulator_output`). `previous_conversation_state` injected as a known non-empty
  object (an inventory turn: `domain_hint:"inventory"`, one `entities[]` element, a
  `last_result_set` of 17 rows). Message: `"check stock srt8408"`.
- **Expect-path:** `if-message-is-audio`[1] → `get-session-vars` → `Call 'sub-query-reformulator'`[0]
  → … → `central-exchange`[0] → `compile-current-state` → (`save-session-vars` orphaned on clone) ·
  logger last.
- **Expect-output** — parse `data` from the logger's resolved input, then `state_trace`:
  - `v === 1`
  - `before` is a non-empty object; `before.domain_hint === "inventory"`; **`before` equals the
    injected `previous_conversation_state`** modulo the trim rule — proving §B1 was honoured and it
    is not a post-turn re-read
  - `parser_applied` is a non-empty object carrying the post-code flags
    (`domain_signal_source`, `entity_op_applied`, `entities_filtered` all present)
  - `parser_raw` is a non-empty object, **non-null** (this is what C2 buys)
  - `after` is a non-empty object; `after.domain_hint` present; **`after !== before`**
  - **`after` is NOT deep-equal to `before`** — a state_trace where they always match is the §B1
    trap signature and is a hard FAIL even if every key is present
  - all pre-existing blob keys (`contact_id`, `phone_number`, `message`, `sent_at`, `first_name`,
    `last_name`, `reply_to_message_id`, `reply_to_message`, `type`, `message_id`, `turn_id`) still
    present and unchanged in shape — **no field regressed**
- **Safety:** §0 all + S3 + S7 + S9. Sink `LLEN` +1. Parser LLM runs (S6/`parser`); no other LLM.

### §ST-2 — Dead-end branch: `after === null` and the run does not error (PRIMARY, §B3)

- **Trigger:** contact **`457216562`** (NO access), `mode: uac`, `mock_reformulator_output`
  injected (deterministic) for a business query in a domain the contact cannot see.
  `previous_conversation_state` injected non-empty.
- **Expect-path:** `check-access` → `If5`[**1**] → `sorento-sub-respond-sendmsg-respond5`.
  `compile-current-state` **does not execute** (§D #3).
- **Expect-output:**
  - `after === null` — **JSON `null`**, not `{}`, not `"null"`, not the key being absent
  - `before` populated (the session read happened upstream of the access gate)
  - `parser_applied` populated (the injected mock)
  - `parser_raw === null` — the mock lane bypasses `output_exchange` (§B6); assert explicitly so a
    future change to `mock-reformulator-output` is caught
  - **the execution status is `success`** and the logger executed — the whole point of the guard is
    that a dead-end branch still produces a chat_histories row
- **Safety:** §0 all + S3 + S7 + S9. **S1: no message reached `457216562`** — the sendmsg call is
  `is_test:true`-guarded and recorded to `test:egress:{test_run_id}`, never sent.

### §ST-3 — Trim rule fires on a real roster (C1 trim helper)

- **Trigger:** contact `437264483`, `mode: uac`, **real parser**, a turn that produces a CS-member
  offer (escalation-yes on a business query) so `build-cs-member-offer` → `compile-current-state`
  runs and `after.last_result_set` is a multi-row roster with `label` fields.
  `previous_conversation_state` injected with a **17-row `last_result_set`** (reuse the shape from
  exec `9395526`) so `before` is trimmed too.
- **Expect-output:**
  - `before.last_result_set` is **an object, not an array**: `{ n: 17, first: "SRTKS2406" }` —
    `n` an integer equal to the injected length, `first` the first row's `label`
  - `after.last_result_set` is likewise `{n, first}` with `n` equal to the roster length and
    `first` the first member's name
  - `before.dym_candidates` and `after.dym_candidates`, where present, are also `{n, first}`
  - **serialized `state_trace` length < 8 KB** — the bloat guard the trim rule exists for. Record
    the byte length; a regression here is a corpus-table problem, not a cosmetic one
  - no other array in any layer was collapsed (`entities` is still an array of objects)
- **Safety:** §0 all + S3 + S7 + S9. The member offer is *built and recorded*, never assigned —
  no PIC comment, no SLA row, no assignment (hard safety rule).

### §ST-4 — `parser_raw` differs from `parser_applied` (PRIMARY, C2)

- **Trigger:** contact `437264483`, `mode: uac`, **real parser**. Message names a date window in a
  domain outside `DATE_FILTER_DOMAINS` (`output_exchange` line ~700: the set is
  `{'promotion','order'}`) — e.g. **`"check stock for srt8408 last week"`** (`domain_hint:inventory`).
  The gate strips the date and stamps `date_filter_gated`.
- **Expect-output:**
  - `parser_raw.date_filter_start` is **non-null** (the LLM extracted the window), or
    `parser_raw.date_mode` is non-null
  - `parser_applied.date_filter_start === null` **and** `parser_applied.date_filter_end === null`
    **and** `parser_applied.date_mode === null`
  - `parser_applied.date_filter_gated === "inventory"`
  - `parser_raw` has **no** `date_filter_gated` key, and **no** `*_applied` key
    (`scope_exclusive_applied`, `entity_op_applied`, `entities_filtered`,
    `domain_signal_source`) — those are stamped after the snapshot point (§A5)
  - `JSON.stringify(parser_raw) !== JSON.stringify(parser_applied)` — the acceptance criterion for
    the whole C2 hunk
- **Fallback trigger if the LLM does not emit a date:** any turn where `entity_op_applied` or
  `scope_exclusive_applied` fires. Per LESSONS §39, do **not** pin a single deterministic LLM
  outcome — the PASS condition is *"at least one post-process demonstrably fired and the two layers
  differ"*, with the specific field recorded in the run log.
- **Safety:** §0 all + S3 + S7 + S9. Parser LLM runs.

### §ST-5 — `turn_id` equality: state_trace row ↔ outgoing rows

- **Trigger:** §ST-1's turn (same run; this is an additional assertion set, not a second execution).
- **Expect-output:**
  - the logger blob's `turn_id` is a non-empty string equal to `String(<this execution's id>)`
  - the `test:egress:{test_run_id}` record(s) for `guard:"sendmsg-sub"` carry the **same string**
  - **string equality between them**, not merely "both present" (obs-latency V-OBS-c, re-asserted
    because state_trace is only useful if it joins)
  - `state_trace` sits on the row whose `type === "incoming"`
- **Safety:** §0 all + S3 + S7 + S9.

### §ST-7 — Exactly one state_trace per turn, under outgoing fan-out

- **Trigger:** a turn that emits **multiple** outgoing messages. Cheapest reliable one: a **voice
  turn** on the mock lane (`mock_transcript` set, `attachment.type: "audio"`, `if-audio-mock`
  — **not** `fetch-audio`/`whisper-transcribe`), which sends `send-transcript-confirm` **and** the
  answer. Contact `437264483`, `mode: uac`, `mock_reformulator_output` injected.
- **Expect-path:** `if-audio-in`[0] → `if-voice-allowed`[0] → mock lane → `patch-transcript` (sets
  `attachment.type='text'`) → `tf-message` → `if-message-is-audio`[**1**/FALSE] → logger executes
  **once**.
- **Expect-output:**
  - `Call 'sub-respond-save-message-redis'2` has **exactly one run** in runData
  - `LLEN sorento-respond-message-TEST` increased by **exactly 1**, while **≥2** sendmsg egress
    records exist in `test:egress:{test_run_id}`
  - `state_trace.after` is populated (voice-allowed turns reach `compile-current-state`)
  - `message_id` survived transcription (obs-latency §OBS-3 regression guard) — non-empty, not
    `"undefined"`
- **Safety:** §0 all + S3 + S7 + S9. Assert `whisper-transcribe`, `fetch-audio` and
  `Transcribe a recording` did **not** execute.

---

## §G. Verification checklist (V- items, for the reviewer)

- **V-ST-a — order gate green.** §ST-6 passed *before* any other case ran, and the run log records
  both `executionIndex` values. Without this, every `after` assertion in the report is void (§B2).
- **V-ST-b — `before` is genuinely pre-turn.** In §ST-1, `before` matches the injected
  `previous_conversation_state` and **differs from** `after`. Confirms §B1 was not violated by a
  CRM re-read.
- **V-ST-c — `after: null` is real and survivable.** §ST-2 shows `after === null` (JSON null) on a
  no-access turn **with execution status `success`** and a chat_histories blob still produced.
  A dead-end turn that produces no row at all is a FAIL, not a pass.
- **V-ST-d — trim rule bounded.** Across §ST-1/§ST-3: every `last_result_set`,
  `referenced_result_set` and `dym_candidates` in all four layers is `{n, first}`, never an array;
  serialized `state_trace` < 8 KB.
- **V-ST-e — C2 is observable and additive.** §ST-4 shows `parser_raw !== parser_applied` with the
  differing field named. Separately: diff `parser_applied` for one turn against the same turn's
  parser output before the change — **byte-identical**. C2 must add a key and change nothing else.
- **V-ST-f — join integrity.** §ST-5 string equality, incoming↔outgoing, both equal the spine
  execution id.
- **V-ST-g — the two publishes are separate.** The spine auth change (§A2) was published **on its
  own**, before state_trace was applied to the draft. Immediately before the state_trace publish,
  the draft-vs-active diff shows **zero differing nodes** other than the state_trace node itself,
  and connections byte-identical. If `get-session-vars` still differs, the auth change has **not**
  landed and the state_trace publish must HALT (LESSONS §24/§51).
- **V-ST-h — fork≡live still holds at promote time.** Re-run the §A3 per-node sha diff of
  `wI5RkNGW3EOJfBdo` vs `XTODTw-dJcV0uRdC056hG`. All 6 shared nodes byte-identical, or HALT —
  a divergence means someone landed unpromoted work on the fork and C5 step 2 would ship it as a
  rider. The dangling `Postgres Chat Memory` node is **not** promoted.
- **V-ST-i — connections untouched.** Neither C1 nor C2 modified any `connections` block on the
  clone, the fork, the live spine, or the live sub. (§ST-6's remediation, if it fires, is an
  explicit clone-only exception and must be listed as such in the node-diff.)
- **V-ST-j — sink accounting reconciles.** Total `sorento-respond-message-TEST` LLEN delta equals
  the number of turns executed. Any prod-list movement is attributed by payload shape; a prod blob
  carrying `state_trace` during the build phase is a HALT (§E S7).
- **V-ST-k — replay norm rule landed.** `aROEBlQyyoQaB7a1` › `Diff` `norm()` strips `_parser_raw`,
  with the §C4 justification recorded in-node. Verify by running a **small sampled replay**
  (LESSONS §29 — not full-corpus) and confirming zero new diffs attributable to `_parser_raw`.
- **V-ST-l — docs.** CLAUDE.md's clone-wiring table and `plans/plan.md` reflect: parser fork
  `wI5RkNGW3EOJfBdo` ≡ live (A3), spine draft/active divergence (A2), the `parser` scope of this
  change. Reviewer blocks on this — the next agent will read whatever is there as an invariant.

---

## §H. Blockers / prerequisites

1. **P1 (HARD BLOCKER, CRM side).** `chat_histories.state_trace jsonb NULL` must exist **and** the
   ingest consumer must tolerate the new key **before** C5 step 3. The blob flows
   spine → `sub-respond-save-message-redis` → RPUSH `sorento-respond-message` →
   `redis-consume-queue-mongo` → CRM `insert-message`. If that endpoint rejects unknown keys, adding
   `state_trace` breaks **every incoming-message insert in production** — a total chat-history
   outage, not a degraded feature. Confirm the endpoint's behaviour on an unknown key explicitly;
   do not infer it from the column existing.
2. **Spine draft is dirty** (§A2) — the `get-session-vars` auth conversion. Must be published
   separately and **first**. Not a blocker for build (all build work is on the clone and the fork),
   but a hard gate on promotion.
3. **§ST-6 must pass before §ST-1..§ST-5** (§B2). If the clone's connection order needs reordering,
   that is a clone-only remediation and must be recorded as such — the live order must not change.
4. **Partial-access / ask-for-access test contact is still TBD.** Not required by any case here
   (§ST-2 uses the NO-access contact `457216562`), but it remains an open harness prerequisite and
   should not be quietly forgotten.
5. **Parser tier cost.** §ST-1/§ST-3/§ST-4 each burn a real `gpt-5.4-mini` call (~2.8 s per §A1).
   Three real-parser turns is the floor; do not "save cost" by mocking them — §B6 makes
   `parser_raw` structurally unobservable under the mock, and a green mocked run for §ST-4 would be
   fraudulent.
6. **UAC ↔ replay redis contention** (LESSONS §30) still applies — do not run these concurrently
   with a replay on `main-message-list-test`.
7. **Out of scope, still open, do not fix here:** the live spine's `Call 'sub-get-results'` and
   `probe-incoming` target `rysSPgUssLDf6xJc` (`sub-get-results TEST`) — production traffic through
   a workflow named TEST; `sub-sendmsg-CHAT` is stale vs live; `session_vars.referenced_result_set`
   is read by `Call 'sub-query-reformulator'` but is not present on the `get-session-vars` payload
   (§A4).
