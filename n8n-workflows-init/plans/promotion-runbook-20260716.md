# PROMOTION RUNBOOK — four approved changes → LIVE (2026-07-16)

> **DOCS-ONLY artifact.** Nothing here was executed. This is the step-gated script the USER reviews, then
> drives (or authorizes a fresh agent to drive) later. No live workflow was edited during its creation.

## Exec summary

Four reviewed/APPROVED changes are ready to promote from the fork/clone to LIVE in ONE user-gated session:
**domain-continuity-carry (rev4, intent-only)**, **decline-flag**, **dym-candidate-map**, and
**query-forward-sibling-picker (phase-1, D3 now ALWAYS-NUMBERED)**. They land on exactly two LIVE targets: the
reformulator sub **`XTODTw-dJcV0uRdC056hG`** (baseline versionId `53ea677a…`) and the spine
**`9qVyfUxmRQqrpGRMDLRuz`** (baseline versionId `bcdb5633…`). Promote **reformulator FIRST, spine SECOND**; each
half is a safe no-op alone, but the dym + sibling features span both halves and need both live in the same
session. Every live node here co-hosts MULTIPLE stacked changes — **splice content-anchored hunks only; NEVER
wholesale-replace a node.** I re-extracted all four workflows via MCP at their current versions and verified:
(a) live sub + spine are UNTOUCHED at the reviewer-recorded versionIds; (b) the fork's `AI Agent.systemMessage`
is **byte-identical to live** (rev4 removed the `domain_signal` field → **no systemMessage splice**); (c) the
full live↔fork `output_exchange` delta is EXACTLY the three approved change-families with **zero unexpected
live-only drift**; (d) all 7 external `$('…')` node-refs used by the 4 new sibling nodes exist on live spine;
(e) `family-fetch`'s hardcoded `x-api-key` already equals the live spine key (no change); (f) `sibling-probe`
still points at the TEST get-results fork and **must be remapped** to live `Fss5aAaXthJSWpZCgKiKR`. One flag: the
live clone D3 is now the USER-requested **always-numbered** variant, which differs from the block the reviewer
signed off (anyHasIncoming-split) — recommend a 2-minute re-glance of that one block, not a re-review cycle.

---

## 0. Recorded LIVE baseline (rollback targets) + SOURCE versions — verified via MCP this cycle

Sha method (this doc): `sha256(<exact string>)` first 16 hex. For jsCode leaves the string is `parameters.jsCode`;
for the 4 new nodes it is `JSON.stringify(parameters)`. **These are internally-consistent drift checkpoints for
THIS runbook** — at promote time re-extract live and re-diff live↔fork *content directly* (that is the real gate);
do not gate on any prior-review doc's shas (different tooling, all stale).

### LIVE targets (the backup / rollback anchors)

| target | id | versionId (==activeVersionId) | updatedAt |
|---|---|---|---|
| live reformulator sub `sub-semantic-parser` | `XTODTw-dJcV0uRdC056hG` | **`53ea677a-e078-482e-bea2-17efe5859189`** | 2026-07-14T03:36Z |
| live spine `sorento-consume-main` | `9qVyfUxmRQqrpGRMDLRuz` | **`bcdb5633-f760-451b-b0a8-fc03a0d884c8`** | 2026-07-13T15:03Z |

Both had `versionId == activeVersionId` (no pending draft). Live is UNTOUCHED — matches every reviewer note.

**Live node baseline shas (capture these bodies to `tests/reviews/backups/` BEFORE any edit):**

| live node | workflow | jsCode / leaf sha (baseline) |
|---|---|---|
| `AI Agent`.parameters.text | `XTODTw` | `2415010481def601` |
| `AI Agent`.parameters.options.systemMessage | `XTODTw` | `8935aa4665330ae0` |
| `output_exchange`.jsCode | `XTODTw` | `3d4f510ae52eaf67` |
| `suggest-follow-up`.jsCode | `XTODTw` | `b28dda66889f9021` |
| `build-suggest-offer`.jsCode | spine | `f1558d5a1397fd0a` |
| `compile-current-state`.jsCode | spine | `5c482169c5dcd0be` |

