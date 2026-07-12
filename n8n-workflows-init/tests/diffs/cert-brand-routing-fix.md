# Node-diff — `cert-brand-routing-fix` (deriveRouting `isCert` widened)

Change-id: `cert-brand-routing-fix` · scope: **parser** · coder deliverable for the reviewer.
Plan: `n8n-workflows-init/plans/cert-brand-routing-fix.md` · UAC: `tests/UAC.md §14`.
Date: 2026-06-30.

## Targets touched
| role | id | edited? | published active version |
|---|---|---|---|
| reformulator TEST copy (clone calls THIS) | `CpxE8LroLzCkrAQN` (`sub-query-reformulator TEST rebase`) | **YES — one line in `output_exchange`** | `6ecf25cd-322a-4aba-9fec-1c6dc90be55d` (was `d1dfdce4-…`) |
| LIVE reformulator (`sub-semantic-parser`) | `XTODTw-dJcV0uRdC056hG` | **NO** — verified versionId still `3896c4dd-9774-4e86-92da-788818aaf350`, activeVersionId still `eb01c67a-bfba-43f6-9bfb-87a5094e17d6` | promotion target only (§ Promotion) |
| LIVE spine | `9qVyfUxmRQqrpGRMDLRuz` | **NO** — versionId/activeVersionId unchanged `096476da-ccb4-4837-b8c8-fd8ac14269dc` | untouched |
| TEST clone (driver) | `txiPzSxy3Pclsz6v` | **NO repoint needed** — already calls `CpxE8LroLzCkrAQN` via node `Call 'sub-query-reformulator'`; no clone node points at live `XTODTw` | — |

Only **one node changed across all workflows**: `CpxE8LroLzCkrAQN` → `output_exchange` (`jsCode`).
The other 6 nodes of CpxE8 are byte-identical pre/post (per-node param sha unchanged); the clone is
unchanged. Editing the copy **in place** was correct because it already byte-identically mirrors current
live — see "Rebase verification" — so no fresh fork / retire was required.

## Rebase verification (why "matches → apply directly", not "fork fresh")
`get_workflow_details XTODTw` returns live's current editor/draft state. Compared the two load-bearing
nodes of CpxE8 vs that live state, **same extraction method**, direct byte-diff:
- `AI Agent.options.systemMessage` — **byte-identical** to live; sha256[:16] (no trailing newline) =
  `eb382bcd4985c4d7` for BOTH = the expected "live active" sha.
- `output_exchange.jsCode` (pre-edit) — **byte-identical** to live; sha256[:16] (no trailing newline) =
  `da533ee6988a8423` for BOTH = the vague-token-documented live sha. Carried the documented `/cert|ikram/`
  before-state at line 10.

Note on shas: a first pass via `jq -r | shasum` reported `fa37aa46…` / `d43b0b3f…`; that method appends a
trailing newline. With the doc's method (`jq -j`, no trailing newline) the values reproduce the documented
`eb382bcd…` / `da533ee6…` exactly. The earlier mismatch was a hashing-method artifact, **not** content
drift. CpxE8 == current live on both nodes → "matches" branch.

## The change (single spot) — `output_exchange` `deriveRouting`, line 10
Function `deriveRouting(out)`; `out` === `output.output` (passed at line ~387), carrying
`intent_hint` / `user_goal` / `entities`. `attachTypes` (lines 7–9) is pre-filtered to
`hint==='attachment_type'` raws only, lowercased. Confirmed in-scope before editing.

**BEFORE (line 10, verbatim):**
```js
  const isCert = attachTypes.some(t => /cert|ikram/.test(t));
```

**AFTER (replaces that single line, verbatim):**
```js
  // cert-vs-photo discriminator. Fire when EITHER an attachment_type raw names a cert body/word,
  // OR the semantic signal (attachment intent + a cert word in user_goal) says certificate.
  // Brand-named certs (SPAN/SIRIM/BOMBA/MS####/Halal) arrive as attachment_type raw, not "certificate".
  const isCert =
    attachTypes.some(t => /cert|ikram|span|sirim|bomba|ms\s?\d|halal/i.test(t))
    || (out.intent_hint === 'check_product_attachment'
        && /cert|certificate/i.test(String(out.user_goal || '')));
```

### Intent / blast radius (grouped)
- **Guard a–g / bypass:** N/A — this change has no egress guard; the reformulator is pure-parse / zero-egress.
  The clone's existing guards (5 orphaned egress nodes, 8 shared-sub calls `is_test=true`) are untouched.
- **Trigger #1 (widened brand regex):** `isCert` now also fires when an `attachment_type` raw matches
  `span|sirim|bomba|ms\s?\d|halal` (case-insensitive). Brand-named certs that the LLM emits as `{raw:"SPAN"}`
  (not normalized to `"certificate"`) now hit the cert branch → `purchasing_certification`. Strict superset
  of the old `/cert|ikram/`, so already-working forms (`certificate`, `Ikram cert`) are unchanged.
- **Trigger #2 (semantic fallback):** fires when `out.intent_hint === 'check_product_attachment'` AND
  `user_goal` contains `cert|certificate`. `intent_hint` is set only inside the attachment path → inert
  elsewhere.
- **Over-fire guard:** a genuine `photo`/`technical drawing`/`3D model`/`image` request carries neither a
  brand token nor a cert word in `user_goal` → `isCert=false` → stays `marketing_product`. (UAC §14e.)
