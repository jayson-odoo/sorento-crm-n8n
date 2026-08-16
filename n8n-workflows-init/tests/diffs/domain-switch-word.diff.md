# Change #6 — `domain-switch-word` — node diff (coder deliverable, reviewer handoff)

**Scope:** ONE node, `output_exchange` (Code), in the CLONE parser fork
`wI5RkNGW3EOJfBdo` (`sub-semantic-parser FORK domain-continuity-carry`). Fork-only build/test.
LIVE `XTODTw`, live spine, clone spine `txiPzSxy3Pclsz6v` — UNTOUCHED. No promote.

## Publish result
- Transport: byte-exact REST GET → swap only `output_exchange.parameters.jsCode` (via `jq --rawfile`,
  zero transcription) → PUT (HTTP **200**, clean — exec-trigger sub, no webhook conflict) → auto-publishes.
- Fork versionId **a570efc0 → c9f6e280** (`versionId == activeVersionId`, `active:true`).
- `output_exchange` jsCode sha (canonical, no trailing newline): **`710e577a…d6b4e13`** (matches intended file).
- `AI Agent` `systemMessage` sha: **`f5c6458a…6e29c9f8` — UNCHANGED** (this change is `output_exchange`-only).
- Only `output_exchange` node params changed vs pre-PUT (all 7 other nodes + connections + credentials byte-identical).
- Deployed jsCode: `node --check` OK, 0 trailing-whitespace lines, 0 tabs.

