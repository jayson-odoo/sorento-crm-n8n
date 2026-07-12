# Node-diff — `vague-token-clarify-split` (coder → reviewer)

Change-id: `vague-token-clarify-split` · Plan: `../../plans/vague-token-clarify-split.md` ·
UAC: `../UAC.md` §13. Implemented 2026-06-29.

## Targets (verify before relying)
> **Updated 2026-06-30 (rebase round).** The reformulator TEST copy was re-based onto
> current live and the stale fork retired. See the **REBASE ROUND** section at the bottom
> for the authoritative current wiring. Table below reflects post-rebase state.

| role | id | edited? | published active version |
|------|----|---------|--------------------------|
| TEST clone (build/test target = "copy 2") | `txiPzSxy3Pclsz6v` | YES — `not-found-error-message` (Change-2 + Refinement-2) + reformulator-call repoint | `4d6bcec4-0751-4c56-9b92-08e822647ec5` |
| reformulator TEST copy (clone calls THIS) **= fresh rebase** | `CpxE8LroLzCkrAQN` (`sub-query-reformulator TEST rebase`) | created fresh = live base + confident (+Refinement-1) | `d1dfdce4-8848-446d-ba97-eec118683d8d` |
| reformulator TEST copy — **STALE, RETIRED** | `SB8wEXKdpITfhYXA` (`sub-query-reformulator TEST (delta2)`) | unpublished + **archived** 2026-06-30 | — (retired) |
| LIVE spine — **NOT TOUCHED** | `9qVyfUxmRQqrpGRMDLRuz` | no | (read-only, for docs grounding) |
| LIVE reformulator sub — **NOT TOUCHED** (`sub-semantic-parser`) | `XTODTw-dJcV0uRdC056hG` | no — verified versionId still `292faed2-2919-4ce9-be12-9359036ccea8`, zero `confident` marker | promotion target only (§ Promotion) |

Both edited workflows were verified **byte-identical to intent** by re-fetching via the
n8n public API and diffing against the locally-generated target text. Both were
`publish_workflow`-ed so `versionId == activeVersionId` (MCP edits land in DRAFT; an
`executeWorkflow` call resolves to the published version — LESSON 17).

> NOTE (original round): the clone's `Call 'sub-query-reformulator'` pointed at
> `SB8wEXKdpITfhYXA`. **Superseded 2026-06-30:** it was repointed to the fresh rebase copy
> `CpxE8LroLzCkrAQN` and `SB8wEXKdpITfhYXA` was archived. See REBASE ROUND.

---

## Change 1 — reformulator test copy `SB8wEXKdpITfhYXA`, node `AI Agent`

Single param edited: `parameters.options.systemMessage`. **Purely additive** — two
insertions, everything else byte-stable. `output_exchange` was NOT edited (it already
preserves any extra entity key through the current-message spread; plan §2.3 hardening
declined).

**Insertion A** — append `confident` to the per-entity contract object (one line):
```
  before: …"current_message": true if the entity is extracted from current message, false if it is from previous context }
  after : …"current_message": true if the entity is extracted from current message, false if it is from previous context, "confident": true|false }
```

**Insertion B** — new `== ENTITY CONFIDENCE ==` section inserted between the entity
contract line and the "Also emit ONE entity_op…" line (verbatim):
```
== ENTITY CONFIDENCE ==
Each entity also carries a "confident" boolean — your certainty that entity.raw is ONE
cleanly-typed referent, and NOT a mash of several concepts forced together.
  - confident: true  → entity.raw is a single clean referent: a single word, a multi-word
    phrase that names ONE thing ("water closet", "skind enterprise sdn bhd"), or a part
    the USER explicitly labeled. This is the DEFAULT — when unsure, prefer true.
  - confident: false → you had to cram MORE THAN ONE concept/type into a single
    entity.raw because the user gave NO separation or label, so you cannot split it
    without guessing. Example: "one siew srtkt72ss" = quantity + a customer-ish name +
    a product code mashed together with no labels → ONE order entity, confident:false.
  When the user DOES label the parts, SPLIT into separate entities, each confident:true:
    "customer one siew, product srtkt72ss"
      → { "raw":"one siew",  "hint":"customer", "confident":true }
      → { "raw":"srtkt72ss", "hint":"product",  "confident":true }
  Vagueness is SEMANTIC, not word-count: a multi-word phrase that is ONE referent is
  confident:true; a single untyped mash of several distinct values is confident:false.
```
The `== OUTPUT ==` block was NOT edited (it says "no comments"; the entity shape lives
only in the contract line, which Insertion A covers). Default-true is stated in the
section, and is also enforced by the consumer (Change 2 uses `=== false`).

