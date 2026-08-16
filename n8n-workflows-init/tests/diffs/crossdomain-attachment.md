# Node diff — `crossdomain-attachment` (clone `txiPzSxy3Pclsz6v`)

**Built 2026-08-04. Clone ONLY. Live `9qVyfUxmRQqrpGRMDLRuz` (@ `a40cd16d`) NOT touched. NOT promoted.**

| | |
|---|---|
| target | `txiPzSxy3Pclsz6v` (`sorento-consume-main TEST`) |
| before | `a0f434f9-a516-45a8-95d9-5673dd9ddb4a` (draft == active) |
| **after** | **`de71f2fc-6133-4561-9785-efe0d9906a57`** (draft == active; REST PUT auto-published, HTTP 200) |
| backup | `/Users/tehjayson/Documents/foundryx/sorento_crm_n8n/n8n-workflows-init/backups/clone-txiPzSxy3Pclsz6v-a0f434f9-20260804-xdattach-before.json` (gitignored via `*-before.json`) |
| plan | `../../plans/crossdomain-attachment-plan.md` |
| UAC | `../UAC.md` §XA + §XA-FP |
| nodes | 138 → **139** (one added) |
| nodes with changed `parameters` | exactly **4**: `attach-merge` (new), `crossdomain-render`, `if-got-attachments`, `Edit Fields`. Machine-diffed against the pre-change GET — nothing else moved. |

**User decisions built to (2026-08-04):**
- **RISK-A1 / Q10 — ATTACH FOR EVERYONE.** No per-agent incoming-access re-check. Discharged by explicit
  user decision after being shown that this extends the accepted "stock+incoming = one entitlement" risk
  from text rows to a downloadable, forwardable document. Recorded in plan §7.
- **D-ATTACH-MENTION — MENTION IT**, with the direct path's exact sentence `I have attached the file(s) below.`,
  and **only when a file is actually attached** (see §2 below — the gate is `blocks.length && XD_FILES.length`).

---

## 1. Edge-level diff (full, both directions)

### Cut
| edge |
|---|
| `central-exchange`[main:0] → `if-got-attachments`[0] |

### Added
| edge |
|---|
| `sorento-sub-respond-sendmsg-respond2`[main:0] → `attach-merge`[0] |
| `attach-merge`[main:0] → `if-got-attachments`[0] |

### Before → after, verbatim from the deployed connection maps

```
BEFORE
  central-exchange[main:0]                       -> ['if-got-attachments', 'compile-current-state']
  sorento-sub-respond-sendmsg-respond2[main:0]   -> ['Execution Data']
  attach-merge                                   -> (node does not exist)
  if-got-attachments[main:0]                     -> ['Edit Fields']

AFTER
  central-exchange[main:0]                       -> ['compile-current-state']
  sorento-sub-respond-sendmsg-respond2[main:0]   -> ['Execution Data', 'attach-merge']
  attach-merge[main:0]                           -> ['if-got-attachments']
  if-got-attachments[main:0]                     -> ['Edit Fields']
```

**Unchanged, verified in the deployed graph:** `Edit Fields`→`Split Out`→`Remove Duplicates`→
`get-presigned-url`→`Loop Over Items1`; `Loop Over Items1`[main:1]→`Switch`; `Switch`[0/1/2]→
`guard-e/f/g-record`; `guard-*-record`→`chat-attach?`→{`chat-attach-push`, `Loop Over Items1`};
`crossdomain-compose`[0]→{`sorento-sub-respond-sendmsg-respond2`, `guard-d-record`, `session-save-gate`};
`If6`.main == `[['central-exchange'], ['Aggregate1']]` (the tool-loop-removal join survives).

**No node became wrongly zero-inbound.** The zero-inbound set is byte-identical before and after:
`Code in JavaScript`, `OpenAI Chat Model`, `save-session-vars`, `send-message-files`,
`send-message-images`, `send-message-video`, `sorento-sub-respond-sendmsg-respond3`,
`update-human-intervened`. `central-exchange` still has `If6`[0] inbound; `if-got-attachments` is now fed
by `attach-merge`.

---

## 2. `crossdomain-render` (Code) — 2 hunks, both additive

`jsCode` sha256[:12] `5c0067a97d36` → `f711fd2c7eb3`, 5786 → 7576 chars. Deployed body byte-matches the
body that was sent. The LEAD literal, decision (d), the row renderer, sort order, flags and the degraded
early-return are **untouched**.

### Hunk 2a — stash the probe's files + build the mention (inserted immediately after the `LEAD` const)