- **Inert outside `product_attachment`:** `isCert` is read only in `case 'product_attachment'` → `incoming`,
  `order`, `promotion`, `master_products`, `inventory`, `forms` routes are byte-identical. (UAC §14f.)
- **Token safety:** the brand regex is tested ONLY against attachment_type raws; `ms\s?\d` needs a digit so
  it won't match prose "ms".

## Validation
- **Syntax:** wrapped the new `jsCode` as a function body and ran `node --check` → **PASS**.
- **Structure:** PUT body re-derived from a fresh REST GET; per-node param sha confirms **only
  `output_exchange` changed**; all 6 other nodes SAME; 7 nodes / 4 connection keys intact. Post-write MCP
  re-fetch: `output_exchange.jsCode` **byte-identical** to the intended new code.
- **`publish_workflow CpxE8LroLzCkrAQN`:** `{"success":true, activeVersionId:"6ecf25cd-…"}` — clean, no
  warnings surfaced.
- **Warnings — NEW vs documented pre-existing:** pre-existing CpxE8 set = `SUBNODE_NOT_CONNECTED` +
  `DISCONNECTED_NODE` on orphaned `Postgres Chat Memory`, OpenAI `builtInTools`. This edit adds no
  node/connection → **NO new warning**.
- Note: MCP `validate_workflow` validates SDK *code*, not a workflow id, so the workflow-level signal here
  is the clean `publish_workflow` plus the structural diff above.

## Write mechanism (for reproducibility)
The new `jsCode` (24 KB, regex/backtick-heavy) was applied byte-exactly via the n8n public REST API
`PUT /api/v1/workflows/CpxE8LroLzCkrAQN` with a body built by `jq --rawfile` (replacing only
`output_exchange.jsCode`, keeping `{name,nodes,connections,settings}`) — to avoid hand-transcription drift.
This is a write to a TEST copy only (not live, not prod CRM, no egress). The REST PUT set
`versionId == activeVersionId == 6ecf25cd` directly; `publish_workflow` then re-confirmed it published.
Verified post-write via MCP `get_workflow_details` + REST GET.

## Promotion transcription (NOT done here — user-gated)
When promoting to LIVE `XTODTw-dJcV0uRdC056hG`, this is a **single** `output_exchange.jsCode` replacement —
the exact BEFORE→AFTER hunk above. As an MCP op it is one `setNodeParameter` on node `output_exchange`,
path `/parameters/jsCode`, value = the full patched `jsCode` (identical to CpxE8's current
`output_exchange.jsCode`).

**⚠ Reconcile BEFORE publishing live (plan §1 FLAG):** live `XTODTw` currently has an **unpublished draft**
— `versionId 3896c4dd` ≠ `activeVersionId eb01c67a`. `publish_workflow XTODTw` ships the **whole draft**, not
just this hunk. Before promoting:
1. Diff the live **draft** `output_exchange` (and `systemMessage`) vs the live **active** version so you know
   exactly what publish would ship. (I could not read live-active's node bodies via MCP — `get_workflow_details`
   returns the draft; exec `7019613` ran the active version and showed the `/cert|ikram/` behaviour, consistent
   with active's `output_exchange` also being the `/cert|ikram` before-state.) The test copy CpxE8 mirrors the
   live **draft** (systemMessage `eb382bcd…`, output_exchange `da533ee6…`), so testing against CpxE8 predicts
   the **post-publish** live behaviour — which is correct IF the pending draft delta is intended to ship.
2. Confirm the pending draft delta is intended; if not, do not blind-publish.
3. Apply the one-line hunk, then `publish_workflow XTODTw`. Reformulator is pure-parse / zero-egress, so the
   live edit triggers no customer action — but still publish (drafts don't auto-run) and still reconcile #1.

## Revert lever
- **Test copy:** re-apply the BEFORE line (restore `const isCert = attachTypes.some(t => /cert|ikram/.test(t));`)
  to `CpxE8LroLzCkrAQN.output_exchange` and re-publish; or restore the pre-edit version `d1dfdce4-…`.
- **Wiring:** the clone `txiPzSxy3Pclsz6v` node `Call 'sub-query-reformulator'` points `workflowId.value` at
  `CpxE8LroLzCkrAQN`. To run the clone against live reformulator instead, repoint it to
  `XTODTw-dJcV0uRdC056hG` (not part of this change; documented so wiring is reversible).
- **Live (if promoted):** restore the BEFORE line on `XTODTw output_exchange` and `publish_workflow`.

## Zero-egress / safety posture
Reformulator is pure-parse, no egress. Clone unchanged: 5 egress nodes orphaned, 8 shared-sub calls
`is_test=true`, no clone node calls live `XTODTw`, no schedule trigger present (driven by `zz-canary-run` +
redis). `suggested_team` flows only into the clone's guarded (blocked) human-intervention sub. §0 intact.

## Handoff to tester
Run UAC §14a–§14f against clone `txiPzSxy3Pclsz6v` (these are `scope: parser` — OMIT `mock_parser_output`
so the real rebased reformulator runs). Assert `output_exchange.output.output.routing.suggested_team`.
Acceptance rests on §14a/§14b/§14d/§14e/§14f; §14c may be `inconclusive-by-parser`. Plus the offline V-R0
`deriveRouting` unit + the V-R5 sampled-regression sweep (plan §6).
