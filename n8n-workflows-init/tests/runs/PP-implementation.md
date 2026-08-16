# Promotion picker — implementation + validation report (2026-08-09)

Plan: `plans/promotion-picker-plan.md` · UAC: `tests/uac/PP.md` · Baselines: `tests/runs/PP-0-baselines.md`
Tickets: GH #3 (baselines) #4–#10 (slices) #11 #12 (defects found while baselining)

**Built and validated end-to-end on the fork. NOTHING PROMOTED — promotion stays user-gated.**

| target | id | version |
|---|---|---|
| spine fork | `RnpxEnAV3g20MmKj` | `2574e2cb` (149 nodes, draft==active) |
| parser fork | `RJ326g9dwe3bTWyf` | `b2ebfdc3` |
| runner fork | `M5m6EYDLdSc0ofto` | webhook `zz-run-promo-picker` |
| clone (rebased + #11/#12 ported) | `txiPzSxy3Pclsz6v` | `13ac760a` |

Change surface, fork vs clone — **1 new node, 10 param diffs, nothing stray**:

```
NEW   promo-picker
DIFF  disallowed-entity-gate        S1
DIFF  If4                           S2a
DIFF  Call 'sub-get-results' + probe-incoming + sibling-probe
      + crossdomain-probe + dym-probe + dym-probe-partial     S2b (6 union sites)
DIFF  compile-current-state         S4 roster arm
DIFF  Call 'sub-query-reformulator' parser-fork pointer (not a feature change)
```

---

## The turn, as it now behaves (measured, not asserted)

| # | input | files sent | reply |
|---|---|---|---|
| 1 | "any promotion?" | 0 | *"A promotion enquiry can't be answered with a general search — please specify a product, promotion, category, or brand so I can look it up."* |
| 2 | "promotion for bathroom furniture" | **0** | *"I found 15 promotions. Reply with the number you want — for example "1", "1 and 2", or "all"."* + the numbered list with start/end dates |
| 3 | "1 and 2" | **2** | those two promotions only |
| 4 | "1,2" | 2 | same |
| 5 | "all" | **15** | all |
| 6 | "3" | 1 | that one |
| 7 | "99" | 0 | *"There are only 15 promotions in that list — please reply with a number between 1 and 15."* |
| 8 | "thanks" | 0 | no roster re-prompt |
| 9 | "mocha promotion" (1 hit) | **1** | file sent immediately — D2 preserved |

Before this change, turn 2 sent **all 15 PDFs in one WhatsApp message**, and turns 1–2 both cost an
access-level round-trip first.

## Regression — other domains and the shared roster

| case | result |
|---|---|
| `stock for SRTSH1040` | unchanged |
| `when is SRTSH1040 arriving` | unchanged, 1 file |
| `technical drawing for SRTSH1040` | dym offer intact, `selection_context = suggest_offer`, roster 3 |
| dym pick "1" on that offer | resolves to the **dym candidate** (`product_attachment`), not a promotion |

The promo roster arm in `compile-current-state` is deliberately **lowest precedence** — member,
suggest and cs rosters all still win a stray "2".

## Offline suites

```
tests/offline/notfound-dedup   6/6 GREEN    5/5 mutants caught
tests/offline/promo-picker    29/29 GREEN  10/10 mutants caught
```

Both reproduce RED before the fix, from fixtures captured verbatim from live executions.

---

## 🔴 Deviations from the plan — read these, they are not cosmetic

**1. Q14 ("re-call MCP with `promotion_ids`") is IMPOSSIBLE as written.**
`answers[]` from get-results carry **no uuid** — `last_result_set[].uuid` is `null` for every
promotion row (exec `11827379`). There are no ids to pass. Implemented instead as: the pick turn
re-runs the SAME scoped query and selects by position. Q14's actual requirement still holds —
nothing stale is reused and files are presigned at send time.

**2. A parser hunk was required that the plan never anticipated.**
A pick ("1 and 2") emits `reference_positions` with `entities: []` and `entity_op: 'reuse'`, but
nothing reinstates the scope — so S1's new gate saw a scope-less promotion ask and refused the pick
(exec `11827959`). The parser fork now reuses the previous turn's entities on a promotion positional
pick. Promotion-only, and only when the turn resolved no entity of its own.

**3. Q12 ("reuse `suggest_offer`, add no arm to `compile-current-state`") could not be fully kept.**
The parser's ALL handler gates on `selection_context === 'suggest_offer'`, and that value is derived
from `build-suggest-offer` **by name** — it never sees `promo-picker`. Without an arm, `"all"`
silently did nothing (measured: 0 files). An arm was added at **lowest precedence**; PP-8 covers the
blast radius.

**4. Matching attachments by NAME was wrong and would have shipped a silent defect.**
`answers[].title` is an LLM-normalised copy of the filename with punctuation stripped
(`PROMO_11052026 (2) OFFICE.pdf` → `PROMO_11052026 2 OFFICE.pdf`). Exact-name matching resolved only
**8 of 15** rows and sent nothing for the other 7. The lists are index-aligned; that is now the
contract, with a punctuation-insensitive name cross-check that RECORDS drift rather than silently
correcting it.

**5. S1 landed as a ONE-LINE change, not a new branch.**
`ALLOWS_EMPTY.promotion: true → false` routes a scope-less promotion ask into
`not-found-error-message`'s existing `needsScope` arm. No new rendering surface, which is what Q26
asked for.

**6. S2 introduced — and this fixed — a phantom access level.**
With the union sent by the spine and `q.access_levels` empty, the not-found suffix printed
*"no promotion for **End User**"* — a level that was never searched. The suffix now names a level
only when the customer actually named one.

## 🔴 NOT built / still open

- **S6 company-derived escalation routing.** When a brand token is present, routing already resolves
  correctly via `brandEnt`. When only a product is named, `brand` falls back to `sorento`, so a
  Mocha-only product's zero-result escalation still routes to `marketing_promotion_sorento`. The
  company data now exists on the resolver (`company_id`/`company_name`) but is not plumbed into
  `deriveRouting`. **GH #9 remains open.**
- **PP-0d — the zero-access-types branch is UNVERIFIED.** `CONTACT_NO_ACCESS` exercises
  `check-access`/`If5` (agent-level), a different gate. `If4`'s FALSE arm and
  `access-level-choice-message` were left wired precisely because that path could not be tested.
- **PP-0c** — no contact with exactly one access type was identified.
- **PP-7 quote-reply** — not exercised end-to-end. The parser prefers `referenced_result_set` and the
  roster now persists, so it should work, but "should" is not a test.

## §0 safety

Every run: egress rows were `would_log` / `would_write` / `would_send` (+ guarded
`send-message-files` on pick turns). No real WhatsApp send, no CRM write, no sub call resolving to a
live sub — the fork's 15 sub calls point at `ublq9nSlrpz63xan`, `t4QvrtrPnTwRU6br`,
`tWm5DYLxfypmVC1T`, `vUfFUDjLAuMaeQE6` and the parser fork only.

**S7 MEASURED** (runner exec `11829775`, snapshots read inside §0's 8-minute retention window — not
reconstructed after the fact):

```
S7b  prod  sorento-respond-message       0 -> 0     zero delta
S7a  sink  sorento-respond-message-TEST  860 -> 861 +1, the one expected save
```

S7a is the positive signal (the save landed in the unconsumed TEST sink, so it was not routed
elsewhere) and S7b the negative (prod ingest untouched). Per §0 the depth value is keyed by the LIST
NAME, which is why both read as `{"<list>": n}`.

---

# Addendum — chat console (2026-08-10)

## The console now drives the feature

`zz-dispatcher-test` (`2D0cw2Y1aPW2LOlU`) `call-spine` repointed
`txiPzSxy3Pclsz6v` → **`RnpxEnAV3g20MmKj`**.

**ROLLBACK:** set `call-spine.workflowId.value` back to `txiPzSxy3Pclsz6v`
(`sorento-consume-main TEST`). Dispatcher was at `4be6a9de` before the change.

Chain: `zz-chat-console` / `zz-chat` → `test:q:{contact}` + `ready-contacts-test` →
`zz-dispatcher-test` → `call-spine` → the fork.

## Mode — CORRECTED

`zz-chat` (the chat page) **hardcodes `mode: 'chat-stateful'`**, so the real console is stateful and
multi-turn already. Only `zz-chat-console` (the raw webhook) defaults to `uac` when the caller sends
no mode — that lane is single-turn.

⚠️ An earlier draft of this addendum said the console "must be driven in chat-stateful". That was
wrong and is retained here only so the correction is visible. The uac note below applies to the RAW
WEBHOOK, not to the page.

### The uac lane (raw webhook only) is single-turn

In the default `mode: "uac"` the console is **single-turn only**. Turn 2 read contact 437264483's
stale PROD CRM session and came back with `entities: ['CWC7601-S-RL']` and domain `incoming` —
a product from an unrelated conversation (`uac-mode-reads-prod-session`). `save-session-vars` is
orphaned by design, so turn 1's roster is never persisted for the uac lane to read.

`chat-stateful` routes state through `pg-get-session` / `pg-upsert-session` (`n8n_test`), and the
multi-turn flow then works. **A pick tested in `uac` mode will look broken and will not be the
feature's fault.**

## 🔴 Defect the console found that the runner lane could NOT

Picking `"3"` replied *"There is only 1 promotion in that list"* (exec `11871980`).

The parser resolves a pick into **entities as well as `reference_positions`**, so on the stateful
lane the re-query returns **already narrowed** to the picked promotion. Applying the positions again
double-filtered: 1 answer, position 3, out of range.

The runner lane never showed this because there the answer set stays unnarrowed — a genuine
instrument gap, not luck. Fixed with a pre-narrowed guard that distinguishes the two cases by
comparing set size to pick count rather than testing `max(position)`:

```
already narrowed : positions [3]  answers 1   -> 1 <= 1   pass through
genuine 99       : positions [99] answers 15  -> 15 > 1   filter + report out-of-range
```

Both have `max(position) > answers.length`, which is exactly why that test alone was not enough.

## Verified through the real console (`chat-stateful`)

| turn | attachments | reply |
|---|---|---|
| "promotion for bathroom furniture" | 0 | *"I found 15 promotions. Reply with the number you want…"* |
| "1 and 2" | 2 | those two |
| **"3"** | **1** | the DEALER pdf — row 3 of the list (exec `11872460`, `pre_narrowed: true`) |
| **"99"** | **0** | *"There are only 15 promotions in that list — please reply with a number between 1 and 15."* (exec `11872658`) |

Offline suite after the fix: **33/33 GREEN, 11/11 mutants caught** (M11 covers the pre-narrowed
guard). Fork now at `3a5cce23`.


## 🔴 Roster collapse — found by the user in the real console, fixed

Reported: 7 promotions listed, `"5"` returned row 5 correctly, then `"3"` returned **row 5 again**.
Second and later picks always repeated the first pick's file.

Reproduced (`pp-rep-*`):

```
T1  entities [SRTKS1235-Bl]     ->  7 answers  -> roster persisted 7
T2  entities [<the picked PDF>] ->  1 answer   -> roster persisted 1   <-- pick became the new scope
T3  entities [<same PDF>]       ->  1 answer   -> any number returns it
```

Two causes, both mine:

1. **The parser let the picked promotion become the new scope.** It resolves positions into the
   picked promotion's own entities; that narrowed the next query to one promotion.
2. **`promo-picker` stopped publishing a roster on pick turns**, so `compile-current-state` rebuilt
   `last_result_set` from the filtered answers and it collapsed to 1.

The `pre_narrowed` guard added earlier was **masking** this — it made the collapsed state look like a
legitimate already-narrowed pick.

Fixes: the parser now reuses the previous turn's **non-promotion** scope on every promotion pick
(not only when the turn resolved nothing), and `promo-picker` publishes the **full-list** roster on
pick turns as well as list turns.

Verified end-to-end in the console:

```
T1 list   scope=SRTKS1235-Bl  roster=7
T2 "5" -> SORENTO WORKSTATION KITCHEN SINK PROMO_19062026 OFFICE.pdf  (row 5)
T3 "3" -> SORENTO A3 FLYER_OFFICE USE_11062026.pdf                    (row 3)
T4 "1" -> UPDATED SORENTO A3 FLYER 2026 OFFICE_21072026.pdf           (row 1)
```

Scope and roster hold at `SRTKS1235-Bl` / 7 across every pick. Offline: **34/34 GREEN, 12/12 mutants**
(M12 covers the roster-on-pick-turn regression). Spine fork `7542f109`, parser fork `9096cfff`.

**Lesson worth keeping:** this is the third time on this task that a producer-side green hid a
customer-visible defect, and the second time a guard I added to fix one symptom masked a deeper one.
Repeat-interaction cases (pick, then pick again) were not in the UAC at all — §PP-6 only ever tested
a single pick.

---

# Addendum 2 — entitlement matrix, quote-reply, rosters, multi-company (2026-08-10)

Test contacts supplied by the user (reassigned to the Sorento company mid-session, which is why an
earlier run of PP-3c resolved nothing):

| contact | entitlement |
|---|---|
| `505044197` | no access levels, but entitled to `general_enquiries` |
| `505044090` | Sorento Office + Sorento Dealer |
| `505044028` | Mocha Office only |

## 🔒 PP-3c — entitlement isolation PROVEN

Same query (`"promotion for bathroom furniture"`), three contacts:

| contact | levels | promotions returned |
|---|---|---|
| 437264483 | all 7 | **15** — includes END USER ×3, CABANA ×4 |
| 505044090 | Sorento Office + Dealer | **8** — every row OFFICE or DEALER; **zero END USER, zero CABANA** |
| 505044028 | Mocha Office only | **0** |

The union passed by S2b never exceeds entitlement. This is the data-exposure case D1 exists to
prevent, and it is now demonstrated rather than argued.

## PP-0d — verified

`505044197` → *"You have no access levels configured to get promotions."* `If4`'s FALSE arm IS
reachable; leaving it wired was correct, and the plan's caution was justified.

## Q23 — built and working (both paths)

`disallowed-entity-gate` detects a stated level the contact does not hold and raises
`access_notice`; the empty intersection now falls back to full entitlement instead of sending `[]`
(which made the CRM return nothing and turned an entitlement problem into a generic "not found").

- **not-found path:** *"You don't have access to Sorento Dealer promotions — here's what you do
  have:"* followed by the miss text.
- **list path:** the notice leads the numbered list.

## #9 — multi-company routing PLUMBED

`disallowed-entity-gate` derives `company_team` from the RESOLVED entity's `company_name`
(the CRM stamps `company_id`/`company_name` on every match). `not-found-error-message` and
`escalate-catalog` prefer it over the parser's access-level guess, which was empty on an unqualified
turn and sent every promotion escalation to `marketing_promotion_sorento`.

Measured: `resolved_companies: ['mocha'] → marketing_promotion_mocha`,
`['sorento'] → marketing_promotion_sorento`.

**Only when UNAMBIGUOUS.** A mixed-company result set leaves `company_team` null rather than
collapsing to an arbitrary first match — the dedup-by-code failure shape.

## 🔴 #13 — UUID leaked to the customer (pre-existing on live), fixed

> "No promotion for **3b9d6b74-5d4a-4b9f-b2b6-110599485332**. Try: CBFAL5570, …"

`build-suggest-offer`'s UUID guard covered the CANDIDATES but never the SUBJECT, and a promotion's
`canonical_code` IS its uuid. Not part of the PP change set — PP's S1/S2 simply route promotion
queries into that path far more often. Fixed with a display-only `askedLabel`; `askedCode` is left
untouched because it is the dym-candidate-map linkage key (`for_raw`). Ported to the clone.

## 🔴 PP-7 — quote-reply FAILED, then fixed

Quote-replying an OLDER list and picking "2" returned the CURRENT list's #2.

Cause: **my own repeat-pick fix.** The parser resolves positions against `referenced_result_set`
correctly, but the scope-reuse hunk then overwrote `entities` with the previous turn's scope,
discarding that resolution and re-running the wrong query. Fixed: quote-reply wins — scope reuse
stands down whenever `referenced_result_set` is non-empty.

```
PP-7a  quoted R1#2 -> AUGUST … END USER.pdf                  PASS
PP-7c  referenced_result_set OMITTED -> different answer      PASS (instrument is real, not vacuous)
```

Repeat picks re-verified after the change: "5" → row 5, "3" → row 3, "1" → row 1. No regression.

## PP-8 — shared roster

- **PP-8a PASS** — member roster pending (`['Maryam Ariffin','Cyndi','Aisyah','Balqis','Niki','Nurain']`),
  `"2"` resolved to `preferred_assignee_id`, domain stayed `order`. The promo arm's lowest precedence held.
- **PP-8b PASS** — dym offer pending, `"1"` resolved to the dym candidate.
- **PP-8c NOT EXERCISED** — `"when is SRTSH1040 arriving"` returned a direct answer, so no sibling
  picker was ever pending. The stray `"2"` correctly stayed in `incoming`, but the intended scenario
  needs a product with siblings AND no incoming. **Do not record PP-8c as passed.**

## Live untouched — verified

`9qVyfUxmRQqrpGRMDLRuz` @ `d1b3f29e` (updatedAt 13:02, the container-status promote — before this
session's first write) and `XTODTw…` @ `bb875580` (13:16). Neither moved. Export diffs against
git HEAD are that promote, not this work.

Every run in this pass was egress-clean (`would_*` only).

---

# Addendum 3 — independent review + dispositions (2026-08-10)

`/code-review high` over `tests/diffs/promotion-picker.diff` (13 nodes). **11 findings, and the
review was right about the substance.** It reproduced several using this repo's own offline harness
rather than asserting them. I re-verified the two most damaging myself before acting.

Final state: spine fork `7c9f00e2`→ latest, parser fork `bdbbe9f1`.
Offline: **promo-picker 43/43 GREEN, 12/12 mutants** · **notfound-dedup 8/8, 5/5**.

| # | finding | disposition |
|---|---|---|
| 1 | parser scope-reuse fires on a promotion **dym** pick, discarding the choice | **FIXED** — gated on a dym offer actually PENDING in prior state |
| 2 | promo-picker re-applies positions regardless of roster provenance | **FIXED** — provenance replaces set arithmetic |
| 3 | pre-narrowed guard passes the WHOLE set through | **FIXED + reproduced**: "1, 2 and 7" on a 3-item list sent **all 3 files** |
| 4 | pre-narrowed exit publishes no roster/context — the branch `"all"` takes | **FIXED + reproduced**: `roster=false, ctx=undefined`; a 2nd `"all"` died |
| 5 | Q23 fired on EVERY domain → false "you don't have access" on a stock question | **FIXED** — requires promotion domain AND a real entitlement read |
| 6 | Q23 notice only on the list branch (2 of 5 exits) | **FIXED** — carried on every exit incl. the 1-promotion case |
| 7 | `company_team` changed the offer text only; the real escalation used parser routing | **FIXED** — `Call 'sub-human-intervention'` and `build-suggest-offer` now prefer it |
| 8 | removing prompt+carry makes `access_levels` empty ⇒ brand always `sorento` | **MITIGATED** by 7/#9; the company now comes from the resolved entity, not access levels |
| 9 | intersection case-SENSITIVE while the gate's held-check is case-insensitive | **FIXED** — both case-insensitive (6 sites) |
| 10 | promotion-NAME-scoped lists still collapse on a pick | **OPEN** — `_prevScope` filters out `hint === 'promotion'`; a list scoped by promotion name has no other scope to reuse |
| 11 | `compile-current-state` still persisted `access_levels` (half of plan S3) | **FIXED** — D4 now actually satisfied |

## 🔴 The fix for #1 broke everything, and the measurement caught it

My first attempt gated on `reference_target === 'dym'`. That value is the model's **default** — an
ordinary promo-roster pick also returns `'dym'` with `entities: []` and no dym set anywhere. Every
repeat pick started failing with *"can't be answered with a general search"*.

Re-gated on whether a dym offer was **pending in the previous state**
(`dym_last_result_set` / `dym_offer`). Re-verified both directions:

```
repeat picks   5 -> row 5,  3 -> row 3,  1 -> row 1        PASS
dym pick "1"   -> product_attachment, candidate carried     PASS
F3 live        "1, 2 and 99" on a 15-list -> 2 files        PASS
F5 live        "stock … for End User" -> no false notice    PASS
```

**This is the fourth time in this task that a plausible-looking discriminator was wrong and only
running it proved so.** The pattern is consistent: infer from a real signal (provenance, pending
state), never from shape or arithmetic that merely correlates.

## Still open after the review

- **#10** — promotion-name-scoped lists collapse on a pick. Real, narrow, and the same class as the
  bug the user found. Needs the roster's originating scope carried in state rather than reconstructed.
- **#9 / GH #9** — company routing is now correct where a company RESOLVES; nothing plumbs company
  into `deriveRouting` itself.
- **PP-8c** — never exercised; needs a product with siblings and no incoming.
- Reviewer's notes (not findings): `promo-picker` reads `j.answers` without the `.output` unwrap
  that `crossdomain-zeroset`/`central-exchange` apply — safe today, **fails open** (all PDFs sent)
  if the envelope shape ever changes. And position→file mapping trusts re-run ordering; the `loose`
  check compares `answers[i]` to `attachments[i]`, never against the persisted roster labels.

---

# Addendum 4 — the two "open" findings closed (2026-08-10)

## #9 was MIS-FILED, not open

`deriveRouting` runs inside the **parser**, which executes before `resolve-entity`. The resolved
company cannot exist at that point, so "plumb company into deriveRouting" is architecturally
impossible. The spine-side override already built — gate derives `company_team` from the resolved
entity, and `not-found-error-message` / `escalate-catalog` / `build-suggest-offer` /
`Call 'sub-human-intervention'` all prefer it — **is** the correct design. Closed as done-differently.

## F10 — CLOSED

Removed the `hint !== 'promotion'` filter from `_prevScope`. Safe because that same block is what
writes `entities` on a promotion pick, so persisted state always carries the ORIGINAL scope, never
the pick.

That surfaced a second, deeper bug immediately: with the scope reused, a promotion-name-scoped list
has **promotion-hinted scope entities**, which my provenance rule read as "the parser already
narrowed this" — so every pick passed the whole list through (`positions [2] -> matched 4, files 4`).

Fixed by trusting the parser's own provenance flag `_promo_pick_scope_reused` over the *shape* of
the entities.

```
promotion-name-scoped   pick 2 -> row 2,  pick 1 -> row 1,  pick 4 -> row 4   roster holds at 4
product-scoped          pick 5 -> row 5,  pick 3 -> row 3                     roster holds at 7
```

Offline: **46/46 GREEN, 12/12 mutants**.

⚠️ **I initially blamed re-run ORDERING for this** (the reviewer's standing note). The execution
data disproved it — both turns returned identical order. The fifth wrong discriminator in this task,
and again only the measurement settled it. The standing note about ordering remains untested and
therefore still open as a risk; it was simply not the cause here.

## Remaining genuinely open

- **PP-8c** — never exercised; needs a product with siblings and no incoming.
- Reviewer notes: `promo-picker` reads `j.answers` without the `.output` unwrap (fails OPEN — all
  PDFs — if the envelope shape changes); position→file mapping still trusts re-run ordering and does
  not validate against the persisted roster labels.


---

# Addendum 5 — PP-8c closed, on a corrected premise (2026-08-10)

Test product supplied by the user: `SRTBF11834` (siblings, no incoming).

Setup fires correctly: *"No incoming stock (ETA) for SRTBF11834. Try: SRTBF11833, SRTBF11838,
SRTBF11839. Reply with a code to continue"* — `ctx: suggest_offer`, roster 3.

| input | result |
|---|---|
| `"SRTBF11838"` (the CODE the message asks for) | resolves — `entities: ['SRTBF11838']`, domain `incoming`, file attached |
| `"2"` (a bare number) | `entities: []`, *"Could not find incoming"* — **identical on the CLONE** |

**PP-8c's original wording was wrong.** It asserted a bare number would resolve to the sibling. That
picker is **code-based, not numbered** — it says so in its own text. The number not resolving is
pre-existing, reproduced on the clone, unrelated to this bundle.

The assertion that actually matters — and passes — is isolation: a stray number on a sibling roster
is NOT hijacked by the promo picker; domain stays `incoming`.

WARNING — my first run of this case reported PASS on a broken assertion. The check was
`expected in reply OR domain == 'incoming'`, and the second clause is true on every incoming turn, so
it could not fail. Caught on re-read, not by the harness. Sixth instance in this task of a check that
cannot go red. Rule stands: assert the specific claim, never a disjunction containing an always-true
term.

---

# Addendum 6 — both reviewer notes hardened (2026-08-10)

Neither was a live defect; both were **fail-OPEN** risks — the failure mode was "send every PDF"
while looking like success.

## N1 — envelope shape

`crossdomain-zeroset` (our downstream neighbour) reads the item flat; `central-exchange` unwraps
`input.output`. `promo-picker` assumed flat. A wrapped envelope would have made `answers` undefined,
the node a no-op, and every attachment would have flowed on untouched.

Now: reads either shape (`j.output ?? j`) and writes back to whichever it read. If **neither** shape
is recognisable it **fails closed** — attachments suppressed with *"I found several promotions but
could not list them — please narrow your search."* — rather than dumping the lot.

## N2 — position→file mapping validated against the roster

Index-based selection assumed the re-run returns rows in the same order as the turn that built the
roster. Nothing guarantees that; a CRM ordering change would have sent the wrong file silently.

The parser now emits `_promo_pick_labels` — the labels from the roster the customer actually saw
(`referenced_result_set` on a quote-reply, else `last_result_set`) — and `promo-picker` resolves by
those labels, falling back to index only when every label still matches. Labels that have vanished
are **recorded** (`_promo_pick_label_miss`), never silently guessed.

## Gates

```
offline   52/52 GREEN   15/15 mutants
  M13 unknown shape falls through (fail-OPEN)      RED as required
  M14 wrapped envelope no longer unwrapped         RED as required
  M15 roster-label validation removed              RED as required
```

End-to-end, all egress-clean:

| lane | result |
|---|---|
| product-scoped, picks 5 / 3 / 1 | each returns its own row, roster holds at 7 |
| promotion-name-scoped, picks 2 / 4 | each returns its own row, roster holds at 4 |
| `"all"` on a 15-item list | 15 files |

Spine fork `72a0dada`, parser fork `1f784ae4`. Exports verified.

---

# Addendum 7 — two defects the user found in the live console (2026-08-10)

Both reported from a real console transcript, neither caught by 60 offline assertions or by any
end-to-end run in this session. Worth naming why: every promotion assertion I had written stopped
at the promotion list. Neither the list nor the pick was wrong — something ELSE was appended
underneath, and nothing asserted on the *whole* reply.

## 🔴 D-A / D-B — the answer offered itself back as "did you mean"

Reported:

- `6047 promo` → the right 10-promotion list, then `Couldn't find these: "6047" — did you mean:`
  followed by three promotions **that were already rows 7, 1 and 3 of the list above**.
- `all` on a "bathroom furniture" roster → 15 files sent correctly, then the same block for
  `"bathroom furniture"`.

**Root cause, from execution `11889275` (measured, not reasoned).** `resolve-entity` returns

```
resolutions[0] = { token: "6047", resolved: false, ambiguous: true,
                   matches: [15 promotions, every one match_tier "via_product"] }
```

`disallowed-entity-gate` then lifts all 15 into `compatible_entities` — that IS the answer the
customer was shown (`gate_debug.entities_count: 15`, `gate_passed: true`). Nothing writes
`resolved: true` back onto the resolution, and `via_product` is never `exact`, so
`compile-current-state`'s partial-miss block (dym-partial-disambiguation v3 §2.1) classifies the
answered scope token as a genuine miss.

**This is the FIFTH surface of one class.** The container-status fix already patched this exact
filter, by naming its mechanism (`resolved_by === 'document-class-narrowing'`). Per-mechanism
patches do not converge — a sixth promotion mechanism would need a sixth patch. The fix here names
the **outcome** instead:

> a token whose OWN candidates appear in `compatible_entities` was answered, not missed —
> whatever promoted them.

Keyed per token on that token's own `matches`/`alternatives`, so a genuine miss (which contributes
nothing to `compatible_entities`) is still surfaced, and an empty `compatible_entities` suppresses
nothing.

## #14 — the list did not say what it was a list OF

User: *"i am thinking it would be better if we can say prom found for xxx which is the product in
this case"*. `promo-picker` now echoes the scope in the intro:

```
I found 10 promotions for 6047. Reply with the number you want — for example "1", "1 and 2", or "all".
```

Echoes `entity.raw` — the customer's own words — never `canonical_code`: `6047` resolved to **two**
products (`SRTKS6047-NEW`, `SRTKS6047-BL-NEW`), so printing either would claim we searched
something they did not ask for. A promotion-NAME scope (Q25 permits one) yields a filename-length
raw, so the echo is **dropped past 60 chars rather than truncated** — half a promotion name reads
as a different promotion.

## Gates

| gate | result |
|---|---|
| `tests/offline/promo-scope-dym/probe.js before` | **5/14** — both defects reproduce against a frozen pre-fix body |
| `… probe.js` (after, byte-gated vs the published export) | **14/14** |
| `… mutate.sh` | **5/5** — incl. blanket-mute and empty-answer-set bounds |
| `tests/offline/promo-picker/probe.js` | **60/60** (was 52; +8 for the scope echo) |
| `… mutate.sh` | **19/19** (was 15; M16–M19 cover the echo) |

End-to-end through the chat console, 3 sessions / 7 turns, **zero** `Couldn't find these` on any
turn:

| turn | reply |
|---|---|
| `6047 promo` | 10 rows, intro `…for 6047.`, 0 attachments |
| `3` | row 3's file, 1 attachment |
| `1` | row 1's file — repeat pick still against the ORIGINAL list |
| `99` | *"There are only 10 promotions in that list…"* |
| `promotion for bathroom furniture` | 15 rows, intro `…for bathroom furniture.`, 0 attachments |
| `all` | 15 attachments |
| `stock for SRTKS6047-NEW and srtxx9999` | stock answered **and** `"srtxx9999" — not found.` — the partial-miss feature survives the fix |

**Egress (§0 S7b).** 74 consumer polls over the run window. Six non-zero, all at 02:46:00–02:46:35,
**before** my first turn at 02:47:19, and all attributed by payload to real production traffic on
other contacts (`482786754`, `477071887`; turn_ids `11890449`/`11890460`/`11890517`). Every poll
covering my own turns read `0`.

## What landed where

| workflow | node | versionId | rollback |
|---|---|---|---|
| fork `RnpxEnAV3g20MmKj` | `compile-current-state` + `promo-picker` | `10c771b1` | `72a0dada` |
| clone `txiPzSxy3Pclsz6v` | `compile-current-state` only (the general fix; the promo feature stays on the fork) | `1ab9a921` | `e5380d42` |

The clone hunk was lifted **verbatim from the proven fork body** and applied by anchor string, not
block-copied (LESSONS §57) — `diff -w` is 38 lines on both, identical to the fork's own diff.
Live spine untouched.

## Note for the next person, not fixed here

The `stock for … and srtxx9999` regression turn also surfaced `"bathroom furniture" — not found.`
— a promotion-scope entity **carried into an inventory turn** from a previous session on the same
contact. Pre-existing (`backlog-post-resolve-reconciliation`), unrelated to this fix, and it is the
partial-miss feature behaving correctly given a polluted entity set. Left alone deliberately.

---

# Addendum 8 — same defect, second resolver envelope (2026-08-10)

Reported immediately after Addendum 7 shipped, from the same conversation:

```
6047 promo            -> 10 rows, clean ✅
dealer version only   -> the correctly narrowed 4 DEALER rows
                         AND `Couldn't find these: "6047" — not found.`
```

Note the shape is DIFFERENT from D-A/D-B: a bare `— not found.` line with the
`Ask again with the correct code.` footer, i.e. **zero candidates**, so the Addendum-7 fix had
nothing to overlap on.

**Root cause (exec `11891721`).** `resolve-entity` returns two different envelopes and this turn
returned the other one. No `resolutions[]` at all — the legacy blob:

```
{ tokens: ["6047"], unresolved_tokens: ["6047"],
  intersection: [8 products, match_tier "brand_access_fallback", display.via_token: "6047"],
  alternatives: [], by_entity_type, empty, match_mode }
```

Those 8 became `compatible_entities` and answered the turn. The block's legacy arm
(`missResolutions = [r]`) fired, `tokenCandidates(r)` found nothing renderable, and the token that
*produced* the answer was printed as not-found underneath it.

`intersection` is the **third** place an answer set lives. `_tokenWasAnswered` now reads
`matches` + `alternatives` + `intersection`, so both envelopes are covered by the one predicate.

## Gates

| gate | result |
|---|---|
| `probe.js before` (frozen pre-fix body) | **8/19** |
| `probe.js` (after, byte-gated vs published export) | **19/19** — E1–E5 new |
| `mutate.sh` | **6/6** — N6 kills the `intersection` arm |

The drift gate earned itself immediately: editing `compile-current-state.after.js` before
publishing made `probe.js` refuse to run at all rather than report a green about an undeployed
body. Pre-publish iteration is now `PREPUBLISH=1`, which stamps a warning banner into the output so
a pasted result can never be mistaken for a deployed one.

End-to-end, the reported conversation replayed verbatim — `6047 promo` → `dealer version only` →
`3 4`. Zero `Couldn't find these` on all three turns; `3 4` returned rows 3 and 4 of the DEALER
list (2 files). **Egress:** 32 consumer polls covering 03:00:30–03:03:10, `LLEN 0` on every one,
zero non-empty pops.

| workflow | versionId | rollback |
|---|---|---|
| fork `RnpxEnAV3g20MmKj` | `6df4b171` | `10c771b1` |
| clone `txiPzSxy3Pclsz6v` | `d9c1ce32` | `1ab9a921` |

Live untouched (`d1b3f29e`).

## Open, flagged not built

Turn 2's intro reads `I found 4 promotions for 6047.` — truthful, but it does not reflect the
**dealer** narrowing the customer asked for. The parser did capture it
(`access_levels: ["Sorento Dealer","Mocha Dealer","Cabana Dealer"]`); the echo only reads
`entities[].raw`. Adding the level to the echo is a wording change and wording is user-gated.

## Cross-domain carry — axis fix REJECTED by the user, 2026-08-10

Repro: `6047 promo` → `check stock srtwc286-sh` returns stock for `SRTKS6047-NEW`/`-BL-NEW` as well
(exec `11893115`). The LLM emitted ONE entity; the executor's `replace_combine` arm carried the
prior one because eviction is by AXIS and the two landed on different axes
(`product`→`product_scope`, `promotion`→`promo_scope`; `inventory` is absent from `AXIS_BY_DOMAIN`
so both fall through to the flat default).

**Proposed:** filter `prior` by hint-validity in the NEW domain before the axis compare.
**REJECTED — do not re-propose.** It fires on every domain and every turn; the blast radius is not
worth it for this symptom.

**User's alternative, to explore instead:** the parser labels the bare token `6047` with
`hint: "promotion"`. If it were hinted `product`, the axes would MATCH in the inventory turn
(`product_scope` both sides) and the carry would evict itself — with no change outside the
promotion domain, because in `AXIS_BY_DOMAIN.promotion` `product` and `promotion` both map to
`promo_scope`, so the promotion turn is unaffected by construction.

⚠️ Verify before building: `hint` also drives RESOLUTION. Today `hint: "promotion"` makes
resolve-entity match by `promotion_membership` / `via_product`, which is what returned the 10 rows.
Evidence it would survive the change: `"promotion for bathroom furniture"` is hinted `category`
and resolves promotions correctly — so a non-promotion hint under a promotion domain does work.
That is supporting evidence, NOT proof for a bare product-code token. Prove it on a fixture first.

---

# Addendum 9 — list order (built) + Cabana routing (NOT ours) — 2026-08-10

## 🔴 #15 — the list was never sorted

The grill settled "no cap, **newest at top**" and nothing implemented it, so rows arrived in
whatever order the CRM returned. Measured (exec `11894212`, `promotion for SRTBF11834`): a promo
running to **2026-10-10** sat at position 3, beneath two flyers ending 2026-09-30.

Sort is now **latest END DATE first**, tiebreak latest start date, then the CRM's own order
(stable). Two things made this more than a `.sort()`:

1. **`attachments[i]` is index-paired with `answers[i]`** (7/7 and 15/15 on real runs). The
   permutation must be applied to BOTH or every pick sends a file belonging to a different
   promotion. Mutant **P3** exists solely to keep that honest.
2. **`env.response` is pre-rendered by the LLM in CRM order.** The existing `reintro` swaps only
   the leading paragraph and reuses that body — correct until the rows move. A reordered list now
   REBUILDS the body from the sorted rows, carrying the `Data last updated:` stamp across verbatim
   (mutant **P6**). Reusing the stale body would show one order while the roster addressed another:
   an off-by-N on which PDF is sent, invisible in the text.

Sorting happens BEFORE the positional filter, so the list turn and the pick turn see one order —
which also makes the roster stable against the CRM reordering between the two turns. That is
stronger than what we had, not just different.

### Gates

| gate | result |
|---|---|
| `promo-picker/probe.js` | **72/72** (was 60) |
| `mutate.sh` | **26/26** (was 19) — P1 no sort, P2 ascending, P3 unpaired files, P4 null dates float, P5 stale body, P6 stamp dropped, P7 tiebreak |

Seven pre-existing assertions had hardcoded CRM positions. They were **re-derived**, not repainted:
the probe now computes the expected order with its own independent implementation of the rule, so
if the node's sort and the test's ever disagree, the test fails.

Two of those "failures" turned out to be the harness, not the node: the sort splices `answers`/
`attachments` **in place** (deliberately — they alias `env.*`, which is what makes the sort visible
downstream), and `run()` was passing the caller's arrays through by reference, so the node permuted
the test's own expectation arrays underneath it. `run()` now deep-copies overrides at the boundary.

### End-to-end (`promotion for SRTBF11834`)

```
1. UPDATED SORENTO BATHROOM FURNITURE PROMO _10072026 OFFICE.pdf     (ends 2026-10-10)
…
4. UPDATED SORENTO A3 FLYER  2026 OFFICE_21072026.pdf                (ends 2026-09-30)
```

`1` → the 10-10 OFFICE file. `4` → the A3 FLYER OFFICE file — the row that was position **1**
before the sort, so the attachment permutation is proven at the customer boundary, not just in the
roster. Freshness stamp preserved.

**Egress:** 64 polls. Ten non-zero, every one attributed by payload to real production traffic on
three other contacts (`477071888`, `438930735`, `445239415`; stock queries, turn_ids `11895411`/
`11895586`/`11895514`/`11895724`). None on `437264483`, none promotion content. The same prod load
is why `resolve-entity-http` and `check-access-http` returned Cloudflare 504s on three attempts —
upstream CRM timeouts, not the change; `promo-picker` never ran on those.

fork `RnpxEnAV3g20MmKj` @ `138ed7bb` (rollback `6df4b171`). Clone unchanged (the picker is
fork-only). Live untouched.

## #16 — "Cabana product escalates to marketing_promotion_sorento" is a CRM DATA issue

Not a routing bug. `resolve-entity` returns, for `CBS212-WH` (exec `11894257`):

```
company_id: 00000000-0000-0000-0000-000000000001
company_name: "Sorento"
brand: null
```

The gate derived `resolved_company: sorento` → `company_team: marketing_promotion_sorento`
faithfully from that. n8n has nothing else to route on: the product carries **no brand** and its
company IS Sorento in the CRM.

So the question is upstream, and it is a definitional one before it is a data one:

- if **Cabana is a brand under the Sorento company**, the routing is arguably correct today and
  what is wanted is *brand*-level escalation routing — which needs `brand` populated on these
  products first (it is `null`), and then a brand→team map that does not exist yet;
- if **Cabana is its own company**, then `CBS212-WH`'s `company_id` is simply wrong and the fix is
  a CRM data correction, with no n8n change at all.

⚠️ Do NOT "fix" this in n8n by pattern-matching the `CBS` code prefix. That is exactly the
mistake recorded in [[spec-search-brand-and-placeholder-values]] — brand-from-code-prefix
mislabelled 1,934 rows.

---

# Addendum 10 — #16 brand routing: n8n half built, CRM half specified (2026-08-10)

User settled the model: **Cabana is a BRAND under the Sorento COMPANY**; Mocha is a separate
company. Rule: brand names a team → that team; otherwise fall back to company ("if not cabana,
then sorento for the brands").

## The `#9` block was wrong by construction

It names its variable `_brands` and reads `m.company_name`. Under this model `company_name` is only
ever "Sorento" or "Mocha" — Cabana never appears there — so the `cabana` arm of its `_VALID` list
was **unreachable code** and every Cabana enquiry routed to the Sorento team. The parser's own enum
was already correct (`marketing_promotion_<brand>`, allowed sorento|cabana|mocha); only the gate
keyed on company.

`disallowed-entity-gate` now takes brand first, company second.

## ⚠️ A claim I made earlier in this session was WRONG — withdrawn

I reported "no product resolution carries `brand` at all, 35 products across every match path".
That survey never looked at the `by_entity_type` pool. Corrected, over 123 rows in 8 executions:

| match path | rows | with `display.brand` |
|---|---|---|
| `brand_access` / `brand_access_fallback` | 8 | **8** |
| `product_code` exact\|and\|prefix\|substring | 52 | 0 |
| `promotion_membership` / `via_product` | 48 | 0 |
| `description` substring | 15 | 0 |

Brand IS emitted — but only when the resolver matched *via* brand access, never on a direct code
lookup. Two consequences the wrong survey would have hidden:

1. **The change is not fully inert.** On the brand-access path it now routes where it previously
   could not: fixture `11891721` moves `company_team` null → `marketing_promotion_sorento` (its
   rows carry brand SORENTO while `company_name` is null). Intended, and asserted explicitly.
2. **It does not fix CBS212-WH on its own.** That turn matched `product_code`/`and`, which carries
   no brand. Verified after publishing — the reply is still `marketing_promotion_sorento`. The CRM
   emitting brand on the product-code path is the load-bearing half.

The suite caught the wrong claim: a blanket INERT assertion went red on `11891721`. Rather than
relax it, the probe now **derives** the classification per fixture — no brand anywhere ⇒ must be
byte-identical; brand present ⇒ must equal the stated new value, with the old value printed. A
hand-relaxed assertion is how a suite stops noticing.

## Gates

| gate | result |
|---|---|
| `brand-routing/probe.js before` | **53/62** (B1/B2/B5/B6/B6b/B8 red) |
| `brand-routing/probe.js` (byte-gated vs export) | **62/62** — incl. 42 replaying real recorded gate output |
| `brand-routing/mutate.sh` | **7/7** |

Two mutants survived the first pass — both marked decorative assertions, both now fixed:
- **Q2** (unknown brand defaults to sorento instead of deferring to company) survived because the
  test used a Sorento-company product, where both answers coincide. Now asserted on a
  **Mocha**-company product, where defaulting misroutes (B8).
- **Q5** (mixed set collapsed to the first match) survived because only `company_team` was
  asserted; `resolved_company` is read downstream too and had no guard (B6b).

## Landed

fork `RnpxEnAV3g20MmKj` @ `b5889aae` (rollback `138ed7bb`). **Clone not touched** — its
`disallowed-entity-gate` has no `#9` block at all (that work is fork-only, like `promo-picker`).
Live untouched. Not promoted.

CRM-side ask written up for handoff: `plans/crm-ask-brand-on-product-resolution.md`.

---

# Addendum 11 — CRM landed brand; #16 closed end to end (2026-08-10)

`sorento-crm` PR #118 merged and blue/green deployed (run `31360309054`). Verified against a **live
envelope**, not the merge — the standing rule from the FastMCP episode, where a merged PR's markers
were absent from the running server:

```
exec 11909651 — CBS212-WH, match_field product_code, match_tier "and"
  company_name : "Sorento"
  display.brand: { brand_id: 9f1277f0…, brand_code: "CABANA", brand_name: "CABANA" }   ← NEW
  gate         : company_team = marketing_promotion_cabana, resolved_company = cabana
```

Customer boundary:

> No promotion for CBS212-WH. Try: CBS202-WH, CBS204-WH. Reply with a code to continue, or would
> you like me to escalate to **marketing_promotion_cabana** team?

## Regression sweep after the CRM change

The new field is now on many more rows, so the risk was the opposite of the original bug: a
Sorento-scoped list dragged off-team by a mixed-brand set.

| turn | brands seen | company_team | verdict |
|---|---|---|---|
| `promo for CBS212-WH` | product CABANA | `marketing_promotion_cabana` | fixed |
| `promotion for bathroom furniture` | promotion **null** | `marketing_promotion_sorento` | unchanged |
| `promo for SRTZZ0000` (not found) | none | `null` → parser routing | unchanged |

No regression — and the reason matters: **promotion rows still carry no brand**, so a mixed-brand
set cannot arise yet. That is CRM ask item 4, still open. The mixed-set guards (B6/B6b) are already
in place for the day it lands, and `R3` now pins the bathroom-furniture list so a future mixed set
surfaces in the suite rather than in production.

## Suite strengthened from synthetic to real

The brand cases were stamping a brand into a pre-deploy fixture. Two **post-deploy fixtures**
(`11909651`, `11909719`) are now captured verbatim and asserted as plain equality — they were
recorded under the new contract, so no before/after classification applies to them (the probe
branches on a `post_deploy` flag rather than being hand-relaxed).

| gate | result |
|---|---|
| `brand-routing/probe.js before` | **64/77** — R1/R2 red on the real envelope |
| `brand-routing/probe.js` (byte-gated vs export) | **77/77** |
| `brand-routing/mutate.sh` | **7/7** |

Nothing published this round — the n8n side was already live on the fork at `b5889aae`; only the
CRM half was missing. Live spine still untouched.

---

# Addendum 12 — the reply must not claim more than happened (2026-08-10)

Three reports, one theme: the promotion turn asserting things that are not true of what actually
ran. Two fixed, one diagnosed and NOT built.

## ✅ #17 — a multi-product promotion query never said which product it answered for

`promo for CBS212-WH & SRTBF11834` → 7 promotions, **every one SRTBF11834's**, under a heading
naming both. Stock already decomposes per product; promotions did not. The linkage was already on
the wire — every promotion match carries `display.products` (exec `11916611`: CBS212-WH → 1 product
match and **zero** promotion matches; SRTBF11834 → 9).

`promo-picker` now joins the promotions it is about to SHOW back to the products the customer
NAMED, and appends `No promotion found for CBS212-WH.` **Display-only** — `answers`, `attachments`
and the roster are untouched, so a bad join can mislead but can never send the wrong file. Skipped
below two named products (`A6`/`A7`): a single-product miss is the not-found path's job, and the
note there would contradict the list above it.

## ✅ #18 — an entitlement miss reported as a data miss

```
Here's what you want:
• promotion: SORENTO PP PROMO COMBINE_29072026.pdf
But no promotion matched these.
```

Names the promotion, then denies it. Measured (exec `11917052`): the resolver DID resolve it this
turn (`promotion_membership`/`via_product`), `is_active: true`, `products: ["SRTWB247"]` — no stale
carry; the contact's entitlement is `Aggregate.name = ["End User"]`; get-results applied it and the
Office-only promo came back empty. Every fact needed was already there; only the sentence was wrong.

Now:

> SORENTO PP PROMO COMBINE_29072026.pdf is not available at your access level (End User). Would you
> like me to escalate to marketing_promotion_sorento team?

Three bounds, because the new wording can lie in three ways: no promotion resolved ⇒ genuine data
miss, original wording (`B7`); promotion INACTIVE ⇒ "has ended", not withheld (`B8`); entitlement
unknown ⇒ do not invent a level (`B9`); and promotion-domain only (`B11`).

| gate | result |
|---|---|
| `promo-partial/probe.js before` | **9/18** |
| `promo-partial/probe.js` (byte-gated) | **18/18** |
| `promo-partial/mutate.sh` | **9/9** |

Three mutants survived the first pass. `T2` was a genuinely redundant guard; `S3` and `T5` were
decorative assertions — `S3`'s single-product case used a product that HAD promotions, so the guard
never bit (fixed by `A7`, one named product that matches none of the shown promotions), and nothing
exercised a non-promotion domain (fixed by `B11`).

End to end, both confirmed at the customer boundary. Egress: 39 prod-sink polls over the window,
`LLEN 0` on every one. fork `RnpxEnAV3g20MmKj` @ `f2d2f03c` (rollback `b5889aae`). Live untouched.

## 🔴 #19 — NOT BUILT: "cabana bathtub" returns four non-bathtub promotions

Reported twice. They are **two different faults**, and only one is ours.

**(a) Silent AND→OR relaxation.** `any promo for cabana bathtub` (exec `11917835`): the parser emits
TWO entities — brand `Cabana`, category `bathtub`, `match_mode: "and"`. The resolver reports

```
fallback_applied: true
fallback_reason : "AND-mode produced zero intersection; switched to OR-mode under the whitelist…"
```

i.e. **there are no Cabana bathtub promotions**, so it dropped a constraint and answered the brand
arm alone. The customer is told none of this, and the scope echo now actively claims the list is
"for Cabana, bathtub". `validator.relaxed_axis` is **null** — the field built to report exactly this
is not being populated on this path.

Fixable in n8n and the data is on the wire: when `fallback_applied === true`, say which constraint
was dropped ("No Cabana bathtub promotions — here are Cabana promotions"). Not built: it is a new
customer-facing sentence and wording is user-gated.

**(b) Over-permissive matching, and this one is upstream.** `any promo for cabana car` (exec
`11917989`): the parser collapses the phrase into ONE entity `{raw: "cabana car", hint: "category"}`,
NO fallback is applied, and the CRM returns 5 promotions — including
`SORENTO UPDATED CERAMIC SINK PROMO ALA-CARTE COMBO_30072026`, which is not even Cabana. A nonsense
category token matched five promotions at full confidence. n8n cannot tell that "car" is nonsense;
the scoring that let it match belongs to the CRM's promotion search.

Note which change surfaced both: the **scope echo**. "I found 5 promotions for cabana car" states
the claim out loud, so a wrong claim becomes visible. It was already wrong before — silently.

---

# Addendum 13 — #19(a) built: a broadened search says so and offers escalation (2026-08-10)

User: *"(a) will require escalation for escalation also ya, cause it is not resolved, we are
offering alternatives."* Correct — when the resolver drops a constraint, the customer's actual ask
went unanswered and the list is an alternatives offer.

## How the offer is armed — no new state

The parser detects an escalation confirmation by **fixed wording**:
`/would you like me to escalate/i` tested against `previous_conversation_state.response`. So
appending that exact sentence is sufficient for a following "yes" to escalate; nothing else to
wire. The parser's `_isPositionPick` guard already prevents a numbered pick being read as a decline,
so the picker and the offer coexist on the same turn.

## What was built

`promo-picker` now computes **unmet scope per token**, generalising the product-only join from #17:
for every token the customer named, did any promotion we are about to SHOW come from *that token's*
`resolutions[].matches` (or reach us through it via `display.products`)? A token that contributed
nothing was not answered.

Measured on exec `11917835` (`any promo for cabana bathtub`): token `Cabana` → 15 promotion matches;
token `bathtub` → **resolved TRUE to a product literally coded `BATHTUB`**, which has no promotions.
AND intersection empty → `fallback_applied: true`, OR-mode → the Cabana arm alone.

Three changes, one behaviour:

1. the **scope echo drops unmet tokens** — "I found 4 promotions for Cabana", not "for Cabana,
   bathtub". The headline must not state the thing the note below has to retract;
2. the note names what was dropped, and says the list is partial when `fallback_applied`;
3. the escalation offer, in the parser's fixed wording.

Live, on a split parse:

> I found 4 promotions for **Cabana**. …
> No promotion matches **bathtub** — the list above is for the rest of your search only. Would you
> like me to escalate to marketing_promotion_sorento team?

| gate | result |
|---|---|
| `promo-partial/probe.js before` | **15/29** |
| `promo-partial/probe.js` (byte-gated) | **29/29** |
| `promo-partial/mutate.sh` | **15/15** |

Bounds that matter: no unmet scope ⇒ **no** offer (`C8`) — an offer on a fully answered turn trains
the customer to say yes to a question we did not need to ask; and when NO token contributed it is a
total miss the not-found path owns, so no note and no offer (`C9`/`C10`).

Three mutants survived a pass and all three were **stale anchors** pointing at code this change
replaced — a silent no-op mutation reads as "assertion holds". Re-pointed. One of them (`S3`)
exposed that the `tokens.length < 2` guard had become genuinely redundant once the all-unmet
deferral existed; it was deleted rather than kept as decoration.

Egress: 60 prod-sink polls, six non-zero, all attributed to real traffic on other contacts
(`480184379`, `477071887` — incoming/stock). fork `RnpxEnAV3g20MmKj` @ `f76500ff`
(rollback `f2d2f03c`). Live untouched.

## ⚠️ Residual, and it is (b) not (a)

The FIRST live attempt did not fire, and the reason is worth recording: the parser is
**non-deterministic on this phrase**. Exec `11917835` split it into brand `Cabana` + category
`bathtub`; exec `11920606`, same words, collapsed it into ONE entity
`{raw: "cabana bathtub", hint: "category"}` — no second token, nothing to attribute, no
`fallback_applied`. Rephrasing to `any cabana promo for bathtub` split it again and the fix fired.

So on the merged parse the customer still gets 4 Cabana promotions for a nonsense category token,
with no note — which is exactly fault **(b)**: the CRM matching a category token it should not
match. (a) cannot cover it, because on that path the system genuinely believes one entity was asked
for and answered. **(b) remains open and is upstream.**

Also visible in the live reply: the team is `marketing_promotion_sorento` for an all-Cabana list,
because promotion rows still carry no `brand` — CRM ask item 4, still open.

---

# Addendum 14 — team fallback via the parser's brand; CRM match evidence filed (2026-08-10)

## ✅ #20 — brand the PARSER named, before company

User: *"you don't set marketing_promotion_cabana because there is no brand returned from promotion
and you fallback to company right, we should fallback to the brand identified by the parser first,
before falling back to company."* Exactly right — promotion rows carry no `brand` (CRM ask item 4),
and company is "Sorento" for every Cabana product **by definition** under this model, so an
all-Cabana list routed to the Sorento team even after #16.

`disallowed-entity-gate` team precedence is now: **row's own brand → brand the parser identified →
row's company**. Bounds asserted: the row's own brand still outranks a typed one (data beats what
was said); only a `hint: "brand"` entity counts; an unrecognised brand name falls through.

| gate | result |
|---|---|
| `brand-routing/probe.js before` | **80/81** (P1 red) |
| `brand-routing/probe.js` | **81/81** |
| `brand-routing/mutate.sh` | **10/10** |

fork `RnpxEnAV3g20MmKj` @ `5385b38d` (rollback `f76500ff`). Live untouched.

## 📄 CRM evidence filed — promotion `description` matching is unsound

`plans/crm-ask-promotion-description-match.md`. Two defects, both provable from the resolver's own
response:

1. **`match_tier: "and"` asserted where a query word is absent.** `"cabana bathtub"` → 15 rows,
   `bathtub` in **zero** descriptions, all tagged `and`. Proof it contributed nothing: the uuid set
   is **identical** to the set for the token `"Cabana"` alone (exec `11920606` vs `11917835`).
2. **Substring, not word-boundary, matching.** `"cabana car"` pulls in three
   `SORENTO … (ALA-CARTE & COMBO)` rows — `car` matched **`ALA-CARTE`**. Those rows contain neither
   `cabana` nor `car` as a word, so `and` is false on both counts, and a Cabana enquiry is answered
   partly with another brand's promotions.

Asked for: a truthful tier, word-boundary matching, and ideally **the unmatched words returned** —
that last one is what would let the bot say "no promotion matches bathtub" on the single-token path,
where today the resolver reports full confidence and n8n has nothing to go on.

Worth noting the contrast: on the SPLIT parse the resolver is honest — it reports
`fallback_applied: true` + `fallback_match_mode: "or"`. Only the single-token path misreports.

## 🔴 Gap remaining in #19(a), found from the user's `cabana kitchen tap promo`

Parser splits it (brand `Cabana` + category `kitchen tap`) and the answer is the **union**: Cabana
promotions PLUS `SORENTO NEW KITCHEN TAP PROMO`. Both tokens genuinely contribute rows, so
`_unmatchedProducts` is empty and **no note fires** — yet no single row satisfies both, which is
what was asked. #19(a) keys on per-token attribution; this case needs the wording driven off
`fallback_applied` itself. Not built.

---

# Addendum 15 — strict not-found (user decision, twice affirmed) + one-voice dedup (2026-08-11)

User overruled the "closest matches" shape after seeing it live: cross-brand rows and brand-only
rows read as unrelated noise. New rule — when the customer's actual COMBINATION has no satisfying
rows, say so and stop:

> No promotion found for cabana kitchen tap. Would you like me to escalate to
> marketing_promotion_cabana team?

**Which misses collapse to this:** DISJOINT (every token matched something, empty AND
intersection) and UNMET-WITH-BRAND-ONLY-MET (a token contributed nothing; everything that did is
the brand arm). **Which do not:** per-item decomposition between PRODUCT tokens (#17,
`CBS212-WH & SRTBF11834`) — user-designed, kept, verified live this run.

**Typo/multilingual safety (the user's stated worry):** a typo'd or foreign word never reaches the
strict miss as a resolved token — it fails resolution and rides trgm `alternatives[]` with
similarity evidence, or the parser canonicalizes upstream. Only cleanly-resolved tokens can
trigger the miss, so the false-not-found direction stays closed. CRM peer confirmed per-token
attribution is strong (multi-word tokens require ALL words); their category→products→promotions
walk is the structural fix for `shower head`-class queries and is gated on their user.

**One miss, one voice:** `compile-current-state`'s partial-miss block now skips tokens
`promo-picker` already reported (live repro: "cabana shower head promo" carried BOTH the picker
miss AND `Couldn't find these: "shower head" — not found.`). Guarded on node existence — byte-inert
on clone/live, which have no promo-picker.

**Not-found hygiene:** attachments stripped (probe C10 — the single-hit path otherwise sends a PDF
under a "not found"), roster cleared (a stray "1" must not pick an invisible row),
`response_intro` carries the miss.

| gate | result |
|---|---|
| `promo-partial/probe.js` | **36/36** (before: 17/36) · mutants **22/22** |
| `promo-scope-dym/probe.js` | **21/21** · mutants **8/8** |

**Structural fix for the stale-mutant class (4th incident):** both `mutate.sh` harnesses now
hard-fail any mutation that changes zero bytes — a mutant whose anchor is gone is a control that
cannot fail, and it now says so instead of passing.

E2E: kitchen tap / shower head / bathtub → plain miss, one voice, cabana team; `cabana taps` still
lists; CBS pair still decomposes; `any Cabana promotion` untouched. Egress: 70 polls, 6 non-zero,
all attributed to the user's own live cert-testing on 437264483 — none of this run's phrases.

fork `RnpxEnAV3g20MmKj` @ `a8b1f44d` (rollback `fdb07f60`). Live untouched.

---

# Addendum 16 — `token_coverage` wired: word-level unmet, failing word named (2026-08-11)

User's diagnosis was right in kind, sharper in fact: `cabana shower set promo` attached a
water-closet PDF because `set` substring-hit WATER CLO**SET** (exec `12005497`) — same class as
`car`→`ALA-CARTE`. The intersection was non-empty, so the disjoint detector correctly saw
"answered".

The fix was already on the wire: the CRM's `token_coverage` (PR #121) reported
`token "shower set" → unmatched_words: ["shower"]` on that very turn. Now consumed: a token whose
promotion coverage has unmatched words (and `truncated: false`) is **unmet at word level** →
strict not-found, with the failing word named (user: *"we will say like cannot find kitchin for
clarity"*):

> No promotion found for cabana shower set — could not find "shower". Would you like me to
> escalate to marketing_promotion_cabana team?

All four contract traps honoured and mutant-pinned: promotion entry absent = no claim (X3),
`truncated: true` never consumed (X2), field absent = fail-open (E9), words echoed as typed.

**The predicted typo trade mostly does not fire.** Live `kitchin tap promo`: coverage says
`unmatched: ["kitchin"]` but `truncated: true`, so the guard refuses the claim and the customer
gets the 4 kitchen-tap promos — the typo is *tolerated*, not dead-ended. When coverage is clean
(shower set), the miss is stated with the word named. Better equilibrium than designed.

| gate | result |
|---|---|
| `promo-partial/probe.js` | **45/45** (before: 21/45) · mutants **27/27** |

The zero-byte mutation guard caught three stale anchors on its first outing (W2/W5/W6 pointed at
code this change rewrote) — named loudly instead of passing. Re-pointed.

E2E: shower set → miss naming "shower"; `cabana water closet promo` → still answers with its file;
`kitchin tap promo` → tolerated. Egress: 40 polls, all zero. fork `4f2df612` (rollback `a8b1f44d`).
Live untouched.

---

# Addendum 17 — the cert-probe bug had THREE copies; the console used the unfixed one (2026-08-11)

User re-tested `MWC7604-RL CERT` after fixing live `sub-get-results` and still saw
`MWC7601-RL-S12 - has certificate` (its only attachment is a Technical-Specifications jpg).

Cause: the singular→plural `attachment_type` mapping existed in **three** copies of
`entity-ids-transformer`, and each surface uses a different one:

| sub | used by | state at the time |
|---|---|---|
| `Fss5aAaX…` (live) | live spine probes | ✅ fixed by the user |
| `rysSPgUssLDf6xJc` (TEST) | live's main read path | ✅ fixed 2026-08-10 (the "suspicious" edit) |
| **`t4QvrtrPnTwRU6br` (CS-BUILD)** | **ALL SIX of the console fork's get-results callers** (`Call 'sub-get-results'`, probe-incoming, sibling-probe, crossdomain-probe, dym-probe, dym-probe-partial) | 🔴 still singular |

The user's test ran through the console → fork → CS-BUILD → singular dropped by
`crm_master_product_attachments_list` (plural-only) → probe saw ALL attachments → TechSpec row
counted as "has certificate".

Fixed CS-BUILD (`4eb8ad78`, rollback `4070c23c`): `attachment_type → attachment_type_ids`, removed
the singular from `SCALAR_PARAMS` (plural takes a list), and **replaced the stale "SINGULAR, and it
is not a typo" comment** — true when written, wrong since CRM PR #120, and left in place it would
invite the next person to "fix" the plural back.

Verified: fork exec `12008340` — transformer sent `attachment_type_ids: [uuid]`, probe
`answer_count: 0`, all three candidates now "no certificate". S12's `dym_available_codes` empty.

Lesson (same family as §70): a comment asserting "not a typo" is a signal that outlives its truth —
when the contract it describes changes, the comment becomes the bug's bodyguard. And: a fix to a
FORKED node fixes one copy; grep the export set for the other copies before declaring it fixed
(`grep -rn "attachment_type_id'" export/*/nodes/entity-ids-transformer.js`).
