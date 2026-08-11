# REVIEW — auth-unification T3 · respond-* writers (8 nodes, 4 live trigger workflows)

**Date:** 2026-07-22 · **Verdict: APPROVE the four reviewed bodies**, subject to 2 pre-PUT
conditions (§Conditions). **Reviewer performed reads only:** no workflow edited, no gate edited, no
PUT sent, no publish, no execution run, no webhook fired, no redis seeded, no CRM write. Independent
channel throughout: MCP `get_workflow_details` (draft vs `activeVersion`) + local jq/git, plus one
fresh REST GET used solely to reproduce the gate for the leading-dash id.

---

## 0 · Byte identity — this review is valid ONLY for these bytes

All four sha256 and byte counts **re-computed by the reviewer**, matching the task table and the
coder's Deliverable-2:

```
e75ccfac261066a3a633c71d9c06ecea68a742669b7f43773caa459fbb95a844  10282  T3-gVbpRvD19qrafdqMpORkE-body.json
f167f15448acb35ac9c204237bbcafd9eb3fa4982f5823003ed1c4eb1f02683a  12657  T3--WkzJMQZHmsFQm6A2abLJ-body.json
45abae38bd7467a00ba35f0c13cd9bd10d1ebc6f372dc9960c0d08af2cd8f147  16066  T3-eG3AA-TWo17-E1-DlHLnH-body.json
b72b2eccbd2780f7f545d1464d4fbad452f366d64c411da9a0b10c5c6c70b6c0   3430  T3-z2RrHQ6qO9sDbNh2nrn4n-body.json
```

**Any regeneration of any `body.json` VOIDS this approval for that workflow and requires re-review.**
The four are independent; regenerating one does not void the other three. Before each PUT: re-run
that workflow's draft-vs-active diff, re-verify **that file's** sha, send unmodified
(`--data-binary @…`).

---

## 1 · The four drafts — verified via MCP (a DIFFERENT channel than the coder's REST)

MCP `get_workflow_details` per workflow, diffing `.workflow.nodes` (draft) against
`.workflow.activeVersion.nodes` (published), per LESSONS 23.

| workflow | id | `versionId` (draft) | `activeVersionId` | active moved? |
|---|---|---|---|---|
| respond-create-update-contact-system | `gVbpRvD19qrafdqMpORkE` | `2c81a4d5-89a9-444d-a54d-28db98172417` | `c1b801aa-6f4e-493e-a1d9-d12879f878f8` | **NO** |
| respond-close-convo | `-WkzJMQZHmsFQm6A2abLJ` | `ac6a7dd0-39f4-4a0e-af65-fe82196d3064` | `c0f023ff-35f5-4a64-89e9-643ac0f976ca` | **NO** |
| respond-change-assignee-system | `z2RrHQ6qO9sDbNh2nrn4n` | `4d3799c6-ee60-4d98-abfa-c33de95423f7` | `181bc50f-bbc0-42a3-b218-0a6d7a4587ca` | **NO** |
| respond-send-user | `eG3AA-TWo17-E1-DlHLnH` | `84f87337-c903-4023-8fdf-782c1b7417ba` | `d658273c-6f86-48f7-aa15-560d295ccce3` | **NO** |

All eight pointers match the coder's recorded values exactly. These four `activeVersionId`s are the
rollback pointers (§4.10).

Per workflow, draft vs `activeVersion`:

| check | result |
|---|---|
| nodes differing | exactly the named targets, nothing else (**1 / 2 / 2 / 3**) |
| delta per differing node | exactly D1 (`authentication=genericCredentialType`) + D2 (`genericAuthType=httpHeaderAuth`) + D4 (`headerParameters.parameters=[]`); every other node key identical |
| **`activeVersion` still carries the literal `x-api-key`** on all 8 targets | **YES** — `M6Hur6…` present on each published target node ⇒ production bit-for-bit unchanged |
| `onError` preserved | `continueErrorOutput` verbatim on the two SILENT nodes; absent (default `stopWorkflow`) on the six LOUD; `retryOnFail:true` preserved on `save-session-vars` |
| `connections` draft vs active | **byte-identical, all four** |
| `settings` / `name` / `active` | untouched (see §4 for the `binaryMode` strip) |
| stray `parameters.parameters.*` | **none** (LESSONS 32b clear ×4, both draft and body) |
| `pinData` / `staticData` / `meta` / `active` in the body | **not sent** ⇒ preserved by merge |

