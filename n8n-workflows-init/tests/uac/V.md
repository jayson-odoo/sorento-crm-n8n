# UAC §V

> ⚠️ **`00-SAFETY-always-read.md` (§0) applies to every case here.**

## §V-DYM0. Offline units  (0-token, no seed) — PRIMARY GATE (plan §8 V-DYM0)

Pin node `$()` sources via `prepare_test_pin_data`→`test_workflow` (or a standalone harness) and assert
directly. No LLM, no egress.

**Build side — `build-suggest-offer` (`7972abd8`, clone):** feed synthetic `resolve-entity` +
reformulator `q` (parser output):
- **V-DYM0-a — D1 code-mode map:** ambiguous token `Srtwc286` → matches `[SRTWC286-SH, SRTWC286-SH-PP,
  SRTWC286-SH-NEW-150]` (non-exact). **Assert** `out.suggest_offer===true` AND
  `out.dym_candidates` = 3 entries, each `{code:<one of the SH codes>, for_raw:'Srtwc286',
  for_hint:'product'}` (map keyed on `code`, not label).
- **V-DYM0-b — D1 fuzzy/typo map (non-prefix):** token `cwc2816` → resolver match `CWCX2816`. **Assert**
  `out.dym_candidates` contains `{code:'CWCX2816', for_raw:'cwc2816', for_hint:'product'}` — proves the
  linkage is captured from the resolver grouping, NOT derived by prefix.
- **V-DYM0-c — D2 alternatives map:** queried `askedCode` empty + `alternatives:[…]`. **Assert**
  `out.dym_candidates[].for_raw === askedCode` for each alternative code.
- **V-DYM0-d — non-suggestion return path:** no D1/D2/D3 fires. **Assert** `out.dym_candidates` is unset
  (→ Edit B writes `[]`).

**Consume side — `output_exchange` (`847a1173`, fork):** feed synthetic `previous_conversation_state` +
pinned LLM `output.output`:
- **V-DYM0-e ★ — flagship reconciliation:** prev `entities:[{customer 'I bath studio', canonical '300-I057'},
  {product 'Srtwc286', canonical 'SRTWC286-SH'}]`, `date_filter_start:'2026-07-13'`,
  `date_filter_end:'2026-07-15'`, `domain_hint:'order'`, `selection_context:'member_offer'`,
  `dym_candidates:[{code:'SRTWC286-SH', for_raw:'Srtwc286', for_hint:'product'}, …]`;
  `latest_user_message:'SRTWC286-SH'`; LLM `entities:[{SRTWC286-SH, hint:'order', current_message:true}]`,
  `entity_op:'replace_combine'`, **`scope_exclusive:true`**, no date. **Assert** `output.output.entities`
  contains BOTH the customer (300-I057) AND SRTWC286-SH (in-place replace of the source product),
  `scope_exclusive===false`, `date_filter_start==='2026-07-13'` & `date_filter_end==='2026-07-15'`,
  `domain_hint==='order'`, `dym_pick_applied===true`.
- **V-DYM0-f — fuzzy pick:** same shape, prev entity `{product 'cwc2816'}` +
  `dym_candidates:[{code:'CWCX2816', for_raw:'cwc2816'}]`, `latest_user_message:'CWCX2816'`. **Assert** the
  `cwc2816` prior entity is replaced by `CWCX2816`, no reliance on string/prefix match.
- **V-DYM0-g — single-token (no other prior):** prev `entities:[{product 'Srtwc286'}]` only. **Assert**
  `output.output.entities===[{SRTWC286-SH…}]`, resolves with no regression.
- **V-DYM0-h — code NOT in map (fallback):** `latest_user_message:'SRTUFV101'` not in `dym_candidates`.
  **Assert** `dym_pick_applied` absent; entities/`scope_exclusive` untouched (today's behaviour).
- **V-DYM0-i — no dym_candidates in prev (inertness):** prev has none. **Assert** `output_exchange`
  byte-behaviour-identical (`dym_pick_applied` absent).
- **Safety:** offline unit, zero egress.
