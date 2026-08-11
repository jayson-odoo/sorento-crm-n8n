# PLAN (n8n side): Product spec search

Status: SIGNED OFF POST-GRILL 2026-08-04. **Blocked on the CRM side** (slices S0 to S5).
CRM contract: `sorento_crm/documentation/plans/products/PLAN-spec-search.md`
CRM UAC: `sorento_crm/documentation/plans/products/spec-search-acceptance-criteria.md`
Domain language: `CONTEXT.md` (this repo). Decisions: `docs/adr/0001..0003`, plus
`sorento_crm/documentation/adr/0013-...`.

## 1. Scope of the n8n change

Four things, and nothing else:

1. **Spec extraction** in the semantic parser, evidence-bound, against the CRM Spec Registry.
2. **A miss discriminator**: code attempt versus descriptive, on the resolve-entity miss path.
3. **A candidate picker** for `spec_candidates`, reusing the existing did-you-mean machinery.
4. **One advisory question**, when the CRM says the class has a decisive one that the
   conversation has not answered yet (see section 6b).

Everything about *what a spec is*, *which specs exist*, and *how candidates are ranked* lives
in the CRM. n8n never derives a spec and never ranks. Registry vocabulary reaches the parser
through the parser-config read (`GET /api/v1/master-data/spec-registry`), not through a
hardcoded prompt list. See `plans/parser-config-registry-plan.md`.

## 2. Where it attaches (verified against the current export)

Live spine `sorento-consume-main` (`9qVyfUxmRQqrpGRMDLRuz`) today:

```
resolve-entity  ->  disallowed-entity-gate  ->  If3
                                                 If3[0] -> If-incoming-picker
                                                 If3[1] -> Execute 'sub-get-rag'   (resolved path)

miss path:      not-found-error-message -> sibling-gate
                sibling-gate[1] -> build-suggest-offer
                sibling-probe   -> build-suggest-offer
                build-suggest-offer -> tag-not-found -> escalate-catalog
```

The insertion point is the **miss path**, alongside `sibling-gate`, not on the resolved path
and not inside `resolve-entity`'s own probe:

```
not-found-error-message
  -> spec-miss-gate            (NEW: descriptive miss? and domain in allowlist?)
       out0 (code miss)        -> sibling-gate                  (existing, unchanged)
       out1 (description miss) -> spec-candidate-transform      (NEW)
                                    -> build-suggest-offer      (existing, numbered mode)
       out2 (floor missed)     -> tag-not-found -> escalate-catalog  (existing)
```

`build-suggest-offer` (417 lines) already renders numbered candidate lists and already handles
the promotion-candidate numbered mode, so candidates are a new *source*, not a new picker.

## 3. Parser change (spec extraction)

Sub `sub-semantic-parser`. Live published `XTODTw-dJcV0uRdC056hG`; the clone calls the fork
`wI5RkNGW3EOJfBdo`. Per `memory/ideation-intake-parser.md` that fork is currently
byte-identical to live, so **re-diff at promote time** rather than trusting that (see
`memory/stale-byte-identical-fork-claim.md`).

New parser output, additive:

```json
{
  "extracted_specs": [
    {"key": "material", "value": "stainless_steel", "evidence": "stainless steel"},
    {"key": "mounting", "value": "wall_hung",       "evidence": "wall mounted"}
  ],
  "free_terms": ["kitchen sink"],
  "resolution_attempt": "descriptive"        // descriptive | code_attempt
}
```

Hard rules:

- **Evidence-bound.** Every spec must cite the customer substring that triggered it. A
  deterministic code node downstream of the LLM drops any spec whose `evidence` is not
  literally present in the message. The registry is never echoed back.
- **Over-extraction is the primary failure mode.** The registry ships ~26 keys, eight of them
  present on fewer than 40 products, so the prompt offers far more vocabulary than any real
  message uses. The evidence gate is the only thing standing between that and a parser that
  emits the same specs every turn.
- `bowl_count` is seeded `is_active=false` in the registry, so it never reaches the prompt.
  Do not hardcode it back in.
- Registry vocabulary is **read**, never duplicated in the prompt source.

