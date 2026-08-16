# Node diff — `dym-v3-zerostock` (CHANGE #2 v3 + CHANGE #3) — CLONE build

Built + published on the **CLONE** artifacts only. **LIVE parser `XTODTw-dJcV0uRdC056hG` and LIVE spine
`9qVyfUxmRQqrpGRMDLRuz` were NOT touched.** Change #1 (`build-suggest-offer`) left byte-identical. This build
**REPLACES the v2** clarify/`ambiguous`/`[results numbered]` design that was on the clone — every node body was
constructed as **LIVE bytes + the v3/#3 hunks** (LESSON 57), not as edits on top of the deployed v2. Do NOT
promote — reviewer gate + tester UAC §PD/§ZS first.

## Targets & deployed state

| workflow | id | node(s) | deployed versionId==activeVersionId | active |
|---|---|---|---|---|
| clone parser fork `sub-semantic-parser FORK domain-continuity-carry` | `wI5RkNGW3EOJfBdo` | `AI Agent`.options.systemMessage, `output_exchange`.jsCode | `b31839e6-fd03-4304-aaee-7082aa56dcbd` | true |
| clone spine `sorento-consume-main TEST` | `txiPzSxy3Pclsz6v` | `compile-current-state`.jsCode | `61050154-86b0-44d9-98b6-a0b9a29b3d62` | true |

> ### ⚠️ UPDATE 2026-08-01 — revised #3 requested-set (customer-REFERENCED) redeployed on the clone spine
> The clone spine `compile-current-state` was re-edited to replace ONLY the #3 requested-set derivation +
> satisfaction test per plan §1′/§2′ (`compatible_entities` source → customer-REFERENCED TYPED-exact ∪
> DYM-PICKED). **#2-v3 unchanged, #1 `build-suggest-offer` unchanged, parser fork `wI5RkNGW3EOJfBdo` NOT
> republished, LIVE spine + LIVE parser NOT touched.** New deployed spine versionId
> `61050154-86b0-44d9-98b6-a0b9a29b3d62` (==activeVersionId, active), compile-current-state jsCode sha
> **`39e2478b8c279d79`** (was `81d28fe3b4c42cda`). `build-suggest-offer` sha still `2cc445251bbfeaf7`. LIVE
> spine re-diffed at build time: `compile-current-state` = `7d4532bc5225e96a`, unchanged vs the v2/v3 build
> record → no live drift, base current. `node --check` PASS, 0 trailing-whitespace lines. Diff vs the prior
> clone body = ONLY the #3 requested-set/satisfaction region (74 lines) + one clarifying comment line pair;
> every other node (incl. #2-v3, #1, tail) byte-identical (135 nodes, 28 credentialed, connections all
> preserved). The **revised** #3 hunk is documented in HUNK C-#3′ below (supersedes C-#3).

