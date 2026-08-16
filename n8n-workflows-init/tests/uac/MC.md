# UAC §MC — `multi-company-resolution`

> ⚠️ **`00-SAFETY-always-read.md` (§0) applies to every case here.** Read §0 + this file only.

Change: `multi-company-resolution`. Design: `plans/multi-company-resolution-plan.md`.
**Scope tag for the whole n8n half: `deterministic`.**

## §MC-0 — Standing preconditions and the inherited §0 binding

Every §MC case runs against the clone `txiPzSxy3Pclsz6v` in **`mode=regress-capture`**, contact
`437264483` (FULL access), with the `respond_contacts_test` row reset between **independent** cases and
**never** within a multi-turn sequence (LESSONS §31; memory `uac-mode-reads-prod-session` — `uac` mode
reads `437264483`'s stale-contaminated PROD session and has silently produced wrong-question answers
twice).

**§0 binding, stated once and inherited by every case below:**

- **S1** no real send — the render never reaches a credentialed send node on the clone; all 8 sendmsg
  callers → `ublq9nSlrpz63xan`, egress log shows `{guard:"sendmsg-sub", blocked:true}`.
- **S2** no assign / SLA / PIC comment.
- **S3** containment re-asserted **from the clone JSON, not memory**: 5 orphaned + 1 sinked;
  `Call 'sub-respond-save-message-redis'2`.`workflowId.value === 'tWm5DYLxfypmVC1T'` and that fork's
  `Redis.list` is the literal `sorento-respond-message-TEST`.
- **S4** every tool passed to any get-results call is a **read** tool; never `crm_it_support_ticket_create`.
- **S5** `is_test/test_mode === true` on every sub call.
- **S6** `deterministic` ⇒ **zero LLM nodes executed** on every case except §MC-8 (which states its own).
- **S7a/S7b** TEST-sink delta accounted; prod-sink delta zero via **both** the per-poll `LLEN` series and
  the per-poll pop payload; execution ids recorded. A non-zero prod delta **halts** pending attribution;
  an unretrievable consumer execution is **UNATTRIBUTABLE → FAIL**.
- **S8** no `is_test:false` run against any fork containing a credentialed node type.
- **S9** every §MC-FP mutation proves (1) the literal search string occurs exactly N>0 times before
  substituting, (2) the file digest changed after, and (3) aborts without running the suite on either
  failure. A suite result obtained without both assertions is **VOID**.

**Assert per-node `runData`, never execution status** (LESSONS §61a): an unwired error output makes a
failed run report `success`. Every case names the node and the key it asserts.

🔴 **Every rendered-text assertion in this file is made at the CUSTOMER BOUNDARY** — the
`save-session-vars` input `user_response` and/or the sendmsg egress payload — **in addition to** the
producing node's output object (LESSONS §63 rule i). The previous change had 170 green assertions on
producer objects while the customer received bare text. An assertion made only on
`disallowed-entity-gate.gate_clarification` or `build-suggest-offer.suggest_response` **does not
satisfy this file.**

---

## §MC-0a — build-time GO/NO-GO (= plan §5-MC-V1..V6, read-only, BEFORE any wiring)

> 🔴 **HALT CONDITION.** The resolver's raw-SQL fuzzy probes bypass company isolation
> (`plans/multi-company-resolution-plan.md` §2.2 — `do_orm_execute` short-circuits on a `TextClause`).
> **No §MC case may be promoted to live until CRM A-0 has shipped.** Building and testing on the clone
> is permitted (the clone reads prod, sends nothing). Grouping on top of an unscoped fuzzy path would
> label and advertise a cross-tenant disclosure.

- **§MC-0a-1 🔴 (= §5-MC-V1) — A-0 landed, leak closed, proven with opposite expectations.** After the
  CRM fix, re-drive `mwc7625-sh-s11 cert` on `437264483` **and** the same text on a **single-grant**
  contact. Assert the single-grant contact's `resolutions[].alternatives[]` contains **exactly one**
  `MWC7625-SH-S10`, and the dual-grant contact's contains two **only if** §MC-0a-2 shows two grants.
  **Print both arrays.** Two contacts with opposite expected outcomes — a check that cannot pass by
  accident. Pre-A-0 this case is expected **RED**; record that run as the baseline.
