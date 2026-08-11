# Review — `immortal-hint-class` (C1 + C2 + C3 + M2) — and the consolidated 7-piece promote

| | |
|---|---|
| verdict | ⚠️ **REQUEST-CHANGES** — two items, both small; **C1/C2/C3/M2 are correct** |
| clone | `txiPzSxy3Pclsz6v` @ **`a2422bb9`** — rollback `5fdd12df` |
| parser fork | `wI5RkNGW3EOJfBdo` @ **`184882c1`** — published, rollback `95193323` |
| live | spine `f9205b03` / parser `8a813ddc` — **untouched** |
| zero egress | **RE-CONFIRMED** — §4 |
| reviewer | sorento-reviewer, 2026-08-08 |

The four fixes are sound and I verified each mechanism against the published bytes. What
blocks is not the fix — it is that the primary regression gate is **both violated and blind**,
and the two are causally linked.

---

## 1. Verified independently

- `--verify` green. **The fork is now IN the export set** (`sub-semantic-parser-FORK: current
  (184882c1)`) — the coordinator's warning is out of date, my earlier recommendation landed, and
  `--verify` now covers it. I still pulled it via REST and confirmed the export body is
  byte-identical to the live artifact, so the export is trustworthy for the fork.
- All suites run by me: dym `parity/harness/byteid/ccs-harness` ALL PASS; IH `ih-probe` 16/16,
  `c3-probe` 78/78; cert `oe-probe` 11/11, `probe.js gate.after.js` 8 cases 0 unexpected,
  both byte-identity suites as declared. **But see F-STALE — four of these ran on stale bytes.**
- Clone structure at `a2422bb9`: five egress nodes **0-inbound**; `build-suggest-offer` inbound
  **4**; `compile-current-state` inbound **5**; `Aggregate1` inbound **`If6` only**; both probes
  → `rysSPgUssLDf6xJc`, `onError: continueRegularOutput`, **no credentials**.

## 2. Findings, most severe first

### F-STRIP 🔴 REQUIRED — two new control keys are emitted but never stripped

`dym-transform` now emits **twelve** keys; `_DYM_CTRL_KEYS` strips **ten**. Missing:

```
dym_capped_codes      ← C3(i), emitted unconditionally (dym-transform.js:377)
probe_cap_applied     ← C3(i), emitted unconditionally (dym-transform.js:378)
```

`dym-transform` runs on **every** not-found turn, including every non-enabled domain, and
`dym-gate[1]` feeds its output straight into `build-suggest-offer`, which spreads
`{...$input.first().json}` and deletes only the ten. So `build-suggest-offer`'s output now
carries two extra top-level keys on the path that covers most traffic.

**Blast radius — bounded, and I checked each hop rather than assuming:**

- **Not a session leak.** `compile-current-state` still builds a fresh literal
  (`let output = {}` … `return output`), so the keys die there and never reach the
  conversation-variables PUT. The F-CCS-STRIP invariant from the dym review is holding and is
  doing exactly the job it was gated for.
- **Not customer-visible.** They are object keys, not rendered text. No consumer reads them —
  `escalate-catalog` takes named fields only.
- **But it breaks the byte-identity invariant** — §DP-10, the gate I called "the gate that
  blocks promote", asserting a non-enabled-domain D1 miss is byte-identical to live. It is now
  not. That is the primary regression gate for ~90% of traffic.

Fix: add the two strings to `_DYM_CTRL_KEYS`. Then re-run `byteid.js` against **published**
bytes and confirm the viaXf cases go green for the right reason.

### F-STALE 🔴 REQUIRED — four of the five dym suites are testing yesterday's bytes

The offline body copies have drifted from the published clone:

```
** STALE  build-suggest-offer, dym-transform, dym-annotate,
          dym-transform-partial, dym-annotate-partial
   MATCH  compile-current-state
```

So the `ALL PASS` from `harness.js`, `byteid.js` and `ccs-harness.js` **is not evidence about
`a2422bb9`**. Only `parity.js` is valid, because it is the one suite I required to source from
`export/` — that requirement is now paying for itself, and it is the model for the fix.

**And the two findings are causally linked, in the exact shape this repo keeps producing.** The
stale `dym-transform.js` contains `dym_capped_codes` **zero times** — it predates C3. The stale
`build-suggest-offer.js` correspondingly does not strip it. The two stale bodies are
*self-consistent*, so `byteid.js`'s nine `viaXf` cases compare a payload that never had the keys
and pass. **The gate that exists precisely to catch F-STRIP reported green because it was
holding an older, consistent pair of bodies.** Fifth instance of "green that cannot fail", and
the first where the mechanism was body staleness rather than assertion shape.

Fix, and make it structural rather than a refresh: **every suite should read the node bodies
from `export/…/nodes/` the way `parity.js` does**, with the same `exit(2)` on a missing file.
A copy that can drift is a copy that will. Failing that, a sha-gate at suite start that aborts
on any mismatch — but sourcing from the export removes the failure mode instead of detecting it.

