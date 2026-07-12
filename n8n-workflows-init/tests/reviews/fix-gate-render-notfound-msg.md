# Review — `fix-gate-render-notfound-msg` (Fix A gate render + Fix B not-found message)

Reviewer: sorento-reviewer · Date: 2026-06-28
Build target reviewed: clone `txiPzSxy3Pclsz6v`. Live spine `9qVyfUxmRQqrpGRMDLRuz` (active, versionId `b4574211-…`) NOT touched, never executed.
Scope: exactly two Code/JS nodes — `disallowed-entity-gate` (Fix A) + `not-found-error-message` (Fix B). `scope: deterministic`.

## VERDICT: APPROVE (promotion authorized, user-gated)

Both fixes are correct, confined to node `jsCode`, contain zero test-only references (safe to copy to live verbatim), do not alter control-flow/wiring/egress, and the change is domain-agnostic and safe for both `incoming` and `product_attachment`. Zero egress re-confirmed across all UAC runs (S1–S6 pass everywhere). One known item — the `${domain}` literal in the require-specific clarification — is **intended by the user (proposed Fix C rejected)** and is therefore explicitly NOT a defect.

---

## 1. Precise live→clone jsCode delta (the promotion delta)

The diff is exactly Fix A + Fix B and nothing else. Live nodes match the plan's "before" quotes verbatim (no drift): live gate still contains the old clobber strings (`No product found for the requested item`, `the selectable set is products only` — 2 hits); clone gate has 0. The non-`product_attachment` not-found path is byte-identical live↔clone.

### `disallowed-entity-gate` (Fix A) — two changes, both inside `if (REQUIRE_SPECIFIC_DOMAINS.has(domain))`

**A1 — INSERT** (after the token-filter block, before the render block): exact-dedup of `specific_options`:
```js
// FIX A: drop candidates already covered by an exact code-resolution (descriptor noise)...
if (specific_options.length > 0 && exact_entities.length > 0) {
  const exactUuids = new Set(exact_entities.map(e => e.uuid));
  specific_options = specific_options
    .map(o => ({ ...o, candidates: o.candidates.filter(c => !exactUuids.has(c.uuid)) }))
    .filter(o => o.candidates.length > 0);
}
```

**A2 — REPLACE** the final clobber block. Removed (the bug): `compatible_entities = entities.filter(e => product)` + re-render of `gate_clarification` from that union (the "18 irrelevant codes"). Added:
```js
if (require_specific) {
  const optUuids = new Set(specific_options.flatMap(o => o.candidates.map(c => c.uuid)));
  compatible_entities = entities.filter(e => optUuids.has(e.uuid));
} else if (exact_entities.length > 0) {
  compatible_entities = exact_entities;
}
```
Net: `gate_clarification` is now rendered once, from the token-filtered + exact-deduped `specific_options`; `compatible_entities` is the relevant SET, never the cross-token union. `require_specific === (specific_options.length > 0)` after A1.

### `not-found-error-message` (Fix B) — one change

**INSERT** an `else if (q.domain_hint === 'product_attachment')` branch between `if (require_specific)` and the final `else`:
```js
} else if (q.domain_hint === 'product_attachment') {
  const ents = Array.isArray(q?.entities) ? q.entities : [];
  const productRaws = ents.filter(e => e.hint === 'product').map(e => e.raw).filter(Boolean);
  const attachEnt   = ents.find(e => e.hint === 'attachment_type');
  const prodText = productRaws.length ? `product ${productRaws.join(' and ')}` : '';
  let subject;
  if (attachEnt?.raw && prodText)      subject = `a ${attachEnt.raw} for ${prodText}`;
  else if (attachEnt?.raw)             subject = `a ${attachEnt.raw}`;
  else if (prodText)                   subject = `attachments for ${prodText}`;
  else                                 subject = requested;
  escalate_message =
    `Could not find${active_inactive} ${subject}${dateRange}${access}. ` +
    `Would you like me to escalate to ${team} team?`;
}
```
The `if (require_specific)` branch and the final `else` (all non-`product_attachment` domains) are byte-identical to live.

No other lines in either node changed. No connections, no egress nodes, no shared-sub calls, no `is_test` wiring, no credentials.

## 2. Test-only-ref check — CLEAN

