# Manifest — `spec-answer-honesty` (SR-1 + SR-1b) on the TEST clone

Change-id: `spec-answer-honesty` · slices **SR-1** (N-0, N-2, N-3) + **SR-1b** (N-1a, rev 4) · plan
`plans/spec-answer-honesty-plan.md` · UAC `tests/uac/SR.md` · node-diff `tests/diffs/spec-answer-honesty.md`

Target: **TEST clone `txiPzSxy3Pclsz6v`** (`sorento-consume-main TEST`). The live spine
`9qVyfUxmRQqrpGRMDLRuz` was **NOT touched**. Nothing was promoted. **SR-2 (N-1/N-4) is out of
scope** — the plan's §2 blast-radius gate bars touching any get-results sub.

The clone carries other in-flight work (container-status via the `sub-get-results CS-BUILD`
fork, human-intervened-timeout). This manifest is what keeps the two-node edit separable and
reversible on its own, per SR.md.

---

## Pre-edit snapshot (taken BEFORE any write, 2026-08-13)

| fact | value |
|---|---|
| `versionId` | `6cd67cbf-9b68-426d-b742-55b0ac83f039` |
| `activeVersionId` | `6cd67cbf-9b68-426d-b742-55b0ac83f039` |
| draft vs active | **identical** — 0 nodes differ, node-id sets equal, `connections` byte-identical (LESSONS §23 sweep over all 148 nodes). Publishing the pre-edit state was a pure pointer move; nothing unowned was in the draft to ride along (§24/§51) |
| `updatedAt` | 2026-08-13T01:55:59.100Z |
| clone `active` | true |
| node count | 148 |
| credential bindings | 27 |
| trigger inventory | ONE `n8n-nodes-base.executeWorkflowTrigger` (`When Executed by Another Workflow`). **There is no `Schedule Trigger` and no `respondioTrigger` on this clone**, so the "confirm the schedule trigger is disabled" pre-edit gate is satisfied **vacuously** — recorded because "not found" and "found disabled" must never be conflated. (`update-human-intervened` is a respondio ACTION node, and it remains **orphaned**, 0 inbound.) |

### The two nodes

| | node | id | type |
|---|---|---|---|
| N-0 | **`resolve-entity-http`** | `e663221f-0722-43c0-953d-60bec1f01e07` | `n8n-nodes-base.httpRequest` |
| N-2 + N-3 | **`compile-current-state`** | `7a130a0c-530f-4bfb-a8f2-059ec71c2ea2` | `n8n-nodes-base.code` |

> ⚠️ **`resolve-entity` on the clone is a `noOp`, not the HTTP node** (carried over from the
> shape-A manifest). The clone runs `replay-resolve-entity` (IF) → `fixture-resolve-entity` |
> **`resolve-entity-http`** → NoOp named `resolve-entity` → `disallowed-entity-gate`, so the
> eight nodes reading `$('resolve-entity')` BY NAME resolve whichever arm ran (LESSONS §5/§11).
> On the LIVE spine the same body sits on the node actually named `resolve-entity`
> (`a2bed208-8051-4eb4-8e21-4bee16bd3568`). **Target the live promote by NAME** (LESSONS §58c).

### Node shas

| node | leaf | BEFORE (pre-SR) | AFTER (current) | bytes |
|---|---|---|---|---|
| `resolve-entity-http` | `parameters.jsonBody` | `dac04eb02a23bfd7a780fd2f8905c4e4af4a82b41c31b21dcc0a3328ada7f639` | `7ca14cbfd47e273a1c1464e2fb0c85fd52e3a39cf9f0062f83bc537ce7fd4265` | 1306 → 1809 |
| `compile-current-state` | `parameters.jsCode` | `78a805b312378dd3ec682b0ab6678480b53c16d8b68e2bd91a57c39b58cd9f0c` | **`82707a95a7c63d74b6dbc963774630e21a5bd1c9cb4748671706a4a8a63e67b5`** (rev 4) | 32958 → 52694 |

> **Byte counts are BYTES, not characters** (LESSONS §57). The rev-4 body is **52694 bytes /
> 52214 characters** — the 480 difference is the multibyte glyphs the body already carried
> (`── • § → 😊`). A report quoting 52214 is quoting `len(str)`, not `len(str.encode())`; both
> describe the same bytes, and the sha is what settles it.

