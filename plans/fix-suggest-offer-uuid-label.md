# Plan — fix `build-suggest-offer` renders raw UUIDs to customers (promotion did-you-mean)

> **STATUS: PLAN. Docs only — no workflow edited, no execution run.**
> **Root cause is already confirmed (change request); this plan designs the fix + tests, does not re-investigate.**
> **Build/test target = spine clone `txiPzSxy3Pclsz6v` (the `build-suggest-offer` FORK on the clone).**
> **Promote-to-live target (later, user-gated, guards stripped) = live spine `9qVyfUxmRQqrpGRMDLRuz` › `build-suggest-offer`.**
> Same guardrails as the just-shipped comma fix: clone-only build, §0 zero-egress on every case, user-gated + backup-first promotion.

**Target node (single):** `build-suggest-offer` (Code, `n8n-nodes-base.code`, id `7972abd8-5d6b-40ff-9d38-152782cd8091` on live spine; forked on the clone). No other node changes.

**Change-level scope:** `deterministic`. The fix is pure code inside a spine node; the reformulator is bypassed via `mock_parser_output` (0 parser tokens), `resolve-entity` + get-results run as real READS (allowed). The cheapest gate is an **offline unit of `build-suggest-offer`** (§6 V0) feeding the confirmed resolver match shape — it pins the fix with zero dependence on the live resolver's miss-vs-pin nondeterminism.

---

## 1. Problem (confirmed live — do NOT re-investigate)

Promotion did-you-mean shows raw UUIDs to customers:

> Couldn't find "Sorento". Did you mean b2310ac6-fc91-4388-a38b-68ab7f6685d4, 7e9fee38-…? Reply with a code to continue…

(baseline contact 428126355 t26/t28.)

**Cause.** `build-suggest-offer` D1 (resolution-miss "did you mean") renders `m.canonical_code` as the human label of each candidate. For `entity_type:"promotion"`, `canonical_code` **is the promotion UUID** (promotions have no product code); the human name lives in `display.description` (e.g. `"SORENTO HIGH BASIN TAP PROMO_24062026 DEALER.pdf"`). `allowed_lookup` for the promotion domain = `["product","promotion","category","brand"]`, so promotion candidates pass the type filter and reach D1. **Intermittent by design:** when `resolve-entity` PINS one promo the customer gets the PDF (happy path, unchanged); when it MISSES (ambiguous — a broad brand/category token matching ≥2 promos) D1 fires and leaks UUIDs.

**Confirmed resolver match shape** (live exec 7687978):
```jsonc
{ entity_type:"promotion", canonical_code:"406c76cb-…", uuid:"406c76cb-…",
  match_field:"description", display:{ description:"SORENTO HIGH BASIN TAP PROMO_24062026 DEALER.pdf", is_active:true } }
```

### Current D1 code (build-suggest-offer, the offending lines)
```js
const picks = cap3(d1.cands);
const codes = picks.map(m => m.canonical_code);                       // ← UUID for promotions
out.suggest_response = `Couldn't find "${d1.token}". Did you mean ${humanList(codes)}? …`;
out.suggest_quick_reply = [...codes, YES, NO].map(s => String(s).replace(/,/g,'')).join(',');
out.suggest_last_result_set = picks.map((m,i)=>({ idx:i+1, label:m.canonical_code, value:m.canonical_code,
  product:m.canonical_code, uuid:m.uuid||null, entity_type:m.entity_type||null }));
