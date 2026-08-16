# NODE DIFF: `crossdomain-leadin-reword` — on-hand lead-in wording (clone only)

| field | value |
|---|---|
| target | clone `txiPzSxy3Pclsz6v` (`sorento-consume-main TEST`) — **live `9qVyfUxmRQqrpGRMDLRuz` NOT touched** |
| pre-change `versionId` == `activeVersionId` | `1bfc2124-8afa-48e1-ad95-2bfa86b00e02` (`updatedAt 2026-08-03T15:34:24.315Z`, 138 nodes / 175 main edges + 1 `ai_languageModel` = 176) |
| **post-change `versionId` == `activeVersionId`** | **`a0f434f9-a516-45a8-95d9-5673dd9ddb4a`** (`updatedAt 2026-08-04T02:46:09.976Z`) |
| backup (pre-change, full REST GET, gitignored via `*-before.json`) | `n8n-workflows-init/backups/clone-txiPzSxy3Pclsz6v-1bfc2124-20260804-before.json` sha256 `78a9589391b3f303c8e1733a19c3222d6fb4417e39dfadc11926a1853b3a7179` |
| transport | REST `PUT /workflows/txiPzSxy3Pclsz6v`, HTTP **200** (exec-trigger workflow, no webhook → no §60 409). `settings` sent as `{executionOrder:"v1", callerPolicy:"workflowsFromSameOwner"}` only |
| scope tag | `deterministic` — one string literal in one Code node. No logic, no wiring, no new node, no credential, no LLM, no egress surface |
| nodes added / removed / rewired | **0 / 0 / 0** |
| nodes with changed `parameters` | **exactly 1** — `crossdomain-render` |
| `connections` | **byte-identical** before and after |

---

## 1. Starting-graph provenance (the "is this the reviewed artifact" gate)

The previous write to this clone was the tool-loop-removal fail-on-purpose revert, which left it at
`1bfc2124`, claimed content-identical to the reviewed `cb4dffdb`. No `cb4dffdb` capture exists on disk, so
this was re-proved the other way — against the **pre-tool-loop** backup `6d479172`
(`clone-txiPzSxy3Pclsz6v-preTL-20260803-before.json`), independently reproducing the reviewer's exhaustive
machine diff:

```
nodes only-in-6d479172 : ['Loop Over Items', 'Split Out1']     ← the 2 planned deletions
nodes only-in-1bfc2124 : []                                    ← zero additions
parameters differing   : ['tool-filter', 'build-suggest-offer'] ← exactly the 2 planned hunks
```

