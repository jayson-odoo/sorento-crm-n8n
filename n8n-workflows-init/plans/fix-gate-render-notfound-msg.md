# Change Plan — Gate render fix + not-found message re-phrasing

Change-id: `fix-gate-render-notfound-msg`
Status: PLAN (planner deliverable). No workflow edited; no execution run.
Build target: TEST clone `txiPzSxy3Pclsz6v` ONLY. NEVER touch live spine `9qVyfUxmRQqrpGRMDLRuz`.
Scope tag: **`scope: deterministic`** (two deterministic Code nodes; parser/reformulator bypassed via
`mock_parser_output`; resolve-entity + get-results run as real **reads**, allowed). NOT parser, NOT
get-results, NOT resolver/`entity_resolver.py`, NOT reformulator tuning.
Source of truth for node facts: live n8n via `get_workflow_details txiPzSxy3Pclsz6v` (jsCode of both
target nodes pulled and quoted below verbatim).

n8n-only. Two fixes, both in existing Code nodes. No CRM backend / MCP-server / resolver changes.

---

## 0. What this change is (and is not)

Two user-approved fixes to the chatbot's product-attachment / ambiguity handling:

- **Fix A — gate render** in node `disallowed-entity-gate` (Code/JS). The gate already token-filters
  ambiguous candidates into `specific_options`, but its FINAL `if (require_specific)` block then
  **clobbers** `compatible_entities` and `gate_clarification` by re-deriving them from the *unfiltered*
  `entities` union (= all products across all tokens). That clobber produces the "18 irrelevant product
  codes" clarification. Fix A removes the clobber, renders from the token-filtered `specific_options`,
  excludes tokens that already yielded an exact match, and drops descriptor-token candidates whose uuid
  is already covered by an exact resolution.
- **Fix B — message structure** in node `not-found-error-message` (Code/JS). The not-found (escalate)
  branch builds `Could not find ${q.domain_hint} for ${requested}...`, leaking the internal literal
  `product_attachment` and cramming `resolvedTypes + tokens`. Fix B rebuilds that message for
  `domain_hint === 'product_attachment'` from parser entities (name the product as `product {CODE}`,
  the attachment as `a {attachment_type.raw}`), never printing the literal. All other domains stay
  byte-identical.

**Explicitly NOT in scope:** the resolver's own union behaviour (it correctly returns exact + prefix +
word-tier matches across tokens — that is a CRM/`entity_resolver.py` concern and is left untouched),
the parser/reformulator prompt or its choice to emit a free-text descriptor as a product entity, and
any other branch of either node (clarification / needsScope / missingAttachmentType stay as-is unless
they leak the domain literal — they do not).

---

## 1. Confirmed root causes (reproduced; do NOT re-investigate)

Both user-facing strings are generated IN THESE TWO n8n Code NODES, not in the CRM MCP server. The
resolver was curl-verified: token `srtwt03C` → [SRTWT03C(exact), SRTWT03CA(prefix), SRTWT03C-ECO
(prefix)]; token `SRTUFV101` → [SRTUFV101(exact), SRTUFV101-WEPLS(prefix)]; plus a free-text descriptor
token `urinal flush valve` → 15 word-tier name matches (SRT0001, AMS-FFAS9859-001500BT0, CB114, CB111,
MFV113, SHU8001, SHU80001, SRTUFV101, SRTFV1002-NL, SRTFV1003, MFV111, SRTWT03C, SRTFV1001, SRTFV1002,
SRTMFV107-WEPLS). The union of all three tokens' matches = the 18 codes shown in the screenshot.

> **Caveat (drives Step 0):** the resolver curls above used *assumed* tokens. The exact gate input
> depends on the REAL reformulator output (`tokens`, `match_mode`, per-token `resolutions[]`). Step 0
> captures the real reformulator output for the two real messages and pins it as the `mock_parser_output`
> for the UAC cases, so the gate is exercised on the true input.

### 1.1 Wiring (verified on the clone)

```
resolve-entity ─▶ disallowed-entity-gate ─▶ If3
If3 (combinator OR: resolve-entity.unresolved_tokens.length > 0  OR  gate.gate_passed === false)
   ├─ TRUE  ─▶ not-found-error-message ─▶ tag-not-found ─▶ escalate-catalog ─▶ … ─▶ guarded send
   └─ FALSE ─▶ Execute 'sub-get-rag' ─▶ tool-filter ─▶ Loop Over Items ─▶ Aggregate1
                                                                              └─▶ not-found-error-message (empty get-results) ─▶ tag-not-found ─▶ …
```