**Superseded** `compile-current-state` shas, kept so a report can say *which* body it found instead
of just "not the expected one" (LESSONS §64 rule ii — three outcomes, never two):

| rev | sha | bytes | what it was |
|---|---|---|---|
| rev 1 (`d59c226c`) | `e727631f94d523e37c89dd61736bd8f65850f6fcec663c542a0497aecd0aa335` | 38725 | N-2 printed the bare wire value — the body the tester ran, rendering *"narrow by 1."* |
| rev 2 (`8ed4e464`) | `e3b844c6cb674f54b780a817af5d0287607db790aafc207ddf1d11e73f3aa4f0` | 42402 | N-2 quoted the customer's span, but took the FIRST matching number |
| rev 3 (`48aaa6fd`) | `7959776fa7ce4a0fe5908ca1bcdc5c4ef9c653b02f2cce8db7f3407c86a7566e` | 46933 | N-2 span selection correct; **no "Matched on" line** (pre-SR-1b) |

All three are named in `probe.js`'s D1 gate, which reports **SUPERSEDED (rev N)** distinctly from
**DRIFTED** — "an earlier revision of this change" and "someone else edited the node" are different
facts and must not share one number.

> The AFTER shas above are the DEPLOYED values, re-fetched after the PUT. Both BEFORE bodies are frozen in the repo as the
> RED baseline (LESSONS §69 — the export stops being a red baseline the moment the fix ships):
> `tests/offline/spec-answer-honesty/compile-current-state.before.js` and
> `resolve-entity-http.before.jsonBody.txt`. Both AFTER bodies are **generated**
> (`node build-body.js`, `node build-ccs.js`) — deterministic, never hand-typed.

**Record the post-build sha and check it at the START of every test pass** (LESSONS §64: a UI
save from a stale editor tab silently reverted a published clone change for over a day while
every behavioural check kept passing). `node probe.js` does this automatically — gate **D1**
compares the clone's exported bytes against the suite's with **three** distinct outcomes
(`DEPLOYED` / `NOT-YET-DEPLOYED` / `DRIFTED`), never two.

### Pre-edit sanity that was checked, not assumed

- `resolve-entity-http.jsonBody` on the clone was **exactly** the shape-A AFTER body
  (`dac04eb0…`), i.e. the shape-A change was still present and had **not** been reverted by a UI
  save. This is the §64 check run as a prerequisite rather than after the fact.
- **`compile-current-state` on the clone is STALE vs LIVE** — see the node-diff §"promote
  target" for the full list. Live carries the promotion-picker/tier-ask arms and a
  `_pickerReported` clause inside the very filter N-3 modifies. **The hunks compose on both**
  (they are additive and anchor on lines present in each), but the promote target must be built
  as LIVE + these hunks, never by copying the clone body (LESSONS §57).

---

## Post-edit state — REV 1 (2026-08-13, the body the tester ran)

| fact | value |
|---|---|
| `versionId` / `activeVersionId` | `d59c226c-669c-4fe4-9da5-1be988e70bc5` — published, draft == active |
| nodes whose `parameters` changed vs the pre-edit snapshot | **exactly two**: `resolve-entity-http`, `compile-current-state` |
| offline suite | `node probe.js` → 83 passed, 0 failed; `bash mutate.sh` → 10 caught, 0 survived, 1 expected VOID |

## Post-edit state — REV 2 (2026-08-13, the N-2 customer-span fix)

Rev 2 is **one node, one leaf**: `compile-current-state.jsCode`. It was raised by the tester's
own measurement at the customer boundary (`tests/runs/spec-answer-honesty-SR-2-20260813.json`):
the line rendered `…so I couldn't narrow by 1.` for a customer who typed **1.0mm**.
`resolve-entity-http` was **not** re-touched — its leaf sha is re-asserted unchanged below.

