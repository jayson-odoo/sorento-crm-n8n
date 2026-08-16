# Per-rev MANIFEST snapshots — `promotion-picker`

Plan: `plans/promotion-picker-plan.md` · UAC: `tests/uac/PP.md` · Tickets: GH #3–#10.

## Rev 0 — ROLLBACK BASELINE (recorded before the first write)

| target | id | versionId |
|---|---|---|
| clone (rebase target) | `txiPzSxy3Pclsz6v` | **`a3269e1f-9c86-41bc-bcb2-1297a836870a`** |
| live spine (reference only — NOT a write target) | `9qVyfUxmRQqrpGRMDLRuz` | `d1b3f29e-5244-4f65-85e5-f082d1766de9` |

Recorded 2026-08-09, immediately after the container-status promote, with
`export-workflows.py --verify` green across all 9 exports and clone
`versionId == activeVersionId` (independently confirmed by the container-status session).

Rollback (clone): `publish_workflow txiPzSxy3Pclsz6v a3269e1f-9c86-41bc-bcb2-1297a836870a`
then re-run `export-workflows.py`.

---

## Build targets — created 2026-08-09

| target | id | base | created at |
|---|---|---|---|
| `sorento-consume-main PROMO-PICKER` | **`RnpxEnAV3g20MmKj`** | the REBASED clone `c4c89ed1` | `041bdb87` → `9c00e846` (parser repoint) |
| `sub-semantic-parser PROMO-PICKER` | **`RJ326g9dwe3bTWyf`** | **LIVE** `bb875580` | `9f848231` |

Both registered in `scripts/export-workflows.py` (`fork-promo-picker-spine` / `-parser`) so the
staleness gate covers them from creation — an un-exported fork gets no gate, which is exactly how
`wI5RkNGW3EOJfBdo` drifted unnoticed.

**The parser fork is based on LIVE, not on `wI5RkNGW3EOJfBdo`.** That fork is BEHIND live: it lacks
`resource_attachment` in `DOMAIN_BLOCKED_HINTS.order` and `.incoming` (verified by diffing the two
exports at live `bb875580` / fork `013a16be`). Basing on it would have inherited a regression.

Spine fork `Call 'sub-query-reformulator'` repointed `wI5RkNGW3EOJfBdo` → `RJ326g9dwe3bTWyf`,
byte-gated. Containment re-verified after the repoint — **no sub call points at a live sub**:
sendmsg ×8 → `ublq9nSlrpz63xan`, get-results ×6 → `t4QvrtrPnTwRU6br`, save-message-redis →
`tWm5DYLxfypmVC1T` (unconsumed list), human-intervention → `vUfFUDjLAuMaeQE6`.

### 🔴 OPEN — two workflow settings the API cannot set

`POST /workflows` silently drops them and `PUT` rejects them (`400 must NOT have additional
properties`). Both forks are therefore missing what live and the clone have:

| setting | live / clone | forks | consequence |
|---|---|---|---|
| `binaryMode` | `separate` | **absent** | governs binary/attachment handling — the exact surface PP exercises. Attachment results are NOT trustworthy until this matches. |
| `availableInMCP` | `true` | **absent** | **MCP tooling cannot touch the forks at all** — `update_workflow` returns *"Workflow is not available in MCP"*. REST still works. |

**Needs a human in the n8n UI** (workflow card → settings) on BOTH `RnpxEnAV3g20MmKj` and
`RJ326g9dwe3bTWyf`. Until then: drive writes over REST, and treat any attachment-path result as
provisional.

---

## Rev 1 — clone rebase against live (2 nodes) — ✅ APPLIED 2026-08-09

**clone `txiPzSxy3Pclsz6v` @ `c4c89ed1-f2dd-4716-9b75-b30f15b72865`**, 148 nodes,
`versionId == activeVersionId`. Both byte gates PASS; post-export diff confirms
`not-found-error-message` IDENTICAL to live and `If10.leftValue` equal to live.
Clone-vs-live param diffs: **31 → 29**, and all 29 remaining are on the containment list below.

