# Review — `mc-label-n8n` (multi-company reply clarity, n8n half)

| pass | date | verdict | commit | bodies reviewed |
|---|---|---|---|---|
| 1 | 2026-08-17 | REQUEST-CHANGES (B1, B2, B3) | `a0d2a45` | rev-0 |
| 2 | 2026-08-17 | APPROVE | `1975815` | rev-1 |
| — | 2026-08-17 | *(second independent review — substitute-codex — found MAJOR-1/2, FIX 1/2, VERIFY 3)* | — | rev-1 |
| **3** | **2026-08-17** | **APPROVE** | **this document** | **rev-2** |

Branch `fm/mc-label-n8n` · coder `267af01` · tester `7caa2a0` (7/7 PASS) · diff doc
`n8n-workflows-init/tests/diffs/mc-label-n8n.md`

**n8n MCP unavailable in every pass.** All checks read-only over the public REST API. No PUT/POST/DELETE was ever
issued by the reviewer. No workflow was edited by the reviewer.

---

# VERDICT: APPROVE (rev-2)

Both rev-2 fixes and the one hardening are correct, independently replayed against the **live** pre-change bodies, and
scoped to exactly what they claim. Zero egress still clean. The promote checklist below carries the refreshed shas.

**Two of the three rev-2 items are corrections to calls I made in pass 2.** Recorded plainly in §4, because a review
that quietly absorbs its own misses teaches nobody anything.

---

## 1. Published state — verified on the server

| check | result |
|---|---|
| clone `txiPzSxy3Pclsz6v` | versionId `33746137-f998-4105-abe3-2d591997ce39` `== activeVersionId`, `active: true` |
| `not-found-error-message` sha256 | `79888de7862725448d10fd0210bf8d8dcf1da6fbd131b1c3427ddc94db2f3da1` — matches artifact, 404 lines |
| `crossdomain-zeroset` sha256 | `a880d01e3629538bdde874f60875b481af7415acb6c7f12d4795171074518f92` — matches artifact, 143 lines |
| `t4QvrtrPnTwRU6br` | untouched at `179f1842-8061-4e59-9c72-74ad2b602f29`; `output-structurer` still `25a2eed9…` |
| structural re-diff vs pre-edit backup | **still only** those two `parameters.jsCode` leaves; no node added/removed; `connections` / `settings` / `pinData` / `staticData` identical |
| all three artifacts | parse clean (`new Function`) |
| drift | rev-2 `not-found` diffs against **live current** as 4 mc-label hunks; `crossdomain-zeroset` as 3. No drift promoted. |

The rev-1 → rev-2 delta is **exactly three hunks** across the two files — FIX 1, FIX 2, VERIFY 3. Nothing rode along.

---

## 2. FIX 1 — the found-lines cap. Real defect, correctly fixed

Rev-1 skipped the `(+N more)` cap for the entire turn whenever `_multiCo`. I replayed a turn resolving 8 distinct
products across 2 companies against all three bodies:

| body | `• product:` line |
|---|---|
| LIVE (pre-change) | `P1 (+7 more)` |
| **rev-1 (which I approved)** | `P1 (Mocha), P1 (Sorento), P2 (Mocha), P2 (Sorento), … P8 (Mocha), P8 (Sorento)` — **16 labels into one WhatsApp reply** |
| **rev-2** | `P1 (Mocha), P1 (Sorento) (+7 more)` |

Rev-2 groups by bare code, renders the representative group in full — naming its company variants is the whole point
of the qualification — and counts the remaining **distinct codes**. That is the right shape: it keeps the fact the
change exists to state while restoring the cap that keeps the line a summary.

**Single-company is byte-identical by construction and by replay.** `_bareLabel` is the identity when `!_multiCo`, so
every label is its own group and the expression collapses to `codes[0] + (+N more)`. Replayed on a single-company turn
with 8 distinct products: LIVE, rev-1 and rev-2 all produce `P1 (+7 more)` — identical. Replayed on the case-1 shape
(one code, two companies): rev-1 and rev-2 identical, cap never engages. No regression on the change's core purpose.

---