| fact | value |
|---|---|
| `versionId` | `8ed4e464-02ae-47cd-9494-d8328162c254` |
| `activeVersionId` | `8ed4e464-02ae-47cd-9494-d8328162c254` — **published**, draft == active |
| pre-write gates | target id == `txiPzSxy3Pclsz6v` (never the live spine); draft == active BEFORE the PUT (so the auto-publish carried nothing unowned, LESSONS §24/§51); deployed `jsCode` sha **was exactly** rev 1's `e727631f94d5` (the §64 present-check, run as a prerequisite — the clone had NOT been reverted by a UI save); no enabled `scheduleTrigger`/`respondioTrigger` on the clone |
| nodes whose `parameters` changed vs the rev-1 export (`d59c226c`) | **exactly one**: `compile-current-state` |
| node count / name set / id set | 148, identical (nothing added, removed, renamed) |
| `connections` | byte-identical to the rev-1 export |
| credential census | 27 before, 27 after, same ids (LESSONS §55 collateral-credential assertion) |
| `resolve-entity-http.jsonBody` | **unchanged**, sha `7ca14cbfd47e` re-read from the deployed JSON |
| deployed leaf | byte-identical to `tests/offline/spec-answer-honesty/compile-current-state.after.js`, sha `e3b844c6cb67` (42402 B) |
| export | refreshed, `--verify` clean at `8ed4e464` |
| offline suite | `node probe.js` → **101 passed, 0 failed**, gate D1 reports `DEPLOYED (sha e3b844c6cb67)`; `bash mutate.sh` → **16 caught, 0 survived, 1 expected VOID** (the stale-anchor selftest) |
| RED before green (§0 S9) | the 18 new/changed U4 assertions were run against the **deployed rev-1 body first**: **13 FAILED**. Log kept in the build session; every one of them is also killed by a named mutant (m11–m16) |
| trigger inventory | ONE `n8n-nodes-base.executeWorkflowTrigger` (`When Executed by Another Workflow`). Still **no** `Schedule Trigger` and **no** `respondioTrigger` — the pre-edit gate is satisfied **vacuously**, recorded rather than conflated with "found disabled" |
| structural validation | zero dangling connection refs across 148 nodes; `node --check` clean on the deployed Code body; probe gate D0c parses it; `validate_node_config` schema-valid for `n8n-nodes-base.code` v2 with the `jsCode` leaf. ⚠️ **`validate_workflow` on this MCP surface takes SDK *code*, not a workflow id** — there is no "validate workflow txiPzSxy3Pclsz6v" call to make; the checks above are what stands in for it, and they are asserted against the re-fetched deployed JSON, not against the body I sent |
| egress containment | unchanged — `send-message-files`, `send-message-images`, `send-message-video`, `update-human-intervened`, `save-session-vars` all still **0 inbound** |
| new by-name read | the N-2 block reads `$('tf-message')` (try/catch → `''`). `compile-current-state` had **no** prior read of it; it is upstream on every path here and is already read by `resolve-entity-http` (N-0) and `Call 'sub-query-reformulator'`. **Re-assert this against LIVE's graph before promoting** (LESSONS §65) |

## Post-edit state — REV 3 (2026-08-13, the N-2 span-SELECTION fix)

Rev 3 is again **one node, one leaf**: `compile-current-state.jsCode`. Raised by `/codex-review`
(review §H) and reproduced mechanically by the main session before any edit. `resolve-entity-http`
was **not** re-touched — its leaf sha is re-asserted unchanged below. N-3 and the N-2 wording,
position and guards are untouched; only *which span the sentence quotes* moved.

