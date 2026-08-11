# Node-diff — tier-only access ask (access-tier-ask-plan.md, built 2026-08-11)

Built on fork spine `RnpxEnAV3g20MmKj` @ `407cbfb7` (from `4f2df612`) and fork parser
`RJ326g9dwe3bTWyf` @ `7c5ff7fd` (from `1f784ae4`). **Live untouched.** Hashes + rollback:
`tests/manifests/access-tier/README.md`. Offline evidence: `tests/offline/tier-ask/`
(RED 46/75 pre-change → GREEN 75/75; mutate 13/13). Acceptance targets: `tests/uac/TA.md`.

Per LESSONS §71 this diff covers EVERY changed node including non-Code params (If4,
executeWorkflow inputs) — the full-workflow param-hash sweep found exactly these rows and
the one connection splice, nothing else.

## Turn flow (what the change does)

1. Promotion turn, multi-tier contact, no tier stated → `tier-gate` decides ASK → If4 FALSE →
   `access-level-choice-message` renders the numbered 3-tier ask (typed list, NO buttons) →
   `compile-current-state` persists `selection_context: 'tier_offer'` + the tier roster +
   the original product scope. No CRM query runs.
2. Reply "2" / "1 and 2" / "all" / "dealer" → parser `output_exchange` resolves it against
   the tier roster to TIER TOKENS in `output.access_levels` (never entities), reuses the
   ORIGINAL scope (`_tier_pick_scope_reused`, S5-shaped), re-runs as a promotion query.
3. `tier-gate` now sees a stated tier → proceed; recomposes compound names
   (chosen tiers × query brand ∩ entitlement) → `Call 'sub-get-results'` sends them →
   answer comes back tier-scoped → `promo-picker` ALWAYS attaches the files (D5).
4. D4: the tier never enters session vars — the next new promo query re-asks.

## SPINE — fork `RnpxEnAV3g20MmKj`

### `tier-gate` — NEW Code node (Aggregate → tier-gate → If4)
- Intent: D2 ask trigger + the single recomposition point (plan §3). Embeds
  `tests/offline/access-tier/mapper.js` parseLevel/mapEntitlement/recompose/needsTierAsk
  BYTE-EXACT (generated markers; probe EB-* enforces).
- Emits: `tier_stated` (tier tokens; compound tolerated via parseLevel), `entitled_tiers`,
  `entitled_unknown`, `query_brands` (from brand-hinted entities, D6), `tier_ask`,
  `tier_proceed`, `access_levels_recomposed`, `brand_gate_empty`.
- Fail directions: brand_gate_empty → `[]` (CRM returns nothing — probe R5/TA-11, never a
  widen); stated-but-unheld tier → full entitlement + gate notice (Q23/TA-9); unmappable
  entitlement (unknown names only) → legacy full passthrough, no ask, no invention.
- Passes its input through (`...j`), so If4's item still carries `name[]`.

### `If4` — **If node param change** (the §71 class)
- Before: `={{ $json.name.length }}` gt 0 (number).
- After: `={{ $json.tier_proceed === true }}` boolean-true (same condition id kept).
- TRUE → replay-resolve-entity (proceed); FALSE → access-level-choice-message (ask, or
  no-access when name[] empty — tier-gate keeps that lane: proceed=false, ask=false).

### connections
- `Aggregate→If4` REMOVED; `Aggregate→tier-gate`, `tier-gate→If4` ADDED. Only edge change.
  By-name readers of `Aggregate` (9 nodes) unaffected — it still executes on the same lane.

### `access-level-choice-message` — repurposed to the tier ask
- names==0: unchanged no-access message.
- Else: renders EXACTLY plan journey row 1 — `Which access level do you need?\n1. Office\n2. Dealer\n3. End user\nReply with the number(s) — e.g. "1", "1 and 2", or "all".` —
  offering ONLY held tiers, renumbered (2-tier contact → 2 options).