Rollback (one rev): `publish_workflow txiPzSxy3Pclsz6v a3269e1f-9c86-41bc-bcb2-1297a836870a`

### Transport — how, and why not the obvious way

REST PUT, reading both node bodies **straight from the verified export** — never retyped through the
tool channel. Retyping was rejected on purpose: live's `not-found-error-message` is 13,091 chars
containing `\'` and literal `\n` sequences, and the authoring channel right-trims trailing
whitespace (the body ends `return out;\n\n`), so a hand-escaped copy risks silent corruption and a
false byte gate.

Two API facts established here, worth reusing:

1. **`PUT /workflows/{id}` rejects a `settings` object carrying `availableInMCP` or `binaryMode`**
   — `400 request/body/settings must NOT have additional properties`. Fails before any write.
2. **PUT MERGES `settings`; it does not replace them.** Proved on a disposable workflow
   (created, probed, deleted): a PUT omitting `callerPolicy` left it intact. So filtering the body's
   `settings` to the API-accepted whitelist is safe — confirmed after the real PUT, both
   `binaryMode: separate` and `availableInMCP: true` survived. **This matters:** `binaryMode`
   governs attachment handling, which is exactly what PP sends.
3. **No `PATCH`** — `405 PATCH method not allowed`.

MCP `update_workflow` also works but `setNodeParameter` could not descend the If-node path
(`/conditions/conditions` → "cannot descend into non-object"); `updateNodeParameters` with the whole
`conditions` object succeeded.

### The change

**Not a feature change.** Brings two SHIPPED live fixes onto the clone so that PP baselines measure
behaviour live actually has. Both were independently identified by the container-status session's
reviewer as "clone BEHIND live — promoting would REGRESS live", and excluded from that promote.

| node | gap being closed |
|---|---|
| `not-found-error-message` | clone 211 lines vs live 247 — missing `_ORDER_TYPES` order/DO-number labeling (+ customer context) and the `_notFoundRaw` / `_resolvedToks` fold |
| `If10` | clone condition `output.correction`; live `correction === true && message_type !== 'casual' && message_type !== 'business_query'` (casual-aborts-member-reprompt fix) |

### Explicitly NOT rebased — deliberate containment

Reverting any of these to live breaks zero-egress. Listed so a future "make the clone match live"
sweep cannot quietly undo them:

- `fixture-check-access`, `fixture-get-session-vars`, `fixture-resolve-entity` replace live's HTTP
  nodes (these are the three apparent "type diffs")
- all `Call 'sub-*'` nodes point at forks and pass `is_test=true`; the 6 get-results callers point at
  `t4QvrtrPnTwRU6br` (`sub-get-results CS-BUILD`), **not** `rysSPgUssLDf6xJc` — that indirection is
  what stops the clone editing a sub on live's main answer path
- `redis-pop-main-message-list` reads `test:q:{contact}`, not `q:{contact}`
- no `Schedule Trigger` (canary-driven), no `get-presigned-url`
- `send-message-files/images/video` and `update-human-intervened` orphaned
- `build-ideate-reply` reads the `ideate-turn` mock; `patch-transcript` accepts `mock_transcript`

### Excluded as cosmetic

- `If-incoming-picker` — clone `typeValidation: loose, version: 2` vs live `strict, v3`. No logic
  difference. The container-status session excluded it on the same grounds.

### Flagged, deliberately untouched — needs a human

`family-fetch` and `get-cs-members`: live calls `https://72.62.195.20/api/v1/external/…` with
**`allowUnauthorizedCerts: true`**; the clone calls `https://fe-sorento.foundryx.my`. TLS
verification is disabled on production calls carrying contact and team-member data. An IP literal
cannot match a hostname cert, so the IP and the flag are almost certainly one decision. Raised with
the user by both sessions; **not** part of this rebase.
