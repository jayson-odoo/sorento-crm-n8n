# Review — `carried-certificate-dump` (B1 + B2′, judged as one fix)

| | |
|---|---|
| verdict | ✅ **APPROVE** B1 + B2′ as a single fix |
| clone (spine) | `txiPzSxy3Pclsz6v` @ **`2d1627c8`** — rollback `3a196c44` |
| parser fork | `wI5RkNGW3EOJfBdo` @ **`95193323`** — published (`versionId == activeVersionId`), rollback `c9f6e280` |
| live | spine `f9205b03`, parser `8a813ddc` — **untouched** |
| 🔴 coupling ruling | **dym-probe must be promote-COUPLED to B2′, not merely bundled** — see §4 |
| zero egress | **RE-CONFIRMED** — see §6 |
| reviewer | sorento-reviewer, 2026-08-07 |

**Judged as one fix, as asked, and that framing is correct.** B1 alone leaves the carried
certificate immortal *and* funnels affected customers into a did-you-mean code reply — which
is precisely the turn the B4 investigation showed `tryDymPick` uses to promote carried entities
into `current` ahead of the executor. B1 without B2′ would have created the trigger for the bug
it was trying to contain. Shipping them together is not packaging convenience; it is the fix.

---

## 1. 🔴 `oe-patch.py` — VERIFIED, not trusted. It is sound, and it prevents a live regression.

This was the item I was asked to check rather than accept, and it is the highest-consequence
one: the fork is stale vs live, so a block-copy would regress production.

I ran every check myself:

| check | result |
|---|---|
| `oe.after.js` == the published fork body | **MATCH** — verified against my own REST pull of `wI5RkNGW3EOJfBdo` @ `95193323`, not against the coder's copy |
| tool reproduces the clone build from `oe.before.js` | **exact** — byte-identical to `oe.after.js` |
| tool re-targets the **LIVE** body | **succeeds** — all five anchors hold, 62,313 chars |
| live-build vs fork-build | **differs by exactly the two `resource_attachment` lines** (628–629), and the **live-build is the one that keeps them** |
| LIVE vs live-build | only the four hunks; the sole "removed" lines are the axis map being hoisted |
| `node --check` on the live-build | **parses** |

**The stale-fork hazard is real and the tool defeats it.** Block-copying the fork would have
dropped `resource_attachment` from `DOMAIN_BLOCKED_HINTS.order` and `.incoming` on live — a
silent regression of previously-promoted work, exactly LESSONS §57. The `--src/--out`
re-targeting is not aspirational; I exercised it against the live body and it works.

**I checked the one thing that could have hidden inside the hoist.** Hunk 3 lifts
`AXIS_BY_DOMAIN` and `HINT_AXIS_DEFAULT` out of the executor to module scope, and the hoisted
copy ends with a `// …` comment — the classic shape of a truncated paste. I compared both maps
before and after: all five domain keys present (`promotion`, `master_products`, `order`,
`incoming`, `product_attachment`), every entry preserved, `HINT_AXIS_DEFAULT` verbatim plus the
one new line. **The `// …` is present in the LIVE source too** — it is a pre-existing comment,
not a truncation. Nothing was lost in the lift; the only additions are B2′ part 1's three
`certificate`/`attachment` entries.

Design points worth crediting: anchors are **asserted** (`need()` raises `ANCHOR FAIL` with
want/got rather than silently mis-patching), hunks apply **bottom-up** so earlier inserts cannot
shift later anchors, and it strips trailing whitespace per LESSONS §58b so the promote byte-gate
cannot fail on invisible characters.

One caveat to carry to promote, not a defect: the anchors are **absolute line numbers**. They
hold today because fork and live are both 866 lines (the `resource_attachment` delta is
in-line, not additive). If live moves before promote — and it moved three times yesterday —
the anchors may shift. The tool fails loudly rather than mis-patching, which is the right
failure mode, but **re-run it against a freshly exported live body at promote time** and expect
to re-derive the five line numbers if it aborts. See §7 C-item 6.

## 2. B1 (spine, `disallowed-entity-gate`) — correct and minimal

Verified: `gate.before.js` == the **live** node, `gate.after.js` == the **clone published**
node, and the diff is a **single additive 22-line block** at line 78 with **no live lines
removed**. Live + one hunk, by construction.

The logic is right, and right in the ways that matter:

- **Scoped to `product_attachment` only** — no other domain can be affected.
- **Guarded on `gate_passed &&`**, so it can only ever make the gate *more* restrictive. It can
  close a path, never open one. That is the correct direction for a containment fix.
