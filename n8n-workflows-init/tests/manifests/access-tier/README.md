# access-tier build manifest — tier-only access ask (plans/access-tier-ask-plan.md)

Coder build snapshot, 2026-08-11. Targets are the PROMO-PICKER **forks only** — live spine
`9qVyfUxmRQqrpGRMDLRuz` and live parser `XTODTw-dJcV0uRdC056hG` were **not touched**.

## versionIds (rollback = publish the *before* id)

| workflow | before (rollback) | after (built, ACTIVE) |
|---|---|---|
| fork spine `RnpxEnAV3g20MmKj` (sorento-consume-main PROMO-PICKER) | `4f2df612-3ae8-4ac8-a695-ea4c698d30f1` | `407cbfb7-48e6-4793-9889-b933458b442b` |
| fork parser `RJ326g9dwe3bTWyf` (sub-semantic-parser PROMO-PICKER) | `1f784ae4-8fcd-401d-ac4d-2e53fa0af95c` | `7c5ff7fd-9cb1-427e-82d4-8556311f4807` |

Rollback commands (MCP):

```
publish_workflow { workflowId: "RnpxEnAV3g20MmKj", versionId: "4f2df612-3ae8-4ac8-a695-ea4c698d30f1" }
publish_workflow { workflowId: "RJ326g9dwe3bTWyf", versionId: "1f784ae4-8fcd-401d-ac4d-2e53fa0af95c" }
```

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

| node | param-hash before → after | jsCode sha256/16 (after) |
|---|---|---|
| `tier-gate` (NEW, Code) | (absent) → `10ad847a2f18d1e4` | `6a59ef819ccc5ede` |
| `If4` (**If node**) | `99a1e022f68373c5` → `e457606a94c49cb9` | — |
| `access-level-choice-message` | `ae3d01b3f2d06967` → `9613941002af044d` | `c29bbbae75beac0e` |
| `promo-picker` | `5396eabfa23fbff1` → `ce1834e55a250fbc` | `f1525b22b0f7313c` |
| `compile-current-state` | `5842b2a697a5af69` → `40c34936407782be` | `c975bee03a2a3b51` |
| `disallowed-entity-gate` | `c01c682a81165d53` → `fc07d691810ec289` | `b1f7e297598899bb` |
| `Call 'sub-get-results'` (**executeWorkflow inputs**: `semantic_input` + `user_prompt`) | `afefc9a04609e6cd` → `bebafe8fda5be745` | — |

Connections delta (the ONLY edge change):
`Aggregate→If4` removed; `Aggregate→tier-gate` + `tier-gate→If4` added.

### fork parser `RJ326g9dwe3bTWyf`

| node | param-hash before → after | jsCode sha256/16 (after) |
|---|---|---|
| `output_exchange` | `9967c784a6cd5f03` → `895189717345c5e5` | `70196c280c971ce3` |

## Harness wiring untouched (safety)

The sweep shows NO change to: any sendmsg caller (all still `ublq9nSlrpz63xan`
sub-sendmsg-CHAT), `Call 'sub-respond-save-message-redis'2` (still TEST sink
`tWm5DYLxfypmVC1T`), `Call 'sub-get-results'`'s TARGET workflowId (still `t4QvrtrPnTwRU6br`
CS-BUILD — only its two input expressions changed), redis nodes, guards, triggers,
`is_test` passing, settings (`callerPolicy`/`availableInMCP` verified identical).

## Offline evidence (tests/offline/tier-ask/)

- RED first: probe run against the PRE-change bodies (export copies + tier-gate stub):
  **29/75 pass, 46 FAIL** — red in every family (EB-*, TG-*, CM-*, CCS-1a/1b/1e, PP-1a/1d/1e/1g,
  GQ-2/GQ-3, OX-1a/1c/1e/2/3/4/5/6a/7/8, SI-1a).
- GREEN after: **75/75**; mutate.sh **13/13** caught (zero-byte no-op = hard fail).
- Mapper embeds: byte-copies of `tests/offline/access-tier/mapper.js` via `gen-embeds.js`;
  probe EB-* re-verifies byte identity on every run.
- Legacy suite reconciled to the new contract: `tests/offline/promo-picker` **73/73** probe,
  **26/26** mutants — after fixing a pre-existing VACUOUS harness there (see node-diff §find).