## 4. Miss discriminator

Two signals, LLM plus a deterministic backstop:

```
code_attempt  when  parser says code_attempt
                    OR the token matches the code shape regex
                       ( [A-Z]{2,}[0-9]{3,} | <letters><digits>-<suffix> )
descriptive   when  parser says descriptive AND no token is code-shaped
                    AND at least one extracted spec or free term exists
```

The regex is the backstop against LLM misclassification, and it is deliberately biased toward
`code_attempt`: a code sent to the existing sibling picker degrades to today's behaviour, while
a code sent to spec search would reintroduce the exact failure that made product resolution
code-only (`entity_resolver.py:2945`, `USED FOR SRTWC6015-RL-UF`).

Domain allowlist for v1: **`master_products` only.** Implement as a set so `promotion`,
`inventory`, `incoming` and `product_attachment` are one entry each later. Note the measured
consequence: 63 of the 67 descriptive messages in the 3,195-message corpus are promotion-scoped
(`any cabana kitchen sink promo`), so on real traffic this will fire rarely at first. Log every
suppressed descriptive turn with its domain so the allowlist decision has data.

## 5. Resolve call

Same node, same credential (`resolve-entity`, `httpHeaderAuth` / `crm-n8n-auth`). Add to the
body only:

```
spec_fallback:    true
extracted_specs:  <from parser, post evidence gate>
free_terms:       <from parser>
```

The CRM runs spec search only when `spec_fallback=true` **and** its normal product probes
returned zero matches, and returns `spec_candidates` plus `floor_missed` alongside an untouched
`resolutions`. With the flag absent or false the response is byte-identical to today, so this
change cannot affect any other caller or any other domain.

## 6. Candidate rendering

- Numbered list, at most 5, via `build-suggest-offer`'s numbered mode (never raw UUIDs, per
  `memory/promo-didyoumean-uuid-fix-shipped.md`).
- Each line: `product_code`, the CRM's rendered summary, stock on hand.
- **Discontinued products are shown, not filtered.** The CRM neither excludes nor deboosts
  them; each candidate carries `is_discontinued` and n8n labels it in the line. This mirrors the
  display-only annotation precedent in `memory/incoming-picker-availability-shipped.md`: the
  roster stays unpolluted and the label is presentation.
- Quick-reply labels must not contain commas (`memory/quick-reply-comma-strip-shipped.md`).
- Candidate offers go through the existing `dym_candidate_map` so each suggestion carries its
  source token, and through the `dym_offer` single-use lifecycle so a second pick from the same
  offer still resolves (`memory/dym-candidate-map.md`, `memory/dym-candidates-single-use.md`).
- On `floor_missed=true`: show **no** candidates, route to the existing clarify/escalate path,
  and carry the extracted specs into the escalation so CS sees what the customer described.

## 6b. The advisory question (recommendation turns)

The CRM owns the expertise; n8n owns the conversation. When the CRM returns an advisory question
instead of candidates, the bot asks it and stores the answer as conversation state.

```
CRM response carries either:
  advisory_question: {question, maps_to, answer_map, priority}   -> ask it, NO candidates
  spec_candidates + rationale                                    -> render the picker
```

Rules:

- **At most one question per recommendation.** The CRM already enforces "highest priority only";
  n8n must not chain a second one in the same turn. The journey principle is fewest decisions.
- **The answer is state, not a one-off.** Store it against the conversation so a later turn in
  the same session does not re-ask. This is the same failure mode `dym_offer` single-use was
  built to prevent (`memory/dym-candidates-single-use.md`); reuse that lifecycle shape rather
  than inventing a parallel one.
- **Render the answer options as quick replies** where `answer_map` has 2 or 3 keys (floor /
  wall). Labels must not contain commas (`memory/quick-reply-comma-strip-shipped.md`).
- **The rationale is shown, never invented.** If the CRM returns candidates with no rationale,
  the bot renders the plain shortlist. n8n must never author a reason for a recommendation:
  a fabricated justification for a physical fitting is worse than none.
