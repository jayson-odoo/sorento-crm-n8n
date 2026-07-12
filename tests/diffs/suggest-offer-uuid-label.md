# Node-diff — `fix-suggest-offer-uuid-label` (promotion did-you-mean UUID leak)

**Change-id:** `suggest-offer-uuid-label`
**Plan:** `../plans/fix-suggest-offer-uuid-label.md`  ·  **UAC:** `../UAC.md` §V0, §16–§19
**Target (edited):** CLONE `txiPzSxy3Pclsz6v` (`sorento-consume-main TEST`) › node `build-suggest-offer` (`n8n-nodes-base.code`, id `7972abd8-5d6b-40ff-9d38-152782cd8091`).
**Live spine `9qVyfUxmRQqrpGRMDLRuz` — NOT touched.** No promotion (user-gated) performed.

## Scope
- **Single node changed:** `build-suggest-offer` jsCode only. No connections, no other nodes, no new nodes.
- **Change-level:** `deterministic` (pure spine code; reformulator bypassed via `mock_parser_output`; `resolve-entity`/get-results are real READs). No test guards added (deterministic logic — nothing to strip for promotion).

## Base / rebase (LESSON: rebase-on-live)
- The CLONE's `build-suggest-offer` was **STALE**: it lacked the shipped comma-strip fix (both join sites used `[...codes, YES, NO].join(',')`).
- LIVE active version `bea42215-535c-43af-8339-13532d75111a` HAS the comma-strip (`.map(s => String(s).replace(/,/g, '')).join(',')` on both join sites).
- **This build = current-LIVE base (comma-strip preserved) + UUID fix layered on.** I pulled the LIVE jsCode as base, applied the UUID deltas, and verified all non-UUID paths are byte-identical to LIVE (see Verification). The comma-strip `.map(...replace(/,/g,'')...)` is retained on every join site (code-mode, numbered-mode, D2 non-uuid, D2 numbered).

## How applied
- `update_workflow(workflowId=txiPzSxy3Pclsz6v, operations=[{type:"setNodeParameter", nodeName:"build-suggest-offer", path:"/jsCode", value:<new body>}])` → 1 op applied.
- **Published** the clone: `publish_workflow(txiPzSxy3Pclsz6v)` → activeVersionId `df13075e-0962-4b61-b4b5-510b614d50e8`. Required because the clone is invoked by `zz-canary-run` via `executeWorkflow`, which resolves the **published** version (LESSON 37). Prior active was `45f67ec0-…`; the published draft = prior active + this single node edit only (no other draft divergence — `versionId==activeVersionId` before the edit).
- Applied jsCode is byte-identical to the validated file through the entire body (only an n8n-appended trailing newline differs — cosmetic, non-load-bearing).

## The deltas (grouped)

### Δ1 — new helpers (added after `humanList`, before the `unresolved`/gate block)
```js
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s) => UUID_RE.test(String(s || ''));
const humanLabel = (m) => {
  const c = m && m.canonical_code;
  if (c && !isUuid(c)) return String(c);        // prefer a REAL product code
  const d = (m && m.display) || {};
  return d.description || d.product_name || d.name || null;   // else the human name; null ⇒ no label
};
```
**Intent:** promotions have no product code — their `canonical_code` IS the promo uuid, human name in `display.description`. `humanLabel` returns a real code when present, else the display name, else `null` (drop signal).

### Δ2 — D1 (resolution-miss "did you mean") rewrite
**Before (leaked uuid):**
```js
const picks = cap3(d1.cands);
const codes = picks.map(m => m.canonical_code);   // ← UUID for promotions
out.suggest_response = `Couldn't find "${d1.token}". Did you mean ${humanList(codes)}? …`;
out.suggest_quick_reply = [...codes, YES, NO].map(s => String(s).replace(/,/g,'')).join(',');
out.suggest_last_result_set = picks.map((m,i)=>({ idx:i+1, label:m.canonical_code, value:m.canonical_code,
  product:m.canonical_code, uuid:m.uuid||null, entity_type:m.entity_type||null }));
```
**After:**
- `picks = cap3(d1.cands).map(m => ({m, label: humanLabel(m)})).filter(p => p.label)` — **drop** any candidate with a null label (bare uuid, no display name).
- If `picks.length === 0` → do **not** set `suggest_offer` (stays `false`), fall through to D2 / escalate-only (safe degrade, no invented data).
- `anyUuid = picks.some(p => isUuid(p.m.canonical_code))`:
  - **anyUuid === false (all real codes):** **BYTE-IDENTICAL to pre-fix** code-mode — buttons = codes, text = `Couldn't find "…". Did you mean <humanList(codes)>? Reply with a code…`, `last_result_set.label/value/product = m.canonical_code`. Comma-strip on the join **preserved**.
  - **anyUuid === true (promotion / uuid-coded):** **numbered mode** — message text lists human names (`1. <name>\n2. <name>…`), buttons = numbers `["1","2",…]` + Yes/No (comma-stripped join), `last_result_set[i] = {idx, label:humanName, value:humanName, product:canonical_code(=uuid), uuid:m.uuid, entity_type}`. Text: `Couldn't pin down "…". Here are the closest matches:\n1. …\n2. …\nReply with a number to continue, or would you like me to escalate to <team> team?`