- **The predicate is resolver-derived** (`unresolved_tokens ∩ parser product raws`) and
  deliberately **not** `current_message`. That is the load-bearing choice: §5/B4 established
  `current_message` is corrupted by `applyDymPick` and block (B), so a predicate built on it
  would have been unreliable in exactly the scenario B1 exists for.
- **`!_haveProduct`** means a turn where any product resolved still proceeds — B1 fires only
  when the lookup would be scoped on carried entities *alone*, which is the actual hazard
  (`certificate_ids` alone satisfies the tool's OR-semantics narrowing tuple, `server.py:40`,
  producing the observed 26-product dump).

**`probe.js` is a genuine discriminating gate.** I ran it both ways: 8 cases, **0 unexpected
against `gate.after.js`, 1 unexpected against `gate.before.js`**. It goes red on the pre-fix
body, and it prints `compared population: 8 cases` so an empty run cannot read as a pass
(LESSONS §61b). That is the shape every gate in this repo should have.

**§6 ruling — the no-guard decision on the picker interaction is correct.** When a missed
product raw is accompanied by a second ambiguous product token (exec `11525030`), products
resolve, `_haveProduct` is true, B1 stays inert, and the require-specific picker renders. That
is the right outcome: the hazard B1 addresses is a lookup scoped *only* by carried entities, and
a product-scoped lookup does not have it. Adding a guard to force B1's dead-end there would
suppress a genuinely useful picker in favour of a worse reply. **Confirm: no guard, and §CD-9
pinning the render is the right way to hold it.**

## 3. B2′ (parser fork, `output_exchange`) — the substantive fix, and the right design

The root cause is well-diagnosed: `certificate` had no entry in either axis map, so
`_ceAxisFor` fell through to the private `__certificate` axis that nothing collides with,
making the entity immortal. Part 1 fixes the map; but the map alone would not have been enough,
which is why B2 was correctly ruled NO-GO.

**The three-property design is sound and the properties are genuinely independent:**

- **Position** — the pass sits after *every* entity-set writer (`applyDymPick`, the op executor,
  `dymNumberedMultiSelect`, reference-positions, block B) and after the domain-carry blocks, so
  `domain_hint` is final when the axis classification runs. This is what defeats the two
  bypasses: the executor's axis filter touches `prior` only while `current` is spread
  unfiltered, and `dymNumberedMultiSelect` overwrites the executor's output wholesale afterwards.
  A wider `prior` filter — the obvious fix — would have been bypassed by both.
- **Provenance** — `_ceIsCarried` derives from `_parser_raw_snapshot` (the frozen pre-mutation
  LLM object) rather than `current_message`. Given that `applyDymPick` re-flags every prior
  entity as `current_message: true` before the executor runs (observed: all seven carried
  entities flagged true on parser exec `11509876`), any design keyed on that flag was doomed.
  Using the snapshot is the only uncorrupted signal available.
- **Widened trigger** — `_rcContribAttach || _rcContribProduct`. The `product_scope` half is the
  one that matters, and it is what makes B1 and B2′ compose: it fires on the bare-product
  follow-up *and* on the post-B1 did-you-mean code reply, which is the modal turn B1 funnels
  customers into.

**The eviction set is correctly narrow.** `_RC_INSTANCE_HINTS = {certificate, attachment}` —
instance-bound filters that are stale by construction when product scope changes.
`attachment_type` is deliberately **excluded** because it is a *type* filter that legitimately
outlives a product change, and re-attaching it is block (B)'s whole purpose. That distinction is
exactly right, and §5.1 below shows what happens when it is missed.

**Part 5 (dedupe) earns its place and is safely written.** `current` is spread unconditionally
and never pruned, so once `applyDymPick` promotes the carried set the list is append-only — the
observed five copies of `PC 000078`. The backfill-onto-retained-twin step is the detail I would
have asked for: it means the dedupe cannot *lose* a resolution (a uuid or canonical_code present
only on a discarded duplicate is copied onto the survivor). Diagnostics are emitted only when
non-zero, so they are drop-when-absent in the replay norm (LESSONS §40) rather than diffing on
every golden turn.

**Evidence quality.** The headline (`11528644`) is at the **customer boundary** and the tester
**printed the certificate value** rather than asserting a shape — `PC 000373`, `Validity: Valid`,
where the pre-fix behaviour was a confident false negative. The `tryDymPick` regression was
driven end-to-end on **both** pick paths, including `dymNumberedMultiSelect` (`11528822`), which
is the one that discards executor output wholesale — i.e. the path most likely to defeat the
fix was explicitly exercised. And the tester correctly bounded the claim: the certificate
*number* is established, the **uuid is not**, because the render envelope carries no id field.
That is the same envelope limitation I established for the dym probe in §7.2 of the dym review;
the two findings agree, which is a good independent cross-check.