## 3. VERIFY 3 — `brand`/`category` excluded from the searched-company claim. Endorsed

The premise is not taken from the diff doc; I verified both halves against live code:

* **The gate passes them.** Live `disallowed-entity-gate`: `inventory: ['product','category','brand']`,
  `incoming: ['product','inbound_shipment','category','brand']`.
* **The tool never queries them.** Live `entity-ids-transformer`'s `entity_type → *_ids` map contains `product`,
  `promotion`, `order`, `customer_order`, `order_number`, `customer`, `transporter`, `form`, `shipment`,
  `inbound_shipment`, `attachment_type`, `attachment`, `certificate` — **no `brand`, no `category`**. Both fall through
  to `unmappedTypes`.

So a category resolved in Mocha beside a product resolved in Sorento made rev-1 say *"checked in Sorento and Mocha"*
about a lookup that only ever queried Sorento's product id. Replayed:

| shape | LIVE | rev-1 | rev-2 |
|---|---|---|---|
| product@Sorento + **category**@Mocha | `• product: SKU` / `• category: CAT` / `…matched these.` | `SKU (Sorento)` / `CAT (Mocha)` / `…matched these — checked in Sorento and Mocha.` | **byte-identical to LIVE** |
| product@Sorento + **brand**@Mocha | as LIVE | over-claims the same way | **byte-identical to LIVE** |

Rev-2 does not merely drop the suffix — `_multiCo` goes false, so the labels stay bare too. That is the conservative
outcome, and it is the right one.

I also endorse the **deny-list over allow-list** choice and the reason given: every other allowed type carries a tool
param today, so if the CRM later gives `category` one, this **under**-claims (omits a company we did search) rather
than over-claiming. Silence is recoverable; a false statement about work not done is not. That is the correct
direction to fail in, and it matches the B1 principle.

---

## 4. FIX 2 — and a call I got wrong in pass 2

Pass 2, non-blocking finding 3, I wrote of the `ex.uuid` backfill: *"I traced the call sites: no path adds a code with
a falsy uuid before one with a uuid … so it is unreachable today. Informational."*

**That was wrong, and the reasoning was the flaw:** I checked that the call sites *pass* `m.uuid`, which is not the
same as `m.uuid` being *truthy*. A resolution whose first exact match carries a null/absent uuid and whose second
carries one reaches it directly. Replayed against the live pre-change body:

| body | `_xd` on that single-company shape |
|---|---|
| LIVE | `active: false`, `missing[0].uuid: null`, `probe_entities: []` |
| **rev-1** | `active: **true**`, `missing[0].uuid: "u1"`, `probe_entities: [{u1}]` — **starts a cross-domain probe that does not run today** |
| **rev-2** | identical to LIVE |

That is behaviour change outside the change's blast radius, on a *single-company* turn — precisely the class of
regression this whole review exists to prevent, and I cleared it. The substitute reviewer was right. Rev-2 removes the
backfill; `uuid` keeps first-add semantics exactly as before mc-label, and only the `uuids` union is new. Replayed:
the intended two-company shape still produces the union and both `probe_entities`.

