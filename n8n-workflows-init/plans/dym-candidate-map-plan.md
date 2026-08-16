# Change: `dym-candidate-map` (did-you-mean pick RETAINS prior customer + date via a labeled candidate→token map)

Status: PLAN (planner deliverable). No workflow edited, no execution run.
**Scope tag: `parser`** — the reconciliation edit lives INSIDE the reformulator sub `output_exchange` Code
(runs AFTER the LLM; `mock_reformulator_output` bypasses it — plan §8 note / LESSON 28 — so this side is
mock-blind and REQUIRES the real reformulator). The **build+store+clear** hunks are on the SPINE
(`build-suggest-offer`, `compile-current-state`) and are deterministic Code — 0-token unit-testable
offline (§V-DYM0) — but the end-to-end pick REQUIRES a stateful driver + the real reformulator (state must
round-trip turn N→N+1). Related but DISTINCT from [[backlog-post-resolve-entity-reconciliation]] (carried
wrong-hint entity pollution — not scheduled) and [[parser-domain-continuity-carry]] (domain carry — shipped
on the fork).

Source of truth: live n8n via MCP. Build/test target = fail-closed clone **`txiPzSxy3Pclsz6v`**
(`sorento-consume-main TEST`, versionId `af6c94e7-…`, verified this cycle). Reformulator the clone calls =
FORK **`wI5RkNGW3EOJfBdo`** (`sub-semantic-parser FORK domain-continuity-carry`, versionId
`f7e6afd0-…`). NEVER edit live spine `9qVyfUxmRQqrpGRMDLRuz` or live sub `XTODTw`.

Bug grounding: live sub `XTODTw` exec **8666864** (T2 pick dropped customer + date); resolver-shape
grounding: clone exec **8691536** (`resolutions[].token` + per-token `.matches[]`).

---

## 0. The bug (grounded, exec 8666864)

- **T1** "I bath studio Srtwc286 delivery 13/07/26 to 15/07/2026" → order query. Parser entities =
  `[{customer "I bath studio"→300-I057}, {product "Srtwc286"→SRTWC286-SH AMBIGUOUS}]`,
  `date_filter 2026-07-13 → 2026-07-15`. get-results empty → not-found → `build-suggest-offer` **D1**
  emits *"Couldn't find Srtwc286. Did you mean SRTWC286-SH, SRTWC286-SH-PP, or SRTWC286-SH-NEW-150?"*.
  That turn ALSO merged a CS member roster (order query → escalate offer) →
  `compile-current-state._merge` → **`selection_context = member_offer`**, `last_result_set` = the member
  roster (NOT the candidate codes).
- **T2** user TYPED "SRTWC286-SH" (a did-you-mean pick). LLM output:
  `entities=[{SRTWC286-SH, hint:order}]`, `entity_op=replace_combine`, **`scope_exclusive=true`**, date null.
  `output_exchange` replace_combine + `scope_exclusive` → `keptPrior=[]` → **DROPPED the customer** and
  (replace_combine carries no date) **DROPPED the 13-15/07 window** → get-results scoped only by the code
  (the I-BATH row shown was coincidental; its 06/07 delivery is outside the intended window).

**Root cause (two independent drops in `output_exchange`, fork `wI5RkNGW3EOJfBdo`):**
1. `case 'replace_combine'` (L223-246): `const exclusive = output.output.scope_exclusive === true` (L227);
   `exclusive && current.length>0` → `keptPrior = []` (L237) → the carried customer entity is dropped.
2. Date carry lives ONLY in `case 'reuse'` (L199-204) — `replace_combine` has **no** date carry → the
   prior `date_filter_start/end` is lost. (Order IS in `DATE_FILTER_DOMAINS` L629, so a carried date WOULD
   survive the date gate — the loss is purely the missing carry.)

The parser can't be trusted to keep them: it emitted `scope_exclusive=true` and a wrong `hint:order` on the
picked code. **User wants: on a did-you-mean pick, RETAIN the prior customer + date, resolve the picked
code, ignore the LLM's `scope_exclusive`/hint.**

---

## 1. Design (DECIDED with user — do NOT redesign): a LABELED candidate→source-token map