```

**D2 (data-miss "alternatives") carries the SAME latent risk** (verified read): it renders `a.value` as the button/label. If a promotion domain tool returns `alternatives[].value` = a promo UUID, D2 leaks it the same way. D2 already has `a.display` in hand. Fix folds D2 in defensively (same helper). *Whether the promotion tool actually returns a uuid `value` is data-dependent — flagged §7.*

---

## 2. Confirmed downstream facts (verified read — no downstream change needed)

### 2.1 The pick round-trip resolves by UUID from the frozen row — numbering is safe (decision #3)
Reformulator `sub-semantic-parser` (`XTODTw-dJcV0uRdC056hG`, forked `CpxE8LroLzCkrAQN`) has two nodes:
- **`suggest-follow-up`** (runs after `output_exchange`): when `prevState.selection_context === 'suggest_offer'`, a **tapped button title (as reply text) → entity** or a **typed number → `reference_positions`**; both re-query in the retained domain (`domain_hint` inherited). Plain "yes" → escalate; "no" → decline+stop.
- **`output_exchange` REFERENCE POSITIONS → ENTITIES** (lines 287-304): for each `reference_positions` idx it looks up `last_result_set[idx]` and **carries the frozen row's uuid straight through** — verbatim:
  ```js
  resolved.push({ raw, hint, ordinal: pos, current_message: true,
                  uuid: row.uuid || null, canonical_code: row.product || raw });   // "needn't re-resolve"
  ```
  `raw = row.label`; `hint = output.output.domain_hint || 'promotion'`.

**Consequence (decisive):** a numeric reply resolves the chosen promotion **by `last_result_set[idx].uuid`**, independent of what the visible `label` reads. So relabeling buttons to **numbers** and putting human names in the message text keeps the round-trip intact — *provided `suggest_last_result_set` rows keep `uuid` = the promo uuid*, which the current D1 already sets (`uuid:m.uuid`, `product:m.canonical_code`). No reformulator change is required.

### 2.2 The send sub does NOT cap or truncate quick-reply buttons (decision #2)
Send sub `sorento-sub-respond-sendmsg-respond` (`aoydkG1dbItXR5jXFEQsP`), `HTTP Request` node body:
```
"replies": {{ JSON.stringify($json.quick_reply.split(",")) }}
```
It splits on comma and passes titles **raw** to `POST api.respond.io/v2/contact/id:{id}/message` as `message.type:"quick_reply"`. The only length logic in the sub (`Code in JavaScript`, `LIMIT=1800`) chunks the **message text**, never the buttons. So an over-length promo-description button title is forwarded verbatim. WhatsApp reply-button titles have a hard ~20-24 char limit; a 48-char PDF name would be rejected/truncated by respond.io/WhatsApp — **worst case the whole interactive message is rejected and the customer gets nothing** (strictly worse than the UUID leak). The current offer already emits **5 buttons** (≤3 codes + Yes + No), which itself exceeds WhatsApp's 3-reply-button limit — a pre-existing open item (§7). **Numbers ("1".."3") are 1 char and safe under every respond.io interpretation** (button-truncate, list-row, or reject-on-overlength).

### 2.3 The comma fix is already present
`quick_reply` builder does `.map(s => String(s).replace(/,/g,'')).join(',')` — the shipped comma fix. Numeric titles need no comma-stripping but we keep the map uniform.

---

## 3. The fix (all inside `build-suggest-offer`)

### 3.1 UUID detection + human label (decision #1)
Add helpers near the top of the node:
```js
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (s) => UUID_RE.test(String(s || ''));
// prefer a REAL code; else the display name; null ⇒ candidate has no human label
const humanLabel = (m) => {
  const c = m && m.canonical_code;
  if (c && !isUuid(c)) return String(c);
  const d = (m && m.display) || {};
  return d.description || d.product_name || d.name || null;
};
```
**Drop-if-still-UUID:** any candidate whose `humanLabel` is `null` (a bare uuid with no display name) is dropped from the offer. If dropping leaves zero candidates, `suggest_offer` stays `false` → falls through to the existing escalate-only behavior (safe degrade, no invented data).

### 3.2 Numbered mode when any candidate is UUID-coded (decisions #2 + #4)
Compute `const anyUuid = picks.some(m => isUuid(m.canonical_code));` after building `picks` (post-drop).

- **`anyUuid === false` (all real codes — today's product path):** keep the EXISTING code-mode render **byte-identical** (labels = codes, buttons = codes, text = "Did you mean CODE1, or CODE2?"). No regression for the working product did-you-mean.
- **`anyUuid === true` (promotion / name-based candidates):** switch to **numbered mode**:
  - `labels = picks.map(humanLabel)` (the human names).
  - **message text** lists the names numbered, phrased as a short list rather than a raw "did you mean UUID" (satisfies decision #4's "these are a list, not a disambiguation" intuition while staying inside this node):
    ```
    Couldn't pin down "${token}". Here are the closest matches:
    1. ${labels[0]}
    2. ${labels[1]}
    Reply with a number to continue, or would you like me to escalate to ${team} team?
    ```
  - `suggest_quick_reply` buttons = **numbers** + escalate/decline: `["1","2",…,YES,NO]` (still `.map(replace(/,/g,'')).join(',')`; still capped ≤3 picks so ≤5 buttons total — unchanged count).
  - `suggest_last_result_set` rows carry the human label AND the uuid for the round-trip:
    ```js
    { idx:i+1, label:labels[i], value:labels[i], product:m.canonical_code /* uuid */, uuid:m.uuid||null, entity_type:m.entity_type||null }
    ```
    (`label` is what a position pick echoes as `raw`; `uuid`/`product` carry the promo uuid that `output_exchange` uses to re-resolve — §2.1.)

### 3.3 D2 (data-miss) — same guard, defensively
In D2, compute `label = isUuid(a.value) ? (a.display || null) : a.value` per alternative; drop alternatives whose label is null; if any remaining label came from a uuid `value`, use numbered mode for D2 too (numbers as buttons, `display` names in text), and keep `value:a.value`/`product:a.value` + carry any `a.uuid` if present so the round-trip still targets the right record. If the promotion tool never returns a uuid `value`, this branch is inert (no behavior change) — verified only by the tester at run time (§7).

### 3.4 What stays UNCHANGED (do not touch)
- The reformulator (`suggest-follow-up`, `output_exchange`) — the round-trip already works by uuid (§2.1).
- `compile-current-state` — it consumes `suggest_response`/`suggest_quick_reply`/`suggest_last_result_set` by name; only their **contents** change, not the field names.
- The send sub, human-intervention sub, get-results sub.
- Code-mode (all-real-code) product did-you-mean — byte-identical.

---

## 4. Design decisions — resolved

| # | Decision | Resolution |
|---|----------|------------|
| 1 | Human label source | `humanLabel(m)` = real `canonical_code` when NOT a uuid, else `display.description \|\| display.product_name \|\| display.name`. UUID regex `^[0-9a-f]{8}-…-[0-9a-f]{12}$`. Drop any candidate that would still render a bare uuid. |
| 2 | Button strategy | **RECOMMEND (a): numbered buttons + human names in message text**, applied only when a candidate is uuid-coded. Rationale: the send sub does NOT cap/truncate titles (§2.2) → long promo names risk respond.io rejecting the whole message; numbers are safe under every interpretation; round-trip proven by uuid (§2.1). Real-code product offers keep code buttons (no regression). |
| 3 | Reply round-trip | Number → `reference_positions:[idx]` → `output_exchange` carries `last_result_set[idx].uuid` straight to the re-query entity (§2.1). Safe as long as `suggest_last_result_set` keeps `uuid`/`product` = the promo uuid — the fix preserves that. No matcher change. |
| 4 | Should promotion misses use did-you-mean at all? | **Minimal safe path: keep the `suggest_offer` machinery but re-phrase the uuid case as a numbered list** ("Here are the closest matches: 1… 2…"). This reads as a list answer (the #4 intuition) without a new route. **Trade-off noted:** a genuine "list all active promotions for X" answer belongs on the get-results/RAG path; building that is a larger change and out of scope for this safe fix. |

---

## 5. Reproducing the MISS path (test trigger design)

The happy PDF path fired for "Sorento Dealer" / "promo for sorento wash basin" (resolver PINNED one promo). D1 fires only on a MISS-with-candidates: a **broad brand/category promo token matching ≥2 promotions where the resolver returns `resolved:false` + promotion `matches[]`** (the baseline used bare token "Sorento").

**Two-layer test strategy (mirrors other plans — cheapest gate first):**
- **Offline unit (primary, deterministic, 0 external):** feed `build-suggest-offer` a synthetic `resolve-entity` output carrying the confirmed two-promotion match shape (§1) — pins the fix regardless of live resolver nondeterminism.
- **E2E (confirmation):** contact `437264483`, `scope:deterministic`, `mock_parser_output` with `domain_hint:"promotion"` + a broad promo token (e.g. `"any promotion for sorento"`); `resolve-entity` runs as a real READ. **If the resolver PINS instead of missing** (customer would get the PDF — a valid happy outcome), broaden the token (barer brand) until D1 fires; the UUID/label assertions apply only once D1 fires (classification-sensitive, like existing §11/§15 cases). A pin-instead-of-miss run PASSES the no-regression check but does not exercise D1 — re-seed a broader token.

---

## 6. Verification tasks (plan §6 equivalent)

- **V0 (offline unit, cheapest, 0-token, PRIMARY correctness gate).** Feed `build-suggest-offer` synthetic inputs and assert render:
  - **V0-a promotion D1:** `resolve-entity` = 1 unresolved resolution, `token:"sorento"`, `matches:[{entity_type:"promotion",canonical_code:"406c76cb-…",uuid:"406c76cb-…",match_field:"description",display:{description:"SORENTO HIGH BASIN TAP PROMO_24062026 DEALER.pdf"}}, {…7e9fee38… description:"…OTHER PROMO.pdf"}]`; `gate.gate_debug.allowed_lookup=["product","promotion","category","brand"]`, `require_specific:false`; `q.domain_hint:"promotion"`, `q.routing.suggested_team:"marketing_promotion_sorento"`. Assert: `suggest_response` contains BOTH descriptions, **matches NO uuid** (regex `/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i` absent); `suggest_quick_reply` = `"1,2,Yes escalate,No it's okay"`-shape (numeric picks, each ≤3 chars); `suggest_last_result_set[i].uuid` = the promo uuid AND `.label` = the description; `suggest_offer===true`.
  - **V0-b product D1 no-regression:** `matches:[{canonical_code:"CWCX605-RL",match_tier:"prefix",uuid:"…"}]` (real code). Assert render is **byte-identical to pre-fix** code-mode (buttons=codes, "Did you mean CWCX605-RL?").
  - **V0-c drop-if-uuid-no-name:** a candidate with uuid `canonical_code` and NO `display` → dropped; if it is the only candidate → `suggest_offer===false` (escalate-only, no invented data).
  - **V0-d D2 uuid guard:** `Call 'sub-get-results'` alternatives `[{value:"<uuid>",display:"SOME PROMO.pdf"}]` → no bare uuid rendered (numbered mode / display used); no-uuid-value alternatives unchanged.
- **V1 (e2e D1, deterministic).** §14 case E1 (below): real graph, parser bypassed, real resolve-entity read → assert D1 fires with no uuid + human names + numeric buttons. Token-broaden if it pins (§5).
- **V2 (round-trip).** §14 case E2: turn-2 numeric reply → the promotion re-resolves by uuid → get-results attempts the PDF; assert the re-query entity carries the promo uuid and NO uuid is shown to the user; guarded send only.
- **V3 (no-regression product path).** §14 case E3: a genuine fuzzy PRODUCT token (`cwc605-rl`→`CWCX605-RL`) still renders code-mode did-you-mean, unchanged.
- **V4 (no-regression happy promo).** §14 case E4: a promo query that PINS ("Sorento Dealer") still returns the PDF, `suggest_offer` never set.
- **V5 (golden-master, optional).** Replay: non-miss + product-miss turns diff-clean; only promotion-miss turns diff (new numbered render). Promotion-miss diffs need re-capture (alternatives/matches come from the live resolver), each manually reviewed — no silent pass (mirrors suggest-on-miss Gate B).
- **V6 (zero-egress, EVERY case).** §0 S1–S6. S1 send guarded; S2 no assignment write (promotion pick is a re-query, not an escalation — the human-intervention sub is not reached); S4 get-results read tool only, never `crm_it_support_ticket_create`; S6 deterministic → 0 LLM tokens.

---

## 7. Prerequisites & open risks (FLAG to user)

1. **respond.io quick-reply button-vs-list limit + over-length behavior is UNVERIFIED** and CANNOT be verified without a real send (egress — forbidden). The current offer emits 5 buttons; WhatsApp reply buttons cap at 3. The numbered-buttons recommendation is safe under **every** plausible respond.io mapping (button truncation, list rows, or reject-on-overlength) because "1".."3" are 1 char — this is *why* numbers are recommended over short-slugged descriptions. **Open question for the user:** do we also want to cap the offer to 3 total buttons (drop to 2 picks + Yes, or move Yes/No into text) to be safely inside WhatsApp's 3-reply-button limit? This is orthogonal to the UUID bug and can be a follow-up. Left as-is in this fix (count unchanged).
2. **D2 `alternatives[].value` uuid risk is data-dependent.** The D2 guard (§3.3) is inert unless the promotion domain tool actually returns a uuid `value`. The tester confirms at run time whether any real promotion data-miss produces a uuid `value`; if it never does, V0-d (synthetic) is the only coverage and that is acceptable (defensive).
3. **E2E miss-vs-pin is nondeterministic** (live resolver). Acceptance rests on the offline unit V0; the e2e cases are confirmation and may need token-broadening (§5). Do not fail the change on a pin-instead-of-miss e2e run — re-seed.
4. **Fixture capture.** The coder should capture ONE real `resolve-entity` output for a broad promo token (a real READ, allowed) to ground the V0 fixture against current resolver output, in addition to the exec-7687978 shape.

---

## 8. Scope / tier / zero-egress
- **`scope: deterministic`.** Fix is in a spine code node; parser bypassed via `mock_parser_output` (0 parser tokens); `resolve-entity` + get-results are real READS (allowed). Offline unit V0 is 0-external.
- **Zero egress.** §0 gate on every case; a real send/assign/SLA/PIC/CRM-write is a hard fail + halt.

## 9. Rollout (when approved — user-gated, NOT in this plan)
1. On the clone `txiPzSxy3Pclsz6v` fork of `build-suggest-offer`: `setNodeParameter …/jsCode` (byte-exact) with the §3 deltas.
2. V0 → V1–V4 (+V6 zero-egress) on the clone; reviewer confirms zero egress + product/happy no-regression.
3. **Promote (user-gated, guards stripped, backup-first, sha-gated per LESSON 24/25):** byte-exact `build-suggest-offer` jsCode → **live spine `9qVyfUxmRQqrpGRMDLRuz`**, then `publish_workflow`. `build-suggest-offer` is pure logic — no test guards to strip. Backup prior versionId + node body first.