*Process note: this was caught by the sha-parity check I have run at the top of every review in
this programme. It is not automated anywhere. That is the gap.*

### F-ANCHOR 🟡 note — `oe-patch.py`'s two anchor styles have different robustness

The B2′ hunks still use **absolute line numbers** (`need(78, …)`, `need(656, …)`); the newer
C/M hunks use **exact-count string assertions**. The string form is strictly better and the
line-number form holds today only because live and fork remain line-aligned in those regions.
Not worth reworking now, but at promote time an `ANCHOR FAIL` means live moved — re-derive the
numbers by reading the surrounding code, never by nudging them until it passes.

## 3. Rulings

### (1) M2 — confirmed, and it does change how B2′ should be promoted

Verified in the published fork: `_ceRefPickedKeys` is a local `Set` declared at :102, populated
**only** at :661 inside the reference-positions writer (this turn), and consumed at :105. The
old `if (e.ordinal !== undefined) return false;` is gone.

The diagnosis is right and it is a real defect in code I approved. B2′'s whole design principle
was *record, don't infer* — and it inferred in one place, from `e.ordinal`, a **persisted**
field. `ordinal` survives into the next turn's session state, so a positional-pick entity was
permanently exempt from eviction. M2 makes B2′ consistent with its own principle.

**Does it change my B2′ sign-off?** Not withdrawn — B2′ was correct as far as it went and fixed
the certificate class. But it was **incomplete**, and the same coupling logic applies as for
dym↔B2′: **B2′ must not promote without M2**, because B2′ alone leaves the positional class
immortal while presenting as fixed. In the bundle that is automatic; state it anyway so a future
partial-promote cannot separate them.

**The negative control is the most valuable artifact here:** all 11 `sim-inject` rows carried
zero `ordinal`, versus 17 real `pg-get-session` rows that carried it. That is *why* every §CD
case passed. Synthetic prior state omitted the field real session state carries — the second
instance of that exact blindness (the first was carried certificates narrowing the dym probe).
It confirms the standing rule I proposed last round and sharpens it: **prior-state fixtures must
be sourced from a real `get-session-vars` payload, not hand-built.**

### (2) C1 composes with B2′ — re-derived, confirmed

Verified from the published body, not accepted: the fallback is now
`DOMAIN_SUBJECT_AXIS[domain] || 'unscoped_scope'` — a **shared** axis, so an unrecognised hint
collides and becomes evictable, plus `_ceUnknownHints` as an observable. And I checked the
composition claim directly: `certificate`, `attachment` and `attachment_type` are each mapped in
**both** `AXIS_BY_DOMAIN` and `HINT_AXIS_DEFAULT`, so `known` is always truthy for them and the
C1 fallback **can never fire** on the B2′-relevant hints. C1 cannot alter B2′'s behaviour.
Composition, not subsumption — confirmed. The 11 §CD fixtures staying green against the rev-2
body is consistent with that, and now has a mechanism behind it.

No new eviction risk: an unrecognised hint is by definition unmapped, so nothing intentional
depended on its axis, and the prior behaviour (private axis ⇒ immortal) was the defect.

### (3) C3 annotates without renumbering — confirmed

Verified: the suffix lands on the **rendered line** (`candLines.push(\`  ${idx}. ${p.label}${_sfx}\`)`),
not on `p.label`, so `suggest_last_result_set` and `dym_candidates` are untouched. And there is
**no sort in the multi-token block** — the only two sorts in the file are D3's siblings (line 90,
pre-existing) and single-token D1 code mode (line 347, from the approved dym change). Global
contiguous `idx` is therefore preserved by construction, which is the §DP-13a invariant.

**The coder was right to decline inventing an index-correspondence invariant.** Multi-token
`suggest_quick_reply` is `[YES, NO]` only, so there are no code buttons to correspond to
positions. Asserting a correspondence that does not exist would have been a gate that cannot
fail — the thing we are trying to stop.

### (4) F1 — the cap is adequately protected in-code

The protection sits **at the constant**, which is the durable location:

```
// ⚠️ DO NOT RAISE without re-measuring the row grain first.
probe_cap: 3,
```

with the measured grain, the arithmetic (`5 × 13 = 65` against the 50-row default at
`app/schemas/common.py:37`), the reason it is a *correctness* value not a tuning value, and — the
part I would have asked for — an explicit **do not generalise between domains** note on the
`product_attachment: 8` entry, since that domain measured 3× better. A future reader editing the
number sees all of it. Adequate.

### (5) §IH-14 — reclassify to blocked-by-design: **agreed**

With cap 3 (≤39 rows) and `product_attachment` 8 (≈10 rows), a saturating probe is not producible
through any lane. Marking it "blocked" implies someone should keep trying; "blocked-by-design"
records the truth — the saturation branch is unexercised-live **defence in depth**, unreachable
because the caps are correct. That is the same status I gave `_dym_probe_input` in the dym review
and the same reasoning: keep the branch, document that it guards a state the current
configuration prevents, and note that raising a cap makes it reachable again. Cross-reference it
from the cap comment so the two move together.