### Strongest single result — masked residual delta (before.json vs body.json)

For each workflow I projected `T3-<id>-before.json` (the pre-change published REST GET) and
`T3-<id>-body.json` to the body's key-set `{name, connections, nodes}`, sorted nodes by name, and
deleted **only** `authentication`, `genericAuthType`, `headerParameters`, and
`credentials.httpHeaderAuth` from every node, then diffed:

```
gVbpRvD19qrafdqMpORkE   maskedBefore 9903B  maskedBody 9928B   residual = only `"credentials": {}` ×1 (target)
-WkzJMQZHmsFQm6A2abLJ   maskedBefore 11975B maskedBody 12025B  residual = only `"credentials": {}` ×2 (targets)
eG3AA-TWo17-E1-DlHLnH   maskedBefore 15081B maskedBody 15156B  residual = only `"credentials": {}` ×3 (targets)
z2RrHQ6qO9sDbNh2nrn4n   maskedBefore 2748B  maskedBody 2798B   residual = only `"credentials": {}` ×2 (targets)
```

The **only** residual is an empty `credentials:{}` object appearing on exactly the target nodes
(count 1/2/3/2) — the footprint of D3's credential addition showing through the mask (before.json
targets had no `credentials` key). No other node key differs; no non-target node is touched; no
removed lines. ⇒ **each body equals the pre-change live workflow modulo exactly D1/D2/D3/D4 on
exactly the target nodes and nothing else** — covering `id`, `type`, `typeVersion`, `position`,
`onError`, `retryOnFail`, `url`, `method`, `jsonBody`, and `connections`. Byte counts printed so the
check cannot pass vacuously (LESSONS 45 / the T2 near-miss).

### Scope — no CRM-host blind spot

Cross-checked from live: the set of nodes carrying an `x-api-key` header over **all** node types is
exactly these 8; no non-CRM `httpRequest` node exists in any of the four, so the "CRM-host filter
might hide something" question is closed by measurement. D4 targets = 1/2/2/3, summing to the tranche's 8.

---

## 2 · The four bodies

| check | result |
|---|---|
| top-level keys | exactly `connections, name, nodes, settings` ×4 |
| node counts | 7 / 9 / 12 / 3 — match live |
| credential bound | `httpHeaderAuth = {mNsZWyU82NYV58k2, crm-n8n-auth}` on all 8 targets, and on **no other node** (verified per body) |
| **occurrences of the literal CRM key** | **0 / 0 / 0 / 0** (grepped the 32-char literal) |
| residual `x-api-key` string anywhere in body | **0 ×4** |
| `sendHeaders` | `true` preserved on all 8 targets |
| `headerParameters.parameters` on all 8 targets | **`[]`** — and each target carried **only** `x-api-key` before (confirmed in before.json AND in the MCP `activeVersion`, which shows a single-entry array), so exactly one entry was removed and **no second header was silently cleared** |
| `pinData` / `staticData` / `active` / `meta` | **not sent** ×4 (correct; merged not replaced) |

### Collateral credentials — all pre-existing carried (verified in the body bytes)

| workflow | pre-existing carried (type=id) | + new | **expected post-PUT bound-node count** |
|---|---|---|---|
| `gVbpRvD19qrafdqMpORkE` | `Respond.io Trigger`, `Respond.io Trigger1`, `Update a Contact`, `Respond.io Trigger2` (`respondIoApi=OiS59QkzpKfKSdaa`) | 1 | **5** |
| `-WkzJMQZHmsFQm6A2abLJ` | `Respond.io Trigger`, `Assign or unassign a Conversation`, `Update a Contact` (`respondIoApi`) + `Execute a SQL query`, `Execute a SQL query1` (`postgres=ETJL5KoaA1UpkDip`, prod) | 2 | **7** |
| `eG3AA-TWo17-E1-DlHLnH` | `Respond.io Trigger`, `Update a Contact` (`respondIoApi`) + `Select rows from a table`, `Execute a SQL query` (`postgres`, prod) | 3 | **7** |
| `z2RrHQ6qO9sDbNh2nrn4n` | `Respond.io Trigger` (`respondIoApi`) | 2 | **3** |
| **tranche** | **14** | **8** | **22** |