| fact | value |
|---|---|
| `versionId` | `48aaa6fd-6ad7-4ef5-a44c-b491888e0130` |
| `activeVersionId` | `48aaa6fd-6ad7-4ef5-a44c-b491888e0130` — **published**, draft == active |
| pre-write gates | target id == `txiPzSxy3Pclsz6v`, asserted `!= 9qVyfUxmRQqrpGRMDLRuz` in the writer itself; draft == active BEFORE the PUT (the auto-publish carried nothing unowned, LESSONS §24/§51); deployed `jsCode` sha **was exactly** rev 2's `e3b844c6cb67` (the §64 present-check as a prerequisite — the clone had NOT been reverted by a UI save); body asserted free of tabs and trailing whitespace before sending (LESSONS §58b) |
| nodes whose `parameters` changed vs the rev-2 export (`8ed4e464`) | **exactly one**: `compile-current-state` — full **param-hash sweep over all 148 nodes** (LESSONS §71), not a Code-body diff |
| node count / name set / id set | 148, identical; zero `position` / `typeVersion` / `disabled` deltas |
| `connections` | byte-identical to the rev-2 export |
| credential census | 27 before, 27 after, same `(node, type, id)` triples (LESSONS §55 collateral assertion) |
| `resolve-entity-http.jsonBody` | **unchanged**, sha `7ca14cbfd47e` re-read from the deployed JSON |
| deployed leaf | byte-identical to `tests/offline/spec-answer-honesty/compile-current-state.after.js`, sha **`7959776fa7ce`** (46933 B) — re-fetched after the PUT, not trusted from the request |
| export | refreshed; `--verify` **clean** across all workflows at `48aaa6fd` |
| offline suite | `node probe.js` → **108 passed, 0 failed**, gate D1 `DEPLOYED (sha 7959776fa7ce)`; `bash mutate.sh` → **19 caught, 0 survived, 1 expected VOID** |
| RED before green (§0 S9) | the 4 new behavioural assertions (**U4-29, U4-30, U4-31, U4-32**) were run against the **deployed rev-2 body first and all 4 FAILED**, with the wrong strings recorded verbatim in the node-diff. U4-33/U4-34 passed pre-fix and are labelled PRESERVE, not counted as evidence for the fix (LESSONS §66). **U4-35 was added because mutant m15 survived** |
| trigger inventory | ONE `n8n-nodes-base.executeWorkflowTrigger`. Still **no** `Schedule Trigger` and **no** `respondioTrigger` — the "confirm the schedule trigger is disabled" gate is satisfied **vacuously**, recorded rather than conflated with "found disabled" |
| structural validation | 0 dangling connection refs and 0 unknown connection sources across 148 nodes; `node --check` clean on the **deployed** body (read back from the export, not from the file I sent); probe D0c parses it; `validate_node_config` schema-valid for `n8n-nodes-base.code` v2 with the `jsCode` leaf. ⚠️ **`validate_workflow` on this MCP surface takes SDK *code*, not a workflow id** (schema re-read this session: one required property, `code`) — there is no "validate_workflow txiPzSxy3Pclsz6v" call that exists to be made, and the checks above are what stands in for it |
| egress containment | unchanged — `send-message-files`, `send-message-images`, `send-message-video`, `update-human-intervened`, `save-session-vars` all still **0 inbound** |
| new by-name reads | none added by rev 3. `$('tf-message')` (introduced in rev 2, try/catch → `''`) is still the only new one, and still needs the LIVE-graph re-assertion before promoting (LESSONS §65) |

## Post-edit state — REV 4 (2026-08-13, SR-1b · N-1a the "Matched on" line)

Rev 4 is again **one node, one leaf**: `compile-current-state.jsCode`, one new additive block.
Slice **SR-1b** (plan §SR-1b, UAC SR-U6 / SR-10..12). **No get-results sub and no other node was
touched**, so the plan's §2 blast-radius gate is not approached. N-0, N-2 and N-3 are unchanged —
not re-worded, not re-anchored, not re-ordered.