### The three disclosed limits

- **F1's half-counterfactual proof — acceptable, and correctly labelled.** What matters for
  promote is that annotation *survives* at 3 and §IH-13 is undisturbed, both confirmed live. That
  5 *would* have saturated rests on measured grain plus arithmetic, which is sound reasoning about
  a value that is now unreachable. Disclosing it as unconfirmed rather than asserting it is the
  right call; no further work needed.
- **§CD-2/2b encode a shape the live parser does not emit — retire or reconcile, do not leave.**
  The real LLM types `PC000078` as `hint: "product"`; certificate typing arrives later from the
  spine's `reconcileEntities`. A fixture that encodes a shape the producer never emits is a gate
  guarding an absent risk, and it will be read by a future maintainer as evidence that the risk is
  covered. **Recommend: retire them from the pass criteria and replace with a fixture built from a
  real parser output**, per the §CD-2/M2 lesson above. Not promote-blocking — nothing depends on
  them — but do not carry them forward silently.
- **§FP8-D partial — accepted.** The load-bearing half passes; the attachment_type-retention half
  fails to reproduce because the LLM switched `domain_hint` off `product_attachment` on a bare-code
  follow-up, which is the already-filed bare-code domain-carry backlog item, not this change.

### Positives I verified rather than assumed

- **The require-specific picker is genuinely closed** — reached twice live (`11649922`,
  `11649863`) with the annotation carried. That is the surface LESSONS §63 records as missed
  twice, and it is now demonstrated rather than inferred.
- **S7b's real halt is properly discharged.** `llen-prod-before: 1` triggered a halt, and the
  attribution was done rather than waved through: 113 covering consumer executions, **0
  unretrievable**, 68 non-empty pops, and a programmatic scan showing the only contact in the
  stream is an unrelated live producer with zero occurrences of the test contact or any of the 14
  `test_run_id`s. That is exactly the procedure LESSONS §45 specifies — an unretrievable execution
  would have been an UNATTRIBUTABLE fail, and there were none. **This is the first time the S7b
  instrument has actually fired and been resolved on evidence**, which retires my standing
  "PARTIAL, accepted on structural containment" caveat for this run.
- **F3's gate discriminates**: the rev-1 body reddens `IH-3-CTRL` only while `IH-3` stays green,
  and the coder showed `IH-3` could never have caught it. Demonstrating that your *existing* test
  was incapable of catching the bug is the strongest form of this evidence.

### The `split-uac.py` loss gate — sound for the failure it was built for; go further

The gate is correctly positioned **before any write** (lines 42–59; first write at 61) and
catches both real shapes: a family present in `tests/uac/` with zero monolith sections (§MC/§CD/
§IH), and a family where the split has more sections than the monolith. I confirmed the numbers
that would trip it: `DP.md` has **21** sections, the monolith has **16** — the gate fires.

**Residual hole, stated precisely:** it compares *section counts*, not content. Equal counts with
edited bodies pass, and in-section edits are invisible. Since the comment itself concedes *"the
split files are now authored directly; UAC.md is stale provenance"*, the honest conclusion is
stronger than a gate: **retire the script and archive the monolith**, or require an explicit
opt-in flag. A gate that still permits regeneration in the equal-count case permits silent
content loss on the very files that are now authoritative. Fine as an emergency stop; not a
resting place.

## 4. Zero egress — re-confirmed

Verified against `a2422bb9`, not the run log. Five egress nodes **0-inbound**; sink unchanged;
both probes → the fork with `onError: continueRegularOutput` and **no credentials**; edge counts
4 / 5 / `If6` exactly as approved. **C1, C2 and M2 are jsCode-only inside the parser** (no HTTP,
redis or sub-call added); **C3 is jsCode-only in the spine**; no node or edge was added by any of
the four. The fork is **published** (`versionId == activeVersionId`), so the clone runs reviewed
bytes, not a draft.

§0 S1–S9 pass, including the S7b halt discharged by attribution above. F-STRIP is a key-hygiene
defect, not an egress one — and I confirmed it dies at `compile-current-state` rather than
reaching the session PUT. **No egress.**

One accounting item: clone node count moved **149 → 148**. The reviewed surface is unaffected
(all structural invariants above hold), but state what was removed before promote — same
discipline as the versionId accounting in the dym review.

## 5. CONSOLIDATED PROMOTE CHECKLIST — all seven pieces

**Bundle:** dym-probe · B1 · B2′ · M2 · C1 · C2 · C3. **Two publishes, parser first.**

| artifact | id | promote from | rollback to |
|---|---|---|---|
| live parser | `XTODTw-dJcV0uRdC056hG` | `oe-patch.py` on fresh live body | `8a813ddc` |
| live spine | `9qVyfUxmRQqrpGRMDLRuz` | live + reviewed hunks | `f9205b03` |
| clone (test only) | `txiPzSxy3Pclsz6v` @ `a2422bb9` | — | `5fdd12df` |
| parser fork (test only) | `wI5RkNGW3EOJfBdo` @ `184882c1` | — | `95193323` |

