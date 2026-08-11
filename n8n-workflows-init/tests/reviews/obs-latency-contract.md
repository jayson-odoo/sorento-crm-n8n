# Review — obs-latency-contract (CRM observability slice S4)

**Verdict: APPROVE.** Reviewed 2026-07-21. Zero egress independently re-confirmed. Promote
diff is minimal and correct. Two required harness follow-ups + one required promote-procedure
rule; none block.

Artifacts: clone `txiPzSxy3Pclsz6v` @ `34aedb9f`, `sub-sendmsg-OBS` `sJI3DbsLCG01JfRs`,
`sub-respond-save-message-redis TEST` `tWm5DYLxfypmVC1T`.
C5 (`X-Source: n8n` on `redis-consume-queue-mongo` @ `7ee8307f`) already live. C6 dropped.

## Independently verified (not taken on trust)

| Claim | Result |
|---|---|
| Live spine draft==active except one node | Confirmed — only `97e84805` (`send-transcript-confirm`), node-ids 101/101, connections byte-identical |
| `if-message-is-audio`[1] → save2 already on live | **Confirmed present.** Live [1] fans to save2 + `get-session-vars`; [0] empty |
| C1 blob delta minimal | Exactly 3 lines: `sent_at` rewritten, `+message_id`, `+turn_id` |
| 8 live callers → `aoydkG1`, none carry turn_id | Confirmed; set matches A5 |
| Clone: 8 callers carry `turn_id={{ $execution.id }}` | Confirmed |
| Sink isolation | `list:"sorento-respond-message-TEST"` literal; clone JSON has 0 refs to `UrETd-` or bare prod list |
| Caller #1 unreachable | Confirmed — sole inbound fed only by error outputs |
| Prod-delta attribution | Confirmed decisive (below) |
| `rysSPgUssLDf6xJc` vs `Fss5aAaXthJSWpZCgKiKR` | Nodes incl. node IDs and connections identical; only delta inert `settings.binaryMode` |

**Could not verify:** MCP GET redacts credentials on every node. The `Send a Message` →
`sorento-api` binding and G3 (`Postgres Chat Memory1` → `n8n_test-db`) are coder-asserted and
unverifiable from workflow JSON.

## Contested points

**1. Safety-protocol substitution — sound for this cycle, NOT acceptable as standing protocol.**
Barrier 1 is genuinely unimplementable (`pinData` is a `test_workflow` arg consumed in the same
atomic call; `update_workflow` has no pinData op). The substitute is well-constructed and the
topology it rests on was verified: `Send a Message` is fed only by `Loop Over Items`[1], so on a
quick_reply-non-empty input it is structurally unreachable — OBS-6 was a true zero-exposure probe,
and exec `9391685` is real evidence pins are honoured in that call shape.

But it proves *pins were honoured on that call*, not *will be on the next*. No persisted artifact
to assert against; the guarantee is only ever re-established after the fact. A typo'd node key in a
later pinData map silently doesn't apply, leaving only "437264483 is the user's own phone" — a
mis-send, not a contained failure. The credential redaction sharpens this: an invisible credential
is exactly what you should not gate behind a runtime-only assertion.

**Standing protocol should be the structural fix (H2), which is strictly better than pinning:**
remove the credentialed `Send a Message`, re-add a Code node **keeping the exact name**, emitting
`{messageId: <synthetic>}`. `$('Send a Message').item.json.messageId` then resolves in the real
node context (full fidelity — the reason option (c) was rejected in §A6) with no credential in the
graph. Removes the hazard instead of gating it.

**2. S7 — finding accepted, attribution accepted as decisive, replacement accepted.**
Consumer exec `9391897`'s `Redis1` read `{"sorento-respond-message": 2}` mid-run against a 5s
Schedule Trigger. An equality invariant on a shared, continuously-drained list is unsupportable:
false-positive prone (it tripped) and false-negative prone (write at T, drained at T+3s, reads back
equal). **A gate that can report PASS while a prod write occurred is worse than no gate — it
manufactures confidence.**

Attribution confirmed, not accepted on trust. Popped blob at `9391897`:
`{"contact_id":"445239415", … ,"type":"incoming"}` — no `message_id`, no `turn_id`. It rests on
**structural impossibility, not timing**: post-C1 clone blobs emit both keys unconditionally, and
every harness blob carries 437264483 or 457216562. Fails both discriminators independently.

Replacement in UAC.md §0 requires two tightenings: (a) a non-zero prod delta **halts** pending
attribution — binding, not discretionary; (b) if the consumer execution cannot be retrieved the
delta is **UNATTRIBUTABLE → FAIL**, never inconclusive-pass.

**3. Coverage deviation (F7) — acceptable; #1 needs no other covering.** Caller #1 is a
failure-notification sender by construction (inbound only from error outputs); reaching it needs an
induced sub-workflow error and the LLM route violates the declared `deterministic` scope. Caller #5
(`If5`[1], no-access path) is like-for-like, and C4's change is uniform and branch-independent —
one added key, identical text, on all 8. Worked dynamically on three different callers; all 8
re-verified statically. Deviating on discovered-impossibility grounds with a documented equal-
reachability substitute is correct behaviour, not a gap.

