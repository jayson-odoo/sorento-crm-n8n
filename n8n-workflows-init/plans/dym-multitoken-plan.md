# Change: `dym-multitoken` — did-you-mean itemizes ALL missed tokens (not just the first)

Status: PLAN (planner deliverable). No workflow edited; no execution run.
**Scope tag: `deterministic`.** The only edited node is `build-suggest-offer`, a spine **Code** node;
its inputs (`resolve-entity`, `Call 'sub-query-reformulator'.output`, `disallowed-entity-gate`) are
pinnable, so the primary gate is a **0-token offline unit** (`prepare_test_pin_data` → `test_workflow`).
No parser prompt edit, no `output_exchange` edit → **not** `parser` tier.

Build/test target = **CLONE `txiPzSxy3Pclsz6v`**. Live spine = `9qVyfUxmRQqrpGRMDLRuz` — **never edited**
(active versionId `a505f2e1-74ef-4fb3-9c87-c4818689b21b`, draft==active, verified clean this cycle).

Source of truth: live spine read read-only via MCP `get_workflow_details` this cycle.
`build-suggest-offer` node id `7972abd8-5d6b-40ff-9d38-152782cd8091` is **shared clone↔live** (LESSONS
§58). `compile-current-state` = live `0804657c` / clone `7a130a0c`. Reformulator fork the clone calls =
`wI5RkNGW3EOJfBdo`, `output_exchange` = `847a1173`.

---

## 1. The bug (diagnosed — formalized here, not re-diagnosed)

`build-suggest-offer` D1 ("did you mean") builds the miss offer from a loop that **breaks on the first
missed token that has candidates**:

```js
// build-suggest-offer, current live/clone (lines 163-169)
let d1 = null;
if (!isClar && !requireSpec) {
  for (const res of missResolutions) {
    const cands = tokenCandidates(res);
    if (cands.length) { d1 = { token: res.token || …, cands }; break; }  // ← BUG: break
  }
}
```

On a multi-token miss (e.g. 3 unresolved product codes in one stock query) only the **first** token
gets a "did you mean"; the other missed tokens are silently dropped from the reply and from the pick
map. `missResolutions` (lines 155-161) **already holds every genuine-miss resolution** (`resolved !==
true` AND no exact match), and `tokenCandidates(res)` (line 138) already returns **each token's OWN**
matches/alternatives (cross-token borrowing is deliberately avoided). The fix is purely in how the D1
block consumes what is already computed.

Unchanged supporting facts (verified this cycle, do not re-verify):
- `cap3 = a => a.slice(0,3)`; `humanLabel(m)` prefers a non-uuid `canonical_code`, else
  `display.description/product_name/name`, else `null` (candidate must be dropped — never leak a uuid).
- `_mkOffer(cands) = {id:String($execution.id), domain:q.domain_hint||null, ttl:3, candidates, picked:[]}`.
- `suggest_last_result_set[]` row shape: `{idx,label,value,product,uuid,entity_type}`.
- `dym_candidates[]` row shape: `{code,uuid,entity_type,for_raw,for_hint,for_canonical}`.
- Existing single-token D1 has TWO sub-modes: **code mode** (all candidates have real codes → code
  buttons + `Did you mean A, B, or C?`) and **numbered/uuid mode** (`anyUuid` → number buttons + human
  names, round-trips by `last_result_set[idx]`).

---

## 2. Locked design (user-approved — NUMBERED multi-block)

Edit **only** the D1 region of `build-suggest-offer`. Steps 1-7 as approved:

1. **Remove the `break`.** Accumulate every missed token that has candidates into a list `d1s`
   (`[{token, cands}]`), in `missResolutions` order.

2. **Route on `d1s.length` (after dropping empty tokens — see step 6):**
   - `0` → fall through to D2 (unchanged).
   - `1` → **EXISTING single-token D1 block, byte-identical** (step 7). `d1 = d1s[0]`.
   - `>1` → **NEW numbered multi-block** (below).