**Intent:** make the parser emit a per-entity `confident` bool — `false` only when it had
to mash >1 untyped concept into one `raw`; `true` (default) for one clean referent;
SPLIT labeled input into confident entities. Additive; all other classification behavior
unchanged.

### ⚠ Staleness finding (for reviewer + promotion)
`SB8wEXKdpITfhYXA` is an OLDER copy than the current live `XTODTw`. Sections that DIFFER
between the test copy and live (independent of this change): the CURRENT-DATE separator
box width; the `== DATE FILTER ==` body (live is more verbose); and in `output_exchange`
live has a `_priorEnts0` reuse-fix, an `_isNewQuery` member-pick guard, `customer_order`
axis entries, and a `DATE_FILTER_DOMAINS` gate that the test copy lacks. **This is not a
regression introduced by this change** — it predates it. It matters only because the
anchors for Insertions A/B happen to be byte-identical in BOTH the stale copy and live
(the entity-contract line, the ATTACHMENT/ENTITY-OPERATIONS region), so the SAME additive
text transcribes cleanly onto live at promotion. The tester runs against the copy the
clone calls, so behavior under test is self-consistent.

---

## Change 2 — clone `txiPzSxy3Pclsz6v`, node `not-found-error-message` (Code)

Single param edited: `parameters.jsCode`. The new **vague-token clarify** block is
inserted at the TOP of the existing final `else` (the lookup-miss / escalate branch),
ABOVE the `require_specific` ladder. The shipped Fix-B ladder (from
`fix-gate-render-notfound-msg`) is preserved **byte-identical**, now nested inside the
`else` of the new check. Net code added (the only new lines):

```js
  const allEnts = Array.isArray(q?.entities) ? q.entities : [];
  const normRaw = s => String(s ?? '').trim().toLowerCase();
  const byRaw = new Map(allEnts.map(e => [normRaw(e.raw), e]));
  // vague-token clarify: among UNRESOLVED tokens only, map each back to a reformulator
  // entity by raw and read its `confident` flag. ANY confident:false => vague mash, not a
  // clear-but-missing record => CLARIFY (no escalate offer). Default-true: only === false fires.
  const vagueUnresolved = unresolved.filter(t => byRaw.get(normRaw(t))?.confident === false);

  if (vagueUnresolved.length > 0) {
    is_clarification = true;                       // escalate-catalog: is_escalate_offer = !is_clarification = false
    const labels = humanList(allowedTypes);        // ALLOWED[domain] = gate_debug.allowed_lookup
    const captured = vagueUnresolved.join(', ');
    escalate_message =
      `I captured "${captured}" but couldn't tell which part is which. ` +
      `For a ${q.domain_hint} enquiry, please give me a labeled specific — e.g. ${labels}.`;
  } else {
  /* …existing require_specific ladder, byte-identical (Fix-B preserved)… */
  }