### Δ3 — D2 (data-miss "alternatives") defensive fold-in
- Compute `rawPicks = cap3(alts)` then `anyUuidAlt = rawPicks.some(a => isUuid(a.value))`.
- **anyUuidAlt === false:** the **entire pre-fix D2 block runs unchanged — BYTE-IDENTICAL** (date-axis and entity-axis text, `values` from `a.value`, comma-stripped join, `last_result_set` shape identical). (The compat/askedCode/NOUN/noun computation was hoisted above the branch; it has no side effects, so the empty-`values` early-return output is unchanged.)
- **anyUuidAlt === true:** numbered mode — `label = isUuid(a.value) ? (a.display || null) : a.value`; drop null-label alts; buttons = numbers; text = `No <noun> for <askedCode>. Here are the closest matches:\n1. …\nReply with a number…`; `last_result_set[i] = {idx, label, value:label, product:a.value(uuid), uuid:a.uuid||null, display, order_number}`.

## Comma-strip: PRESERVED
All four `suggest_quick_reply` join sites keep `.map(s => String(s).replace(/,/g, '')).join(',')` (code-mode D1, numbered-mode D1, D2 non-uuid, D2 numbered). Numbers/codes have no commas, but the map is kept uniform / future-proof and preserves the shipped fix.

## Invariants (for reviewer)
1. **All-real-product-code offers are BYTE-IDENTICAL to pre-fix (live base).** Verified by diffing LIVE base vs new body output on: product D1 code-mode, D2 entity non-uuid, D2 date-axis, no-candidate passthrough → all IDENTICAL.
2. **No UUID can reach a customer:** every candidate rendered as a button/label passes through `humanLabel`/`display`; a bare uuid with no display name is dropped; if all dropped, `suggest_offer` stays false.
3. **Round-trip intact:** `suggest_last_result_set[idx].uuid` = the promo uuid and `.product` = the uuid; `output_exchange` REFERENCE-POSITIONS reads `row.uuid` straight through (plan §2.1), so a numeric pick re-resolves the correct promotion regardless of the visible (numeric) button.
4. **`suggest_selection_context === 'suggest_offer'`** set on every offer (unchanged), so `suggest-follow-up` still routes the reply.

## Guards to strip for promotion
**None.** This is deterministic business logic; there are no `is_test`/mode branches in this node. Promotion (later, user-gated) is a byte-exact jsCode copy to the live spine `build-suggest-offer` + `publish_workflow`, backup-first + sha-gated (LESSON 24/25).

## Verification (offline, 0-egress, 0-token)
- `node -c` (wrapped as fn body): **SYNTAX OK**.
- Unit tests (`scratchpad/run-tests.js`, mocked n8n `$()` context): **23/23 PASS**
  - V0-a promotion D1: `suggest_offer===true`; NO uuid in response; both descriptions present; buttons `1,2,Yes escalate,No it's okay`; `last_result_set[0].uuid===promo uuid` AND `.label===description`; `selection_context==="suggest_offer"`.
  - V0-b product D1: response + quick_reply **byte-identical** to pre-fix (`CWCX605-RL,Yes escalate,No it's okay`), no numbering.
  - V0-c uuid-no-display single candidate → dropped → `suggest_offer===false`, no `last_result_set`, no uuid anywhere.
  - V0-d D2 uuid alt → display used, numeric button, `product`=uuid; control (real code `SRTWC287`) → unchanged.
- Byte-identity harness (`scratchpad/byte-identity.js`, LIVE base vs new): product D1 code-mode / D2 entity non-uuid / D2 date-axis / no-candidate passthrough → **ALL BYTE-IDENTICAL**.

## Safety / prereqs
- **No Schedule Trigger on the clone** — it is driven by `When Executed by Another Workflow` (executeWorkflowTrigger) via `zz-canary-run`. There is no schedule node that could consume the shared prod `main-message-list`, so the "disable Schedule Trigger" pre-check is N/A (nothing to disable).
- Live spine untouched; no UAC executions run (tester's job); no promotion.
- Validation: `update_workflow` returned only the known pre-existing warnings (LESSON 13: hardcoded x-api-key, DISCONNECTED orphaned egress, transcribe expr-prefix, OpenAI builtInTools) — **no new** warning from `build-suggest-offer`.

## Rollback
- Clone: re-apply the pre-fix LIVE base jsCode (comma-strip version) to `build-suggest-offer` via `setNodeParameter` and re-`publish_workflow`, or `publish_workflow(txiPzSxy3Pclsz6v, versionId="45f67ec0-dc4c-4d49-9afc-d9f0fc339769")` to revert to the prior active version. (Note: prior active `45f67ec0` was the STALE non-comma-strip body; a true rollback to the live-base-with-comma-strip is the re-apply path.)