- Emits `tier_offer: true` + `tier_last_result_set` (rows carry `value`/`tier` = TIER TOKEN,
  `entity_type: 'access_tier'`, uuid null).
- D3: `quick_reply = ''` always (compile-current-state's `.length > 0` check → null → no
  WhatsApp buttons). The old compound-list prompt survives only as a defensive fallback for
  a non-empty entitlement with zero mappable tiers.

### `compile-current-state` — tier_offer arm (one hunk)
- New `_tier` source (access-level-choice-message executed && tier_offer===true) at LOWEST
  precedence: `_merge`/`_sug`/`_mem`/`_promo` all win (TA-14); ternary gains
  `tier_offer` before `_isDisambig`. Persists the roster as `last_result_set`.
- D4 upheld: no `access_levels` (or any tier) key is written to variables — S3's removal
  stands. Scope carry is free: `variables.entities` already persists the parser entities
  (the ask turn's product scope), asserted CCS-1c.

### `promo-picker` — S4 list-gate REMOVED (D5)
- Deleted: `env.attachments = []` on the >1-answers lane + the "Reply with the number you
  want" invite. New intro: `I found N promotions[ for SCOPE]. I have attached the file(s)
  below.`
- KEPT byte-level: S4b sort (+ rebuild-on-reorder + freshness-stamp carry), strict
  not-found (disjoint/coverage), per-product decomposition, scope echo, Q23 withNotice,
  roster publication (`suggest_offer` — follow-up numbers/TA-8 still resolve), and the S5
  positional-pick lane (vestigial for old sessions).

### `disallowed-entity-gate` — Q23 held-check at tier level (one hunk)
- When `tier-gate` executed (promotion lane): held = `tier_stated ∩ entitled_tiers`
  (a contact holding any `* Dealer` name "holds" dealer). Unheld → notice
  `You don't have access to <tier(s)> promotions — here's what you do have:`.
  New: `brand_gate_empty` → notice `You don't have access to <brand(s)> promotions.`
  (not-found-error-message already prepends `access_notice`, so TA-11 renders).
- tier-gate absent → the EXACT legacy compound exact-name block runs (byte-kept, plus
  `brand_gate_empty:false`). Nothing regresses off this fork.

### `Call 'sub-get-results'` — **executeWorkflow input params** (the §71 class)
- `semantic_input`: the S2b stated∩entitled union expression REPLACED by a read of
  `$('tier-gate').access_levels_recomposed` (single source); off the promotion lane
  (tier-gate not executed) the parser's own access_levels pass through (legacy, usually []).
  Envelope keys unchanged (SI-1b parity).
- `user_prompt`: only the `access level:` line changed — same tier-gate read with the same
  legacy fallback (the old `.sort().intersection(...)` union is gone). All other lines
  byte-identical.
- Target workflowId UNCHANGED (`t4QvrtrPnTwRU6br` sub-get-results CS-BUILD).

## PARSER — fork `RJ326g9dwe3bTWyf`

### `output_exchange` — one insertion region (after order_status normalisation, before the
ALL handler) + nothing else
- Embedded mapper bytes (BRANDS/TIER_WORDS/parseLevel/statedTiers, generated markers).
- `tierOfferPick()` (a): fires ONLY on `selection_context === 'tier_offer'` (TA-14 — member/
  suggest/disambiguation contexts are untouched by construction). Resolves LLM
  reference_positions, bare-digit replies ("1 and 2" — digits-and-connectives regex, never
  a query), "all"/semua/both, and tier WORDS to tier tokens in `output.access_levels`.
  (c): reuses prev entities (`entity_op: 'reuse'`, `_tier_pick_scope_reused: true` — own
  flag, S5-shaped), carries the prior date window, forces promotion/business_query, and
  CONSUMES reference_positions/reference_target so the byIdx block cannot mint entities off
  the tier roster and S5 cannot double-fire. No pick signal → returns untouched (a new
  query or casual abandons the ask — TA-12/13, mirrors casual-aborts-member behaviour).