### A. Blocking — promote is NOT authorized until these clear
1. [ ] **F-STRIP** — add `dym_capped_codes` and `probe_cap_applied` to `_DYM_CTRL_KEYS`.
2. [ ] **F-STALE** — repoint every offline suite at `export/…/nodes/` (as `parity.js` does, with `exit(2)` on missing), or refresh + add a start-of-suite sha gate. Then re-run **all** suites and confirm `byteid.js`'s viaXf cases pass against **published** bytes.
3. [ ] Re-publish the clone; account for the `149 → 148` node delta and the new versionId.
4. [ ] CRM resolver decision (company scoping vs grouping) — the standing hold.

### B. Recommended before promote
5. [ ] Retire or rebuild §CD-2/2b from a real parser output (§3).
6. [ ] Reclassify §IH-14 to blocked-by-design; cross-reference from the cap comment.
7. [ ] Retire `split-uac.py` / archive the monolith, or add an opt-in flag.
8. [ ] Add the dym carried-state fixture (cert review §4c) and make prior-state fixtures source from a real `get-session-vars` payload.

### C. 🔴 Immediately before the first write — live has drifted repeatedly
9. [ ] `export-workflows.py --verify` green, **including the fork** (now in the set).
10. [ ] **Re-run `oe-patch.py` against a freshly exported LIVE `output_exchange`.** Expect `applied C hunks: C1a, C1b, M2a, M2b, C2a, C2b, C1c`. On `ANCHOR FAIL` or a count mismatch, **stop** — live moved; re-derive anchors by reading the code, never by nudging until it passes (F-ANCHOR).
11. [ ] Re-assert the dym baselines (`live-bso.js`, `live-ccs.js`, `live-ec.js`, `crossdomain-compose.js`) against current live. **Any drift ⇒ stop**; every byte-identity gate is void until rebaselined.
12. [ ] Re-run every suite (dym, IH, cert) against the refreshed export.
13. [ ] Both live workflows: draft == active (LESSONS §23/§24). Assume a foreign draft until proven otherwise; stage any as its own no-op publish (§51).
14. [ ] Back up both live `versionId`s and the pre-change bodies: spine `build-suggest-offer`, `compile-current-state`, `escalate-catalog`, `disallowed-entity-gate`; parser `output_exchange`.

### D. STEP 1 — parser `XTODTw-dJcV0uRdC056hG` (B2′ + M2 + C1 + C2)
15. [ ] Body = `oe-patch.py <fresh live output_exchange> <target>` — **LIVE + own hunks, never a fork copy.** The fork is stale by the `resource_attachment` hunk; I verified the tool keeps live's version and that copying the fork would regress it.
16. [ ] Byte-gate: update draft → re-fetch → assert draft == generated file → **publish only on match** → re-fetch and assert active == file.
17. [ ] **ABORT GATE — if step 16 does not publish cleanly, stop. Do not promote the spine.** The spine's dym change without B2′+M2 is a known false-annotation path.
18. [ ] Confirm `versionId == activeVersionId` on `XTODTw`, and one live turn showing eviction (`carried_attachment_evicted`) or a correct answer on the reported case.

### E. STEP 2 — spine `9qVyfUxmRQqrpGRMDLRuz` (dym-probe + B1 + C3)
19. [ ] **Modified (4), each LIVE body + reviewed hunks only** (LESSONS §57), trailing whitespace stripped (§58b): `build-suggest-offer` (dym hunks incl. `return hb - ha;` no tiebreak, the require-specific block with **no reordering**, C3's multi-token suffix with **no sort**, and the corrected 12-key `_DYM_CTRL_KEYS`); `compile-current-state` (partial-lane annotation, **keep `let output = {}`**); `escalate-catalog` (rev-6 preference order); `disallowed-entity-gate` (B1's single additive block).
20. [ ] **Added (8):** the four D1 nodes and four partial-lane nodes. Transform bodies **byte-identical**; annotate bodies identical except `_PAYLOAD_SRC`/`_XF_SRC`.
21. [ ] 🔴 **Both probes → `Fss5aAaXthJSWpZCgKiKR`**, not `rysSPgUssLDf6xJc` (dym review §10: both subs forward scope from `semantic_input`; my earlier reversal was withdrawn). Re-diff the two subs first and confirm the only delta is still the fork's extra lines.
22. [ ] Do **not** copy `is_test` or any clone-only leaf into `workflowInputs`; re-derive from the **live** `sibling-probe` (LESSONS §48).
23. [ ] **Edges — remove 2, add 12:** remove `sibling-gate[1] -> build-suggest-offer` and `central-exchange[0] -> compile-current-state`; add the six D1 and six partial edges. Verify after: `build-suggest-offer` inbound **4**, `compile-current-state` **5**, `Aggregate1` **`If6[1]` only**.
24. [ ] Byte-gate every node; abort on mismatch; never force.
25. [ ] Re-run `parity.js` against the promote-target `build-suggest-offer` body before publishing it.

