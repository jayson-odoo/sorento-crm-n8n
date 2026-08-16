# Review — `dym-probe-before-offer`

| | |
|---|---|
| **rev 2 verdict** | **REQUEST-CHANGES** — rev-1 items both satisfied; **two new required items** (F-DUPE, F-SUB-SCOPE). See §6. |
| rev 1 verdict | REQUEST-CHANGES (F-RANK, F-ATT) — **both now closed and verified by me** |
| clone | `txiPzSxy3Pclsz6v` @ **`78a72682`** (rev 2; was `9aa24cc9`), rollback `545210e7` |
| live spine | `f03086ac` — **untouched**, re-verified via `export-workflows.py --verify` in both rounds |
| zero egress | **RE-CONFIRMED for rev 2** (see §3 and §6.4) |
| reviewer | sorento-reviewer, 2026-08-07 |

> §§0–5 below are the rev-1 review, retained as the audit trail. **§6 is the rev-2 review and
> supersedes §4's checklist.** One rev-1 recommendation is **reversed** in §6.2 — the
> `dym-probe` promote target — on evidence that did not exist in round 1.

Everything below was re-derived from the export JSON, the published node bytes, the CRM
source, and the run log. Nothing is inherited from the plan, the coder, or the tester.

---

## 0. What I verified independently

- `export-workflows.py --verify` green on all 7 exports before reading anything.
- The offline suite runs the **real** bytes: `shasum -a256` of `build-suggest-offer.js`,
  `dym-transform.js`, `dym-annotate.js` == the clone export node bodies; `live-bso.js` ==
  the live export node body. `byteid.js` is therefore a genuine cross-file gate, not a
  same-file A/B. Both suites re-run by me: `harness.js` 60/60, `byteid.js` 10/10.
- Egress orphan set intact: `send-message-files/images/video`, `update-human-intervened`,
  `save-session-vars` all still **0 inbound** in the published clone JSON. Sink still
  `Call 'sub-respond-save-message-redis'2 -> tWm5DYLxfypmVC1T`.
- `build-suggest-offer` inbound == exactly 4 (`annotate-incoming-picker`, `dym-annotate`,
  `dym-gate`, `sibling-probe`); `sibling-gate[1]` now goes to `dym-transform`. §DP-12
  static assertion satisfied.
- `dym-probe.workflowId.value == rysSPgUssLDf6xJc`; the sub has 8 nodes and **no Redis
  node** and **no `is_test` input**.

---

## 1. Findings, most severe first

### F-RANK 🔴 REQUIRED — the has-first sort destroys resolver ordering. Confirmed, and the fix is one deletion.

`build-suggest-offer.js:312-316`:

```js
return (hb - ha) || String(a.m.canonical_code).localeCompare(String(b.m.canonical_code));
```

When **no** candidate has the thing, `ha === hb === 0` for every pair and the comparator
collapses to `localeCompare` — a full alphabetical re-sort of a list the resolver ordered
by similarity. This is not an edge case: it is the *majority* annotated outcome
(DP-R1, DP-R2, DP-P1 all all-negative; 5/5 live attachment probes returned zero rows).

I reproduced it on the published bytes with a resolver order that is not alphabetical:

```
resolver / LIVE order : IBWC8315-S , IBWC8315-SL , IBWC8315-S10-P
published (none have) : IBWC8315-S , IBWC8315-S10-P , IBWC8315-SL   ← reordered
```

**Ruling: genuine regression, blocks promote.** The annotation's value in the all-negative
case is the *labels* ("none of these have it"), not a re-rank; paying for it with the loss
of similarity ordering is a net loss, and it is not a product judgement call — nothing is
gained by the reorder.

**The fix is better than "sort only when ≥1 has": delete the `|| localeCompare` tiebreak.**
`Array.prototype.sort` is stable (V8 ≥ 7.0), so `(hb - ha)` alone is a *stable partition* —
it preserves resolver order both when nobody has the thing (all keys equal ⇒ no movement)
**and** within each group when some do. The "sort only when ≥1 has" variant still
alphabetizes within the has/no groups; the stable partition does not.

Verified on the published bytes with the tiebreak removed:

| fixture | published | with fix | live |
|---|---|---|---|
| none have | S, S10-P, SL | **S, SL, S10-P** | S, SL, S10-P |
| one has (SL, middle) | SL, S, S10-P | SL, S, S10-P | — |
| two have (S, S10-P) | S, S10-P, SL | S, S10-P, SL | — |

Has-first still works; only the spurious reordering goes away. Regression cost of the fix:
**`byteid.js` stays 10/10 green**, and exactly one `harness.js` assertion goes red —
`DP-2 order (alphabetical tiebreak)`, i.e. the assertion that encodes the bug.

**Also fix §DP-2, which is self-contradictory and licensed this behaviour.** It currently
says *"original API rank order preserved (sort is a no-op when every `has` is false, then
code-order tiebreak applies — assert the exact rendered order)"*. Those two clauses cannot
both hold. Delete the tiebreak parenthetical; assert resolver order.

### F-ATT 🔴 REQUIRED — `product_attachment` has never been observed to say "has". Ship it disabled, or land one confirmed positive.

The tester is right that the positive branch of `row_present_with_type` was never exercised
live. I went further and checked the CRM source, which **closes most of the gap** the tester
flagged — `sorento_crm_mcp/presenters.py`:

- `_product_attachments` calls `b.item(prod.get("product_code"), …)` — the item **title is
  the product code**, not the filename. `codeOf`'s title-first attribution is correct.
  (This was my main worry: a filename title would have produced confident false
  `— no certificate` on products that do have one. It does not.)
- Fields include `("Product Code", …)` and `("Attachment Type", _att_type(att))` —
  `dym-annotate`'s `/attachment\s*type/i` label match is correct.
- `_Builder.item` keeps only `_filled(val)` pairs, so an untyped attachment yields **no**
  `Attachment Type` field — exactly what layer 2 keys on.
- `catalog.py` confirms `crm_master_product_attachments_list` accepts `attachment_type_ids`,
  so F3 layer 1's narrowing is real, and `server.py`'s `TOOL_REQUIRED_NARROWING_FILTERS`
  gives it a **server-side** required-narrower guard (`product_ids`/`attachment_ids`/
  `certificate_ids`) — no `product_ids` ⇒ empty page, not a full-table read.

So the field contract is verified against primary source. What remains unverified is the
one thing source cannot answer: **that this path ever returns a row at all.** And that
matters because of F-EMPTY below — an empty answer set is scored `ok:true, answer_count:0`
and renders a confident `— no certificate` on *every* candidate. If the attachment probe
returns empty for a systemic reason, the feature tells customers "no certificate" for
products that have one, on the domain that is 16/35 of all offers. That is worse than
today's silence, because the customer stops asking.

We cannot distinguish "genuinely none" from "systemically empty" without one positive
observation, and we have zero. DP-R4's main-path cross-check is real corroboration but runs
the same tool through the same sub, so it proves consistency, not correctness.

**§DP-0a already wrote this rule: "FAIL ⇒ `product_attachment` ships DISABLED in
`DOMAIN_PROBE`; §DP-1..§DP-4 are then N/A, not skipped-green."** §DP-0b was never satisfied.
Applying the UAC's own gate:

**Either** (a) land one confirmed positive envelope — query the CRM directly for any product
holding an attachment with a non-null `attachment_type`, then run that token through the
clone and observe `— has certificate`; this is minutes of work and settles it decisively —
**or** (b) comment out the `product_attachment` entry in `DOMAIN_PROBE` and promote
`inventory` alone. `inventory` has a real observed positive (DP-P2: `answer_count 4`,
numeric quantities, `srtwc193` correctly `— has stock`, and DP-C6 proved the pick then
delivers the data). Option (b) ships the verified half now and costs one line to reverse.

I do not accept promoting attachment on offline evidence alone.

### F-EMPTY 🟡 note, not blocking — empty probe ⇒ confident all-negative

`dym-annotate` scores `answers: []` as `ok:true, answer_count:0` ⇒ every candidate rendered
`— no <noun>`. There is no distinction between "the read worked and nobody has it" and "the
read returned nothing because it was mis-scoped, denied, or soft-failed". This is inherent
to the design and I am **not** asking for it to be changed — suppressing annotation on empty
would delete most of the measured value, since "none of these have it" is precisely what
prevents the 67% dead-end. Flagging it because it is the mechanism that makes F-ATT matter,
and because it is the thing to watch post-promote: a sudden all-negative rate near 100% on
either domain means the probe broke, not that the catalogue emptied.

### F-SUB 🟠 promote-blocking as an *instruction*, not as a defect — the promote target needs correcting

My task said "`dym-probe` must target `Fss5aAaXthJSWpZCgKiKR`, not the clone's
`rysSPgUssLDf6xJc`". That is the right destination but the instruction is incomplete, and
the two subs are **not** interchangeable. From the exports:

```
LIVE spine:  Call 'sub-get-results' -> rysSPgUssLDf6xJc   (TEST fork)
             probe-incoming         -> rysSPgUssLDf6xJc   (TEST fork)
             sibling-probe          -> Fss5aAaXthJSWpZCgKiKR
             crossdomain-probe      -> Fss5aAaXthJSWpZCgKiKR
```

Live already runs a **split**: main read path + incoming probe on the fork, the two
sibling/cross-domain probes on the live sub. And the two subs differ — `diff` of
`entity-ids-transformer.js` is exactly two lines the **fork** has and the live sub lacks:

```js
out.contact_id = $input.first().json.contact_id.trim().toString()
out.space_id = "364817"
```

(`output-structurer.js` and `output_exchange.js` are identical; node-name sets and trigger
input schemas are identical.)

So promoting `dym-probe` onto `Fss5aAa` runs it against a sub variant **this change never
tested** — everything was tested on the fork, which sets those two params. `contact_id` and
`space_id` are accepted params on both tools per `catalog.py`, and `contact_id` is plausibly
the access-scoping key, so the omission could change which rows come back.

**Ruling: still target `Fss5aAaXthJSWpZCgKiKR`** — it matches the live *probe* precedent
(`sibling-probe`, `crossdomain-probe`), and wiring a new live node to a fork named "TEST"
would deepen the F6 anomaly rather than contain it. But gate it: `crossdomain-probe` already
calls **`crm_inventory_stock_balance_list`** through `Fss5aAa` on real production traffic
(promoted 2026-08-04, proven on real traffic), which is exactly the inventory tool and
exactly the sub — so the inventory half is covered by existing live evidence.
`crm_master_product_attachments_list` through `Fss5aAa` is **not** covered by anything,
which is an independent second reason to ship attachment disabled.

### F-MERGE 🟡 confirmed disjoint today, by coincidence — file separately, do not block

I confirmed the tester's disjointness claim from the JSON. `cs-offer-gate` requires **all
three**: `escalate-catalog.is_escalate_offer === true` **and**
`routing.suggested_team === 'customer_service'` **and**
`routing.suggested_agent === 'order_enquiries'`. Both enabled domains route elsewhere
(`purchasing_certification`, `warehouse` — observed in DP-C5 and DP-C1b), so g2 fails and a
merged dym+roster message cannot carry an annotation.

Two things worth stating precisely:

1. The change **does not** increase exposure. Numbering is gated on `_dymAnnotate`, which
   requires `dym-annotate` to have run, which requires an enabled domain — so merged
   messages keep today's prose render and do not newly invite digit replies.
2. This is a **routing coincidence, not a guard.** Nothing ties `DOMAIN_PROBE` membership to
   non-`customer_service` teams. Enabling `order` or `master_products` later would put an
   annotated *numbered* offer on the same message as the CS roster, where a digit silently
   escalates and assigns a real staff member (DP-C2b: `is_escalation_confirmation:true`,
   `preferred_assignee_id`, no bot text). On live that is an email/WhatsApp ripple triggered
   by a customer picking a product.

**Actions:** file the digit-hijack as its own issue (pre-existing —
`compile-current-state.js:76` vs `:191`); and add a hard note to the plan that **any new
`DOMAIN_PROBE` entry must be checked against `cs-offer-gate`'s team/agent pair** before
enabling. Not promote-blocking for this change.

### F-DRIFT 🟢 minor — the clone body is not live + hunks only

