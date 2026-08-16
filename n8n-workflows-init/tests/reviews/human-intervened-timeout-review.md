# human-intervened-timeout — reviewer sign-off (S1 / S2 / S3)

Reviewed 2026-08-12 (reviewer seat). Scope: slices **S1 / S2 / S3** as built — the fork plus two new
workflows, all `active:false`. **S4 (live promote + flip) is NOT built and is NOT approved here**; its
checklist is §6 below and carries two BLOCKING gates.

Inputs: `plans/human-intervened-timeout-plan.md` · `tests/uac/HT.md` ·
`tests/manifests/human-intervened-timeout/README.md` (rev2) ·
`tests/runs/HT-run-2026-08-12.md` (first pass + rev2) ·
`tests/offline/human-intervened-timeout/`.

---

# VERDICT: **APPROVE** for S1/S2/S3 scope — zero egress independently re-confirmed

Two findings are **must-fix before S4 can be built** (§4 R1, R2). Neither is a defect in the artifacts
as they stand: R1 is a promote-path defect that appears only when the stand-ins become real nodes, and
R2 is a guard that is fail-open but currently unreachable. Both are recorded as hard gates in the
promote checklist. R2 is a one-token fix I recommend landing **on the build now**, so it is exercised
by the harness rather than first exercised against a real contact.