### SOURCE of promoted bytes (fork + clone) — pull the exact hunk text from these LIVE bodies at promote time

| source | id | versionId (==activeVersionId) | updatedAt |
|---|---|---|---|
| fork `sub-semantic-parser FORK domain-continuity-carry` | `wI5RkNGW3EOJfBdo` | **`711b689c-8feb-4951-89ee-3fa6fe7b4d75`** | 2026-07-15T21:45Z |
| clone `sorento-consume-main TEST` | `txiPzSxy3Pclsz6v` | **`335f0cfa-82ce-431a-8437-73428d93bbd6`** | 2026-07-15T23:06Z |

| source node | workflow | sha |
|---|---|---|
| `AI Agent`.text | fork | `b9b564fe7e3cd0fa` |
| `AI Agent`.systemMessage | fork | `8935aa4665330ae0` **(== live → NO splice)** |
| `output_exchange`.jsCode | fork | `5741285cd11050e4` |
| `suggest-follow-up`.jsCode | fork | `1760700433b86e10` |
| `build-suggest-offer`.jsCode | clone | `3835dede33ab5bf1` |
| `compile-current-state`.jsCode | clone | `b5dff7dd4a37a481` |
| `sibling-gate` (params) | clone | `fbe61be6ffd79c73` |
| `family-fetch` (params) | clone | `d03269cd6c20bfce` |
| `sibling-transform` (params) | clone | `408cc2ab65d4e104` |
| `sibling-probe` (params) | clone | `addc24079a9f2c26` |

> All prior-rev shas in the review docs (`97baa9ee`, `784cfc31`, `c47d6754`, `216ea6d0`, `73bfdc8a`,
> `639cf44f`, `732fdeeb`, `6af34046`, `3246db0c`, `45699b20`, `7972abd8`, `f7e6afd0` …) are **STALE** — they were
> cut at earlier fork/clone revisions. Re-derive fresh from `711b689c` (fork) / `335f0cfa` (clone) at promote.

---

## 1. Ordered steps (reformulator-first)

**STEP 1 — live reformulator sub `XTODTw`** (domain-continuity rev4 + decline-flag + dym-consume).
**STEP 2 — live spine `9qVyfUxmRQqrpGRMDLRuz`** (dym-build/persist + sibling-picker D3 + 4 new nodes).

**Why this order & why both in one session:**
- Each half is a **safe no-op alone**: dym-consume in `XTODTw` early-returns when `dym_candidates` is absent, and
  live never populates that field until the spine build/persist lands — so promoting the sub first is inert until
  the spine catches up; promoting only the spine writes an unread field. Neither breaks live.
- But the **dym feature spans BOTH halves** (spine builds `dym_candidates` → sub consumes it) and the **D3
  number-pick continuation depends on domain-continuity being live on the sub** (an entityless/positional pick must
  inherit `domain_hint:incoming`). So do **both halves in the same gated session**, sub first.
- The **decline-flag** consumer (`is-escalation-declined`) is ALREADY on the live spine — decline-flag takes effect
  standalone the moment the sub is promoted (no spine dependency).

---

## 2. Per-live-node splice map — content-anchored hunks (NEVER wholesale-replace)

> Two live nodes each carry MULTIPLE stacked changes. Splice by CONTENT anchor; confirm the ONLY live↔source
> deltas are the listed approved hunks before writing. Live line numbers differ from the fork/clone (the fork's
> `output_exchange` is +7.1 KB / ~105 inserted lines vs live, so everything shifts down).

### 2A. `XTODTw` › `AI Agent` — leaf `.parameters.text` (domain-continuity rev4 ONLY)