**4. Egress log lies (F8) — does not block, not in the promote diff, but fix it.**
`guard-h-record` is clone-only (live's [1] fans to exactly save2 + `get-session-vars`). The defect
is worse than double-counting: it emits `"kind":"would_log"` — the harness's word for *blocked
before acting* — about a call that now genuinely executes, and its `target` names
`redis:sorento-respond-message->mongo`, the exact string a future auditor greps to check whether
prod was touched. No safety impact, but the egress log is the primary evidence artifact for every
§0 sign-off; a log that says "blocked" about a call that ran trains the next reviewer to discount
it. Prefer deleting the node outright — the real call now produces better evidence than the guard
note ever did.

**5. Promote diff purity.** See checklist. **Highest-consequence mistake available on this
promote, flagged by nobody else:** the clone's caller `workflowInputs.value` sets differ from
live's — every clone caller carries `is_test: true` and `test_run_id`. Copying the clone's object
wholesale (or deep-merging via `updateNodeParameters`) injects `is_test: true` into live →
`test-guard` goes TRUE on production traffic → **every reply recorded to redis and never sent.
Total outage of the bot's reply path.** Add exactly one leaf key per node via `setNodeParameter`.

## F5 — proactive save crashes on `contact.phone`

Confirmed pre-existing; C3 does not introduce it; does not block. Live callers #5/#6 pass no
`contact`; live's blob dereferences `contact.phone`/`firstName`/`lastName` unguarded. C3 adds
`turn_id` (top-level key) and rewrites `sent_at` (reads `Send a Message`) — neither touches
`contact`. Crash at exec `9392251` fired on pre-existing lines.

Sharper framing than "backlog": **outgoing rows are silently missing for every send whose caller
passes no `contact`** — #5 (no-access), #6 (transcribed-message), #9 (rate-limit). The CRM's SLA
denominator is *already* incomplete on those three paths, directly material to the observability
work that commissioned this change. Tell the CRM side. Fix is one line × 3 keys × 2 blobs but is a
live-sub edit → its own gated change (H4). Recommended as the immediate next change.

**F6** (turn_id absent from the save-calls' `workflowInputs.value`): inert — `UrETd`'s Redis node
forwards only `{{ $json.data }}`. Leave the asymmetry; tidying during a promote is how unreviewed
deltas ship.

## PROMOTE CHECKLIST (user-gated)

**P0. Backup.** Prior versionIds: spine `e26437e5-…` (active `6a0a0a5c-…`), sendmsg
`8cf1b465-…`, save sub `485413d5-…`. Capture changed node bodies first (LESSONS §25).

**P1. `UrETd-jm46tFj3Xw7w8vL`** — add `{name:"turn_id", type:"any"}` before `data`. Publish.
**Must be first** — C1b passes an input the sub does not yet declare (LESSONS §37).

**P2. `aoydkG1dbItXR5jXFEQsP`** — C2 (**untyped** `turn_id` input; F4 settled this at exec
`9392400`, renders JSON `null` — do not "improve" to `type:"any"`) + C3 on both `data` blobs.
Do not touch `workflowId` or `test-guard-record`. Publish. Sub before spine.

**P3. RE-RUN THE SPINE DRAFT-VS-ACTIVE DIFF IMMEDIATELY BEFORE PUBLISH** (V-OBS-g). Expected:
101/101 node-ids, connections byte-identical, exactly one node differs (`97e84805`, schema-hint
only). **Anything else → HALT and escalate** (someone edited the spine in the UI; LESSONS §24).
Not substitutable by this review — the check is only valid at the moment of publish.

**P4. `9qVyfUxmRQqrpGRMDLRuz`** — C1 blob + `turn_id` input on save2 + `turn_id` on the 8 callers.
- **PARAM-ONLY. Zero connection operations.** The `if-message-is-audio`[1] edge already exists,
  and the clone's [1] fans to three nodes vs live's two — the clone does NOT mirror live here.
- **One leaf key per caller via `setNodeParameter`. Never copy the clone's `workflowInputs.value`.**
- Do not touch `workflowId` on save2. Do not carry save2's `position` or the `schema` descriptors.
- sha-verify draft pre-publish, active post-publish; auto-revert to P0 versionId on mismatch.

**P5. Do not open or publish `sorento-main` (`NwMOBEQ1NW7LVky5`).** Caller #9 is deliberately
turn_id-free; its `in-failover?` draft divergence stays harmless only while untouched.

**P6 (OPTIONAL).** Repoint live spine's `Call 'sub-get-results'` + `probe-incoming` from
`rysSPgUssLDf6xJc` to `Fss5aAaXthJSWpZCgKiKR`. Verified zero-behaviour-change (identical nodes incl.
node IDs, identical connections, only inert `binaryMode` delta); credential parity not readable via
MCP but `Fss5aAaXthJSWpZCgKiKR` is executing successfully in production now (exec `9393113`), which
closes that empirically. Two connection-target edits — the one exception to P4's param-only rule,
so do it as a separate explicit op or defer to its own change.

**P7. V-OBS-i — RESTORE THE CLONE.** Repoint the clone's 8 sendmsg callers back to
`ublq9nSlrpz63xan` (`sub-sendmsg-CHAT`) or the chat console stays broken. Republish. Note that fork
is still stale vs live (no quick_reply logger) — reconciling it is a separate item.

**P8. Post-promote verification.** One live turn: incoming CRM row carries `message_id` + `turn_id`,
paired outgoing row carries the same `turn_id`, `sent_at` messageId-derived.

## Required follow-ups (not promote gates)

- **H1.** Replace UAC.md §0 S7 with sink-delta + payload attribution, incl. both tightenings.
- **H2.** Structurally safe sub-level `is_test:false` testing — name-preserving Code-node stand-in
  for `Send a Message`. Required before the next such campaign.
- **H3.** Reconcile or delete `guard-h-record` on the clone.
- **H4.** Gated change: guard `contact?.phone` in both sendmsg save blobs; tell CRM that callers
  #5/#6/#9 produce no outgoing row.
- **H5.** Regenerate `tests/cases/*.json` against the real 4-level shape.

**Docs (V-OBS-h) confirmed landed.** "5 orphaned + 1 sinked" is correct; the build spec's "4 + 1"
is the arithmetic error. Do not "fix" the docs back to the spec.
