# access-tier build manifest — tier-only access ask (plans/access-tier-ask-plan.md)

Coder build snapshot, 2026-08-11. Targets are the PROMO-PICKER **forks only** — live spine
`9qVyfUxmRQqrpGRMDLRuz` and live parser `XTODTw-dJcV0uRdC056hG` were **not touched**.

## versionIds (rollback = publish the *before* id)

| workflow | pre-build (full rollback) | round 1 (UAC: DO-NOT-PROMOTE) | round 2 — D9/D10/D11 (**current, ACTIVE**) |
|---|---|---|---|
| fork spine `RnpxEnAV3g20MmKj` | `4f2df612-3ae8-4ac8-a695-ea4c698d30f1` | `407cbfb7-48e6-4793-9889-b933458b442b` | `bba611fa-e8c9-469f-abe3-bc5d64011a94` |
| fork parser `RJ326g9dwe3bTWyf` | `1f784ae4-8fcd-401d-ac4d-2e53fa0af95c` | `7c5ff7fd-9cb1-427e-82d4-8556311f4807` | `668cd772-fb72-468f-810e-3aa2dccb5cc4` |

Rollback commands (MCP) — full revert to pre-build:

```
publish_workflow { workflowId: "RnpxEnAV3g20MmKj", versionId: "4f2df612-3ae8-4ac8-a695-ea4c698d30f1" }
publish_workflow { workflowId: "RJ326g9dwe3bTWyf", versionId: "1f784ae4-8fcd-401d-ac4d-2e53fa0af95c" }
```

Round-2-only revert (back to the rejected round-1 build) = publish `407cbfb7…` / `7c5ff7fd…`.
🔴 Do not: round 1 is the build the tester rejected (leaks files past a closed brand gate).

The round-2 baseline GET showed both forks still at exactly the round-1 ids, so nothing else
edited them in between (LESSONS §64 revert-gate, checked before writing rather than after).

Transport: structural ops + small bodies via MCP `update_workflow` (byte-audit showed **zero
drift**); the three big Code bodies + parser body via one file-driven REST PUT each
(GET→patch-jsCode-from-suite-file→PUT; PUT auto-publishes, server MERGES settings — verified
`callerPolicy`/`availableInMCP` unchanged). Every written param byte-verified against
`tests/offline/tier-ask/*` after publish; `export-workflows.py --verify` green at `407cbfb7`
/ `7c5ff7fd`, and export bodies == suite bodies byte-for-byte.

## Per-node hashes (LESSONS §64 revert-gate + §71 param-hash sweep)

param-hash = sha256(json.dumps(parameters, sort_keys=True, ensure_ascii=False))[:16].
The sweep hashed **every node in both workflows**; the rows below are the ONLY adds/changes
(plus the connection splice). Anything else changing since this snapshot = someone else edited.

### fork spine `RnpxEnAV3g20MmKj`

Round-2 column is CURRENT. A node with no round-2 entry was not touched this round and its
round-1 hash was re-verified against live after the round-2 PUT (shown in the sweep below).

| node | param-hash pre-build → r1 → **r2** | jsCode sha256/16 (current) |
|---|---|---|
| `tier-gate` (NEW, Code) | (absent) → `10ad847a2f18d1e4` → **`fea867736b674f22`** | `9f2a32520576428a` |
| `If4` (**If node**) | `99a1e022f68373c5` → `e457606a94c49cb9` → (unchanged) | — |
| `access-level-choice-message` | `ae3d01b3f2d06967` → `9613941002af044d` → (unchanged) | `c29bbbae75beac0e` |
| `promo-picker` | `5396eabfa23fbff1` → `ce1834e55a250fbc` → **`600c2ec0293d651d`** | `c7306fbffc06f4dd` |
| `compile-current-state` | `5842b2a697a5af69` → `40c34936407782be` → (unchanged) | `c975bee03a2a3b51` |
| `disallowed-entity-gate` | `c01c682a81165d53` → `fc07d691810ec289` → (unchanged) | `b1f7e297598899bb` |
| `Call 'sub-get-results'` (**executeWorkflow inputs**) | `afefc9a04609e6cd` → `bebafe8fda5be745` → (unchanged) | — |

Round-2 full sweep (every node, both workflows): spine changed = `tier-gate`, `promo-picker`;
parser changed = `output_exchange`; **added: none; connections: unchanged** — the round-1 splice
and every other node are byte-identical to what the tester ran.

Connections delta (the ONLY edge change):
`Aggregate→If4` removed; `Aggregate→tier-gate` + `tier-gate→If4` added.

### fork parser `RJ326g9dwe3bTWyf`