```js
+ // ATTACHMENTS + D-ATTACH-MENTION (user decision 2026-08-04).
+ // The probe envelope carries the packing list(s) at ENVELOPE level ...
+ const XD_FILES = Array.isArray(env.attachments) ? env.attachments : [];
+
+ // Announce the file with the SAME sentence the direct `check eta` path uses ...
+ // GATED on there actually being a file: the ON-HAND direction probes
+ // `crm_inventory_stock_balance_list`, whose envelope carries `attachments: []`, so an on-hand block
+ // (e.g. `pls check eta SRTWT5800`) never gains this sentence. Never append it unconditionally.
+ const ATTACH_NOTE = 'I have attached the file(s) below.';
+ const mention = (blocks.length && XD_FILES.length) ? ('\n\n' + ATTACH_NOTE) : '';
```

`env` is the already-unwrapped probe envelope (`if (env.output && typeof env.output === 'object') env = env.output;`),
the same variable `env.answers` is read from — so `env.attachments` sits at the same level.

### Hunk 2b — the `_xdBlock` literal

```js
- block: blocks.length ? (LEAD + '\n\n' + blocks.join('\n\n')) : '',
+ block: blocks.length ? (LEAD + '\n\n' + blocks.join('\n\n') + mention) : '',
  any: blocks.length > 0,
+ // stashed for `attach-merge`. Namespaced under _xdBlock, which compile-current-state's
+ // whitelisted rebuild drops before the live session PUT (review finding F2 stays discharged).
+ attachments: XD_FILES,
  team: …, origin: …, probed_rows: …, rendered_rows: …
```

The degraded early-return (`{block:'', any:false, degraded:true, reason}`) is left alone — it has **no**
`attachments` key, so `attach-merge` reads `[]`, which is correct for a soft-failed probe (XA.10).

### Why the mention cannot break the marker/placement contract — checked, not assumed

- `crossdomain-compose` computes `const hay = out.user_response.toLowerCase()` at line 59, **before** the
  insertion at lines 66/78. `out.user_response` at that point is `compile-current-state`'s message. The
  block is *inserted into* that string and is **never part of the haystack**, so nothing inside
  `xb.block` can move the insertion point. (Same argument already recorded for the LEAD reword,
  plan §LEAD-IN REWORDED.)
- Independently: `I have attached the file(s) below.` contains none of the five markers
  (`Related products:`, `Try:`, `Did you mean`, `Here are the closest matches:`,
  `Would you like me to escalate`) under a case-insensitive match.
- The mention sits at the **end of the block**, i.e. still above the escalate question on the total-miss
  arm (block inserted above the winning marker) and above `PHRASE` on the answered arm
  (`…user_response\n${xb.block}\n\n${PHRASE}`). The frozen `PHRASE` const in `crossdomain-compose` is
  **untouched** and still the single source for both `out.user_response` and state `v.response`.
- `attach-merge`'s delivery test is `txt.includes(xb.block)`; both compose arms insert `xb.block`
  verbatim, so growing the block does not break the test.

### Locked behaviours re-verified as preserved
decision (d) — an empty probe still contributes no line and `any:false`; bullets never numbers; no cap;
zero-QTY rows still rendered; `last_result_set` / `selection_context` untouched; both lead-in strings
byte-unchanged.

---

## 3. NEW node `attach-merge` (`n8n-nodes-base.code` v2, `runOnceForAllItems` default)

