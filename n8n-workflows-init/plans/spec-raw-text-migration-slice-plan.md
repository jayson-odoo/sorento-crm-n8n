# Change Plan — spec raw-text migration slice (fires on CRM PR #142 merge+deploy)

Change-id: `spec-raw-text-migration`
Status: PLAN, staged. **Trigger = the user merges CRM PR #142 (`feat/spec-raw-text-search`) AND
the deploy ping arrives.** Do not build against live CRM before then — the endpoint behavior this
slice depends on (S1 raw-text derivation, C-1 triple gate, F2 shown-row strip) exists only on the
branch.

Contract authority, in order:
1. `tests/reviews/pr142-contract-conformance.md` — branch-verified conformance report
   (2026-08-15, opus seat). Four deviations vs the frozen contract; this plan bakes them in.
2. Memory `spec-coverage-measured-20260813.md` — the frozen C-1/C-2/C-3/S4 contract record.
3. The PR's own `documentation/plans/PLAN-spec-raw-text-search.md`.

## 0. The four conformance deviations this plan absorbs

- **DEV-1 (blocking, renderer):** `brand` joined `class` as exempt from the lower_snake enum pin.
  Renderer rule becomes THREE lines: `class` verbatim, `brand` verbatim, everything else
  `replace('_',' ')` + titlecase. Brand values legitimately carry spaces/case ("American
  Standard", "NO LOGO") — blind humanising rewrites catalogue spelling.
- **DEV-2 (blocking, N-3):** the promised caller-`free_terms` footer strip was REPLACED (F2):
  CRM clears an unresolved token only when every content word appears in a SHOWN row's
  values/rendered_text/class, and **code-shaped tokens never clear**. Consequences: our N-3
  suppression stays FULL STRENGTH (it is not belt-and-braces); the miss renderer must be able to
  emit a code-miss line ALONGSIDE a populated spec shortlist (mixed hit+miss turn).
- **DEV-3 (blocking, scope):** the OPEN QUESTION is answered — there is NO separate raw-text
  field; `query` feeds both the normal resolve probes and the spec deriver, for ALL consumers.
  So the regression scope is the FULL resolve surface, not just spec families (see §3).
  Also: `free_terms` merge is a UNION and `understand_phrase` always appends the whole phrase as
  a free term — a transitional body sending raw `query` AND the old N-0 `free_terms` ranks on
  inputs live has never produced. **Therefore query→raw and N-0 deletion are ONE atomic edit.**
- **DEV-4 (SB plan only, done):** F9 shipped early — require-path rows carry real
  `specifications` or `null`. Recorded in `spec-search-shapeB-predicate-plan.md` §5.

Non-blocking, tracked — **both independently verified by the CRM session against the branch
(2026-08-15, see the report's addendum):** (a) underscore guarantee is a pytest over seeded
registry rows, NOT a registry-side validator — and the write path already ASSUMES the
convention (`spec_registry.py:765` auto-synonym via `replace('_',' ')`); validator BUILT as
CRM PR #160 (`_validate_value_tokens`, pins VALUES/keys not synonym words; 0 of 55 live rows
would fail) — once merged the render contract is guarded at the write path;
(b) `class ∉ spec_asked` is an ARTEFACT, not a designed invariant — nothing asserts it on
either path, so the Matched-on filter `matched_specs ∩ (spec_asked-keys ∪ {class})` is the
correct permanent rule, never a workaround to simplify away later.

## 1. The edit (clone `txiPzSxy3Pclsz6v`, then LIVE+hunks at promote)

One slice, three leaves — all on nodes already touched by the SA/SR package (clone `c97f2f8f`):

1. **`resolve-entity-http` jsonBody** (clone name; live node is `resolve-entity`):
   - `query`: was parser `user_goal` restatement → becomes RAW customer text (the same
     `$('tf-message')`-dominant source the spine already carries; coder verifies dominance on
     the CURRENT clone graph, not from memory).
   - DELETE the N-0 `free_terms` expression entirely (atomic with the query swap — DEV-3).
   - `spec_fallback: true` stays. `understand_phrase` stays as-is (false) — flipping it is a
     separate decision, not this slice.
2. **`compile-current-state` renderer**:
   - enum humanise rule → three-line form (DEV-1).
   - Matched-on filter → `matched_specs ∩ (spec_asked-keys ∪ {class})`, render the class VALUE
     never the key name (S4 deviation 1, now buildable since `spec_asked` ships in #142).
   - retire SR-11's unaccountable-keys review trigger the same edit (its job is done by
     spec_asked).
   - N-3: keep at full strength; verify the mixed hit+miss turn renders a code-miss line beside
     a populated shortlist (DEV-2) — if the current N-3 body can't, this slice fixes it.
3. **`build-suggest-offer`** — ADDED rev 4 (2026-08-16), authorised by the main session after the
   coder correctly refused to report F1 closed. F1's block has TWO emitters: `build-suggest-offer`
   builds `suggest_response` and `compile-current-state` passes it through as `manualResponse`
   verbatim, so patching only the renderer leaves the customer's SA-4 reply UNCHANGED. One-line
   insert in bso's D1 loop (it already binds `q.entities`). This is not scope creep — F1 is a
   defect this slice introduced (raw `query` is what puts the sentence into `resolutions[]`), so
   accepting the wording would be asking the user to accept our own regression.
   **Promote body is therefore THREE hunks by node name**, and the third must be verified to exist
   on live by that exact name with portable by-name reads (live's miss wording differs from the
   clone: `": not found."` vs `" — not found."` — never block-copy).
   Recurring lesson, third time in this programme: **enumerate renderers by RENDERED STRING, not
   by node** ([[dym-blind-suggestion-measured]]).
4. **No other nodes.** Anything else discovered mid-build = stop, report, replan.

## 2. UAC (families exist — extend, don't fork)

- `tests/uac/SR.md`: SR-8 retest (D7 must kill the "sorento"→SORENTOBAG junk at the source);
  new SR case for the mixed hit+miss turn (DEV-2); Matched-on renders class value.
- `tests/uac/SA.md`: SA-P1/P2/P4 re-probe post-deploy INCLUDING the counterweight (fully-covered
  code phrase still suppresses the fallback — invariant from the shapeA wiring plan).
- SB-P6-style no-flag parity snapshot: pre/post-deploy resolve bodies WITHOUT spec_fallback must
  stay byte-comparable on the non-spec surface.

## 3. Regression sweep (DEV-3 widened scope — full resolve surface)

Raw text in `query` reaches EVERY consumer path of /references/resolve, so re-run
resolution-heavy families beyond spec: code parity (exact codes, unicode-dash fold), order /
customer / date spot-checks, attachment + `domain_hint`, AND-mode multi-token. Envelope shapes
from real executions per the stale-fixture rule — never reuse `tests/cases/*.json` unverified.

## 4. Seats + gates

Plan (this file): main session. Build: `sorento-coder` (opus), prompt = paths only (this plan,
the conformance report, SR/SA family files, clone id). Test: `sorento-tester` (sonnet).
Review: `sorento-reviewer` (opus) + `/codex-review` on the exported bodies. Promote: user-gated,
LIVE+hunks-by-name, MCP write path (REST PUT forbidden — auto-publish outage precedent),
rollback = republish prior live versionId. §0 safety file mandatory for every run.

## 5. Post-deploy wire findings — SETTLED with the CRM lane 2026-08-16

Measured from the tester's captured prod-CRM responses (clone execs, `tests/runs/spec-raw-text-migration-*`),
NOT from branch code; then answered by the CRM lane from `main` @ `d2b80b353` (#142 + #160).
Two of our three disagreements were their contract note being wrong, not our reading.

- **`brand` / `class` casing — OUR RULE IS THE CONTRACT (confirmed).** `class` verbatim, `brand`
  verbatim, every other enum value `^[a-z0-9]+(_[a-z0-9]+)*$` and safe to humanise blind (PR #160
  enforces that at the write path, exempting exactly those two keys). The CRM will NOT normalise
  catalogue brand spelling — `BRAVAT` / `NO LOGO` / `American Standard` are the brands table's own
  strings and rewriting them for the wire would desync every other surface. Our three-line rule
  ships unchanged; DEV-1 is closed, permanently.
- **Carrier — WE READ THE RIGHT FIELD (confirmed).** Canonical for consumers is
  `resolutions[].matches[]` with `match_tier: "spec_search"` (plus `intersection` / `by_entity_type`
  in the AND shape). Top-level `spec_candidates` is a *mirror* kept for inspection; the emitting
  function's own docstring records that building on it was a dead end because every existing
  consumer reads `resolutions[].matches` and would treat the turn as unresolved. Do NOT migrate
  the renderer to it.
- **`preferred_specs` — always present on the carrier we read** (`_emit_spec_matches` builds each
  spec row's `display` with `preferred_specs: candidate.get(..., [])`, so `[]` is its floor).
  Its absence in 15/15 captures therefore means those responses carried **no spec_search matches
  at all** — consistent with our cases, not a deployment gap. Rule: **treat absent as empty.**
  🔴 If we ever capture a `match_tier: "spec_search"` row with NO `preferred_specs` key, that is a
  real CRM defect — send the exec id to the CRM lane.
- **`floor_missed` — semantics are NARROWER than hoped; do NOT render a near-miss sentence off it.**
  Definition: `floor_missed = (no candidates survived scoring) OR (best EVIDENCE score < floor)`,
  and the candidate list is emptied when true (`candidates = [] if floor_missed else top`) — which
  is why we saw `[]` beside `true`. "Evidence" deliberately excludes house preference (a standing
  8.0 brand preference used to clear a 1.5 floor by itself, so "is there anything here" answered
  yes forever). **The bool CONFLATES "nothing scored at all" with "things scored, none cleared the
  bar."** So it licenses *"I could not find anything I would stand behind"* and NOT *"there were
  near misses"* — rendering the near-miss line off this bool alone would say it on true-zero turns.
  **Separating them needs `spec_top_score`** — ACCEPTED and BUILDING CRM-side 2026-08-16 on branch
  `docs/spec-contract-correction` (green PR overnight, captain merges; no deploy tonight).

  🔴 **The quantity is EVIDENCE, not the internal `top_score`.** `search_specs`' existing
  `top_score` is the TOTAL, house-preference boosts included — shipping that would have made a row
  scoring purely on a standing brand preference report a non-zero near-miss while the customer's
  words earned nothing: the 8.0-over-a-1.5-floor bug wearing a new field name. `spec_top_score`
  therefore carries the same evidence number the floor is compared against.

  **Tri-state contract the next n8n slice renders against:**
  | `spec_top_score` | `floor_missed` | render |
  |---|---|---|
  | `0.0` | true | "there is nothing" — nothing the customer's words earned scored at all |
  | `> 0` | true | the NEAR-MISS sentence — candidates existed, none cleared the bar |
  | `> 0` | false | normal answer, candidates present |

  CRM-pinned invariants: when candidates exist, `floor_missed` ⟺ `spec_top_score < relevance floor`;
  a preference-only case reports `0.0` (its own test, so a later refactor cannot quietly swap the
  total back in). The scoped-negative render is a NEXT slice, gated on this field deploying.
- **MCP restart — ANSWERED, no captain action needed.** `include_specifications` needs a FastMCP
  restart, and the blue/green deploy provides one by construction: `blue_green_deploy.sh` pulls and
  starts `mcp_${NEW}` as a fresh container, health-checks it, swaps the nginx `sorento_mcp` upstream
  to the new port, then stops `mcp_${OLD}`. Every deploy = a new MCP process. Relayed to the CRM lane.
- **Queued replay:** live incident turns `12303509` / `12303548` against the deployed CRM via the
  clone (uac mode = real reads, egress structurally blocked). The CRM lane has no prod credentials
  and asked us to close them out; envelopes to be posted back.

## 6. OPEN DEFECT — `_Matched on:` attributes a value to the wrong row (found 2026-08-16)

**Symptom, measured:** on the replay of incident 12303509 (clone exec 12607257) the customer asked
for *sorento* double bowl 1.2mm. Row 1 `CKS12050` has `brand: CABANA` and
`matched_specs: ["bowl_count","free_terms"]`; row 2 `SRTKS4040-O/F` has `brand: SORENTO` and
`matched_specs: ["brand","free_terms","thickness"]`. Our renderer takes each key's VALUE from the
**first row that HAS the key**, so it can tell a customer who asked for Sorento that the match was
on `brand: CABANA` — a row that never matched on brand.

**Family:** honest-attribution — naming a key without naming who earned it. Same shape as the
original `matched_specs` / `preferred_specs` bug this programme was built to kill. NOT new to this
slice (it rides in with the SA+SR package's N-1a line) but it is now measured and must not promote
unnoticed.

**Fix (CRM lane confirmed 2026-08-16: no wire change needed, and they declined to add one).**
Every spec row already carries BOTH `display.matched_specs` (keys THAT row earned) and
`display.specifications` (that row's values). So: read each key's value from a row whose own
`matched_specs` contains that key. Cross-referencing two per-row fields IS the direct read; a new
"which row earned which key" wire field would be a second copy of a fact the response already
states — rejected under the simplest-thing rule, by both lanes.

**Status:** NOT FIXED. Coder seat (opus subagent) is out on a weekly usage limit until 2026-08-18
17:00 KL. Live is untouched and two packages behind on these leaves, so nothing customer-facing is
affected until the user's promote — there is no urgency, and no reason to rush a seat-deviating
edit. Ships as rev 5 with a RED-first case built from exec 12607257's own envelope and a mutant
that restores the first-row-that-has-the-key rule.

## 7. `spec_unmet` semantics — SETTLED 2026-08-16, whole-set not per-row

`spec_unmet` is computed over the whole SHOWN set: a key is unmet only when it was asked for and
**no shown row matched it** (`satisfied = {k for row in shown for k in row.matched_specs}`).
Renderer rule in one line: **"nothing I am showing you has this" — never "the row I am showing you
lacks this."** A mixed shortlist where one row carries the brand and another the bowl count reports
neither as unmet, and that is the truth about the shortlist.

Corollary that explains an apparent contradiction: `sorento double bowl kitchen sink` (no
thickness) DOES return `spec_unmet: [{brand: SORENTO}]` — no Sorento row earns a place — while the
same phrase WITH `thickness 1.2mm` returns `[]`, because a Sorento row then earns in on
brand+thickness. Both are correct answers to different questions.