Full-leaf replace of a 285-char string (byte-exact from fork). Live (3 lines) → fork (2 lines):

- **DELETE** the `Previous domain: {{ JSON.stringify(...domain_hint) }}` line entirely.
- **SANITIZE** line 1: `Previous response:` value wraps the response in
  `String(... ?? '').replace(/^Previous turn \([a-z_]+\)/i, 'Previous turn')` (strips the domain tag out of the
  echoed prior turn so it can't re-contaminate).
- **RELABEL** line 2 `User answered:` → `Current user message:`.

Fork sha `b9b564fe7e3cd0fa`. (This is the entire AI Agent change — see 2B.)

### 2B. `XTODTw` › `AI Agent` — leaf `.parameters.options.systemMessage` → **NO CHANGE**

Live systemMessage sha `8935aa4665330ae0` **==** fork sha `8935aa4665330ae0` (byte-identical). rev4 removed the
additive `domain_signal` OUTPUT key + its CLARITY definition, returning the prompt to the original live bytes.
**Do NOT touch this leaf at promote.** (It was a hunk in rev1–3; GONE in rev4. This is the rev4 payoff.)

### 2C. `XTODTw` › `output_exchange` — jsCode — **THREE stacked change-families spliced into one node**

I diffed live↔fork `output_exchange` in full: **8 live-only lines, 105 fork-only lines.** Every one of the 8
live-only lines is explained by an approved family (no stray live logic that a splice would lose):
- 5 lines = a dead `/* … */` reuse-carry comment the domain-continuity change replaces with real code (harmless removal).
- 1 line = the plain-offer decline arm without the flag (decline-flag rewrites it — hunk (i)).
- 1 line = the un-guarded `if (_selCtx === 'member_offer') {` (dym rewrites it — hunk (v)).
- 1 line = a spurious `return output` alignment artifact (identical single `return output` at EOF in both — benign).

**Conclusion: at TODAY's versions the fork `output_exchange` is a clean superset of live + the three approved
families, no unexpected live-only drift.** Still splice (not wholesale) — re-run this diff at promote time in case
live drifts, and STOP if any NEW live-only line appears that is not one of the four items above.

Hunks to splice (fork line anchors at `711b689c`; locate by CONTENT on the live body):

| # | change | anchor / content | edit |
|---|---|---|---|
| (i) | decline-flag | plain-offer decline arm: `else if (offeredEscalation && isDecline && !_isPositionPick && !_reqHelp)` → the `output.output.escalation = { is_escalation_confirmation: false }` line | add `, escalation_declined: true` inside that object (one-property add). *(Live's member_offer decline arm ALREADY has `escalation_declined:true` — do NOT re-add there.)* |
| (ii) | domain-continuity | intent-only block (fork L196–202): `_DECISIVE_INTENTS` 11-set + `const _explicit = _DECISIVE_INTENTS.has(output.output.intent_hint) && !!output.output.domain_hint;` + `output.output.domain_signal_source = _explicit ? 'intent_explicit' : 'intent_none';` (diagnostic) | insert the block (top-level, before the `entity_op` switch) |
| (iii) | domain-continuity | reuse-path carry site (fork `case 'reuse':` L261): `if (!_explicit) { carry domain_hint+intent_hint; set domain_reused_entityless; DON'T overwrite message_type }` | insert into the reuse case |
| (iv) | domain-continuity | entity-bearing carry site (fork ~L474 `if (!_explicit)`): compat `every()` gate against `DOMAIN_BLOCKED_HINTS[prevDom]`, OVERRIDE→`domain_inherited_compatible` else `domain_inherit_blocked`; runs BEFORE blocklist-apply | insert the compat-gated carry block |
| (v) | dym | `tryDymPick` IIFE (fork L144) — anchor: **after FLYER INJECTION (L127), before the entity-op executor** | insert the self-contained IIFE (reads `previous_conversation_state`/`output.output`/`latest_user_message` only) |
| (vi) | dym | member-block guard (fork L583): `if (_selCtx === 'member_offer') {` → `if (_selCtx === 'member_offer' && output.output.dym_pick_applied !== true) {` | one-token add on the existing live line |

`node --check` the spliced result. Hunks (ii)/(iii)/(iv) are domain-continuity; (v)/(vi) are dym; (i) is
decline-flag — all three families ARE being promoted here, so they legitimately land together on this node.

### 2D. `XTODTw` › `suggest-follow-up` — jsCode (decline-flag ONLY)

Single-line change (live↔fork delta is exactly this one line; `escalation_declined` live=0 → fork=1):
- Decline arm (fork L28, gated on `prevState.selection_context === 'suggest_offer'`):
  `_o.escalation = { is_escalation_confirmation: false };` → `_o.escalation = { is_escalation_confirmation: false, escalation_declined: true };`
- `suggest-follow-up` has **no outbound edge** (terminal node) — nothing downstream strips the flag. The
  pre-existing `domain_inherit`/pick block in this node is present in BOTH live and fork (count 1 each) — leave it.

### 2E. spine `build-suggest-offer` — jsCode (dym-build + sibling D3)  — **ENTANGLED, splice only**

Live has **NEITHER** dym NOR D3 (markers isDateLike/isCodeShaped/dym_candidates/D3 = 0 on live; clone has them).
Live body = 11,108 chars; clone = 19,210. Splice these clone hunks onto the live body (anchor by content):
- **top helpers** `isDateLike` / `isCodeShaped` (clone L23–24).
- **D1 dym build**: the `dym_candidates` map in both D1 modes (clone L192, L210).
- **D2 dym build**: the two `dym_candidates` blocks with `axis !== 'date'` guard + `.filter(c => isCodeShaped(c.code))` (clone L294/L300, L328/L334).
- **D3 sibling arm** (clone L33–93): the block-scoped `{ … }` that fires only when
  `$('sibling-transform').isExecuted && $('sibling-probe').isExecuted && domain==='incoming'`, then `return out`.
  ⚠️ **This is the ALWAYS-NUMBERED variant — see §5 flag.**
- Insert D3 after the node locals and before the UUID-leak guard (clone L95). Keep D1/D2/escalate/ambiguous-picker
  arms below untouched. `node --check`.

### 2F. spine `compile-current-state` — jsCode (dym persist/clear ONLY)

Live has 0 `dym_candidates`. Splice the **single key** into the `output.variables` blob (clone L231):
`"dym_candidates": (_sug && Array.isArray(_sug.dym_candidates)) ? _sug.dym_candidates : []` (rebuilt-each-turn →
auto-clears to `[]` after one consumption). Touch nothing else in that blob.

### 2G. spine — 4 NEW nodes (port byte-exact from clone `335f0cfa`) + connections

| node | type | clone id | notes |
|---|---|---|---|
| `sibling-gate` | `if` | `c7a42d36-cf3f-4281-8997-e6099ad3b2e9` | 4 AND conditions (sg-dom/sg-req/sg-prod/sg-empty) verbatim |
| `family-fetch` | `httpRequest` (GET) | `dfeef116-ac08-4af5-b7ce-c6b24f67f1b4` | URL already `https://fe-sorento.foundryx.my/api/v1/master-data/products?query=…&variant_filter=all&limit=5000` (PROD read); header `x-api-key` — see §5 (matches live) |
| `sibling-transform` | `code` | `12b20143-a950-419a-8bed-62e6e5a067cd` | strict-family filter; emits one `{siblings[],base_codes[],sibling_count}` |
| `sibling-probe` | `executeWorkflow` | `93ae025d-7d6a-42d6-a8f4-56172cc3c94f` | ⚠️ `workflowId` = TEST fork `rysSPgUssLDf6xJc` — **MUST remap** (see §5) |

**Connections to rewire on live (exactly as clone):**
- REMOVE `not-found-error-message → build-suggest-offer`.
- ADD `not-found-error-message → sibling-gate`.
- `sibling-gate[0] → family-fetch → sibling-transform → sibling-probe → build-suggest-offer`.
- `sibling-gate[1] → build-suggest-offer`.
- Leave `annotate-incoming-picker → build-suggest-offer` and `build-suggest-offer → tag-not-found → escalate-catalog` intact.

---

## 3. Backup-first + sha-gate (LESSON 24/25)

1. **Before ANY edit**, capture to `tests/reviews/backups/` (dated): the live sub + spine current `versionId`
   (`53ea677a`, `bcdb5633`) and the CURRENT jsCode / leaf bytes of every node in §0's live-baseline table.
2. **Drift gate — ABORT-and-reconcile if any live node's current sha ≠ its §0 baseline sha.** A mismatch means live
   moved since this runbook; re-diff and re-plan the splice before proceeding. (Expected: all match — live is
   UNTOUCHED at `53ea677a` / `bcdb5633`.)
3. Source promoted bytes from the LIVE fork/clone params via `get_workflow_details` at promote time (NOT memory,
   NOT stale scratch files) — LESSON 25.
4. Re-run the live↔fork `output_exchange` content diff (§2C): confirm the only live-only lines are the 4 accounted
   items; **STOP** on any new one.

---

## 4. Apply mechanism (MCP)

- **Single-leaf, byte-exact edits** (`AI Agent.text`, the two `escalation_declined` one-property adds, and each
  spliced jsCode result): `update_workflow` → `setNodeParameter {nodeName, path:"/jsCode" (or "/text"), value}`.
  Do **NOT** use `updateNodeParameters` deep-merge for the code nodes (strands siblings — LESSON 32).
- **4 new spine nodes + connection rewire**: one atomic `update_workflow` batch (addNode ×4 + connection ops,
  ≤100 ops) — LESSON 33. Use `updateNodeParameters replace:true` only for wholesale porting the 4 BRAND-NEW nodes
  (they have no live body to preserve).
- **Publish + verify each workflow:** `publish_workflow`; confirm `versionId == activeVersionId` with a NEW
  versionId; **sha-verify the DRAFT == intended BEFORE publish and the ACTIVE == intended AFTER publish**; re-fetch
  and byte-diff the changed leaves vs intended. Auto-revert (`publish_workflow` prior versionId, then restore
  bytes) on any mismatch. Beware the stale-draft revert-landmine (LESSON 24): confirm draft==intended before publish.
- `node --check` every spliced jsCode on live before publish.
- **Publish the sub `XTODTw` FIRST and confirm published**, THEN the spine — the spine references only the
  *published* version of the sub (LESSON 37).

---

## 5. The specific must-dos (verified this cycle)

1. **REMAP `sibling-probe.workflowId`** TEST `rysSPgUssLDf6xJc` (`sub-get-results TEST`) → **LIVE
   `Fss5aAaXthJSWpZCgKiKR`** (`sub-get-results`). Confirmed the clone still targets the TEST fork. Still a READ
   (`crm_incoming_stock_list`) — no egress — but it MUST point at the live sub post-promote.
2. **`family-fetch` x-api-key — NO CHANGE NEEDED (verified).** Clone value `***REMOVED-CRM-API-KEY***`
   **equals** the single `x-api-key` used by all 8 live spine http nodes (resolve-entity / check-access /
   get-cs-members / get-session-vars / …). The URL already targets the PROD CRM base. Port as-is.
3. **Node-ref existence — verified ALL PRESENT on live spine.** The 7 external `$('…')` refs used by the 4 new
   nodes + D3 (`disallowed-entity-gate`, `validator`, `Aggregate`, `sorento-sub-respond-findcontact-respond`,
   `resolve-entity`, `Call 'sub-query-reformulator'`, `Call 'sub-get-results'`) all exist on live spine. (The 2
   self-refs `sibling-transform`/`sibling-probe` resolve once the new nodes are ported.)
4. **Replay `norm()` registration (LESSON 40):**
   - **ADD drop-when-absent** (new diagnostics that now appear on every parser output / session):
     `domain_signal_source`, `domain_inherited_compatible`, `domain_reused_entityless`, `domain_inherit_blocked`,
     and the dym markers `dym_pick_applied` (+ session `dym_candidates`).
   - **DROP the removed** `domain_signal` and `domain_signal_effective` from any prior norm registration (rev1–3
     registered these; rev4 deleted them — they no longer exist on output).

### ⚠️ FLAG — D3 is now the ALWAYS-NUMBERED variant (differs from what the reviewer signed)

The reviewer (`decline-flag-and-sibling-gate.md`, Review 2) approved D3 at the **anyHasIncoming-SPLIT** version on
clone `6af34046` (all-no-incoming families got a list-only / escalate-only leg; only ≥1-has-incoming got numbers).
The **current live clone `335f0cfa`** has the **USER-requested ALWAYS-NUMBERED** D3 (`build-suggest-offer`
L67–89): whenever `extras.length > 0`, it ALWAYS renders a numbered picker (has-incoming-first sort, no cap,
number-pick armed) regardless of incoming — the `anyHasIncoming` split is gone (survives only as a comment on
L69). This is strictly the **phase-1 numbered-picker leg** (which the reviewer proved byte-identical to the e2e-proven
phase-1 picker) applied universally; the newer/less-tested all-no-incoming leg was removed. **Low risk.**
**Recommendation:** before promote, a 2-minute re-glance of just the D3 block (`build-suggest-offer` L33–93 on
clone) to confirm it matches the numbered-picker envelope — NOT a full re-review cycle.

---

## 6. Explicitly NOT bundled

- **`compile-current-state` domain-word leak-at-source** — a SEPARATE future spine change (the parser prompt
  regex in 2A neutralizes the leak at its contamination-relevant consumption point; the source fix is out of
  scope). **Do NOT promote it here.** The only `compile-current-state` edit in this runbook is the one dym
  `dym_candidates` key (§2F).
- The **clone `is_test` / TEST-fork scaffolding** (reformulator/get-results/human-intervention TEST forks,
  orphaned egress) — test-only; never promote.

---

## 7. Post-promote smoke — EGRESS-AWARE (live now has REAL egress)

⚠️ After promote the live spine + sub CAN send real WhatsApp / assign. **Smoke ONLY via the user's OWN WhatsApp
contact `437264483` (Jayson — dev-test-contact)** — send the trigger from that number and read the bot's reply in
that conversation. **NEVER** send to any other contact; never trigger an assignment against a real customer.
Assert reply CONTENT (and that no wrong assignment/SLA fired). Run these 4 (each is a fresh 2-turn chain from
`437264483`):

| # | change under test | trigger (from 437264483) | assert |
|---|---|---|---|
| C1 | domain-continuity (charmant contamination) | T1: an incoming/ETA query for a code; T2: `charmant hardware` | T2 resolves as **order** domain, `charmant hardware` customer retained, **no** stale prior product/file in the reply |
| C2 | domain-continuity (bare-code carry) | T1: `eta <codeA>`; T2: bare `<codeB>` | T2 carries **incoming** domain (re-queries incoming for codeB), not master_products / not clarify |
| C3 | decline-flag (plain-offer decline) | T1: a query that triggers "Would you like me to escalate…"; T2: `no it's okay` | T2 reply is the deterministic **"Escalation declined."** — NOT the clarification LLM, no assignment |
| C4 | sibling-picker D3 (eta-miss → picker) | T1: `eta <code with no incoming but a product family>`; T2: reply a **number** from the offered list | T1 offers the **numbered sibling picker** (has-first, "reply with a number… or 'yes' to escalate"); T2 re-queries THAT sibling's incoming (proves D3+domain-continuity together) |

Optional 5th (dym flagship): a did-you-mean CODE pick → assert the picked code replaces the RIGHT entity while
the prior **customer + date** are retained (`dym_pick_applied=true`, `scope_exclusive=false`). Note the dym review
flagged this is not live-exercisable end-to-end today (resolver emits exact+prefix only), so treat as
best-effort / structural.

Re-confirm §0 S1–S6 posture on the smoke execs (no send to any non-437264483 contact, no assign/SLA/PIC, no wrong
CRM write). If any case sends to a wrong contact or assigns — that is a STOP-and-rollback event.

---

## 8. Rollback (per live workflow, if a smoke case fails)

MCP has no version-`rollback` verb on this server, and re-publishing a prior versionId does NOT reset the draft
(LESSON 24). So rollback = **restore the backed-up node bytes, then publish**:

**Reformulator sub `XTODTw`** (baseline versionId `53ea677a`):
1. `setNodeParameter` each changed leaf back to the §0-backed-up bytes: `AI Agent.text` (`2415010481def601`),
   `output_exchange.jsCode` (`3d4f510ae52eaf67`), `suggest-follow-up.jsCode` (`b28dda66889f9021`).
   (systemMessage was never changed.)
2. `publish_workflow`; confirm `versionId == activeVersionId`; sha-verify each ACTIVE leaf == baseline sha.

**Spine `9qVyfUxmRQqrpGRMDLRuz`** (baseline versionId `bcdb5633`):
1. `setNodeParameter` `build-suggest-offer.jsCode` → `f1558d5a1397fd0a` and `compile-current-state.jsCode` →
   `5c482169c5dcd0be` (backed-up bytes).
2. `removeNode` the 4 new nodes (`sibling-gate`/`family-fetch`/`sibling-transform`/`sibling-probe`) and restore
   connections: re-add `not-found-error-message → build-suggest-offer`, drop the sibling chain edges.
3. `publish_workflow`; confirm `versionId == activeVersionId`; sha-verify the two ACTIVE bodies == baseline.

Because the sub is a safe no-op without the spine (and vice-versa), a partial rollback of just the failing half is
also valid — but prefer reverting BOTH halves to the recorded baseline versionIds so live returns to a known-good,
fully-consistent state. Roll back the SPINE first (removes the dym-consumer's data source), then the SUB.

---

## Appendix — evidence trail (this cycle, MCP source-of-truth)

- Live sub `XTODTw` `53ea677a` / live spine `bcdb5633`: both `versionId==activeVersionId`, UNTOUCHED — match every
  reviewer note (parser-domain-continuity rev4, dym REV2, decline-and-sibling, sibling-phase-1).
- Fork `wI5RkNGW3EOJfBdo` `711b689c` / clone `txiPzSxy3Pclsz6v` `335f0cfa`: current, draft==active.
- `AI Agent.systemMessage` live sha == fork sha (`8935aa4665330ae0`) → no systemMessage splice (rev4 payoff).
- live↔fork `output_exchange` diff: 8 live-only lines, all accounted (dead comment ×5, decline arm ×1, member
  guard ×1, benign `return output` ×1) → no unexpected drift.
- family-fetch `x-api-key` == live spine key (8/8 http nodes use `***REMOVED-CRM-API-KEY***`).
- All 7 external `$('…')` refs used by the 4 new nodes + D3 exist on live spine.
- `sibling-probe.workflowId` = `rysSPgUssLDf6xJc` (TEST) → remap to `Fss5aAaXthJSWpZCgKiKR` (LIVE) is the one
  functional edit on the ported nodes.
- Clone D3 = ALWAYS-NUMBERED (build-suggest-offer L67–89); differs from reviewer's anyHasIncoming-split — flagged.