**Also under-weighted in pass 2:** I logged the cap removal (FIX 1) as *"consider grouping as `MWC-SC08B (Mocha,
Sorento)` in a follow-up"* — filed as UX polish. Dumping 16 product labels into a customer's WhatsApp message is a
summary-line regression, not polish. I should have blocked on it.

Both misses share a root cause: on rev-1 I reasoned about reachability from the call sites and from the *intended*
shape, instead of replaying the adversarial shape. The fix in method is the one the substitute review demonstrated —
construct the hostile input and run it. §5's replays are built that way.

---

## 5. Zero egress — re-confirmed on rev-2

* **Structural.** Only the two `jsCode` leaves differ from the pre-edit backup; `connections`, `settings`, `pinData`,
  `staticData` identical. No egress node touched at any revision.
* **Runtime (execs `12782358`, `12782576`).** `save-session-vars`, `update-human-intervened`,
  `send-message-files/images/video`, `Call 'sub-human-intervention'` **absent from runData**. Only
  `get-session-vars-http` (GET), `resolve-entity-http`, `check-access-http` (read queries) executed. Both carry
  `mode:"uac"`, `scope:"chat-console"`, and a matching `test_run_id`.
* **Ran against rev-2, proven not assumed.** I hashed both node bodies out of each execution's own `workflowData`:
  `79888de7…` and `a880d01e…`. The runs used the fixed code.
* **S1 swept again.** All 6 `aQUmwMVplmNcyUVc` sendmsg sub-executions since rev-1, including both rev-2 runs
  (`12782373`, `12782588`): the respond.io `HTTP Request` node executed in **none**. Delivery was redis `chat-push`.
* **Observed outputs.** Case 1: `• product: MWC-SC08B (Mocha), MWC-SC08B (Sorento)` + `— checked in Mocha and
  Sorento`, `_xd.missing[0].uuids` carrying both. Case 2: bare label, no suffix, **no** `uuids` key. Exactly as
  specified.
* **Live untouched.** `9qVyfUxmRQqrpGRMDLRuz` `469e7259…` (2026-08-11), `rysSPgUssLDf6xJc` `eb0bbcec…` (2026-08-10),
  `Fss5aAaXthJSWpZCgKiKR` `fd248b16…` (2026-08-11) — all `versionId == activeVersionId`, all four promote baselines
  re-read and unchanged.

---

## 6. Dispositions and open items

**MAJOR-1 (silent line names the union of requested codes, not that company's own codes) — accepted.** The sentence
`*Sorento:* no stock records for A, B` is factually true when A and B were both requested and Sorento returned neither.
Agreed; no change warranted.

**MAJOR-2 (row-name ↔ lookup-name exact string join) — accepted as a named contract dependency.** Both names come from
the *same* `names` map in PR #193's single `stamp_lookup_companies` batched query, so a format divergence cannot arise
without splitting the sources. The doc's warning is the right artifact, and it correctly states that **B1's
`_canAttribute` guard does not cover this** — rows would still be attributed, so the block still speaks.

> **Factual correction to that note.** It says the id-join fix is available because *"the ids are already on both
> sides."* They are not, yet. I checked the case-4 envelope (exec `12778383`): the rendered item has keys
> `['title','fields','flags']`, its field keys are `['company_name','product_code','warehouse','system_location',
> 'quantity_on_hand']`, and `company_id` appears nowhere on the item. `lookup_companies[].id` exists; the **row side
> does not carry an id**. So the id-join would first need the backend to emit `company_id` on the row. Non-blocking —
> this is a future-fix sketch, not shipped code — but someone acting on that note later would be surprised, so it is
> recorded here.

**`incoming_stock` row-stamp — still unobserved**, carried forward from pass 2. Non-blocking for the same reason:
`_canAttribute` is shared by both presenters, so n8n is correct under either backend outcome — labels if stamped,
silence if not.

### Carried forward, still valid
Single-company output byte-identical (re-replayed at rev-2). Captain's rule honoured — and VERIFY 3 tightens it
further, since `_searchedCos` is now not merely "not the access list" but "only what became a tool id". No state
pollution (`compile-current-state` is explicit-key; `found_summary` is display-only). Clone `disallowed-entity-gate`
remains behind live (0 `access_notice` occurrences vs 4) — **follow-up: rebase in a separate change.** Remaining
non-blocking nits: `crossdomain-probe`'s prompt repeats the code; `_coOfRow`'s `label === 'Company'` fallback would
misread an orders envelope if `lookup_companies` ever rides one; partial row-stamping can still yield a false silent
line (needs a row with NULL `company_id`).

---

# 7. PROMOTE CHECKLIST (final, rev-2)

**Promotion is USER-GATED. This checklist authorises nothing.** Three artifacts → **four** target nodes. No guard
scaffolding to strip: no `IF test_mode` gate was built and no egress node touched, and all three artifacts are
live-based, so the promoted diff *is* the business-logic diff.

### P1 — artifact → target mapping

| # | artifact (sha256, **rev-2 final**) | target workflow | node | target's current sha256 — **gate on this** | revert versionId |
|---|---|---|---|---|---|
| 1 | `output-structurer.js`<br>`25a2eed93b7fe677a6e1d7d9002522fc3051e4bae415ebe645377ad25f4973de` *(unchanged at rev-2)* | `rysSPgUssLDf6xJc` | `output-structurer` | `68bd130cf367bb7aa644e6bb79194f7360c7430a8d2c6d642d3c2d80b6126935` | `eb0bbcec-daab-4c79-8a68-c7d5eca5cf0a` |
| 2 | `output-structurer.js` *(same bytes)* | `Fss5aAaXthJSWpZCgKiKR` — **MANDATORY** | `output-structurer` | `68bd130cf367bb7aa644e6bb79194f7360c7430a8d2c6d642d3c2d80b6126935` | `fd248b16-82ee-4307-abfb-657b9b6a4aa7` |
| 3 | `not-found-error-message.js`<br>**`79888de7862725448d10fd0210bf8d8dcf1da6fbd131b1c3427ddc94db2f3da1`** | `9qVyfUxmRQqrpGRMDLRuz` | `not-found-error-message` | `d796e28d84e302130546e750eafaa901f9d5cfb81093a4f401c616536891fee3` | `469e7259-6cfb-4505-bef4-f37a36bf454f` |
| 4 | `crossdomain-zeroset.js`<br>**`a880d01e3629538bdde874f60875b481af7415acb6c7f12d4795171074518f92`** | `9qVyfUxmRQqrpGRMDLRuz` | `crossdomain-zeroset` | `2eef3fa37454d5931e50747631df0463e152afdd58e6aeecea0a804040646245` | `469e7259-6cfb-4505-bef4-f37a36bf454f` |

⚠️ **Rows 3 and 4 changed at rev-2.** Any checklist copy carrying `cfd8a380…` / `2c562c7e…` is stale — those are rev-1
and must not be promoted. All four *baseline* shas re-read from the server at this re-review and unchanged.

### P2 — pre-flight, per target
- [ ] `versionId == activeVersionId` and `active == true` (no unpublished draft — LESSONS 24: publish ships the
      *whole* draft; a stale draft is a revert-landmine).
- [ ] Target node's current jsCode sha equals the P1 baseline. **Mismatch ⇒ STOP and re-review.**
- [ ] Back up each full target workflow JSON to `n8n-workflows-init/tests/backups/mc-label-n8n/` with a
      `-promote-pre` suffix; record its versionId as the revert target.
- [ ] `diff -u <live node body> <artifact>`: expect **4 hunks** for `not-found-error-message`, **3** for
      `crossdomain-zeroset`, **3** for `output-structurer`. Anything else = unexpected drift, stop.

### P3 — publish: byte-exact, sha-gated (LESSONS 25 / 32 / 33 / 37)
- [ ] **Subs before the spine:** `rysSPgUssLDf6xJc` → `Fss5aAaXthJSWpZCgKiKR` → `9qVyfUxmRQqrpGRMDLRuz`.
- [ ] Never hand-retype a 21–24 KB `jsCode`; source the exact bytes from the committed artifact.
- [ ] **MCP available:** `setNodeParameter {nodeName, path:"/jsCode", value}` — one leaf, byte-exact — batched into a
      single `update_workflow` per workflow (spine gets both nodes in one atomic call).
- [ ] **MCP unavailable:** `PUT $N8N_API_BASE/workflows/{id}` with a **settings-whitelist** body, then
      `POST $N8N_API_BASE/workflows/{id}/activate`; both must return 200. Carry `executionOrder`, `availableInMCP`,
      `callerPolicy` and (spine) `binaryMode` through explicitly and re-verify after.
- [ ] **Gate the draft BEFORE publish:** draft node sha must equal the artifact sha. Draft ≠ intended ⇒ do not publish.
- [ ] **Gate the active AFTER publish:** `versionId == activeVersionId`, `active == true`, node count unchanged,
      `connections`/`settings`/`pinData` identical to the P2 backup, only the intended node differing at the intended sha.
- [ ] **Any mismatch ⇒ auto-revert now:** publish the P1 revert versionId, confirm `active`, halt the promotion.

### P4 — post-promote watch, with revert triggers

Each item names what to look at and what makes it a revert rather than a follow-up.

- [ ] **All four target nodes** at the artifact shas; no other node differs from its P2 backup.
      *Revert trigger: any unintended node differs.*
- [ ] **First live multi-company turn with rows:** `*Company:*` on every row; **no** "no … records" line under a
      company that did render rows. *Revert trigger: a silent-company line under a company that returned rows.*
- [ ] **First live multi-company all-empty turn:** both company names + ` — checked in A and B`.
      *Revert trigger: a company named that was not searched.*
- [ ] **First live single-company turn:** byte-identical to before — no `(Company)` suffix, no ` — checked in`, no
      `Company:` row field. *Revert trigger: any single-company wording change.*
- [ ] **NEW (FIX 1) — first live multi-code multi-company turn** (several distinct products resolving across
      companies): the `• product:` line shows the representative code's company variants **plus `(+N more)`**, not an
      unbounded dump. *Revert trigger: a found-line naming more than one distinct code's variants — the cap failed and
      customers get a wall of labels.*
- [ ] **NEW (VERIFY 3) — first live multi-company miss involving a brand or category** (e.g. a product in one company
      alongside a category resolved in another): the reply must carry **no** ` — checked in …` suffix and **no**
      `(Company)` labels, because the tool never queried the category's company. *Revert trigger: a "checked in" claim
      naming a company reachable only via a `brand`/`category` entity — that is a false statement about work not done.*
- [ ] **NEW — `incoming_stock` row-stamp** (§6, open): first live multi-company *incoming* answer returning rows —
      either it carries `*Company:*` (backend stamps; labels correct) or it stays silent (`_canAttribute` false;
      correct by design). *Not a revert trigger either way.* If silent, raise a **backend** follow-up to stamp the
      incoming presenter — **do not** patch it in n8n by loosening the guard.
- [ ] **MAJOR-2 contract watch** (§6): if the backend ever sources row `company_name` and `lookup_companies[].name`
      separately, the exact-string join breaks toward false silent lines and `_canAttribute` will **not** catch it.
      The id-join fix additionally requires the backend to start emitting `company_id` on the row — it does not today.
- [ ] Keep P2 backups and P1 revert versionIds to hand for the first full day; revert is a single publish.

### P5 — do not
- [ ] Do **not** promote `output-structurer` to only one of the two subs.
- [ ] Do **not** promote the rev-1 shas (`cfd8a380…` / `2c562c7e…`).
- [ ] Do **not** edit live mid-cycle for anything else while this promotion is open.
- [ ] Do **not** fold the clone `disallowed-entity-gate` rebase into this promotion.

---

## Appendix — reviewer method across all three passes

Read-only REST only. `GET /workflows/{9qVyfUxmRQqrpGRMDLRuz, txiPzSxy3Pclsz6v, t4QvrtrPnTwRU6br, rysSPgUssLDf6xJc,
Fss5aAaXthJSWpZCgKiKR}` at each revision. `GET /executions/{…}?includeData=true` for 20 executions across the cycle,
including every `aQUmwMVplmNcyUVc` sendmsg sub-execution in the window (S1 swept, not sampled). Node-by-node
structural diff keyed on stable node `id` (LESSONS 20) against the committed pre-edit backups at every revision.
Old-vs-new pure-function replay against the **live** pre-change bodies with mocked `$()` / `$input` — 10 shapes for
`crossdomain-zeroset`, 15 for `output-structurer`, 6 for `not-found-error-message`, deliberately including the
adversarial shapes (rows unstamped; first match without a uuid; 8 distinct codes × 2 companies; brand/category beside
a product). Premises checked against live code rather than the diff doc (`entity-ids-transformer`'s type map, the
gate's `ALLOWED` map, `compile-current-state`'s key handling, `build-suggest-offer`'s use of `found_summary`). jsCode
sha recomputed from execution `workflowData` to prove which body actually ran. No production host was probed; no
repo-hardcoded credential was used against live beyond the read-only `N8N_API_KEY` supplied with the task.
