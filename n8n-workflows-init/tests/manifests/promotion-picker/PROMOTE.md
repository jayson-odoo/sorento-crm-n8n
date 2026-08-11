# PROMOTE checklist — promotion-picker bundle (final review 2026-08-11)

## ✅ EXECUTED 2026-08-11

| target | published versionId | rollback (publish this to revert) |
|---|---|---|
| parser sub `XTODTw-dJcV0uRdC056hG` | `c829509d` | `bb875580` |
| live spine `9qVyfUxmRQqrpGRMDLRuz` | `8a1e1270` | `d1b3f29e` |

Order honoured (parser first). Every promoted node byte-gated active == fork file
(6 spine bodies + new `promo-picker` + splice; parser `output_exchange`). Exports refreshed
and `--verify` green. Transport note: node bodies landed via MCP `update_workflow`; the final
two comment-banner byte fixes + publish went via one REST PUT (auto-publishes) that wrote the
export files' exact bytes — hand-transcribing long `─` banner runs drifted ±2 repeatedly and
the byte-gate caught it every time.

Reviewed diff: fork `RnpxEnAV3g20MmKj` @ `4f2df612` vs live spine @ active `d1b3f29e`
(draft `629fe5d0` is a byte-identical no-op save — nodes+connections equal; publish will collapse it).
Parser: fork `RJ326g9dwe3bTWyf` @ `1f784ae4` vs live sub `XTODTw…` @ `bb875580`.

All offline suites green at review time: promo-partial 45/45+27, promo-scope-dym 21/21+8,
promo-picker 72/72+26, brand-routing 81/81+10, notfound-dedup 8/8+5.

## Order: parser FIRST, spine second — and why

Spine's `promo-picker` keys on parser-emitted `_promo_pick_scope_reused`. Spine-first would leave
picks mis-classified (the F10b bug resurrected) until the parser lands. Parser-first is inert: the
new keys ride through the old spine unconsumed.

## 1. Parser sub `XTODTw-dJcV0uRdC056hG` (LIVE — treat as touching live)

- rollback versionId: `bb875580`
- one node: `output_exchange` — one region: delete the stale `access_levels` carry; insert the
  guarded promo scope-reuse block (`_quoted`/`_prevDym` guards, `_promo_pick_labels`)
- source of truth for the hunk: `export/fork-promo-picker-parser/nodes/output_exchange.js`
  (fork == live + this one region; verified: only node differing, no prompt drift)

## 2. Live spine `9qVyfUxmRQqrpGRMDLRuz`

- rollback versionId: **`d1b3f29e`** (ACTIVE, not the draft id)
- backup full live JSON to `n8n-workflows-init/backups/` BEFORE first write

### Node bodies to carry (5 changed + 1 new), by NAME, from `export/fork-promo-picker-spine/nodes/`

| node | what |
|---|---|
| `promo-picker` | **NEW node** — the whole feature (list/sort/echo/picks/strict-miss/coverage) |
| `compile-current-state` | promo roster arm, dym suppression (`_tokenWasAnswered` incl. `intersection`), picker dedup, `access_levels` persistence removed |
| `disallowed-entity-gate` | S1 `promotion:false`, #9/#16/#20 brand→parser-brand→company routing, Q23 access notice |
| `not-found-error-message` | #11 access dedup, #12 exact-token representative, entitlement-miss wording, needsScope reuse |
| `build-suggest-offer` | #13 `askedLabel` (UUID leak), #9 team preference |
| `escalate-catalog` | #9 team preference in `escalate_offer` |

### Connection splice (the ONLY graph change)

```
- validator[0] -> crossdomain-zeroset[0]
+ validator[0] -> promo-picker[0]
+ promo-picker[0] -> crossdomain-zeroset[0]
```

### MUST NOT be promoted (harness — verified fork-only)

- nodes: `sim-inject-session`, `fixture-*` ×4, `mock-parser-output`, `ideate-turn-mock`, `decode-audio-b64`
- bodies: `build-ideate-reply` (reads mock `ideate-turn`), `patch-transcript` (mock_transcript lane)
- wiring: replay-* pins, guard-*-record egress lane, session gates, `parser-bypass-gate`,
  console gates, sendmsg→CHAT, save-message-redis→TEST sink, sub-get-results→CS-BUILD,
  parser→fork. Live keeps its own: `Fss5aAaX` (own probes), `rysSPg` (main read), sendmsg live,
  `Schedule Trigger`/redis-pop, `save-session-vars`, `update-human-intervened`, presigned-url lane.

### Mechanics (LESSONS §57/§58, memory `n8n-live-promote-via-mcp`)

1. build payload as CURRENT LIVE + the six bodies + the splice; `sed` trailing whitespace;
   `node --check` each body
2. REST PUT (auto-publishes); a 409 on a webhook workflow may still persist — judge by state
3. re-fetch → byte-gate active == file for every touched node → `versionId == activeVersionId`
4. re-run `export-workflows.py`, commit exports

## 3. Post-promote verification (user's own WhatsApp, real contact)

- `6047 promo` → sorted list, scope echo, no dym block · pick `3` then `1` (repeat picks)
- `cabana kitchen tap promo` → strict not-found, cabana team, then `yes` → escalation
- `promo for CBS212-WH & SRTBF11834` → decomposition note + file
- `MWC7604-RL CERT` → all three "no certificate"
- entitlement contacts `505044197/505044090/505044028` — same query, three different lists
- quote-reply an older list with `2` (PP-7 — only real WhatsApp can produce it)
- one non-promotion smoke: `check stock srtwc286` (gate/ccs are shared surfaces)

## Known-open, accepted for this promote

- parser non-determinism on phrase splitting (merged vs split parse) — upstream, documented
- promotion rows carry no `brand` (CRM ask item 4) → parser-brand fallback covers it
- category→products→promotions walk (shower-head class) — parked with CRM session
- OR-path has no `token_coverage` — by design; `fallback_reason` is the signal there