3. **Numbered multi-block message** — global sequential idx across all tokens:
   ```
   Couldn't find some items:

   "<TOKEN_A>" — did you mean:
     1. <code>
     2. <code>
   "<TOKEN_B>" — did you mean:
     3. <code>

   Reply a number to pick, or 'yes' to escalate to <team>.
   ```
   - `team = q?.routing?.suggested_team || 'customer_service'` (existing `team` var).
   - Construction: `\`Couldn't find some items:\n\n\` + blocks.join('\n') + \`\n\nReply a number to
     pick, or 'yes' to escalate to ${team}.\`` where each block =
     `\`"${token}" — did you mean:\n\` + candLines.join('\n')`, each candLine = `\`  ${idx}. ${label}\``.
   - `out.suggest_offer=true`, `out.suggest_selection_context='suggest_offer'`, `out.suggest_response=<message>`.

4. **Quick replies = Yes/No only** (numbers are typed → no respond.io button-cap risk):
   `out.suggest_quick_reply = [YES, NO].map(s => String(s).replace(/,/g,'')).join(',')`
   (`YES='Yes, escalate'` → `Yes escalate`; `NO="No, it's okay"` → `No it's okay`).

5. **`suggest_last_result_set` = flattened across all tokens, global contiguous idx**, each row
   `{idx, label, value, product, uuid, entity_type}` (label=value=product=the candidate code for
   code-shaped picks; `product`=`canonical_code`).

6. **`dym_candidates` = flattened across all tokens, each keeping its OWN `for_raw`** (= its source
   token), plus `for_hint = m.entity_type || _srcEnt.hint`, `for_canonical = _srcEnt.canonical_code`,
   where `_srcEnt` is looked up **per token** (parser entity whose `raw === block.token`). Then
   `out.dym_offer = _mkOffer(out.dym_candidates)`.
   - **Caps:** `cap3` per token (keep); cap the number of missed tokens shown at **5** (numbered list
     ≤ 15 entries). Slice `d1s` to 5 before rendering.
   - **Drop-empty:** compute each token's renderable picks with `cap3(block.cands).map(humanLabel).filter(Boolean)`;
     a token whose candidates ALL drop (bare uuid, no display) is **skipped entirely** (not shown, its
     idx range not consumed). Re-evaluate the `>1` branch condition on the surviving-token count: if
     after dropping only 1 token survives, fall to the single-token block for that survivor; if 0, D2.

7. **Numbered mode subsumes the code/uuid split** on the multi-token path — human labels are rendered
   and the pick round-trips by `last_result_set[idx]` (number) or by `dym_candidates[].code`
   (typed code). **No `anyUuid` branching** on the multi-token path.

**Single missed token → BYTE-IDENTICAL to today.** The existing `if (d1) { … anyUuid ? numbered :
code … }` block (current lines 171-231) is reused verbatim for `d1s.length===1`. Only `>1` triggers
the new numbered multi-block. This is a hard regression gate (§UAC §MT-R).

---

## 3. Consumption is unchanged — only ONE node changes (verified)

`compile-current-state` reads the D1 output **length-agnostically**:
`_sug.suggest_last_result_set` → `last_result_set`; `_sug.suggest_quick_reply` → `quickReply`;
`_sug.suggest_response` → `response`; `_sug.dym_offer` → persisted `_dymOffer`; `dym_candidates` =
mirror of `_dymOffer.candidates`. Larger flattened arrays flow through with no edit.

`output_exchange` (fork `847a1173`) is **not edited**. The pick round-trip (below) is pre-existing
machinery; this change only feeds it correctly-shaped multi-token data.

**Promotion is therefore a 1-node business diff: `build-suggest-offer` only.** (Guard/driver
scaffolding stays on the clone; §5.)

---

## 4. Pick round-trip — CONFIRMED against fork `output_exchange` (`847a1173`)

Two reply forms, both handled by **existing, unedited** fork code:

- **NUMBER reply (the invited path).** `suggest_last_result_set` persists as `last_result_set` with
  the global idx. A typed number resolves via the fork's **positional block** ("REFERENCE POSITIONS →
  ENTITIES"): `reference_positions=[n]` → `byIdx.get(n)` over `last_result_set` → an entity
  `{raw, hint, uuid, canonical_code: row.product}`. Global contiguous idx is exactly what makes
  `byIdx` resolve; the picked row's `product` is the code. ✅
- **CODE reply (fallback).** `tryDymPick` matches `dym_candidates` by `code` (`norm(c.code)===_msg`),
  then finds the source entity via `for_raw` (`_prior.findIndex(e => norm(e.raw)===norm(_hit.for_raw))`)
  and **replaces that entity in place**, retaining all other prior entities + the prior date. Because
  each candidate keeps its OWN `for_raw`, a code offered under token C replaces token C's entity — the
  **dym-candidate-map contract is preserved across tokens**. ✅

**Nuance to record (not a defect of this change):** `for_raw` is exercised on the CODE-reply path;
the NUMBER-reply positional path replaces `entities` wholesale from the picked row and does not consult
`for_raw`. In the flagship multi-token stock scenario there is no prior customer/date to retain, so
wholesale replacement is correct there. `for_raw` retention matters when a miss co-occurs with a
retained entity AND the user types the code — identical behaviour to the shipped single-token
`dym-candidate-map`, not new to this change.

---

## 5. Safety / harness binding (§0)

Zero-egress is **structural** on the clone (fail-closed): this is a Code-only edit that emits fields
consumed downstream; it adds **no egress node**. Every case is bound by UAC.md §0 (S1-S8 as written;
the flagship offline unit exercises no egress at all). The prod-ingest gate is **§0 S7** (sink-delta +
payload attribution — the LLEN-equality form is withdrawn). `dym-single-use` lifecycle in
`compile-current-state` (ttl/picked) is **unchanged**.

---

## 6. Verification tasks (planner-defined)

- **V-MT0 (build unit — PRIMARY GATE, 0-token).** Pin `resolve-entity` + reformulator `q` +
  `disallowed-entity-gate` per the §MT fixture (3 unresolved product tokens, each with its own alts,
  gate `require_specific:false`, `is_clarification:false`, `allowed_lookup:['product',…]`,
  `compatible_entities:[]`). Assert `build-suggest-offer` output per §MT-1 acceptance (3 blocks,
  contiguous idx 1..7, `suggest_last_result_set` len 7, `dym_offer.candidates` len 7 with per-token
  `for_raw`, Yes/No-only quick reply).
- **V-MT-R (single-token regression — HARD GATE).** Run the SAME resolver payload reduced to **token A
  only** against (i) the current live `build-suggest-offer` jsCode and (ii) the changed clone node;
  assert the two outputs are **byte-identical** (code-mode message + 3 code buttons + Yes/No,
  `suggest_last_result_set` len 3, `dym_candidates` len 3 all `for_raw:'C21263XUW-P-ENG'`).
- **V-MT-cap (token cap).** 6-missed-token fixture → assert exactly **5** blocks rendered, idx still
  contiguous, `suggest_last_result_set` length ≤ 15.
- **V-MT-drop (empty-token skip).** Middle token's only candidate is a bare uuid with no display →
  assert that token's block is **omitted** and the surviving tokens' idx stays contiguous (no gap).
- **V-MT-roundtrip (E2E regression, best-effort — real reformulator).** Because `output_exchange` is
  **not** edited, this is a regression guard, not the primary gate. Multi-turn via `chat-stateful`:
  T1 the §MT stock query → T2a a NUMBER, T2b (fresh T2) the CODE of a candidate from the LAST token.
  Assert T2a resolves via the positional path to that row's code; T2b resolves via `tryDymPick` and
  replaces the LAST token's entity (proving per-token `for_raw`). Scope of THIS assertion is
  `parser`-tier (real fork) but the **change scope stays `deterministic`** — output_exchange is
  unedited, so replay/mock-blindness caveats do not gate the promote. If the real resolver/gate cannot
  be made to emit `require_specific:false` for a 3-product all-miss, this case is **skipped and
  recorded as unverified** — V-MT0 remains the gate.