`grep -niE 'is_test|test_run_id|mock_|n8n_test|canary|test:egress|regress|replay|golden|fixture'` over both clone nodes' jsCode → **0 matches**. Both bodies are pure business logic. **No guard scaffolding to strip** — the promoted jsCode is the clone jsCode VERBATIM. Both bodies pass `node --check`.

## 3. `incoming`-domain safety (code inspection — UAC only exercised `product_attachment`)

**Fix A is domain-agnostic and `incoming` is safe.** `REQUIRE_SPECIFIC_DOMAINS = {'incoming','product_attachment'}`. A1 keys purely on `exact_entities` uuids vs `specific_options` candidate uuids; A2 keys on `optUuids`/`exact_entities`. No `product_attachment`-specific literal in the changed code. The exact-vs-ambiguous classification, the token-filter, and the render path are identical for both domains.

Behaviour change for `incoming` on a prompt turn is strictly an improvement: the old clobber did `entities.filter(product)` (dropping compatible non-product types e.g. `inbound_shipment`, and rendering from the union); the new code renders/selects from the token-filtered `specific_options`. Exact-token `incoming` turns short-circuit through `exact_entities` exactly as `product_attachment` does. Nothing in Fix A regresses `incoming`; it removes the same union-clobber bug there too. (Per plan §7, any `incoming`-ambiguity corpus turn is an allowed-to-change turn under regression scope.)

**Fix B does not touch `incoming` at all:** the new branch is gated on `q.domain_hint === 'product_attachment'`; `incoming` falls to the byte-identical final `else`.

## 4. Control-flow / wiring / egress — UNCHANGED

Only `parameters.jsCode` on two `n8n-nodes-base.code` nodes changed. No connection edits; clone nodeCount 101 unchanged; the 5 orphaned egress nodes remain orphaned; `is_test` occurrence count unchanged (24). Live wiring/egress is therefore untouched by this delta.

## 5. Zero-egress re-confirmation from run logs (S1–S6)

| Case | Verdict | Egress log | get-results tool | Notes |
|---|---|---|---|---|
| §9 two-exact + missing attach | PASS | sendmsg/save-vars/save-redis all `blocked:true` only | `crm_master_product_attachments_list` (READ), `has_result=false` | Fix A: `require_specific=false`, no union noise. Fix B: clean msg, no `product_attachment` literal. |
| §10 exact + variant siblings | PASS | all `blocked:true` | `crm_master_product_attachments_list` (READ) | `-NZ` prefix sibling did not prompt. |
| §11a WC286 ambiguity | PASS | all `blocked:true` | clarification path | `require_specific=true`; list = ONLY 10 `SRTWC286-*`; no union noise. Legit disambiguation preserved. |
| §11b SRTUFV101 passthrough | PASS (deterministic, 0-token) | all `blocked:true` | `crm_master_product_attachments_list` (READ) | `-WEPLS` sibling did not prompt. S6 STRICT 0 tokens. |
| §12 Fix-B not-found | PASS (deterministic) | all `blocked:true` | READ | `escalate_message` has no `product_attachment` literal. |

Across every run: no `api.respond.io` send, no assignment/SLA/PIC-comment write, no conversation-variables PUT (the orphaned `save-session-vars` PUT only ever logged `would_write … blocked:true`), `get-results` tool ∈ READ allowlist, never `crm_it_support_ticket_create`. S1–S6 pass for every case.

**Note on the rollup file:** `fix-gate-render-notfound-msg-rollup.json` (written 17:02) marks §10/§11/§12 as BLOCKED by a concurrent replay-job sharing the redis list. That rollup is **stale** — the individual run files `uac10-…`, `uac11a-…`, `uac11b-12-…` (re-runs, timestamped 21:34–21:35, later execution IDs 6861707/6861809/6862097) supersede it and all show PASS once the list was uncontended. Even in the stale rollup, the blocker was test-isolation, not a kill-switch leak — "No real egress observed anywhere." Verdict relies on code inspection + the authoritative re-run files (matches user-stated evidence).

## 6. Acknowledged, out-of-scope-by-user-decision (NOT a blocker)

§11a recorded that on a `require_specific=true` product_attachment prompt, `gate_clarification` begins `"product_attachment search needs to be more specific…"` — the `${domain}` literal reaches the customer-facing clarification. **The user explicitly REJECTED de-literalizing this (the proposed "Fix C"); the `${domain}` literal here is INTENDED.** Per that decision the broad "no `product_attachment` literal anywhere" invariant applies ONLY to the Fix-B not-found message (where it holds), NOT to the require-specific clarification. Recorded for awareness only; does not affect approval.