- statedTiers normalisation (b)+(d): every turn, `output.access_levels` becomes TIER TOKENS —
  union of tier words in the message ("dealer", "pengedar", compound "Sorento Dealer"),
  access-ish entities, and the LLM's own values normalised via parseLevel. Idempotent over
  tokens already set by the pick.
- Downstream note: deriveRouting's brand-from-access fallback goes dead (tier tokens carry
  no brand) — brand now comes from the entity axis per D6, else defaults sorento (unchanged
  default). `not-found-error-message`'s ` for ${access_levels}` echo now prints tier tokens
  ("for dealer") — an improvement, noted for the reviewer.

## Found during build (report, not improvised around)

1. **`tests/offline/promo-picker` mutate.sh was VACUOUS** — probe.js used
   `path.join(__dirname, argv[2])`, which mangles the absolute `/tmp/pp_mutant.js` path;
   the read threw, probe exited 1, and ALL 26 mutants counted as "caught" regardless
   (§61 class). Fixed (`path.resolve` + no-op-mutant hard-fail); 5 stale anchors
   (M1/M9/M10/M11/M12) and one genuinely-uncatchable mutant (P7 — the fixture's
   equal-end-date group shares one start date) surfaced and were fixed. Suite now 73/73 +
   26/26 REAL detections against the published body.
2. That suite's local `promo-picker.js` had FROZEN at the promotion-picker-era body (217
   diff lines behind the fork) — stale-green, the exact node-source lesson. Re-synced to
   the published bytes.
3. Plan ambiguity resolved (not relitigated): the ask wording for a 2-tier contact — plan
   fixes only the 3-tier string; built as same skeleton, held tiers only, renumbered
   (asserted CM-2a/2b).
4. Concurrent activity: clone `txiPzSxy3Pclsz6v` moved `d9c1ce32` → `bd0023ac` during this
   session — not me (I never wrote to it); flagged for whoever owns that change.

## 🔴 MUST-NOT-PROMOTE (harness wiring that stays on the fork)

A future promote to live must re-apply the reviewed hunks onto LIVE bodies (LESSONS §57 —
never block-copy fork nodes) and must EXCLUDE:

- All `replay-*` / `fixture-*` nodes and lanes (replay pinning).
- `sim-inject-gate` / `sim-inject-session`, `session-get-gate`/`pg-get-session`/
  `pg-upsert-session` (n8n_test session shadow), `console-incoming-gate` /
  `log-incoming-chat-history-n8ntest`.
- Every sendmsg caller's target `ublq9nSlrpz63xan` (sub-sendmsg-CHAT) — live uses the
  published sendmsg sub.
- `Call 'sub-respond-save-message-redis'2` target `tWm5DYLxfypmVC1T` (TEST redis sink).
- `Call 'sub-query-reformulator'` target `RJ326g9dwe3bTWyf` — live promote of the parser
  hunks targets the live published sub `XTODTw-dJcV0uRdC056hG`.
- `Call 'sub-get-results'` TARGET `t4QvrtrPnTwRU6br` (CS-BUILD fork) — live calls
  `rysSPgUssLDf6xJc` (see memory: live-calls-getresults-test-fork 🚩); promote only the two
  INPUT expressions, not the target.
- guard-* redis records, `parser-bypass-gate`/`mock-parser-output`, chat-attach lanes,
  voice mock lanes (`if-audio-mock`, `decode-audio-b64`, …).
- Parser fork riders NOT in this change (e.g. anything the fork carries beyond live —
  re-diff at promote time; a "fork == live + these hunks" claim decays, LESSONS §57).

Promote order when it happens: parser first (spine's tier-gate tolerates compound values),
then spine — and BOTH must land together with the CRM unchanged (the mapper consumes
today's `name[]`, D8).
