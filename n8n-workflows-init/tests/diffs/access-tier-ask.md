# Node-diff — tier-only access ask (access-tier-ask-plan.md, built 2026-08-11)

**Round 2** — the three UAC blockers (plan §1b D9/D10/D11) are fixed; see the dedicated section
at the end. Fork spine `RnpxEnAV3g20MmKj` @ **`bba611fa`**, fork parser `RJ326g9dwe3bTWyf` @
**`668cd772`**. **Live untouched.** Hashes + rollback: `tests/manifests/access-tier/README.md`.
Offline: `tests/offline/tier-ask/` (round 2: RED 24/109 → GREEN **111/111**, mutate **25/25**).
Acceptance: `tests/uac/TA.md`. Round-2 sweep touched only `tier-gate`, `promo-picker`,
`output_exchange` — no new nodes, no connection change.

The sections below describe the feature as a whole (round 1 built it, round 2 corrected it);
each round-2 change is also called out in its own node section.

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

## ROUND 2 — the three UAC blockers (plan §1b)

### D9 — brand recovered from a COMPOUND stated level (`output_exchange`, `tier-gate`)

Root cause is NOT "the LLM dropped the brand". Verified on `_parser_raw`, exec 12041502:
the LLM emitted `access_levels: ["Cabana Dealer"]` **and** `routing.suggested_team:
"marketing_promotion_cabana"`. My round-1 normalisation ran `parseLevel` and kept only
`.tier`, discarding `.brand` — so `query_brands` was `[]` and the gate never fired. Word order
decided whether a security boundary existed.

**Where the union runs: the PARSER, not tier-gate.** Stated and justified as asked:
(a) the raw compound only exists there — `_parser_raw_snapshot` is the frozen pre-mutation
object, and one line later the levels are tier tokens; (b) D6 prescribes exactly this
("normalized brand derived deterministically in `output_exchange`"); (c) the alternative —
shipping raw levels across the sub boundary so the spine can re-derive — would put two
representations of the same fact on the wire, which is the second-source-of-truth failure D6
exists to prevent. `statedBrands(entities, rawLevels)` is embedded from the mapper byte-exact;
its input is `_parser_raw_snapshot.access_levels` ∪ the current (still-raw) array.

- `output_exchange`: emits `query_brands` in the same block that normalises tiers, immediately
  BEFORE the normalisation destroys the brand.
- `output_exchange` / `deriveRouting`: prefers `out.query_brands[0]` over the entity scan.
  This repairs a round-1 regression I had only flagged as a note — the access-level brand
  fallback went dead when levels became tier tokens, so a Cabana ask routed to the Sorento
  team. Empty/absent `query_brands` ⇒ the original two rules verbatim.
- `tier-gate`: consumes `parser.query_brands`; falls back to the round-1 entity-only scan when
  the field is absent, so an older/live parser degrades instead of throwing.
- Bounds asserted: the entity phrasing still works (D9-2a/2b, keeps TA-10R green) and a
  brand-free query stays inert (D9-4).

### D10 — the brand gate fails closed IN n8n (`promo-picker`)

Round 1 rendered the notice and then still attached every file, resting on my own comment that
`access_levels: []` makes the CRM return nothing. That was an assumption asserted as fact, it
was never verified, and exec 12041565 showed the consequence: 6 Sorento PDFs for a Cabana ask
under a notice saying the customer has no Cabana access.

- New guard at the TOP of `promo-picker` (after the domain check, **before** the
  envelope-shape branch, so no exit path can leak): `brand_gate_empty === true` ⇒
  `answers = []`, `attachments = []`, response/intro = notice + `Would you like me to escalate
  to <team> team?`, roster + selection_context cleared, `_brand_gate_closed` recorded.
- `_escTeam` HOISTED above the shape check (pure move, same expression) so the denial can name
  the right team; the strict-not-found block still reads the same binding.
- `tier-gate` still sends `[]` — but the stale comment claiming that is the enforcement is
  replaced by one saying it is a narrowing REQUEST, not the boundary.
- Bounded: the tier-level Q23 notice still ANSWERS with files (D10-4); an open gate is
  byte-inert (D10-3). Both directions have a mutant.
- **Why this makes TA-11's true negative unnecessary for safety** (tester note (a)): with the
  guard, the denial is decided entirely by `brand_gate_empty`, which is computed in n8n from
  the contact's own entitlement — the CRM is never consulted about it. Arranging a contact
  whose brands exclude the queried brand would now only re-confirm a locally-decided branch
  the offline probe already drives directly (D10-1a…1h). It remains worth doing as a
  behavioural confirmation, but it is no longer load-bearing for the access boundary.

### D11 — a pending non-tier pick outranks the ask (`output_exchange`, `tier-gate`)

- `output_exchange` emits `_pending_pick`, computed from TWO signals: an explicitly resolved
  pick (`_promo_pick_scope_reused` / `dym_pick_applied` / `member_pick_context` /
  `positions_resolved` / `select_all_expanded` / `reference_positions`), or a CONTINUATION —
  a non-tier roster pending AND this turn named no new scope.
- `tier-gate` passes `{pendingPick}` to the mapper's 4-arg `needsTierAsk`, ORing the parser
  flag with the three spine-visible provenance flags (defence in depth if a parser without
  `_pending_pick` is ever wired), and excluding the tier-pick answer turn itself.
- **The bound is the point**: `!_ppNamedNewScope` is what keeps D4 alive — "promo for
  CBS212-WH" with a roster pending is a NEW query and must re-ask (D11-3a/3b, D11-4 replay
  TA-7's exact recorded prev-state). A mutant that removes the bound goes red on D11-3b.
- `tier_offer` is excluded from "pending roster" in ONE place. I wrote a second, outer
  `!== 'tier_offer'` guard and then deleted it: no mutation could turn it red because the
  other two conditions already covered every case — a clause that cannot fail is the §61 smell,
  so it went, and D11-8a/8b now pin the single remaining exclusion (customer ignores the ask
  with an entity-less non-pick ⇒ the ask must re-fire, not answer at full entitlement).

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
5. (round 2) The round-1 note "deriveRouting's brand-from-access fallback goes dead" was a
   REAL REGRESSION I under-called as a note: it silently downgraded a Cabana ask to the
   Sorento team (visible in exec 12041502's normalised output, where the LLM had said cabana).
   D9 fixes it and D9-1e pins it. Lesson for my own reporting: "downstream note" was the wrong
   register for a behaviour change with a customer-visible routing consequence.
6. (round 2, NOT chased per instruction) contact `437264483` gets 0 matches/0 alternatives
   from the CRM resolver while `477071889` resolves the same tokens — environment, tracked as
   the plan's own open item.

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