## 4. 🔴 THE COUPLING RULING — dym-probe is promote-COUPLED to B2′

**The finding is correct, and I verified the mechanism in the dym code rather than accepting it.**

`dym-transform` builds its F3 scoping set as:

```js
scoping = compat.filter(e => cfg.requires.includes(String(e.entity_type)) && isUuid(e.uuid))
```

with `cfg.requires = ['attachment_type', 'certificate']` for `product_attachment`. So a
**carried** `certificate` entity sitting in `compatible_entities` is picked up as a scoping
entity, flows into `dym_probe_entities`, and `entity-ids-transformer` maps it to
`certificate_ids`. The probe then runs `product_ids ∧ certificate_ids`, the carried certificate
belongs to a different product, the intersection is empty, `answer_count: 0`, and
`dym-annotate` reports `ok: true` with nothing available — so **every candidate renders
`- no certificate`, confidently and falsely.**

That is the exact failure class I rejected the UUID union to avoid, arriving by a different
route. Their evidence confirms it end-to-end: B1-only renders `SRTWC8317-RL - no certificate`
(false); B1+B2′ renders `- has certificate`, and the code-pick turn returns those certificates.

### (a) Does this change my dym-probe APPROVE? **No — and it should not.**

The dym code is behaving **correctly given its inputs**. It faithfully reports what a correctly
scoped probe returned; the probe was narrowed by corrupted upstream state. Fixing this inside
`dym-annotate` or `dym-transform` — say, by ignoring carried certificates when building
`scoping` — would be the **wrong layer**: it would mask state corruption that also damages the
main get-results path (the original 26-product dump had nothing to do with dym), and it would
put a second, divergent notion of "carried" into a node that has no access to
`_parser_raw_snapshot`. B2′ is the correct and only sensible layer. **The APPROVE stands.**

### (b) Coupled or bundled? **COUPLED, and the ordering is forced.**

Promoting the spine's dym change without B2′ ships a **known false-annotation path** on the
domain that is 16/35 of all did-you-mean offers. That is not a bundling preference; it is a
correctness dependency. Concretely:

- **B2′ (parser) must be published BEFORE the spine.** Two independent reasons converge:
  LESSONS §37 (a parent resolves only the *published* version of a sub, so a parser edit is
  invisible until published), and the safety ordering — B2′ alone is a self-contained
  improvement that is safe on current live, whereas dym-without-B2′ is a regression.
- **The spine promote (dym + B1) must not proceed if the parser publish aborts.** If the byte
  gate fails on `output_exchange`, stop — do not ship the spine half.

### (c) Should a dym gate have caught it? **No gate could have — and that is the gap to close.**

I checked: every dym offline harness (`harness.js`, `ccs-harness.js`, `byteid.js`, `parity.js`)
constructs `compatible_entities` synthetically per fixture and has **no notion of carried
session state**. The scenario was outside the fixture space entirely, so no assertion could have
reddened. Add one fixture — a D1 `product_attachment` turn whose `compatible_entities` carries a
`certificate` entity resolved against a *different* product — asserting that either the probe is
not narrowed to empty or the annotation is suppressed. Cheap, and it makes the coupling
enforceable rather than remembered.

**The meta-pattern is worth stating, because this is now the third instance.** Every serious
dym finding after rev 3 came from *outside the node under test*: `escalate-catalog`
re-sourcing by name (rev 6), three of four render surfaces never enumerated (rev 4–5), and now
carried session state narrowing the probe. Node-local harnesses with synthetic worlds are
structurally blind to cross-node and cross-turn state. The counter-measures already adopted —
assert at the node that feeds the send, keep a pre-change consumer as a control — are the right
shape; this adds a third: **at least one fixture per change must carry realistic prior session
state**, because "the turn before" is the input every synthetic world omits.

## 5. Plan defects and process rulings