> **CRITICAL — do NOT string/prefix-match the picked code to a prior entity.** The resolver/MCP can suggest
> FUZZY/typo corrections that are NOT prefixes (user types `cwc2816` → suggestion `cwcx2816`; `Srtwc286` →
> `SRTWC286-SH`). Prefix/substring matching breaks on the fuzzy case. Instead, capture the token→candidate
> linkage **at suggestion-build time** (where it is authoritative and free) and carry it forward.

Three moves: **BUILD+STORE** (spine), **CARRY+CLEAR** (spine), **CONSUME** (reformulator fork).

### `dym_candidates` shape (one entry per offered suggestion)

```js
{
  code:          "SRTWC286-SH",   // the suggested option the user taps/types (canonical_code)
  uuid:          "…|null",         // that option's own uuid (optional resolve hint)
  entity_type:   "product|…",      // that option's resolved type
  for_raw:       "Srtwc286",       // ★ the SOURCE token the user originally typed (res.token / askedCode)
  for_hint:      "product",        // hint of the source entity (from parser q.entities matched to for_raw)
  for_canonical: "SRTWC286-SH|null" // the source entity's ambiguous canonical, if any (fallback matcher)
}
```
The map is a **code→source-token** dictionary, NOT a positional `last_result_set`: the user taps/types the
code itself (no numbered lookup). It coexists with `last_result_set` (which, on the merged turn, is the
member roster) — see §4 precedence.

---

## 2. BUILD + STORE (SPINE clone `txiPzSxy3Pclsz6v`)

### Edit A — `build-suggest-offer` (`7972abd8`): capture the map when D1/D2 build a suggestion

The linkage already exists in this node — persist it into `out.dym_candidates`:

- **D1 (resolution-miss "did you mean")** — L140-218. `d1.token` (L174) IS the raw source token
  (`res.token`; the bug message rendered "Srtwc286" = the raw). Each pick carries `p.m.canonical_code`,
  `p.m.uuid`, `p.m.entity_type` (already written into `suggest_last_result_set` L198-201 / L209-212). Add,
  in BOTH the numbered-mode (L198-201) and code-mode (L209-212) branches, alongside `suggest_last_result_set`:
  ```js
  // for_raw = the source token; for_hint/for_canonical from the parser entity that produced it
  const _srcEnt = (Array.isArray(q?.entities) ? q.entities : [])
    .find(e => String(e.raw||'').toLowerCase().trim() === String(d1.token||'').toLowerCase().trim());
  out.dym_candidates = picks.map(p => ({
    code: p.m.canonical_code, uuid: p.m.uuid || null, entity_type: p.m.entity_type || null,
    for_raw: d1.token, for_hint: (_srcEnt && _srcEnt.hint) || p.m.entity_type || null,
    for_canonical: (_srcEnt && _srcEnt.canonical_code) || null,
  }));
  ```
  (Numbered-mode uses `p.label` for display but `p.m.canonical_code` is still the pick's code — key the map
  on `code`, not `label`. For a uuid-coded promotion candidate `code` may be the uuid; that is fine — the
  user taps a number in that mode, and the promotion did-you-mean is a different flow. `dym_candidates` is
  still stored but §3 detection keys on a typed CODE, so a numbered promotion pick won't false-fire.)

- **D2 (data-miss "alternatives")** — L220-307. `askedCode` (L242-243) = `compat[0].code` = the queried
  source token; each alternative `a.value` = the suggested code. Add, in the non-uuid branch (after L281)
  and the uuid branch (after L303):
  ```js
  out.dym_candidates = out.suggest_last_result_set.map(r => ({
    code: r.product || r.value, uuid: r.uuid || null, entity_type: r.entity_type || null,
    for_raw: askedCode, for_hint: (compat[0] && compat[0].entity_type) || null,
    for_canonical: (compat[0] && (compat[0].code || compat[0].canonical_code)) || null,
  }));
  ```
  (D2's linkage is per-QUERY, not per-token — coarser than D1 but sufficient: on a data-miss there is one
  queried entity per alternatives set.)

- **D3 (incoming sibling picker)** — L21-108. Do NOT set `dym_candidates` there: the sibling picker is a
  positional `last_result_set` pick (query-forward change) and there is no ambiguous source token to
  re-resolve. Leave D3 untouched → `dym_candidates` stays undefined on that path.

- Every non-suggestion return path leaves `out.dym_candidates` unset (→ cleared in Edit B).

### Edit B — `compile-current-state` (`7a130a0c`): persist + ALWAYS clear

`output.variables` (L209-228) is the persisted session blob, **rebuilt fresh every turn** and passed whole
to the next turn as `previous_conversation_state` (verified: `Call 'sub-query-reformulator'.previous_conversation_state`
= `$('get-session-vars').first().json.session_vars.variables` — the **entire** variables object, no field
whitelist). Add one key to the returned `variables` object (L210-227):
```js
"dym_candidates": (_sug && Array.isArray(_sug.dym_candidates)) ? _sug.dym_candidates : [],
```
- `_sug` (L25-30) is `build-suggest-offer` output when `suggest_offer===true` — this survives the `_merge`
  case (L35) too, so the map is stored EVEN when `selection_context='member_offer'` (L184).
- **ALWAYS emitting `[]` when no offer built = the CLEAR mechanism.** Because `variables` is rebuilt whole
  each turn, the pick turn's own `compile-current-state` (which has no new `_sug`) writes `[]` →
  `dym_candidates` is cleared after exactly one consumption, and a fresh query overwrites with new
  candidates. NEVER rely on absence — write `[]` explicitly so a merge-style session persist can't leave a
  stale map (LESSON 31 reuse-path caveat).

No other `compile-current-state` change: `last_result_set` (L180-182) and `selection_context` (L184) keep
their current behaviour (member roster + `member_offer` on the merged turn).

---

## 3. CONSUME (REFORMULATOR fork `wI5RkNGW3EOJfBdo`): reconcile on the pick turn

### Edit C — `output_exchange` (`847a1173`): the did-you-mean reconciliation block

Insert a new block **after the reuse→replace_combine promotion (L93) and BEFORE the entity-op executor
(L140)** so the executor sees the corrected entities + `scope_exclusive`. Anchor on code content (fork
lines drift when the coder re-forks current).

```js
// ── DID-YOU-MEAN PICK RECONCILIATION (labeled candidate→token map) ──
// If the prev turn stored dym_candidates and THIS message is a code matching one, RETAIN all prior
// entities, REPLACE only the source token's entity in-place with the picked code, CARRY the prior date,
// and IGNORE the LLM's scope_exclusive + (mis-)hint. Keyed on the EXPLICIT map, never on string/prefix.
(function tryDymPick(){
  const _prev = parent_input.previous_conversation_state || {};
  const _cands = Array.isArray(_prev.dym_candidates) ? _prev.dym_candidates : [];
  if (!_cands.length || !output.output) return;
  const norm = s => String(s ?? '').trim().toLowerCase();
  // the picked code: the raw user reply (button tap / typed), OR a current-message entity's raw/canonical
  const _msg = norm(String(parent_input.latest_user_message ?? '').split(/\s*reply to:/i)[0]);
  const _curEnts = Array.isArray(output.output.entities) ? output.output.entities.filter(e=>e&&e.current_message===true) : [];
  const _codeMatches = c => norm(c.code) === _msg
      || _curEnts.some(e => norm(e.raw)===norm(c.code) || norm(e.canonical_code)===norm(c.code));
  const _hit = _cands.find(_codeMatches);
  if (!_hit) return;                          // code not in the map → fall through to today's behaviour

  const _prior = Array.isArray(_prev.entities) ? _prev.entities.map(e=>({ ...e })) : [];
  // find WHICH prior entity this suggestion was FOR (for_raw primary; for_canonical / for_hint fallback)
  let _idx = _prior.findIndex(e => norm(e.raw) === norm(_hit.for_raw));
  if (_idx < 0 && _hit.for_canonical) _idx = _prior.findIndex(e => norm(e.canonical_code) === norm(_hit.for_canonical));
  if (_idx < 0 && _hit.for_hint) {
    const _sameHint = _prior.filter(e => norm(e.hint) === norm(_hit.for_hint));
    if (_sameHint.length === 1) _idx = _prior.indexOf(_sameHint[0]);   // unambiguous single-hint fallback
  }
  const _picked = { raw: _hit.code, hint: _hit.for_hint || _hit.entity_type || (_idx>=0 ? _prior[_idx].hint : null),
                    canonical_code: _hit.code, uuid: _hit.uuid || null, current_message: true };
  let _final;
  if (_idx >= 0) { _prior[_idx] = _picked; _final = _prior.map(e=>({ ...e, current_message: true })); }
  else { _final = [ _picked, ..._prior.map(e=>({ ...e, current_message: true })) ]; output.output.dym_replace_unmatched = true; }

  output.output.entities        = _final;      // chosen replaces source token in-place; others RETAINED
  output.output.entity_op       = 'replace_combine';
  output.output.scope_exclusive = false;       // IGNORE the LLM's scope_exclusive=true
  output.output.message_type    = 'business_query';
  // carry prior domain (do NOT trust the LLM's mis-hint-derived domain on a bare code pick)
  if (_prev.domain_hint) { output.output.domain_hint = _prev.domain_hint; output.output.intent_hint = output.output.intent_hint || _prev.intent_hint; }
  // carry the prior date window if THIS turn named none
  if (!(output.output.date_filter_start || output.output.date_filter_end)) {
    if (_prev.date_filter_start) output.output.date_filter_start = _prev.date_filter_start;
    if (_prev.date_filter_end)   output.output.date_filter_end   = _prev.date_filter_end;
    if (_prev.date_mode)         output.output.date_mode         = _prev.date_mode;
  }
  output.output.dym_pick_applied = true;       // diagnostic + precedence guard (see §4)
})();
```

Behaviour on the entity-op executor (L140-251) after this block: `current` = all retained+picked
(current_message:true); `scope_exclusive=false` → `keptPrior = prior.filter(not same axis)` (L240) drops the
now-duplicated prior (in `order`, product+customer share `order_scope` — L151-154 — so both prior copies
filter out) → `finalEntities` = exactly the reconciled set. The picked code re-resolves cleanly next via
`resolve-entity` (raw = a full code); `uuid`/`canonical_code` are carried as resolve hints. Order ∈
`DATE_FILTER_DOMAINS` (L629) → the carried date survives the date gate.

### Edit D — guard the member-pick override so a code pick is not mis-consumed

The member-pick override (L518-623) fires on `selection_context==='member_offer'`; a code reply would hit
`_isNewQuery` (L556) → Tier-3 abandon (harmless to entities, but the dym block already set them). Add the
guard at L520 so it is a clean no-op when the dym pick fired:
```js
if (_selCtx === 'member_offer' && output.output.dym_pick_applied !== true) {
```

### `suggest-follow-up` (`00db72a7`) — NO edit needed

It gates on `prevState.selection_context === 'suggest_offer'` (L9). On the **non-merged** did-you-mean turn
(`selection_context='suggest_offer'`) it already inherits domain + sets `business_query` on a code/entity
pick (L13-21) — complementary to Edit C (which also sets those, so no conflict). On the **merged** turn
(`member_offer`) it does not fire — Edit C owns domain/message_type there. `yes`→escalate (L22-24) and
`no`→decline (L26-30) remain the affirmative paths; neither matches a dym code, so Edit C leaves them alone.

---

## 4. Precedence (member roster + dym_candidates both live) & edge cases

On the merged bug turn, T1 persists BOTH `last_result_set` = member roster (`selection_context=member_offer`)
AND `dym_candidates` = the three codes. T2 precedence, all disjoint by reply shape:

| T2 reply | Path | Result |
|---|---|---|
| a **CODE** in `dym_candidates` (`SRTWC286-SH`) | Edit C (`dym_pick_applied`) → Edit D skips member block | did-you-mean pick: retain customer + date, resolve code |
| a bare **NUMBER** (`2`) | Edit C no-hit → member block `_pos` (L573) | member pick (existing path) |
| a **name** matching the roster | Edit C no-hit → member block `_pm` (L583) | member pick (existing) |
| bare **"yes"** | Edit C no-hit → member block `is_affirmative` (L603) → round-robin | escalate (existing) |
| bare **"no"** | member block (L605) | decline (existing) |
| a code **NOT** in `dym_candidates` | Edit C no-hit → today's fallback | fresh query (no regression) |

- **Multiple ambiguous tokens, each with candidates:** `dym_candidates` holds entries for every token;
  the matched code's `for_raw` pins exactly which prior entity to replace — the others are retained.
- **Single-token did-you-mean (no other prior entity):** `_prior` has only the source entity → replace it,
  `_final` = [picked] → resolves the code with no regression (nothing extra to retain).
- **Fuzzy/typo pick** (`cwc2816`→`cwcx2816`): the map stored `{code:"CWCX2816", for_raw:"cwc2816"}` at
  build time → detection matches `code`, replacement pins the `cwc2816` prior entity by `for_raw` — **no
  prefix/substring relation required**. This is the whole reason the map is explicit.
- **Clear:** consumed → next `compile-current-state` writes `dym_candidates:[]` (Edit B) → gone after one
  turn; a new suggestion overwrites it.

---

## 5. What this change does NOT touch (invariants)

- `disallowed-entity-gate`, `resolve-entity`, get-results, get-rag, D3 sibling picker — unchanged.
- `last_result_set` / `selection_context` semantics in `compile-current-state` — unchanged (member roster
  still wins for positional/name picks).
- The member-pick tiers (retarget / pick / new-query / junk) — unchanged except the entry guard (Edit D).
- `deriveRouting`, `person_mention`, domain-continuity carry (parser-domain-continuity-carry), date-filter
  gate policy, blocklist-apply — unchanged.
- Full edit inventory: **Edit A** (`build-suggest-offer.jsCode`, D1×2 + D2×2 hunks) + **Edit B**
  (`compile-current-state.jsCode`, one key) on the SPINE clone; **Edit C** + **Edit D**
  (`output_exchange.jsCode`, one block + one guard) on the reformulator FORK. Three nodes, six hunks.

---

## 6. Build & safety gating

- **Build/test on the clone + fork; NEVER live.** Spine edits (A, B) → clone `txiPzSxy3Pclsz6v`.
  Reformulator edits (C, D) → fork `wI5RkNGW3EOJfBdo` (publish the fork BEFORE testing the clone —
  LESSON 37: the clone calls only the PUBLISHED fork). LIVE `XTODTw` + spine `9qVyfUxmRQqrpGRMDLRuz`
  untouched until user-gated promotion.
- **Zero egress is structural.** `build-suggest-offer`/`compile-current-state`/`output_exchange` are
  Code-only (no send/assign/write). All real egress is on the spine and fail-closed on the clone (orphan
  egress nodes + `is_test=true` on every shared-sub call). §0 S1-S6 bind every case.
- **Promotion (later, user-gated):** apply A/B to live spine and C/D to live `XTODTw` byte-exact +
  sha-gated (LESSON 25), backup-first, publish, verify draft==active before AND after. Two separate
  promotable diffs (spine + parser sub).

---

## 7. Driver — multi-turn pick needs REAL session carry (uac mode cannot)

The whole change is turn N stores `dym_candidates`, turn N+1 reads
`previous_conversation_state.dym_candidates`. `uac` mode CANNOT round-trip state (sources prior state from
PROD; redis-item `previous_conversation_state` injection does NOT reach the reformulator — LESSON 31). So
every case runs a stateful, real-reformulator driver (zero-egress):

1. **`chat-stateful` console lane (PRIMARY)** — chat webpage → dispatcher → clone → fork; session R/W via
   `pg-get-session`/`pg-upsert-session` on `respond_contacts_test`; reply read from redis
   `chat:reply:{chat_id}`. Reset the session row ONCE before T1 of each chain; NEVER between turns.
2. **`mode=regress-capture` (ALTERNATIVE)** — drive by redis item; session sources from
   `respond_contacts_test`, each write visible to the next turn (do NOT reset within a chain).

> **REPLAY IS BLIND to Edit C** — golden `regress-replay` pins `mock_reformulator_output` (bypasses
> `output_exchange`). Do NOT use pinned replay for the CONSUME cases. The offline unit (§V-DYM0) covers the
> BUILD/STORE hunks cheaply; the CONSUME cases need the real fork.

---

## 8. Verification tasks (planner-defined)

- **V-DYM0 (offline units, 0-token — cheapest gate FIRST).**
  - **Build side (`build-suggest-offer`):** feed synthetic `resolve-entity.resolutions` + parser `q` for
    (i) D1 code-mode (ambiguous `Srtwc286` → 3 SH codes) and (ii) D1 fuzzy (`cwc2816` → `cwcx2816`) and
    (iii) D2 alternatives; assert `out.dym_candidates` is populated with correct `{code, for_raw, for_hint}`
    per suggestion (via `prepare_test_pin_data`→`test_workflow` pinning the node's `$()` sources, or a
    standalone harness).
  - **Consume side (`output_exchange`):** feed synthetic `previous_conversation_state` (customer + ambiguous
    product entities + date + `dym_candidates`) and LLM `output.output` (`{SRTWC286-SH, hint:order}`,
    `replace_combine`, `scope_exclusive:true`) → assert `output.output.entities` retains the customer +
    replaces the product in-place, `scope_exclusive===false`, `date_filter_start/end` carried,
    `dym_pick_applied===true`. Add the fuzzy variant (`cwc2816`/`cwcx2816`) and the code-not-in-map
    fallback (no `dym_pick_applied`, entities untouched).
- **V-DYM1 (round-trip persistence).** After a T1 that builds a did-you-mean, inspect the clone
  `compile-current-state` output / the would-be-written session blob (orphaned `save-session-vars` input,
  LESSON 42) and confirm `variables.dym_candidates` is present with the codes; on a subsequent no-offer
  turn confirm it is written back as `[]` (cleared). Confirm it round-trips into the fork's
  `previous_conversation_state.dym_candidates`.
- **V-DYM2 (flagship repro e2e, exec-8666864).** `chat-stateful`: T1 "I bath studio Srtwc286 delivery
  13/07/26 to 15/07/2026" → T2 "SRTWC286-SH". Assert T2 `output.output.entities` contains BOTH the
  customer (I bath studio / 300-I057) and product (SRTWC286-SH), `scope_exclusive===false`,
  `date_filter_start==='2026-07-13'` & `date_filter_end==='2026-07-15'`, `dym_pick_applied===true`, and
  get-results is scoped by customer + code + the 13-15/07 window. §0 holds.
- **V-DYM3 (fuzzy pick e2e).** Drive a turn whose resolver returns a non-prefix fuzzy suggestion
  (`cwc2816`→`cwcx2816`); pick it; assert the `cwc2816` prior entity is replaced by `CWCX2816` with NO
  reliance on string/prefix match (the map's `for_raw` did the linkage).
- **V-DYM4 (precedence, merged member_offer).** On the merged bug turn: a bare NUMBER → member pick
  (member block, `dym_pick_applied` false); bare "yes" → round-robin escalate; a dym CODE → did-you-mean
  pick (Edit D skips the member block). All three distinct.
- **V-DYM5 (regression / inertness).** A code NOT in `dym_candidates` → today's fallback (fresh query);
  a turn with no `dym_candidates` in prev state → `output_exchange` byte-behaviour-identical
  (`dym_pick_applied` absent). Member-pick §15 cases + suggest-offer §16/§17 round-trip unregressed.
- **V-DYM6 (§0).** Zero egress on every e2e case — reply via `chat:reply` / clone egress log; no
  `api.respond.io/.../message` POST; no assign/SLA/PIC/session-PUT write; every invoked sub `is_test===true`.

---

## 9. Acceptance criteria

1. **Flagship repro fixed (V-DYM2):** picking "SRTWC286-SH" after the I-bath T1 RETAINS the customer AND
   the 13-15/07 date, resolves the code, `scope_exclusive` NOT applied.
2. **Fuzzy pick works (V-DYM3):** a non-prefix suggestion (`cwc2816`→`cwcx2816`) resolves the source
   entity via the explicit map — no string/prefix matching relied on.
3. **Precedence intact (V-DYM4):** on a merged member_offer+did-you-mean turn, a code → did-you-mean, a
   number/name → member pick, "yes" → escalate — no path broken.
4. **Fallbacks (V-DYM5):** code not in the map → fresh query; single-token did-you-mean → resolves with no
   regression; member-pick + suggest-offer round-trips unregressed.
5. **Map cleared (V-DYM1):** `dym_candidates` is written `[]` on any non-offer turn → does not linger past
   the pick turn.
6. **Zero egress (§0 S1-S6)** on every case.
7. **Promotable diff = 3 nodes / 6 hunks:** `build-suggest-offer` (A) + `compile-current-state` (B) on the
   spine; `output_exchange` (C+D) on `XTODTw`. No other node changed; `suggest-follow-up`,
   `disallowed-entity-gate`, member-pick tiers (beyond the Edit-D guard) untouched.
</content>
</invoke>