### F. Post-promote
26. [ ] **Non-enabled-domain D1 miss byte-identical** — the F-STRIP gate; highest blast radius.
27. [ ] Answered turn with no dym set byte-identical.
28. [ ] The headline cert case end-to-end (B1 + B2′ + dym in one turn); code pick and numbered pick both return the right product's certificates.
29. [ ] Each dym surface: D1, partial, **require-specific picker as rendered to the customer**, multi-token D1 annotated without renumbering, F-DUPE bare with `dym_excluded_codes`.
30. [ ] A stuck-hint turn recovers (the six-turn `M2399` shape) and `_ceUnknownHints` is empty or explicable.
31. [ ] No control keys in a real `conversation-variables` PUT payload.
32. [ ] Watch a day: all-negative annotation rate per domain, `dym_excluded_codes` / `dym_capped_codes` / `carried_attachment_evicted` volumes, probe error rate.
33. [ ] Re-run `export-workflows.py`; commit refreshed exports **and a `MANIFEST.json` snapshot**.

### G. File separately
- **Resolver cross-company leak** — `entity_resolver.py`'s raw `text()` tiers unscoped; `company_sql_predicate` exists and is unused there. The standing hold.
- **Repo-wide entity-hint validation** — C2 fixes one writer; nothing validates the hint field anywhere (already filed as D2).
- Hardcoded `space_id: "364817"` across 8 live nodes; digit-on-merged-offer escalation; `dym_excluded_codes` naming; bare-code domain carry.

## 6. Close

The four fixes are right, and C1's diagnosis — a domain name in the hint field getting a private
axis from `|| \`__${hint}\`` — is the best root-causing in this programme. But the finding that
matters most for how this team works is the one in §2: **the gate built to catch exactly F-STRIP
reported green because it was holding an older, self-consistent pair of bodies.** Not a wrong
assertion — a right assertion pointed at the wrong artifact.

That is the same lesson as my own withdrawn reversal, one level up: a check is only as good as
the artifact it reads. `parity.js` was required to read the export and is the only dym suite whose
green means anything today. Make every suite do that, and this class closes for good.

The user finding a class defect by eyeballing the chat console, after seven revisions of gates,
is worth sitting with. The multi-token exclusion was scoped out as a rare edge case and became
the permanent state; every test ran the one shape where annotation reliably appears. **Neither
was a testing failure — both were fixture-population failures.** The fix is not more assertions.
It is fixtures drawn from real traffic and real session state.

---
---

# 7. REV 3 — ✅ **APPROVE**. Final gate cleared.

| | |
|---|---|
| clone | `txiPzSxy3Pclsz6v` @ **`879d0f68`** — rollback `5fdd12df` |
| parser fork | `wI5RkNGW3EOJfBdo` @ `184882c1` — unchanged, rev 3 is clone-only |
| live | spine `f9205b03` / parser `8a813ddc` — **untouched** |

Both blockers are genuinely fixed. Everything else in §§1–5 stands. **§8 is the consolidated
promote checklist for all seven pieces** and supersedes §5.

## 7.1 F-STRIP — fixed, verified with the check that caught it

The strip list is now **exactly symmetric** with what is emitted:

```
dym-transform emits: 12 | dym-annotate adds: 2 | strip list: 14
NOT stripped:                none ✅
stripped-but-never-emitted:  none ✅
```