Counts **5 / 7 / 7 / 3** (PUT order) confirmed against the actual node inventory — these are
workflow totals including the non-CRM `respondIoApi` triggers/assign/update nodes and the two
prod-`sorento-crm-db` postgres nodes each on close-convo and send-user. The four `respondIoApi`
bindings are respond.io egress-path credentials (triggers + `Assign or unassign` + `Update a
Contact`); **losing one is a production outage, so the collateral assertion is safety-relevant, not
tidy.** Any of the 14 pre-existing bindings missing after a PUT → immediate rollback of that
workflow. The `postgres=sorento-crm-db` bindings point at prod and are expected for live workflows —
must survive, not "fix."

### `settings` per body

| workflow | live `settings` | body `settings` | stripped |
|---|---|---|---|
| `gVbpRvD19qrafdqMpORkE` | `executionOrder, availableInMCP` | `{executionOrder:v1, availableInMCP:true}` | *(nothing)* |
| `-WkzJMQZHmsFQm6A2abLJ` | `executionOrder, availableInMCP, binaryMode` | `{executionOrder:v1, availableInMCP:true}` | **`binaryMode`** |
| `eG3AA-TWo17-E1-DlHLnH` | `executionOrder, availableInMCP` | `{executionOrder:v1, availableInMCP:true}` | *(nothing)* |
| `z2RrHQ6qO9sDbNh2nrn4n` | `executionOrder, availableInMCP` | `{executionOrder:v1, availableInMCP:true}` | *(nothing)* |

Only `respond-close-convo` carries the OpenAPI-invalid `binaryMode` key; stripping it is correct and
lossless (settings is merged, so `binaryMode:"separate"` survives from storage). No `timeSavedMode`,
`timezone`, or `callerPolicy` anywhere in this tranche. **Post-PUT re-assert `binaryMode ==
"separate"` survived on close-convo.**

---

## 3 · DECISION 1 — `availableInMCP` deviation from T3-design §6 · **CODER IS RIGHT**

The coder kept `availableInMCP` and stripped only `binaryMode`, deviating from T3-design §6's
instruction to also strip `availableInMCP` "per T2 precedent." **Adjudicated definitively from the
actual T2 artifacts:**

- **(a) Is `availableInMCP` schema-valid in a PUT body?** — **YES, empirically.** All four T2
  **PUT bodies kept `availableInMCP:true`** (`T2-*-body.json`), and T2 published without a 400. The
  T2 `after.json` files confirm it survived the publish, e.g.
  `T2-FfmDkEWdt3Bian82-after.json.settings = {executionOrder, availableInMCP:true, binaryMode:separate}`
  — `availableInMCP` present post-publish, with the *stripped* `binaryMode` restored via merge. So
  `availableInMCP` in a PUT body neither 400s nor is lost. T3-design §6's premise ("per T2
  precedent") is factually inverted: **T2 did NOT strip it.**
- **(b) Is keeping it the safer choice?** — **YES.** Both paths are lossless via merge, but keeping a
  schema-valid key sends the bytes T2 actually shipped-and-approved and relies on merge for nothing;
  stripping it would rely on merge to *restore* it. The coder chose the path with fewer moving parts,
  matching validated bytes.
- **(c) Is T3-design §6 wrong?** — **YES, in the one clause "strip `availableInMCP` too."**

**RULING:** the coder's deviation is **correct and ratified.** T3-design §6's instruction to strip
`availableInMCP` is an error and should be corrected to: *strip only OpenAPI-invalid keys
(`binaryMode`, `timeSavedMode`); keep `availableInMCP`, `executionOrder`, `callerPolicy`, `timezone`.*
This governs **T4/T5 too** — carry the corrected recipe forward. (Documentation-only correction; does
not touch the reviewed bytes.)

---

## 4 · DECISION 2 — leading-dash id `-WkzJMQZHmsFQm6A2abLJ` · **inline reproduction FAITHFUL, acceptable for T3**

`assert-auth.sh`'s arg parser (`-*) echo "unknown flag"; exit 2`) rejects the leading-dash id, and
the coder correctly **did not edit the frozen gate**, reproducing G1–G7 inline instead. I
**re-reproduced the gate logic myself** against a fresh independent REST GET of the draft, applying
the gate's exact jq for G1–G4 / G5 / G5b / G6 / G7:

```
== respond-close-convo (-WkzJMQZHmsFQm6A2abLJ)  versionId=ac6a7dd0…  activeVersionId=c0f023ff…
G1-G4:  FAIL conversation-sla-tracking-update      G1=t G2=t G3=false G4=t
        FAIL conversation-sla-event-tracking-create G1=t G2=t G3=false G4=t
G5:     PASS -- no rider
G5b:    PASS -- non-x-api-key headers preserved
G6:     PASS node-set identical ; PASS connections byte-identical
G7:     residual x-api-key: NONE   ;  stray parameters.parameters.*: []  ;  settings binaryMode present in draft
```

This is the **identical signature** to the other three (sole cause `G3=false`, everything else PASS)
— **close-convo passes the same bar**, and the coder's inline reproduction is faithful.

**RULING:** inline reproduction is **acceptable for T3's single leading-dash workflow**; the gate
stays **frozen** during the tranche it judges (standing rule, T1/T2 precedent). **But note the
coverage asymmetry is real and persists post-PUT** — the gate cannot be run on close-convo *after*
the PUT either, so the tester **must reproduce the gate inline post-PUT for `-WkzJMQZ…`** (the exact
jq is in this review's evidence and in the coder's note), not skip it. **Add `--` end-of-options (or
leading-dash id) support to the deferred `assert-auth.sh` micro-change list** (its own review, after
T3) — carried alongside the two T2-review deferred items (phantom-exclusion fix — already applied and
confirmed below — and the G5/G5b fail-open fix — already applied and confirmed below).

**Gate hardening from T2 — confirmed applied.** Running the live gate on the three non-dash
workflows shows **no phantom `EXCLUDED` block** when `--exclude` is absent (T2 Condition 1 fixed), and
G5/G5b now print the compared-node population (7 / 3 / 12) with an explicit "compared 0 nodes ⇒
FAILURE" guard (T2 §11 fail-open fixed). Both defects the T2 review flagged for repair-before-T3 are
repaired in the instrument.

---

## 5 · Silent vs LOUD — RE-DERIVED INDEPENDENTLY from MCP `connections`

Derived by the reviewer from each workflow's `connections` (not inherited, not read off `onError`
alone):