```
A single extra `  }` was added to close the new wrapper `else` (before the final-else
`}`). Brace balance verified; full new jsCode passed a standalone `new Function(...)`
syntax check.

**Intent / behavior:**
- A `confident:false` unresolved token (vague mash) → `is_clarification=true` →
  `escalate-catalog.is_escalate_offer = !is_clarification = false` → a domain-labeled
  clarification ask. Message echoes the captured raw, says "couldn't tell which part is
  which", and draws labels from `ALLOWED[domain]` (= `gate_debug.allowed_lookup`, e.g.
  order → "order, customer_order, transporter, customer, or product"). It contains **NO**
  `escalate to` / `Would you like me to escalate` substring (which previously primed the
  next turn to be read as an escalation confirmation).
- Any unresolved token whose entity is `confident:true` (or has no `confident` key) →
  filter `=== false` is false → the existing escalate-ladder runs unchanged.
- `Aggregate1` 0-result re-entry: `unresolved` is empty → `vagueUnresolved=[]` → ladder
  unchanged (data-miss never masquerades as vague-clarify).

No edit to `escalate-catalog`, `If3`, `tag-not-found`, `disallowed-entity-gate`,
`resolve-entity`, or any downstream node — the `is_clarification → !is_escalate_offer`
coupling in `escalate-catalog` is the entire mechanism (verified verbatim).

---

## Change 3 — loop/state: none
No new conversation variable / session field. The current-turn `confident` flag is the
entire control (plan §4). Confirmed: no node added or state written.

## Change 4 — docs (deliverable)
- `docs/flows/sorento-consume-main.md` — branch ladder (If2/If10/If9/If1/If3),
  not-found four arms (incl. the new vague-clarify), escalate-catalog branch_kind map,
  tag-* setters. Grounded against live `9qVyfUxmRQqrpGRMDLRuz`.
- `docs/flows/sub-query-reformulator.md` — `confident` semantics, entity ops, OUTPUT
  schema, LLM ↔ output_exchange split, test bypass.

---

## §9 static checks (coder-verifiable)
- **V-C3 (raw-match key) — IMPLEMENTED & VERIFIED STATICALLY.** Mapping uses
  `normRaw = trim().toLowerCase()` on both `q.entities[].raw` and
  `resolve-entity.unresolved_tokens[]`. Per plan, exec `6965779` shows both sides equal
  `"One siew srtkt72ss"`, so the normalized map hits. If the resolver ever re-tokenizes a
  phrase into separate tokens the map would miss — RUNTIME-VERIFY this for the §13a token.
- **V-C1 (resolver AND customer∧product → order)** — RUNTIME-VERIFY (tester, §13b). Not
  statically checkable from the workflow; resolver is the external CRM endpoint.
- **V-C2 (reformulator reliably SPLITS labeled input into 2 confident entities)** —
  RUNTIME-VERIFY (tester, §13b / §13a-parser, real reformulator). The prompt instructs the
  split explicitly (Insertion B worked example); confirm emission empirically.

## Validation
`update_workflow` returned only the documented pre-existing warnings (LESSON 13):
hardcoded `x-api-key` on http nodes; `DISCONNECTED_NODE` on the deliberately-orphaned
egress nodes (`send-message-files/images/video`, `update-human-intervened`,
`save-session-vars` PUT, `Call 'sub-respond-save-message-redis'2`, `Code in JavaScript`,
`sorento-sub-respond-sendmsg-respond3`); OpenAI `builtInTools`; the transcribe
expression-prefix; and `Postgres Chat Memory` subnode-connection on the reformulator copy.
**No new warning** was introduced by either edit. (This MCP's `validate_workflow` validates
SDK *code*, not a workflow id; for live-edited workflows the `update_workflow`
validationWarnings are the authoritative check.)

## Zero-egress / safety posture (unchanged by this change)
- Clone `txiPzSxy3Pclsz6v` egress nodes remain orphaned (0 inbound) — confirmed in the
  post-edit warnings. Shared-sub calls still pass `is_test=true`. The vague-clarify path
  routes through `escalate-catalog → cs-offer-gate → compile-current-state → guarded send`
  — no assignment/SLA/PIC/comment node, so §0 S2 holds for §13a/§13e (not the escalation
  branch). The change touches only message text + two booleans; it adds no egress.
- Clone is now `active=true` (publish side-effect) but has NO auto-trigger (only
  `When Executed by Another Workflow`) and no Schedule Trigger, so it cannot self-run or
  consume the shared prod `main-message-list`. Tester drives it via `execute_workflow` /
  the `zz-canary-run` wrapper.

---

## PROMOTION (user-gated; do NOT run now)
Two artifacts promote onto LIVE; both are clean transcriptions.

1. **Live reformulator `XTODTw-dJcV0uRdC056hG`, `AI Agent.options.systemMessage`:**
   apply Insertion A + Insertion B above **verbatim** at the same anchors (the
   entity-contract line and the line before "Also emit ONE entity_op…" — both
   byte-identical in live). Pure-parse / zero-egress, but **MUST `publish_workflow`
   after** (drafts don't auto-run). Do NOT touch any other section of live's prompt — it
   legitimately differs from the stale test copy (see staleness finding).

2. **Live spine `9qVyfUxmRQqrpGRMDLRuz`, `not-found-error-message.jsCode`:** apply the
   Change-2 vague-clarify block (the new lines above + the one wrapper `}`), preserving the
   live ladder byte-identical. Backup-first; guards N/A (this node has no guard).

**Revert lever (test wiring, not promoted):** the clone's `Call 'sub-query-reformulator'`
points at `CpxE8LroLzCkrAQN` (post-rebase). To run the clone against the live reformulator
instead, repoint that node's `workflowId.value` back to `XTODTw-dJcV0uRdC056hG`. (Not part
of promotion; documented so the wiring is reversible.)

---

# REBASE ROUND — fresh live-based reformulator copy + Refinements 1 & 2 (2026-06-30)

**Why.** The prior reformulator TEST copy `SB8wEXKdpITfhYXA` was an OLDER fork of live
`XTODTw-dJcV0uRdC056hG` (`sub-semantic-parser`). It diverged from live in exactly two
node params (verified by re-fetch + diff): `AI Agent.options.systemMessage` (live has the
verbose `== DATE FILTER ==` body; the stale copy had the terse one) and
`output_exchange.jsCode` (live has the `_priorEnts0` reuse-fix, `_isNewQuery` member-pick
guard, `customer_order` axis entries, and the `DATE_FILTER_DOMAINS` gate; the stale copy
lacked them). All other 5 nodes were byte-identical between stale and live. Because
promotion applies the `confident` change onto LIVE (which HAS the reuse-fix), the change
must be validated on top of the CURRENT live base — so a fresh copy was built.

## Fresh copy `CpxE8LroLzCkrAQN` (`sub-query-reformulator TEST rebase`)
Built via `create_workflow_from_code` (skeleton) + `update_workflow` (exact param
injection); the two giant strings were verified **byte-identical by SHA** after deploy
(`get_workflow_details` → `jq -j` → `diff`/`shasum`).

| node | state in fresh copy | proof |
|------|---------------------|-------|
| `When Executed by Another Workflow` (exec trigger, v1.1) | byte-identical to live (incl. the `is_test` / `mock_reformulator_output` inputs) | jq diff vs live = IDENTICAL |
| `OpenAI Chat Model` (lmChatOpenAi v1.3, gpt-5.4-mini, temp 0) | byte-identical to live; cred auto-bound to `sorento-openai` (`o130We0PEJ77Z1lH`) | jq diff vs live = IDENTICAL |
| `test-reformulator-bypass` (IF v2.3) | byte-identical to live: `is_test===true AND !!mock_reformulator_output` → onTrue `mock-reformulator-output`, onFalse `AI Agent` | jq diff vs live = IDENTICAL |
| `mock-reformulator-output` (code v2) | byte-identical to live | jq diff vs live = IDENTICAL |
| `AI Agent` (agent v3.1) | promptType/text/options(non-sysmsg) byte-identical to live; **systemMessage = live base + confident insertions A+B + Refinement-1** | SHA `eb382bcd…` matches generated target |
| `output_exchange` (code v2, runOnceForEachItem) | **byte-identical to LIVE** (carries the reuse-fix etc.) | SHA `da533ee6…` matches live |
| `Postgres Chat Memory` (memoryPostgresChat v1.3) | **ORPHANED** (not in `connections`; `ai_memory` unwired from AI Agent) + bound to **`n8n_test-db`** (`Dnnofg8Xb27VQOhI`), NOT prod | connections check: "NO CONNECTIONS (orphaned)" |

### Memory-node safety (hard requirement)
Live's `XTODTw` already has `Postgres Chat Memory` **orphaned** (its `ai_memory` output is
empty `[[]]`, never wired to the AI Agent) — the live `sub-semantic-parser` runs the parser
statelessly. The fresh copy reproduces that orphaning AND additionally pins the credential
to `n8n_test-db` (added via `update_workflow addNode` with no connection). **Orphaned is the
load-bearing guarantee**: an unconnected memory subnode never executes, so it performs
**zero chat-memory read/write against any DB** regardless of credential. (`get_workflow_details`
redacts all credentials to `null`, so the n8n_test binding can't be read back via MCP, but
the orphaning — which is what matters — is verified in `connections`.) This matches the G1
finding on the stale copy (memory loads=0/saves=0).

### Confident insertions on the fresh copy (= promotion artifact)
Applied at the same byte-identical anchors that exist in BOTH the stale copy and live:
- **Insertion A** — entity-contract line gains `, "confident": true|false` before `}`.
- **Insertion B** — the `== ENTITY CONFIDENCE ==` section, inserted between the contract
  line and "Also emit ONE entity_op…". The block is **byte-identical to the stale copy's
  Insertion B** EXCEPT for **Refinement 1** (below) — confirmed by extracting and diffing
  the block from both.

**Refinement 1 (anti-misuse clause, additive inside `== ENTITY CONFIDENCE ==`):**
```
  A lone code or single token is ONE clean referent → confident:true EVEN IF you doubt it
  exists in the system — existence is the resolver's job, not yours. Set confident:false
  ONLY when you had to cram MORE THAN ONE untyped concept into a single raw because the
  user gave no separation or label.