- **§MC-0a-1b 🚩 — settle which bucket fed the observed picker.** Pull the execution behind
  `chat_histories` `9151509`/`9151511` (`MWCX8609-RL-S10`). Record per twin: bucket (`matches` /
  `intersection` / `alternatives`), `match_tier`, uuid. `matches`/`intersection` ⇒ dual-grant display
  defect (this UAC's subject). A trgm/embedding tier ⇒ the leak reached the picker too and A-0's test
  matrix must cover that path. **Aged out ⇒ re-drive the turn; never infer.**
- **§MC-0a-2 (= §5-MC-V2) — company grants for `437264483`.** Read-only SQL — the join is on the
  **internal** `respond_contacts.id`, not `respond_io_id`:
  `SELECT c.name FROM respond_contact_companies rcc JOIN respond_contacts rc ON rc.id = rcc.respond_contact_id JOIN companies c ON c.id = rcc.company_id WHERE rc.respond_io_id = '437264483';`
  **Print the count and the names.** `1` ⇒ no dual-grant fixture on this contact; §MC-1..6 run pinned.
- **§MC-0a-2b 🚩 — OPEN, needs the user/operator.** Which API key does n8n present on the resolve call?
  `_api_key_valid` hmac-compares against the single legacy `settings.external_api_key`, while route auth
  goes through `IntegrationKeyService.resolve`. A per-integration key that is not the legacy value
  authenticates fine but leaves the scope `UNSET` → `false()` → **0 rows on every ORM path**, while the
  unscoped fuzzy path keeps flowing. **Symptom to look for:** exact-code lookups returning nothing while
  did-you-mean still suggests. If observed, A-0 alone does not fix it.
- **§MC-0a-3 (= §5-MC-V3) — a real twin fixture exists.** MCP `crm_master_products_list` (read-only)
  with `contact_id=437264483&space_id=364817`, `query=MWC7625-SH-S10`. **Assert ≥2 rows with distinct
  ids; print both ids and both company fields if present.** `<2` ⇒ §MC-1..6 must run on a **pinned**
  `fixture-resolve-entity`, and each case must say so explicitly — never silently substitute.
- **§MC-0a-4 (= §5-MC-V4) — company reaches n8n.** After CRM A-1, one real `resolve-entity` turn;
  assert `resolutions[].matches[].display.company_name` is a **non-empty string** on ≥1 product match.
  **Print the full match object.** Fail ⇒ §MC-1..7 are **N/A, not skipped-green**; only §MC-10 ships.
- **§MC-0a-5 (= §5-MC-V6) — the annotation regex is header-safe.** Offline: feed the grouped
  `gate_clarification` through `build-suggest-offer.js:221-227` and `annotate-incoming-picker.js:22-27`.
  **Assert** header lines (`Sorento:`) are returned **unchanged** and every `N. CODE` line still matches
  `/^\s*\d+\.\s+(.+?)\s*$/`. Print the count of lines in each class.

---

## §MC-1 — R5 require-specific picker, two companies  `scope: deterministic`

**The observed defect** (`chat_histories` `9151509`/`9151511`, 2026-08-05): two identical numbered lines.

- **Trigger:** message `MWCX8609-RL-S10 incoming` (contact `437264483`). Pin
  `mock_reformulator_output`: `message_type:business_query`, `domain_hint:'incoming'`, entities
  `[{raw:'mwcx8609-rl-s10', hint:'product'}]`. `resolve-entity` real if §MC-0a-3 passed; otherwise pin
  `fixture-resolve-entity` with two exact-tier product matches sharing `canonical_code`
  `MWCX8609-RL-S10`, distinct uuids, `display.company_name` = `Sorento` / `Mocha`.
- **Expected branch/path:** `resolve-entity → disallowed-entity-gate` with `require_specific === true`
  → `not-found-error-message` (`gate.gate_clarification` copied to `escalate_message`, `:175`)
  → `probe-incoming → annotate-incoming-picker → build-suggest-offer → …`.
- **Structural assertions (per-node runData):**
  - `disallowed-entity-gate`: `require_specific === true`; `specific_options[0].candidates.length === 2`;
    each candidate carries a non-null `company`; `compatible_entities.length === 2` with **both** uuids
    — **untouched by this change** (the pick affordance).
  - `gate_clarification` contains exactly two lines matching `/^\d+\.\s/`, numbered `1.` and `2.`, and
    exactly two header lines `Sorento:` / `Mocha:` (order = first appearance in the resolver ranking).
  - **No line is a duplicate of another line.**
- **🔴 Customer-boundary assertion:** the `save-session-vars` input `user_response` (and the sendmsg
  egress payload) contains both header lines and both numbered lines, in that order, and contains **no**
  two identical lines.
- **Round-trip (second turn, do NOT reset the contact row):** reply `2`. Assert the parser sub's
  `output_exchange` resolved `uuid` equal to the **Mocha** uuid (the second group's), not the Sorento
  one. This is the assertion that proves grouping did not break the pick.
- **Safety:** §0 all, per §MC-0.

## §MC-2 — R1 D1 code mode, two companies → switches to NUMBERED mode  `scope: deterministic`

- **Trigger:** `MWC7625-SH-S100 cert`. Pin `mock_reformulator_output`:
  `domain_hint:'product_attachment'`, entities `[{raw:'mwc7625-sh-s100',hint:'product'},
  {raw:'cert',hint:'attachment_type'}]`. Resolver (real or pinned) returns for the missed token, in
  ranking order: `MWC7625-SH-S10`(Sorento, uuid A), `MWC7625-SH-S10`(Mocha, uuid B),
  `MWC7625-SH-S12`(Sorento). Pin a UUID-shaped `attachment_type` in `compatible_entities` so
  `dym-transform` does not skip on `no_scoping_entity`.
- **Expected branch/path:** `sibling-gate[1] → dym-transform → dym-gate → dym-probe → dym-annotate →
  build-suggest-offer` D1 single-token.
- **Structural assertions:**
  - `build-suggest-offer`: `picks.length === 3` — **the twin survived `tokenCandidates` dedup** (§3.4);
    the duplicated code appears **twice** in `suggest_last_result_set`, with **different** `uuid`s.
  - 🔴 **numbered mode was selected**: `suggest_quick_reply === "1,2,3,Yes escalate,No it's okay"`, and
    `suggest_response` ends with a *number* invitation, not "Reply with a code".
  - `dym-transform`: `dym_excluded_codes` contains `{code:'MWC7625-SH-S10', reason:'multi_company_code',
    company_count:2}`; `dym_candidate_codes` does **not** contain it.
  - Both `MWC7625-SH-S10` lines render **BARE** (no ` - has ` / ` - no `); `MWC7625-SH-S12` **is**
    annotated. Assert both facts — a blanket "no suffix anywhere" would pass for the wrong reason.
- **🔴 Customer-boundary assertion:** `user_response` contains `Sorento:` and `Mocha:` headers, numbering
  `1.`, `2.`, `3.` **globally contiguous**, and no company name inside `suggest_quick_reply`.
- **Round-trip:** reply `2` → `output_exchange` resolves uuid **B**.
- **Safety:** §0 all.

## §MC-3 — has-first sorts WITHIN each company group, never across  `scope: deterministic`

- **Trigger:** as §MC-2 but with four candidates in deliberately **non-alphabetical** resolver order:
  Sorento `B-CODE`(no), Sorento `A-CODE`(has), Mocha `D-CODE`(no), Mocha `C-CODE`(has).
- **Expected render:** `Sorento:` → `1. A-CODE - has …`, `2. B-CODE - no …`; `Mocha:` → `3. C-CODE - has
  …`, `4. D-CODE - no …`.
- **Assert:** company is the OUTER partition and has-first the INNER one; a `C-CODE` that floated above
  `B-CODE` would mean has-first ran across groups — **hard fail**. The non-alphabetical fixture is
  mandatory: with an alphabetical one the assertion cannot distinguish the intended comparator from a
  `localeCompare` tiebreak (the exact trap of review F-RANK).
- **Safety:** §0 all.

## §MC-4 — R4 partial-resolution, suffix form  `scope: deterministic`

- **Trigger:** an **answered** turn carrying one genuine-miss token whose candidates span two companies
  (e.g. `stock for SRTWC8317-RL and MWC7625-SH-S100`, first resolves, second misses).
- **Expected branch/path:** results lane — `central-exchange → dym-transform-partial → dym-gate-partial
  → dym-probe-partial → dym-annotate-partial → … → compile-current-state` partial block (`:384-419`).
- **Assertions:** rendered lines carry a `(Sorento)` / `(Mocha)` **suffix**, NOT headers (§3.6 decision);
  the global contiguous `idx` is unchanged and `dym_last_result_set[i].idx` matches rendered line `i+1`;
  **no reordering** on this renderer.
- **🔴 Customer-boundary assertion** on `user_response`.
- **Round-trip:** reply with a number → `dymNumberedMultiSelect` resolves that row's uuid.
- **Safety:** §0 all.

## §MC-5 — R3 D1 multi-token, suffix form  `scope: deterministic`

- **Trigger:** two genuine-miss tokens, one of which has cross-company candidates.
- **Assert:** `(Company)` suffix per line; `"tok" — did you mean:` block headers unchanged; global
  contiguous `idx` across token blocks preserved; `suggest_quick_reply === "Yes escalate,No it's okay"`
  (multi-token already emits numbers-only buttons, `build-suggest-offer.js:278`).
- **Safety:** §0 all.

## §MC-6 — R6 `annotate-incoming-picker` inherits the grouping intact  `scope: deterministic`

- **Trigger:** §MC-1's turn, taken through `probe-incoming → annotate-incoming-picker`.
- **Assert:** header lines pass through the `:22-27` regex **unchanged**; both numbered lines still get
  their `— has incoming` / `— no incoming` suffix; the `hasIncoming.size === 0` fallback sentence is
  appended **after** the last group, never between groups.
- **🔴 Customer-boundary assertion** — `annotate-incoming-picker` writes `out.escalate_message`, and
  `escalate-catalog` re-sources `escalate_message` **by name** from `$('not-found-error-message')`
  (LESSONS §63 (c) / review §8.2). Assert the grouped text is what the customer receives, then walk the
  by-name readers in **all three** search forms — `$('X')`, `$("X")`, and the two-hop
  `const v = $('X'); … v.first().json.key` — and record the reader set. A line-based `grep "$('"` is
  **not sufficient** and has already produced a wrong answer here.
- **Safety:** §0 all.

## §MC-7 — 🔴 `suggest_quick_reply` purity, per mode  `scope: deterministic`

The brief's framing "`suggest_quick_reply[i] === suggest_last_result_set[i].value`" is **code-mode only**.
In numbered mode `suggest_quick_reply` is `"1,2,3,…"` while `suggest_last_result_set[i].value` is the
label (`build-suggest-offer.js:305-310`). Assert per mode, not globally.

- **§MC-7a — purity (EVERY grouped case).** `suggest_quick_reply` contains **none** of: a company name,
  `:` , `(`, `)`, `—`, ` has `, ` no `. It splits on `,` to exactly `picks.length + 2` entries.
- **§MC-7b — code mode** (`_dymAnnotate` false, single company): `suggest_quick_reply.split(',')[i] ===
  suggest_last_result_set[i].value` for every `i < picks.length`, and rendered line `i+1` names that
  code.
- **§MC-7c — numbered mode** (grouped, or any duplicated code): `suggest_quick_reply.split(',')[i] ===
  String(i+1)`, and `suggest_last_result_set[i].uuid` is UUID-shaped and **distinct** across the twin
  pair.
- **Safety:** §0 all.

## §MC-8 — round-trip under the REAL parser  `scope: parser`

> ⚠️ The only `parser`-tier case in this file. It exists because `output_exchange`'s pick resolution is
> **mock-blind** (LESSONS §28) — the deterministic bypass skips `output_exchange` entirely, so no
> `deterministic` case can prove the pick round-trip end to end.

- **Trigger:** §MC-2 turn 1 with the **real** reformulator, then turn 2 = `2`.
- **Assert:** `output_exchange` `entities` carries `uuid` = the **second group's** uuid,
  `canonical_code` = the twin code, `dym_pick_applied === true`; the follow-up answer is scoped to that
  uuid.
- **Do NOT reset** `respond_contacts_test` between the two turns.
- **Safety:** §0 all except **S6, which is relaxed for this case only**: the reformulator LLM runs once
  per turn. Record token spend. `Basic LLM Chain` must still not execute.

## §MC-9 — fail-open: a candidate set with a missing company does NOT group  `scope: deterministic`

- **Trigger:** three candidates, two carrying `display.company_name`, one with the key absent.
- **Assert:** **no** headers, **no** suffixes, code-mode retained, output **byte-identical** to the
  pre-change body's output on the same fixture (run the pre-change `build-suggest-offer` body from
  `export/live-spine-sorento-consume-main/nodes/` as the comparator, per §MC-10's method).
- Rationale: partial company data must never produce a partially-grouped list implying the ungrouped
  candidate belongs to the last-named company.
- **Safety:** §0 all.

## §MC-10 — 🔴 BYTE-IDENTITY, the property that makes dark-landing safe  `scope: deterministic`

The whole change is inert until CRM A-1 ships. Prove it.

- **Method:** an offline suite in `tests/offline/multi-company-resolution/` modelled on
  `tests/offline/dym-probe-before-offer/byteid.js` + `parity.js`. Source **both** bodies from
  `export/` (never a working copy) and `process.exit(2)` on a missing file, so the suite asserts what is
  **published**.
- **Assert, over a fixture matrix of ≥12 worlds** (single-company · no-company · non-enabled domain ·
  D1 code · D1 numbered · D1 multi-token · D2 · D3 · partial · picker · require-specific · clarify):
  the changed `build-suggest-offer`, `compile-current-state`, `disallowed-entity-gate`,
  `dym-transform` and `dym-transform-partial` produce output **byte-identical** to the current live
  bodies whenever no candidate carries a company. **Print the compared-population count** — an empty
  comparison is never a pass (LESSONS §61b).
- **Assert the parity invariant survives:** all **three** `tokenCandidates` copies
  (`build-suggest-offer`, `dym-transform`, `dym-transform-partial`) remain byte-equivalent to each
  other **and** still contain the four filters. Re-run `parity.js` unchanged; it is **not** a
  `mutate.sh` target (it reads the export by design and carries internal `[control]` lines).
- **Safety:** offline; §0 S1–S5 vacuous, state so explicitly rather than marking them green.

## §MC-11 — R7/R8 are single-company: ASSERTED, not assumed  `scope: deterministic`

`build-suggest-offer.js:93` (D3 siblings) and `:475` (D2 alternatives) are excluded from grouping on the
argument that their candidates come back from a **company-scoped tool**. That class of argument produced
three defects in the previous change. Check it.

- **Trigger:** (a) a D3 sibling-picker turn; (b) a D2 alternatives turn.
- **Assert:** from runData, every candidate in each list resolves to **one** company, or the payload
  carries no company field at all (i.e. it never passed through the resolver). **Print both candidate
  sets and their company values.**
- **Fail ⇒ R7/R8 join the grouped set** and this plan's §3.3 table is wrong. Do not paper over it.
- **Safety:** §0 all.

## §MC-12 — the cap3 displacement cost, measured not assumed  `scope: deterministic`

§3.4 accepts that a surviving twin consumes one of three `cap3` slots.

- **Assert:** on §MC-2's fixture, the fourth-ranked distinct product is **absent** from the offer, and
  `dym-transform`'s `dym_excluded_codes` explains why. Record it. This is not a failure — it is the
  documented cost, and the case exists so it is observed rather than discovered later in production.
- **Safety:** §0 all.

---

## §MC-FP — fail-on-purpose (§0 S9 binding; every mutation via `mutate.sh`)

Each step must print `occurrences before : N (expected N)` with **N > 0** and a **changed digest**, or
the run is VOID (LESSONS §61b, the fifth instance of the class).

- **§MC-FP-1 — grouping gate.** Mutate the `>= 2 distinct companies` condition to `>= 1`. Expect §MC-9
  and §MC-10 RED (a single-company list would gain a header).
- **§MC-FP-2 — quick-reply purity.** Mutate the render so the company name is appended to a
  `suggest_quick_reply` entry. Expect §MC-7a RED. If it stays green, §MC-7a is not an instrument.
- **§MC-FP-3 — numbering.** Mutate the numbering to restart at `1` inside each group. Expect §MC-1,
  §MC-2 and §MC-7c RED.
- **§MC-FP-4 — dedup key.** Revert `tokenCandidates`'s dedup to code-only. Expect §MC-2 RED (`picks.length`
  falls to 2 and the twin vanishes). ⚠️ Aim this at the suite that **executes** `tokenCandidates`, not
  one that stubs its output — a stubbed suite prints "GATE IS BLIND" for a blindness that does not
  exist (`mutate.sh` header warning).
- **§MC-FP-5 — sort scope.** Mutate the has-first sort to run across the whole list instead of within
  each group. Expect §MC-3 RED.
- **§MC-FP-6 — 🔴 the discriminating gate (LESSONS §63 rule iv).** Run the **pre-change**
  `escalate-catalog` / `annotate-incoming-picker` bodies (from
  `export/live-spine-sorento-consume-main/nodes/`) against the **post-change** producer output and
  assert the grouped text comes back **WITHOUT** the headers. This proves the customer-boundary gate can
  distinguish the two rather than being taken on trust — and it is the gate that would have caught the
  rev-6 defect in the previous change.