---

## 7. Acceptance criteria (for coder/tester) — the §MT fixture

**Fixture (resolver payload — all 3 unresolved, each with its own alternatives; domain = stock/inventory;
every token hint=product):**

| token (`res.token` / parser `raw`) | candidate codes (order = resolver rank) | cap3 kept |
|---|---|---|
| `C21263XUW-P-ENG` | C2181XUW-P-ENG(0.55), C21131XUW-P-ENG, C21132XUW-P-ENG, BRC21263XUW-P-MY, C21133XW-P-ENG | C2181XUW-P-ENG, C21131XUW-P-ENG, C21132XUW-P-ENG |
| `Bravat C01014UW-P-ENG` | BRCX01014UW-P-ENG | BRCX01014UW-P-ENG |
| `Sorento SRTWCY8605-RL` | SRTWCY8605, SRTWCY8605-PJ, SRTWC8605-SC-RL | SRTWCY8605, SRTWCY8605-PJ, SRTWC8605-SC-RL |

All candidates: `match_tier` non-exact, `entity_type:'product'`, real `canonical_code` (non-uuid),
`uuid` present. Each resolution: `resolved:false`, no exact match. `disallowed-entity-gate`:
`require_specific:false`, `gate_debug.allowed_lookup` includes `product`, `gate_debug.domain:'inventory'`,
`compatible_entities:[]`. Input item `is_clarification:false`. Parser `q.routing.suggested_team` omitted
→ `team` defaults to `customer_service`.

**§MT-1 acceptance (must all hold):**
1. **3 per-token blocks**, each with its own token label (`"C21263XUW-P-ENG"`, `"Bravat C01014UW-P-ENG"`,
   `"Sorento SRTWCY8605-RL"`) and its own candidate lines. Message begins `Couldn't find some items:`
   and ends `Reply a number to pick, or 'yes' to escalate to customer_service.`
2. **Global numbering contiguous 1..7** (cap3+1+cap3 = 3+1+3). Block A = 1,2,3; block B = 4; block C = 5,6,7.
3. `suggest_last_result_set` **length 7**, `idx` 1..7 contiguous, `value`/`product` = the candidate
   codes in the order above (row1=C2181XUW-P-ENG … row7=SRTWC8605-SC-RL), `entity_type:'product'`.
4. `dym_offer.candidates` **length 7**, each `for_raw` == its source token:
   rows 1-3 `for_raw:'C21263XUW-P-ENG'`, row 4 `for_raw:'Bravat C01014UW-P-ENG'`,
   rows 5-7 `for_raw:'Sorento SRTWCY8605-RL'`; each `code` = its candidate code; `for_hint:'product'`.
   `dym_offer` = `{id:<exec id>, domain:'inventory', ttl:3, candidates:[7], picked:[]}`.
5. `suggest_quick_reply` = exactly two comma-stripped buttons: `Yes escalate` and `No it's okay`
   (i.e. the string `Yes escalate,No it's okay`). **No number buttons.**
6. **§0 S7:** prod-ingest sink-delta zero (both signals) / any non-zero delta attributed-or-FAIL; egress
   log shows `would_send` only; no prod write. (Offline unit: no egress at all.)
7. **Regression (V-MT-R):** the single-token (token-A-only) fixture produces output **byte-identical**
   to the current live `build-suggest-offer`.

**Promotion:** 1-node business diff (`build-suggest-offer` `7972abd8`), user-gated, backup-first, byte-
SHA gated per LESSONS §57/§58. `compile-current-state` and `output_exchange` are **not** promoted (unchanged).
</content>
</invoke>
