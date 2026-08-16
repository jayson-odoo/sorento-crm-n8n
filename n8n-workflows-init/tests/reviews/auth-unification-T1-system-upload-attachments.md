# REVIEW — auth-unification T1 · `system-upload-attachments` `_NbFU3cCoEQwPSbvn14vV`

**Date:** 2026-07-21 · **Verdict: APPROVE the reviewed bytes**, subject to 3 pre-PUT conditions
(all now closed — see §Conditions). Reviewer performed reads only: no workflow edited, no PUT sent,
no execution run.

## Byte identity — the review is valid only for these bytes

```
file    n8n-workflows-init/tests/diffs/auth-unification/T1-_NbFU3cCoEQwPSbvn14vV-body.json
sha256  f95062be7e4a0a5e859b564448709373308c38bb3e852a69b1bbd79464d6c995
size    84287
```

**Any regeneration of `body.json` VOIDS this approval and requires re-review** (§4.7 steps 2–4).

## What was independently confirmed

Verified through a **different channel than the coder** — MCP `get_workflow_details`
(`.workflow` vs `.workflow.activeVersion`) plus a REST `before.json` diff.

| check | result |
|---|---|
| `versionId` / `activeVersionId` | `a28d4ee4…` / `b0e3dbeb…` — active **unchanged** |
| node `parameters` differing draft vs active | **exactly 21**, exactly the named targets |
| other node fields (onError/retryOnFail/position/type/typeVersion/disabled) | **none differ** |
| `connections` | byte-identical, `e88557778846ac2d002ecffb04a973219a7ad6d458c92d8b604d640cbd453cd9` |
| `integration-log-update3` | byte-identical (`312bd9a2…`) — T1 left it alone |
| stray `parameters.parameters.*` | none (LESSONS 32b clear) |
| `before.json` vs `body.json`, masking the 4 intended fields | residual delta **EMPTY** |

**Strongest single result:** `body.json` nodes == the live draft nodes **modulo credentials only**.
The PUT body is provably the current draft plus D3 and nothing else.

**Body:** top-level keys exactly `connections, name, nodes, settings`; 50 nodes; 21 bound to
`httpHeaderAuth={mNsZWyU82NYV58k2, crm-n8n-auth}`; **0 occurrences of the literal key**;
`binaryMode` stripped (safe — live settings key set is identical to T0's clone where the same
`del()` was proven, and `settings` merges rather than replaces); `pinData`/`staticData`/`active`
not sent, therefore preserved.

**Scope has no blind spot:** 23 httpRequest nodes, 22 CRM. The 23rd (`download-packing-list`)
targets an S3 URL with no headers and no auth — correctly out of scope, and not leaking the key.

**Secret hygiene, verified not trusted:** `git check-ignore -v` per file; `git log -S<key> --all`
is **empty — the key was never committed**. Repo scan used
`find . -path ./.git -prune -o -type f -print | xargs grep -l` because **`grep -rl` returns false
negatives in this repo**.

## Conditions (all closed 2026-07-21)

1. **BLOCKING — plan §3.3 still carried the disproven "REST GET redacts / PUT wipes" claim and the
   instruction "REST is READ-ONLY… No exceptions", which forbids the exact action this promote
   consists of.** Was a T0 blocking condition, not closed before T1 ran. **CLOSED** — §3.3 rewritten
   to LESSONS 55's rule. *Process note: T1 proceeded with this open. The work is verifiably correct
   so it is not voided, but T2 must not repeat that.*
2. **Group B acceptance strengthened. CLOSED** — §5.2 now mandates the 3-part conjunction including
   the literal `message` value. The collision is on the key, not the value.
3. **Post-PUT gate acceptance = exact expected-output match, not the `RESULT` line. CLOSED** — §5.1
   amended; supersedes T0 condition 7.

## Rulings

- **Gate FAIL is correct here**, and the coder was right not to edit the gate mid-tranche — editing
  the assertion instrument during the tranche it judges destroys its independence.
- **§2 CORRECTION 3 over-generalisation CONFIRMED and now bounded.** All four `system-upload-attachments`
  business writers have `main[1]` **wired** to fail-status callbacks, so a 401 mislabels a document
  rather than vanishing. The reviewer discharged the open caution: `contact-create-update`,
  `get-due-escalations`, `conversation-sla-tracking-escalate1`, `conversation-assignee-update` are
  **genuinely silent** (`main` length 1). **The over-generalisation is confined to this workflow;
  T2/T3's list is correct.** Keep the amendment's method (derive from `connections`), drop the caution.