So `not-found-error-message` is reached two ways: (1) If3 TRUE = gate failed / unresolved tokens
(clarification / require_specific path), and (2) from `Aggregate1` when get-results returned nothing.
Both land in the Fix-B `else` (non-`require_specific`) branch when `gate.require_specific` is false.

**Consequence for Fix A's blast radius:** on the buggy product-attachment turns the gate set
`require_specific = true` (→ `gate_passed = false`) → **If3 TRUE → not-found path, get-rag/get-results
never ran**. After Fix A, those turns resolve to `require_specific = false`, `gate_passed = true` →
**If3 FALSE → get-rag + get-results now run**, and a genuinely-missing attachment then re-enters
`not-found-error-message` from `Aggregate1`. This is the intended behaviour change and its downstream
cascade is expected (see §5 regression scope).

---

## 2. Fix A — `disallowed-entity-gate` (Code/JS)

### 2.1 Current behaviour (the bug)

The gate's `REQUIRE_SPECIFIC_DOMAINS = Set(['incoming','product_attachment'])` block already builds a
clean, token-filtered `specific_options` and a clean `exact_entities`, and the intermediate render block
already produces the correct short clarification:

```js
if (specific_options.length > 0) {
  require_specific = true;
  gate_passed = false;
  gate_reason = `'${domain}' ambiguous (no single exact match); user must pick`;
  const flatLabels = specific_options.flatMap(o => o.candidates.map(c => c.label));
  const numbered = flatLabels.map((l, i) => `${i + 1}. ${l}`).join('\n');
  gate_clarification =
    `${domain} search needs to be more specific. Multiple matches found — please choose:\n${numbered}`;
}
```

…but the FINAL block then **OVERWRITES both** from the unfiltered `entities` union (the clobber — this
is the bug). Exact current text to be replaced:

```js
  // exact-resolved entities pass through only when not prompting
  if (exact_entities.length > 0 && !require_specific) {
    compatible_entities = exact_entities;
  }
  // when prompting (require_specific), keep ONLY the products as compatible_entities —
  // attachments / attachment_types resolved alongside are noise for the disambiguation.
  if (require_specific) {
    // on a prompt turn, the selectable set is products only (attachments are noise)
    compatible_entities = entities.filter(e =>
      String(e.entity_type).toLowerCase() === 'product');

    // render the clarification from the SAME list
    const numbered = compatible_entities
      .map((e, i) => `${i + 1}. ${e.code}`)
      .join('\n');
    if (compatible_entities.length > 0) {
      gate_clarification =
      `${domain} search needs to be more specific. Multiple matches found — please choose:\n${numbered}`;
    } else {
      gate_clarification =
      `${domain} search needs to be more specific. No product found for the requested item`;
    }

  } else if (exact_entities.length > 0) {
    // not prompting → pass the cleanly-resolved entities through
    compatible_entities = exact_entities;
  }
```

The clobber: `entities.filter(e => product)` = the 18-code union, discarding the token-filtered
`specific_options`, and re-rendering `gate_clarification` from that union.

### 2.2 Target behaviour

1. Clean codes (tokens with a single exact match) pass through silently as a SET — no prompt — even
   when there are several of them (e.g. SRTWT03C + SRTUFV101 → both pass).
2. A descriptor token whose candidates are already covered by exact code-resolutions is dropped (it
   must not manufacture false ambiguity).
3. Only genuinely-ambiguous tokens (no exact match, not covered by an exact) produce a SHORT, relevant
   "please choose" list rendered from the token-filtered `specific_options`.
4. `gate_clarification` is never re-derived from the unfiltered `entities` union.

### 2.3 Precise logic change (two edits)

**EDIT A1 — exact-dedup the descriptor noise.** INSERT immediately AFTER the existing token-filter
block (the `if (specific_options.length > 0) { …keep only candidates whose CODE relates to a typed
token… }`) and BEFORE the existing `if (specific_options.length > 0) { require_specific = true; … }`
render block:

```js
// FIX A: drop candidates already covered by an exact code-resolution (descriptor noise),
// then drop any token group left empty. A descriptor token whose matches are all the same
// products we already resolved exactly must NOT manufacture false ambiguity.
if (specific_options.length > 0 && exact_entities.length > 0) {
  const exactUuids = new Set(exact_entities.map(e => e.uuid));
  specific_options = specific_options
    .map(o => ({ ...o, candidates: o.candidates.filter(c => !exactUuids.has(c.uuid)) }))
    .filter(o => o.candidates.length > 0);
}
```