- The canonical case is the water closet: S-trap versus P-trap is decided by whether the
  customer's waste outlet is in the floor or the wall, and recommending the wrong one means a
  toilet that cannot be installed.

## 7. Test plan (harness rules are non-negotiable)

Build and test on the clone `sorento-consume-main TEST` (`txiPzSxy3Pclsz6v`). Never edit the
live spine. Promotion stays user-gated.

- Read `tests/uac/00-SAFETY-always-read.md` (§0) for every case. New family file
  `tests/uac/SS.md` (spec search), indexed in `tests/uac/README.md`.
- Case envelope per `memory/clone-canary-item-envelope.md`. Verify the envelope against a real
  execution first: stale fixtures produce green runs that prove nothing
  (`memory/stale-case-fixtures-false-green.md`).
- **Make every new assertion fail on purpose before trusting it**
  (`memory/green-that-cannot-fail.md`). Specifically: confirm the spec-miss branch actually
  fires before asserting on its output, and assert per-node `runData`, never execution status
  (`memory/unwired-error-output-masks-failure.md`).
- `uac` mode reads the PROD session for contact 437264483, which is stale-contaminated. Any
  case whose behaviour depends on carried session state is UNRELIABLE, not PASS
  (`memory/uac-mode-reads-prod-session.md`).

Cases:

| id | input | expect |
|---|---|---|
| SS-01 | `stainless steel kitchen sink wall mounted` | descriptive miss, spec search runs, numbered top-5, no `ACC-`/`40MM TAIL` rows |
| SS-02 | `SRTKS4028B` | code attempt, existing exact resolution, spec search NOT called |
| SS-03 | `SRTWC6015` (the cross-ref code) | code attempt, spec search NOT called, no match on the SPARE row |
| SS-04 | `suggest me a bathtub` | class-only match, candidates returned |
| SS-05 | nonsense phrase | `floor_missed=true`, zero candidates, clarify/escalate, specs on the escalation |
| SS-06 | phrase matching a discontinued model | candidate shown WITH the discontinued label |
| SS-07 | pick `2` from an SS-01 offer | resolves to that code, resumes `master_products` |
| SS-08 | second pick from the same offer | still resolves (single-use lifecycle intact) |
| SS-09 | `any cabana kitchen sink promo` | domain is `promotion`, NOT in the allowlist, existing behaviour unchanged, suppression logged |
| SS-10 | a message with no spec words at all | parser emits zero `extracted_specs` (over-extraction guard) |
| SS-11 | `i need a toilet for my house` | CRM returns the advisory question, bot asks floor-or-wall, ZERO candidates shown |
| SS-12 | reply `floor` to SS-11 | answer stored as state, candidates constrained toward `trap_type=s`, question not re-asked |
| SS-13 | a second WC request later in the same session | question NOT re-asked, stored answer reused |
| SS-14 | `i need a basin for a small powder room` | candidates returned WITH the guidance rationale rendered |
| SS-15 | a class with no priority-1 question | no question asked, straight to candidates |

## 8. Promote order

CRM must be complete and eval-tuned first, because the n8n side has nothing to call otherwise.

```
1. CRM S0..S5 merged, eval baseline green, weights and floor tuned
2. parser sub: spec extraction + evidence gate
   -> the clone's fork and live are currently byte-identical, so RE-DIFF at promote time
   -> build the promote target as LIVE + own hunks, never a wholesale fork copy
3. spine: spec-miss-gate + spec-candidate-transform + build-suggest-offer source
4. hash-gated promote, backup first, rollback = publish the prior versionId
```

Post-promote the feature is **inert until** the CRM has spec values and the registry is active,
which is the same shape as the pending-allocation promote
(`memory/alloc-badge-phase-c.md`): promoted dark, activated by CRM data.

## 9. What n8n must NOT do

- Never derive a spec. Never rank candidates. Never hold the spec vocabulary in a prompt
  literal.
- Never query product descriptions. The only searchable text is the CRM's rendered spec
  sentence, and n8n never sees it.
- Never loosen `resolve-entity`'s code-only product probe.
- Never enable a domain outside the allowlist without its own UAC cases.