Identical to `reviews/tool-loop-removal.md` §1 ("nodes removed {Split Out1, Loop Over Items}; nodes added
none; parameters changed on exactly 2 nodes (tool-filter, build-suggest-offer)"). **Nothing from either
fail-on-purpose mutation survived; the starting graph is the reviewed one.** Proceeded.

---

## 2. The change — `crossdomain-render` (Code), the ONLY node touched

`crossdomain-render` `jsCode`: 105 → 111 lines, 5233 → 5786 chars.
sha256 `2f0f3f7a0484853a…` → `5c0067a97d36568e…`.

### 2a. The wording (the change the user asked for) — L93 → L99

**BEFORE**
```js
const LEAD = (zs.origin_domain === 'incoming')
  ? 'But there is stock ON HAND for the requested products:'
  : 'But there is INCOMING stock (ETA) for the requested products:';
```

**AFTER**
```js
const LEAD = (zs.origin_domain === 'incoming')
  ? 'But here are the stock details for the requested products:'
  : 'But there is INCOMING stock (ETA) for the requested products:';
```

- Node: `crossdomain-render` (id `aa88c526-c79d-4490-b0f2-9d5ee420c8e0`), line **93 before / 99 after**.
- The **inventory-origin** lead-in (line 94 → 100) is byte-identical. Only the `incoming` arm moved.
- Applied by script (`replace()` on the exact literal, asserted count == 1, asserted the length delta equals
  exactly `len(NEW) - len(OLD)`), never hand-retyped — the whole PUT body is the fresh REST GET with that one
  substitution (LESSONS §25/§57).

**Intent, before → after.** Before: assert that on-hand stock exists. After: label the rows without
asserting availability. The block deliberately renders **zero-quantity rows** (the FORMAT-PARITY decision,
2026-08-03: every location `check stock` shows, this shows), so the old lead-in sat directly above
`*Quantity On Hand:* 0` rows and contradicted itself. Real case reported by the user: a product whose only
row was `DC1: 2`; turns where every row is 0 also exist. Same class as decision (d) — the bot must not assert
something it has not established.

### 2b. The comment block above it — L89–91 → L89–97 (inert)

The 6 lines of comment directly above `LEAD` existed to justify the OLD wording ("Wording avoids the bare
phrase *stock details found*…"). Left in place it would argue against the string now deployed one line
below it — the exact stale-rationale trap that makes a future reader "fix" the wording back. Replaced with
the current dated rationale plus the verification that retired the old objection (see §3.1). **Comment only;
zero behavioural effect** (`node --check` clean, no token outside a `//` changed).

### 2c. Everything else in the block — UNCHANGED, asserted

| invariant | after |
|---|---|
| bullets, never numbers (Q12 — D3's `last_result_set` contract) | unchanged — no `\d.` generator |
| uncapped (Q11b superseded) — every location / shipment renders | unchanged |
| zero-QTY rows still rendered (format parity) | unchanged |
| empty probe contributes no line — decision (d), positive facts only | unchanged (`if (!rows.length) continue;`, all 4 `lines.push` positive) |
| deterministic sort (stock qty DESC / incoming soonest ETA) | unchanged |
| `_xdBlock` shape `{block, any, team, origin, probed_rows, rendered_rows}` | unchanged |
| `last_result_set` / `selection_context` | never written by this node — unchanged |

Machine assertion, deployed vs the pre-change GET: `nodes differing = ['crossdomain-render']`,
`names equal = True`, `connections identical = True`.

---

## 3. Pre-change checks demanded by the task

### 3.1 The historical rationale is dead — VERIFIED IN THE DEPLOYED NODE, not assumed

The 2026-08-03 note chose "ON HAND" *specifically* to avoid "stock details", because live #3's miss line
then read `No stock records found for: X.` on **both** domains — so on an incoming turn "stock details"
would have sat one line under "no stock records". That miss line was made domain-aware later the same day.
Confirmed in the deployed `compile-current-state` (L256–257, unchanged by this diff):

```js
const _noun = (dh === 'incoming') ? 'incoming' : 'stock';
userResponse += `\n\nNo ${_noun} records found for: ${shown.join(', ')}.`;
```

`dh = qf.domain_hint` in `compile-current-state` (L235) **and** in `crossdomain-zeroset` (L11, which emits
`origin_domain: dh`, L96). Same source, one expression apart — so
`zs.origin_domain === 'incoming'` ⟺ `_noun === 'incoming'`. The two lines **cannot** disagree.

- Incoming turn, PARTIAL branch: `No incoming records found for: X.` → `But here are the stock details…` ✅
- Incoming turn, TOTAL-MISS branch: #3 does not print (it returns early on `returnedCodes.length === 0`);
  the line above comes from `not-found-error-message` → `No incoming stock (ETA) found for X.` ✅
- Inventory turn: `No stock records found for: …` (the locked string, unchanged) → the **incoming**
  lead-in, which this diff did not touch ✅

**No branch can reintroduce the contradiction. Proceeded.**

### 3.2 Nothing regexes or matches on the old string — VERIFIED, instance-wide

| population searched | hits for `stock ON HAND` / `ON HAND for the requested` |
|---|---|
| clone `txiPzSxy3Pclsz6v`, all 138 nodes' `parameters` + the `activeVersion` block | **1** — the `crossdomain-render` literal itself |
| live spine `9qVyfUxmRQqrpGRMDLRuz` @ `a40cd16d`, nodes + `activeVersion` | **0** |
| **all 101 workflows on the instance** via REST `GET /workflows?limit=250` (REST, not MCP — MCP hides archived, LESSONS §59a) | **1 workflow: `txiPzSxy3Pclsz6v`** and nothing else |
| repo working tree (`find … \| xargs grep -l`, not `grep -rl` — §59c) | 4 docs + 2 gitignored backups + 1 historical run log. **Zero code.** |

No `jsCode`, expression, condition or fixture matches on the phrase. The only frozen-regex contract in this
feature is `Would you like me to escalate…` (parser `output_exchange`, `/would you like me to escalate/i`
against `previous_conversation_state.response`) — a **different** string, in `crossdomain-compose`, untouched.
The old lead-in was never part of any contract.

### 3.3 Marker contract untouched — placement cannot move

`crossdomain-compose` anchors the block by searching MARKERS in **`out.user_response`** — the message text
built **upstream** by `build-suggest-offer` / `not-found-error-message` / `compile-current-state`:

```js
const MARKERS = ['Related products:', 'Try:', 'Did you mean',
                 'Here are the closest matches:', 'Would you like me to escalate'];
const hay = out.user_response.toLowerCase();
for (const mk of MARKERS) { const i = hay.indexOf(mk.toLowerCase()); ... }
```

The lead-in lives inside `xb.block`, which is **inserted at** the resolved index — it is never part of the
haystack, on either the PARTIAL branch (plain append) or the TOTAL-MISS branch (marker-anchored insert).
Belt-and-braces: the new string contains **none** of the five markers (case-insensitively). **Placement is
provably unchanged.** `crossdomain-compose` itself was not edited (its params sha is unchanged).

---

## 4. Post-write re-verification (fresh REST GET of `a0f434f9`)

```
PASS | credential-bearing nodes == 28              | found 28 of 138 nodes
PASS | postgres -> n8n_test-db (Dnnofg8Xb27VQOhI)  | population=3 {pg-upsert-session, pg-get-session,
                                                   |  log-incoming-chat-history-n8ntest} bad=[]
PASS | 5 egress nodes zero-inbound                 | send-message-files:0 send-message-images:0
                                                   |  send-message-video:0 update-human-intervened:0
                                                   |  save-session-vars:0
PASS | 8 sendmsg callers -> ublq9nSlrpz63xan       | executeWorkflow population=16; ->LIVE aoydkG1… : []
PASS | If6.main[1] == [Aggregate1]                 | If6.main[0]=[central-exchange]
PASS | get-results callers -> rysSPgUssLDf6xJc     | Call 'sub-get-results', probe-incoming,
                                                   |  sibling-probe, crossdomain-probe; ->LIVE: []
PASS | save-message-redis -> fork tWm5DYLxfypmVC1T | ->LIVE UrETd-… : []
```

Plus:
- **draft == active**: 138/138 nodes compared, `differing = []`, `connections identical = True`.
- **deployed == intended**: `crossdomain-render` `jsCode` sha256 `5c0067a97d36568e…` on the server ==
  the sha of the file that was PUT; zero param-differing nodes vs the intended body.
- **no trailing whitespace** anywhere in the new `jsCode` (asserted pre-PUT — LESSONS §58b), `node --check`
  clean.
- **Live spine re-read after the write:** `9qVyfUxmRQqrpGRMDLRuz` `versionId == activeVersionId ==
  a40cd16d-c404-4d82-bc46-8a2e756e9dc1`, `updatedAt 2026-08-02T23:34:18.534Z` — **untouched**.
- **Clone trigger:** the clone has **no `Schedule Trigger` and no `respondioTrigger`** — its only trigger is
  `When Executed by Another Workflow` (`executeWorkflowTrigger`). Nothing to disable; editing it cannot
  consume the shared prod `main-message-list`.

### Fail-on-purpose (the checks were shown RED before being trusted — LESSONS §61)

The same verifier run against the pre-tool-loop backup `6d479172` returns
`FAIL | If6.main[1] == [Aggregate1] | If6.main[1]=['Loop Over Items']` while the other rows stay PASS. The
join assertion has teeth; it is not a green that cannot fail. (The remaining rows are structural set/id
comparisons whose populations are printed, so an empty result can never read as PASS.)

### Not run (out of contract)

- `validate_workflow` — on this MCP surface it validates **SDK source code**, not a workflow id; there is no
  id-taking validator. Substituted: `node --check` on the changed `jsCode`, the atomic REST PUT's own
  server-side validation (HTTP 200), the draft==active diff, and the structural table above.
- **No UAC execution was run** (tester's job). **No promotion.**

---

## 5. Re-test required (expected-string change only — no logic changed)

| case | why | where |
|---|---|---|
| **X1** `pls check eta SRTWT5800` | its expected text contains the on-hand lead-in | `tests/crossdomain-manual-test-script.md` §2, `tests/pre-promote-manual-tests.md` §3 |
| **T1** `check stock CSS8800, SRT393B-18, SRTMRL707` (F1 multi-token ordering) | the eyeball checklist quotes the lead-in as the string to find; ordering itself is unaffected | `tests/crossdomain-manual-test-script.md` §1 |

Unaffected: **X2** (both empty → no block at all), **X3** (inventory-origin — the INCOMING lead-in, not
changed), **X4** / **X5** (partial: the block's lead-in string only; assert the new text), **X6/X7**
(escalate reconciliation — a different frozen phrase), **X8** (number-pick), **X9/X10** (no-op),
**X11** (#3's miss line), **T2** (`_xdApplied` absent).

Tester note (§12 FINDING 1): a run fired seconds after a PUT can execute a transitional version. **Discard
the first run** after `2026-08-04T02:46:09Z` before asserting.

Docs updated to the new expected string: `tests/pre-promote-manual-tests.md`,
`tests/crossdomain-manual-test-script.md`, `plans/HANDOFF-cross-domain-stock-incoming.md`,
`plans/cross-domain-stock-incoming-plan.md` (new §LEAD-IN REWORDED, supersedes §LEAD-IN LINE).
`tests/runs/tool-loop-removal-PBASE-20260803.md` and the two `*-before.json` backups still contain the old
string and were **deliberately left alone** — they are historical records of what was deployed at the time.

## 6. Promote impact

Adds nothing to the promote checklist in `reviews/cross-domain-stock-incoming.md`. When the bundle is
promoted, `crossdomain-render` carries this literal — the promoted body must be the **`a0f434f9`** version,
not the `1bfc2124` one. No other checklist line changes.