```
Placed immediately after the `confident:false` bullet, before the "When the user DOES
label the parts, SPLIT…" line. Intent: the LLM must NOT mark a doubtful lone code
`confident:false` — existence is the resolver's job, so a lone code stays `confident:true`
(→ escalate path, not vague-clarify). Everything else in the section is byte-stable.

## Refinement 2 — clone `txiPzSxy3Pclsz6v`, `not-found-error-message` (Code)
The vague-clarify branch (Change-2) is now **partial-aware**. Only the message-assignment
inside `if (vagueUnresolved.length > 0)` changed; the Fix-B ladder in the `else` and all
other branches are **byte-identical** (verified). `new Function(jsCode)` syntax check
passed; braces balanced (55/55). Net new logic:
```js
    const captured = vagueUnresolved.join(', ');
    // partial-aware: name what DID resolve (entities not in unresolved), excluding the vague blob(s).
    const unresolvedSet = new Set(unresolved.map(normRaw));
    const resolvedEnts = allEnts.filter(e => e && e.raw && !unresolvedSet.has(normRaw(e.raw)));
    const resolvedSummary = resolvedEnts
      .map(e => `${e.hint || 'item'} ${e.raw}`.trim())
      .filter(Boolean)
      .join(', ');
    if (resolvedSummary) {
      escalate_message =
        `I understood ${resolvedSummary}, but couldn't make out "${captured}" — ` +
        `is that a ${labels}? Please label it, e.g. customer <name>, product <code>.`;
    } else {
      escalate_message =                     // ← unchanged original message (no-resolved case)
        `I captured "${captured}" but couldn't tell which part is which. ` +
        `For a ${q.domain_hint} enquiry, please give me a labeled specific — e.g. ${labels}.`;
    }