---

## PROMOTE CHECKLIST (for the main agent — user-gated; do NOT auto-run without the user's go)

Promotion target: live `sorento-consume-main` `9qVyfUxmRQqrpGRMDLRuz` (active=true). Two `n8n-nodes-base.code` nodes, `jsCode` only. No guard scaffolding to strip (the two nodes contain none). Never edit live mid-cycle; do all prep, then a single atomic update.

### (a) Back up the live spine FIRST
1. `get_workflow_details 9qVyfUxmRQqrpGRMDLRuz` → save full JSON to `n8n-workflows-init/tests/reviews/backups/9qVyfUxmRQqrpGRMDLRuz.pre-fix-gate-render-notfound-msg.<UTC>.json`.
2. Record current `versionId` (`f6bb0c13-fc25-411b-a0c5-a3d3c327bf62`) and `activeVersionId` (`b4574211-7c3c-4433-899d-2e182d6532fe`) in the backup filename/notes — this is the rollback point.
3. Separately extract and save the two live nodes' current `jsCode` (pre-fix) so a targeted revert is a two-op `updateNodeParameters` if needed.

### (b) Exact final jsCode to set on live (VERBATIM from the clone — no edits, no test refs)
- `disallowed-entity-gate` ← contents of `n8n-workflows-init/tests/reviews/fix-gate-render-notfound-msg.disallowed-entity-gate.PROMOTE.js`
  (sha256 `f5a4f7cee37919aa2056421fb76e3269470bcfe94c26fbfaa33b60460f708cb8`)
- `not-found-error-message` ← contents of `n8n-workflows-init/tests/reviews/fix-gate-render-notfound-msg.not-found-error-message.PROMOTE.js`
  (sha256 `90cb341606b0c45443fa7cc3b9261c2ac54f10a0f04be6d19e6b819aa6b0a77f`)
Confirm both `$('…')` node references inside the bodies (`Call 'sub-query-reformulator'`, `resolve-entity`, `disallowed-entity-gate`) exist by those exact names in live before applying (they do in the spine).

### (c) update_workflow ops (live `9qVyfUxmRQqrpGRMDLRuz`)
Two `updateNodeParameters` ops in one `update_workflow` call (granular ops, ≤100 — LESSONS #3):
- op1: `updateNodeParameters` node `disallowed-entity-gate`, set `parameters.jsCode` = PROMOTE file 1 contents.
- op2: `updateNodeParameters` node `not-found-error-message`, set `parameters.jsCode` = PROMOTE file 2 contents.
Expect ONLY pre-existing validation warnings (HARDCODED_CREDENTIALS, DISCONNECTED_NODE, OpenAI builtInTools, transcribe MISSING_EXPRESSION_PREFIX — LESSONS #13). Any NEW warning → STOP and revert from (a).
If the live workflow must be re-published for the active version to pick up the change, publish after the update and verify `activeVersionId` advances.

### (d) Post-promote validation + manual sanity check
1. Re-`get_workflow_details 9qVyfUxmRQqrpGRMDLRuz`; assert: both nodes' `jsCode` sha256 equals the two PROMOTE shas above; live gate now has 0 hits for `No product found for the requested item` / `the selectable set is products only`; live not-found now has 1 hit for `q.domain_hint === 'product_attachment'`; nodeCount unchanged (75); no connection changes.
2. Confirm no other node changed (diff node-name set + per-node param hash vs the backup; only the two target nodes differ).
3. Manual sanity check on a REAL but SAFE-to-yourself contact (e.g. the operator's own WhatsApp / a staff test number — never a real customer): send "SPAN cert for srtwt03C or SRTUFV101" → expect a clean not-found "Could not find a SPAN cert for product …" with NO "please choose" and NO 18-code list; send "SPAN cert for WC286" → expect the short SRTWC286-* "please choose" list (the `product_attachment` prefix there is intended). Watch the live execution to confirm `disallowed-entity-gate.require_specific` flips correctly and no errors.
4. Rollback if anything looks wrong: re-apply the two pre-fix jsCode bodies from (a) via `updateNodeParameters` (re-publish if needed).

### Promotion authorized — execute only on the user's explicit go.