`diff live-bso.js build-suggest-offer.js` shows, besides the three functional hunks, two
gratuitous comment-banner edits (the `──` rules on the file header and on the "UUID leak
guard" banner) and a lost trailing newline at EOF. Inert, but per LESSONS §57 the promote
target must be **live + your own hunks**; don't carry these. See the checklist.

---

## 2. Rulings on the items raised

| # | item | ruling |
|---|---|---|
| 1 | F-RANK | **Regression. Blocks.** Fix = delete the `localeCompare` tiebreak (stable partition), not "sort only when ≥1 has". §DP-2 must be corrected too. See F-RANK. |
| 2 | attachment coverage gap | **Blocks attachment only.** Field contract now verified against CRM source; residual risk is the never-observed positive. Land one positive **or** ship `product_attachment` disabled. `inventory` is clear to go. See F-ATT. |
| 3 | §DP-FP-3 over-specified | **Agreed, narrow it.** A comma-free suffix cannot move the entry count — and `build-suggest-offer` strips commas anyway (`.replace(/,/g,'')`), so even a comma-bearing suffix could not. The entry-count clause is an instrument for pick-count/index drift, not for annotation leakage. Keep it as a §DP-11a assertion; remove it from §DP-FP-3's must-go-red set, which becomes the regex + the `—`/` has `/` no ` substring clauses. The tester's finding that it stayed green is correct and is exactly the "green that cannot fail" discipline working. |
| 4 | S7b partial | **Structural containment suffices here — accept.** Per LESSONS §45 and memory `s7-llen-gate-unsound`, the LLEN series on a shared fast-drained prod list is *not* the sound instrument, so its absence is not a real gap; the tester correctly declined to score it as proof. The sound argument is containment, and I re-verified it: the change adds 3 Code nodes and 1 `executeWorkflow`; `sub-get-results TEST` has 8 nodes and **no Redis node**; the only pusher in the graph remains the sinked fork to the literal unconsumed `sorento-respond-message-TEST`. S7a is the real evidence and it is strong: +1 per run across 23 runs with no gaps. |
| 5 | S5 exception | **Acceptable.** Confirmed from JSON: `sub-get-results TEST`'s trigger declares `tool`/`contact_id`/`user_prompt`/`entities`/`semantic_input` and no `is_test` — and neither does the live sub. `is_test` has no meaning for a read-only sub; containment is the target id, which I verified. Parity with `sibling-probe`/`probe-incoming`. |
| 6 | tier deviation | **Does not invalidate — it strengthens the run.** The deterministic tier cannot pin `resolve-entity` or the probe answers, so it would have left the largest unverified assumption (the real CRM envelope) untested; parser tier + real CRM **reads** is squarely inside the safety rule. Deterministic-tier byte-identity is supplied offline against sha-verified published bytes, which is a *stronger* instrument than an in-workflow run. Note the tester also improved on §DP's `regress-capture` prescription by driving `mode=uac` + `previous_conversation_state` through `sim-inject-gate`/`sim-inject-session` (both present in the JSON), which reads no prod session and writes no pg row — this sidesteps the `uac-mode-reads-prod-session` landmine entirely. Update §DP to describe this lane. |
| 7 | digit-on-merged-offer | **Disjointness is real; file separately.** See F-MERGE, including the plan note required before any future domain is enabled. |
| 8 | `.env` 403 | Confirmed a non-issue for this review — I did not need the REST API. All structural facts came from the verified exports. No time spent. |

---

## 3. Zero-egress re-confirmation

**Re-confirmed. No path in this change can reach a real contact or mutate prod.**

- **Egress nodes untouched.** No egress node was added, rewired, or structurally altered.
  The 5 orphans are still 0-inbound in the published JSON (re-counted by me from
  `connections`, not taken from the diff); the sinked save node still points at
  `tWm5DYLxfypmVC1T` → literal `sorento-respond-message-TEST`. The single edge removed
  (`sibling-gate[1] -> build-suggest-offer`) and the six added are all on the render path.
- **The only new external call is a read.** `dym-probe`'s `tool` is an expression sourced
  from `DOMAIN_PROBE[domain].tool`; the map holds exactly two values, both `_list` reads.
  No write tool is reachable without a code change. `crm_it_support_ticket_create` never
  appears. S4 PASS.
- **Resolved tools in the run log are read-only.** `crm_master_product_attachments_list`
  and `crm_inventory_stock_balance_list` only, confirmed in sub-exec runData.
- **F2a genuinely holds, and it matters.** `MAPPABLE` in `dym-transform` is an exact 13-key
  mirror of `TYPE_TO_PARAM` in `entity-ids-transformer.js` — I diffed them key by key.
  `category` and `brand` are in both domains' `allowed_lookup` but in neither map, so a
  brand-only or category-only candidate set is rejected with `no_candidate_uuid` and the
  probe never fires. The coder's deviation D5 is what makes this true; the plan's literal
  guard would not have. **And it is load-bearing:**
  `crm_inventory_stock_balance_list` is **absent** from
  `TOOL_REQUIRED_NARROWING_FILTERS` in `server.py`, i.e. it has *no* server-side narrower
  requirement — the n8n-side guard is the sole protection against the full-table read.
  (`crm_master_product_attachments_list` does have one, as a second layer.)
- **Fail-open verified on every degradation path.** `_dym_probe_input` sentinel, payload
  `error`, missing `answers`/`items`, unknown predicate, and `unscoped_probe` all set
  `ok:false ⇒ dym_available_codes: [] ⇒ today's un-annotated offer`. Detection is by payload
  shape, never node status. `onError: continueRegularOutput` with no `main[1]` to leave
  unwired — the LESSONS §61a trap is correctly avoided.
- **Not-found payload preserved.** The `_DYM_CTRL_KEYS` strip covers exactly the 10 keys the
  two new nodes append (8 from `dym-transform`, 2 from `dym-annotate`) and correctly does
  **not** include `dym_offer`/`dym_candidates`. Verified on a real turn by DP-R5 and by
  `byteid.js` across 10 fixtures.
- **Escalation turn produced no assignment.** DP-C2b's HI sub-exec ran exactly 4 nodes
  (trigger, chat?, test-guard, test-guard-record) — no Assign, no SLA POST, no PIC comment,
  no round-robin. Asserted from runData. The `preferred_assignee_id` seen is the *would-be*
  state read off the orphaned `save-session-vars` input (LESSONS §42), not a write.
- **Live spine `f03086ac` untouched**, verified at review start and unchanged.
- **§0 S1–S6, S8 PASS; S7a PASS; S7b accepted on structural containment** (see item 4).

---

## 4. PROMOTE CHECKLIST — do not execute until the two REQUIRED items land and are re-tested

Promotion is **user-gated**. This checklist authorizes nothing on its own.

**Pre-conditions**

1. [ ] **F-RANK fixed on the clone**: delete `|| String(a.m.canonical_code).localeCompare(String(b.m.canonical_code))` from `build-suggest-offer.js:315`. Re-run `harness.js` (update the one `DP-2 order` assertion to expect resolver order) and `byteid.js` (must stay 10/10). Amend §DP-2's tiebreak parenthetical.
2. [ ] **F-ATT resolved**: either one confirmed live positive attachment envelope (`— has certificate` rendered from a real row), or `product_attachment` commented out of `DOMAIN_PROBE` and §DP-1/2/3/4 marked N/A per §DP-0a.
3. [ ] Clone re-published; `versionId == activeVersionId`; `export-workflows.py` re-run and `--verify` green.
4. [ ] Tester re-runs the affected cases (at minimum DP-P1, DP-P2, DP-R1, DP-R5) against the new clone version and re-confirms §0.
5. [ ] §DP-FP-3 narrowed (item 3); §DP preamble updated to the `sim-inject` lane (item 6); plan gains the `cs-offer-gate` note (F-MERGE).

**Live-promote deltas** — target live spine `9qVyfUxmRQqrpGRMDLRuz`, by **node NAME**, never by clone node id.

6. [ ] **Backup first**: capture live `versionId` + the pre-change `build-suggest-offer` body. Rollback = `publish_workflow` the prior versionId.
7. [ ] **Confirm draft == active on live before touching it** (LESSONS §23/§24 revert-landmine). Abort if a foreign draft exists; stage it separately per §51.
8. [ ] **Node 1 — `build-suggest-offer` (changed).** Build the target as **LIVE body + the three reviewed hunks only** (LESSONS §57). Do **not** block-copy the clone body: drop the two cosmetic comment-banner edits and restore the EOF newline (F-DRIFT). Strip trailing whitespace before authoring (LESSONS §58b). The three hunks are: the `_DYM_CTRL_KEYS` strip, the `_dymOk`/`_dymHas`/`_dymProbed`/`_dymNoun` block, and the code-mode annotate/sort/render block.
9. [ ] **Nodes 2–5 — add `dym-transform`, `dym-gate`, `dym-probe`, `dym-annotate`.** Copy the clone bodies verbatim for the three Code nodes (they are new, so there is no live baseline to preserve).
10. [ ] **🔴 `dym-probe.workflowId.value` must be `Fss5aAaXthJSWpZCgKiKR`, NOT the clone's `rysSPgUssLDf6xJc`** (LESSONS §48b — a copied fork id repoints a live path at a harness artifact). Before promoting, re-diff `Fss5aAa` against `rysSPgUssLDf6xJc` and confirm the only delta is still the two `out.contact_id`/`out.space_id` lines (F-SUB). If `product_attachment` is enabled, this must be exercised against `Fss5aAa` first — `crm_master_product_attachments_list` has never run through it.
11. [ ] **Do not copy `is_test` or any clone-only leaf into the new nodes' `workflowInputs`** (LESSONS §48a). `dym-probe` passes no `is_test` by design; `contact_id`/`semantic_input`/`user_prompt` must be re-derived from the **live** `sibling-probe`, not the clone's.
12. [ ] **Edges on live**: remove `sibling-gate[1] -> build-suggest-offer`; add the six edges. Re-count `build-suggest-offer` inbound on live afterwards — must be exactly 4.
13. [ ] **Byte-gate each node**: update draft → re-fetch → assert draft body == intended file → publish only on match → re-fetch and assert active == file. Abort on any mismatch; do not force.
14. [ ] **`dym-probe` must carry no credential** and `onError` must be `continueRegularOutput`. Assert on node TYPE, not on a redacted credentials block (LESSONS §47).

**Post-promote verification** (LESSONS §56 — verify the path you changed, not the happy path)

15. [ ] Confirm a **non-enabled domain** D1 miss on live renders byte-identically (the `_DYM_CTRL_KEYS` strip is the single highest-blast-radius hunk — it runs on every non-enabled-domain turn, which is most traffic).
16. [ ] Confirm one **enabled-domain** D1 miss annotates, and that `suggest_quick_reply` is bare codes.
17. [ ] Watch the all-negative rate on both domains for the first day. Near-100% all-negative means the probe broke (F-EMPTY), not that the catalogue emptied.
18. [ ] Re-run `export-workflows.py` and commit the refreshed exports.

**Never**: edit the live spine mid-cycle; promote guard scaffolding (there is none in this
change — the four new nodes are business logic, not test scaffolding, and the clone carries
no `is_test` leaf on them); or promote `product_attachment` on offline evidence alone.

---

## 5. Credit where due

Three things in this cycle were done to the standard this repo keeps failing to hit, and
they are why the review could be short on re-derivation and long on rulings:

- The coder caught the plan's `dym-gate` FALSE-branch payload clobber (D1). That would have
  broken most of production traffic's not-found path, and the plan shipped it.
- The coder's D5 tightening is the only reason F2a actually holds; the plan's literal guard
  would have produced the unscoped inventory read, and I confirmed inventory has no
  server-side narrower to catch it.
- The tester mutated six gates and observed them RED before scoring, found one
  (§DP-FP-3) that **could not** go red, and said so instead of banking the green — and
  caught their own false-RED on DP-C1 rather than reporting it as a defect.

---
---

# 6. REV 2 REVIEW — clone `78a72682`

**Verdict: REQUEST-CHANGES.** Both rev-1 required items are genuinely closed. Two new
required items, one of which **reverses a rev-1 recommendation of mine**.

## 6.0 Rev-1 items — verified closed

- **F-RANK closed.** Published bytes now read `return hb - ha;` (line 319) with the
  tiebreak gone; the only surviving `localeCompare` is D3's at line 90, byte-identical to
  live. Live confirmation on a non-alphabetical fixture matches what I predicted offline.
  Suites re-run by me: `harness.js` 85/85, `byteid.js` 10/10.
- **F-ATT closed.** `mwc7625-sh-s11` (exec `11471806`) renders `— has certificate` with
  `answer_count: 6`, and §DP-0b is verified against a real envelope: title is a product
  code, `Attachment Type: "Certification"` on all six rows. This matches what I derived
  from `presenters.py` in round 1, so source and live now agree.
- **F-DRIFT closed.** `diff` live↔clone `build-suggest-offer` now shows zero comment-banner
  noise — the body is live + the three hunks, exactly.
- Offline files still sha-match the rev-2 clone export bodies and the live body, so
  `byteid.js` remains a genuine cross-file gate.

## 6.1 🔴 F-DUPE — REQUIRED. Blocking, and the proposed remedy is the wrong fix.

### The root cause is not what the run log says

The run log calls this "duplicate product rows in the CRM". It is not. From the CRM schema,
`app/models/product.py:182`:

```python
Index("uq_products_company_product_code", "company_id", "product_code", unique=True)
```

`product_code` is unique **per company**, not globally. So the same code under two UUIDs is
not a data-entry duplicate — it is, by schema invariant, **two different companies'
products**. "Fix the duplicate rows in the CRM" is therefore not an available remedy; there
is nothing malformed to clean up.

### Why one UUID returns zero rows

Both probe tools are company-scoped. From `sorento_crm_mcp/tests/test_company_scope_params.py`
(AC-F7): *"Company-scoped tools MUST declare `contact_id` + `space_id` as forwardable params
so n8n can scope owned data to the calling contact's company/companies"* — and
`crm_master_product_attachments_list` and `crm_inventory_stock_balance_list` are both in
`SCOPED_TOOLS`. The fork `rysSPgUssLDf6xJc` sets `out.contact_id` and
`out.space_id = "364817"`, and `MCP Client1` passes `jsonInput: "={{ $json }}"` — the
transformer output **is** the tool argument set. So the probe is company-scoped and the
twin UUID, belonging to another company, correctly returns nothing.

The `— no certificate` is therefore not a lie about the customer's product. It is a true
statement about **a different company's product that shares the code string**, rendered on
a line the customer reads as their own product. The defect is that `tokenCandidates()`
collapses two companies into one rendered line and then lets arrival order decide which
company that line represents.

### (a) Promote-blocking? Yes — for both domains.

Agreed with the coordinator's read, and for the reason stated: the change converts a
question into a confident assertion, and the assertion is decided by a coin-flip on
resolver arrival order. That is the plan's own F1 criterion, and the same class as the
filename-title hazard caught in round 1. The tester reproduced it in `inventory`, so it is
not attachment-specific and there is no per-domain split available (answering (c): no,
posture is the same for both — F-DUPE blocks both, unlike F-ATT which was attachment-only).

### (b) The UUID-union is the wrong fix. Two failure modes, one of them fatal.

**b1 — Probe/pick divergence. This is the fatal one, and it is not recoverable.**
I traced the pick path: `output_exchange.js` `applyDymPick` builds

```js
const _picked = { raw: _hit.code, hint: …, canonical_code: _hit.code, uuid: _hit.uuid || null, … };
```

where `_hit` is a single entry from `dym_candidates` carrying **one** UUID. So the union
would answer has/no over a *set* of UUIDs while the follow-through query resolves to
*one* — the arbitrarily-kept one. Result: "— has certificate" → customer picks → the query
runs against the empty twin → "no certificate matched these". A dead-end **with an added
false promise**, which is strictly worse than the silent dead-end this change exists to
remove.

This cannot be patched by "annotate with the witness UUID", because the probe's render
envelope carries no product UUID: `presenters.py::_product_attachments` emits title plus
`Product Code`/`Product Name`/`Description`/`Dimensions`/`Attachment Type`/`File Name`/
`Certificate Number`/`Valid Until`/`Validity` — no product id. n8n cannot determine which
UUID produced the matching rows. The union is **structurally unable** to keep the
annotation and the pick consistent.

**b2 — Cross-company over-claim. The tester's own hypothetical, and it is the normal case.**
The question asked was whether unioning can over-claim when the rows are "genuinely
different products that merely share a code string". Per the schema invariant above, that
is not an edge case — it is always the situation. If company A's product holds the
certificate and the customer's does not, the union asserts "— has certificate" on the
strength of another company's document. The resolver *is* called with scope
(`…/references/resolve?contact_id=…&space_id=364817`), so both UUIDs are plausibly inside
the contact's entitled set — but "plausibly" is not a safety argument, the CRM runs an
explicit multi-company isolation programme with an AC-F7/F8 matrix, and entitlement has
never been established here. Do not ship a customer-visible claim on that inference.

**b3 — F2a and `entity-ids-transformer`: no interaction, and I checked.** The union adds
further `entity_type: 'product'` UUIDs; `product` is in both `MAPPABLE` and
`TYPE_TO_PARAM`, so they all land in `product_ids`. No unmapped types, no unscoping, F2a
unaffected. This is the one part of the proposal that is clean — which is precisely what
makes it dangerous: **the union is mechanically safe and semantically wrong, so it will
test green.**

### What I will accept instead — fail closed, local to one node

**If a surviving code maps to more than one candidate UUID, exclude that code from
`dym_candidate_codes` and `dym_probe_entities`.** It then renders bare while its siblings
are labelled. Truthful, no cross-company claim, no false promise, and it needs **zero new
render logic** — `build-suggest-offer` already emits no suffix for a code absent from
`_dymProbed` ("a code that was NOT probed gets no suffix"). Cost: the ambiguous code loses
the feature, which is the correct trade when we cannot say which company's product the
customer means. Scope: `dym-transform` only.

### The bigger defect this exposes — file it separately

F-DUPE means that **today**, before this change, a customer offered `MWC7625-SH-S10` who
picks it is routed to an arbitrary company's product. Some share of the measured 67%
dead-end rate that motivated this whole change may be *this*, not missing data. That is a
resolver/CRM issue (either the resolver should not return cross-company twins, or it must
label them so n8n can choose), it is out of scope here, and it is plausibly worth more than
the feature being shipped. File it.

## 6.2 🔴 F-SUB-SCOPE — REQUIRED. I am reversing my rev-1 promote-target recommendation.

In round 1 I recommended targeting `Fss5aAaXthJSWpZCgKiKR` on probe-precedent grounds
(`sibling-probe` and `crossdomain-probe` both point there on live). New evidence this round
makes that wrong.

Chain of verified facts:

1. Both probe tools are **company-scoped** and must forward `contact_id` + `space_id`
   (AC-F7, `test_company_scope_params.py`).
2. `MCP Client1` passes `jsonInput: "={{ $json }}"` — the `entity-ids-transformer` output
   **is** the tool argument set. (Verified in both subs.)
3. The fork `rysSPgUssLDf6xJc` sets `out.contact_id` and `out.space_id = "364817"`. The live
   sub `Fss5aAaXthJSWpZCgKiKR` **does not** — that two-line delta is the *entire* difference
   between the subs.

⇒ **`Fss5aAa` calls company-scoped tools without company scope.** Promoting `dym-probe`
onto it would route the new customer-visible assertion through an unscoped read, turning
F-DUPE's b2 over-claim from *possible* into *guaranteed*: "— has certificate" whenever
**any** company holds one.

**Ruling: `dym-probe` must target a sub that forwards `contact_id` + `space_id`.** Today
that is only `rysSPgUssLDf6xJc` — which is also exactly what was tested, and which live's
main read path (`Call 'sub-get-results'`, `probe-incoming`) already depends on, so it is not
a new dependency. The alternative is to land scope parity on `Fss5aAa` first as its own
reviewed, hash-gated publish (LESSONS §51) and then target it; that is the better end state
but it is a live change to a shared sub with two existing callers and needs its own cycle.

**Bounding what I actually proved:** I verified the params are absent from the call. I did
**not** verify what the MCP server does when they are absent — it may default to a company,
or may return everything. That uncertainty is itself the argument: do not route a new
factual assertion through the unverified path when a verified-scoped one exists.

**Separate finding, pre-existing, not this change's:** `sibling-probe` and
`crossdomain-probe` on the **live spine** call company-scoped tools unscoped today. File it
against the multi-company isolation programme.

## 6.3 Rulings on the remaining items

| item | ruling |
|---|---|
| **S7b still PARTIAL** | **Confirmed — the rev-1 ruling carries.** Nothing in the graph changed between rev 1 and rev 2 (only `build-suggest-offer` jsCode + comments); no node added or removed, sub unchanged, still no Redis node anywhere in the changed graph or in `sub-get-results TEST`. Structural containment remains the sound instrument and LLEN remains a non-instrument (LESSONS §45). S7a is *better* than rev 1: 576→587, +1 across 11 runs, continuing **unbroken from the rev-1 window that ended at 576** — that cross-window continuity is itself evidence, since an unaccounted push between windows would show as a gap. |
| **Void mutation (`grep -c` = 0)** | **Yes, the FP procedure must change, and this is the same recurring class.** The mutation harness was itself an uninstrumented instrument: a substitution that never applied produced ALL PASS, indistinguishable from a suite that genuinely resisted the mutation. Require every mutation step to (1) assert the search string occurs exactly N>0 times **before** substituting, (2) assert the file digest **changed** after, and (3) abort loudly if either fails — so a no-op mutation can never be read as a passing suite. Add to `tests/uac/00-SAFETY-always-read.md` and to LESSONS §61 as a fifth instance. Credit to the tester for catching their own and re-running red. |
| §DP-3b `unscoped_probe` never tripped live | **Not blocking.** It is defence-in-depth whose non-triggering is the *expected* result when layer 1 works — every returned row carried an `Attachment Type`, which is what a correctly scoped probe looks like. Offline coverage plus the now-verified live envelope suffices. Standing caveat from rev 1: layer 2 detects only the *no-type* case, never the *wrong-type* case, so layer 1 is the real guard. |
| §DP-14 discriminating half | **Not blocking.** `qty_gt_zero` is corroborated by DP-P2's real numeric envelope (1,0,12,0 ⇒ 13>0) plus offline. The missing fixture is data availability, not a logic gap. |
| §DP-4 / §DP-8 probe ERROR | **Not blocking.** Fail-open by construction: `onError: continueRegularOutput`, no `main[1]` to leave unwired, and the `_dym_probe_input` sentinel path is unit-covered. Inducing it needs a workflow edit, correctly outside the tester role. |
| §DP-9 live | **Not blocking.** F2a is proven offline against published bytes *with a control*, and its failure mode is fail-closed ("we don't probe"), not fail-open. |
| §DP-13b dynamic | **Not blocking.** Static claim verified from `allowed_lookup`. |
| §DP-12 `sibling-probe[0]` inbound | **Not blocking**, but it is the one I most want exercised **post-promote** — it is a live path that now shares `build-suggest-offer` with the new chain. Static inbound count (exactly 4) is verified and `byteid.js` covers the direct-inbound fixture. |

None of the still-open gaps blocks individually or in aggregate. Record them as
accepted-with-note; two of them (§DP-3b, §DP-4) are inherently hard to trip *because* the
design is fail-open, which is the desired property.

## 6.4 Zero egress — re-confirmed for rev 2

Rev 2 changes one Code node's body and nothing else: no node added or removed, no edge
changed, no credential, no new node type. Every rev-1 containment fact therefore still
holds, and I re-verified the load-bearing ones against the `78a72682` export: the five
egress nodes are still 0-inbound orphans; the sink is still `tWm5DYLxfypmVC1T` → literal
`sorento-respond-message-TEST`; `dym-probe` still targets `rysSPgUssLDf6xJc` and carries no
credential; only the two `_list` read tools are reachable. S1–S6 and S8 PASS across 11 runs,
S7a clean and continuous, S7b accepted on structural containment. **No egress.**

Note the one genuinely new egress-adjacent fact this round is *not* about the clone at all:
F-SUB-SCOPE concerns what the **live** promote target would read, and it is a data-scope
issue, not an egress one — reads remain reads.

## 6.5 Updated PROMOTE CHECKLIST (supersedes §4)

Promotion is **user-gated**; this authorizes nothing.

**Required before promote**

1. [ ] **F-DUPE fixed** — exclude any code with >1 candidate UUID from
   `dym_candidate_codes`/`dym_probe_entities` in `dym-transform`. **Do not implement the
   UUID union** (§6.1b). Add offline coverage: two candidates sharing a code ⇒ that code
   absent from `probed`, rendered bare, siblings still labelled; and a control proving a
   single-UUID code still probes.
2. [ ] **Re-test live on the exact tokens that diverged** — `mwc7625-sh-s11` **and**
   `MWC7625-SH-S100` must now agree (both bare for that code), plus the inventory mirror.
   A fix that only re-runs the passing token proves nothing.
3. [ ] **F-SUB-SCOPE resolved** — either target `rysSPgUssLDf6xJc` (tested, scope-forwarding),
   or land `contact_id`/`space_id` parity on `Fss5aAa` as its own reviewed publish first.
4. [ ] FP procedure hardened: assert-substitution-applied before trusting any red (§6.3).
5. [ ] Clone re-published, `versionId == activeVersionId`, exports re-run and `--verify` green.

**Live-promote deltas** — live spine `9qVyfUxmRQqrpGRMDLRuz`, target by **node NAME**.

6. [ ] Backup live `versionId` + pre-change `build-suggest-offer` body; rollback = publish prior id.
7. [ ] Confirm live draft == active before touching it (LESSONS §23/§24); stage any foreign draft separately (§51).
8. [ ] `build-suggest-offer` = **live body + the three reviewed hunks only** (LESSONS §57); strip trailing whitespace (§58b). Rev 2 already removed the cosmetic drift — keep it that way.
9. [ ] Add `dym-transform`, `dym-gate`, `dym-probe`, `dym-annotate`.
10. [ ] 🔴 **`dym-probe.workflowId.value` per item 3** — and re-diff the two subs immediately before promote to confirm the scope-param delta is still the only difference.
11. [ ] Do **not** copy `is_test` or any clone-only leaf into `workflowInputs`; re-derive `contact_id`/`semantic_input`/`user_prompt` from the **live** `sibling-probe` (LESSONS §48).
12. [ ] Edges: remove `sibling-gate[1] -> build-suggest-offer`; add the six. Re-count live inbound to `build-suggest-offer` — must be exactly 4.
13. [ ] Byte-gate every node: update draft → re-fetch → assert draft == file → publish only on match → assert active == file. Abort on mismatch; never force.
14. [ ] `dym-probe` carries no credential; `onError == continueRegularOutput`. Assert on node TYPE (LESSONS §47).

**Post-promote**

15. [ ] Non-enabled-domain D1 miss renders byte-identically (the `_DYM_CTRL_KEYS` strip runs on most traffic).
16. [ ] One enabled-domain D1 miss annotates; `suggest_quick_reply` bare codes.
17. [ ] Exercise the `sibling-probe[0]` inbound (§DP-12's untested half).
18. [ ] Watch the all-negative rate on both domains for a day — near-100% means the probe broke (F-EMPTY), not that the catalogue emptied.
19. [ ] Re-run `export-workflows.py`; commit refreshed exports.

**File separately (do not bundle):** the resolver cross-company twin (§6.1, likely a real
contributor to the measured dead-end rate); live `sibling-probe`/`crossdomain-probe` calling
company-scoped tools unscoped (§6.2); the digit-on-merged-offer silent escalation (F-MERGE).

---
---

# 7. REV 3 REVIEW — clone `18429d54` — **APPROVE**

**Verdict: APPROVE**, subject to the pre-promote gates in §7.6. Promotion remains
user-gated; this authorizes it, it does not perform it.

Both rev-2 required items landed correctly, and the fix chosen is the one I asked for
rather than the one originally proposed. Rev 3 also produced the strongest single piece of
evidence in the whole package (§7.5). One finding, one nit, no blockers.

## 7.0 Verified independently on the published rev-3 bytes

- `--verify` green; clone `18429d54`, live spine **`f03086ac` untouched**.
- Offline files sha-match the rev-3 clone bodies and the live body — `byteid.js` is still a
  genuine cross-file gate. Suites re-run by me: `harness.js` 106/106, `byteid.js` 12/12.
- **`dym_excluded_codes` IS in `_DYM_CTRL_KEYS`** (now 11 keys). This was the one thing that
  could have quietly broken everything — a new appended key that escaped the strip would
  leak into `build-suggest-offer`'s output and break byte-identity on every non-enabled-domain
  turn. It is stripped, and `byteid.js` confirms.
- `tokenCandidates` in the clone's `build-suggest-offer` is **identical to live**.
- Structure unchanged: five egress nodes still 0-inbound; `build-suggest-offer` inbound
  exactly 4; sink still `tWm5DYLxfypmVC1T`; `dym-probe` → `rysSPgUssLDf6xJc`,
  `onError: continueRegularOutput`, **no credentials**.

## 7.1 The exclusion logic is correct, and it does not weaken F2a

Read against the published `dym-transform` bytes (lines 163–205):

- Exclusion happens **before** the uuid/mappable gates and `continue`s, so an excluded code
  can never reach `cands`, `dym_candidate_codes`, or `dym_probe_entities`. Confirmed by the
  headline case: neither twin UUID appears in `dym_probe_entities`.
- `droppedOther` correctly separates the two causes, so `multi_uuid_code` is reported only
  when exclusion is the sole cause. The precedence is the safe way round: when *both* causes
  are present it falls back to **`no_candidate_uuid`**, preserving the hard-gate signal
  rather than masking it behind the newer, less safety-relevant label.
- The F2a hard gate is untouched — `cands.length === 0` still blocks the probe, so
  "everything ambiguous" degrades to today's un-annotated offer, not to an unscoped read.
- `uuidCensus` deliberately counts `isExact` entries while `tokenCandidates` filters them.
  That asymmetry is correct and cannot cause a false exclusion: the same product resolved at
  two tiers carries the same UUID and the `Set` collapses it. The tester's S9-E mutation
  (keying the census on `uuid + match_tier`) turning both two-tier assertions red is the
  right instrument for exactly this, and it went red.

## 7.2 The duplication call — right, but the stated safety property is not the one in force

**Ruling: keeping `uuidCensus()` separate rather than refactoring `tokenCandidates()` to
return both is the correct call**, and for a stronger reason than "avoid churn". These are
two separate n8n Code nodes with no shared module. `dym-transform` decides *what to probe*;
`build-suggest-offer` decides *what to render*. If their candidate selection diverges, the
probe answers about candidates that are not shown, or misses ones that are — and nothing
fails, it just quietly annotates the wrong list. Textual identity of the selection function
is the only cheap way to make that drift *detectable by inspection*, and merging the census
into it would destroy the property to save six lines. Correct trade.

**But the property as stated is already false.** `diff` of the two `tokenCandidates` copies
today:

```
9c9
<     if (isExact(m)) continue;
---
>     if (isExact(m)) continue;                              // exact would have resolved
12c12
<     seen.add(code); keep.push(m);
---
>     seen.add(code); keep.push(m);   // API ranks variants-first / by similarity → keep order
```

Comment-only, so behaviour is fine and the tester's 4,000-payload randomized equivalence
run with a negative control (200/200 divergence when the `isExact` filter is removed) is
solid evidence that they agree *today*. The problem is the enforcement story: the invariant
is currently held by a code comment, a one-off experiment that **is not committed to the
repo**, and a `diff` that already shows two hunks of noise — which is precisely how a
reviewer gets trained to eyeball past the third hunk.

That is this repo's signature failure mode: an invariant whose violation produces no red.
And it is most exposed at the worst moment — promote checklist item 8 rebuilds
`build-suggest-offer` from the **live** body while `dym-transform` is copied verbatim, so
promotion itself is the likeliest source of divergence.

**Required before promote (§7.6 item 1), and it is small:** commit the equivalence check as
a suite file that extracts both bodies from the **export** node files and asserts behavioural
equivalence over randomized payloads, with the negative control retained so the check itself
can go red. The tester has already written it; it needs to live in the offline directory and
run with the others. Then document the do-not-refactor comment as pointing *at that test*,
not at a claim.

## 7.3 The tester's override was correct, and it invalidates the rev-2 F-ATT witness

**Confirmed.** Exec `11471806`'s `resolve-entity` returns **both twins in the same response**
for `mwc7625-sh-s11` — `alternatives[0] = {MWC7625-SH-S10, 0f2fe976, 0.75}` and
`alternatives[1] = {MWC7625-SH-S10, a7dfc428, 0.75}`. I read that same runData in the rev-2
pass. So the ambiguity was never token-dependent; only *which twin survived dedup* was.
`MWC7625-SH-S10` is therefore permanently unannotatable, rendering bare is correct, and the
tester was right to override the instruction rather than force the old expectation.

The consequence the coordinator flags is real and worth stating plainly: **rev 2's
`— has certificate` was right by luck, so my rev-1 F-ATT sign-off rested on an invalid
witness.** It was invalid in a way neither the tester nor I could see at the time, because
there was no observable distinguishing "annotated correctly" from "annotated on an
arbitrarily-chosen twin". `dym_excluded_codes` is exactly that observable. That is a good
argument for keeping it in runData permanently — it is stripped before render, so it costs
the customer nothing and it is what makes the next such error visible.

## 7.4 The replacement positives are adequate — better-witnessed than rev 2 was

- `srtwc8317-rl1 cert` (exec `11474003`) with **`dym_excluded_codes: []`** → one
  `— has certificate` + two `— no`. The empty exclusion list is the part that matters: it
  proves the positive was not produced by an arbitrary twin selection.
- `srtwt22151 cert` → two carriers promoted ahead of the closest token match, resolver order
  preserved inside the has-group. This independently re-exercises the rev-1 F-RANK fix under
  real data and covers the multi-carrier sort path.

Two independent live positives on codes proven unambiguous, at one and two carriers, each
with the exclusion list observable. **The positive branch of `row_present_with_type` is now
adequately witnessed** — and on a sounder basis than rev 2, which had no such observable.

## 7.5 Zero egress — re-confirmed, and the sink account now closes exactly

All rev-1/rev-2 containment facts re-verified against `18429d54` (§7.0). Rev 3 changed two
Code node bodies; no node, edge, credential, or node type was added or removed. S1–S6, S8,
S9 PASS across 9 runs.

**The strongest evidence in the package is the sink ledger, and it now closes across the
entire programme:**

| window | runs | sink |
|---|---|---|
| rev 1 | 23 | 553 → 576 |
| rev 2 | 11 | 576 → 587 |
| rev 3 | 9 | 587 → 596 |
| **total** | **43** | **553 → 596 = +43** |

Exactly +1 per canary run, no gaps, and each window resumes precisely where the previous one
ended. An unaccounted push anywhere in three days of testing would show as a step in that
series, and there is none. **S7b: confirmed acceptable on structural containment; I do not
require the pop-payload series.** Per LESSONS §45 the LLEN reading was never the sound
instrument, and the sink-delta ledger above is the attribution evidence §45 actually asks
for — it is stronger than the series that is missing.

## 7.6 Remaining rulings

| item | ruling |
|---|---|
| **S9 as a standing gate** | **Adequately specified — adopt it.** `mutate.sh` implements the three-step rule exactly (occurrence count before, digest delta after, abort loudly), plus `node --check` and a restore trap, and it earned its keep by catching S9-D in the same pass. One gap to note, not to block on: it protects against a *no-op* mutation, not an *unrun* one — a forgotten mutation still leaves a gate unproven. Closing that needs a committed manifest of required (file, search, replace, count, suite) tuples run as one command. Promote `mutate.sh` into `tests/uac/00-SAFETY-always-read.md` as mandatory for any fail-on-purpose step, and add the void-mutation incident to LESSONS §61 as the fifth instance. |
| §DP-15b all-ambiguous offline-only | **Acceptable.** No natural live token exists, the offline case covers the `probe_needed:false` / `multi_uuid_code` path, and the failure mode is fail-closed (no probe ⇒ today's offer). Record as accepted-with-note. |
| §DP-3b, §DP-14 discriminating half, §DP-4/§DP-8, §DP-9 live, §DP-13b dynamic, §DP-12 `sibling-probe[0]` | **Unchanged from §6.3 — none blocks.** Two of them are hard to trip *because* the design is fail-open, which is the property we want. §DP-12's `sibling-probe[0]` remains the top post-promote item. |
| Label parity (`F-DUPE*` vs `§DP-15/15b/15c`) | **Require it — cheap, and the reason is not tidiness.** A grep for `§DP-15` returning nothing produced a false "no coverage" reading. In a repo whose dominant defect class is checks that cannot fail, a coverage query that reports absence while coverage exists is the same disease one level up in the tooling. Rename the cases. |
| **Bare-line wording** (view only, not blocking) | Not required for *correctness* — a bare line asserts nothing, so it cannot be false. But the tester's contrast argument is sound and is not merely stylistic: beside explicit `— no certificate` siblings, silence carries the negative by implicature, so the customer may infer "no certificate" for a product holding six. That is the same "customer ends up believing something false" failure we rejected the UUID union to avoid — arriving via pragmatics instead of semantics. A short neutral marker (e.g. `— not checked`) costs one string and closes it. **My recommendation is to add one; I explicitly do not block, and the user owns the words.** |

## 7.7 FINAL PROMOTE CHECKLIST — supersedes §4 and §6.5

**Gates before any live write**

1. [ ] **Commit the `tokenCandidates` equivalence check** as an offline suite file sourcing both bodies from the **export** node files, negative control retained (§7.2). Green. *This is the only item carried from the review body; everything else in rev 3 is signed off.*
2. [ ] Rename the offline `F-DUPE*` cases to `§DP-15/15b/15c` (§7.6).
3. [ ] Decide the bare-line wording with the user (§7.6). If a neutral marker is added, re-run `harness.js` + `byteid.js` and re-confirm `suggest_quick_reply` stays bare codes.
4. [ ] Clone re-published if 1–3 changed anything; `versionId == activeVersionId`; exports re-run, `--verify` green.
5. [ ] Live spine confirmed `f03086ac` and **draft == active** immediately before the first write (LESSONS §23/§24). Stage any foreign draft as its own semantic-no-op publish first (§51).
6. [ ] Backup: capture live `versionId` + the pre-change `build-suggest-offer` body. Rollback = `publish_workflow` the prior versionId.

**Live-promote deltas** — spine `9qVyfUxmRQqrpGRMDLRuz`, target by **node NAME**, never by clone node id.

7. [ ] **`build-suggest-offer`** = **live body + the reviewed hunks only** (LESSONS §57): the 11-key `_DYM_CTRL_KEYS` strip, the `_dymOk`/`_dymHas`/`_dymProbed`/`_dymNoun` block, and the code-mode annotate/sort/render block with the comparator **`return hb - ha;`** (no tiebreak). Strip trailing whitespace before authoring (§58b). **After building it, re-run gate 1 against the promote target body** — this is the moment divergence is most likely.
8. [ ] Add `dym-transform`, `dym-gate`, `dym-probe`, `dym-annotate` (Code bodies verbatim from the clone; they are new, so there is no live baseline to preserve).
9. [ ] 🔴 **`dym-probe.workflowId.value` = `rysSPgUssLDf6xJc`, NOT `Fss5aAaXthJSWpZCgKiKR`.** This reverses the rev-1 recommendation; the reason is §6.2 — both probe tools are company-scoped (AC-F7), `MCP Client1` passes `jsonInput: {{ $json }}`, and only the fork's `entity-ids-transformer` sets `out.contact_id` / `out.space_id`. Targeting `Fss5aAa` would run the new customer-visible assertion through a company-**unscoped** read. Re-diff the two subs immediately before promote and confirm that two-line scope delta is *still* the only difference; if `Fss5aAa` has gained scope parity in the meantime, prefer it and say so.
10. [ ] Do **not** copy `is_test` or any clone-only leaf into `workflowInputs`; re-derive `contact_id` / `semantic_input` / `user_prompt` from the **live** `sibling-probe` (LESSONS §48).
11. [ ] Edges: remove `sibling-gate[1] -> build-suggest-offer`; add the six. Re-count live inbound to `build-suggest-offer` — must be **exactly 4**.
12. [ ] Byte-gate every node: update draft → re-fetch → assert draft == intended file → publish **only** on match → re-fetch and assert active == file. Abort on any mismatch; never force.
13. [ ] Assert `dym-probe` carries **no credential** and `onError == continueRegularOutput`, on node **TYPE** (credentials are redacted on MCP read — LESSONS §47).

**Post-promote verification** (LESSONS §56 — verify the path you changed)

14. [ ] **Non-enabled-domain D1 miss renders byte-identically.** Highest blast radius: the `_DYM_CTRL_KEYS` strip runs on most traffic, and rev 3 added an 11th key to it.
15. [ ] **Enabled-domain D1 miss annotates**, `suggest_quick_reply` bare codes, index-aligned with `suggest_last_result_set`.
16. [ ] **An F-DUPE turn renders bare** with `dym_excluded_codes` populated — confirm the exclusion survives promotion, since it is the newest and least-exercised logic.
17. [ ] Exercise the **`sibling-probe[0]` inbound** (§DP-12's untested half) — a live path now sharing `build-suggest-offer` with the new chain.
18. [ ] Watch the all-negative rate on both domains for a day. Near-100% means the probe broke (§F-EMPTY), not that the catalogue emptied. Watch `dym_excluded_codes` volume too: a high exclusion rate means cross-company twins are common, which raises the priority of the resolver fix below.
19. [ ] Re-run `export-workflows.py`; commit refreshed exports.

**File separately — do not bundle into this promote**

- **The resolver cross-company twin** (§6.1). Root cause of F-DUPE, still unfixed; `product_code` is unique per company, so the resolver is offering two companies' products as one line. Plausibly a real contributor to the measured 67% dead-end rate — i.e. possibly worth more than the feature just built.
- **Live `sibling-probe` / `crossdomain-probe` call company-scoped tools unscoped** (§6.2). Pre-existing multi-company isolation gap; also the precondition for ever re-pointing `dym-probe` at `Fss5aAa`.
- **Digit-on-merged-offer silent escalation** (F-MERGE). Pre-existing; disjoint from this change today only by routing coincidence. Any future `DOMAIN_PROBE` entry must be checked against `cs-offer-gate`'s `customer_service`/`order_enquiries` pair before enabling.

## 7.8 Note for the record

Every stage of this change caught a real defect in what the previous stage handed it, and in
this final pass the tester overrode a coordinator instruction on evidence and was right to.
Two of the four defects that mattered most — the `dym-gate` FALSE-branch payload clobber and
the D5 mappable-type tightening — were caught by the coder against the plan; F-RANK and the
`Fss5aAa` scope reversal came out of review; F-DUPE came out of testing and then survived a
proposed remedy that would have made it worse. The rev-2 F-ATT witness turning out to be
invalid is the useful cautionary note: it passed review because no observable existed to
distinguish a correct annotation from a lucky one. The fix was not more scrutiny, it was
adding the observable.

---
---

# 8. REVS 4–6 REVIEW — clone `b79ef8c4` — **APPROVE on correctness; promote NOT yet authorized**

**Verdict: APPROVE** the substance of revs 4–6. The four-surface enumeration is correct — I
re-derived it independently and it holds. **Promote is not authorized until the three gates
in §8.5A land**, one of which has now been open since rev 3 and has *grown* since.

Read the verdict precisely: the code is right, the evidence is good, and the remaining work
is gates and one in-flight verification — not behaviour changes.

## 8.0 Verified independently on rev 6

- `--verify` green. Live spine drifted `f03086ac → 533499f4 → f9205b03` **not by us**.
  I re-verified the drift claim rather than accepting it: `live-bso.js`, `live-ccs.js` and
  `live-ec.js` are each **sha-identical to the corresponding node in the live export at
  `f9205b03`**. So `byteid.js` / `ccs-harness.js` baselines survived the drift and remain
  valid gates. This was the right thing to check first — a silent baseline invalidation
  would have made every byte-identity assertion vacuous.
- All five clone node bodies sha-match the offline copies. Suites re-run by me:
  `harness.js` ALL PASS, `byteid.js` ALL PASS, `ccs-harness.js` ALL PASS.
- Clone structure: five egress nodes still **0-inbound**; sink unchanged; both
  `dym-probe` and `dym-probe-partial` → `rysSPgUssLDf6xJc`, `onError:
  continueRegularOutput`, **no credentials**, `tool` sourced from the domain map.

## 8.1 The enumeration — re-derived from scratch, and it holds

I did not check the coder's list; I derived the set independently, then compared.

**Method.** Every customer-facing candidate list is ultimately a *numbered list of entity
labels*, so I enumerated by construction idiom (`${i + 1}.` / `${idx}.` / `map((x, i) =>`)
across every live-spine Code node, then cross-checked by offer phrasing
(`Did you mean` / `closest matches` / `Try:` / `please choose` / `Reply with a
code|number`). Both sweeps converge on the same four producers:

| # | producer | surface | status |
|---|---|---|---|
| 1 | `build-suggest-offer` | D1 single-token **code mode** | annotated, rev 1–3 |
| 2 | `compile-current-state:352` | partial-resolution block | annotated, rev 4 |
| 3 | `disallowed-entity-gate:207-209` → `escalate_message` | require-specific picker | annotated, rev 5 (+ rev 6 delivery fix) |
| 4 | `build-suggest-offer:84` ← `annotate-incoming-picker` | incoming picker | pre-existing |
| — | `build-cs-member-offer:22` | CS member roster | **correctly out of scope** — a numbered picker of *people*, with no has/no attribute to probe |

**The enumeration is complete.** The fifth numbered picker (`build-cs-member-offer`) is the
only other one and is out of scope by nature, not by omission — worth stating explicitly
because a future reader running the same sweep will find it and needs to know it was
considered.

**One nuance the summary table understates.** "Surface 1 = `build-suggest-offer`" is really
*one of four arms* of that node. D1 numbered mode (`:250`), D1 multi-token (`:208`) and D2
(`:391`) all render candidate lists and are **not** annotated. Those exclusions are
principled — numbered mode carries promotion uuids with nothing to probe, multi-token was
scoped out in rev 1, D2 is different semantics — and `byteid.js` gates each of them. But
the table as written invites a future reader to believe `build-suggest-offer` is fully
annotated. Fix the wording in the diff/plan.

**The two extra by-name readers: clearance confirmed, independently.** I found the same two
(`attach-merge.js` and `presign-fail-notice.js`, both reading `user_response` from
`$('crossdomain-compose')` via the alias form) and verified the clearance **from the graph,
not by assumption**: TOPOLOGY gives `compile-current-state[0] -> crossdomain-compose` as
that node's only inbound, so both readers sit transitively downstream of the annotation and
receive post-annotation text. `crossdomain-render` is upstream but reads no render key.
Clearance is sound.

## 8.2 Findings, most severe first

### F-PARITY 🔴 REQUIRED — open since rev 3, and rev 4 tripled it

My rev-3 sign-off required committing the `tokenCandidates` equivalence check as a suite
file. It is **still not committed** — I grepped `harness.js`, `byteid.js` and
`ccs-harness.js`: no parity, equivalence, or cross-body assertion exists in any of them.
Every gate asserts *output* byte-identity, which is valuable and which is not this.

Rev 4 then added two more source-parity invariants of the same class:

```
dym-transform.js  vs  dym-transform-partial.js   →  BYTE-IDENTICAL (0 differing lines)
dym-annotate.js   vs  dym-annotate-partial.js    →  differ ONLY in two constants:
      _PAYLOAD_SRC : 'not-found-error-message'  |  'central-exchange'
      _XF_SRC      : 'dym-transform'            |  'dym-transform-partial'
```

The shared-body design is **good** — it eliminates lane drift by construction, which is
strictly better than the `tokenCandidates` duplication. But it creates two n8n nodes that
*look* independent and must stay identical, with nothing detecting divergence. That is now
**three** silent-divergence invariants:

1. `tokenCandidates` — `dym-transform` ↔ `build-suggest-offer` (rev 3)
2. `dym-transform.js` ↔ `dym-transform-partial.js` — byte-identical (rev 4)
3. `dym-annotate.js` ↔ `dym-annotate-partial.js` — identical modulo the two constants (rev 4)

Each is held today only by a comment and a one-off check. Each fails **silently** — the
lanes diverge, the probe answers about a different candidate set than renders, and every
existing gate stays green because they assert outputs of a single lane. And invariant 1 is
most exposed at promote time, when `build-suggest-offer` is rebuilt from the **live** body
while `dym-transform` is copied verbatim.

**One small file gates all three** (~30 lines: read the five bodies from the *export*
directory, assert 2 and 3 textually, assert 1 behaviourally over randomized payloads with
the negative control retained). Required before promote.

I am flagging the process point too: this item was marked required at rev 3, three
revisions have shipped since, and it grew rather than closed.

### F-XDC 🟠 finding — `crossdomain-compose` transforms every annotated string and nothing asserts it

Not in the enumeration, because it is not a *producer* — but it is a **consumer that
rewrites the rendered text**, and it is downstream of all four surfaces (`compile-current-state[0]
-> crossdomain-compose -> {save-session-vars, sendmsg}`). It locates the earliest of five
markers (`Related products:`, `Try:`, `Did you mean`, `Here are the closest matches:`,
`Would you like me to escalate`) and splices a cross-domain block in at that marker's
line/sentence start.

Our change alters the very strings it parses — most sharply in rev 1–3, which turned D1 code
mode from one-line prose into a numbered list. **I worked through it and it is safe:**
`Did you mean` survives at the same offset in both forms; the insertion point is computed
from `lastIndexOf` *before* `idx`, so the `1. ` sequences the annotation introduces sit after
the marker and cannot move it; and the suffixes (` - has …`) contain no marker substring.
The require-specific and partial surfaces append suffixes only to lines below the marker.

But that is **my** reasoning, not a gate. Nothing runs `crossdomain-compose` against an
annotated `user_response`, and this is precisely the shape of the rev-6 defect: a downstream
consumer silently altering a correct upstream result while every producer-side assertion
stays green. Recommend one `ccs-harness.js` case running the **live** `crossdomain-compose`
body against annotated vs un-annotated `user_response` and asserting the insertion index is
unchanged. Not a blocker — the reasoning is solid and the failure would be cosmetic
ordering, not a false claim — but it is the obvious next instance of the class.

### F-CCS-STRIP 🟠 finding — an implicit invariant standing between 10 control keys and the customer's session

`dym-transform-partial` appends **10** control keys (`dym_probe_entities`,
`dym_candidate_codes`, `dym_excluded_codes`, `probe_tool`, `probe_noun`, `probe_predicate`,
`probe_needed`, `probe_skip_reason`, `probe_lane`, `_dym_probe_input`) to its passthrough.
`compile-current-state` has **no strip** — no `_DYM_CTRL_KEYS`, no `delete`.

That is **correct today**, and I verified why: `compile-current-state` starts from
`let output = {}` and returns a freshly-built literal, so input keys cannot reach its output.
The D1 lane needed a strip because `build-suggest-offer` spreads `{...$input.first().json}`;
this lane does not.

The problem is that nothing says so. And the consequence if it ever changes is not cosmetic:
`crossdomain-compose`'s own comment records that its output feeds `save-session-vars`, the
conversation-variables PUT, which sends `JSON.stringify($json)` — **the whole item**. So a
future refactor of `compile-current-state` to spread its input — an innocuous-looking change
— would persist ten harness control keys into every real customer's session on live. The
clone cannot detect this: its `save-session-vars` is orphaned.

Cheap fix, both halves worth doing: a comment at `compile-current-state`'s `let output = {}`
naming the property as load-bearing, and one `ccs-harness.js` assertion that its output
contains **none** of the ten keys. The assertion is the part that can fail.

### F-ONERR 🟠 gate it — `continueRegularOutput` is now on the answered path, and the trigger is demonstrated

Still exercised in code only. My rev-3 ruling was "not blocking" — I am **changing that for
revs 4–6**, for two specific reasons:

1. **The stakes moved.** In rev 1–3 every probe sat on the not-found lane, where a failure
   degrades a turn that was already failing. `dym-probe-partial` sits on `If6[0]`, the
   **answered** lane. If n8n's `onError: continueRegularOutput` does not emit the input item
   as assumed, a probe failure could break a turn that would otherwise have delivered a
   correct answer. That is a strict regression on the healthy path.
2. **The trigger is no longer hypothetical.** The CRM origin threw Cloudflare 504s *during
   this testing period*. The failure mode has a demonstrated cause.

The `_dym_probe_input` sentinel covers "emits input item"; `probe.error` covers "emits an
error object"; neither covers "node halts / emits nothing". The coder's throwaway broken-probe
clone is already in flight and settles it. **Require its result on all three lanes before
promote** — it costs nothing that isn't already being spent, and the partial lane is the one
that must be seen green.

### F-TABLE 🟢 nit — the surface table oversells coverage of `build-suggest-offer` (see §8.1).

## 8.3 Rulings on the items raised

| # | item | ruling |
|---|---|---|
| 1 | Is the change complete? | **Yes — enumeration re-derived and confirmed** (§8.1), including the two extra by-name readers cleared from the graph. Note `build-cs-member-offer` as the considered-and-excluded fifth picker, and fix the table wording. |
| 2 | Rev-4 second lane | **Confirmed sound, and the `If6` rejection was substantive, not cautious.** Verified structurally: `If6[0] -> central-exchange` (answered) and `If6[1] -> Aggregate1 -> not-found-error-message` (not-found) are **branch-exclusive**, `Aggregate1`'s inbound is still exactly `If6[1]` in both live and clone, and the partial chain hangs entirely off `central-exchange`. So it cannot perturb `Aggregate1` or the not-found payload — not by convention but by topology. The coder's reasoning is right on the merits: a 1-item-emitting node above `If6` would sit on the path feeding `If6[1] -> Aggregate1` and collapse N→1 *before* the aggregation, which is exactly how the not-found payload would be corrupted. Also confirmed the insertion mirrors D1 exactly — `central-exchange[0] -> compile-current-state` was **removed**, as `sibling-gate[1] -> build-suggest-offer` was. 5 inbound is correct: 3 pre-existing + gate-FALSE passthrough + annotated. |
| 3 | Rev-6 preference order | **Confirmed coherent on all three counts.** (a) `manualResponse = !nf.require_specific` and `is_escalate_offer = !nf.is_clarification` read from the **same `nf` object** the text comes from, so flags cannot desync from the string whichever source wins. (b) The `annotate-incoming-picker` arm is reached only when `not-found-error-message` did not execute — unchanged from live. (c) Fail-open is genuine: `isExecuted` check, non-empty-string check, and a `try/catch` returning `null`, so a missing/unexecuted/malformed preferred source falls through to *exactly* today's expression. The comment block correctly names it as the same by-name landmine class. |
| 4 | The discriminating gate (`live-ec.js`) | **Right permanent design — adopt it as a standing rule.** The rev-6 defect was producer-correct / consumer-discards, and 170 assertions stayed green because every one asserted the producer's output object. Keeping the **pre-fix consumer** and running both against the same producer output fixes that in the only way that generalizes: it asserts the property end-to-end *and* ships its own negative control, so the gate can be shown to fail — this repo's #1 defect class. S9-L (proving it fails if it stops discriminating) is the correct meta-gate. **Yes, require it for every rendered-text gate**, stated as: *assert on the node that feeds the send, not the node that computes the text; and retain a pre-change copy of every consumer that re-sources that text by name.* The immediate unfinished application is F-XDC. |
| 5 | Latency | **Acceptable; does not change promote posture.** And the framing overstates it: **at most one new probe runs per turn**, not three — `dym-probe` is downstream of `not-found-error-message` (If6[1]) and `dym-probe-partial` hangs off `central-exchange` (If6[0]), so they are mutually exclusive; rev 5 added **zero** probes, reusing the D1 lane's `dym-annotate` output. So the marginal cost is one CRM read on a turn that already performs several, +417 ms inline against ~0.35% of the p99-vs-lock-TTL budget. The real risk is not the mean but the tail — the Cloudflare 504s — and that is a fail-open question, which is why F-ONERR is now gated rather than the latency. |
| 6 | Wording | **Adequately documented — and in the right place.** The rationale sits at `dym-transform.js:34,39-40`, immediately beside the `noun: 'stock details'` constant and the `qty_gt_zero` predicate, recording that the label deliberately under-describes, that a 0-on-hand row reads `- no stock details`, and that the user chose this having been shown that exact case. Code-adjacent is the durable location — a future reader edits the constant, not the plan. Mirror one line into the plan for completeness, but the important half is right. |
| 7 | `onError` unproven | **Gates promote — changed from my rev-3 ruling.** See F-ONERR: the partial lane put it on the answered path and the 504s made the trigger real. Result required on all three lanes. |
| 8 | Carried gaps (§DP-15b live, §DP-3b, §DP-9 live, §DP-13b dynamic, §DP-12 `sibling-probe[0]`) | **Unchanged — none blocks.** Several are hard to trip *because* the design is fail-open, which is the property we want. §DP-12's `sibling-probe[0]` remains the top post-promote item, now joined by the require-specific and partial surfaces. |

## 8.4 Zero egress — re-confirmed for revs 4–6

Re-verified against the `b79ef8c4` export, not taken from the run logs: five egress nodes
**0-inbound**; sink still `tWm5DYLxfypmVC1T` → literal `sorento-respond-message-TEST`; both
probes target the fork, carry **no credentials**, `onError: continueRegularOutput`, and
resolve `tool` only from the two-entry domain map. Rev 5 added no node at all; rev 6 added
none. S1–S6, S8, S9 PASS across all three passes (16 + 2 + 6 runs).

**One honest correction to my own rev-3 framing.** I called the sink ledger a "closed
account". Across revs 4–6 it no longer closes: 596→604, 620→621, 622→626, 627→628 are
unattributed, explained as coder ccs runs and user console sessions outside the tester's
sampled windows. That explanation is plausible — the user *was* driving the console — but it
is an explanation, not an accounting. **Every sampled bracket is still exactly +1**, which is
the load-bearing per-run evidence; what is lost is the whole-population closure that made the
rev-3 ledger unusually strong. Stated so the next reader does not inherit a stronger claim
than the data supports. S7b remains PARTIAL on structural containment, which I continue to
accept (LESSONS §45: LLEN was never the sound instrument).

**No egress.**

## 8.5 CONSOLIDATED PROMOTE CHECKLIST — supersedes §6.5 and §7.7

The change is now **4 surfaces, 8 added nodes and 3 modified nodes**. Promote is user-gated
and additionally held pending the CRM-side resolver decision.

### A. Blocking gates — promote is NOT authorized until all three are green

1. [ ] **Commit the parity suite** covering all three invariants (F-PARITY): `tokenCandidates`
   equivalence `dym-transform` ↔ `build-suggest-offer` (behavioural, randomized, negative
   control retained); `dym-transform.js` ↔ `dym-transform-partial.js` byte-identical;
   `dym-annotate.js` ↔ `dym-annotate-partial.js` identical modulo `_PAYLOAD_SRC`/`_XF_SRC`.
   Source every body from the **export** directory so live/clone drift trips it.
2. [ ] **Broken-probe result on all three lanes** (F-ONERR), with the **partial lane** shown
   green — a probe failure there must not break an otherwise-successful answered turn.
3. [ ] **`compile-current-state` no-leak assertion** (F-CCS-STRIP): its output contains none
   of the ten control keys, plus a comment at `let output = {}` naming the property.

### B. Strongly recommended before promote

4. [ ] `crossdomain-compose` insertion-point case against annotated vs un-annotated text (F-XDC).
5. [ ] Fix the surface-table wording so it does not imply `build-suggest-offer` is fully annotated (F-TABLE); record `build-cs-member-offer` as considered-and-excluded.
6. [ ] Mirror the `stock details` wording rationale into the plan.

### C. Pre-write checks

7. [ ] `--verify` green; clone published, `versionId == activeVersionId`.
8. [ ] **Re-verify the live baselines again immediately before promote** — live has drifted twice during this change, and `live-bso.js` / `live-ccs.js` / `live-ec.js` must each still be sha-identical to the live node they mirror. If any has drifted, every byte-identity gate is void until rebaselined. *This is now a standing step, not a one-off.*
9. [ ] Live draft == active (LESSONS §23/§24); stage any foreign draft as its own no-op publish (§51).
10. [ ] Backup live `versionId` + the three pre-change node bodies (`build-suggest-offer`, `compile-current-state`, `escalate-catalog`). Rollback = publish prior id.

### D. Live-promote deltas — spine `9qVyfUxmRQqrpGRMDLRuz`, target by node **NAME**

11. [ ] **Modified (3), each as LIVE body + reviewed hunks only** (LESSONS §57), trailing whitespace stripped (§58b):
    `build-suggest-offer` (11-key strip; `_dymOk/_dymHas/_dymProbed/_dymNoun`; D1 code-mode annotate/sort/render with **`return hb - ha;`**, no tiebreak; the rev-5 require-specific `escalate_message` block at ~:220 — **no reordering** there, the numbers are the pick affordance);
    `compile-current-state` (partial-resolution annotation at ~:345-372);
    `escalate-catalog` (rev-6 preference order).
    **After building `build-suggest-offer`, re-run gate A1 against the promote target body** — this is where invariant 1 is most likely to break.
12. [ ] **Added (8):** `dym-transform`, `dym-gate`, `dym-probe`, `dym-annotate`, `dym-transform-partial`, `dym-gate-partial`, `dym-probe-partial`, `dym-annotate-partial`. The two transform bodies must go up **byte-identical**; the two annotate bodies identical **except** `_PAYLOAD_SRC`/`_XF_SRC`.
13. [ ] 🔴 **Both probes → `rysSPgUssLDf6xJc`, NOT `Fss5aAaXthJSWpZCgKiKR`** (§6.2: both probe tools are company-scoped per AC-F7; `MCP Client1` passes `jsonInput: {{ $json }}`; only the fork's `entity-ids-transformer` sets `out.contact_id`/`out.space_id`). Re-diff the two subs immediately before promote; if `Fss5aAa` has gained scope parity, prefer it and say so.
14. [ ] Do **not** copy `is_test` or any clone-only leaf into `workflowInputs`; re-derive `contact_id`/`semantic_input`/`user_prompt` from the **live** `sibling-probe` (LESSONS §48).
15. [ ] **Edges — remove 2, add 12:** remove `sibling-gate[1] -> build-suggest-offer` **and `central-exchange[0] -> compile-current-state`**; add the six D1 edges and the six partial-lane edges. Then re-count on live: `build-suggest-offer` inbound **exactly 4**, `compile-current-state` inbound **exactly 5**, `Aggregate1` inbound **exactly `If6[1]`** (unchanged — the check that proves the lanes stayed disjoint).
16. [ ] Byte-gate each node: update draft → re-fetch → assert draft == file → publish **only** on match → assert active == file. Abort on mismatch; never force.
17. [ ] Assert both probes carry **no credential** and `onError == continueRegularOutput`, on node **TYPE** (LESSONS §47).

### E. Post-promote — verify each surface separately (LESSONS §56)

18. [ ] **Non-enabled-domain D1 miss byte-identical** — highest blast radius (the strip runs on most traffic).
19. [ ] **Answered turn with no dym set byte-identical** — the rev-4 analogue; `compile-current-state` is now on a new lane for *every* answered turn.
20. [ ] Surface 1: enabled-domain D1 miss annotates, `suggest_quick_reply` bare codes, index-aligned.
21. [ ] Surface 2: partial-resolution turn annotates.
22. [ ] Surface 3: require-specific picker annotates **and the suffix reaches the customer** — the rev-6 defect, i.e. verify the rendered message, not `build-suggest-offer`'s output object.
23. [ ] An F-DUPE turn renders bare with `dym_excluded_codes` populated, on **both** the D1 and picker lanes.
24. [ ] Exercise `sibling-probe[0]` into `build-suggest-offer` (§DP-12's untested half).
25. [ ] Confirm no control keys appear in a real `conversation-variables` PUT payload (F-CCS-STRIP, live-only observable).
26. [ ] Watch for a day: all-negative rate per domain, `dym_excluded_codes` volume, and probe error rate (the 504s).
27. [ ] Re-run `export-workflows.py`; commit refreshed exports.

### F. File separately — do not bundle

- **Resolver cross-company twin** (§6.1) — the root cause of F-DUPE, and the subject of the CRM-side decision currently holding promote: `entity_resolver.py:_probe_product` selects no `company_id` and applies no company filter, while the MCP data tools are company-scoped. That mismatch *is* F-DUPE.
- **Live `sibling-probe` / `crossdomain-probe` call company-scoped tools unscoped** (§6.2).
- **Digit-on-merged-offer silent escalation** (F-MERGE) — and the standing rule that any new `DOMAIN_PROBE` entry be checked against `cs-offer-gate`'s `customer_service`/`order_enquiries` pair first.

## 8.6 Note for the record

The rev-3 sign-off said the change was complete when it covered one of four surfaces. Nobody
knew — not the planner, the coder, the tester, the coordinator, or me. What found the other
three was a user typing into a console and then someone enumerating by *rendered string*
rather than by node. That is the durable lesson here, and it outranks any individual finding:
**this change's scope was defined by which node we happened to be looking at, and the correct
frame was "every place a candidate list reaches a customer."** The `live-ec.js` discriminating
gate is the right institutional response — it asserts the property where the customer
actually experiences it — and §8.3 item 4 makes it standing policy. F-XDC is the next place
to apply it.

---
---

# 9. FINAL REVIEW — rev 7, clone `5d6f9593` — ✅ **APPROVE**

**Verdict: APPROVE.** All three blocking gates landed and hold on the published bytes;
F-ONERR is closed by measurement on all three lanes. No outstanding required items.

Promote remains **user-gated** and additionally held pending the CRM resolver decision.
§9.5 is the single authoritative checklist and supersedes §4, §6.5, §7.7 and §8.5.

## 9.1 Verified independently on rev 7

- `--verify` green: clone `5d6f9593`, live **`f9205b03` untouched**.
- **All four suites re-run by me: `parity.js`, `harness.js`, `byteid.js`, `ccs-harness.js` — ALL PASS.**
- `parity.js` sources bodies from `export/clone-sorento-consume-main-TEST/nodes` and
  `process.exit(2)` on a missing file, so it asserts **what is published**, not a working
  copy that could drift from it. Correct construction.
- **Every baseline re-verified valid at `f9205b03`**: `live-bso.js`, `live-ccs.js`,
  `live-ec.js` each sha-identical to the live node they mirror, and the F-XDC gate's
  `crossdomain-compose.js` is sha-identical to **both** the live and clone bodies (that node
  is correctly untouched by this change). Every byte-identity and discrimination gate is
  therefore comparing against the real thing.
- Structure: five egress nodes 0-inbound; sink unchanged; all five probes → `rysSPgUssLDf6xJc`;
  both dym probes `onError: continueRegularOutput`, no credentials.

## 9.2 The gates — accepted

**F-PARITY.** Closed properly. All three invariants asserted, each with a control shown red,
bodies from the export. Two details raise it above the minimum I asked for: P1 also asserts
the four filters are **present**, so a rewrite that keeps both copies identical *while
dropping a filter* still trips — that closes the obvious hole in a pure equality check; and
the byte-identity control (append a newline) is the cheapest possible proof the comparison is
real. **Agreed that `parity.js` is correctly not a `mutate.sh` target**: `mutate.sh` exists to
prove a *behavioural* suite can go red by editing the body under test, whereas `parity.js`
reads the export by design and carries its controls internally. Forcing it through `mutate.sh`
would mutate the artifact it exists to police. The exemption is principled, not a shortcut —
record the reason next to the file so nobody "fixes" it later.

**F-XDC.** Gated, and it did the thing a good gate does: it went red, and the red was
*informative*. The tell that the assertion was wrong rather than the code — the pre-existing
un-annotated prose arm failing identically — is exactly the right diagnostic instinct, and it
is the difference between fixing a gate and corrupting one to make it green. The tightened
form (suffixes survive in order, no candidate line torn, block never lands mid-candidate)
asserts the property that actually matters rather than the incidental byte offsets I had
reasoned about. Better than what I asked for.

**F-CCS-STRIP.** Gated as specified (literal present, never spreads `$input`, no control key
assigned, control red) with the comment at the literal pointing at the gate. The comment plus
an executable assertion is the correct pairing — the comment tells the next reader *why*, the
gate stops them anyway if they don't read it.

## 9.3 🔴 The sentinel ruling — **KEEP it, correct the docs, and keep it checked FIRST**

This is the right question to have escalated, and the answer is not the one the framing
implies.

**The framing overstates the problem in one place and understates the stakes in another.**
"Dead code and therefore unexercised" is not accurate: the `_dym_probe_input` path **is**
exercised — by the offline suite, which drives it to `ok:false, reason:'probe_error'` with the
offer preserved. What is true is narrower and worth stating precisely: *the branch is
exercised by unit test but was not the branch the live induced failure took.*

**Why it stays.** Its original justification (diff §D7) was never "hedge against n8n changing
its semantics". It was a specific correctness argument: if `continueRegularOutput` emits the
input item, that item is a spread of the not-found payload, which **can legitimately carry an
`answers` key** from the get-results path — so shape-sniffing alone would read a *failed*
probe as a *successful empty* one. That misdetection produces `ok:true, answer_count:0`, which
renders a confident `- no certificate` on every candidate: **the single worst failure mode in
this entire change**, and the exact class we rejected the UUID union to avoid.

So deleting the sentinel would not be removing speculative compatibility code. It would remove
the only defence against an identified misdetection, in the scenario where it becomes
reachable. Against a cost of one boolean key (stripped downstream, zero customer and zero
session impact) and one `if`, that trade is clearly wrong.

**Required with the ruling:**

1. **Correct plan §3.6 and diff §D7** to record the *measured* behaviour — n8n emitted
   `{error: "…"}`, and the **`error`-key branch is the one doing the work**. The documents
   currently assert the opposite; leaving them is how a future reader deletes the wrong branch.
2. **Label the offline sentinel fixture as covering a hypothetical**, not a reproduction of
   observed behaviour, so its green is not misread as evidence about today's n8n.
3. **The sentinel must stay checked FIRST**, before the `error` branch and before the
   `answers` shape-sniff. That ordering *is* the protection in §D7's scenario.
4. **The `error`-key branch must not be deleted as redundant.** Agreed, emphatically — mark it
   in-code as the observed-behaviour detector so the two are not read as duplicates.

**Fail-open is now provably complete across all three possible n8n behaviours**, which is
worth recording because it is the strongest form of this argument:

| n8n behaviour on sub failure | detector | outcome |
|---|---|---|
| emits `{error: …}` | `dym-annotate` `error` branch | **observed** — `ok:false` ⇒ un-annotated |
| passes the input item through | `_dym_probe_input` sentinel (checked first) | unit-exercised ⇒ `ok:false` ⇒ un-annotated |
| halts / emits nothing | consumer-side `isExecuted` guard in `build-suggest-offer` / `compile-current-state` | `_dymOk` false ⇒ un-annotated |

Three behaviours, three independent detectors, one outcome. Defence in depth working as
designed — and the reason the answer is "keep" rather than "prune".

## 9.4 The two disclosed scope bounds, and disposal

**rev6→rev7 body diff — not required, and here is why it is not load-bearing.** The promote
protocol builds each of the three *modified* nodes as **LIVE + reviewed hunks** (§9.5 D11),
never by copying the clone. So an unnoticed rev6→rev7 change to a modified node cannot reach
live — it is structurally excluded, not merely unlikely. The exposure is limited to the **8
added nodes**, which *are* copied wholesale — and of those, 4 are covered byte-for-byte by
`parity.js`, 2 are trivial IF gates whose entire parameter set is one boolean expression, and
2 are config-only probes whose every leaf is enumerated in §9.5 D13/D17. Combined with all 219
assertions passing against the published rev-7 bytes, the state that matters is verified.
**Don't order a retrospective diff** (the mtime signal is genuinely gone and a reconstructed
one would be worse than no evidence). Instead, going forward: **snapshot `MANIFEST.json` per
rev** — it already carries per-node sha256, so one committed file per revision makes this
question answerable in future without any new tooling.

**S7b — confirmed, ruling holds.** Rev 7 adds no node and no edge, so containment is
structurally identical to what I accepted at rev 3 and re-accepted at rev 6. Per LESSONS §45
the LLEN reading was never the sound instrument; structural containment plus per-bracket sink
attribution remains the right basis. My rev-6 caveat still stands and should not be
re-inflated: every sampled bracket is +1, but the whole-population closure of the rev-3 ledger
no longer holds.

**Disposal — CONFIRMED, and verified rather than assumed.** I grepped every export for all
three IDs: `4AQFVgLB4skVjAzH`, `Es4WwjMHOEy9j62V`, `yHUqYrFuWCF1Plr3` — **no references in any
exported workflow**. I also re-confirmed all five clone probes point at `rysSPgUssLDf6xJc`, so
nothing was left pointing at the always-throws sub. **Safe to delete all three.** Do it before
promote so a stray armed artifact cannot be reached later, and re-run `--verify` afterwards.

## 9.5 CONSOLIDATED PROMOTE CHECKLIST — authoritative; supersedes §4, §6.5, §7.7, §8.5

Scope: **4 surfaces, 8 added nodes, 3 modified nodes.** Promote is user-gated and held pending
the CRM resolver decision.

### A. Housekeeping before promote
1. [ ] Delete the three throwaways (§9.4); re-run `export-workflows.py --verify`.
2. [ ] Correct plan §3.6 / diff §D7 per the sentinel ruling (§9.3 items 1–4).
3. [ ] Record the `parity.js` / `mutate.sh` exemption rationale beside the file (§9.2).
4. [ ] Fix the surface-table wording — `build-suggest-offer` has 4 arms, only D1 code mode is annotated; note `build-cs-member-offer` as considered-and-excluded (§8.1).
5. [ ] Mirror the `stock details` wording rationale into the plan (code-side is already correct).

### B. 🔴 Re-verify at promote time — live has drifted THREE times today
6. [ ] `export-workflows.py --verify` green **immediately before** the first write.
7. [ ] **Re-assert every baseline against the then-current live**: `live-bso.js`, `live-ccs.js`, `live-ec.js` and `crossdomain-compose.js` each sha-identical to the live node they mirror. **If any has drifted, STOP** — every byte-identity, discrimination and F-XDC gate is void until rebaselined and the suites re-run. This is the single highest-value check on the list: live moved `f03086ac → 533499f4 → f9205b03` during this change, none of it ours.
8. [ ] Re-run all four suites (`parity`, `harness`, `byteid`, `ccs-harness`) against the refreshed export.
9. [ ] Live draft == active (LESSONS §23/§24); stage any foreign draft as its own semantic-no-op publish (§51). Given three same-day drifts, assume a foreign draft until proven otherwise.
10. [ ] Backup live `versionId` + the three pre-change bodies (`build-suggest-offer`, `compile-current-state`, `escalate-catalog`). Rollback = publish the prior versionId.

### C. Live-promote deltas — spine `9qVyfUxmRQqrpGRMDLRuz`, target by node **NAME**
11. [ ] **Modified (3) — LIVE body + reviewed hunks only** (LESSONS §57), trailing whitespace stripped (§58b):
     • `build-suggest-offer` — 11-key `_DYM_CTRL_KEYS` strip; `_dymOk/_dymHas/_dymProbed/_dymNoun`; D1 code-mode annotate/sort/render with **`return hb - ha;`** (no tiebreak); the require-specific `escalate_message` block (~:220) with **no reordering** — the numbers are the pick affordance.
     • `compile-current-state` — partial-resolution annotation (~:345-372); **keep `let output = {}`** and its comment (F-CCS-STRIP).
     • `escalate-catalog` — the rev-6 preference order.
12. [ ] **After building `build-suggest-offer`, re-run `parity.js` against the promote-target body** — invariant 1 (`tokenCandidates` ↔ `dym-transform`) is most likely to break at exactly this step.
13. [ ] **Added (8):** `dym-transform`, `dym-gate`, `dym-probe`, `dym-annotate`, `dym-transform-partial`, `dym-gate-partial`, `dym-probe-partial`, `dym-annotate-partial`. The two transform bodies go up **byte-identical**; the two annotate bodies identical **except** `_PAYLOAD_SRC` / `_XF_SRC`.
14. [ ] 🔴 **Both probes → `rysSPgUssLDf6xJc`, NOT `Fss5aAaXthJSWpZCgKiKR`** (§6.2 — both probe tools are company-scoped per AC-F7, `MCP Client1` passes `jsonInput: {{ $json }}`, and only the fork's `entity-ids-transformer` sets `out.contact_id`/`out.space_id`). Re-diff the two subs immediately before promote; if `Fss5aAa` has gained scope parity, prefer it and say so explicitly.
15. [ ] Do **not** copy `is_test` or any clone-only leaf into `workflowInputs`; re-derive `contact_id`/`semantic_input`/`user_prompt` from the **live** `sibling-probe` (LESSONS §48).
16. [ ] **Edges — remove 2, add 12:** remove `sibling-gate[1] -> build-suggest-offer` **and `central-exchange[0] -> compile-current-state`**; add the six D1 and six partial-lane edges. Then re-count on live: `build-suggest-offer` inbound **exactly 4**, `compile-current-state` **exactly 5**, `Aggregate1` **exactly `If6[1]`** — the last one is what proves the lanes stayed disjoint.
17. [ ] Byte-gate each node: update draft → re-fetch → assert draft == file → publish **only** on match → assert active == file. Abort on mismatch; never force.
18. [ ] Assert both probes carry **no credential** and `onError == continueRegularOutput`, on node **TYPE** (LESSONS §47).

### D. Post-promote — verify each surface separately (LESSONS §56)
19. [ ] **Non-enabled-domain D1 miss byte-identical** — highest blast radius; the 11-key strip runs on most traffic.
20. [ ] **Answered turn with no dym set byte-identical** — `compile-current-state` is now on a new lane for *every* answered turn.
21. [ ] Surface 1 — enabled-domain D1 miss annotates; `suggest_quick_reply` bare codes, index-aligned.
22. [ ] Surface 2 — partial-resolution turn annotates.
23. [ ] Surface 3 — require-specific picker annotates **and the suffix reaches the customer**: verify the *rendered message*, not `build-suggest-offer`'s output object. This is the rev-6 defect.
24. [ ] F-DUPE turn renders bare with `dym_excluded_codes` populated, on **both** the D1 and picker lanes.
25. [ ] Exercise `sibling-probe[0]` into `build-suggest-offer` (§DP-12's untested half).
26. [ ] Confirm no control keys appear in a real `conversation-variables` PUT payload (F-CCS-STRIP — live-only observable; the clone's `save-session-vars` is orphaned).
27. [ ] Watch for a day: all-negative rate per domain, `dym_excluded_codes` volume, probe error rate (the Cloudflare 504s).
28. [ ] Re-run `export-workflows.py`; commit refreshed exports **and a `MANIFEST.json` snapshot** (§9.4).

### E. Accepted-with-note — do not re-litigate at promote
§DP-15b live, §DP-3b `unscoped_probe` live, §DP-9 live, §DP-13b dynamic, §DP-12's
`sibling-probe[0]` inbound. Several are hard to trip *because* the design is fail-open, which
is the property we want. §DP-12 is the top post-promote item (D25).

### F. File separately — do not bundle
- **Resolver cross-company twin** — the root cause of F-DUPE and the subject of the decision currently holding promote: `entity_resolver.py:_probe_product` selects no `company_id` and applies no company filter, while the MCP data tools are company-scoped. That mismatch *is* F-DUPE, and it likely contributes to the measured 67% dead-end rate this change set out to fix.
- **Live `sibling-probe` / `crossdomain-probe` call company-scoped tools unscoped** (§6.2) — also the precondition for ever re-pointing the probes at `Fss5aAa`.
- **Digit-on-merged-offer silent escalation** (F-MERGE), plus the standing rule that any new `DOMAIN_PROBE` entry be checked against `cs-offer-gate`'s `customer_service`/`order_enquiries` pair before enabling.

## 9.6 Close

Seven revisions, and each one was moved by evidence rather than by assertion. The record worth
keeping is not the defect list but the pattern in it: **every serious finding was a case where
something was computed correctly and then silently discarded or misread downstream** — the
gate-FALSE payload clobber, the arbitrary twin UUID, `escalate-catalog` re-sourcing by name,
and three of four surfaces never enumerated. The counter-measure that actually worked was
never more review; it was adding an observable (`dym_excluded_codes`), asserting at the node
that feeds the send rather than the node that computes the text, and keeping a pre-change
consumer as a built-in negative control. That last pattern is now standing policy (§8.3
item 4) and is the most portable thing this change produced.

The sentinel ruling is the same principle pointed at production code rather than tests: keep
the branch that defends against a known misdetection, document which branch is actually
load-bearing, and never let "unexercised" be confused with "unnecessary".

**APPROVED. Promote when the user releases it.**

---
---

# 10. RE-RULING — F-SUB WITHDRAWN. Promote target is `Fss5aAaXthJSWpZCgKiKR`.

**The coordinator is right and I was wrong.** §6.2's F-SUB-SCOPE reversal rests on a false
premise. I have verified the correction directly and I withdraw the reversal. The **rev-1
recommendation was correct all along**: `dym-probe` and `dym-probe-partial` promote onto
**`Fss5aAaXthJSWpZCgKiKR`**.

## 10.1 What I got wrong, and how

Verified just now on current exports (`--verify` green):

```
LIVE Fss5aAa  entity-ids-transformer.js:80  out.contact_id = semantic_input?.contact_id;
                                        :81  out.space_id   = semantic_input?.space_id;
FORK rysSPgU  entity-ids-transformer.js:80  out.contact_id = semantic_input?.contact_id;   IDENTICAL
                                        :81  out.space_id   = semantic_input?.space_id;   IDENTICAL
                                        :90  out.contact_id = $input.first().json.contact_id.trim().toString()
                                        :91  out.space_id   = "364817"
```

**Both subs forward scope. The live sub was never unscoped.**

The mechanism of my error matters more than the conclusion. At rev 1 I ran a `diff` of the two
files and got a single hunk — `90c90,91`, a blank line replaced by two assignments. From "the
fork has two extra lines that set `contact_id`/`space_id`" I concluded "the live sub does not
set them". **That inference is invalid.** A diff hunk is a *relative* statement about where two
files differ; I used it as an *absolute* statement about what one file contains. Lines 80–81
sat outside the hunk and I never looked. A one-line `grep -n "out.contact_id"` against the live
file — which I ran today and should have run then — would have shown them immediately and the
reversal would never have happened.

Two aggravating factors worth recording:

1. **The false link was embedded in a chain whose other links were true.** "These tools are
   company-scoped (AC-F7)" — true, verified from `test_company_scope_params.py`. "`MCP Client1`
   passes `jsonInput: {{ $json }}`" — true, verified in both subs. "Only the fork sets the scope
   params" — false, inferred. Two verified premises made the third feel verified. A chain is not
   evidence for its own weakest link.
2. **I wrote a bounding statement that was itself false.** §6.2 says: *"Bounding what I actually
   proved: I verified the params are absent from the call."* I did not verify that. I inferred
   it. Performing the ritual of stating limits, while the claim inside the limit was unchecked,
   is worse than not bounding at all — it signals diligence that did not occur, and it is
   exactly the "verification that cannot fail" class I spent this review policing in others.
   Recording it as such.

## 10.2 The three rulings requested

### (1) Is `Fss5aAaXthJSWpZCgKiKR` the correct promote target? — **Yes. Reversal withdrawn.**

`dym-probe`'s `semantic_input` (verbatim from `sibling-probe`) populates
`contact_id: $("sorento-sub-respond-findcontact-respond").first().json.id.toString() ?? null`
and `space_id: "364817"`, so lines 80–81 receive real values on our path. The live sub is
correctly scoped for exactly the two probe tools this change calls.

It is also the right target on the original grounds, now unopposed: it matches the live **probe**
precedent (`sibling-probe`, `crossdomain-probe`), and it avoids deepening the F6 anomaly by
wiring new live nodes to a fork named "TEST".

**And the fork-based testing remains valid evidence for it.** I checked the values, not just the
code paths: fork line 90 re-derives `contact_id` from the trigger input (`.trim().toString()`)
and line 91 hardcodes `"364817"` — both resolve to the **same values** that lines 80–81 produce
from `semantic_input` on our path. The override is a value-level no-op for `dym-probe`. So revs
1–7 of probe behaviour transfer to `Fss5aAa` rather than needing re-proof.

### (2) Does the hardcoded `space_id` make the fork wrong as a *test* target? — **No, and the framing is half right.**

The literal is **not** distinctive test scaffolding. It is the house style on live: I counted
the `364817` literal in **8 live spine nodes** — `resolve-entity`, `get-access-types`,
`check-access`, `Call 'sub-get-results'`, `resolve-entity-clarification`, `probe-incoming`,
`sibling-probe`, `crossdomain-probe`. The production spine bakes the workspace id into
expressions in eight places; the fork's line 91 merely repeats it one layer down. So "promoting
onto a sub carrying a hardcoded workspace literal" would not have been importing scaffolding —
it would have been importing the same literal live already carries everywhere. That does not
change the target decision (which is now settled on other grounds), but the argument should not
go into the record uncorrected. **File the hardcoded-`space_id` sprawl as its own hygiene item**
— it is the kind of thing that silently breaks a second workspace.

**Is it masking a scoping bug in the clone's runs?** Effectively no, with one narrow caveat
worth writing down. `space_id` cannot diverge — `semantic_input.space_id` is itself the literal
`"364817"`, so lines 81 and 91 agree by construction. `contact_id` *could* diverge in principle:
the fork sources it from the trigger input while live sources it from
`semantic_input.contact_id`, and if the latter were ever null the fork would mask it. In
practice `.toString()` on a present id cannot yield null (it would throw), so the risk is
theoretical. **The clone stays on the fork** — no change, and rewiring it now would discard the
run history for no gain — but this is precisely why §10.4 D-item 23 (verify a real annotated
turn post-promote on the live sub) is not ceremonial.

### (3) What else depended on the false premise?

Three items. Two must be withdrawn outright.

| location | status |
|---|---|
| **§6.2 F-SUB-SCOPE** (the whole finding) | **WITHDRAWN.** The premise is false. |
| **§9.5 item C14** — "Both probes → `rysSPgUssLDf6xJc`, **NOT** `Fss5aAa`" | **INVERTED** — see §10.4. The planner's flag on this item was correct. |
| **§9.5 F**, third bullet — "Live `sibling-probe`/`crossdomain-probe` call company-scoped tools unscoped" | **WITHDRAWN — this finding is false.** Both call `Fss5aAa`, which forwards scope from `semantic_input`, which those nodes populate. There is no isolation gap there. Anyone acting on that bullet would have "fixed" working code. |
| §7.7 item 9 / §8.5 D13 (historical) | superseded by §10.4; annotated as resting on the withdrawn premise. |

**What does *not* change.** My §6.1 F-DUPE analysis is unaffected and, if anything, is now on
firmer ground. It concluded that the probe is correctly company-scoped and that the twin UUID
therefore returns nothing — that conclusion required only that *our* call is scoped, which is
true from either sub. The new CRM trace supplies the missing half of the mechanism: the twins
arrive under `alternatives` with `match_tier: "trgm"`, i.e. from `entity_resolver.py`'s raw
`text()` tier, where `do_orm_execute` short-circuits on a `TextClause` so `apply_company_scope`
never applies. So the leak is on the way **in** (resolver, unscoped) and the correct-empty is on
the way **out** (probe, scoped). That is exactly the asymmetry §6.1 described.

It also **strengthens my rejection of the UUID union.** §6.1(b2) said unioning risked asserting
another company's document, and hedged that both UUIDs were "plausibly within the contact's
entitled set". That hedge is now resolved in the unfavourable direction: the twin is a genuine
cross-company leak through unscoped fuzzy matching, not a dual grant. Union would have asserted
another tenant's data. The exclusion remedy was right for a reason we could not fully see then.

## 10.3 The planner's `multi_uuid_code` finding — confirmed, and it changes nothing I signed off

Verified: `build-suggest-offer` references `dym_excluded_codes` **only** in `_DYM_CTRL_KEYS`
(the strip list). It never reads it for rendering. So an excluded code renders normally and
stays pickable; `multi_uuid_code` suppresses the **suffix**, not the **offer**. The planner is
right, and the production evidence (`chat_histories` 9151571) matches.

This is what I approved. §6.1's accepted remedy was stated as *"it renders bare while its
unambiguous siblings are labelled"* — bare, not absent. The justification I signed off was never
"exclude the code from the offer"; it was *we cannot attribute the claim, so make no claim*,
which is the same argument the planner says it now survives on. Nothing to revisit.

Two follow-ups, neither blocking:

- **The names mislead.** `dym_excluded_codes` and `probe_skip_reason: 'multi_uuid_code'` mean
  *excluded from probing*. A future reader will assume suppression from the offer. Document it
  at the constant, or rename to `dym_unprobed_codes`.
- **The underlying wrong-pick is untouched and remains the real defect.** The customer can still
  pick the twin code and be routed to an arbitrary company's product — the exclusion prevents a
  false *label*, not a wrong *destination*. §6.1 already filed this as "the bigger defect this
  exposes"; the CRM trace now names its cause precisely (`entity_resolver.py` never imports
  `company_sql_predicate`, which the repo already ships and uses in two other services;
  `tests/test_raw_sql_company_scope.py:3` documents the gap). That is the decision holding
  promote, and it is worth more than this feature.

## 10.4 CORRECTIONS TO §9.5 — apply these; everything else in §9.5 stands

**Replace item C14 with:**

> 14. [ ] 🔴 **Both probes → `Fss5aAaXthJSWpZCgKiKR`** (the live published sub), **not** the
>     clone's `rysSPgUssLDf6xJc`. Both subs forward `contact_id`/`space_id` from
>     `semantic_input` (lines 80–81, identical), and `dym-probe`'s `semantic_input` populates
>     both, so the live sub is correctly company-scoped for both probe tools. This also matches
>     the live probe precedent (`sibling-probe`, `crossdomain-probe`) and avoids wiring new live
>     nodes to a "TEST"-named fork. Copying the clone's `workflowId` here is the LESSONS §48b
>     footgun — it would repoint a live path at a harness artifact.
>     **Pre-flight:** re-diff the two subs and confirm the only delta is still the fork's extra
>     lines 90–91; if the live sub has gained or lost a scope assignment, stop and re-rule.

**Delete the third bullet of §9.5 F** ("Live `sibling-probe`/`crossdomain-probe` … unscoped").
False. Replace with:

> - **Hardcoded `space_id: "364817"`** in 8 live spine nodes plus the get-results fork. Hygiene,
>   not a defect today; it is what would break a second workspace.

**Add to §9.5 D (post-promote), as item 23a:**

> 23a. [ ] After promote, verify one real annotated turn on **each** enabled domain running
>      through `Fss5aAa` — the clone tested against the fork, and although the effective
>      `contact_id`/`space_id` values are identical (§10.2), the sourcing differs and this is
>      the only step that closes it on the real target.

**§9.5 F, first bullet — strengthen:** the resolver item is no longer "likely contributes"; the
mechanism is now traced. Record it as: *`apply_company_scope` is a router-level dependency whose
`do_orm_execute` hook short-circuits on `TextClause`, so every raw `text()` probe in
`entity_resolver.py` runs unscoped — trgm product/customer/order/promotion/transporter, tier-3
embedding, variant graph, RAG phrase. `company_sql_predicate` already exists in the repo and is
used in two other services; `entity_resolver.py` never imports it.* See
`plans/multi-company-resolution-plan.md`.

## 10.5 ⚠️ Separately — the approved clone version has moved

My §9 APPROVE was issued against clone **`5d6f9593`**. `--verify` now reports
**`3a196c44`**. Nobody flagged a rev 8.

I checked before writing this, and **the reviewed surface is intact**: all seven approved node
bodies (`build-suggest-offer`, `dym-transform`, `dym-annotate`, `dym-transform-partial`,
`dym-annotate-partial`, `compile-current-state`, `escalate-catalog`) are sha-identical to the
offline copies I verified at `5d6f9593`; both probe targets are unchanged; all four suites still
pass. So the approval stands on substance.

But the point of hash-gating is that a moved pointer must be *accounted for*, not assumed
benign. **Before promote, state what changed between `5d6f9593` and `3a196c44`** — most likely
the throwaway disposal or the §9.5A documentation edits, both expected. If it is anything that
touches a node, the §9 approval does not automatically extend to it. This is the same discipline
§9.5 B7 applies to live drift, pointed at the clone.

## 10.6 Standing verdict

**APPROVE stands**, with the promote target corrected to `Fss5aAaXthJSWpZCgKiKR`, §6.2
withdrawn, and the two false bullets removed from the record. Promote remains held by the user
pending the CRM resolver decision.

The lesson I am leaving in this file for whoever reads it next is not about workflow ids. It is
that I spent seven revisions correctly insisting that others prove their claims could fail, and
then shipped a reversal built on an inference I never tested — from a `diff` hunk, which by
construction cannot tell you what a file contains. The check that would have caught it cost one
`grep`. **Prefer a positive assertion about the artifact you care about over a differential
against something else**, and when a conclusion rests on absence, verify the absence directly.