The build is unusually well-instrumented. The F-RECHECK cycle (tester REQUEST-CHANGES → `ht-carry-contact`
+ the new C9 gate) is exactly the right response: the fix came with the instrument that would have caught
it, C9 was proven RED against a faithful reconstruction of the pre-fix graph rather than a synthetic
corruption (LESSONS §64 rule iii), and the coder declined to self-certify the residual-key cleanup so the
tester's evidence stayed the tester's. The `ht-carry-contact`-over-`{{ $json.id }}` reasoning ("a check
that can cancel an action has to run before it") is correct and is the same doctrine as §0 S7b.

---

# 1. Zero egress — re-confirmed independently, not relayed

Re-derived by me from fresh REST GETs of all five workflows (reads only; no write, no promote). Note
REST GET does **not** redact credentials (LESSONS §55), so this is a **stronger** assertion than §0 S8's
node-TYPE proxy: I can assert credential absence directly, which MCP cannot.

| gate | evidence | result |
|---|---|---|
| **S8 structural** — no `respondio` / `respondioTrigger` / `httpRequest` / `postgres` / `memoryPostgresChat` in any of the three, nor in `zz-sub-sendmsg-STANDIN` | banned-type node count = **0 / 0 / 0 / 0** | PASS |
| **S8 stronger — credential enumeration** | the ONLY credential bound anywhere in the three builds is `redis`: S1 5 nodes, S2 8, S3 7, STANDIN 1. **Zero** `respondIoApi`, `httpHeaderAuth`, `postgres`. (Live `respond-send-user`, by contrast: 7 credentialed nodes across 4 cred types.) | PASS |
| **sendmsg target** | both call sites (`ht-intervene-notice`, `ht-timeout-notice`) → `lJ4IZEGwoTh6aay4` (`zz-sub-sendmsg-STANDIN`, 3 nodes, `versionId==activeVersionId`), `is_test: '={{ true }}'`. Neither points at `aoydkG1dbItXR5jXFEQsP`. `sub-sendmsg-CHAT` correctly rejected (F4 — it carries `respondio`+`httpRequest`+`postgres`) | PASS |
| **prod ingest list** | S1 `Call 'sub-respond-save-message-redis'` → `tWm5DYLxfypmVC1T` (TEST fork → unconsumed `sorento-respond-message-TEST`), **not** live `UrETd-jm46tFj3Xw7w8vL`. Leaf diff vs live is confined to `workflowId.{value,cachedResultUrl,cachedResultName}`; `workflowInputs` byte-identical | PASS |
| **§53 namespace isolation** | all **20** redis nodes across the three builds key into `test:ht:*` / `test:egress:*`. Zero references to canonical `ht:*` (regex `["=]ht:` over the full JSON of each build: none) | PASS |
| **inert** | all three `active:false`; versionIds `a8776f5e…` / `c5193aa5…` / `44c91090…` — identical to the manifest AND to the tester's end-of-pass proof, so nothing drifted after the run | PASS |
| **live untouched** | `respond-send-user` `eG3AA-TWo17-E1-DlHLnH` @ **`c23ce991-64d7-43dc-b8e8-bcd4c9c12de0`**, `versionId == activeVersionId`, 12 nodes, `active:true`. Full draft-vs-active node comparison (LESSONS §23): **no differing nodes, connections byte-identical** — no unowned draft rider waiting to ride a publish (§51) | PASS |

Run-log §0 S1–S9 re-read and corroborated. S2/S4/S6/S7b are correctly marked **n/a with a reason** rather
than silently passed — there is no human-intervention sub call, no `sub-get-results` call, no LLM node,
and no path to `sorento-respond-message` in any of the three. S7a is asserted positively (every notice
landed in `test:egress:{test_run_id}` via the stand-in's own `push-egress-log`). The one incidental
`Schedule Trigger` tick during the ~1 s S2 activation window (exec 12171008) is disclosed and ran the
same zero-egress path — correctly reported rather than omitted.

**Nothing in these three workflows can reach a real contact, a real CRM write, or a real assignment.**

---

# 2. §71 param-hash sweep — re-derived, manifest is COMPLETE

I recomputed `sha256(json.dumps(parameters, sort_keys=True))[:12]` for **every** node in all three
workflows — If conditions, redis keys, executeWorkflow inputs, trigger params, form params, not just
Code bodies — and diffed against the manifest's tables.

**57 / 57 nodes match exactly (25 + 21 + 11). Zero discrepancies. Nothing the manifest missed.**

This is the sweep whose absence broke production on the promo-picker promote (LESSONS §71), and it is
correctly done here. The manifest also names the two semantic-no-op If-condition UUID changes
(`ht-skip?`, `ht-flag-still-true?`) caused by the builder switching to deterministic uuid5 — declaring an
inert delta instead of letting it ride is §51 applied properly.

### Fork vs live `respond-send-user`, by node NAME (ids diverge — §52/§58c)

| node | live → fork | classification |
|---|---|---|
| `If` | **IDENTICAL** type + params (`0e89b92944f2`, same condition UUID) | business-critical, byte-preserved ✅ |
| `compile-current-state` | **IDENTICAL** type + params (`7ecc25c706ef`) | byte-preserved ✅ |
| `Respond.io Trigger` | `respondioTrigger` → `code` | **harness containment** (§52) — must NOT promote |
| `Update a Contact` | `respondio` → `code` | harness stand-in — must NOT promote |
| `Execute a SQL query`, `Select rows from a table` | `postgres` → `code` | harness stand-in — must NOT promote |
| `conversation-sla-tracking-update`, `-create` | `httpRequest` → `code` | harness stand-in — must NOT promote |
| `save-session-vars` | `httpRequest` → `code` | harness stand-in — must NOT promote |
| `Call 'sub-respond-save-message-redis'` | params differ (workflowId only) | harness repoint — must NOT promote |
| `Webhook`, `webhook-to-respond-convert` | **live-only, deleted in fork** | must NOT be deleted from live |
| 11 `ht-*` + `harness-envelope` + `When Executed by Another Workflow` + `ht-driver-webhook` | fork-only | 11 promote, 3 do not (§6) |

Connections: the only live edge the fork changes is `Update a Contact` gaining `→ ht-cfg-enabled` (the
one splice S4 must apply) plus deletion of the `Webhook` lane. No live edge was silently re-pointed.

**F1 confirmed independently and it matters:** live has **12** nodes, not the 4 the plan's baseline
described, and the gap is all egress — `save-session-vars` (PUT conversation-variables on the prod CRM),
two prod-CRM `postgres` nodes, and a second ingress (`Webhook` → `webhook-to-respond-convert`) that
reaches the SLA lane **bypassing the `If` gate entirely**. A fork built from the plan text alone would
have shipped a live prod-CRM write. The coder catching this is the single highest-value finding in the
build.

---

# 3. Plan / UAC adherence

**Deviations: all five plus the addition are recorded in both the plan and the manifest, with reasoning.**
D1 (no ZSET ops on `n8n-nodes-base.redis`; per-contact string keys) — verified: the installed node's
operation set genuinely lacks sorted-set ops, the mapping is semantically equivalent and every op stays
atomic; declining an unverified community node for a production timer is the right trade. D2, D3
(clear→log→forget→notify; "a lost notice beats a notice storm" plus keeping every node between the write
and the send on a passthrough op) and D4 (`n8nUserAuth`) are all sound and correctly argued. **A1** (the
optional race re-read implemented anyway) is a genuine improvement — the failure it prevents is
customer-visible. **D5** (HT-3's `source:"api"` fixture edited, not captured) is honest, and the word
UNVERIFIED is recorded inside the fixture file itself, not only in the manifest.

**Case disposition — every one of the 17 accounted for.** HT-1..HT-6, HT-10..HT-15 PASS (first pass);
HT-7, HT-8, HT-9 PASS on rev2 re-drive through the real webhook with per-node runData; HT-16/HT-17
**offline-only, which is the case text's own sanctioned fallback**. The interleave disposition is
better than the fallback required: four real attempts, measured from node `startTime`s, bounding the
census↔recheck window at ≈30 ms and showing external jitter of up to 334 ms — an evidence-based
"not achievable from this API surface", not an assertion. Attempt 2 landing 5 ms the wrong side of the
window and being scored as *correct given the actual sequence* rather than massaged into a pass is
exactly right.

**Not re-running HT-1..HT-6/HT-10..HT-15 after rev2 is acceptable**: rev2 touched S2 only, and
`assert-built.py` C4 byte-gates every deployed body against its tracked source at the start of the pass —
that is the §64 "is the change still PRESENT" check a behavioural test cannot provide.

### Defect-class audit (§61 / §63 / §64 / §66 / §72 / §73)

I audited the offline suite for the four classes rather than accepting the counts. Re-run
independently: `harness.js` **143/143 PASS** (footer prints the compared population — 143 assertions
over 10 fixtures and 19 bodies, so §61b cannot apply), `mutate.sh` **24/24 CAUGHT**, zero
`SURVIVED`/`ABORT`/`CRASHED`.

- **§0 S9 + §72 guards are real, not decorative.** `mutate.sh` counts the literal in **Python**, not
  `grep -Fo` (the coder's F5 — the reference implementation's line-based counter measured 8 for an anchor
  occurring once, and the same mechanism can report exactly N for an anchor that occurs *zero* times);
  asserts the digest changed; hard-fails on `cmp -s` byte-identity; runs `node --check` so a syntax error
  cannot score as a detection; and reports **CRASHED as its own battery-failing outcome** (F6 — a
  crashing suite was previously being scored as a caught mutant). The two non-green results in the
  battery were both handled correctly: `FP-ATTR` **aborted** on a stale anchor (the guard caught a no-op
  instead of scoring it), and `FP-CARRYID` **SURVIVED** and was investigated per §66 rather than patched
  around — correctly identified as a genuinely equivalent mutant, removed with the reasoning recorded,
  and replaced by a *pinned invariant* plus a mutant that proves the guard can go red. Two honest
  instruments instead of one misleading green. Mutation score is not 100% by construction, which per
  §72's heuristic is the healthy sign.
- **§63 customer-boundary assertions present.** The pinned `contact_id === String(contact.id)` invariant
  exists twice — single-row and across a 2-contact tick — with an explicit per-item pairing assertion.
  `noThrow()` exists and is used, which is what turns FP-CARRYNEST/FP-WRONGOBJ into 6 real comparisons.
- **§64/§66 race fixtures are NOT vacuous.** `skip-refreshed` feeds `recheck = T0−1000` against
  `cutoff_ms = T0−300000` — genuinely fresh by 299 s, so the branch is discriminating; `skip-vanished`
  feeds `recheck: null`; and the exact-boundary case (recheck at the cutoff still clears) is asserted.
  Census `expired = score_ms <= cutoff_ms` and classify `rescore > cutoff_ms` are complementary at the
  boundary and the boundary is tested.
- **C9 is sound.** Field sets are derived by **executing** the bodies (`harness.js --emit-schema`,
  sentinel-extracted from C9's own invocation, fatal if the block is missing — not skipped); redis
  passthrough is encoded correctly (`push`/`set`/`delete` only); the opaque-source allowlist is
  **empty** and an unenumerated source **fails**. Nothing re-opens the blind spot that let F-RECHECK ship.

Three instrument gaps found, none blocking, all in §5.

---

# 4. Findings

## R1 — BLOCKING FOR S4. F-RECHECK recurs on the promote path, one node downstream, and every existing gate passes through it

This is the finding that matters. `ht-forget` and `ht-timeout-notice` read `$json` from a node whose
**type changes at promote**, so they are correct on the build and broken on live.

Deployed chain (verified from the S2 JSON):

```
ht-flag-still-true?[0] -> ht-clear-flag -> ht-egress-log -> ht-forget -> ht-timeout-notice
```

- `ht-forget.key`  = `=test:ht:active:{{ $json.contact_id }}`
- `ht-timeout-notice.workflowInputs` = `contact_identifer: {{ $json.contact_id }}`,
  `message: {{ $json.ht_timeout_notice }}`

On the build, `$json` is the **Code stand-in** `ht-clear-flag`, which deliberately re-forwards
`contact_id` and `ht_timeout_notice` (`nodes/standin-ht-clear-flag.js:16-37`) — and `ht-egress-log` is a
redis `push`, a passthrough, so those fields survive. That is D3's stated design and it works.

At S4, `ht-clear-flag` becomes the **real respondio CONTACTS/UPDATE_CONTACT node**. I measured that
node's real output on live `respond-send-user` (exec **12146305**, `Update a Contact`): it is exactly

```json
{"contactId": 423755030}
```

— `contactId` only. No `contact_id`, no `ht_timeout_notice`. So on live:

- `ht-forget` deletes `ht:active:` (empty suffix) → **the stamp is not removed by the clear-and-notify
  path**. Self-heals one tick later via `forget-silent` (next lookup sees flag=false), so not a storm —
  but every expiry costs an extra tick and an extra respond.io read.
- `ht-timeout-notice` is invoked with **`contact_identifer` empty and `message` empty** — the
  customer-facing timeout notice, the entire point of the feature, is malformed or dropped **on a live
  send path**.

Why no gate catches it, and why that is the important part:

- **C9 passes and will keep passing** — it resolves references against the field set the *stand-in*
  emits, and the stand-in emits `contact_id`. C9 is a correct instrument pointed at the pre-promote
  graph; the promote changes the object it was pointed at.
- The offline harness hand-builds inputs, so it never evaluates a parameter.
- Every live run the tester made used the stand-in.

This is **LESSONS §65 verbatim** — *"before promoting a hunk verified on the clone, diff the clone's
INBOUND EDGES for that node against live's; a substituted upstream changes what `$json` means without
changing a line of the node you tested"* — and it is **the same class as F-RECHECK**, which this build
already fixed once, one hop upstream. F7's own conclusion ("a body-level rule was not enough; the
parameter-level gate is") turns out to still be one hop short: C9 gates the parameter against the
*harness's* upstream, not the *promoted* upstream.

**Required fix at S4** — apply the coder's own precedent, do not hand-patch the expressions: insert a
name-preserving Code node after the real `ht-clear-flag` that re-attaches `contact_id` and
`ht_timeout_notice` from `$('ht-classify').item.json` (paired item, **not** `.first()` — a multi-contact
tick would take item 0 for every row), then leave `ht-forget`/`ht-timeout-notice` reading `$json`. This is
structurally identical to `ht-carry-contact` and for the same reason. Rejected alternative: pointing the
two parameters at `$('ht-classify')` directly — it works, but it puts a lineage walk inside the fan-out
region that C9 explicitly forbids `.first()` in, and it discards D3's passthrough property.

**And extend C9 so this class cannot recur:** for every node the promote converts from stand-in to real,
C9 must resolve downstream references against the **real** node's observed output shape, not the
stand-in's. The shape is available and cheap — one recorded live execution per stand-in
(`Update a Contact` → 12146305; findcontact → 12166204). Without this, R1 is fixed and the class stays open.

## R2 — BLOCKING FOR S4 (one-token fix; recommend landing on the build now). The mis-attribution guard demands a contradiction, not an identification

`nodes/ht-carry-contact.js:58`:

```js
if (fetchedId && fetchedId !== contact_id) throw ...
```

The leading `fetchedId &&` short-circuits the refusal. A lookup returning a payload with **no `id`** is
not refused — it is paired with the candidate's `contact_id` and flows on. Measured directly: with an
id-stripped contact whose `custom_fields` say `is_human_intervened: "true"`, `ht-carry-contact` returns
cleanly and `ht-classify` answers **`clear-and-notify`** — authorising the flag write and the WhatsApp
notice off a payload never positively identified as that contact.

The node's own header (`:17-19`) claims it "owns the mis-attribution refusal", which is **stricter than
the mechanism delivers** — §70b's "a warning stricter than the code deserves is its own defect", inverted.
It has zero coverage: `FP-CARRYPAIR` mutates only the contradiction half, and no fixture strips
`contact.id`, because the stand-in always emits one. Fail-open, and at S4 the fail-open direction points
at real egress.

**Honest bound on the severity, per §70** (a reviewer finding is a hypothesis too): I traced
`sorento-sub-respond-findcontact-respond` (`D62_NHUOrugeULSFwfjEJ`) and **could not construct a concrete
route by which it emits an id-less item**. Its terminal node on the happy path is `If contact exists`,
gated on `$json.id` **exists** (verified against exec 12166204), whose true branch is unwired and
therefore terminal; the not-found branch runs `Find a Contact1`, whose error output is unwired
(swallowed), so a hard miss yields **zero items**, not an id-less item. So this is a fail-open guard
with no proven live trigger today — a defence-in-depth defect, not a demonstrated leak. It is still a
must-fix, because the guard's whole job is to be the thing that holds when the shape surprises you, and
it sits one shared-sub rewiring away from mattering.

Fix: `if (!fetchedId || fetchedId !== contact_id) throw` — plus a mutant and a harness case feeding an
id-stripped contact. Same doctrine as §0 S7b's *unattributable → FAIL*: absence of identification is
refused, never waved through.

## R3 — NOTE (S4 durability, feeds D1). A not-found lookup leaks its stamp forever

Following from R2's trace: on a hard not-found the findcontact sub returns **zero items**, so
`ht-carry-contact` emits zero, the chain stops, and **`ht-forget` never runs**. The stamp for a
deleted/unknown contact is never removed and `ht:active:*` grows without bound. Harmless in isolation —
but it is the input to the D1 `KEYS` cost, so the two compound. Worth a reaper (delete a stamp whose
lookup returned nothing, or a TTL on the stamp key) before the announce flip.

## R4 — NOTE. `sorento-sub-respond-findcontact-respond` is read-only only by ORPHANING

The plan labels it "(read-only)". It is, **in practice**: `Create or Update a Contact` → `Send Template`
(a real WhatsApp template send) exists in the sub but has **zero inbound** — unreachable. So the
manifest's justification for stand-inning it is right, and the plan's label is defensible today. But at
S4 the sweeper (every 30 s, forever) becomes a caller of a shared sub whose egress containment is
orphaning, not absence. One rewiring of that sub by unrelated work arms the sweeper. Assert the orphan
status at S4 and re-assert it after any change to that sub.

Also note `Find a Contact` carries `onError: continueRegularOutput` + `alwaysOutputData: true`, and
`Find a Contact1` carries `onError: continueErrorOutput` with `main[1]` **unwired** — the LESSONS §61a
swallow. Containment holds here only because `If contact exists` gates on `$json.id`. Do not remove that
gate.

## R5 — NOTE. `is_test: '={{ true }}'` on both notice call sites is LESSONS §48(a) loaded and chambered

Both `ht-intervene-notice` and `ht-timeout-notice` pass `is_test: '={{ true }}'`. Correct and required
for the harness. I traced the live sub `aoydkG1dbItXR5jXFEQsP`: `test-guard` reads
`$('When Executed by Another Workflow').first().json.is_test` and its **TRUE** branch goes to
`test-guard-record` (a redis push) and **stops** — it never reaches `Send a Message`. So block-copying
either node to live means **every notice is logged to redis and silently never delivered** — a feature
that tests perfectly and does nothing, with no error anywhere. This is §48(a) in its documented form.
Hard gate in §6.

## R6 — NOTE. D1's `KEYS` cost is a pre-ACTIVATION item, not a pre-flip item

The plan and manifest both say the keyspace "should be checked before the announce flip". That
understates it: `KEYS ht:active:*` is **O(total keyspace)** and redis is **single-threaded**, so the cost
is a function of the whole shared prod keyspace — which carries the message lists, the per-contact
concurrency locks and the `ttl:1` rate-limit counters — and is **independent of pilot size**. A 30 s
blocking scan at pilot scale costs exactly what it costs at flip scale. Measure `DBSIZE` (and the p99
`KEYS` latency) **before `ht:enabled=1`, not before the flip**; if large, lengthen the cadence or take
the `SCAN`/extended-node dependency. Flagged as a pre-flip measurement item per the task, and raised to
pre-activation.

## R7 — NOTE. HT-FP2 / HT-FP4's "don't re-drive live" rationale was written pre-fix and not revisited

The first pass justified not re-driving FP2/FP4 live because they exercise the `ht-classify` chain "now
known to be dead live". Rev2 made that chain live-reachable (HT-8/HT-9 prove it) and the rationale was
not revisited — so FP2 (drop the flag-still-true check → HT-9 must go RED) and FP4 (missing
`custom_fields` must ERROR) remain **offline-only** where they are now live-drivable. Not blocking: the
battery is byte-gated to the deployed bodies via C4 and its guards are sound. Recorded so the coverage
claim is not read as stronger than it is.

## R8 — NOTE (cosmetic, customer-facing). `"inactive for 1 minutes"`

`ht-gate.js:31-33` renders `${min} minutes` with no pluralisation, and the harness *pins* the string
`'timeout 60 renders "1 minutes"'`. Inert at the locked 300 s default ("5 minutes"), but the config form
accepts 1 minute and the floor is 60 s, so it is reachable. Fix the renderer or drop the 1-minute
option — do not leave the pin asserting the ungrammatical string as intended (§73: a pin that blesses
half a value becomes a defect when the other half gains teeth).

---

# 5. Instrument gaps (not blocking, worth closing before S4)

1. **`mutate.sh` has no resync step.** It copies `nodes/*.js` to scratch and runs; nothing checks those
   bytes against the **deployed** node bodies. That is delegated to `assert-built.py` C4 **by comment
   only**, and nothing enforces the ordering — running `mutate.sh` standalone prints a confident
   `24/24 ✅` with no staleness warning. This is §72's own second guard ("resync before trusting")
   missing from the file that implements the first one. One-line fix: shell out to `assert-built.py`
   (C4 only) and abort on failure.
2. **`ht-config-echo.js` — a promoted S3 node with zero assertions and zero mutants.** It runs only under
   `--emit-schema`; none of the 143 assertions touch it. Its `READ-BACK MISMATCH` banner is the form's
   own honesty mechanism, and the tester's live HT-14 only ever observed the green side
   (`mismatches:[]`) — §61's "an assertion never shown red is not an instrument", applied to the
   read-back gate itself. The code is sound (the red side was reproduced during this review: a
   disagreeing read-back yields 3 mismatch strings, `ok:false`, and the banner). Two cases close it.
3. **C9 derives each node's field set from ONE fixture path** (`ht-classify` from the `clear-and-notify`
   row, `ht-gate` from the acting path). A future branch emitting a narrower object would pass C9 while
   breaking a downstream parameter. Measured today: all four classify outcomes and all three gate
   outcomes emit **identical key sets**, so there is no live hole — but the instrument does not know
   that. Derive the schema as the **intersection across branches**, or assert keyset-stability.
   `OPAQUE_TYPES` (`c9.py:48-55`) is also **never read** — `fields_of` defaults any unenumerated type to
   OPAQUE, so the fail-safe holds, but the dict's name promises it drives the check when it is
   documentation only (§70b).
4. **`harness-envelope.js`'s documented "throws if `contact.id` is absent"** is unasserted in the 143.
   Harness-only, so low value — but it is the node that stops a run fabricating a contact id.

---

# 6. S4 PROMOTE CHECKLIST — user-gated, not authorised by this review

**S4 is not approved here.** This review approves S1/S2/S3 only. Promotion requires a fresh authorisation
in the acting agent's *initial* task (LESSONS §26 — a relayed `SendMessage` is not authority), and the
permission allow-rule for `update_workflow`/`publish_workflow`/REST PUT must be added **by the user**
(§58a — the assistant cannot self-grant).

## G0 — Gates that must clear BEFORE S4 is built

- [ ] **G0.1 — R1 fixed.** The real `ht-clear-flag` must be followed by a name-preserving Code node
      re-attaching `contact_id` + `ht_timeout_notice` from `$('ht-classify').item.json` (paired item, not
      `.first()`). **Verify on the build, not on live.** Without this the timeout notice ships with an
      empty recipient and empty body, and `ht-forget` misses.
- [ ] **G0.2 — R2 fixed** (`!fetchedId ||`), with a mutant and an id-stripped-contact harness case.
      Recommended to land on the build now so the harness exercises it.
- [ ] **G0.3 — C9 extended** to resolve downstream references against the **real** node's observed output
      shape for every stand-in the promote converts (`Update a Contact` → exec 12146305;
      findcontact → exec 12166204). Otherwise R1's class stays open for the next promote.
- [ ] **G0.4 — `DBSIZE` + `KEYS ht:active:*` p99 latency measured** on the shared prod redis (R6).
      Pre-activation, not pre-flip.
- [ ] **G0.5 — re-run the full gate set on the fixed build** and record new shas:
      `assert-built.py` (C1–C9, plus `--self-test`), `harness.js`, `mutate.sh`. Then a tester pass
      re-driving HT-8/HT-9 and, now that they are live-drivable, HT-FP2/HT-FP4 (R7).
- [ ] **G0.6 — re-confirm live `respond-send-user` is still @ `c23ce991-64d7-43dc-b8e8-bcd4c9c12de0`
      with `versionId == activeVersionId`** and a draft-vs-active diff showing **zero differing nodes +
      byte-identical connections** (§23/§24/§51). If a draft rider exists, publish it as its own
      semantic-no-op first — two boring publishes, not one frightening one.

## G1 — Order of operations (deviating from this order is the failure mode)

1. Seed redis fail-closed **first**: `ht:enabled=0`, `ht:timeout-sec=300`,
   `ht:pilot-contacts=437264483`. Absent `ht:enabled` already means OFF (`ht-gate` requires the exact
   string `"1"`), so the feature is inert even if a seed is missed — but seed anyway, and read back.
2. Create + **publish** `ht-sweeper` and `ht-config-form` as new live workflows (§37 — a parent resolves
   only the *published* version of a sub). Sweeper stays **`active:false`** until the S1 promote has
   landed and been confirmed.
3. **LIVE promote of `respond-send-user`** (§G2/G3). Backup first: capture the prior versionId and every
   node body being touched.
4. Only then activate the sweeper.
5. `ht:enabled=1`. Pilot on 437264483 per HT.md's live-trigger proof (a)–(d).
6. Announce flip (separately user-gated): empty `ht:pilot-contacts`, deliver the stuck-contact list.

## G2 — `respond-send-user` (`eG3AA-TWo17-E1-DlHLnH`): EXACTLY what to apply

Build the target as **LIVE + your own hunks, by node NAME** (§57/§58c — clone↔live ids diverge). Never
block-copy a fork node (§48). One `update_workflow` call, ≤100 ops, then per-node byte-gate
draft==file → publish → re-fetch active==file (§58's protocol).

**PROMOTE — 11 new nodes + 1 edge:**

| # | node | type | change from the fork's version |
|---|---|---|---|
| 1 | `ht-cfg-enabled` | redis get | key `test:ht:enabled` → **`ht:enabled`** |
| 2 | `ht-cfg-timeout` | redis get | key → **`ht:timeout-sec`** |
| 3 | `ht-cfg-pilot` | redis get | key → **`ht:pilot-contacts`** |
| 4 | `ht-gate` | code | body **verbatim** (`8c57d21bf315`). Reads `$('Respond.io Trigger')` — resolves against live's REAL trigger, verified same envelope shape (exec 12146305) ✅ |
| 5 | `ht-act?` | if | verbatim (`c465659889bf`) |
| 6 | `ht-inert` | noOp | verbatim |
| 7 | `ht-prev-stamp` | redis get | key → **`=ht:active:{{ $json.contact_id }}`** |
| 8 | `ht-arm` | code | body verbatim (`3353134adc1f`) |
| 9 | `ht-stamp` | redis set | key → **`=ht:active:{{ $('ht-arm').first().json.contact_id }}`** |
| 10 | `ht-first?` | if | verbatim (`2886c0ea5dc3`) |
| 11 | `ht-intervene-notice` | executeWorkflow | **`workflowId.value` → `aoydkG1dbItXR5jXFEQsP`** AND **`is_test` REMOVED** (R5 — leaving it true means the notice is logged, never sent). Drop the `test_run_id` input. |
| — | edge | | `Update a Contact` → `ht-cfg-enabled` |

`ht-refresh-only` (noOp) also promotes — it is the silent-refresh terminal HT-2 asserts on, and its
presence is what makes a skip visible in runData rather than inferred from absence.

**DO NOT PROMOTE — and do not let any of these ride:**

- [ ] `ht-driver-webhook`, `When Executed by Another Workflow`, `harness-envelope` — harness drivers.
- [ ] The `Respond.io Trigger` **Code stand-in** — live keeps its real `respondioTrigger`. Deleting it
      from live blackholes the webhook (§48's explicit inverse).
- [ ] The six egress **stand-ins** — `Update a Contact` (respondio), `Execute a SQL query` +
      `Select rows from a table` (postgres, prod CRM), `conversation-sla-tracking-update` +
      `-create` (httpRequest, SLA writes), `save-session-vars` (httpRequest, PUT
      conversation-variables). Live keeps all six real. Promoting any one is a functional outage.
- [ ] The `Call 'sub-respond-save-message-redis'` **repoint** — live must stay
      `UrETd-jm46tFj3Xw7w8vL`. Promoting `tWm5DYLxfypmVC1T` sends production message logging into an
      unconsumed TEST sink (§48b's exact shape).
- [ ] **Do not delete live's `Webhook` / `webhook-to-respond-convert`.** They were removed from the fork
      only; they are a real second ingress on live.
- [ ] Any `test_run_id` / `ht_case` plumbing. `ht-gate` and `ht-arm` carry `test_run_id` through and it
      is `null` on live — behaviour-neutral, keep the bodies verbatim, but pass no such input.
- [ ] Any `test:` redis prefix. **Zero `test:` strings may exist in the promoted diff.**

**Post-promote:** a 409 `"conflict with one of the webhooks"` is EXPECTED on this workflow and the write
+ publish **still persist** (§60) — judge by resulting STATE, not the HTTP code, and the **user must
confirm Active / no trigger error in the UI**, which is not verifiable read-only.

## G3 — `ht-sweeper` (new live workflow): stand-in → real conversions

| fork node | becomes | must-verify |
|---|---|---|
| `ht-findcontact` (code stand-in) | `executeWorkflow` → **`D62_NHUOrugeULSFwfjEJ`** | input key is **`contact_identifer`** (yes, that spelling — verified against exec 12166204). **`mode: each`** — default mode runs once and returns item 0 only, silently breaking every multi-contact tick. Assert the sub's write/template nodes are still orphaned (R4). |
| `ht-clear-flag` (code stand-in) | `respondio` CONTACTS/UPDATE_CONTACT, `is_human_intervened:false` | **G0.1 applies here** — insert the field-re-attach node downstream (R1). |
| `ht-egress-log` (redis push) | **DROP** — harness-only; reads `$('ht-sweep-driver')` | if kept, it writes to a `test:egress:` list on prod redis |
| `ht-timeout-notice` | executeWorkflow → **`aoydkG1dbItXR5jXFEQsP`**, **`is_test` REMOVED**, drop `test_run_id` | R5 |
| `ht-driver-webhook` | **DROP** — harness entry point | `Schedule Trigger` (30 s) is the live trigger |
| `ht-sweep-driver` | decide explicitly | it is the harness fixture/`test_run_id` source. Enumerate its readers before dropping — `ht-egress-log` and `ht-timeout-notice.test_run_id` read it by name (§5/§63: `$('x')` reads are not redirected by rewiring) |
| all redis keys | `test:ht:` → `ht:` | 8 nodes: `ht-sweep-enabled/-timeout/-pilot/-keys`, `ht-recheck-stamp`, `ht-forget`, `ht-forget-silent` (+ `ht-egress-log` if not dropped) |
| `ht-carry-contact` | **PROMOTE — BLOCKING, do not omit** | ⚠️ **The plan's BUILD LOG blocking note applies verbatim:** on live `ht-findcontact` becomes the real sub, which returns the same raw respond.io shape — **`id`, no `contact_id`** (I verified this against exec 12166204: the terminal `If contact exists` emits `{id, firstName, …, custom_fields:[{name,value}], …}` at top level, and `is_human_intervened` is the **STRING** `"false"`). **Promoting the sweeper without `ht-carry-contact` ships the identical dead feature** — every recheck misses, `ht-classify` always answers `skip-vanished`, no flag is ever cleared and no notice is ever sent. The one-leaf alternative `{{ $json.id }}` was correctly rejected: it keys the redis DELETE on the id the lookup *returned* rather than the candidate we decided to expire, so a mis-attributed lookup would delete another contact's stamp before any guard ran. |

## G4 — `ht-config-form` (new live workflow)

Redis keys `test:ht:*` → `ht:*` (7 nodes, including `ht-config-audit` → `ht:config-audit`). `n8nUserAuth`
per D4 — if basic auth is still wanted, the **user** must create the `httpBasicAuth` credential first
(MCP cannot, §2), and binding a generic-auth credential requires a **REST PUT**, which always
auto-publishes (§55). Confirm the write→read-back→echo path against real `ht:*` keys once, and confirm
the form cannot be reached without an n8n login.

## G5 — Rollback

- `respond-send-user`: `publish_workflow` @ **`c23ce991-64d7-43dc-b8e8-bcd4c9c12de0`**.
  ⚠️ Rolling back ACTIVE does **not** repair the DRAFT — manual runs from the editor execute the draft
  (§ the D18 postscript). Repair both.
- Kill-switch: `ht:enabled=0` (or `DEL ht:enabled` — absent means OFF).
- `ht-sweeper`: deactivate. `ht-config-form`: deactivate.
- New workflows roll back by deletion, not a pointer move.

## G6 — Post-promote verification, on the path actually changed (§56)

- [ ] An **intervene notice** arrives on WhatsApp for 437264483 on a real agent reply (not a happy-path
      smoke test — R5's failure mode is invisible to anything except "did the message arrive").
- [ ] A second reply inside the timeout produces **no duplicate** (`ht-refresh-only` in runData).
- [ ] After the timeout: flag observed `false`, **timeout notice delivered**, and `ht:active:<id>`
      **absent** (this is the assertion R1 exists to protect — check the key, not just the message).
- [ ] A further reply **re-fires** the notice (the forget → re-stamp lifecycle).
- [ ] `is_test` absent from every promoted `executeWorkflow` input; zero `test:` strings anywhere in
      either promoted workflow.
- [ ] A non-pilot contact is untouched while `ht:pilot-contacts` is non-empty.
- [ ] `sorento-main` / `sorento-main-INJECT` / `respond-close-convo` versionIds unchanged.
- [ ] Topology assertion (§ D18): no node reachable from itself, and every spliced node's outputs land
      outside the splice.