```
- `resolvedSummary` = the `q.entities` whose `raw` did NOT land in `resolve-entity`'s
  `unresolved_tokens` (so it excludes the `confident:false` blob, which is unresolved by
  definition), rendered as `hint raw`. For
  `promotion for water closet, one siew srtks72ss`: "water closet" resolves →
  `resolvedSummary = "product water closet"` (or whatever hint), and the blob
  `one siew srtks72ss` is echoed as `captured`.
- Non-empty `resolvedSummary` → the new partial-aware message acknowledging what was
  understood and echoing ONLY the blob. Empty → the original "couldn't tell which part is
  which" message (byte-identical to Change-2).
- Still `is_clarification=true`; **no** `escalate`/`Would you like me to escalate`
  substring; labels from `gate_debug.allowed_lookup`.

## Validation / warnings (only NEW vs documented pre-existing set)
- Fresh copy `update_workflow`/publish warnings: `SUBNODE_NOT_CONNECTED` +
  `DISCONNECTED_NODE` on `Postgres Chat Memory` (INTENDED — the orphaning; matches the
  stale copy's pre-existing memory-subnode warning) and the OpenAI `builtInTools` warning
  (matches live byte-for-byte). **No new warning.**
- Clone `update_workflow`/publish warnings: the documented set only — hardcoded `x-api-key`
  on the http nodes; `DISCONNECTED_NODE` on the six deliberately-orphaned egress nodes;
  `MISSING_EXPRESSION_PREFIX` on `Transcribe a recording`; OpenAI `builtInTools`. **No new
  warning** introduced by the repoint or Refinement-2.
- Both fresh copy and clone published so `versionId == activeVersionId` (LESSON 17).

## Zero-egress / safety posture (rebase round)
- Fresh copy is an exec-trigger-only sub (`triggerInfo`: "no production triggers… manual
  mode only") → cannot self-run. Its only DB-capable node (memory) is orphaned. No egress
  node exists in the reformulator. The `is_test` short-circuit (bypass→mock) is preserved
  byte-identical to live, so a test run with a mock never executes the AI Agent/LLM.
- Clone unchanged in egress posture: 6 egress nodes still orphaned (confirmed in warnings);
  shared-sub calls still pass `is_test=true`; clone has **no Schedule Trigger** (verified 0)
  so editing it cannot consume the prod `main-message-list`.

## Live untouched (verified by read-back)
- `XTODTw-dJcV0uRdC056hG`: `versionId == activeVersionId == 292faed2-2919-4ce9-be12-9359036ccea8`
  (unchanged from session start), `systemMessage` = 22528 bytes, **zero** `ENTITY CONFIDENCE`
  / `confident` markers. Byte-untouched.
- `9qVyfUxmRQqrpGRMDLRuz` (live spine): no operation was ever issued against it. Untouched.

## PROMOTION (updated — now a CLEAN apply onto live)
Because the fresh copy **IS** `live + confident (+Refinement-1)`, transcription onto live
is now byte-clean (no staleness gap to reason around):
1. **Live reformulator `XTODTw-dJcV0uRdC056hG`, `AI Agent.options.systemMessage`:** the
   fresh copy's systemMessage minus nothing — i.e. apply Insertion A + Insertion B
   (which now includes Refinement 1) at the byte-identical anchors. Diffing the fresh
   copy's systemMessage against live yields EXACTLY the additive insertion (one contract
   line edit + the `== ENTITY CONFIDENCE ==` block). `publish_workflow` after.
2. **Live spine `9qVyfUxmRQqrpGRMDLRuz`, `not-found-error-message.jsCode`:** apply the
   Change-2 block **with Refinement-2's partial-aware variant** (the clone's current
   `not-found-error-message` jsCode is the exact promotion source; the Fix-B ladder is
   byte-identical to live's). Backup-first; guards N/A.

## Flag for tester (new UAC cases)
- **COMPOUND-PARTIAL:** `promotion for water closet, one siew srtks72ss` → "water closet"
  resolves, `one siew srtks72ss` is the `confident:false` blob → expect partial-aware
  clarify: message acknowledges the resolved part (`I understood …`), echoes ONLY the blob,
  asks to label it; `is_clarification=true`, no escalate substring.
- **LONE-DOUBTFUL-CODE (Refinement 1):** a single unknown code (e.g. a lone `srtks72ss`
  with no other untyped concept) → parser must emit `confident:true` → NOT vague-clarify →
  the normal escalate ladder (data-miss "Could not find … escalate?"). Confirms a doubtful
  lone code is NOT marked `confident:false`.