**§4.1 — the Part 4 dropped-set defect is the most valuable catch in this cycle.** As written,
literally applied, it would have deleted the `attachment_type` carry — destroying block (B)'s
purpose — *and* starved `dym-transform`'s probe, whose `requires: ['attachment_type',
'certificate']` is the F3 layer-1 guard I ruled load-bearing. The result would have been the
annotation silently disabled: `probe_needed: false`, no suffixes, no error, all gates green.
A silent feature-disable is the hardest class to notice. Narrowing to instance-level hints is
correct, and the live verification (`probe_needed: true`, `answer_count: 4`, annotation intact)
is the right way to prove it — an assertion about the *dym* feature, from the *cert* change's
test run. Cross-change verification like that is what caught it.

**§4.2 / §4.3 — accepted.** §CD-FP-8's stated expectation being blind with `FP8-D` the sole
discriminator, §CD-11's two-turn recipe going vacuous under B2′ (turn 1 now evicts, so turn 2
must be seeded with the certificate *plus* a `dym_offer`), and §CD-FP-4a/4b reddening nothing
because the maps shadow each other with only 4c a real gate — all three are correctly
characterised. Update §CD so the next reader does not re-derive them.

**§5 — the discriminator-shape requirement should become a standing §0 rule. Yes.**

This is the fourth instance in this repo of a gate that could not redden its own mutation. The
rule is now well enough understood to state generally, and it has two halves that must both be
required, because each has failed alone:

1. **Occurrence + digest assertions** around every mutation (`mutate.sh`, already adopted here —
   both `mutate.sh` and `oe-mutate.sh` implement it with `ABORT … VOID` and `node --check`).
   This catches a mutation that never applied.
2. **A discriminator that is shown red against the pre-fix artifact**, and a printed **compared
   population** so an empty check cannot read as a pass. `probe.js` does exactly this (8 cases,
   1 unexpected on `gate.before.js`). This catches a mutation that applied to a gate comparing
   nothing.

Add both to `tests/uac/00-SAFETY-always-read.md` as §0 S9, and record the four instances in
LESSONS §61 so the rule carries its own evidence.

**Both coders disclosing their own harnesses were blind — and running mutations to find out —
is the behaviour this pipeline should be optimised for.** B1's went green under all three
prescribed FP mutations; B2′'s `CD-7c` could not test the dedupe and `CD-FP-4b` expected reds
and got none. Both recorded it rather than re-aiming quietly, and the tester reproduced both
independently. A harness that reports its own blindness is worth more than one that reports a
pass, and it should not cost anything to say so.

## 6. Zero egress — re-confirmed

Verified against the `2d1627c8` export, not taken from the run log:

- Five egress nodes still **0-inbound** orphans; sink unchanged; 149 nodes.
- Both dym probes still → `rysSPgUssLDf6xJc`, unchanged by this work.
- **B1 adds no node and no edge** — it is a jsCode-only change to an existing gate, and its only
  effect is to set `gate_passed = false` more often, which *reduces* downstream reads.
- **B2′ adds no node** — jsCode-only inside the parser fork. It contains no HTTP, no redis, no
  sub-call; it filters and dedupes an in-memory array.
- The fork is **published** (`versionId == activeVersionId`), so the clone is running the
  reviewed bytes rather than a draft (LESSONS §37/§17).
- All four **dym** suites still pass against the new clone version, so B1 did not disturb the
  previously-approved surface.
- §0: S1–S5, S8, S9 pass; S6 parser tier as scoped; S7a +1/run.
- **S7b PARTIAL — accepted, same standing basis.** Neither B1 nor B2′ adds a node or an edge, so
  containment is structurally identical to what I accepted at dym rev 3 and twice since. Per
  LESSONS §45 the LLEN reading was never the sound instrument.

**No egress.**

## 7. COMBINED PROMOTE CHECKLIST — dym-probe + B1 + B2′, two workflows

The user is bundling all three. This supersedes §9.5/§10.4 of `dym-probe-before-offer.md` for
the combined promote; the dym-specific node detail there still applies and is referenced, not
repeated.

### A. Pre-conditions
1. [ ] CRM resolver decision (company scoping vs grouping) resolved — it is what holds this promote.
2. [ ] Dym gate additions: the carried-state fixture (§4c) and, from the dym review, the §9.5A documentation items.
3. [ ] §CD updated for the three plan defects (§5); §0 S9 discriminator rule adopted.
4. [ ] Account for the clone version delta noted in the dym review (`5d6f9593` → `3a196c44` → `2d1627c8`); the last hop is B1 and is reviewed here.

### B. 🔴 Re-verify at promote time — live drifted three times yesterday
5. [ ] `export-workflows.py --verify` green, **and re-export the parser fork via REST** (it is outside the export set, so `--verify` says nothing about it).
6. [ ] **Re-run `oe-patch.py` against a freshly exported LIVE `output_exchange`.** If it raises `ANCHOR FAIL`, live has moved — re-derive the five line numbers and re-review the regenerated body before proceeding. Do not adjust anchors to make it pass without re-reading the surrounding code.
7. [ ] Re-assert the dym baselines (`live-bso.js`, `live-ccs.js`, `live-ec.js`, `crossdomain-compose.js`) against current live; **stop if any drifted** — every byte-identity gate is void until rebaselined.
8. [ ] Re-run all suites: dym (`parity`, `harness`, `byteid`, `ccs-harness`) and cert (`byte-identity`, `probe.js gate.after.js`, `oe-byte-identity`, `oe-probe`).
9. [ ] Both live workflows: draft == active (LESSONS §23/§24). Stage any foreign draft as its own no-op publish (§51).
10. [ ] Backups: live spine `versionId` + the four pre-change spine bodies (`build-suggest-offer`, `compile-current-state`, `escalate-catalog`, `disallowed-entity-gate`); live parser `versionId` + `output_exchange`. Rollback = publish prior id, per workflow.

### C. 🔴 ORDER — parser first, spine second, and do not split the pair
11. [ ] **STEP 1 — parser `XTODTw-dJcV0uRdC056hG` (B2′).** Body = `oe-patch.py --src <fresh live output_exchange>`, i.e. **LIVE + the four hunks**, never the fork body (§1: the fork is stale by the two `resource_attachment` lines and copying it regresses live). Byte-gate: update draft → re-fetch → assert draft == generated file → **publish only on match** → re-fetch and assert active == file.
12. [ ] **ABORT GATE:** if step 11 does not publish cleanly, **stop — do not promote the spine.** The spine's dym change without B2′ is a known false-annotation path (§4).
13. [ ] Verify the parser publish took: `versionId == activeVersionId` on `XTODTw`, and one live turn showing a carried certificate evicted (`carried_attachment_evicted` present) or simply a correct answer on the reported case.
14. [ ] **STEP 2 — spine `9qVyfUxmRQqrpGRMDLRuz`.** Apply, in one reviewed pass:
     • **B1** — `disallowed-entity-gate`, live body + the single additive 22-line block (§2).
     • **dym-probe** — the 3 modified + 8 added nodes and the edge changes, exactly as specified in `dym-probe-before-offer.md` §9.5 C11–C18, **with §10.4's correction: both probes target `Fss5aAaXthJSWpZCgKiKR`, not `rysSPgUssLDf6xJc`.**
15. [ ] Edge counts on live after: `build-suggest-offer` inbound **exactly 4**, `compile-current-state` **exactly 5**, `Aggregate1` **exactly `If6[1]`**.
16. [ ] Byte-gate every node individually; abort on any mismatch; never force.

### D. Post-promote — verify the interaction, not just the parts
17. [ ] **The headline case end-to-end:** `srtwc8317-rl1 cert` from a session carrying a stale certificate → B1 dead-ends → did-you-mean renders → **annotation is `- has certificate` where true**. This single turn exercises B1, B2′ and dym together and is the one that was wrong before.
18. [ ] Code pick and numbered pick both return the correct product's certificates (no `PC 000078`).
19. [ ] Non-enabled-domain D1 miss byte-identical; answered turn with no dym set byte-identical (dym review §9.5 D19–D20).
20. [ ] Each dym surface separately, including the require-specific picker **as rendered to the customer** (dym review §9.5 D21–D25).
21. [ ] No control keys in a real `conversation-variables` PUT payload.
22. [ ] Watch a day: all-negative annotation rate per domain, `dym_excluded_codes` volume, `carried_attachment_evicted` volume, probe error rate (the Cloudflare 504s).
23. [ ] Re-run `export-workflows.py`; commit refreshed exports **and a `MANIFEST.json` snapshot**. **Add the parser fork to the export set** so the next change is not reviewing an unverifiable artifact.

### E. File separately
- **Resolver cross-company leak** — `entity_resolver.py`'s raw `text()` tiers run unscoped (`do_orm_execute` short-circuits on `TextClause`); `company_sql_predicate` exists and is unused there. `plans/multi-company-resolution-plan.md`. This is the decision holding promote and is worth more than either feature.
- **Hardcoded `space_id: "364817"`** across 8 live spine nodes plus the get-results fork.
- **Digit-on-merged-offer silent escalation** (dym review F-MERGE).
- **`dym_excluded_codes` naming** — it means excluded from *probing*, not from the offer.

## 8. Close

Two things distinguish this cycle. The coders found a plan defect that would have **silently
disabled the annotation shipped in the previous change** — caught only because someone asserted
a dym property from a cert change's test run. And both disclosed their own harnesses were blind
instead of re-aiming quietly.

The coupling in §4 is the substantive result: the dym change carries a false-annotation path
that no dym gate could have caught, because every dym harness builds its world from scratch and
has no "turn before". That is the third finding in this programme to arrive from outside the
node under test, and it is why the standing counter-measure — a fixture carrying realistic prior
session state — belongs in §0 alongside the discriminator rule, not in this change's notes.