id `0f2a7c41-8b3d-4e56-9a10-7c2d5e8f4b91`, position `[8496, 2450]` (no collision — checked against every
node's position before the write). `credentials: None` — and a Code node is a **type** that cannot hold
one (LESSONS §47: assert on type, not on an absent `credentials` block, which MCP redacts anyway).
`jsCode` sha256[:12] `d548f0f1c2b0`, 2906 chars, deployed byte-matches sent.

Contract: emits **exactly one** item `{ attachments: [...] }` and reads everything else by name. It writes
**nothing** onto `crossdomain-compose`'s item.

```js
const MAIN = (() => {
  try {
    const n = $('central-exchange');
    if (!n.isExecuted) return [];                       // total-miss branch: no main-answer files
    const a = n.first().json.attachments;
    return Array.isArray(a) ? a : [];
  } catch (e) { return []; }
})();

const XD = (() => {
  try {
    const r = $('crossdomain-render');
    if (!r.isExecuted) return [];
    const xb = r.first().json._xdBlock || {};
    const list = Array.isArray(xb.attachments) ? xb.attachments : [];
    if (!list.length) return [];
    if (xb.any !== true || !xb.block) return [];        // decision (d) / degraded probe -> no file
    const c = $('crossdomain-compose');
    if (!c.isExecuted) return [];
    const txt = c.first().json.user_response;
    if (typeof txt !== 'string' || !txt.includes(xb.block)) return [];
    return list;
  } catch (e) { return []; }
})();

return [{ json: { attachments: [...MAIN, ...XD] } }];
```

- `.isExecuted` is proven on this instance — `crossdomain-compose` L9 and `compile-current-state` L13/69/79
  already use it.
- No dedupe here by design (A4): `Remove Duplicates` (`fieldsToCompare: "url"`, verified still
  `{"compare":"selectedFields","fieldsToCompare":"url","options":{}}` in the deployed graph) is the single
  owner, so §XA-FP2 can actually settle who is doing the work.
- Both bodies pass `node --check` (wrapped in an IIFE for the top-level `return`).

---

## 4. `if-got-attachments` (If) — gate repoint (mandatory, trap 1)

```
- leftValue: ={{ $('central-exchange').first().json?.attachments.length }}
+ leftValue: ={{ $json.attachments.length }}
```
`rightValue: 0`, `operator: number gt`, `typeValidation: strict`, `caseSensitive: true`, `version: 2` —
all unchanged. Input is `attach-merge`'s single item, so `.length` is always a number.

**Why mandatory:** on the total-miss branch `central-exchange` never executes, and `$('X')` on an
unexecuted node throws — under `typeValidation: strict` that is a hard node error, not a silent false.
This was verified in the deployed graph: after the change the **only** unguarded `$('central-exchange')`
reference in the whole workflow is gone. The three remaining references (all in `compile-current-state`,
L69/70 and L79) are each behind `.isExecuted`.

---

## 5. `Edit Fields` (Set) — payload repoint (mandatory, trap 2)

```
- value: ={{ $('validator').first().json.attachments }}
+ value: ={{ $json.attachments }}
```
`name: attachments`, `type: array` unchanged. Input is the `if-got-attachments` TRUE item.

**Why mandatory:** `$('validator').attachments` is `[]` on every inventory-origin turn, so rewiring alone
would have produced **zero files with a green execution** (§XA-FP3 exists to show this red).

**Recorded behaviour note (not in the plan).** `central-exchange` is only an identity pass-through when
`input.output` is *not* an object; on the AI-agent arm it returns `input.output` instead. So the old gate
(`central-exchange`) and the old payload (`validator`) could genuinely disagree there — green gate, zero
files. Both now read the same source, which is strictly the gate's own semantics. This can only turn a
silent-zero into a delivery, never the reverse.

---

## 6. §0 containment — re-verified against the DEPLOYED graph (not from memory)

Enumerated the full connection map of the read-back workflow.

| check | before | after |
|---|---|---|
| `send-message-files` inbound | 0 | **0** |
| `send-message-images` inbound | 0 | **0** |
| `send-message-video` inbound | 0 | **0** |
| `update-human-intervened` inbound | 0 | **0** |
| `save-session-vars` inbound | 0 | **0** |
| credentialed nodes | 28 | **28** |
| postgres credential bindings | `n8n_test-db` ×3 (`pg-upsert-session`, `pg-get-session`, `log-incoming-chat-history-n8ntest`) | **identical**, no prod DB |
| sendmsg callers → `ublq9nSlrpz63xan` | 8 | **8** |
| get-results callers → `rysSPgUssLDf6xJc` | 4 (`Call 'sub-get-results'`, `probe-incoming`, `sibling-probe`, `crossdomain-probe`) | **4, unchanged — `crossdomain-probe.workflowId` NOT remapped** |
| `If6.main` | `[[central-exchange],[Aggregate1]]` | **identical** |
| nodes mentioning `is_test` | 11 | **11 — no new `is_test` anywhere** |
| `settings` | `{executionOrder:v1, availableInMCP:true, callerPolicy:workflowsFromSameOwner, binaryMode:separate}` | **identical** (PUT sent only `{executionOrder, callerPolicy}`; server merged, nothing lost) |

The new file path reaches **only** `Switch`[2] → `guard-g-record` (RPUSH `test:egress:{test_run_id}`,
`{"guard":"send-message-files","kind":"would_send",…}`) → `chat-attach?` → `chat-attach-push`. No edge
was added to any real sender.

**F2 stays discharged — verified in the deployed `compile-current-state`, not assumed.** Its return at
L418–462 builds a whitelisted `{variables:{…21 named keys…}, user_response, quick_reply}` object, so
`_xdBlock` (and therefore the new `attachments` key inside it) can never reach `crossdomain-compose`'s
item and never reaches live's `save-session-vars` PUT. `attach-merge` emits a fresh item on a dead-end
branch and mutates nothing. **No `_xdApplied` or any other debug key was added.**

---

## 7. Behaviour changes to record, not discover

1. **RISK-A4 — a failed text send now suppresses the file.** `sorento-sub-respond-sendmsg-respond2` has
   `onError: continueErrorOutput` with `main[1]` unwired; `attach-merge` hangs off output 0 (success). If
   the send fails, `attach-merge` never runs. Judged correct (never a file with no message) but it is a
   change from today.
2. **🚩 The `get-presigned-url` exposure is WIDENED, and now it can produce a false statement.**
   That node has `onError: continueErrorOutput` with `main[1]` **unwired**, and the CRM 404s on a path with
   no attachments row (`presigned_require_attachment_row`, `config.py:90`) — so a dropped file leaves the
   execution `success`. This change widens it two ways and I am not relying on it silently:
   - the node now fires on cross-domain `check stock` turns, a population that never reached it before;
   - because D-ATTACH-MENTION was taken, a dropped file now leaves the customer reading
     *"I have attached the file(s) below."* with no file — previously a silent drop was merely silent.
   Mitigation is **not** in this diff (plan follow-up #2, instance-wide). Every §XA case must assert
   per-node runData (`get-presigned-url` run count + each run's `executionStatus`), never execution status.
   §XA-FP4 must be run.
3. **§XA.11 re-baseline required.** D-ATTACH-MENTION changes the byte output of any cross-domain turn that
   carries a file — i.e. X1/X3/T1 in `tests/pre-promote-manual-tests.md` and the §XA.11 baseline. This is
   the expected cost the plan priced in (§7). Turns with **no** file (on-hand direction, both-empty,
   soft-fail, every no-op row) are byte-unchanged.
4. **The §3.3 residual is unchanged and still live:** `env.attachments` is envelope-level, so on a mixed
   turn a file belonging to a probed-but-*unrendered* product can ride along. `xb.any === true` bounds it
   to "we rendered something". §XA.5's per-filename↔product assertion is the instrument.

**V1 answered from source (record it rather than re-deriving):** the CRM presenter
`sorento_crm_mcp/sorento_crm_mcp/presenters.py:696–707` builds ONE envelope-level `attachments` list and
already de-dupes it on `(url, filename)`. So `Remove Duplicates` is a backstop, and §XA-FP2 is very likely
to show A-COUNT staying at 1 — which per the UAC must be reported as *"no duplicate is produced upstream"*,
**not** as *"our dedupe works"*.

---

## 8. Rollback (granular, leaves `cross-domain-stock-incoming` in place)

1. re-add `central-exchange`[0] → `if-got-attachments`;
2. delete `sorento-sub-respond-sendmsg-respond2`[0] → `attach-merge` and `attach-merge`[0] → `if-got-attachments`;
3. delete node `attach-merge`;
4. `if-got-attachments.conditions.conditions[0].leftValue` → `={{ $('central-exchange').first().json?.attachments.length }}`;
5. `Edit Fields.assignments.assignments[0].value` → `={{ $('validator').first().json.attachments }}`;
6. remove `XD_FILES` / `ATTACH_NOTE` / `mention` and the `attachments:` line from `crossdomain-render`.

Steps 1–5 stop all new file sends. Coarse rollback: restore the backup JSON above (that reverts to
`a0f434f9`, i.e. `cross-domain-stock-incoming` as published, which is the correct floor here).

---

## 9. What is NOT done in this diff

- **No promotion.** Live `9qVyfUxmRQqrpGRMDLRuz` untouched; not read for writing, not written.
- **No UAC executions** (tester's job). Nothing below §XA is claimed green here.
- **`validate_workflow` by workflow-id is not available on this MCP surface** — the tool validates n8n SDK
  *code* (`{code}` is its only argument), not a deployed workflow. Substituted: n8n's own server-side
  validation on the PUT (HTTP 200), a full read-back byte-diff (only the 4 intended nodes differ,
  connections identical to intended), `node --check` on both jsCode bodies, and the §6 census. Reported as
  a substitution, not as a pass.

---
---

# ADDENDUM — `presign-fail` follow-up (clone `txiPzSxy3Pclsz6v`)

**Built 2026-08-04, same day, as a follow-up to §7.2 above. Clone ONLY. Live `9qVyfUxmRQqrpGRMDLRuz`
(@ `a40cd16d`) NOT touched — only its read-only backup JSON was inspected. NOT promoted. No UAC run.**

| | |
|---|---|
| target | `txiPzSxy3Pclsz6v` (`sorento-consume-main TEST`) |
| before | `de71f2fc-6133-4561-9785-efe0d9906a57` (draft == active) |
| **after** | **`4c63eb41-1689-47a1-91ad-ef6d2f04b2f3`** (draft == active; REST PUT auto-published, HTTP 200) |
| backup | `/Users/tehjayson/Documents/foundryx/sorento_crm_n8n/n8n-workflows-init/backups/clone-txiPzSxy3Pclsz6v-de71f2fc-20260804-presignerr-before.json` |
| nodes | 139 → **141** (two added) |
| pre-existing nodes with changed `parameters` | **0** — machine-diffed against the pre-change GET. Nothing existing moved. |
| connection keys differing | exactly **2**: `get-presigned-url` (a second output list appended) and `presign-fail-notice` (new). |

**User decision 2026-08-04 (answering the risk raised in §7.2):** *keep* D-ATTACH-MENTION, *and wire the
error path.* This addendum is that wiring.

## A1. 🚩 This is a LIVE defect, not harness scaffolding

Verified against the read-only live backup `n8n-workflows-init/backups/live-spine-9qVyfUxmRQqrpGRMDLRuz-a40cd16d-20260803.json`:

```
live  get-presigned-url : onError = "continueErrorOutput", retryOnFail = true
live  connections["get-presigned-url"] = {"main":[[{"node":"Loop Over Items1",...}]]}   <- main[1] ABSENT
live  inbound to get-presigned-url        = Remove Duplicates[main:0]  (only)
```

Identical to the clone's pre-change state. So **today, on production**, a presign failure is swallowed:
the node emits the AxiosError to an unwired `main[1]`, the execution reports `success`, and the customer
gets the CRM's `intro` — `I have attached the file(s) below.` (`sorento_crm_mcp/presenters.py:708`) — with
no file. That is LESSONS §61(a) exactly, and it predates the cross-domain work.

**Promote checklist consequence (must not be dropped):** the new node `presign-fail-notice` **and** the
edge `get-presigned-url`[main:1] → `presign-fail-notice` **and** a live-shaped sender must be ported to
live together with the cross-domain change. Porting D-ATTACH-MENTION *without* this path ships the
false-claim hazard to live on a new population. See §A7 for exactly how the sender must differ on live.

## A2. Node/edge diff

### Added edges
| edge |
|---|
| `get-presigned-url`[main:**1**] → `presign-fail-notice`[0] |
| `presign-fail-notice`[main:0] → `sorento-sub-respond-sendmsg-presign-fail`[0] |

### Verbatim, from the deployed connection maps
```
BEFORE  get-presigned-url : {"main":[[{"node":"Loop Over Items1","type":"main","index":0}]]}
AFTER   get-presigned-url : {"main":[[{"node":"Loop Over Items1","type":"main","index":0}],
                                     [{"node":"presign-fail-notice","type":"main","index":0}]]}
AFTER   presign-fail-notice : {"main":[[{"node":"sorento-sub-respond-sendmsg-presign-fail",...}]]}
AFTER   sorento-sub-respond-sendmsg-presign-fail : (terminal, no outbound)
```
**`main[0]` is byte-identical before and after** (asserted programmatically, not eyeballed): the success
path `get-presigned-url`[0] → `Loop Over Items1` is untouched, and so are `Loop Over Items1`[1] → `Switch`,
`Switch`[0/1/2] → `guard-e/f/g-record`, `guard-*` → `chat-attach?` → {`chat-attach-push`, `Loop Over Items1`}.

### New node 1 — `presign-fail-notice` (`n8n-nodes-base.code` v2, `runOnceForAllItems`)
id `3c9e5b17-2a4d-4f81-b6e0-9d1c7a35e802`, position `[9840, 2144]` (checked free against every node
position). Code node = a **type** that cannot hold a credential (LESSONS §47 — assert on type, not on an
absent `credentials` block). `jsCode` sha256[:12] `ad8043e3ebc7`, 3483 chars, deployed body byte-matches
the body sent. `node --check` clean.

Emits **at most one** item `{ notice, presign_failed:true, failed, total }`, or `[]` (→ the sender does
not execute). It writes nothing onto any other node's item.

### New node 2 — `sorento-sub-respond-sendmsg-presign-fail` (`n8n-nodes-base.executeWorkflow` v1.3)
id `5f7a2d43-8c61-4b95-a7d2-1e4b6c908f37`, position `[10064, 2144]`.
`workflowId.value = "ublq9nSlrpz63xan"` (`sub-sendmsg-CHAT`) — **the same guarded fork the other 8
callers use.** `is_test: true` (literal boolean, identical to every other caller), `test_run_id` and
`turn_id` threaded the same way. Shaped on `send-transcript-confirm`, the existing short-follow-up caller.

```
contact_identifer : ={{ $('sorento-sub-respond-findcontact-respond').first().json.id }}
message           : ={{ $json.notice }}
input_message     : =[attachment-failed follow-up] {{ $('redis-pop-main-message-list').first().json.message.messageId }}
contact           : ={{ $('sorento-sub-respond-findcontact-respond').first().json }}
result_set        : ={{ $('crossdomain-compose').first().json.variables.last_result_set }}
is_test           : true
test_run_id       : ={{ $('redis-pop-main-message-list').first().json.message.test_run_id }}
turn_id           : ={{ $execution.id }}
```

- **No `quick_reply`** is passed — deliberately. Re-passing `crossdomain-compose.quick_reply` would
  re-render the answer's buttons under the apology. `send-transcript-confirm` already omits it, so the
  omission is precedent-tested on this sub.
- **`result_set` mirrors `sorento-sub-respond-sendmsg-respond2`** rather than being omitted. The apology
  is the turn's LAST outgoing `chat_histories` row; giving it the *same* frozen set as the main answer
  means a quote-reply on either row resolves identically. Omitting it would have written a null set on
  the newest row. This touches only the outgoing message log — it does **not** write session vars
  (`last_result_set` / `selection_context` remain owned solely by `compile-current-state` →
  `save-session-vars`, which is still zero-inbound on the clone).
- `crossdomain-compose` and `sorento-sub-respond-findcontact-respond` are both guaranteed executed
  whenever this node can run — see A3.

### Message text
| case | text |
|---|---|
| all files failed | `Sorry — I couldn't attach the file(s). Please ask again, or I can escalate this.` |
| partial (`total > failed`) | ``Sorry — ${failed} of ${total} files didn't attach. Please ask again, or I can escalate this.`` |

One sentence + one offer, no reason invented, no apology theatre, em-dash matching house style. The
partial variant exists because the single-sentence version would be *false* when some files did arrive —
`Remove Duplicates` is `get-presigned-url`'s input, so its item count is the number attempted and
`$input` here is the failed subset. The user's suggested wording named "the packing list"; that was
generalised to "the file(s)" because the main-answer population attaches promotions/catalogues too.

## A3. Once per turn — how it is guaranteed (three independent reasons)

The brief flagged "`get-presigned-url` runs inside the attachment loop". **It does not** — verified in the
deployed graph:

```
inbound to get-presigned-url : Remove Duplicates[main:0]   (that is the complete list)
get-presigned-url[main:0]    -> Loop Over Items1
chat-attach?[main:1]         -> Loop Over Items1           (the back-edge lands on the LOOP, not on presign)
```
`Loop Over Items1` is strictly **downstream**; no back-edge reaches `get-presigned-url`. So:

1. **One node-run per turn.** Single non-loop feeder ⇒ `get-presigned-url` executes exactly once, taking
   all N deduped files as N input items.
2. **N failures collapse to one item.** An httpRequest with `onError: continueErrorOutput` emits every
   failed item on `main[1]` *within that single run*, and `presign-fail-notice` is a Code node in
   `runOnceForAllItems` mode — the body executes once and `return [{...}]` yields exactly one item, so
   the sender receives one item and fires once.
3. **Backstop for future rewires.** `if ($runIndex > 0) return [];` is the first statement. If someone
   later moves presign inside the loop, run 0 still notifies and runs 1..n are silent — degrading to
   "one apology" rather than N.

Assertion for the tester (A6): `runData['presign-fail-notice']` = 1 run / 1 output item, and
`runData['sorento-sub-respond-sendmsg-presign-fail']` = 1 run, on a turn with ≥2 failing files.
Note `retryOnFail: true` on `get-presigned-url` — retries happen *inside* run 0 and do not multiply it.

## A4. Mention-only gating — populations in scope, and why the gate is on the text

**Both claiming populations are in scope, under one rule.** They emit the *identical* sentence:

| population | source of the claim |
|---|---|
| cross-domain block | `crossdomain-render`, `const ATTACH_NOTE = 'I have attached the file(s) below.'`, appended only when `blocks.length && XD_FILES.length` |
| main answer | the CRM presenter: `if attachments: intro = "I have attached the file(s) below."` — `sorento_crm_mcp/sorento_crm_mcp/presenters.py:708` |

So rather than gate on graph position (which would need one rule per population and would drift), the gate
asks the **delivered text** whether a claim was made:

```js
const ATTACH_NOTE = 'I have attached the file(s) below.';
const delivered = $('crossdomain-compose').first().json.user_response;   // guarded, see below
if (!delivered.includes(ATTACH_NOTE)) return [];
```

**Why `crossdomain-compose` is the right and only source of the delivered text here.** The whole
attachment chain is rooted at `sorento-sub-respond-sendmsg-respond2`[main:0] → `attach-merge` →
`if-got-attachments` → … → `get-presigned-url`, and `respond2`'s `message` input *is*
`={{ $('crossdomain-compose').first().json.user_response ?? null }}`. So on **both** `If6` branches, the
string this gate reads is exactly the string that was sent. `.isExecuted` + try/catch wrap it anyway.

**Out of scope, deliberately, and it fails CLOSED:**
- a turn that attached nothing and claimed nothing → `get-presigned-url` never executes → no apology
  (structurally impossible, not merely gated);
- a turn where the file dropped but the delivered text does **not** contain the literal (e.g. downstream
  shaping rewrote the CRM intro) → `return []` → no message, i.e. **exactly today's behaviour**. The new
  path can only ever *add* a message where a false claim was demonstrably made; it cannot make any turn
  noisier than the claim itself.
- `failed < 1` → `return []` (defensive; cannot occur on a real error branch).

**Named coupling the reviewer must see:** the gate is an exact literal match against a string owned by
**two** codebases. If `presenters.py:708` or `crossdomain-render`'s `ATTACH_NOTE` is reworded, the gate
goes silent (safe direction: back to today's silent drop, never a spurious apology). It is *not*
self-healing. Mitigation is §A6's FP-B, which proves the gate is load-bearing rather than assuming it.

## A5. §0 containment — re-verified against the DEPLOYED graph after the write

| check | before | after |
|---|---|---|
| `send-message-files` inbound | 0 | **0** |
| `send-message-images` inbound | 0 | **0** |
| `send-message-video` inbound | 0 | **0** |
| `update-human-intervened` inbound | 0 | **0** |
| `save-session-vars` inbound | 0 | **0** |
| zero-inbound node set | — | **identical** apart from nothing (both new nodes have inbound) |
| credentialed nodes | 28 | **28** |
| postgres credential bindings | `n8n_test-db` ×3 | **identical**, no prod DB |
| sendmsg callers → `ublq9nSlrpz63xan` | 8 | **9** (the new one; **no** caller anywhere points at live `aoydkG1dbItXR5jXFEQsP` — that set is empty) |
| get-results callers → `rysSPgUssLDf6xJc` | 4 | **4**, `crossdomain-probe.workflowId` still `rysSPgUssLDf6xJc` |
| `If6.main` | `[[central-exchange],[Aggregate1]]` | **identical** |
| nodes mentioning `is_test` | 11 | **12** (the new caller; value `true`) |
| `settings` | `{executionOrder:v1, availableInMCP:true, callerPolicy:workflowsFromSameOwner, binaryMode:separate}` | **identical** (PUT sent only `{executionOrder, callerPolicy}`; server merged) |
| `active` | true | true |

The new branch's only egress is `sub-sendmsg-CHAT` with `is_test:true` — the same guarded path as the
other 8 callers, so it records `would_send` and surfaces in the chat-console lane. **No edge was added to
`send-message-files` / `-images` / `-video`, and none to live `aoydkG1dbItXR5jXFEQsP`.**

Preserved and re-checked: decision (d); bullets never numbers; uncapped; zero-QTY rows; frozen escalate
`PHRASE` in both sinks (`crossdomain-compose` unchanged — 0 pre-existing nodes have changed parameters);
F2 (the new node adds **no** debug key to any returned item and mutates nothing); marker/placement
contract (no renderer touched).

`validate_workflow` is **not** available for a deployed workflow on this MCP surface — it validates n8n
SDK *code* (`{code}` is its only argument). Substituted, and reported as a substitution not a pass:
n8n's server-side validation on the PUT (HTTP 200), a full read-back diff proving exactly 2 added nodes /
2 changed connection keys / 0 changed pre-existing parameters, byte-match of both new node bodies against
what was sent, and `node --check` on the jsCode.

## A6. Proposed fail-on-purpose (for the TESTER — NOT run here)

`get-presigned-url` cannot be made to fail from the redis item, so the fault must be induced on the node.
**Do not use a bad path on the real CRM host** — point it at a closed local port instead, so zero requests
leave the n8n container.

**Setup (one `update_workflow` op).** Record the exact current value first:
`parameters.url` = `=https://fe-sorento.foundryx.my/api/v1/external/presigned-url`
```
setNodeParameter { nodeName: "get-presigned-url", path: "/url", value: "http://127.0.0.1:9/forcefail" }
```
(`/url`, **not** `/parameters/url` — LESSONS §32b.) `retryOnFail:true` means ~3 attempts before the item
lands on `main[1]`; the run just takes a few seconds longer. **Serialise:** while this is in place the
entire attachment delivery path is dead — do not run any other §XA case concurrently.

**FP-A — the apology fires, exactly once.** Run a cross-domain turn known to attach ≥2 files
(the §XA fixture used for X1/T1). Assert:
- `runData['get-presigned-url']` — **1** run, its `main[1]` carrying **N ≥ 2** items;
- `runData['presign-fail-notice']` — **1** run, **1** output item, `json.failed == N`, `json.total == N`;
- `runData['sorento-sub-respond-sendmsg-presign-fail']` — **1** run;
- `test:egress:{test_run_id}` gains **exactly one** additional `would_send` whose text is
  `Sorry — I couldn't attach the file(s). Please ask again, or I can escalate this.` — and the count of
  `guard-e/f/g-record` records for that run is **0** (no file was delivered);
- `runData['Loop Over Items1']` is **absent** (main[0] emitted nothing);
- assert on this per-node runData, **never** on `execution.status` — the whole point is that it stays
  `success`.

**FP-B — the mention gate is load-bearing (must go RED).** With the forced-fail URL still in place, edit
`presign-fail-notice`'s `ATTACH_NOTE` literal to a string that cannot appear
(`ZZZ-NO-SUCH-CLAIM-ZZZ`) and re-run the same turn. Assert `presign-fail-notice` ran with **0 output
items** and `sorento-sub-respond-sendmsg-presign-fail` has **no runData**, and the egress log gains **no**
`Sorry —` record. If FP-B still produces an apology, the gate is not wired to anything and FP-A's green is
worthless. Restore the literal byte-exactly afterwards (sha the jsCode against `ad8043e3ebc7`).

**FP-C — partial failure wording (optional, only if a ≥2-file fixture is available).** Instead of the flat
dead-port URL, use a per-item expression so exactly one file fails, e.g.
```
={{ String($json.filename || '').includes('<substring-of-one-known-filename>')
      ? 'http://127.0.0.1:9/forcefail'
      : 'https://fe-sorento.foundryx.my/api/v1/external/presigned-url' }}
```
Assert the notice reads `Sorry — 1 of 2 files didn't attach. …`, that `guard-*-record` logged **1**
`would_send` file, and that the apology still fires exactly **once**.

**Teardown (mandatory).** `setNodeParameter { nodeName:"get-presigned-url", path:"/url",
value:"=https://fe-sorento.foundryx.my/api/v1/external/presigned-url" }`, then re-fetch and byte-compare
the value, and re-run one normal §XA case to confirm files deliver again. A forgotten teardown leaves the
clone permanently unable to attach anything — and every subsequent run would emit an apology, which reads
like a regression in the feature.

## A7. What is NOT done, and what promotion still needs

- **No promotion.** Live `9qVyfUxmRQqrpGRMDLRuz` was not written and not read for writing; only the
  2026-08-03 backup JSON was inspected read-only.
- **No UAC executions.** Nothing in §A6 was run. Nothing here is claimed green.
- **The live port is NOT a copy of `sorento-sub-respond-sendmsg-presign-fail`.** LESSONS §48: never
  block-copy `workflowInputs.value` from a clone to live. On live the node must be created fresh with
  `workflowId = aoydkG1dbItXR5jXFEQsP` (the live published sendmsg sub) and **`is_test` absent** — copying
  the clone node verbatim would point production's apology at the harness fork *and* set `is_test:true`.
  The Code node `presign-fail-notice` **is** portable byte-for-byte (it holds no workflow id and no
  `is_test`), as is the edge `get-presigned-url`[main:1] → `presign-fail-notice`.
- **Not fixed here:** the same unwired-`main[1]` pattern on other `continueErrorOutput` nodes
  instance-wide (plan follow-up #2). This addendum closes it for `get-presigned-url` only.