> ### ⚠️ UPDATE 2026-08-01 (2) — #3 satisfaction test: resolver-family-set → PREFIX-family (TYPED only)
> The clone spine `compile-current-state` was re-edited AGAIN to change **ONLY the #3 SATISFACTION test for
> TYPED codes** (the requested-set derivation is byte-identical). **Why:** a single bare code resolves in
> resolver **AND-mode** with no per-token exact/prefix tiers, so the old resolver-family-set (`rq.fam`)
> suppression could not engage → a typed code whose exact SKU is empty but a variant is stocked would be
> wrongly named. **Fix (user decision):** a TYPED code X is now SATISFIED iff
> `returnedCodes.some(rc => rc === normX || rc.startsWith(normX))` (case-insensitive; both sides `norm`=trim+UPPER)
> — prefix-family suppression that works in BOTH OR-mode and AND-mode. It only ever prefix-matches the
> customer's OWN typed code (never an un-typed parent), and un-typed siblings never enter `requested[]` to begin
> with, so it cannot reintroduce the earlier false-positive (naming un-typed siblings). **PICKED codes stay
> STRICT** (satisfied iff `returnedCodes.has(norm(P))` exactly — a picked SKU with an empty exact code is still
> named even if a sibling has stock, §ZS-2). The requested-set derivation is UNCHANGED (`match_tier==='exact'`
> in OR-mode; AND-mode fallback `norm(canonical_code) ∈ resolver.tokens`; sole-unambiguous partial per R-ZS2).
> **#2-v3 unchanged, #1 `build-suggest-offer` unchanged (sha still `2cc445251bbfeaf7`), parser fork
> `wI5RkNGW3EOJfBdo` NOT republished, LIVE spine + LIVE parser NOT touched.** New deployed spine versionId
> **`0a647e8b-bf87-44ae-b0d2-3846ad045a87`** (==activeVersionId, active), compile-current-state jsCode `jq -r`
> sha **`1f5e7a678736d612`** (was `39e2478b8c279d79`). Build-time LIVE re-diff: `compile-current-state` =
> `7d4532bc5225e96a`, unchanged vs record → no live drift; live versionId==activeVersionId (`a505f2e1…`, no
> divergent draft). `node --check` PASS, 0 trailing-whitespace lines. Diff vs the prior clone body = ONLY the
> satisfaction block (9 lines → 19 lines: 2 comment lines → 9; loop reworked); every other node (incl. #2-v3,
> #1, tail) and the entire #3 requested-set derivation byte-identical (135 nodes, connections preserved). Deploy
> transport = file-sourced REST GET→byte-level-block-swap→PUT (LESSON 55; exec-trigger-only clone → clean HTTP
> 200, no 409). Local 0-egress proofs (6/6 PASS) in the run summary. The satisfaction hunk is HUNK C-#3″ below.

### Deployed per-node byte-SHAs (fresh REST GET after PUT; `jq -r` of node body → sha256 first 16)
| node | deployed | `node --check` |
|---|---|---|
| `AI Agent` systemMessage | `fb7f1258d5ea16c8` | (prompt, n/a) |
| `output_exchange` jsCode | `df86832677b36b7b` | PASS |
| `compile-current-state` jsCode | `81d28fe3b4c42cda` | PASS |

- `AI Agent`.text template deployed sha `b9b564fe7e3cd0fa` == LIVE (untouched surface preserved).
- No trailing whitespace in any body (`grep -nE ' +$'` = 0 lines on all three).
- Credentials preserved — fork 2/2 (`OpenAI Chat Model`→openAiApi, `Postgres Chat Memory`→postgres),
  spine 28/28. Clone spine has **only** `executeWorkflowTrigger` (no Schedule/Respond.io trigger → no
  shared-prod-list consumption hazard; safety prereq satisfied).

## (e) Change #1 (`build-suggest-offer`) UNTOUCHED — gate
`build-suggest-offer` jq-r sha **`2cc445251bbfeaf7`** before AND after this PUT — exactly the task's expected
`2cc44525…`. The spine PUT body was the fresh REST GET with ONLY `compile-current-state.jsCode` replaced, so
every other node (incl. `build-suggest-offer`) is byte-preserved.

## Build-time LIVE re-diff (stale-fork guard, LESSON 57) — status: **CLEAN, no live drift**
Re-fetched LIVE `XTODTw` and LIVE spine at build time. Both are byte-identical to the v2-build baseline, so the
LIVE+hunks base is current and the eventual promote is a clean live+hunks:

| surface | LIVE sha (this build) | LIVE sha (v2-build record) | drift |
|---|---|---|---|
| `XTODTw` systemMessage | `f2b53abba6b66a7d` | `f2b53abba6b66a7d` | none |
| `XTODTw` text template | `b9b564fe7e3cd0fa` | `b9b564fe7e3cd0fa` | none |
| `XTODTw` output_exchange | `faf39d353ace0cf4` | `faf39d353ace0cf4` | none |
| spine `compile-current-state` | `7d4532bc5225e96a` | `7d4532bc…` | none |

LIVE `XTODTw` versionId `8d5f7c2d…` and LIVE spine versionId `a505f2e1…` (both versionId==activeVersionId, no
divergent draft). The untouched fork surface (`text` template) == LIVE byte-for-byte. **No STOP condition.**

---

## HUNK A — parser `AI Agent` systemMessage (PROMPT)  [live `c637b079`]
Additive only. `diff live→new` = exactly two hunks (nothing else disturbed):

```diff
@@ after the POSITIONAL REFERENCES block, before "== PERSON-NAME MENTION ==" @@
+== REFERENCE TARGET (which set a positional reply means) ==
+When "Previous response" contains the marker "[<N> did-you-mean suggestions active]" AND the current message refers to item position(s), also set a top-level "reference_target":
+  - "dym"    -> the reply is bare number(s), one or more ("2", "1, 4", "1 and 4"), OR names a suggestion ("suggestion 2", "the 2nd suggestion").
+  - "result" -> the reply explicitly qualifies a result item ("product 2", "the 2nd one", "the 2nd product", "price of the first").
+If the marker is absent, set reference_target = null. reference_positions is unchanged (the raw 1-based positions). Do NOT resolve — downstream maps the positions to the set named by reference_target.

@@ OUTPUT keys, after "reference_positions": [], @@
+  "reference_target": "result|dym|null — WHICH set a positional reply targets; null unless a [<N> did-you-mean suggestions active] marker is present (see REFERENCE TARGET)",
```

- **Enum is `result | dym | null`** — **no `ambiguous`** (b). The word "ambiguous" appears once in the prompt,
  in LIVE's pre-existing domain-ambiguity rule (count identical live=1, new=1; my hunks add zero).
- **No `[results numbered]`** anywhere in the prompt (b). Rule is bare-number→`dym`, result-qualified→`result`.
- LLM classifies only; never resolves (LESSON 38). `reference_positions` semantics unchanged.

## HUNK B — parser `output_exchange` (Code)  [live `847a1173`]
`diff live→new` = exactly two loci; prefix (lines 1–153) and everything from the `// ── REFERENCE POSITIONS →
ENTITIES ──` byIdx block onward are **byte-identical to LIVE** (verified by reconstruction).

**B1. `applyDymPick` refactor (code-reply path byte-behaviour-identical).** The `tryDymPick` IIFE's in-place
retention/replacement body was factored into a hoisted `function applyDymPick(_hit, _offer, _priorEnts,
_useSlot)` that RETURNS the new entity array; `tryDymPick` now calls `applyDymPick(_hit, _offer, _prev.entities,
true)`. A local run of ORIGINAL vs REFACTORED on a single code-reply produced **byte-identical**
`output.output` (entities/entity_op/scope_exclusive/message_type/date-carry/dym_pick_applied/dym_offer_pick_code).
`_useSlot` defaults to slot-first matching (preserving cross-turn code re-picks).

**B2. NEW numbered-DYM MULTI-SELECT handler** `dymNumberedMultiSelect`, inserted immediately BEFORE the byIdx
block. Fires **only** on `reference_target==='dym' && prevState.dym_last_result_set.length>0 &&
reference_positions.length>0`; then **LOOPS every position** (the single v2 `break` is gone), threading the
entity set through `applyDymPick(..., _useSlot=false)` so replacements **ACCUMULATE** — base = `prevState.entities`
(retains the resolved stock entity); each picked row replaces its own `for_raw` token; finally clears
`reference_positions` so the stock byIdx block no-ops. (c)

**R-v3-1 ADD-BOTH proven locally** (numbered handler, 0-egress harness):
| T2 reply | resulting `entities[].raw` | note |
|---|---|---|
| `1, 4` (diff for_raw) | `[SRTWT902, SRTW8081-P, SRTW8091-P]` | both picks; SRTWT902 retained; positions cleared; dym_pick_applied=true |
| `1, 2` (SAME for_raw) | `[SRTW8082-P, SRTWT902, SRTW8081-P, SRTW809]` | **ADD-BOTH** — both alternatives present (never last-wins) |
| `2` | `[SRTWT902, SRTW8082-P, SRTW809]` | single pick replaces its for_raw slot |
| `the 2nd one` (`reference_target='result'`) | untouched; positions `[2]` kept | handler SKIPPED → stock byIdx resolves |
| stray `dym` w/ empty dym set | untouched | backbone guard → byIdx path unchanged |

- get-results will query all picks: the accumulated entities flow to resolve-entity → disallowed-entity-gate →
  get-results, so both codes are looked up.
- **v2 `ambiguous` branch REMOVED** (b): no `dym_clarify_needed`, no `dym_clarify_pos` anywhere in the node
  (grep confirms absent). Building from LIVE (which never had them) guarantees this.

## HUNK C — spine `compile-current-state` (Code)  [live `0804657c` → clone `7a130a0c`]
Built on LIVE bytes (`7d4532bc…`). `diff live→new` = insertion of {#3 IIFE, #2 block} before the dym-single-use
LIFECYCLE block, one `_newOffer` fallback edit, and one tail emit. Everything else byte-identical (reconstruction
from LIVE + these 3 ops == deployed body).

**C-#3 (zero-stock itemize) — inserted AFTER the disclaimer IIFE and BEFORE the #2 block (d).** Self-contained
IIFE; gate = `business_query && !manualResponse && !isEscalateBranch && domain_hint∈{inventory,incoming} &&
last_result_set.length>0 && returnedCodes.size>0 && missing.length>0`. Requested set = `disallowed-entity-gate`
`compatible_entities` filtered `entity_type==='product' && code`; returned set = distinct `Product Code` field
values (norm=trim+uppercase, skip ''/—); missing = EXACT-code (no variant/prefix); dedup case-insensitively;
cap 10. Appends `\n\nNo stock records found for: <codes>.`. Writes ONLY `userResponse`; byte-identical no-op
when `missing.length===0`.

> **⚠️ C-#3 SUPERSEDED by C-#3′ below (redeployed 2026-08-01).** The `compatible_entities`-sourced requested
> set leaked resolver-expanded prefix siblings the customer never typed (tester OBS-1). Only the requested-set
> derivation + satisfaction test changed; the gate, returned-set extraction, wording, dedup, cap, placement,
> append order and byte-identical no-op below are all UNCHANGED and carry over verbatim.

**C-#3′ (REVISED requested-set — customer-REFERENCED, redeployed 2026-08-01).** Kept byte-identical from C-#3:
gate, returned-set extraction (distinct `Product Code` values, `norm`=trim+UPPER, skip `''`/`—`), the
`returnedCodes.size===0` early-return, the `missing.length===0` no-op, `.slice(0,10)` cap, the LOCKED wording
`\n\nNo stock records found for: <codes>.`, placement (after disclaimer IIFE, before #2), append order
(stock → #3 → #2), and writes-ONLY-`userResponse`. **Replaced ONLY** the requested-set + satisfaction:

```diff
-  // requested set (Q1): gate compatible_entities, entity_type product, with a code
-  let compat = [];
-  try { compat = $('disallowed-entity-gate').first().json.compatible_entities || []; } catch (e) { compat = []; }
-  const requested = (Array.isArray(compat) ? compat : [])
-    .filter(e => e && String(e.entity_type).toLowerCase() === 'product' && e.code);
-  // missing (Q3 exact match, Q7 dedup + cap)
-  const seen = new Set();
-  const missing = [];
-  for (const e of requested) {
-    const n = norm(e.code);
-    if (returnedCodes.has(n) || seen.has(n)) continue;
-    seen.add(n); missing.push(e.code);
-  }
+  // requested set (REVISED §1'/§2'): customer-REFERENCED codes only (TYPED-exact U DYM-PICKED).
+  // TYPED-exact from $('resolve-entity').resolutions[] mirroring disallowed-entity-gate OR-mode:
+  //   per token, keep match_tier==='exact' product canonical_code(s); else sole unambiguous product
+  //   (R-ZS2 INCLUDE); else ambiguous multi-prefix -> add NOTHING (that is #2's job).
+  //   AND-mode fallback: product whose norm(canonical_code) in resolver.tokens (R-ZS3, strict per-code).
+  //   fam(token) = norm(canonical_code) of that token's matches (exact + expansion siblings).
+  // DYM-PICKED (strict, fam={code}) from get-session-vars ...variables.dym_offer.picked (same read
+  //   _prevOffer uses) U qf.dym_offer_pick_code — derived directly, independent of _dymOffer.
+  // Satisfaction: TYPED satisfied iff returnedCodes ∩ fam(token) != ∅ (family suppression); PICKED
+  //   satisfied iff exact picked code in returnedCodes (strict — a stocked sibling does NOT satisfy).
+  //   missing = requested codes not satisfied. (dedup case-insensitive while building requested[].)
```

- **Sources changed:** `disallowed-entity-gate.compatible_entities` (flattened, `match_tier` dropped) →
  `$('resolve-entity').first().json.resolutions[]` (carries `match_tier`) for TYPED, and
  `$('get-session-vars').…variables.dym_offer.picked` + `qf.dym_offer_pick_code` for PICKED. Both node refs
  already read elsewhere in `compile-current-state` (`resolverJson` L184, `_prevOffer` L399) → no new upstream
  dependency.
- **Family suppression (typed):** `fam(token)` = the resolver's own per-token match set (exact + its prefix
  siblings). A bare typed `SRTWT902` stocked via `SRTWT902-GM` → `SRTWT902` satisfied → NOT named; the
  `prefix`-tier siblings `-FRG`/`-GM-NL` are never in the requested set → never named. Whole family empty →
  named. (§ZS-1b.)
- **Pick-strictness wins over typed-family:** a code both typed-exact and picked upgrades to `strict` +
  `fam={code}` in `_add` (a re-seen strict code sets `ex.fam=new Set([n]); ex.strict=true`).
- **Disjoint with #2 (tighter):** #3's TYPED set = tokens `resolved===true` OR carrying an exact match; #2's
  `missResolutions` = `resolved!==true && !matches.some(isExact)` → mutually exclusive. Proven (harness_disjoint):
  a `srt79`-style ambiguous multi-prefix-no-exact token is excluded from #3 (goes to #2).

**C-#3″ (SATISFACTION test: resolver-family-set → PREFIX-family for TYPED, redeployed 2026-08-01 (2)).**
Supersedes ONLY the satisfaction loop of C-#3′. The requested-set derivation (the `_add` calls, the
`resolutions[]` OR-mode loop, the AND-mode `resolver.tokens` fallback, the DYM-PICKED reads, `requested[]` row
shape incl. the `strict` flag) is **byte-identical** — the diff is confined to the `missing` computation. The
`rq.fam` field is still built in the requested rows (derivation untouched) but is no longer consulted by
satisfaction (harmless dead field; keeping it made the diff surgical). Deployed `compile-current-state` `jq -r`
sha `1f5e7a678736d612`.

```diff
-  // missing (Q3' satisfaction): TYPED -> family suppression (satisfied if ANY same-token sibling
-  // returned a row); PICKED -> strict (fam={P}). Q7 dedup handled while building requested[].
-  const missing = [];
-  for (const rq of requested) {
-    const fam = (rq.fam && rq.fam.size) ? rq.fam : new Set([rq._n]);
-    let ok = false;
-    for (const fc of fam) if (returnedCodes.has(fc)) { ok = true; break; }
-    if (!ok) missing.push(rq.code);
-  }
+  // missing (Q3' satisfaction) — REVISED: PREFIX-family for TYPED, STRICT for PICKED.
+  // TYPED code X satisfied iff ANY returned Product Code equals OR starts with norm(X)
+  //   (returnedCodes.some(rc => rc === X || rc.startsWith(X))) — X's SKU family has stock, so
+  //   suppress. Works in BOTH resolver OR-mode and AND-mode (no reliance on the per-token family
+  //   set, absent in AND-mode); aligns with the resolver's own ilike 'X%' expansion and only ever
+  //   prefix-matches the customer's OWN typed code, never an un-typed parent -> cannot name a sibling
+  //   the customer did not type (such siblings never enter requested[] to begin with).
+  // PICKED code P satisfied iff returnedCodes has norm(P) EXACTLY (no prefix) — a picked SKU whose
+  //   exact code is empty is still named even if a sibling has stock (§ZS-2). Q7 dedup handled above.
+  const missing = [];
+  for (const rq of requested) {
+    let ok = false;
+    if (rq.strict) {                                                    // PICKED -> strict exact
+      ok = returnedCodes.has(rq._n);
+    } else {                                                            // TYPED -> prefix family
+      for (const rc of returnedCodes) if (rc === rq._n || rc.startsWith(rq._n)) { ok = true; break; }
+    }
+    if (!ok) missing.push(rq.code);
+  }
```

- **Why (root cause):** a single bare code resolves in AND-mode with no per-token exact/prefix tiers, so
  `rq.fam` (the resolver's OR-mode per-token match set) was empty/absent → the family-set suppression could not
  engage → a typed code whose exact SKU is empty but a variant is stocked would be wrongly named. Prefix-family
  works identically in both modes.
- **Cannot reintroduce the old false-positive:** prefix-matches only the customer's OWN typed `norm(X)`;
  un-typed siblings are `prefix`-tier and never enter `requested[]`, so they are never candidates to name.
  Family suppression can only ever *withhold* a line (false-negative direction), matching the user's approved
  preview; whole-family-empty (nothing stocked) is still NAMED.
- **PICKED strictness preserved (§ZS-2):** a picked code stays `strict` (via `_add`'s pick-strictness-wins
  upgrade), matched by exact `returnedCodes.has(rq._n)` — a stocked sibling does NOT satisfy a pick.
- **Local 0-egress proofs (6/6 PASS, exact deployed IIFE):** (1) AND-mode edge — typed `SRTWT902`,
  returned `{SRTWT902-GM}` → prefix hit → SATISFIED → NO line (the fix; old code named it); (2) AND-mode
  whole-family-empty — typed `SRTWT902`, returned `{ABC123}` → NAMED `SRTWT902`; (3) §ZS-1b OR-mode bare
  `SRTWT902` (+prefix sibs), `-GM` stocked → NO line; (4) §ZS-1 typed `SRTWT902`(present)+`C2181XUW-P-ENG`(empty)
  → name only `C2181XUW-P-ENG`; (5) §ZS-2 PICKED strict — picked `C2181XUW-P-ENG` empty, sibling `-GM` stocked
  → NAMED (strict, no prefix); (6) all-satisfied → no line, byte-identical no-op.

**C-#2 (partial-miss dym, v3).** Reuses `build-suggest-offer`'s D1 detection (missResolutions, tokenCandidates,
humanLabel, cap3, allowedTypes, uuid-drop). On an ANSWERED partial-miss turn: does NOT overwrite
`last_result_set` (stays stock) and does NOT set `selection_context` (stays null); builds `dym_last_result_set`
(M rows idx 1..M, each carrying `for_raw`=source token); feeds `_partialOffer` into `_newOffer` so it survives
the `_answered` kill (rule 1 beats rule 5); appends the numbered `Couldn't find these:` block to `userResponse`.
- **Marker = SINGLE bracket only** (b): `response += \` [${M} did-you-mean suggestions active]\`;` — the v2
  `[results numbered]` emission is DELETED (the token appears in the node only inside a descriptive comment;
  executable code has the single bracket alone).
- **v2 CLARIFY branch DELETED** (b): no `dym_clarify_needed`/`dym_clarify_pos`/`dym_clarify_pending` — none
  present in the node (grep confirms absent). `_dymOffer` stays `const` (matches LIVE; v2's `let` override gone).
- `surfaced.length===0` → early return → pure no-op → byte-identical.

**C-tail.** `_newOffer` fallback `? _sug.dym_offer : (_partialOffer || null);` (was `: null;`); and before the
final `return output;`, a conditional emit `if (_dymLastResultSet) output.variables.dym_last_result_set =
_dymLastResultSet;` — so a no-dym turn gains NEITHER `dym_last_result_set` NOR `_partialOffer` → output
byte-identical to LIVE.

**Final customer-facing `userResponse` append order (plan §6):** stock rows → `No stock records found for: …`
(#3) → `Couldn't find these: … <numbered 1..M dym>` (#2). Sets are structurally disjoint (#3 = resolved-empty
`compatible_entities`; #2 = unresolved `missResolutions`) — no double-listing.

---

## (a) No-dym / fully-resolved normal turn = byte-identical (structural guarantee)
- **parser:** `reference_target` defaults to `null` (marker absent) → `dymNumberedMultiSelect` returns at the
  `reference_target!=='dym'` guard → `reference_positions` reach the UNCHANGED byIdx block → byte-identical
  apart from the new `reference_target:null` key (LESSON-40 replay-norm: drop-when-null-both-sides).
- **spine:** #3 IIFE early-returns (gate/`missing.length===0`); #2 IIFE early-returns (`surfaced.length===0`)
  → `_partialOffer`/`_dymLastResultSet` stay null → `_newOffer` fallback == LIVE, conditional emit skipped →
  output byte-identical to LIVE.
- Full-miss dead-end (#1) numbered pick still resolves: that path has no `dym_last_result_set` (its set lives in
  `last_result_set` w/ `selection_context='suggest_offer'`) → `dymNumberedMultiSelect` hits the empty-set
  backbone guard → byIdx-over-`last_result_set` resolves the pick exactly as #1 ships today.

## Deviations / risk
- **No deviations from v3/#3 spec.** R-v3-1 implemented as ADD-BOTH (locked decision) via `_useSlot=false` in the
  threaded loop — proven both-alts-present on same-`for_raw` picks (the shared offer id would otherwise re-hit
  the first pick's new entity; disabling slot-match makes a consumed `for_raw` fall to append).
- Deploy transport = REST GET→PUT round-trip (byte-exact; REST GET does not redact credentials, LESSON 55). Both
  clone workflows are `executeWorkflowTrigger`-only → clean HTTP 200, no 409. `settings` filtered to the public
  schema keys (merged, not replaced).
- Multi-pick `dym_offer_pick_code` records the LAST picked code only (spine lifecycle rule 4 appends one code to
  `picked[]`). Cosmetic lifecycle-fidelity note, not an acceptance criterion; entities accumulate correctly.
- `validate_workflow` (SDK-code validator) is not applicable to a targeted node-body edit on a 135-node
  workflow; the equivalent gate is n8n's PUT validation (HTTP 200 + active:true + versionId==activeVersionId) +
  `node --check` PASS on both Code nodes + byte-SHA match on all three deployed nodes.