## Build-time LIVE re-diff (LESSON 57)
Fork `output_exchange` = LIVE `XTODTw` `output_exchange` **+** {v3 `applyDymPick` refactor, #5 domain-carry
(`dym_pick_domain_forced`), #4 select-all + `dymNumberedMultiSelect`}, minus 2 trailing blank lines. `rev4`
(intent-only `_explicit`) and `_parser_raw` snapshot are already in LIVE (shown as unchanged context in the
diff) — no surprise co-resident drift. The fork carries exactly the v3+#4+#5 base the plan asserts. This build
appends #6 to the fork body (preserving all co-resident work); it does NOT rebuild from live (that would drop
the fork's co-resident hunks). LIVE promote of #6 (§DS-promote) is a separate, user-gated, byte-splice round.

## The four hunks (LIVE `output_exchange` → new fork body), grouped A–D per plan

### Hunk A — insert map + `_switchDomain`, immediately AFTER `_explicit`/`domain_signal_source` (fork ~L263)
Adds `const _DOMAIN_SWITCH_WORDS` (promo/stock/order/incoming/catalogue families + BM promosi/stok/tempahan;
EXCLUDES balance/delivery/price/po per D8-R1), `const _SWITCH_FILLER` (greeting/politeness/interrogative/BM
connectors/generic verbs incl. `all`,`semua`-handled), and computes `let _switchDomain = null` — non-null iff:
`!_explicit` AND no current-message entity (`_swHasCurEnt` false) AND after filler-strip ≥1 content token AND
**every** content token maps to the **same** domain. Reads ONLY the current `parent_input.latest_user_message`
(split on `reply to:`); never the previous domain. Before intent (`Before`): nothing. After (`After`): block inserted.

### Hunk B — `&& !_switchDomain` on the entity-less REUSE carry (fork ~L340, inside `case 'reuse'`)
`Before:` `        if (!_explicit) {`
`After:`  `        if (!_explicit && !_switchDomain) {   // #6: a domain switch beats the reuse carry`
Intent: a switch word suppresses the reuse-path domain carry (the exact line that re-ran stock on bare "promo").

### Hunk C — `&& !_switchDomain` on the entity-BEARING continuation carry (fork ~L585)
`Before:` `  if (!_explicit) {`
`After:`  `  if (!_explicit && !_switchDomain) {   // #6: a domain switch beats the entity-bearing carry`
Intent: belt-and-suspenders (mutually exclusive with `_switchDomain` in practice — it requires no current
entity, this carry requires one — but makes the intent explicit).

### Hunk D — apply the switch, AFTER both carries, immediately BEFORE the blocklist-apply (fork ~L603)
Inserts:
```js
if (_switchDomain) {
  output.output.domain_hint = _switchDomain;
  output.output.domain_switched_by_keyword = _switchDomain;   // diagnostic
  output.output.intent_hint = null;   // drop carried/guessed intent; downstream re-derives
}
```
Intent: set the switched domain before `const domain = output.output.domain_hint` (blocklist-apply) and before
`deriveRouting` (~L679), so routing/get-rag/get-results all honor the switch. Routing is NOT hand-set. Carried
entity left as-is (reuse already set it to prior); the existing blocklist prunes an incompatible customer, a
product survives (D3 keep-the-entity).

Diff `fork → new` = exactly these 4 hunks and nothing else (verified: `diff` shows only A insert + B/C one-liners
+ D insert). `_parser_raw`, #2-v3 classifier, #3, #4 all-expansion, #5 domain-force + strict gate — all unchanged.

## Local 0-egress proofs (drive the DEPLOYED `output_exchange`; harness stubs `$`/`$json`, real node code)
Harness: `scratchpad/harness6.js` wraps the node body, feeds synthetic `previous_conversation_state` + LLM
`output` + `latest_user_message`. Run against the deployed body (`fork_verify.json` → `deployed_oe.js`).

| # | case | result |
|---|------|--------|
| (a) ★ | `promo` after stock(SRTWT902), null-intent reuse | domain_hint=**promotion**, `domain_switched_by_keyword`=promotion, `domain_reused_entityless` ABSENT, intent_hint=null, routing=**marketing_promotion_sorento** (NOT warehouse), SRTWT902 retained — **PASS** |
| (b) | `order` / `incoming` / `catalogue` | switch to order / incoming / master_products, `domain_switched_by_keyword` set — **PASS** |
| (b2)| filler `any promo?` / `show me the catalogue` / `stock ada?` | promotion / master_products / inventory (filler stripped to one switch token) — **PASS** |
| (c) | REGRESSION `check stock for SRTW902` (decisive intent + current entity) | inventory via normal path, `_switchDomain` null, `domain_switched_by_keyword` ABSENT — **PASS** (#6 inert) |
| (d) | REGRESSION `how about SRTWT5902` (no domain word, current entity) | reuse inventory, `domain_inherited_compatible=true`, switch ABSENT — **PASS** (#6 inert) |
| (e) | REGRESSION dym pick (bare offered code `SRTWT902`) | `dym_pick_applied=true`, #5 `dym_pick_domain_forced=inventory`, #6 switch ABSENT, pick present — **PASS** |
| (f) | `all` over active dym offer | `select_all_expanded=true` (#4 path intact), #6 switch ABSENT — **PASS** |
| (g) | mixed/excluded `promo stock` / `balance` / `delivery` / `price` | no switch (mixed domains / excluded words), reuse carry → inventory — **PASS** |
| (g2)| `promotions for C2181XUW-P-ENG` (code = current entity) | #6 inert (`_swHasCurEnt` true) — **PASS** |

**Totals: 35 pass / 0 fail** on the deployed body.

**Fail-on-purpose (gate can go red):** the SAME suite on the UNPATCHED fork body yields, for (a):
`domain_hint=inventory | domain_reused_entityless=true | intent=check_stock | team=warehouse` — i.e. it
reproduces the bug (exec 10826285), and all 13 discriminating switch asserts FAIL, while every regression
assert (c–g2) stays PASS on unpatched too (proving they measure pre-existing behavior the patch preserves).
22 pass / 13 fail on unpatched.

## Not run here (correctly deferred)
- **V6-1 / V6-2 / V6-3 e2e** (real reformulator, `chat-stateful`) and the LLM-null-intent precondition are the
  TESTER's job (this change is mock-blind; replay is blind — plan D5). No UAC executions run by coder.
- **LIVE `XTODTw` splice** (§DS-promote) is a separate user-gated round; live parser untouched this round.

## Safety
Fork is a test artifact. REST PUT targeted `wI5RkNGW3EOJfBdo` only (confirmed in the write command). No egress,
no live/spine/clone-spine write. `#6` is gated on `is_test`-independent parser logic and is prod-safe by design
(fires only on `!_explicit` + bare/dominant switch word; inert otherwise).