| fact | value |
|---|---|
| `versionId` | `c97f2f8f-e335-4a3b-8046-abea89bbfdf9` |
| `activeVersionId` | `c97f2f8f-e335-4a3b-8046-abea89bbfdf9` — **published**, draft == active (re-read from a fresh REST GET after the write, not from the request) |
| pre-write gates | target id == `txiPzSxy3Pclsz6v`, asserted `!= 9qVyfUxmRQqrpGRMDLRuz` in the writer itself; **draft == active BEFORE the PUT** over all 148 nodes' `parameters` + byte-identical `connections` (so the auto-publish carried nothing unowned, LESSONS §24/§51); deployed `jsCode` sha **was exactly** rev 3's `7959776fa7ce` (the §64 present-check as a prerequisite — the clone had NOT been reverted by a UI save); body asserted free of tabs and trailing whitespace before sending (LESSONS §58b) |
| nodes whose `parameters` changed vs the rev-3 export (`48aaa6fd`) | **exactly one**: `compile-current-state` — full **param-hash sweep over all 148 nodes** (LESSONS §71), not a Code-body diff |
| node count / name set / id set | 148, identical (nothing added, removed, renamed) |
| `connections` | byte-identical to the rev-3 export |
| credential census | 27 before, 27 after, same `(node, type, id)` triples (LESSONS §55) |
| `resolve-entity-http.jsonBody` | **unchanged**, sha `7ca14cbfd47e` re-read from the deployed JSON |
| deployed leaf | byte-identical to `tests/offline/spec-answer-honesty/compile-current-state.after.js`, sha **`82707a95a7c6`** (52694 B / 52214 chars) — **byte-gate re-run from an independent fresh REST GET after an interrupted session**, PASS |
| export | refreshed; `--verify` **clean** across all workflows, clone at `c97f2f8f` |
| offline suite | `node probe.js` → **134 passed, 0 failed**, gate D1 `DEPLOYED (sha 82707a95a7c6)`; `bash mutate.sh` → **22 caught, 0 survived, 1 expected VOID** (the stale-anchor selftest). Both re-run after deployment, on the deployed bytes |
| RED before green (§0 S9) | the 23 new SR-U6 assertions were run against the **deployed rev-3 body first** (scratch copy of the clone's exported bytes, sha `7959776fa7ce`): **14 FAILED** — U6-1, 2, 5, 6, 9, 10, 11, 12, 13, 14, 19, 20, 21, 23. The other 9 pass pre-fix by construction (negative assertions + the byte-identical no-op legs) and are labelled **BOUND**, not evidence; each is still killed by a named mutant (m20→U6-3, m21→U6-15..18, m22→U6-5) |
| mutant numbering | SR.md's SR-1b names `m19`/`m20`/`m21`; **`m19` was already taken** by rev 3's ambiguity guard, so they ship as **m20/m21/m22** in the same order. Recorded in `mutate.sh` at the splice and in the node-diff |
| trigger inventory | ONE `n8n-nodes-base.executeWorkflowTrigger` (`When Executed by Another Workflow`). Still **no** `Schedule Trigger` and **no** `respondioTrigger` — the "confirm the schedule trigger is disabled" gate is satisfied **vacuously**, recorded rather than conflated with "found disabled" |
| structural validation | 0 dangling connection targets and 0 unknown connection sources across 148 nodes; `node --check` clean on the **deployed** body (read back from the refreshed export, not from the file sent); probe D0c constructs it as a Code-node body; node type/typeVersion/param-key set unchanged (`n8n-nodes-base.code` v2, parameters == `['jsCode']`). ⚠️ **`validate_workflow` on this MCP surface takes SDK *code*, not a workflow id** — schema re-read this session: one required property, `code`. There is no `validate_workflow txiPzSxy3Pclsz6v` call that exists to be made; the checks in this row are what stands in for it, and they are asserted against the re-fetched deployed JSON |
| egress containment | unchanged — `send-message-files`, `send-message-images`, `send-message-video`, `update-human-intervened`, `save-session-vars` all still **0 inbound** |
| new by-name reads | **none.** N-1a reads `$('resolve-entity')` and `$('disallowed-entity-gate')`, both already read by this node, both inside try/catch. `$('tf-message')` (rev 2) is still the only new one in the slice, and still needs the LIVE-graph re-assertion before promoting (LESSONS §65) |

> **Session interruption, recorded rather than smoothed over.** The build session was killed by an
> API session limit *after* the PUT and *during* the node-diff edit. On resume, the byte-gate was
> re-run from an independent fresh REST GET (PASS, sha above), draft == active re-confirmed, and
> both offline suites re-run on the deployed bytes. Nothing was inferred from the pre-death run.

### Transport note

Written by a **file-driven REST GET → replace the two leaves → PUT**, per LESSONS §71's
transport corollary and the shape-A manifest's own finding: MCP `setNodeParameter` normalises
`\uXXXX` escapes into literal glyphs and fails the byte-gate. The byte-gate (re-fetch, sha the
leaf, compare against the file) is kept regardless — it is the only thing that caught that
failure class the first time.

---

## Rollback — restores these two nodes only

The whole change is two leaves. Reverting them does not touch the other in-flight work on the
clone (container-status, human-intervened-timeout).

```bash
# from the repo root, with .env loaded
python3 - <<'PY'
import json, os, urllib.request
BASE = os.environ['N8N_API_BASE']; KEY = os.environ['N8N_API_KEY']
WF   = 'txiPzSxy3Pclsz6v'
D    = 'n8n-workflows-init/tests/offline/spec-answer-honesty'
# NOTE: the default Python-urllib User-Agent is rejected with 403 by the edge in front of this
# host — send a UA. (Cost 10 minutes to find; recorded so the rollback path is not a puzzle.)
HDR  = {'X-N8N-API-KEY': KEY, 'Accept': 'application/json', 'User-Agent': 'curl/8.0'}
req  = urllib.request.Request(f'{BASE}/workflows/{WF}', headers=HDR)
w    = json.load(urllib.request.urlopen(req))
body = {k: w[k] for k in ('name', 'nodes', 'connections', 'settings')}
body['settings'] = {k: v for k, v in body['settings'].items()
                    if k not in ('binaryMode', 'timeSavedMode')}   # LESSONS §55
for n in body['nodes']:
    if n['name'] == 'resolve-entity-http':
        n['parameters']['jsonBody'] = open(f'{D}/resolve-entity-http.before.jsonBody.txt').read()
    if n['name'] == 'compile-current-state':
        n['parameters']['jsCode'] = open(f'{D}/compile-current-state.before.js').read()
req = urllib.request.Request(f'{BASE}/workflows/{WF}', method='PUT',
        data=json.dumps(body).encode(),
        headers={**HDR, 'Content-Type': 'application/json'})
print(urllib.request.urlopen(req).status)
PY
```

Then assert the re-fetched shas are `dac04eb0…` (jsonBody) and `78a805b3…` (jsCode).

### Rolling back SR-1b ALONE (rev 4 → rev 3), which IS offered

Unlike revs 1 and 2, rev 3 is a **supported** state: it is the reviewed SR-1 slice, with a correct
N-2 line and simply no "Matched on" line. So SR-1b can be dropped without dropping SR-1:

```bash
# pointer move back to the rev-3 body. Reverts ONLY compile-current-state, and ONLY the N-1a block,
# because rev 4 changed nothing else — proven by the param-hash sweep in the rev-4 table above.
publish_workflow  workflowId=txiPzSxy3Pclsz6v  versionId=48aaa6fd-6ad7-4ef5-a44c-b491888e0130
```

Then assert the re-fetched `compile-current-state.jsCode` sha is `7959776fa7ce…` and
`resolve-entity-http.jsonBody` is still `7ca14cbfd47e…`. ⚠️ This is safe **only while `48aaa6fd`
remains the immediately-preceding version of this clone** — if any other workstream has published
since, that pointer carries their revert too. Check `versionId` first; if the clone has moved,
regenerate instead: comment out the N-1a splice in `build-ccs.js`, `node build-ccs.js`, and PUT the
result with the same file-driven writer (the builder is deterministic, so this reproduces
`7959776fa7ce` exactly).

**Rolling back to rev 1 or rev 2 alone is deliberately NOT offered.** Neither superseded body is
kept in the repo: rev 1 rendered *"so I couldn't narrow by 1."* and rev 2 rendered
*"couldn't narrow by 1.2MM"* out of a part number — restoring either would be restoring a known
defect that a customer can read. The three supported states are **current / rev 4**
(`82707a95…`), **rev 3** (`7959776f…`, SR-1 without SR-1b — the pointer move above) and
**pre-SR** (`78a805b3…`, the script above). If rev 2 must be undone
for a reason other than the N-2 wording, undo the whole slice and rebuild —
`node build-ccs.js` regenerates the current body deterministically from
`compile-current-state.before.js` + `ccs-hunks.js`, so nothing is lost by not keeping the
intermediate.

**A REST PUT always auto-publishes** (LESSONS §55) — there is no draft-only PUT. Never PUT a
body you are not willing to publish, and never PUT a body not derived from a fresh faithful
REST GET of that same workflow.

Whole-workflow rollback (only if something unrelated went wrong):
`publish_workflow` with `versionId: 6cd67cbf-9b68-426d-b742-55b0ac83f039`. Note this reverts the
OTHER in-flight work on the clone too — **prefer the two-leaf revert above**.
