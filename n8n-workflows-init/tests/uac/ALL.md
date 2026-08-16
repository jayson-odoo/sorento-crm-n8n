# UAC §ALL

> ⚠️ **`00-SAFETY-always-read.md` (§0) applies to every case here.**

## §ALL. Select-ALL over an active did-you-mean offer (#4)

### §ALL-0 — offline `output_exchange` unit (0-token, no seed) — PRIMARY GATE
- **Pin:** `parent_input.previous_conversation_state` = `{ dym_last_result_set:[{idx:1,value:'C1',for_raw:'A',
  entity_type:'product',uuid:'u1'},{idx:2,value:'C2',for_raw:'A',…},{idx:3,value:'C3',for_raw:'B',…},
  {idx:4,value:'C4',for_raw:'B',…}], dym_offer:{id:'e1',domain:'inventory',candidates:[…4…],picked:[]},
  entities:[<resolved stock entity>], response:'Previous turn (inventory): returned 1 records [4 did-you-mean suggestions active]',
  domain_hint:'inventory', selection_context:null }`; `latest_user_message='all'`; raw
  `output.output.reference_positions=[]`, `reference_target=null`.
- **Assert:** `reference_positions` == `[1,2,3,4]`; `reference_target==='dym'`; `select_all_expanded===true`;
  `scope_intent===null`; after `dymNumberedMultiSelect` → `entities` ACCUMULATES all 4 picked candidates (both
  `for_raw='A'` alternatives ADD-BOTH, both `for_raw='B'`), resolved stock entity RETAINED; each picked entity
  path carries `domain_hint==='inventory'` (post-#5); `reference_positions` cleared to `[]` (stock byIdx no-ops).
- **Fail-on-purpose (MANDATORY):** run the CURRENT LIVE `output_exchange` on the identical input → "all" is
  NOT expanded (no `dym` route; falls to the broaden reading) → this assertion goes RED. Proves the gate.
- **Safety:** §0 all (offline — no egress, 0 LLM tokens).

### §ALL-0b — `semua` / `everything` variants (offline unit)
- **Trigger:** same pin, `latest_user_message` ∈ {`semua`, `everything`, `both`}.
- **Expected:** identical to §ALL-0 (existing `_isAll` regex already covers these).
- **Safety:** §0 all.

### §ALL-R ★ — non-dym "all" BYTE-IDENTICAL to today — HARD REGRESSION GATE
- **Trigger (offline unit, two sub-cases):** (a) `selection_context='suggest_offer'`, `last_result_set`
  non-empty, **NO** `dym_last_result_set`, msg `all` → the EXISTING expansion branch fires (positions = all
  `last_result_set` idx, `entity_op='reuse'`, domain/intent inherited) byte-identical to current LIVE; (b) a
  plain broaden "all" with NO offer and NO pick-context → neither branch fires → LLM broaden reading intact,
  byte-identical.
- **Assert:** node output byte-identical to the current LIVE `output_exchange` on the same input; the byte-diff
  vs §ALL-0 must be NON-empty (comparison is a real instrument, MEMORY green-that-cannot-fail).
- **Safety:** §0 all.

### §ALL-1 — real reformulator, multi-turn (the fix end-to-end)  (contact `437264483`) — `parser`
- **Trigger:** via `chat-stateful` (reset `respond_contacts_test` once before T1). T1 = partial-miss stock
  query (≥1 resolved product + ≥2 unresolved tokens with alternatives, per #2 §9 fixture) → dym offer. T2 =
  `all`.
- **Expected:** EVERY suggestion queried (multi-select); STOCK returned for each (or #3's `No stock records
  found for:` note if a pick is empty); each resolves in the STOCK domain (NOT catalogue).
- **Scoring (LESSON 39):** all suggestions queried in the stock domain OR safe abandon = PASS; a broaden
  "focus/expand?" prompt, or any catalogue answer = soft FAIL, RECORD. Run ≥3×; repeat with `semua`.
- **Safety:** §0 all; full clone (subs `is_test:true`, egress orphaned/sinked); S6 → only reformulator LLM;
  S7a/S7b prod-sink delta zero/attributed.