No gaps and no dead entries — the second half matters too, since a stale entry is how a list
drifts out of meaning. The comment now carries the forward rule (*"ANY new dym-transform output
key must be added here in the same commit that introduces it"*), which is the durable form.

**A note against myself:** my first re-check reported both keys still missing. That was a false
positive — my extraction regex matched the apostrophe in *"this node's output"* inside the new
comment and truncated the array. I read the actual block before reporting, and it was correct.
Recording it because it is the same lesson as my withdrawn F-SUB reversal: **a parser over an
artifact is not the artifact**, and the cost of confirming directly was one `sed`.

Also correct: the coder re-derived rather than assuming symmetry, and confirmed
`build-suggest-offer._DYM_CTRL_KEYS` is the **only** strip list needed — the partial lane needs
none because `compile-current-state` builds a fresh literal. That is the F-CCS-STRIP invariant
being used as designed rather than duplicated defensively.

## 7.2 F-STALE — fixed structurally, and the fix proved the diagnosis

`node-source.js` loads bodies from `export/` and re-verifies each against the export's own
`MANIFEST.json` sha256, `exit(2)` if the export is missing; the eight stale copies are deleted;
`mutate.sh` stages a scratch copy behind `OFFLINE_NODES_DIR` with a banner stating the run
certifies nothing about published bytes. That is the right shape — it removes the failure mode
rather than detecting it.

**The verdict table is the vindication of the diagnosis, and it should be kept in the record:**

| suite | stale copies | published `a2422bb9` | now |
|---|---|---|---|
| `byteid.js` | ALL PASS | **11 FAILURES** | ALL PASS |
| `harness.js` | ALL PASS | **8 FAILURES** | ALL PASS |

Nineteen assertions were red the instant the suites were aimed at the real bodies, and eleven of
them were F-STRIP itself. The gates were never wrong; they were pointed at the wrong artifact.

**`parity.js`'s one local read is the detail worth keeping.** It was the suite I required to
source from the export, and it did — except for `crossdomain-compose.js`. A single exception
inside the one sound suite is exactly how this class survives, and it is a good argument for the
rule being *mechanical* (`node-source.js` for every body, no exceptions) rather than
*remembered*.

I re-ran everything against the published `879d0f68` bodies myself: dym `parity` / `harness` /
`byteid` / `ccs-harness` **ALL PASS**; IH `ih-probe` 16/16, `c3-probe` 78/78; cert
`oe-byte-identity`, `oe-probe` 11/11, `byte-identity` (1 expected differing case),
`probe.js gate.after.js` 8 cases 0 unexpected. And the three live baselines
(`live-bso.js`, `live-ccs.js`, `live-ec.js`) still match live at `f9205b03`.

## 7.3 Invert rather than delete — **right call**

Deleting an obsolete assertion removes coverage *silently*: the diff shows a removal, and no
future reader can tell whether it went because it became wrong or because it was inconvenient.
Inverting keeps the **subject** under test — "does the multi-token lane annotate?" — and makes
the change reviewable, because a reader sees an expectation flip and can check that C3 is why.

It also matters specifically here: those four assertions were the only ones asserting anything
about multi-token annotation. Deleting them would have left that lane with **no** assertion on
the exact property C3 just changed — which is precisely how the four-surface gap arose in the
first place. The added assertion that the D1 lane is still labelled `d1` is the correct
complement: it pins what must *not* move while the annotation behaviour does.

The coder's rev-1 call was defensible while the suite read frozen copies, and their revision of
it is right: **four permanently-red assertions in a live-sourced suite would mask the next real
red.** A suite with known-red entries trains readers to skim, which is worse than either option.

One requirement so this stays reviewable: each inverted expectation should **cite C3 in a
comment**, so a future reader does not have to reconstruct why it flipped.

## 7.4 `get-presigned-url` — resolved, and it invalidates nothing

Recovering it from `workflow_history` was the right move, and the answer is cleaner than the
question assumed. From the exports:

| | live | clone |
|---|---|---|
| `get-presigned-url` | **present** | absent |
| `Loop Over Items1[1] →` | `get-presigned-url` | **`Switch`** (rewired, not dangling) |
| `presign-fail-notice` inbound | **none** | **none** |
| `send-message-files` inbound | 1 | **0** |

**(1) Non-propagation — confirmed, structurally.** The promote builds from live + reviewed
hunks, and neither `get-presigned-url` nor `Loop Over Items1` is among the 4 modified or 8 added
nodes. The deletion cannot propagate. Explicit post-promote assertion added to the checklist
anyway (§8 F35) — "cannot" plus "verified" is the standard this bundle has been held to
throughout.

**(2) The dangling by-name reference is inert, and no evidence is affected.** Two independent
reasons, both verified rather than argued:

- `presign-fail-notice` has **zero inbound edges on both live and clone** — it is an orphan in
  both. Its `$('get-presigned-url')` can never execute on the clone because the node holding it
  is itself unreachable.
- **Attachment delivery was already unreachable on the clone by design**: `send-message-files`
  has 0 inbound, as one of the five deliberately orphaned egress nodes, and has for this entire
  programme. The clone could never deliver an attachment to a customer, so **no fixture in this
  cycle could have depended on attachment delivery**, before or after 08:21. The removal cannot
  have invalidated attachment-returning evidence because no such evidence was producible.

The annotation, eviction and hint-axis evidence all terminate at text rendering and never touch
that path. **No re-runs required.**

Worth stating plainly for the record: this was a **user edit to the test clone during a
production investigation**, not an agent error and not part of any change under review. The
clone is a test artifact and the user is entitled to edit it; the reason it surfaced as a
question at all is the node-count accounting discipline, which is working.

## 7.5 The rest of rev 3

`split-uac.py` retired with a tombstone and recorded reasoning; §IH-14 reclassified
blocked-by-design; the stale "fork not in the export set" warnings corrected in three places;
LESSONS §64 added on deriving prior-state fixtures from a real `get-session-vars` payload — the
lesson that came out of the M2 negative control. All as ruled. Nothing outstanding.

---

# 8. CONSOLIDATED PROMOTE CHECKLIST — all seven pieces

**Bundle:** dym-probe · B1 · B2′ · M2 · C1 · C2 · C3
**Two publishes: parser FIRST, then spine.** The user promotes; nothing here is self-executing.

| artifact | id | source of promoted body | rollback to |
|---|---|---|---|
| live parser | `XTODTw-dJcV0uRdC056hG` | `oe-patch.py` on a **fresh live** `output_exchange` | **`8a813ddc`** |
| live spine | `9qVyfUxmRQqrpGRMDLRuz` | **live body + reviewed hunks** per node | **`f9205b03`** |
| clone (test only) | `txiPzSxy3Pclsz6v` @ `879d0f68` | — | `5fdd12df` |
| parser fork (test only) | `wI5RkNGW3EOJfBdo` @ `184882c1` | — | `95193323` |

### A. 🔴 Immediately before the first write — live has drifted repeatedly and none of it was ours
1. [ ] `export-workflows.py --verify` green on **all 8** exports.
2. [ ] **Re-run `oe-patch.py` against a freshly exported LIVE `output_exchange`.** Expect `applied C hunks: C1a, C1b, M2a, M2b, C2a, C2b, C1c`. On `ANCHOR FAIL` or a count mismatch, **STOP** — live moved. Re-derive anchors by reading the surrounding code; **never nudge numbers until it passes.**
3. [ ] Re-assert the live baselines (`live-bso.js`, `live-ccs.js`, `live-ec.js`, `crossdomain-compose.js`) against current live. **Any drift ⇒ STOP** — every byte-identity gate is void until rebaselined and re-run.
4. [ ] Re-run all suites against the refreshed export: dym (`parity`, `harness`, `byteid`, `ccs-harness`), IH (`ih-probe`, `c3-probe`), cert (`oe-byte-identity`, `oe-probe`, `byte-identity`, `probe.js gate.after.js`).
5. [ ] Both live workflows: `versionId == activeVersionId` (draft == active). **Assume a foreign draft until proven otherwise**; stage any as its own semantic-no-op publish first (LESSONS §51).
6. [ ] Record both live `versionId`s and back up the pre-change bodies: spine `build-suggest-offer`, `compile-current-state`, `escalate-catalog`, `disallowed-entity-gate`; parser `output_exchange`.
7. [ ] Record live's node count (**107**) and confirm `get-presigned-url` is present with `Loop Over Items1[1] → get-presigned-url` intact — the pre-state for §F35.

### B. STEP 1 — parser `XTODTw-dJcV0uRdC056hG` (B2′ + M2 + C1 + C2)
8. [ ] Body = `oe-patch.py <fresh live output_exchange> <target>`. **LIVE + own hunks — never a fork copy.** The fork is stale by the `resource_attachment` hunk; I verified the tool preserves live's version and that copying the fork would regress it.
9. [ ] `node --check` the generated body.
10. [ ] Byte-gate: update draft → re-fetch → **assert draft == generated file** → publish **only** on match → re-fetch and **assert active == file**.
11. [ ] 🔴 **ABORT GATE — if step 10 does not publish cleanly, STOP. Do not promote the spine.** The spine's dym change without B2′ + M2 is a known false-annotation path.
12. [ ] Confirm `versionId == activeVersionId` on `XTODTw`.
13. [ ] Smoke one live turn: a carried certificate is evicted (`carried_attachment_evicted` present) or the reported case answers correctly.

### C. STEP 2 — spine `9qVyfUxmRQqrpGRMDLRuz` (dym-probe + B1 + C3)
14. [ ] **Modified (4)** — each **LIVE body + reviewed hunks only** (LESSONS §57), trailing whitespace stripped (§58b):
     • `build-suggest-offer` — the **14-key** `_DYM_CTRL_KEYS`; `_dymOk/_dymHas/_dymProbed/_dymNoun`; D1 code-mode annotate/sort/render with **`return hb - ha;`** (no tiebreak); the require-specific `escalate_message` block with **no reordering**; C3's multi-token suffix with **no sort**; the C3 cap block.
     • `compile-current-state` — partial-lane annotation; **keep `let output = {}`** and its comment.
     • `escalate-catalog` — the preference order (`build-suggest-offer` → `not-found-error-message` → `annotate-incoming-picker`).
     • `disallowed-entity-gate` — B1's single additive block.
15. [ ] **Added (8):** `dym-transform`, `dym-gate`, `dym-probe`, `dym-annotate`, `dym-transform-partial`, `dym-gate-partial`, `dym-probe-partial`, `dym-annotate-partial`. Transform bodies **byte-identical**; annotate bodies identical **except** `_PAYLOAD_SRC`/`_XF_SRC`.
16. [ ] 🔴 **Both probes → `Fss5aAaXthJSWpZCgKiKR`**, NOT `rysSPgUssLDf6xJc`. (Both subs forward scope from `semantic_input`; my rev-2 reversal was withdrawn — see the dym review §10.) Re-diff the two subs first; the only delta should still be the fork's extra `out.contact_id`/`out.space_id` override lines.
17. [ ] Do **not** copy `is_test` or any clone-only leaf into `workflowInputs`; re-derive `contact_id` / `semantic_input` / `user_prompt` from the **live** `sibling-probe` (LESSONS §48).
18. [ ] **Edges — remove 2, add 12:** remove `sibling-gate[1] → build-suggest-offer` and `central-exchange[0] → compile-current-state`; add the six D1 and six partial-lane edges.
19. [ ] Re-run `parity.js` against the promote-target `build-suggest-offer` body **before** publishing it — invariant 1 is most likely to break at exactly this step.
20. [ ] Byte-gate every node individually: draft == file → publish → active == file. **Abort on any mismatch; never force.**
21. [ ] Assert both probes carry **no credential** and `onError == continueRegularOutput`, on node **TYPE** (LESSONS §47).

### D. Immediately after the spine publish — structural
22. [ ] `build-suggest-offer` inbound **exactly 4** (`annotate-incoming-picker`, `dym-annotate`, `dym-gate`, `sibling-probe`).
23. [ ] `compile-current-state` inbound **exactly 5**.
24. [ ] `Aggregate1` inbound **exactly `If6[1]`** — the check that proves the two lanes stayed disjoint.
25. [ ] Live node count **115** (107 + 8).

### E. Post-promote — verify each surface, not the happy path (LESSONS §56)
26. [ ] **Non-enabled-domain D1 miss byte-identical to pre-promote** — highest blast radius; this is the F-STRIP gate and the 14-key strip runs on most traffic.
27. [ ] **Answered turn with no dym set byte-identical** — `compile-current-state` is now on a new lane for every answered turn.
28. [ ] Surface 1 — enabled-domain D1 miss annotates; `suggest_quick_reply` bare codes, index-aligned with `suggest_last_result_set`.
29. [ ] Surface 2 — partial-resolution turn annotates.
30. [ ] Surface 3 — **require-specific picker annotates as rendered to the customer** (verify the message, not `build-suggest-offer`'s output object — this was the rev-6 defect).
31. [ ] Surface 4 — **multi-token D1 annotates without renumbering**: global contiguous `idx` preserved, `suggest_last_result_set` / `dym_candidates` untouched (C3).
32. [ ] F-DUPE turn renders **bare** with `dym_excluded_codes` populated, on both the D1 and picker lanes.
33. [ ] The cert headline case end-to-end (B1 + B2′ + dym in one turn); code pick and numbered pick both return the **right** product's certificates, no `PC 000078`.
34. [ ] A stuck-hint turn recovers (the six-turn `M2399` shape); `_ceUnknownHints` empty or explicable.
35. [ ] 🔴 **`get-presigned-url` non-propagation:** still present on live, `Loop Over Items1[1] → get-presigned-url` intact, `presign-fail-notice` unchanged. The clone's deletion was a user edit and must not reach live.
36. [ ] No control keys in a real `conversation-variables` PUT payload.
37. [ ] Exercise the `sibling-probe[0]` inbound to `build-suggest-offer` (§DP-12's long-standing untested half).
38. [ ] Watch a day: all-negative annotation rate per domain; `dym_excluded_codes` / `dym_capped_codes` / `carried_attachment_evicted` volumes; probe error rate (the Cloudflare 504s). **Near-100% all-negative means the probe broke, not that the catalogue emptied.**
39. [ ] Re-run `export-workflows.py`; commit refreshed exports **and a `MANIFEST.json` snapshot** per artifact.

### F. Rollback
40. [ ] Parser regression ⇒ `publish_workflow(XTODTw-dJcV0uRdC056hG, 8a813ddc)`. Spine regression ⇒ `publish_workflow(9qVyfUxmRQqrpGRMDLRuz, f9205b03)`. **Roll back the spine first** if both are suspect: the parser change is safe standalone, the spine change is not.

### G. File separately — do not bundle
- **Resolver cross-company leak** — `entity_resolver.py`'s raw `text()` tiers run unscoped (`do_orm_execute` short-circuits on `TextClause`); `company_sql_predicate` exists in-repo and is unused there. Root cause of F-DUPE, and plausibly a real contributor to the measured 67% dead-end rate.
- **Repo-wide entity-hint validation** — C2 fixes one writer; nothing validates the hint field anywhere (filed as D2).
- Hardcoded `space_id: "364817"` in 8 live nodes; digit-on-merged-offer silent escalation; `dym_excluded_codes` naming (it means excluded from *probing*); bare-code domain carry.

---

## 9. Close

**APPROVED.** Seven pieces, verified across eleven review passes. The change is sound and the
promote path is gated at every step where it can go wrong.

Two things from this last round are worth carrying forward more than the code. The
F-STALE fix produced **nineteen red assertions the moment the suites were aimed at the real
bodies** — the gates had been right all along and were reading the wrong artifact, which is the
same failure as my own withdrawn `Fss5aAa` reversal, and as my false positive on the strip list
in §7.1 that I caught only by reading the block directly. *A parser, a diff, or a frozen copy is
not the artifact.* `node-source.js` makes that mechanical for the suites, which is the only
version of this lesson that survives contact with a deadline.

And the defect that started this last stretch was found by a user looking at a chat console
after seven revisions of gates. Neither the multi-token exclusion nor the single-missed-token
fixture shape was a testing failure — both were **fixture-population** failures. LESSONS §64 now
records the counter-measure: fixtures drawn from real traffic and real session state, not
hand-built worlds. That is the highest-value artifact this programme produced.

**The user promotes. Nothing in this file executes anything.**