| # | node · workflow | `onError` | error output `main[1]` wired? | verdict |
|---|---|---|---|---|
| 1 | `contact-create-update` · create-contact | `continueErrorOutput` | **NO** (`main` len 1 → `Call 'findcontact'`) | 🔇 **SILENT** |
| 2 | `conversation-sla-tracking-update` · close-convo | absent (`stopWorkflow`) | n/a | 🔊 LOUD |
| 3 | `conversation-sla-event-tracking-create` · close-convo | absent | n/a | 🔊 LOUD |
| 4 | `conversation-assignee-update` · change-assignee | `continueErrorOutput` | **NO** (`main` len 1 → `sla-event-create`) | 🔇 **SILENT** |
| 5 | `conversation-sla-event-tracking-create` · change-assignee | absent | n/a | 🔊 LOUD (unreachable if #4 401s) |
| 6 | `conversation-sla-tracking-update` · send-user | absent | n/a | 🔊 LOUD |
| 7 | `conversation-sla-event-tracking-create` · send-user | absent | n/a | 🔊 LOUD |
| 8 | `save-session-vars` · send-user | absent, `retryOnFail:true` | n/a | 🔊 LOUD |

**Two SILENT nodes: `contact-create-update` and `conversation-assignee-update`** — both Family A,
both the first/only CRM writer in their workflow, so on a 401 the whole execution reports `success`
and `search_executions(status:["error"])` is **blind** to both. Confirmed.

**Sharpest point RATIFIED — `respond-change-assignee-system` goes fully silent on a 401.** From
`connections`: `Respond.io Trigger → conversation-assignee-update → conversation-sla-event-tracking-create`.
#5 (LOUD) sits *downstream* of the SILENT #4; a 401 on #4 dead-ends its unwired `main[1]`, so #5
never runs, no error is raised, and **assignments silently stop while the execution list stays
green.** Treat change-assignee as a silent-failure workflow — which is exactly why it is promoted
**last** (§9).

`save-session-vars` is confirmed LOUD from `connections` (fed `Respond.io Trigger →
compile-current-state → save-session-vars`; `onError` absent = `stopWorkflow`, plus `retryOnFail`) —
its auth failure is self-announcing.

---

## 6 · Credential-inheritance argument (P1) — checked PER NODE, not on trust

The gate proves P2 (static binding) per node; P1 (the credential resolves 2xx at runtime) is
**inherited from measured post-conversion executions on a shared dependency**, not re-provoked. I
verified the shared-dependency claim endpoint by endpoint:

| # | node endpoint | family | already-measured proof of the SAME dependency | verdict on inheritance |
|---|---|---|---|---|
| 1 | POST `/external/respond-contacts` | A (`get_external_api_user`) | T0 exec 9456211 (GET `/external/conversation-variables`, 2xx) — different path, same `Depends(get_external_api_user)` | **sound (deduction on shared dep)** — weakest link; see note |
| 4 | POST `/external/conversation-assignee` | A | same as #1 | sound; also gets ~3/h organic `updated:true` corroboration |
| 8 | PUT `/external/conversation-variables/{id}` | A | T0 exec 9456211 is **the same path** (GET on the same resource) | **strongest** — same-endpoint |
| 2,3,5,6,7 | `/sla-management/...` (PUT tracking, POST event-logs) | B (`require_module_enabled_with_api_key("sla")` + `get_current_user_or_api_key`) | T2 exec **9471108** (`get-due-escalations` = `{"status":"success","count":0,"items":[]}`, `error` absent) — proves the key is **enabled for the "sla" module** | sound |

**Every T3 node's endpoint shares a credential dependency with an already-measured 2xx.** Node 8 is
same-endpoint (strongest). Nodes 1 and 4 rest on the uniformity of `get_external_api_user` across the
external router — a documented architectural fact (auth is enforced at the dependency, not per
handler), which is a legitimate deduction, **but it is the tranche's weakest inheritance link** and is
correctly recorded so:
- `contact-create-update` (#1) — **UNVERIFIED-by-positive-dynamic-proof** (silent + ~0 traffic);
  auth-covered by P1+P2, corroboration best-effort, **never provoke.**
- `conversation-assignee-update` (#4) — Family-A inherited, and its ~3/h organic reassignment traffic
  will yield a positive `updated:true` 2xx within ≤1 staffed day, dynamically corroborating the
  Family-A deduction. `updated:true` is the ONLY proof (a legitimate 404 "no SLA tracking" is
  structurally indistinguishable from a 401 at the workflow level).

This is P1(measured) + P2(gate), **not** clean-static-diff ⇒ pass (LESSONS 54). Accepted.

---

## 7 · G7 census — coder's conclusion **RATIFIED**

G7 is **draft-measured** (REST `GET /workflows` reads drafts); the coder's MCP edits already stripped
`x-api-key` from all 8 T3 drafts, so a census **right now, with nothing published, already reads 5.**
G7 cannot distinguish "drafted" from "published" and is **not** promote evidence — published-state
evidence is `versionId == activeVersionId` **plus G3=true** in the gate. Ratified.

Post-T2 residual = **13** (draft-measured), decomposing as T3 (8) + T4 `sub-human-intervention` (3) +
T5 `sorento-consume-main` (1) + T1b `system-upload-attachments` (1). T3 converts **8 → 0** across its
four workflows (send-user 3 + change-assignee 2 + close-convo 2 + create-contact 1). **Expected
instance-wide G7 after T3 = 13 − 8 = `5`**, residual = **T4 (3) + T5 (1) + T1b (1)**. The binding
rule's testable-post-PUT half is only "must not rise, and must read 5"; the "must fall by exactly the
node count" half is consumed at draft time. Per-workflow residual **NONE ×4** confirmed by the gate.

> Improvement carried from T2-review §7 (recorded, not blocking): from T3 on, G7 could be measured
> against MCP `activeVersion` to restore a *published-state* metric. Out of this task's scope; note it.

---

## 8 · Secret hygiene — verified, not trusted

- `git check-ignore -q` per file: all four `body.json`, all four `before.json`, all four
  `nodes-before.json` → **IGNORED** (12/12).
- Repo-wide scan with `find . -path ./.git -prune -o -type f -print | xargs grep -l <key>`
  (**`grep -rl` false-negatives in this repo** — used the find form): **26** files contain the literal
  key; **all 26 are gitignored** (T0–T3 backups + pre-existing `scratchpad/*.json` +
  `tests/reviews/backups/promote-20260716/...`). **0 tracked files carry it.**
- `git log -S<key> --all` → **empty. The key was never committed.**
- **0 occurrences of the literal in any of the four `body.json`.**

---

## 9 · Parked-draft hazard — **24 hours**, ratified

Four armed, credential-less drafts on **ACTIVE, respond.io-trigger-subscribed** workflows that fire on
real staff/customer activity. Any publish of any of them, for any reason, ships credential-less nodes
into a staff-facing path on the next trigger. T2's 24 h transfers (self-firing workflows); T1's 72 h
does not.

**Maximum parking window: 24 h from 2026-07-22, or until any of the four `activeVersionId`s moves,
whichever is first.** The user publishes in the UI concurrently, so:

**Roll back (§4.10 — no publish needed, nothing is published) immediately if:**
1. Any of the four must be published for an unrelated reason.
2. Any `activeVersionId` moves off its recorded value → **re-baseline that member, do not reconcile.**
3. Any `versionId` moves off its recorded draft pointer → **that `body.json` is VOID**; regenerate +
   re-review that workflow only.
4. The 24 h window expires.

**Do not park half-done (binding).** If PUTs 1–2 land and 3–4 do not, two workflows are converted and
two carry armed drafts on self-firing paths — the worst state. Complete all four or roll back the
landed ones. **One staffed session, sequential, gate between each.**

---

## 10 · PROMOTE CHECKLIST — user-gated, ordered, per workflow

Guard scaffolding is already stripped — the reviewed bodies ARE the promote bytes (the PUT is the
promote; there is no post-PUT-review stage). No business-logic diff to re-apply to any live spine;
T3 is auth-plumbing only.

**Before starting (once):**
- **A.** Confirm a staffed window with the four rollback pointers to hand:
  `c1b801aa-…` / `c0f023ff-…` / `d658273c-…` / `181bc50f-…`.
- **B.** Correct T3-design §6 to keep `availableInMCP` (Decision 1) — carry the recipe into T4/T5.
- **C.** Note the leading-dash inline-gate requirement for close-convo, pre- and post-PUT (Decision 2).

**Then, per workflow, in this order — create-contact → close-convo → send-user → change-assignee last
(ascending blast radius; the SILENT change-assignee last):**

`gVbpRvD19qrafdqMpORkE` → `-WkzJMQZHmsFQm6A2abLJ` → `eG3AA-TWo17-E1-DlHLnH` → `z2RrHQ6qO9sDbNh2nrn4n`

1. **§4.6 re-diff immediately before the PUT.** HALT if `activeVersionId` ≠ that workflow's recorded
   pointer; or `versionId` ≠ its recorded draft pointer; or the differing-node set is not exactly its
   1/2/3/2 targets; or any delta exceeds D1/D2/D4.
2. **Re-verify that file's sha256 + byte count** against §0. Mismatch → **stop; that workflow's review
   is void.**
3. **One PUT, bytes unmodified:** `--data-binary @T3-<id>-body.json`. Binds D3 and publishes in one
   op. Do not hand-edit, re-serialise, or pipe through `jq`.
4. **Capture** `GET → T3-<id>-after.json` (gitignored — verified).
5. **Collateral assertion (LESSONS 55):** expected bound-node count **5 / 7 / 7 / 3** (PUT order).
   Confirm every pre-existing binding survives — all four `respondIoApi=OiS59QkzpKfKSdaa` and the
   `postgres=ETJL5KoaA1UpkDip` pairs. **Any loss → roll back that workflow immediately.**
6. **Preservation:** on close-convo, `binaryMode == "separate"` survived; on all,
   `pinData` / `staticData` / `name` / `active` / `connections` / node-id set unchanged;
   `versionId == activeVersionId`.
7. **Gate:** for the three non-dash ids, `./assert-auth.sh <id> T3-<id>-before.json` (no `--exclude`)
   → **exact match** to the pre-declared post-PUT block (`RESULT: PASS`, G5/G5b pop 7 / 12 / 3, **no
   phantom EXCLUDED line**). **For `-WkzJMQZ…`, reproduce the gate inline** (the jq in §4 /
   coder's note) → same PASS signature (pop 9). A raw `./assert-auth.sh -WkzJM…` will print
   `unknown flag` — expected; do not edit the gate.
8. **Rollback trigger:** any failure at 5–7 → `publish_workflow` that workflow's prior
   `activeVersionId`. Single pointer move; expect a dirty draft afterwards.
9. **Gate to the next PUT:** static steps 5–7 green on the current one before starting the next.

**Post-PUT dynamic acceptance (tester, §Deliverable-6 — assert `runData` PRESENCE, never execution
status; the two SILENT nodes report `success` on a 401):**
- LOUD nodes (2,3,5,6,7,8) — arm a `status:error` rollback-watch on that workflow id + best-effort
  positive 2xx in-window. Fastest verifier is `save-session-vars` (every reply, < 1 staffed hour).
  Assert the named domain key present (`session_vars`+`respond_io_id`; `current_tier`;
  `event_type`+`sla_tracking_id`) AND `error` absent. **`current_tier` can be `1` — assert presence,
  not truthiness.**
- `conversation-assignee-update` (#4, SILENT) — **`updated:true` is the ONLY proof** (404 ≡ 401 at
  workflow level); positive proof arrives ≤1 staffed day at ~3/h; no `status:error` backstop.
- `contact-create-update` (#1, SILENT) — record **UNVERIFIED-by-positive-dynamic-proof** (rare
  traffic); auth-covered by inheritance; corroboration best-effort; **never provoke.**
- **Do NOT provoke** any of these four workflows via `execute_workflow` — a manual run does real CRM
  writes and (close-convo path) a real `sorento-sub-respond-sendmsg-respond` send. Observational only.

**Then separately:** the `assert-auth.sh` micro-change — `--` / leading-dash support (new, Decision
2) — its own review, after T3, before T4.

---

## 11 · Pre-existing warnings — untouched, NOT "fixed" (LESSONS 13)

Recorded so the tester does not misattribute post-PUT:
- `respond-close-convo › Execute a SQL query1` (postgres, not a target, not touched):
  `MISSING_EXPRESSION_PREFIX` — `query` embeds `'{{ $('Respond.io Trigger')…phone }}'` without an `=`
  prefix. Pre-existing, in the active version.
- `respond-close-convo › Assign or unassign a Conversation` uses `onError:continueRegularOutput`
  (emits a fake success item — a failed assignment looks like success). Pre-existing, outside auth
  scope, untouched.
- The `HARDCODED_CREDENTIALS` warnings on all 8 targets are **gone** in the drafts — the intended
  signal.

---

## Conditions (documentation-only; do NOT touch the reviewed bytes)

1. **Correct T3-design §6** to keep `availableInMCP` and strip only `binaryMode`/`timeSavedMode`
   (Decision 1). Do before applying the recipe in T4/T5. The four T3 bodies already implement the
   correct form.
2. **Add `-- ` / leading-dash id support to the deferred `assert-auth.sh` micro-change list**
   (Decision 2), alongside the T2 items — the gate stays frozen for T3; the tester reproduces it
   inline for close-convo both pre- and post-PUT.

Neither condition affects the four `body.json`. **The bytes are approved as they stand.**

---

## Safety

**No egress originated by this change or by this review.** All 8 converted nodes are CRM HTTP calls;
the change alters **how they authenticate**, never **whether or when they fire**. The
`Assign or unassign` / `Update a Contact` / `sorento-sub-respond-sendmsg-respond` egress-adjacent
nodes are byte-identical in every body (proven by the masked residual delta) and their `respondIoApi`
credentials are carried and asserted at checklist step 5. No assignment, reassignment, SLA write, PIC
comment, conversation-variable write, contact mutation, or CRM create was originated. The SILENT
`conversation-assignee-update` and the whole assignment path were **not** provoked and must not be.

**Reviewer actions were reads only:** 4 × MCP `get_workflow_details`, 3 × live `assert-auth.sh` (REST
GET), 1 × REST GET for the leading-dash inline gate, and local jq/git. No PUT, no publish, no
execution, no webhook, no redis, no CRM write.

**Not touched:** the live spine `9qVyfUxmRQqrpGRMDLRuz`, the clone `txiPzSxy3Pclsz6v`, the fork
`vUfFUDjLAuMaeQE6`, the already-converted T0–T2 workflows, and every other workflow on the instance.
**All four `activeVersionId`s unchanged — production is bit-for-bit what it was.**

---

# VERDICT: **APPROVE** the four reviewed bodies, subject to Conditions 1–2.

Zero egress re-confirmed. Promotion remains **user-gated**: four PUTs, four independent approvals,
four independent reverts. The reviewer authorises; the reviewer does not promote.