The existing render block stays AS-IS — it already renders the short list from `specific_options`. After
A1 runs first, it renders from the deduped set (and does not fire at all when A1 emptied it).

**EDIT A2 — replace the FINAL clobber block** (the exact text quoted in §2.1) with:

```js
// FIX A: when prompting, the selectable set comes from the token-filtered, exact-deduped
// specific_options — NOT from the unfiltered `entities` union. gate_clarification was already
// rendered from specific_options above; do NOT re-derive it here.
if (require_specific) {
  const optUuids = new Set(specific_options.flatMap(o => o.candidates.map(c => c.uuid)));
  compatible_entities = entities.filter(e => optUuids.has(e.uuid));
} else if (exact_entities.length > 0) {
  // not prompting → pass the cleanly-resolved entities through as a SET
  compatible_entities = exact_entities;
}
```

### 2.4 Net effect by token shape

| token shape on a `product_attachment`/`incoming` turn | before (buggy) | after Fix A |
|---|---|---|
| 2+ distinct exact codes (+ a descriptor whose matches dup those exacts) | require_specific=true, 18-code "please choose" | require_specific=false, both products pass as a SET, no prompt |
| single exact + prefix variant siblings (e.g. SRTUB5202) | already exact-picks; descriptor could clobber | exact passes, no false prompt |
| a genuinely ambiguous token (no exact match) | (was correct, then clobbered to the 18-union) | SHORT relevant "please choose" from `specific_options` |

`require_specific = (specific_options.length > 0)` after A1, so the prompt fires **iff** there is a real
ambiguity left after exacts are removed.

---

## 3. Fix B — `not-found-error-message` (Code/JS)

### 3.1 Current behaviour (the bug)

The not-found (escalate) branch (`require_specific === false`) — exact current text to be replaced:

```js
  if (require_specific) {
    escalate_message = gate.gate_clarification
  } else {
    escalate_message =
    `Could not find${active_inactive} ${q.domain_hint} for ${requested}${dateRange}${access}. ` +
    `Would you like me to escalate to ${team} team?`;
  }
```

Leaks the internal literal `product_attachment` (via `q.domain_hint`) and crams `requested`
(`resolvedTypes.join('/') + ' ' + tokens.join(' ')`) → e.g. "Could not find product_attachment for
srtufv101 SPAN cert. Would you like me to escalate to purchasing team?"

The parser output (`q = $('Call 'sub-query-reformulator'').first().json.output`) carries
`q.entities[]` with `.hint` (e.g. `product`, `attachment_type`) and `.raw` (e.g. `SRTUFV101`,
`SPAN cert`), and `q.domain_hint`. Fix B builds the message from those.

### 3.2 Target behaviour

For `domain_hint === 'product_attachment'`: natural, parser-driven phrasing that names the product as
`product {CODE}` and the attachment as `a {attachment_type.raw}`, and NEVER prints the literal
`product_attachment`. Target string shape: **"Could not find a SPAN cert for product SRTUFV101. Would
you like me to escalate to purchasing team?"**. The escalation tail (`Would you like me to escalate to
{team} team?`) and `${active_inactive}${dateRange}${access}` are preserved. All non-`product_attachment`
domains keep the existing string byte-identical (no regression). The `missingAttachmentType`,
`needsScope`, and `require_specific` branches are unchanged (none leak the literal — verified).

### 3.3 Precise logic change (one edit)

REPLACE the block quoted in §3.1 with:

```js
  if (require_specific) {
    escalate_message = gate.gate_clarification
  } else if (q.domain_hint === 'product_attachment') {
    // FIX B: natural, parser-driven phrasing — never leak the 'product_attachment' literal.
    const ents = Array.isArray(q?.entities) ? q.entities : [];
    const productRaws = ents.filter(e => e.hint === 'product').map(e => e.raw).filter(Boolean);
    const attachEnt   = ents.find(e => e.hint === 'attachment_type');
    const prodText = productRaws.length ? `product ${productRaws.join(' and ')}` : '';
    let subject;
    if (attachEnt?.raw && prodText)      subject = `a ${attachEnt.raw} for ${prodText}`;
    else if (attachEnt?.raw)             subject = `a ${attachEnt.raw}`;
    else if (prodText)                   subject = `attachments for ${prodText}`;
    else                                 subject = requested;   // fall back to the old token text
    escalate_message =
      `Could not find${active_inactive} ${subject}${dateRange}${access}. ` +
      `Would you like me to escalate to ${team} team?`;
  } else {
    escalate_message =
    `Could not find${active_inactive} ${q.domain_hint} for ${requested}${dateRange}${access}. ` +
    `Would you like me to escalate to ${team} team?`;
  }