- **`integration-log-update11` 0 inbound CONFIRMED** — the only one of 22 at zero. Static-only.
- **Bonus:** `schedule-sla-policy-checker › Assign or unassign a Conversation1` uses
  `continueRegularOutput` — emits a fake success item, so a failed assignment is indistinguishable
  from a successful one. Not httpRequest, outside auth scope, but belongs in the CORRECTION 3 discussion.

## Parked-draft hazard — 72h limit

The draft's 21 nodes are non-functional (D1+D2, no credential), so **any publish of this workflow
for any reason ships them**. Sharper hazard: a UI save silently mutates the reviewed artifact while
`body.json` on disk goes stale.

**Limit: 72 hours, or until `activeVersionId` moves off `b0e3dbeb…`, whichever is first.**
Roll back (§4.10) if: (1) this workflow must be published for an unrelated reason; (2)
`activeVersionId` moves — **re-baseline the tranche, do not reconcile**; (3) `versionId` moves off
`a28d4ee4…` — **`body.json` is void**, regenerate and re-review; (4) the window expires.
Rollback is per-node from `T1-…-nodes-before.json`; nothing is published, so no pointer move needed.

## PROMOTE CHECKLIST — user-gated, ordered

1. **§4.6 re-diff immediately before.** HALT if `activeVersionId != b0e3dbeb-d4a3-42bd-9ef6-3771767af41c`,
   or `versionId != a28d4ee4-daf7-4c0c-8622-23eacdb16dc1`, or the differing set is not exactly the
   21 named nodes, or any delta exceeds D1/D2/D4.
2. **Re-verify sha** = `f95062be…995`, size `84287`. Mismatch → **stop, review void.**
3. **One PUT, bytes unmodified:** `--data-binary @T1-_NbFU3cCoEQwPSbvn14vV-body.json`. Binds D3 and
   publishes in the same operation. Do not hand-edit, re-serialise, or pipe through `jq`.
4. **Capture** `GET → T1-…-after.json` (gitignored).
5. **Collateral assertion (LESSONS 55).** Expect **29 bound nodes** = 8 pre-existing
   (`googlePalmApi=fr3jSAU1JR6Ioobn` ×7, `pdfapihubApi=It527CvGZPUoKIgV` ×1, **all still bound**)
   + 21 × `httpHeaderAuth`. **Any of the 8 missing → rollback immediately.**
6. **Preservation:** `settings.binaryMode == "separate"` (proves merge-not-replace); `pinData` 2 keys;
   `staticData` unchanged; `name`/`active` unchanged; `connections` hash `e885577…`; node-id set
   unchanged; `versionId == activeVersionId`.
7. **Gate:** `./assert-auth.sh _NbFU3cCoEQwPSbvn14vV T1-…-before.json` → match the exact expected
   output (one G1–G4 FAIL row = `integration-log-update3` all-false; zero other FAIL rows; 21/21
   green **including G3=true**; exactly one `HEADER-DRIFT`, same node; residual == that node; G5/G6
   PASS; `draft == active`). G7 census `53 → 32`.
8. **Rollback trigger:** any failure at 5–7 → `publish_workflow` prior `activeVersionId`
   **`b0e3dbeb-d4a3-42bd-9ef6-3771767af41c`**. Single pointer move. Expect a dirty draft afterwards.
9. **Tester §5.2.** Group A = real dynamic proof (`shipment` / `attachment_id` / `form` / `promotion`).
   Group B = the amended 3-part clause, recorded as supporting evidence with the status-semantics
   caveat. Record `integration-log-update11`, `-promotion-fail`, `-download-fail`,
   `-packinglist-ai-fail` as **UNVERIFIED** — never inferred from a clean static diff (LESSONS 54).
   Assert per-node `runData`, **never** execution status.
10. **Post-promote watch:** a spike in failure-status `integration_logs` rows means the writers are
    401ing into their fail callbacks. Pair with `search_executions(workflowId, status:["error"])`.
11. **Then separately:** fix `assert-auth.sh` with `--exclude` (own review) → **then** T1b (own gate).

## Minor, non-blocking

- Diff note renders `retryOnFail` as **`false`** for 4 nodes; actual state is the key being
  **absent**. Behaviourally identical, correctly preserved, but "absent" ≠ "explicitly false".
- Coder's `setNodeParameter` ×3 deviation from §3.3's `replace:true` is **sound and now ratified in
  §3.3** — writing the whole leaf achieves the array removal without re-transmitting multi-KB
  `jsonBody` expressions (LESSONS 25 hazard).

**Safety:** this workflow has no respond.io egress — no message send, no assignment/SLA/PIC write,
no conversation-variable or contact write. `activeVersionId` unchanged; production is currently
bit-for-bit what it was.