| node | param-hash pre-build → r1 → **r2** | jsCode sha256/16 (current) |
|---|---|---|
| `output_exchange` | `9967c784a6cd5f03` → `895189717345c5e5` → **`6c1ad691a401e0ec`** | `22a30278d92c3550` |

## Harness wiring untouched (safety)

The sweep shows NO change to: any sendmsg caller (all still `ublq9nSlrpz63xan`
sub-sendmsg-CHAT), `Call 'sub-respond-save-message-redis'2` (still TEST sink
`tWm5DYLxfypmVC1T`), `Call 'sub-get-results'`'s TARGET workflowId (still `t4QvrtrPnTwRU6br`
CS-BUILD — only its two input expressions changed), redis nodes, guards, triggers,
`is_test` passing, settings (`callerPolicy`/`availableInMCP` verified identical).

## Offline evidence — round 2 (D9/D10/D11)

- RED first: the 26 new assertions were added and run against the **shipped round-1 bodies**:
  **85/109 pass, 24 FAIL** — red across D9-1b/1c/1d/1e, D9-2a, D9-3, D9-4, D11-1a/1b/2a/2b,
  D11-6a/6b/6c, D10-1a/1b/1d/1e/1f/1g/1h, D10-2 and both embed markers.
- GREEN after: **111/111**; mutate.sh **25/25** (12 new mutations, including two
  OVER-CORRECTION mutants — "D11 repeals D4" and "D10 eats the Q23 answer" — so the fixes are
  bounded in both directions, not just present).
- Fixtures are verbatim outputs of the FAILING executions: 12041502 (D9), 12041783 + 12041879
  (D11), 12040890 (the TA-7 bound D11 must not swallow), 12041565 (D10, via the gate flag).

## Offline evidence — round 1

- RED first: probe run against the PRE-change bodies (export copies + tier-gate stub):
  **29/75 pass, 46 FAIL** — red in every family (EB-*, TG-*, CM-*, CCS-1a/1b/1e, PP-1a/1d/1e/1g,
  GQ-2/GQ-3, OX-1a/1c/1e/2/3/4/5/6a/7/8, SI-1a).
- GREEN after: **75/75**; mutate.sh **13/13** caught (zero-byte no-op = hard fail).
- Mapper embeds: byte-copies of `tests/offline/access-tier/mapper.js` via `gen-embeds.js`;
  probe EB-* re-verifies byte identity on every run.
- Legacy suite reconciled to the new contract: `tests/offline/promo-picker` **73/73** probe,
  **26/26** mutants — after fixing a pre-existing VACUOUS harness there (see node-diff §find).

## Round 3 — F1 fix (2026-08-11, main agent; the coder agent died mid-task on a session limit)

| | round 2 | round 3 (current, ACTIVE) |
|---|---|---|
| spine `RnpxEnAV3g20MmKj` | `bba611fa` | **`2b9e3dfa-f98e-4fb1-8bfb-dffcb85a091e`** |
| parser `RJ326g9dwe3bTWyf` | `668cd772` | unchanged (`668cd772`) |

Post-death check before any write: all four workflows at their expected versions with
`versionId == activeVersionId` — the killed agent wrote nothing (memory
`agent-death-leaves-active-mutated`).

Changed: `tier-gate` (surfaces `brand_unheld`; re-embedded mapper), `disallowed-entity-gate`
(notice keys on `brand_unheld`, suppression still on `brand_gate_empty`). `promo-picker` untouched —
its D10 guard already keys on `brand_gate_empty` only. §71 param-hash sweep over every node: exactly
those two changed, no nodes added/removed, connections byte-identical.

Rollback: `publish_workflow(RnpxEnAV3g20MmKj, "bba611fa-e8c9-469f-abe3-bc5d64011a94")`.

Evidence: tier-ask 118/118 + 27/27 mutations; neighbours re-run after resync —
promo-partial 45/45, promo-scope-dym 21/21, brand-routing 81/81 + 10/10, promo-picker 73/73,
access-tier mapper 43/43 + 11/11. Byte-gate: both bodies re-fetched and compared byte-for-byte.

⚠️ Two probe-authoring defects of mine, caught and recorded (LESSONS §72/§73 class, third and
fourth instances this session):
1. The F1 cases were first appended AFTER the probe's verdict loop — counted in the total but never
   evaluated, so they could not fail. Moved before the loop.
2. Once running, they still passed against the pre-fix body because the fixture omitted
   `query_brands`, so the buggy predicate never executed. Fixed by modelling what the post-D9 parser
   actually emits. Only after both fixes did F1-1/2/3/5/6 go red pre-fix.