```

Note `${active_inactive}` already carries a leading space when set (e.g. `" active"`), and `subject`
has no leading space, so `find${active_inactive} ${subject}` renders "find a SPAN cert..." /
"find active a SPAN cert..." correctly. The `else` (non-product_attachment) branch is byte-identical to
today.

---

## 4. Step 0 — clone uac-mode repro + reformulator capture (run by tester before coding the diff)

Goal: confirm current-live behaviour on the two real messages and capture the real reformulator
tokens/`match_mode` so the gate is exercised on the true input.

1. On the clone `txiPzSxy3Pclsz6v` in **`uac` mode** (egress blocked, real reads), seed and run the two
   real messages (contact `437264483` FULL access):
   - M1 (BUG 1): the SPAN-cert-for-srtwt03C-or-SRTUFV101 message (exact wording from the screenshot).
   - M2 (BUG 3): the srtufv101 SPAN-cert message that produced "Could not find product_attachment for
     srtufv101 SPAN cert…".
   Run as `scope: parser` for Step 0 ONLY (let the real reformulator run) so the true parser output is
   captured. (The UAC cases in §1–§4 of UAC.md then pin that captured output as `mock_parser_output`
   and run `scope: deterministic`.)
2. From `get_execution(includeData:true)` capture, for each message:
   - `Call 'sub-query-reformulator'.first().json.output` (full object: `domain_hint`, `tokens`,
     `entities[]` with `.hint`/`.raw`, `match_mode`, `resolutions[]` / `intersection`),
   - `resolve-entity.first().json` (`resolutions`/`intersection`/`by_entity_type`/`tokens`/
     `unresolved_tokens`/`fallback_match_mode`),
   - `disallowed-entity-gate.first().json` (`require_specific`, `gate_passed`, `gate_clarification`,
     `compatible_entities`),
   - `not-found-error-message.first().json.escalate_message` (the user-facing string).
3. Save the captured reformulator output to `tests/fixtures/parser/span-cert-two-codes.json` (M1) and
   `tests/fixtures/parser/span-cert-srtufv101.json` (M2); save resolver output alongside as
   `tests/fixtures/resolve/*.json` for reference.
4. **Assert current-live (pre-fix) repro** — these are the BEFORE baseline the fix must change:
   - M1: `disallowed-entity-gate.require_specific === true` AND `gate_clarification` lists ≥10 codes
     (the 18-union clobber) — i.e. the bug reproduces.
   - M2: `not-found-error-message.escalate_message` contains the literal substring `product_attachment`.
   If either does NOT reproduce, STOP and report (the live behaviour diverged from the screenshot;
   re-confirm the messages before specifying the diff).

This pins the exact gate input. The coder applies Fix A + Fix B only after Step 0 confirms the repro.

---

## 5. Acceptance criteria + regression scope

### 5.1 Functional acceptance (from the UAC cases)
- **A-PASS-1 (two exact codes):** M1 input → `disallowed-entity-gate.require_specific === false`,
  `gate_passed === true`, `compatible_entities` = exactly the two exact products (SRTWT03C +
  SRTUFV101), and NO output string contains "search needs to be more specific" / "please choose". The
  eventual not-found message (attachment genuinely missing) is a clean Fix-B string.
- **A-PASS-2 (exact + variant siblings):** a single-exact-plus-prefix token (e.g. SRTUB5202) →
  `require_specific === false`, that product passes, no false "please choose".
- **A-PASS-3 (exact-tier discriminator — canonical pair `WC286` vs `SRTUFV101`, UAC §11):**
  - `WC286` (10 matches, ALL `match_tier="substring"`, ZERO exact, resolver `ambiguous=true`:
    `SRTWC286-SH`, `-SH-PP`, `-SH-NEW-150`, `-SH-150`, `-SH-NEW-P`, `-SH-NEW-200`, `-SH-NEW`, `-SH-UF`,
    `-SH-200`, `-SH-P`) → `require_specific === true`; `gate_clarification` IS returned (not suppressed)
    and lists ONLY `SRTWC286`-* codes (token-filter keeps them — each contains `wc286`), NONE of the
    cross-token union noise. Legitimate disambiguation is preserved.
  - `SRTUFV101` alone (`[SRTUFV101 exact, SRTUFV101-WEPLS prefix]`) → exact short-circuit →
    `require_specific === false`, passes straight through, NO "please choose". The `-WEPLS` prefix
    sibling must not trigger a prompt.
  The pair pins the discriminator: zero-exact ⇒ prompt; ≥1 exact ⇒ passthrough.
- **B-PASS (message structure):** for any `product_attachment` not-found, `escalate_message` does NOT
  contain the substring `product_attachment`; it contains `product {CODE}` and the attachment-type raw,
  and ends with `Would you like me to escalate to {team} team?`.
- **No-leak invariant (all cases):** no node output string anywhere in the execution contains the
  literal `product_attachment`.

### 5.2 Regression scope (golden-master replay)
- **Allowed-to-change nodes:** `disallowed-entity-gate` and `not-found-error-message` ONLY — and their
  **downstream cascade ONLY on turns that hit a corrected branch** (i.e. turns where Fix A flips
  `require_specific`/`gate_passed`, changing the `If3` direction, which then legitimately runs/skips
  `Execute 'sub-get-rag'`, `tool-filter`, `Loop Over Items`, `Aggregate1`, get-results, and re-enters
  `not-found-error-message`; or turns where Fix B re-phrases a `product_attachment` not-found).
- **Byte-identical requirement:** every turn that does NOT involve a `product_attachment`/`incoming`
  ambiguity AND does NOT involve a `product_attachment` not-found must be **byte-identical across ALL
  nodes** vs golden. Any diff on an unrelated turn = HARD FAIL.
- **Reviewer obligation:** every diff observed on replay must be attributable to (i) Fix A's gate
  re-render / branch flip + its downstream cascade, or (ii) Fix B's `product_attachment` re-phrasing.
  An unattributable diff = REQUEST-CHANGES.
- **Tier:** `scope: deterministic` (plan §8) — parser/reformulator bypassed via injected
  `mock_parser_output`; resolve-entity + get-results are real READS (allowed); 0 parser tokens. The
  get-results agent is orphaned (0 tokens, plan §6c) so S6 holds even when a case reaches get-results.

---

## 6. Verification tasks (this change)
1. **V1 — Step 0 repro** (§4): both bugs reproduce on the clone pre-fix; reformulator output captured
   and pinned as the case `mock_parser_output`.
2. **V2 — Fix A unit branches:** run UAC §9/§10/§11 (below); assert §5.1 A-PASS-1/2/3 from
   `disallowed-entity-gate` node output.
3. **V3 — Fix B string:** run UAC §12; assert §5.1 B-PASS + the no-leak invariant.
4. **V4 — no-leak sweep:** across every case, grep the full `get_execution(includeData:true)` for the
   substring `product_attachment` in any node's output `escalate_message`/`gate_clarification`/`message`
   field → must be absent.
5. **V5 — §0 safety gate (mandatory, every case):** S1–S6 from UAC §0. These are deterministic-scope,
   contact `437264483` (FULL), egress blocked; assert the egress log shows only `blocked:true` records
   and no real send/assign/write fired.
6. **V6 — regression replay (post-fix, before promote):** replay the corpus; confirm the §5.2 diff
   attribution + the byte-identical requirement.

---

## 7. Open items / prerequisites
- The two real screenshot messages' EXACT wording is needed for Step 0 (M1/M2). The tester pulls them
  from the screenshots / the live message log for contact `437264483`; if unavailable, reconstruct from
  the confirmed tokens ("SPAN cert for srtwt03C or SRTUFV101" and "srtufv101 SPAN cert").
- Fix A also affects `domain === 'incoming'` (the other member of `REQUIRE_SPECIFIC_DOMAINS`). UAC §11
  uses the canonical product_attachment ambiguity pair `WC286` (zero-exact → prompt preserved) vs
  `SRTUFV101` (exact → passthrough); an `incoming` ambiguity is covered by the regression replay (any
  incoming-ambiguity turn in the corpus is an allowed-to-change turn per §5.2).
- Promotion: per CLAUDE.md / plan §5 STEP 5 — only the reviewed business-logic diff (these two Code
  blocks), guards stripped, user-gated, backup-first, onto live `9qVyfUxmRQqrpGRMDLRuz`.
