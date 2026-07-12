# Node-diff — `fix-gate-render-notfound-msg`

Coder deliverable for the reviewer. Build target: TEST clone `txiPzSxy3Pclsz6v` ONLY
(`sorento-consume-main TEST`). Live spine `9qVyfUxmRQqrpGRMDLRuz` NOT touched.

Scope: exactly 2 Code/JS nodes edited via `update_workflow` `updateNodeParameters` (jsCode only).
No connections, no egress nodes, no shared-sub calls, no `is_test` wiring, no credentials changed.
Source-of-truth jsCode pulled from `get_workflow_details txiPzSxy3Pclsz6v` before editing; live code
matched the plan's quotes (no drift). Plan: `../../plans/fix-gate-render-notfound-msg.md`. UAC §9–§12.

---

## Fix A — `disallowed-entity-gate` (n8n-nodes-base.code)

Two changes inside the `if (REQUIRE_SPECIFIC_DOMAINS.has(domain)) { … }` block.

### A1 — exact-dedup the descriptor noise (INSERT)

Inserted immediately AFTER the existing token-filter block (the `if (specific_options.length > 0)`
shared block that keeps only candidates whose CODE relates to a typed token) and BEFORE the existing
`if (specific_options.length > 0) { require_specific = true; … }` render block:

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

Rationale: a descriptor token (e.g. "urinal flush valve") whose word-tier matches include the same
products already resolved exactly (SRTWT03C / SRTUFV101) must not survive as ambiguous candidates.
Removing exact-covered uuids and dropping emptied groups makes `require_specific` fire iff a genuine
ambiguity remains. The render block immediately below is unchanged — it now renders from the deduped
set, and does not fire at all when A1 emptied `specific_options`.

### A2 — replace the final clobber block (REPLACE)

BEFORE (exact text removed):

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

AFTER (replacement):

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

Rationale: the removed block was the bug — on a prompt turn it discarded the token-filtered
`specific_options` and rebuilt `compatible_entities` + `gate_clarification` from `entities.filter(product)`
(the full cross-token union → the "18 irrelevant codes" clarification). The replacement keeps
`gate_clarification` as already rendered from `specific_options`, and sets `compatible_entities` to the
`entities` whose uuid is in the deduped `specific_options` (a relevant SET). The non-prompting branch is
unchanged behaviour (exact entities pass through as a SET).

### Net behaviour (ties to UAC)
- §9 (two exact codes + descriptor noise): exacts SRTWT03C + SRTUFV101 populate `exact_entities`;
  descriptor candidates are exact-covered → A1 empties `specific_options` → `require_specific=false`,
  `gate_passed=true`, `compatible_entities`= the two exacts, `gate_clarification` empty. No prompt.
- §10 (exact + prefix siblings, SRTUB5202): exact-tier short-circuit already populates `exact_entities`;
  no ambiguous group → `require_specific=false`, sole exact passes, no false prompt.
- §11a (WC286, ZERO exact, all substring): `exact_entities` empty → A1 no-ops → `specific_options`
  retains the token-filtered SRTWC286-* candidates → `require_specific=true`, `gate_clarification` IS
  the short SRTWC286-* list; A2 sets `compatible_entities` to exactly those WC286 uuids. Legitimate
  disambiguation preserved; no cross-token union noise.
- §11b (SRTUFV101 + -WEPLS prefix): exact short-circuit → `require_specific=false`, sole exact passes.

Tokens with ≥1 exact never force `require_specific`; zero-exact tokens still prompt with a short
relevant list. Confirmed: `require_specific === (specific_options.length > 0)` after A1.

---

## Fix B — `not-found-error-message` (n8n-nodes-base.code)

One change: insert an `else if (q.domain_hint === 'product_attachment')` branch between the existing
`if (require_specific)` and the final `else`, inside the bottom (non-clarification) block.

BEFORE:

```js
  if (require_specific) {
    escalate_message = gate.gate_clarification
  } else {
    escalate_message =
    `Could not find${active_inactive} ${q.domain_hint} for ${requested}${dateRange}${access}. ` +
    `Would you like me to escalate to ${team} team?`;
  }
```

AFTER:

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

Rationale: the old `else` printed `${q.domain_hint}` for `product_attachment` turns, leaking the
internal literal `product_attachment` and cramming `resolvedTypes/tokens`. The new branch reads parser
entities (`q.entities[].hint`/`.raw`) to phrase "Could not find a {attachment raw} for product {CODE}.
Would you like me to escalate to {team} team?" and never prints the literal. `${active_inactive}`
carries its own leading space; `subject` has none — so "find a SPAN cert…" / "find active a SPAN cert…"
render correctly. The `require_specific` branch and the final `else` (all non-product_attachment
domains) are byte-identical to before. The earlier `missingAttachmentType` / `needsScope` branches are
untouched (they don't leak the literal).

Ties to UAC §12: `escalate_message` absent `product_attachment`, contains `product SRTUFV101` and the
attachment raw `SPAN cert`, ends with the escalate tail. §9's Fix-B output is the same shape with two
products joined by " and ".

---

## validate / structure verification

- `update_workflow` returned only PRE-EXISTING validation warnings (per LESSONS #13): HARDCODED_CREDENTIALS
  on the httpRequest read nodes, DISCONNECTED_NODE on the 5 deliberately-orphaned egress nodes (+ the
  orphaned save-redis call / extra disconnected helpers), OpenAI `builtInTools`, transcribe
  MISSING_EXPRESSION_PREFIX. NONE introduced by this change. No new warning appeared.
- Both new jsCode bodies pass `node --check` (syntactically valid).
- Re-fetched workflow post-edit: nodeCount 101 (unchanged); both target nodes still
  `n8n-nodes-base.code`; markers present (FIX A x2, FIX B x1); old clobber strings absent (0 matches for
  "the selectable set is products only" and "No product found for the requested item").

## zero-egress confirmation

- Schedule Trigger: the clone has NO scheduleTrigger node (driven by Manual-Trigger wrapper), so there
  was nothing to disable; editing cannot consume the shared prod list.
- Orphaned egress nodes still orphaned (0 inbound, re-checked post-edit): `send-message-files`,
  `send-message-images`, `send-message-video`, `update-human-intervened`, `save-session-vars` (prod PUT),
  `Call 'sub-respond-save-message-redis'2`.
- `is_test` occurrences unchanged (24) — no shared-sub call wiring touched.
- Only `txiPzSxy3Pclsz6v` was edited; live `9qVyfUxmRQqrpGRMDLRuz` untouched.

## Not done (out of coder scope, by design)
- No UAC executions (tester's job).
- No promotion to live (user-gated, reviewer-checklist step).
