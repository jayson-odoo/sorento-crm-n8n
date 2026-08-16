# human-intervened-timeout — build manifest + node diff

Change: `plans/human-intervened-timeout-plan.md` · UAC: `tests/uac/HT.md` · Slices **S1 / S2 / S3**
(S4 promote is NOT in this build). Built 2026-08-12 by the coder seat.

**Nothing live was written.** `respond-send-user` (`eG3AA-TWo17-E1-DlHLnH`) was read with a GET and
used as a template; `sorento-main-INJECT`, `respond-close-convo`, the live spine and every shared sub
were read-only. All three artifacts below are NEW workflows created with `POST /workflows`, all
`active: false`.

## Artifacts

| slice | workflow | id | versionId (build) | nodes | active |
|---|---|---|---|---|---|
| S1 | `respond-send-user HT-FORK` | `itsbBtShEktWQFx6` | **`bd1f70c6-879c-4b91-b16a-0bbcedc72c1b`** (rev5) | 25 | false |
| S2 | `ht-sweeper BUILD` | `S0V5TFhPNYJ7d9Ra` | **`c38aaa81-5967-404a-8667-200e42461c45`** (rev5) | 25 | false |
| S3 | `ht-config-form BUILD` | `tpEueReClq5OWUgv` | **`569af22d-feae-4f90-a515-28de4050794e`** (rev5) | 11 | false |

Revision history: rev1 initial build · **rev2** F-RECHECK (tester) · **rev3** R1/R2/R3/R8 + instrument
gaps (reviewer) · **rev4** fixture-layer tags (tester follow-up) · **rev5** cross-review batch (all three
workflows). Prior versionIds, for rollback:
S1 `a8776f5e…` → `c37542ce…` → **`bd1f70c6…`** ·
S2 `033e568f…` → `c5193aa5…` → `4e7b4747…` → `e17c61bd…` → **`c38aaa81…`** ·
S3 `44c91090…` → **`569af22d…`**.

Live workflows read (unchanged, recorded so drift is detectable):
`respond-send-user` `eG3AA-TWo17-E1-DlHLnH` @ `c23ce991-64d7-43dc-b8e8-bcd4c9c12de0` (== activeVersionId).

## Rollback

These are new workflows, so rollback is deletion, not a version pointer move:

```bash
set -a && . ./.env && set +a
# 1. deactivate (only needed if a tester activated them)
for id in itsbBtShEktWQFx6 S0V5TFhPNYJ7d9Ra tpEueReClq5OWUgv; do
  curl -s -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_API_BASE/workflows/$id/deactivate" | head -c 200; echo
done
# 2. archive/delete
for id in itsbBtShEktWQFx6 S0V5TFhPNYJ7d9Ra tpEueReClq5OWUgv; do
  curl -s -X DELETE -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_API_BASE/workflows/$id" | head -c 200; echo
done
# 3. drop the harness redis namespace (canonical ht:* is NEVER touched by this build)
#    keys: test:ht:enabled test:ht:timeout-sec test:ht:pilot-contacts test:ht:active:* test:ht:config-audit
```

There is nothing to roll back on live. If S4 is ever run, its rollback is
`publish_workflow respond-send-user @ c23ce991-64d7-43dc-b8e8-bcd4c9c12de0` plus `ht:enabled=0`.

---

# rev5 — cross-review batch (2026-08-12)

Six fixes across all three workflows. Two were verified against the deployed bodies before being touched;
both reproduced exactly as reported.

## 1. FAIL-OPEN ALLOWLIST — `ht-gate.js`, `ht-sweep-census.js` (the serious one)

`readNode()` collapsed **"the read failed"** and **"the value is absent"** into `undefined`, and
`parsePilot(undefined)` is `[]`, which means EVERYONE. So if only the pilot leg broke — node renamed,
`propertyName` drift, node not executed — while `enabled` still read `"1"`, the **pilot phase acted on
every real contact**. Measured before the fix: contact 999999, not in the allowlist, came back
`ht_should_act: true`.

The kill-switch already failed closed. The allowlist is the one whose failure direction is a real customer
receiving a message, and it did not.

`readNode` now returns `{ok:true, value}` / `{ok:false, why}`, and a failed read produces
`ht_skip_reason: 'config-read-failure'` **ahead of** the kill-switch check, with the failing legs named in
`ht_config_read_failures` (also on the census row and object). **The asymmetry is preserved and asserted:
an empty-string or absent VALUE still means everyone** — that is the announce flip, deliberate — while a
failed READ is not permission to act.

| | after |
|---|---|
| broken pilot read, contact 999999 | `should_act: false`, reason `config-read-failure`, leg named |
| absent pilot VALUE (the flip) | `should_act: true` — unchanged |

New mutants: `FP-READPREC`, `FP-READPROP`, `FP-SWEEPREADPREC`, `FP-FLIPBROKEN` (the last one mutates in
the *overshoot* direction — treating an absent value as a failure would make the flip impossible).

## 2. STRANGER-ID WEDGE — `ht-carry-contact.js`

The `!wanted.has(id)` throw refused the **entire tick**, and stamps survive an error — so a single
mis-attributed lookup recurred every 30 s forever and wedged the sweeper **instance-wide**. Realistic
trigger: a respond.io **contact merge**, where looking up a deleted id returns the surviving contact's id.
This is the same R3 outage shape this file's own header documents, reintroduced on the adjacent branch.

A stranger is now **dropped**, never thrown on, and recorded in `lookup_strangers`. Its candidate then
pairs with nobody, so the existing `forget-unknown` reaps the stamp with **zero egress** — which is the
semantically correct answer for a merged-away contact, not merely the safe one. **No key is ever derived
from a stranger** (asserted). The per-candidate `no contact_id` throw is kept.

Measured after: stranger `555` + valid candidate `111` in one tick → no throw, `437264483:reap`,
`111:paired`. New mutants: `FP-STRANGERWEDGE` (restore the throw), `FP-STRANGERQUIET` (stop recording it).

## 3. MINUTES INTEGRITY — `ht-config-apply.js`

The form accepted fractional minutes (1.5 → 90 s) while `ht-gate` renders `round(sec/60)`, so a contact
could be told "inactive for 2 minutes" under a 90-second timeout — the customer-facing reply misstating the
real timeout by up to ~50%. Minutes are now rounded to a whole number before the floor, so `ht:timeout-sec`
is **always a multiple of 60** (asserted as an invariant over six inputs) and every consumer agrees by
construction. The rounding is reported in `notes`, not silent. Side effect recorded: the 60 s floor clamp
is now unreachable through this path and survives as defence in depth. New mutant: `FP-FRACMIN`.

## 4. SILENT KILL-SWITCH INVERSION — `ht-config-apply.js`

An unrecognised **non-empty** kill value wrote OFF with an **empty** `notes[]` — the note only fired on
`''`. So relabelling the dropdown (`"on"` → `"Enabled ✅"`) silently disabled the whole feature and the
completion screen reported success with nothing to look at. Fail-closed is right; fail-closed and *silent*
is how a feature stays off for a month. An unrecognised value now emits a loud note naming the value seen,
what was written, the recognised sets, and that the feature is now DISABLED. Both sides asserted — a
recognised `on`/`off` must stay quiet, or the warning becomes noise nobody reads. New mutant:
`FP-KILLSILENT`.

## 5. EPOCH-0 / ABSENT CONSISTENCY — `ht-sweep-census.js`, `ht-classify.js`

The census treated `score_ms <= 0` as unparseable-forever (so a zero stamp was **never reaped** and
immortalised the flag) while `ht-arm` treats `0` as a perfectly valid stamp: two nodes disagreeing about
the same value. A zero/negative stamp is now **expired and reapable** — the flag check still gates the
notice, so this authorises nothing any other expired stamp would not. A genuinely **non-numeric** stamp is
still refused rather than guessed at.

`ht-classify`: `Number('') === 0`, so an absent re-read was recorded as `recheck_ms: 0` — a real-looking
measurement of epoch 0. Absence is now tracked separately and reported as `null`; a genuine `"0"` re-read
still reports `0`. New mutants: `FP-EPOCH0`, `FP-RECHECKZERO`.

**Known residual, recorded rather than half-fixed:** a *non-numeric* stamp is still never reaped — the
recheck reads the same garbage and answers `skip-vanished`, so it cannot be fixed in the census alone.
Bounded (it needs a corrupt write, which nothing in this feature performs) and it feeds the D1 `KEYS` cost.

## 6. DARK-SHIP COST — the sweeper graph

The kill-switch was only consulted **inside** `ht-sweep-census`, which runs **after** `ht-sweep-keys`. So a
dark-shipped feature — the intended state between the S4 promote and the flip, potentially weeks — paid an
O(keyspace) `KEYS` plus a GET per key on the **shared production redis every 30 s** to build a census it
then discarded. `KEYS` is single-threaded and independent of pilot size (reviewer R6), so this is the full
cost for zero benefit.

New: `ht-sweep-armed` (Code, `1e70f9807cf2` / `c07ea42be6b1`) → `ht-armed?` (If, `63e886abaa8a`) →
`ht-sweep-idle` (NoOp), spliced `ht-sweep-enabled` → **`ht-sweep-armed`** → `ht-armed?` → `ht-sweep-timeout`
(true) / `ht-sweep-idle` (false). It fails closed in the cost direction too: a *failed* kill-switch read
does not scan. The census keeps its own check as defence in depth, so removing this node degrades cost,
never safety. New mutants: `FP-ARMED`, `FP-ARMEDREAD`.

> ### ⚠️ UAC IMPACT — HT-11's assertions change
> With the kill-switch off, `ht-sweep-keys` and `ht-sweep-census` **no longer appear in runData at all**,
> so HT-11 can no longer assert "the census shows `skip_reason: kill-switch-off`". Assert instead:
> `ht-armed?` took output 1, `ht-sweep-idle` ran, and `ht-sweep-keys` / `ht-sweep-census` / `ht-findcontact`
> are **ABSENT from runData**. That is a strictly stronger statement — nothing was even read — and it is an
> assertion on node presence, not on a status. The census's own kill-switch branch is still covered
> offline (`FP-SWEEPKILL`).

## Changed nodes (rev5)

| workflow | node | param-sha | body-sha |
|---|---|---|---|
| S1 | `ht-gate` | `41c0c32075d8` | `efd337ebf753` |
| S2 | `ht-sweep-armed` **(new)** | `1e70f9807cf2` | `c07ea42be6b1` |
| S2 | `ht-armed?` **(new)** | `63e886abaa8a` | — |
| S2 | `ht-sweep-idle` **(new)** | `44136fa355b3` | — |
| S2 | `ht-sweep-census` | `7403f1de593b` | `2a4741ccb7e5` |
| S2 | `ht-carry-contact` | `9aaa09e50a77` | `76eec70b8f27` |
| S2 | `ht-classify` | `28266a6c98a6` | `22ad9adf131c` |
| S3 | `ht-config-apply` | `16d02392550b` | `307e3e074a83` |

22/25 (S2), 25/25 (S1) and 11/11 (S3) node ids preserved by name; the only edge change is the
`ht-sweep-enabled` splice; credential counts unchanged (5 / 8 / 7, all redis).

## Mutation battery: 48/48 CAUGHT — and three EQUIVALENT mutants found and removed

Investigated per §66 rather than patched around; each is recorded **in `mutate.sh`** so it is not re-added:

* `FP-READFAIL` / `FP-SWEEPREADFAIL` — `rPilot.ok ? parsePilot(rPilot.value) : []` → `parsePilot(rPilot.value)`
  survived, and is **literally equivalent**: on a failed read `value` is `undefined` and
  `parsePilot(undefined)` already returns `[]`. The ternary is self-documenting, not load-bearing; the
  **precedence check** is what stops the fail-open, and `FP-READPREC` covers it. Worth stating plainly,
  because reading the ternary as "the fix" would be wrong.
* `FP-STRANGERKEEP` — leaving a stranger in the map survived, correctly: `wanted` is exactly the candidate
  ids, so no candidate can ever look a stranger up. The delete is hygiene. Replaced by `FP-STRANGERQUIET`,
  which mutates the observable half (the record).
* `FP-UNITS` **aborted** on a stale anchor (the whole-minutes change moved it) — third time the §0-S9 count
  guard has caught that instead of scoring a silent no-op.

## rev5 gate results

harness **264/264 PASS** · `mutate.sh` **48/48 CAUGHT** · `assert-built.py` **C1–C9b ALL PASS** ·
`--self-test` **7/7 + 4/4 + C9b discriminates**. C9 also caught my own omission during this batch —
`ht-sweep-armed` was not in `--emit-schema`, so it flagged the new node as an opaque source rather than
letting a downstream reference resolve against nothing.

Live re-verified untouched.

---

# rev4 — the fixture layer itself (tester follow-up, 2026-08-12)

Tester's final verdict was PASS / APPROVE for S1/S2/S3, with one non-blocking follow-up. It is worth more
than "non-blocking" suggests, because both halves are the same defect class this whole build has been
chasing — sitting one level BELOW the code, in the layer that decides which fixture a case gets.

**S2 only.** `e17c61bd-2da7-4c7c-8d94-b93b36fcd399`, one node changed: `ht-findcontact`
(param `377507f4cf60`, body `0a3d091fc0b3`). 22/22 node ids preserved, no edges touched, 8 credentialed
nodes unchanged. S1 and S3 untouched.

## 1. `"notfound"` — the hard-miss tag that did not exist

No tag produced a zero-item lookup, so **HT-18 — the `forget-unknown` gate, i.e. the path that used to
WEDGE the sweeper permanently (reviewer R3) — was not live-drivable at all.** The most consequential
recovery path in the feature could only be exercised offline. `"notfound"` now emits **zero items for that
contact**, mirroring the real sub exactly: `If contact exists` gates on `$json.id`, and its not-found
branch runs `Find a Contact1` whose error output is unwired, so a hard miss yields no items — not an empty
object. Other contacts in the same tick are unaffected.

## 2. An UNKNOWN tag now THROWS instead of silently authorising egress

The tester invented a `"notfound"` tag before it existed; it fell through to the default and ran
**`clear-and-notify`** — the one outcome that authorises a flag write and a WhatsApp send
(exec **12179301**). So a case asking for a shape the fixture layer does not implement quietly received
the most dangerous shape instead, and nothing anywhere reported the substitution.

That is **LESSONS §61's green-that-cannot-fail, one level below the code**: a typo in a case is
indistinguishable from the case passing, because the case never sees which fixture it got. Every gate in
this build — 211 assertions, 36 mutants, C1–C9b — sits *above* the fixture layer and all of them would
have stayed green.

The fix separates two things that were sharing a branch:

| tag state | outcome | why |
|---|---|---|
| **ABSENT** (no entry) | `flag=true` ⇒ clear-and-notify | a deliberate decision, kept: a harness must not be able to pass a case by quietly handing itself the *inert* fixture |
| **UNRECOGNISED** | **THROW**, naming the known tags | a mistake, not a decision — and the default it used to inherit is the egress-authorising one |

`""` and surrounding whitespace still count as absent; `"flag=fasle"` throws.

## Confirmed against the DEPLOYED body (not the local file)

```
deployed == local  : True          (versionId e17c61bd-2da7-4c7c-8d94-b93b36fcd399)
notfound   -> 0 items              (was 1 item = clear-and-notify)
unknown    -> THROWS: ht-findcontact: unknown fixture tag "no-such-tag" … Known tags: flag=false, …
tester tag -> THROWS               (the exec-12179301 shape is now impossible)
absent     -> is_human_intervened "true"   (the deliberate default, unchanged)
```

## Coverage added

17 new assertions (**211 total**) covering the whole tag map — which had **none**, having run only under
`--emit-schema` — including an end-to-end chain proving `notfound` → `lookup_missing` →
**`forget-unknown`** and *not* `clear-and-notify`. Three new mutants (**36 total**):
`FP-TAGFALLTHROUGH` (restore the silent fall-through), `FP-TAGNOTFOUND` (stop emitting zero items),
`FP-TAGKNOWN` (drop `notfound` from the known list).

`FP-TAGKNOWN` **CRASHED** on first run — a bare `runFind` meant the mutant killed the suite instead of
asserting, which §72/F6 says is not a detection. Two calls wrapped in `noThrow()`; it now produces real
comparisons. Third time that guard has earned its keep here.

**The rev3 resync gate also earned its keep immediately:** `mutate.sh` refused to run at all until the
change was deployed (`ABORT: a deployed Code body differs from its tracked source`), rather than scoring
36 mutants against bytes nobody was running.

## rev4 gate results

harness **211/211 PASS** · `mutate.sh` **36/36 CAUGHT** · `assert-built.py` **C1–C9b ALL PASS** ·
`--self-test` **7/7 + 4/4 + C9b discriminates**. Live re-verified untouched.

---

# rev3 — reviewer R1 / R2 / R3 / R8 + instrument gaps (2026-08-12)

Reviewer verdict was APPROVE for S1/S2/S3 with two BLOCKING gates before S4 exists. Both landed on the
build, plus three notes and four instrument gaps. Full review:
`tests/reviews/human-intervened-timeout-review.md`.

## R1 (BLOCKING, G0.1) — F-RECHECK's class recurring one node downstream, on the promote path

`ht-forget.key` and `ht-timeout-notice`'s inputs read `$json.contact_id` / `$json.ht_timeout_notice`. On
the build those resolve because `ht-clear-flag` is a Code stand-in that re-forwards both and
`ht-egress-log` is a redis `push` (passthrough). At S4 `ht-clear-flag` becomes the real respondio
CONTACTS/UPDATE_CONTACT node, whose real output — measured on live `respond-send-user` exec **12146305** —
is exactly `{"contactId": 423755030}`. So on live, unfixed: the stamp delete would target `ht:active:`
and miss, **and the timeout notice — the entire point of the feature — would fire with an empty recipient
and an empty body, on a real send path.**

**Fix: `ht-carry-clear`** (`n8n-nodes-base.code`, param `2e235edbb31b`, body `8a43cf73617d`), spliced
`ht-egress-log` → **`ht-carry-clear`** → `ht-forget`. It matches on the id the egress node itself
reports (`contactId`, which BOTH the stand-in and the real node emit) rather than on index or on n8n
paired-item lineage, because `ht-classify` emits a row for every candidate while only the
clear-and-notify subset reaches here — so index alignment against `ht-classify` is simply wrong, and the
reviewer's suggested `.item` walk is unavailable in a `runOnceForAllItems` node. It also **re-checks
authorisation**: a row whose `action !== 'clear-and-notify'` is refused rather than sent, which is the
last gate before a real WhatsApp send at S4. `ht-forget`/`ht-timeout-notice` keep reading `$json`, so
D3's passthrough property is preserved.

## R2 + R3 (BLOCKING G0.2, and a note that turned out to be worse than noted) — one fix, not two

R2: `ht-carry-contact`'s guard read `if (fetchedId && fetchedId !== contact_id) throw` — it demanded a
CONTRADICTION, not an identification, so a payload with **no `id`** short-circuited the refusal and flowed
to `clear-and-notify`, authorising a flag write and a WhatsApp notice off a contact never positively
identified. Reproduced before fixing.

R3 was filed as a NOTE ("a not-found lookup leaks its stamp forever, harmless in isolation"). Measured, it
is worse: on a hard not-found the findcontact sub returns **zero items**, and under the old INDEX-ALIGNED
pairing `ht-carry-contact` **THROWS** — so a single deleted or unknown contact did not merely leak a
stamp, it **wedged the sweeper permanently**: every subsequent tick errored, and because the stamp
survives an error the condition never cleared itself. **And the literal R2 fix (throw on an id-less
payload) has exactly the same shape** — fixing R2 alone would have hardened a permanent-outage path. They
are one defect wearing two hats.

**Fix: `ht-carry-contact` rewritten to pair BY IDENTITY** (param `a4511b1161f8`, body `3c4860de01fd`),
with three outcomes and no unreachable arm:

| lookup | outcome |
|---|---|
| returned exactly this contact | paired → carry on to the recheck |
| returned nothing for this candidate (deleted / not-found / id-less) | **`forget-unknown`** — the stamp is REAPED, ZERO flag write, ZERO notice |
| returned a contact **nobody asked for** | THROW — refuse the tick rather than derive a DELETE key from it |

R2 is satisfied *more strongly* than by throwing (an unidentified payload cannot reach
`clear-and-notify` at all) **and** the tick survives. R3's reaper falls out for free: `forget-unknown`
routes to the existing `ht-forget-silent`, so **no new wiring and no new egress surface**, and the
unbounded `ht:active:*` growth that feeds D1's `KEYS` cost stops. `ht-classify` gains the
`forget-unknown` branch (param `94bcc6beeb50`, body `39a5d704cc97`) and a `lookup_missing` field.

> **Deviation from the reviewer's literal instruction, deliberately.** R2 asked for "id-less payload must
> throw (refuse), not pass". It does not throw; it produces a distinct **non-egress** outcome. The safety
> requirement is fully met — no flag write, no send, and the row is visible in runData as
> `forget-unknown` rather than silently absent — while throwing would have shipped the R3 permanent-wedge.
> Recorded rather than silently substituted.

## R8 — `"inactive for 1 minutes"` (customer-facing)

`ht-gate` now pluralises (param `8bb758190017`, body `a01ca8e3b67f`). The harness previously **pinned**
the ungrammatical string as intended — LESSONS §73 exactly — so the pin was replaced by two assertions
(singular at 1, plural elsewhere) plus mutant `FP-PLURAL`. `ht-act?` `1a695018169c` and `ht-first?`
`5f1ca2ead3bf` changed **condition-UUID only** (the deterministic-uuid5 switch reaching these two for the
first time) — semantic no-op, named per §51.

## G0.3 — C9 extended: the promote-shape pass (C9b)

R1's real lesson is that **C9 passed, and would have kept passing**, on a graph whose promoted form was
broken: C9 resolves against the stand-in's fields, and a stand-in that re-forwards a field is correct on
the build and absent on live (LESSONS §65). Fixing R1 without this leaves the class open for the next
promote.

`c9.py` now runs a second pass in which every node the promote converts is resolved against **the real
node's recorded live output**, and harness-only nodes are skipped as absent from the promoted graph. The
shapes live in `fixtures/promote-real-shapes.json`, **captured from real executions** with provenance
(`ht-clear-flag` ← exec 12146305; `ht-findcontact` ← exec 12166204), never hand-written. The
`_dropped_at_s4` list is load-bearing documentation: it forces the promote inventory to be written down
rather than assumed.

**Proof C9b went RED on the shipped rev2 graph, before the fix** — all three of R1's references:

```
FAIL C9b promote-shape [ht-sweeper BUILD] — UNRESOLVABLE FIELD:
  ht-forget.key reads $json.contact_id, but its upstream ['ht-egress-log'] emits ['contactId']
  | ht-timeout-notice.workflowInputs.value.contact_identifer reads $json.contact_id, … emits ['contactId']
  | ht-timeout-notice.workflowInputs.value.message reads $json.ht_timeout_notice, … emits ['contactId']
```

`--self-test` keeps that permanent (`C9b-real-defect(R1)` reconstructs the rev2 graph), **and asserts the
discrimination**: plain C9 PASSES the same graph that C9b fails. A second check that fires whenever the
first one does is not a second instrument — so "C9 could not have caught this" is measured, not argued.
One badly-chosen self-test mutant (`C9b-stale-shape`, targeting `flag_raw`, which `ht-carry-clear` does
emit) was **removed rather than kept as a passing line**.

## Instrument gaps closed (reviewer §5)

1. **`mutate.sh` had no resync step** — §72's *second* guard, delegated to C4 by comment only with nothing
   enforcing the ordering, so a standalone run printed a confident `24/24 ✅` against possibly-stale
   bytes. It now shells out to `assert-built.py` C4 first and **aborts** on drift, on missing credentials,
   or on empty checker output (which cannot distinguish "in sync" from "the check did not run").
2. **`ht-config-echo` — a node S4 SHIPS, with zero assertions** (it ran only under `--emit-schema`), whose
   whole job is the `READ-BACK MISMATCH` banner, and the tester's live HT-14 only ever saw the green side.
   Now 13 assertions covering **both** sides, including the absent-key shape and the dangerous
   empty-pilot-read-back, plus mutants `FP-ECHOMISMATCH` and `FP-ECHOINTENT` (the latter composes the echo
   from intent instead of the read-back — i.e. it would cheerfully repeat what the user typed).
4. **`harness-envelope`'s documented refusal** is now asserted (it is the node that stops a run
   fabricating a contact id), along with both accepted payload shapes.
3. **`OPAQUE_TYPES` was never read** — the dict's name promised it drove the check while being
   documentation only (§70b). It is now consulted for the reason string; the fail-safe (unenumerated type
   ⇒ opaque ⇒ fails unless allowlisted) is unchanged. *Partially closed:* C9 still derives each node's
   field set from ONE fixture path. Measured today all four `ht-classify` outcomes and all three `ht-gate`
   outcomes emit identical key sets, so there is no live hole — but the instrument does not know that.
   **Left open and recorded** rather than claimed: intersection-across-branches is the right fix and is
   listed for S4.

## Mutation battery: 33/33 CAUGHT — and three non-green results, all real

* `FP-CARRYPAIR` **aborted** — its anchor was the R2 fail-open guard, rewritten. Second time the §0-S9
  count guard has caught a stale anchor in this suite instead of scoring a silent no-op. Replaced by
  `FP-CARRYSTRANGER`.
* `FP-CLEARSRC` first **SURVIVED**: merely REORDERING `j.contactId` / `j.contact_id` is equivalent, since
  either ordering still falls back. The hazard is *losing the fallback*, not choosing it second — the
  mutant was re-aimed at `const raw = j.contact_id;` and is now caught. §66: the survivor was a claim
  about the mutant, not about the code.
* `FP-CARRYWEDGE` **CRASHED** (zero FAIL lines, non-zero exit) — the R2/R3 cases called `runCarry`
  directly, so a throw killed the process, which is §72/F6's "a crash is not a detection". Five call sites
  are now wrapped in `noThrow()`, and the mutant produces real comparisons.

New mutants: `FP-CARRYOPEN` (restore the R2 fail-open), `FP-CARRYMISS` (treat a missing lookup as found),
`FP-CARRYWEDGE` (refuse a short lookup list instead of reaping), `FP-CARRYSTRANGER`, `FP-CLEARSRC`,
`FP-CLEARAUTH` (drop the authorisation re-check), `FP-CLEAREMPTY`, `FP-PLURAL`, `FP-ECHOMISMATCH`,
`FP-ECHOINTENT`.

## Not done, with reasons

- **G0.4 — `DBSIZE` + `KEYS ht:active:*` p99 on the shared prod redis (R6).** I have no redis client and
  must not probe prod hosts; there is no suitable helper workflow on the instance. **Unmeasured — a
  user/tester action, and R6 is right that it is PRE-ACTIVATION, not pre-flip**: `KEYS` is O(total
  keyspace) on a single-threaded server, so the cost is independent of pilot size and is paid in full from
  the moment `ht:enabled=1`.
- **Instrument gap 3 (branch-intersection schema)** — partially closed, see above.
- **R7** (HT-FP2/HT-FP4 now live-drivable) — a tester action; recorded in the S4 checklist.

## rev3 gate results

harness **192/192 PASS** · `mutate.sh` **33/33 CAUGHT** (resync gate active) · `assert-built.py`
**C1–C9b ALL PASS** · `--self-test` **7/7 checks + 4/4 C9/C9b cases + C9b shown to discriminate**.

Live re-verified untouched after rev3: `respond-send-user` `c23ce991…`, `sorento-main-INJECT`
`e273ac0f…`, `respond-close-convo` `4a2e963d…`, `sorento-consume-main` `469e7259…`,
`zz-sub-sendmsg-STANDIN` `19313cc1…`, `sorento-sub-respond-findcontact-respond` `2aef27ad…`,
`sorento-sub-respond-sendmsg-respond` `91171ac3…`.

---

# rev2 — F-RECHECK fix (2026-08-12, after tester REQUEST-CHANGES)

**The defect.** `ht-recheck-stamp`'s key was `=test:ht:active:{{ $json.contact_id }}`, but its upstream
`ht-findcontact` emits a respond.io **contact**, whose id field is `id` — never `contact_id`. The key
resolved to `test:ht:active:` on every tick, every recheck missed, `ht-classify` always answered
`skip-vanished`, and `clear-and-notify` / `forget-silent` were both **structurally unreachable**: flags
never cleared, the timeout notice never sent, `test:ht:active:*` accumulated forever. Reproduced 4× by
the tester (execs 12170257, 12170544, 12170937, 12171009), twice through the real webhook with both
`flag=true` and `flag=false` fixtures. It failed toward inert, so §0 held — the feature was simply dead.
Verified independently before fixing: the deployed key expression and `ht-findcontact`'s emitted key set
both confirmed from a fresh REST GET.

**The fix — one new node, not a one-leaf expression change.**

| | |
|---|---|
| node added | `ht-carry-contact` (`n8n-nodes-base.code`, param `a553fb3de334`, body `85668d9561c9`) |
| rewired | `ht-findcontact` → **`ht-carry-contact`** → `ht-recheck-stamp` (was `ht-findcontact` → `ht-recheck-stamp`) |
| `ht-recheck-stamp.key` | **unchanged**: `=test:ht:active:{{ $json.contact_id }}` — now correct, because its upstream carries that field |
| `ht-classify` | param `971918628a9a`, body `47555ec7eba5` — reads `$('ht-carry-contact')` instead of `$('ht-sweep-fanout')` + `$('ht-findcontact')`; the mis-attribution refusal moved **out** of it and **into** `ht-carry-contact` |
| `ht-skip?` `9886f2c9de93`, `ht-flag-still-true?` `8f11b8f6db40` | **semantic no-op**: only the If-condition UUID changed, because the builder now derives it deterministically from the node name (uuid5) instead of a fresh uuid4. Without this a rebuild that changes nothing reports every If node as changed and buries the node that moved. Named rather than left to ride silently (LESSONS §51). |

**Why a node rather than `{{ $json.id }}`.** `$json.id` would have worked on both the stand-in and the
real sub, and it is the smaller diff — but it keys the redis DELETE on the id the *lookup returned*
rather than on the candidate we decided to expire, so a mis-attributed lookup would read and then
delete the wrong contact's stamp, **before** `ht-classify`'s mis-attribution guard ever ran. The new
node re-attaches the CANDIDATE's `contact_id` and owns that refusal upstream of the first key
derivation — a check that can cancel an action has to run before it.

**It is required on live too, not harness scaffolding.** At S4 `ht-findcontact` becomes the real
`executeWorkflow` call to `sorento-sub-respond-findcontact-respond`, which returns the same raw
respond.io shape: `id`, no `contact_id`. **S4 must promote `ht-carry-contact`.** Node ids were preserved
by name across the PUT (20/21; only `ht-carry-contact` is new) so the diff shows the one node that moved.

**The instrument — `assert-built.py` C9.** The fix without a gate would leave the class open, and this
class had beaten every existing gate: C1–C8 all passed, correctly, while the feature was inert, because
they check containment, namespace, sub-targets, body bytes and graph shape — never whether an
*expression* matches the shape its real upstream produces. The offline harness could not see it either:
it hand-builds every node's inputs, so it executes bodies and never evaluates a parameter. That is
LESSONS §71 (a review from `nodes/*.js` is blind to non-Code parameters) meeting §63 (a sound assertion
pointed at the wrong object).

C9 (`c9.py`) resolves every `$json.<field>` and `$('N')…json.<field>` reference in the **deployed**
parameters against the field set its source actually emits, and separately forbids `.first()` on a node
inside the per-item fan-out region (where it silently means "item 0 for every row" — the multi-contact
hazard). Field sets are **derived by executing the bodies** (`harness.js --emit-schema`, sentinel-delimited
on the stdout of the invocation C9 itself makes), never from a hand-written registry: a registry would be
a second copy of the truth, free to drift from the code exactly as the expression did, and to drift
silently. Redis passthrough semantics are encoded explicitly — only `push`/`set`/`delete` re-push the
input item; `get`/`keys`/`pop`/`incr`/`llen`/`info` build a fresh one and discard it. An opaque source
(trigger, sub-workflow output) makes a reference *unresolvable*, which **fails** unless allowlisted with
a reason, so a new node type cannot quietly widen the blind spot.

**Proof C9 goes RED on the real defect** (`assert-built.py --self-test`, 3/3):

```
ok   C9-real-defect makes C9 go RED
     FAIL C9 — UNRESOLVABLE FIELD: ht-recheck-stamp.key reads $json.contact_id,
          but its upstream ['ht-findcontact'] emits ['_standin','assignee',…,'id',…,'tags']
```

`C9-real-defect` reconstructs the **exact pre-fix graph** (removes `ht-carry-contact`, wires
`ht-findcontact` straight to `ht-recheck-stamp`) rather than a synthetic corruption — LESSONS §64 rule
iii. The other two are `C9-wrong-field` (a field that exists nowhere) and `C9-first-in-fanout`. C9 was
also observed red against the genuinely-deployed defective workflow before the fix was PUT, not only
against an in-memory mutation.

**Mutation battery: 24/24, and the two non-green results were both real.**

* `FP-ATTR` **aborted** on a stale anchor — the mis-attribution guard had moved between nodes. The §0-S9
  count guard caught it instead of scoring a no-op as a detection. Retired; `FP-CARRYPAIR` replaces it.
* `FP-CARRYID` (`contact_id,` → `contact_id: fetchedId || contact_id,`) **SURVIVED**. Per LESSONS §66 a
  survivor is a claim about the fixtures first, so it was investigated rather than patched around: it is
  a genuinely **equivalent** mutant, because the mis-attribution guard three lines above throws on the
  only input that could distinguish the two expressions. It was **removed with the reasoning recorded in
  `mutate.sh`**, and replaced by (a) a pinned INVARIANT in the harness —
  `contact_id === String(contact.id)` on every returned row, single- and multi-contact — so the reasoning
  is checked rather than asserted in a comment, and (b) `FP-CARRYPAIR`, which proves the guard itself can
  go red. Two honest instruments instead of one misleading green.

New mutants: `FP-CARRYPAIR` (drop the pairing guard), `FP-CARRYNEST` (break the nesting →
`custom_fields` unreachable). `FP-WRONGOBJ`'s anchor was updated to the new `ht-classify` read.

**Post-fix gate results:** harness 143/143 · mutate.sh 24/24 CAUGHT · `assert-built.py` C1–C9 ALL PASS ·
`--self-test` 7/7 + 3/3.

**Live re-verified untouched after the fix:** `respond-send-user` `c23ce991…`, `sorento-main-INJECT`
`e273ac0f…`, `respond-close-convo` `4a2e963d…`, `sorento-consume-main` `469e7259…`,
`zz-sub-sendmsg-STANDIN` `19313cc1…`, `sorento-sub-respond-findcontact-respond` `2aef27ad…`.

## Residual `test:ht:*` state the tester could not clean

The tester correctly could not delete `test:ht:active:437264483` (`1786519045117`) and
`test:ht:active:999999` (`1786518860578`): the only delete path was the broken sweeper, and creating a
redis utility is outside the tester's mandate. **After this fix the sweeper's own `ht-forget` /
`ht-forget-silent` is the mechanism.** I have deliberately NOT run it — driving a tick is a test
execution, and this particular tick IS the HT-8/HT-9 re-verification, so a coder running it would
replace the tester's own evidence with self-certification. One tick cleans both keys and re-proves the
fix:

```bash
set -a && . ./.env && set +a
# 1. timeout 1 min + ON + BOTH residual contacts in the pilot, so neither is skipped
#    (via the form, or three redis SETs): test:ht:enabled=1, test:ht:timeout-sec=60,
#    test:ht:pilot-contacts=437264483,999999
# 2. one tick (activate -> fire -> deactivate immediately)
curl -s -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_API_BASE/workflows/S0V5TFhPNYJ7d9Ra/activate"
curl -s -X POST "$N8N_BASE_URL/webhook/9478a398-de6d-4810-a742-b5d4d0fb2dd0" \
  -H 'Content-Type: application/json' \
  -d '{"test_run_id":"HT-CLEANUP-1","ht_case":"cleanup","fixtures":{"437264483":"flag=false","999999":"flag=false"}}'
curl -s -X POST -H "X-N8N-API-KEY: $N8N_API_KEY" "$N8N_API_BASE/workflows/S0V5TFhPNYJ7d9Ra/deactivate"
# 3. confirm gone: next tick's ht-sweep-keys shows scanned:0
```

`flag=false` on both routes them down `forget-silent` — **zero sends, zero flag writes, delete only**,
which is the minimum-egress way to clean up. Both stamps are far past any cutoff, so they are eligible.
Then re-seed the fail-closed state (`enabled=0`, `timeout-sec=300`, `pilot-contacts=437264483`).

`test:egress:HT-*` lists are inert harness records (`{guard:'sendmsg-standin', kind:'would_send', …}`)
and there is still no delete path for them; they are append-only logs in the `test:` namespace that
nothing outside these three workflows reads. Leave them, or add a `test:egress:*` sweep to the harness
if they ever become noisy. `test:ht:config-audit` is the form's intended audit trail — keep.

## Verification run at build time

```
$ python3 assert-built.py                        # C1–C9b ALL PASS  ← RUN FIRST (C4 = the §64 presence gate)
$ node   harness.js                             # 264 assertions, ALL PASS
$ ./mutate.sh                                   # 48/48 CAUGHT (self-resyncs via C4 and aborts on drift)
$ python3 assert-built.py --self-test           # 7/7 checks + 4/4 C9/C9b, + C9b shown to discriminate
```

The builder itself is committed at `tests/offline/human-intervened-timeout/build-workflows.py` and is
reproducible: a `--dry-run` re-build was diffed against the deployed workflows and all 19 Code bodies
came back byte-identical. It reads the node bodies from `nodes/*.js` and the stand-in banner from
`standin-header.txt` — one source for every body, which is what lets `assert-built.py` C4 be an exact
byte gate rather than an approximation.

`assert-built.py` is the gate for everything the offline suite is blind to (§71: If conditions, redis
key strings, sub-workflow targets, credentials, graph shape, **and — since rev2 — whether an expression
resolves to a field its upstream actually emits, which is check C9**). **Run `assert-built.py` at the start of
every test pass** — C4 byte-compares each deployed Code body against its tracked source, which is the
§64 "is the change still PRESENT" check that a behavioural test cannot provide.

---

# Node diff

## S1 — `respond-send-user HT-FORK` (`itsbBtShEktWQFx6`)

Live `respond-send-user` has **12** nodes, not the 4 the plan's baseline described (finding F1 below).
Fork = 25 nodes.

### a. Deleted from the fork

| node | live type | why |
|---|---|---|
| `Respond.io Trigger` | `respondioTrigger` | **LESSONS §52** — a duplicated respondioTrigger subscribes the *shared* credential to the real respond.io event stream even while inactive, fanning live customer traffic into the fork. Replaced by a name-preserving Code stand-in so `$('Respond.io Trigger')` still resolves. |
| `Webhook` | `webhook` | second, unrelated ingress path (`Webhook → webhook-to-respond-convert → Execute a SQL query`, bypassing the `If`). Irrelevant to the HT lane and a live-shaped entry point nobody would be watching. Removed rather than re-pathed. |
| `webhook-to-respond-convert` | `code` | orphaned by the above. |

### b. Kept BYTE-IDENTICAL to live (asserted by `assert-built.py` C7, param-hash vs a live GET)

| node | param-sha256 |
|---|---|
| `If` (`$json.source == "User"`) | `0e89b92944f2` |
| `compile-current-state` | `7ecc25c706ef` (body `4093dc6dd21a`) |

### c. Egress surfaces replaced by name-preserving Code stand-ins (§47 / §0 S8)

Every one keeps the **exact live node name** so downstream `$('…')` reads resolve, and emits the real
node's observed output shape. Containment is asserted on node **TYPE** — never on an absent
credentials block, which MCP redacts and which REST-created nodes can acquire by auto-binding.

| node | real type on live | real egress it replaces | stand-in body sha |
|---|---|---|---|
| `Update a Contact` | `respondio` | `UPDATE_CONTACT is_human_intervened:true` | `0bc974ae8504` |
| `Execute a SQL query` | `postgres` | SELECT on the **prod CRM DB** | `884d3d96291b` |
| `Select rows from a table` | `postgres` | SELECT on the **prod CRM DB** | `028ae4858c89` |
| `conversation-sla-tracking-update` | `httpRequest` | **SLA write** (staff email/WA ripple) | `bbb76cc80ec3` |
| `conversation-sla-event-tracking-create` | `httpRequest` | **SLA write** | `59d3f6911068` |
| `save-session-vars` | `httpRequest` | **PUT conversation-variables on the prod CRM** | `468ee3cd6d7f` |

`Select rows from a table` returns **zero items**, exactly as live does on every execution inspected
(12146305 / 12146929 / 12154913) — which is why the two SLA nodes never appear in those runs' runData.
Reproducing live faithfully and being safe coincide here; the two SLA stand-ins are therefore
unreachable on the live-faithful path and exist only so no credentialed `httpRequest` is in the JSON.

### d. Repointed

| node | live target | fork target | why |
|---|---|---|---|
| `Call 'sub-respond-save-message-redis'` | `UrETd-jm46tFj3Xw7w8vL` (RPUSHes the **prod ingest list**) | `tWm5DYLxfypmVC1T` (`sub-respond-save-message-redis TEST` → `sorento-respond-message-TEST`, **no consumer reads it**) | UAC §0 S3 amendment. Node type and `workflowInputs` unchanged, only `workflowId.value`. |

### e. Added — harness driver (no live counterpart; must NOT be promoted)

| node | type | notes |
|---|---|---|
| `ht-driver-webhook` | `webhook` | POST `/webhook/19c9c2bf-8b33-434c-a4d5-30a22b3734b0` — the tester's entry point. |
| `When Executed by Another Workflow` | `executeWorkflowTrigger` | `inputSource: passthrough`, for a wrapper-driven run. |
| `harness-envelope` | `code` `d99c814bd9ef` | accepts `{envelope}` / `{body:{envelope}}` / a bare envelope; threads `test_run_id` + `ht_case`; **throws** if `contact.id` is absent rather than fabricating one. |
| `Respond.io Trigger` | `code` `448d0c9f275c` | name-preserving stand-in for the deleted trigger. |

### f. Added — the S1 feature lane (this is what S4 promotes)

Additive, entirely downstream of the untouched flag/SLA lane: `Update a Contact` → HT lane.

| node | type | parameter of record | body sha |
|---|---|---|---|
| `ht-cfg-enabled` | `redis get` | key `test:ht:enabled` → `ht_enabled` | — |
| `ht-cfg-timeout` | `redis get` | key `test:ht:timeout-sec` → `ht_timeout_sec` | — |
| `ht-cfg-pilot` | `redis get` | key `test:ht:pilot-contacts` → `ht_pilot` | — |
| `ht-gate` | `code` | kill-switch + allowlist + source re-check; renders the notice | `8c57d21bf315` |
| `ht-act?` | `if` | `{{ $json.ht_should_act }}` is true | — |
| `ht-inert` | `noOp` | the "did nothing" terminal, so a skip is visible in runData | — |
| `ht-prev-stamp` | `redis get` | `test:ht:active:{{ $json.contact_id }}` → `ht_prev_ms`, **read before the write** | — |
| `ht-arm` | `code` | first-vs-refresh decision | `3353134adc1f` |
| `ht-stamp` | `redis set` | `test:ht:active:{{ $('ht-arm')…contact_id }}` = `ht_now_ms` | — |
| `ht-first?` | `if` | `{{ $json.ht_is_first }}` is true | — |
| `ht-intervene-notice` | `executeWorkflow` | → `lJ4IZEGwoTh6aay4`, `is_test: true` | — |
| `ht-refresh-only` | `noOp` | the silent-refresh terminal (HT-2 asserts this, not absence) | — |

Both `If` nodes test **nothing but a boolean a Code node already computed**. That is deliberate:
LESSONS §71 — an If condition is a parameter, invisible to code review and to every offline suite in
this repo, and two such hunks shipped unreviewed and broke production. All logic is in Code.

## S2 — `ht-sweeper BUILD` (`S0V5TFhPNYJ7d9Ra`)

`Schedule Trigger` (30 s) **and** `ht-driver-webhook` (POST `/webhook/9478a398-de6d-4810-a742-b5d4d0fb2dd0`)
→ `ht-sweep-driver` → three config reads → `ht-sweep-keys` → `ht-sweep-census` → `ht-sweep-fanout`
→ `ht-findcontact` → `ht-recheck-stamp` → `ht-classify` → `ht-skip?` → `ht-flag-still-true?`
→ `ht-clear-flag` → `ht-egress-log` → `ht-forget` → `ht-timeout-notice`; false branch → `ht-forget-silent`.

| node | type | notes | body sha |
|---|---|---|---|
| `ht-sweep-driver` | `code` | harness-only: `test_run_id` + the per-contact fixture tag map | `4e7ff8f885c4` |
| `ht-sweep-keys` | `redis keys` | `test:ht:active:*`, `getValues: true` — one call returns keys **and** stamps | — |
| `ht-sweep-census` | `code` | **always emits exactly one item** with the full census (scanned, cutoff, per-candidate age + skip reason). A quiet tick is 0 downstream items, so the census is the thing assertions read — §61: never let empty output mean pass | `f381bdc0bfcf` |
| `ht-sweep-fanout` | `code` | 0..N action items from the census; deliberately dumb | `fc7011430caa` |
| `ht-findcontact` | `code` **stand-in** | for `D62_NHUOrugeULSFwfjEJ`, which contains a `CREATE_OR_UPDATE_CONTACT` and a WhatsApp `SEND_TEMPLATE`; also a real read returns whatever the flag is *now*, so HT-8 and HT-9 could not both be deterministic | `59beb9234174` |
| `ht-recheck-stamp` | `redis get` | the race guard's re-read (Addition A1) | — |
| `ht-classify` | `code` | the **only** node that authorises the two egress actions. Three outcomes; throws on a malformed contact, an unknown flag encoding, index misalignment, or a mis-attributed lookup | `382bb1687164` |
| `ht-clear-flag` | `code` **stand-in** | for the respondio `is_human_intervened:false` write | `18691c3aa32e` |
| `ht-egress-log` | `redis push` | `test:egress:{{ test_run_id }}` ← the `_standin` `would_write` record, so HT-8's egress-log assertion reads real redis, not runData alone | — |
| `ht-forget` / `ht-forget-silent` | `redis delete` | `test:ht:active:{{ $json.contact_id }}` | — |
| `ht-timeout-notice` | `executeWorkflow` | → `lJ4IZEGwoTh6aay4`, `mode: each`, `is_test: true` | — |

## S3 — `ht-config-form BUILD` (`tpEueReClq5OWUgv`)

`ht-config-form` (formTrigger, `authentication: n8nUserAuth`) → `ht-config-apply` → `ht-config-audit`
→ write timeout / enabled / pilot → read all three back → `ht-config-echo` → `Form Ending`.

| node | notes | body sha |
|---|---|---|
| `ht-config-apply` | minutes→seconds with a 60 s floor; kill switch normalised to the exact `"1"`/`"0"` that `ht-gate` accepts; pilot ids split/trimmed | `0f479c8cc726` |
| `ht-config-audit` | `redis push` → `test:ht:config-audit` (the raw submission — the form best-practice "always persist the raw response", and an audit trail of who changed the timeout) | — |
| `ht-config-echo` | builds the completion screen from the **read-back**, not from the submission, and shows a loud `READ-BACK MISMATCH` block if redis does not hold what was written | `eccafb959a8a` |
| `Form Ending` | `respondWith: text`, title/message from `ht-config-echo` | — |

**Auth deviation:** the plan specified a basic-auth credential. MCP cannot create credentials
(LESSONS §2) and no `httpBasicAuth` credential exists to bind, so the build uses
`authentication: n8nUserAuth` (n8n login required) — strictly no weaker, and it needs no user step.
If basic auth is still wanted, the user must create the credential in the UI first.

---

# Findings

**F1 — the plan's baseline for `respond-send-user` was incomplete, and the gap is all egress.**
The plan describes 4 nodes (trigger → If → Update a Contact + SLA). Live has **12**, including three
egress surfaces the plan does not mention: `save-session-vars` (PUT conversation-variables on the prod
CRM), two prod-CRM `postgres` nodes, and a second ingress path (`Webhook` → `webhook-to-respond-convert`)
that reaches `Execute a SQL query` **bypassing the `If` gate entirely**. Anyone forking this from the
plan's description would have left a prod CRM write wired. All six are stand-ins in the fork.

**F2 — the plan's ZSET redis contract is not implementable with the installed Redis node.**
See Deviation D1. `n8n-nodes-base.redis` has no sorted-set operations at all.

**F3 — the "AI sends arrive with `source == 'api'`" assumption cannot be confirmed from runData, and
the evidence points somewhere better.** The plan flagged this as its one unproven assumption. All 5
retained `respond-send-user` executions are `source: "User"`, so there is no api-source payload to
capture. But the *absence* is the stronger signal: in the window 03:14–06:24Z the sendmsg sub
`aoydkG1dbItXR5jXFEQsP` logged **100 executions** (≈100 AI sends) while `respond-send-user`'s newest
execution was **04:23Z** with 5 total. AI/api sends therefore appear not to reach this trigger at all,
rather than reaching it and being filtered by the `If`. That is safer than the plan assumed — but it is
inference from absence, so `ht-gate` re-checks `source === 'User'` itself (HT-3 asserts the gate, not
the branch counts), and this stays **UNVERIFIED** until a real api-source execution is observed.

**F4 — `sub-sendmsg-CHAT` (`ublq9nSlrpz63xan`) fails the §0 S8 structural check.** The plan offers it
as a sendmsg target for the fork. It contains `respondio`, `httpRequest` and `postgres` nodes. Both
notice call sites use `zz-sub-sendmsg-STANDIN` (`lJ4IZEGwoTh6aay4`) instead: 3 nodes, zero banned
types, and it records `{guard:'sendmsg-standin', kind:'would_send'}` to `test:egress:{test_run_id}`,
which is what HT-1/HT-2's "count the notices" assertions need.

**F5 — `grep -Fo` is the wrong counter for a mutation guard, and the reference implementation uses it.**
`tests/offline/dym-probe-before-offer/mutate.sh` counts the search string with `grep -Fo … | wc -l`.
grep is line-based, so any anchor spanning a newline is treated as alternatives and the count becomes
"lines matching either half" — measured here as **8 for an anchor that occurs once**. It aborted a
valid mutant (visible), but the same mechanism can report exactly N for an anchor that does not occur
at all (invisible), which is §61's "green that cannot fail" *inside the guard built to prevent it*.
This suite's `mutate.sh` counts the literal in Python. **The reference implementation should be fixed
the same way** — it is not in this change's scope, and it is load-bearing for other suites.

**F6 — a crashing suite was being scored as a caught mutant.** Same class as §72. One mutant here
(the §63 wrong-object read) made the harness throw: zero `FAIL` lines, non-zero exit, and the
"did it go red?" test passed. `mutate.sh` now reports `CRASHED` as a distinct, battery-failing outcome,
and the harness gained a `noThrow()` assertion so that mutant produces 6 real comparisons instead.

**F7 — a §63 wrong-object read in this build, caught before it shipped.** `ht-classify` first read its
candidates from `$input.all()`. Its upstream is `ht-recheck-stamp`, a Redis `get` — and the Redis
node's `get` emits a **fresh** item, so `$input` there is `{ht_recheck_ms}` with no `contact_id` and no
`cutoff_ms`. The offline harness had been stubbing `$input` with the fan-out items, so the suite would
have gone green against a body that throws in production. Both were fixed and `FP-WRONGOBJ` now guards
it. Recorded because the general rule matters more than the instance: **only `push` / `set` / `delete`
are passthrough on the Redis node; `get` / `keys` / `pop` / `incr` / `llen` / `info` all discard the
upstream item.**

---

# Deviations from the plan (all recorded in the plan file too)

**D1 — `ht:active` is one string key per contact, not a ZSET.** `n8n-nodes-base.redis` (the only redis
node installed — 184 usages across all 111 workflows) supports only
`delete/get/incr/info/keys/llen/pop/publish/push/set`. There are **no** sorted-set operations, so
`ZADD`/`ZSCORE`/`ZRANGEBYSCORE`/`ZREM` are unavailable. `n8n-nodes-redis-extended.redisExtended` does
have them and appears in `search_nodes`, but it is used by **zero** workflows on this instance and I
could not confirm it is installed — building a production timer on an unverified community node is
not a trade worth making. Mapping used:

| plan | implemented |
|---|---|
| `ZADD ht:active <now> <contact>` | `SET ht:active:<contact> = <now>` |
| `ZSCORE ht:active <contact>` | `GET ht:active:<contact>` |
| `ZRANGEBYSCORE ht:active -inf <cutoff>` | `KEYS ht:active:*` (`getValues:true`) + expiry filter in `ht-sweep-census` |
| `ZREM ht:active <contact>` | `DELETE ht:active:<contact>` |

Every operation stays atomic and the semantics are unchanged. **Cost to flag before S4:** `KEYS` is
O(total keyspace) and would run every 30 s against the shared prod redis. At pilot scale that is
noise; the keyspace size is unknown to me (I did not probe redis) and should be checked before the
announce flip. If it is large, the fix is `SCAN` — which needs the extended node — or a longer cadence.

**D2 — `ht:pilot-contacts` is a comma-separated STRING, not a SET.** The Redis node's `set` writes a
single scalar (one `SADD` member) and offers no `SREM`, so a set could be read but never maintained by
the config form. A string is atomic to replace and trivially parsed. Empty/absent still means everyone.

**D3 — sweeper order is clear → log → FORGET → notify, not clear → notify → forget.** Two reasons:
(a) if the send fails, the stamp is already gone, so the next tick cannot re-notice the same contact —
a failed notice is much better than a notice storm; (b) it keeps every node between `ht-clear-flag` and
the send on a **passthrough** redis operation, so per-item `contact_id`/message attribution needs no
n8n paired-item lineage through a sub-workflow call (`$('ht-clear-flag').first()` would be item 0 for
every row of a multi-contact tick). HT-8's assertions are unaffected.

**A1 — the optional stamp re-read IS implemented** (plan §S2.5 lists it as "only if UAC shows it
matters"). One `redis get` (`ht-recheck-stamp`) plus one predicate in `ht-classify`. Reason: the
failure it prevents is customer-visible — a human replying while the tick is in flight would have
their intervention cleared and the contact told "our team seems to be away" mid-conversation. It adds
two outcomes (`skip-refreshed`, `skip-vanished`), both covered offline and both with their own mutant
(`FP-RACE`). **The UAC has no case for this branch** — HT should gain one, or the reviewer should note
it as offline-only coverage.

**D4 — the S3 form uses `n8nUserAuth`, not a basic-auth credential** (see S3 above).

**D5 — the HT-3 fixture's `source` field is edited, not captured.** `fixtures/trigger-api-437264483.json`
is a real envelope with `source` and `sender.source` changed, because no api-source execution exists
in retention (F3). The provenance and the word UNVERIFIED are recorded inside the fixture file.

**Not a deviation, but worth stating:** this MCP's `validate_workflow` takes **SDK code**, not a
workflow id (`{code: "…"}`), so there is no `validate_workflow <id>` to run against a built workflow on
this surface. `assert-built.py` C1–C8 is the substitute, and unlike a schema validation it also checks
containment, namespace, sub-targets, body freshness and graph acyclicity.

---

# Handover to the tester

1. `python3 assert-built.py` **first** (proves the bodies deployed are the bodies tested).
2. Activate the workflow(s) a case needs — sub-workflows and webhooks are uncallable while inactive —
   and **deactivate afterwards**. `ht-sweeper BUILD` has a live 30 s Schedule Trigger: prefer driving
   one tick through `ht-driver-webhook` and leaving the workflow inactive.
3. Seed only `test:ht:*`. Touching canonical `ht:*` is a hard fail; `assert-built.py` C2 proves no node
   can reach it, but a seeding script can.
4. S1 driver: `POST /webhook/19c9c2bf-8b33-434c-a4d5-30a22b3734b0`
   with `{"test_run_id":"HT-1-…","ht_case":"HT-1","envelope":{…a file from tests/offline/human-intervened-timeout/fixtures…}}`.
   `source` may be overridden at the top level for HT-3 without editing a fixture.
5. S2 driver: `POST /webhook/9478a398-de6d-4810-a742-b5d4d0fb2dd0`
   with `{"test_run_id":"HT-8-…","fixtures":{"437264483":"flag=false"}}`.
   Fixture tags: *(absent)* → flag `"true"` (the egress-producing default, on purpose) ·
   `flag=false` → HT-9 · `flag=null` · `noflag` (row absent, array present) · `nocf` (HT-FP4: must ERROR).
6. Assert per-node runData, never execution status (LESSONS §61a). The `_standin` block on each
   stand-in's output is the `would_write`/`would_send` record; `test:egress:{test_run_id}` carries the
   sweeper's flag write and both notice sends.

---


# Per-node sha manifest (post-build)


Every node param-hashed, not just Code bodies — LESSONS §71: a promote diff built from `nodes/*.js`
is blind to If conditions, executeWorkflow inputs, redis lists and trigger params, and shipping that
blind spot broke production. `param-sha256` = `sha256(json.dumps(parameters, sort_keys=True))`.
These are the values `assert-built.py` C4 and any future §64 "is the change still present" check
compare against.


## S1 respond-send-user HT-FORK — `itsbBtShEktWQFx6` — versionId `bd1f70c6-879c-4b91-b16a-0bbcedc72c1b` — 25 nodes

| node | type | param-sha256 (12) | jsCode-sha256 (12) |
|---|---|---|---|
| `Call 'sub-respond-save-message-redis'` | `n8n-nodes-base.executeWorkflow` | `8ed18ce88c46` | `—` |
| `Execute a SQL query` | `n8n-nodes-base.code` | `e6df39fb0874` | `884d3d96291b` |
| `If` | `n8n-nodes-base.if` | `0e89b92944f2` | `—` |
| `Respond.io Trigger` | `n8n-nodes-base.code` | `1d1d70686280` | `448d0c9f275c` |
| `Select rows from a table` | `n8n-nodes-base.code` | `89cd93fa6003` | `028ae4858c89` |
| `Update a Contact` | `n8n-nodes-base.code` | `3c8ad45ececa` | `0bc974ae8504` |
| `When Executed by Another Workflow` | `n8n-nodes-base.executeWorkflowTrigger` | `7c6cd326baf5` | `—` |
| `compile-current-state` | `n8n-nodes-base.code` | `7ecc25c706ef` | `4093dc6dd21a` |
| `conversation-sla-event-tracking-create` | `n8n-nodes-base.code` | `3c4f26b4b44a` | `59d3f6911068` |
| `conversation-sla-tracking-update` | `n8n-nodes-base.code` | `237142aa1488` | `bbb76cc80ec3` |
| `harness-envelope` | `n8n-nodes-base.code` | `6003a5d2889d` | `d99c814bd9ef` |
| `ht-act?` | `n8n-nodes-base.if` | `1a695018169c` | `—` |
| `ht-arm` | `n8n-nodes-base.code` | `7d024002740f` | `3353134adc1f` |
| `ht-cfg-enabled` | `n8n-nodes-base.redis` | `7dd3d6dfef08` | `—` |
| `ht-cfg-pilot` | `n8n-nodes-base.redis` | `e7e33d45ce90` | `—` |
| `ht-cfg-timeout` | `n8n-nodes-base.redis` | `ddbc2997bca7` | `—` |
| `ht-driver-webhook` | `n8n-nodes-base.webhook` | `34a39728cd88` | `—` |
| `ht-first?` | `n8n-nodes-base.if` | `5f1ca2ead3bf` | `—` |
| `ht-gate` | `n8n-nodes-base.code` | `41c0c32075d8` | `efd337ebf753` |
| `ht-inert` | `n8n-nodes-base.noOp` | `44136fa355b3` | `—` |
| `ht-intervene-notice` | `n8n-nodes-base.executeWorkflow` | `58bc7cf6738e` | `—` |
| `ht-prev-stamp` | `n8n-nodes-base.redis` | `d11d6e3fa202` | `—` |
| `ht-refresh-only` | `n8n-nodes-base.noOp` | `44136fa355b3` | `—` |
| `ht-stamp` | `n8n-nodes-base.redis` | `fefb22e0c98d` | `—` |
| `save-session-vars` | `n8n-nodes-base.code` | `024eb8fc0ed6` | `468ee3cd6d7f` |

## S2 ht-sweeper BUILD — `S0V5TFhPNYJ7d9Ra` — versionId `c38aaa81-5967-404a-8667-200e42461c45` — 25 nodes

| node | type | param-sha256 (12) | jsCode-sha256 (12) |
|---|---|---|---|
| `Schedule Trigger` | `n8n-nodes-base.scheduleTrigger` | `61a4e3a19393` | `—` |
| `ht-armed?` | `n8n-nodes-base.if` | `63e886abaa8a` | `—` |
| `ht-carry-clear` | `n8n-nodes-base.code` | `2e235edbb31b` | `8a43cf73617d` |
| `ht-carry-contact` | `n8n-nodes-base.code` | `9aaa09e50a77` | `76eec70b8f27` |
| `ht-classify` | `n8n-nodes-base.code` | `28266a6c98a6` | `22ad9adf131c` |
| `ht-clear-flag` | `n8n-nodes-base.code` | `955dc600cc43` | `18691c3aa32e` |
| `ht-driver-webhook` | `n8n-nodes-base.webhook` | `5cfb9c488da4` | `—` |
| `ht-egress-log` | `n8n-nodes-base.redis` | `38888f0ec422` | `—` |
| `ht-findcontact` | `n8n-nodes-base.code` | `377507f4cf60` | `0a3d091fc0b3` |
| `ht-flag-still-true?` | `n8n-nodes-base.if` | `8f11b8f6db40` | `—` |
| `ht-forget` | `n8n-nodes-base.redis` | `eb70d60cd68f` | `—` |
| `ht-forget-silent` | `n8n-nodes-base.redis` | `eb70d60cd68f` | `—` |
| `ht-recheck-stamp` | `n8n-nodes-base.redis` | `f1306dea4a18` | `—` |
| `ht-skip` | `n8n-nodes-base.noOp` | `44136fa355b3` | `—` |
| `ht-skip?` | `n8n-nodes-base.if` | `9886f2c9de93` | `—` |
| `ht-sweep-armed` | `n8n-nodes-base.code` | `1e70f9807cf2` | `c07ea42be6b1` |
| `ht-sweep-census` | `n8n-nodes-base.code` | `7403f1de593b` | `2a4741ccb7e5` |
| `ht-sweep-driver` | `n8n-nodes-base.code` | `567fa4352357` | `4e7ff8f885c4` |
| `ht-sweep-enabled` | `n8n-nodes-base.redis` | `7dd3d6dfef08` | `—` |
| `ht-sweep-fanout` | `n8n-nodes-base.code` | `1ec5b7e3facb` | `fc7011430caa` |
| `ht-sweep-idle` | `n8n-nodes-base.noOp` | `44136fa355b3` | `—` |
| `ht-sweep-keys` | `n8n-nodes-base.redis` | `421081e33ee8` | `—` |
| `ht-sweep-pilot` | `n8n-nodes-base.redis` | `e7e33d45ce90` | `—` |
| `ht-sweep-timeout` | `n8n-nodes-base.redis` | `ddbc2997bca7` | `—` |
| `ht-timeout-notice` | `n8n-nodes-base.executeWorkflow` | `b053e9a9aa78` | `—` |

## S3 ht-config-form BUILD — `tpEueReClq5OWUgv` — versionId `569af22d-feae-4f90-a515-28de4050794e` — 11 nodes

| node | type | param-sha256 (12) | jsCode-sha256 (12) |
|---|---|---|---|
| `Form Ending` | `n8n-nodes-base.form` | `dbbc9e1a9136` | `—` |
| `ht-config-apply` | `n8n-nodes-base.code` | `16d02392550b` | `307e3e074a83` |
| `ht-config-audit` | `n8n-nodes-base.redis` | `e8dcd4531e10` | `—` |
| `ht-config-echo` | `n8n-nodes-base.code` | `8ef4376c634c` | `eccafb959a8a` |
| `ht-config-form` | `n8n-nodes-base.formTrigger` | `f9c6e5f5c29b` | `—` |
| `ht-readback-enabled` | `n8n-nodes-base.redis` | `36786eafe81b` | `—` |
| `ht-readback-pilot` | `n8n-nodes-base.redis` | `ee66f9342d10` | `—` |
| `ht-readback-timeout` | `n8n-nodes-base.redis` | `24d71a555a5d` | `—` |
| `ht-write-enabled` | `n8n-nodes-base.redis` | `8ac49088529c` | `—` |
| `ht-write-pilot` | `n8n-nodes-base.redis` | `ab1d8e91ceca` | `—` |
| `ht-write-timeout` | `n8n-nodes-base.redis` | `33db93215d69` | `—` |

---

# S4 — what this build says about the promote (NOT an authorisation)

S4 is **not built and not approved**. The binding checklist is
`tests/reviews/human-intervened-timeout-review.md` §6. This section records only what the BUILD knows and
the reviewer's file cannot: the two nodes that exist because of the promote, and the params that must die
with it.

## 🔴 MUST NOT BE PROMOTED — `is_test` on BOTH notice call sites (LESSONS §48(a))

`ht-intervene-notice` (S1) **and** `ht-timeout-notice` (S2) both pass `is_test: '={{ true }}'`. Correct and
required here — it is what keeps `zz-sub-sendmsg-STANDIN` recording instead of sending.

The live sub `aoydkG1dbItXR5jXFEQsP`'s `test-guard` routes the TRUE branch to `test-guard-record`
(a redis push) and **STOPS**: it never reaches `Send a Message`. So carrying `is_test` to live means
**every intervene notice and every timeout notice is logged to redis and silently never delivered** — the
feature tests perfectly, does nothing, and errors nowhere. This is §48(a) in its documented form, and it is
the failure mode a post-promote happy-path smoke test cannot see.

**Both nodes: DELETE the `is_test` input. Do not set it `false`.** §48's rule is one leaf per node via
`setNodeParameter` — never block-copy `workflowInputs.value` from a fork. Same for `test_run_id`, which is
`null` on live and pure harness plumbing. And `workflowId.value` must become
`aoydkG1dbItXR5jXFEQsP`, not the stand-in `lJ4IZEGwoTh6aay4`.

## 🔴 MUST BE PROMOTED — the two carry nodes are NOT harness scaffolding

Both exist because a respond.io payload has a shape the naive expression does not match. Both are required
on live, and omitting either ships a silently dead feature:

| node | omitting it on live causes |
|---|---|
| `ht-carry-contact` | `ht-recheck-stamp` reads `$json.contact_id` off a contact that only has `id` → every recheck misses → `skip-vanished` forever → **flags never clear, no notice ever sent** (F-RECHECK) |
| `ht-carry-clear` | `ht-forget` deletes `ht:active:` and misses, and `ht-timeout-notice` fires with an **empty recipient and empty body** (reviewer R1) |

`fixtures/promote-real-shapes.json` is the evidence for both, captured from live executions 12146305 and
12166204. **Run `assert-built.py` (C9b) against the promote target after building it** — that pass is
exactly the instrument that would have caught R1, and it is proven RED against the graph that shipped
without `ht-carry-clear`.

## Also required on the real `ht-findcontact`

It becomes `executeWorkflow` → `sorento-sub-respond-findcontact-respond` (`D62_NHUOrugeULSFwfjEJ`) with
**`mode: each`** (per-contact). `alwaysOutputData` is NOT needed — `ht-carry-contact` pairs by identity, so
a zero-item not-found becomes a `forget-unknown` reap rather than a misalignment. Re-assert that sub's
`Create or Update a Contact` / `Send Template` nodes still have **zero inbound** (reviewer R4: its egress
containment is orphaning, not absence, and the sweeper becomes a caller every 30 s forever).

## Unmeasured, blocking per reviewer R6 — pre-ACTIVATION, not pre-flip

`DBSIZE` and the p99 latency of `KEYS ht:active:*` on the shared prod redis. `KEYS` is O(total keyspace) on
a single-threaded server, so the 30 s scan costs the same at pilot scale as at flip scale. I could not
measure it (no redis client; prod hosts must not be probed). If large: lengthen the cadence, or take the
`SCAN`/extended-node dependency.

## Recorded for S4, not built (rev5 cross-review, record-only)

**F1 — the hash-key alternative is the designated fallback if G0.4 measures badly.** Instead of one string
key per contact scanned with `KEYS ht:active:*`, keep every stamp as a FIELD of one redis hash
`ht:active`: the sweeper's read becomes a single `HGETALL` (n8n Redis `get`, `keyType: hash`) — O(fields
in the hash), independent of the total keyspace — replacing an O(keyspace) `KEYS` plus N GETs. The cost
that blocks it is removal: the native node has no `HDEL`, so `forget`/`forget-silent`/`forget-unknown`
would need `delete ht:active` + rewrite-survivors, which is non-atomic and loses every timer if the run
dies mid-way. That is why D1 chose string keys. **If the pre-activation `DBSIZE` / `KEYS` p99 (G0.4, R6) is
bad, this is the fallback to take** — and the reap paths are exactly what to re-review, since they are what
the hash makes harder rather than the read.

**Three serial config GETs on the S1 hot path.** `ht-cfg-enabled` → `ht-cfg-timeout` → `ht-cfg-pilot` run
on every human-agent message. Acceptable at current volume (5 executions in 95 minutes, measured). Future
consolidation: one JSON config key read once and parsed in `ht-gate`, which also collapses the three
`config-read-failure` legs into one. Not done now — it would change the S4 promote surface for a cost that
is not currently paid.

**Harness-internal simplifications** (module-scope `one()` helper, deriving fixtures at runtime,
`mutate.sh --only-c4`, parallel fetches in `assert-built.py`): skipped. All are ergonomics with no
correctness or safety effect, and each one edits a file whose bytes are byte-gated against three
deployed workflows — churn with a real re-verification cost and no user-visible benefit.

---

# S4 PROMOTE RECORD (2026-08-13, main session, user-gated)

## Live artifacts

| artifact | id | versionId (== activeVersionId) |
|---|---|---|
| `respond-send-user` (spine, 12→24 nodes: +12-node ht lane +1 edge) | `eG3AA-TWo17-E1-DlHLnH` | `9b779edd-3bdd-4b71-b89a-0d85f22b0caa` |
| `ht-sweeper` (NEW, schedule 30s, ACTIVE) | `UmmjvYRl0h2GXd19` | `11c55d58…` (creation) |
| `ht-config-form` (NEW, ACTIVE, n8nUserAuth) | `evLuDTO60DBlYkk0` | `69b0b256…` (creation) |
| `zz-HT-S4-util` (seed/measure/kill-switch lever, ACTIVE) | `QoRCkaXwTLX9rHRx` | — |

Form URL: `/form/276c3f11-…` is the BUILD (inactive). LIVE form: n8n UI → ht-config-form.
Util: `GET /webhook/ht-s4-util?op=measure|seed|enable|disable`.

## Gates cleared

- G0.4: prod redis db0 = **2,487 keys**; `KEYS ht:active:*` = **4 ms** (exec on file). Hash fallback not needed.
- G0.6: pre-promote baseline `c23ce991`, draft==active, zero-diff. 
- Byte-gate: draft & ACTIVE both == intended; ONE deviation — `ht-arm` banner-run 33→29 `─`
  (MCP transport, LESSONS §57 class), proven single-line + banner-stripped-identical before adoption.
  **Live ht-arm differs from the fork/tracked source by those 4 banner chars — expected in future diffs.**
- Collateral creds: 7 pre-existing intact; 5 lane redis bindings explicit (no auto-assign).
- G2 DO-NOT-PROMOTE list honoured: zero `test:` strings, zero stand-ins, zero harness nodes,
  save-message-redis untouched, Webhook lane untouched, `is_test`/`test_run_id` absent from both
  notice call-sites' inputs (bodies carry inert null passthrough per review).
- G3: ht-findcontact → real `D62…` `mode:each`; ht-clear-flag → real respondio (sorento-api);
  ht-timeout-notice → real sendmsg `aoydkG1…`; both carry nodes promoted; driver/egress-log/sweep-driver dropped.
- Disabled tick = idle lane only (5 nodes, no scan) — verified live, exec 12248008.
- Enabled tick = scan lane, census `scanned: 0` — verified live.

## Rollback

```
publish_workflow eG3AA-TWo17-E1-DlHLnH @ c23ce991-64d7-43dc-b8e8-bcd4c9c12de0   # spine
# ALSO repair the draft (a rollback of ACTIVE leaves the draft at 9b779edd — §D18 postscript)
GET /webhook/ht-s4-util?op=disable                                              # kill-switch
deactivate UmmjvYRl0h2GXd19                                                     # sweeper
deactivate evLuDTO60DBlYkk0                                                     # form
```

## Pending (user)

- UI confirm: respond-send-user shows Active / no trigger error.
- Pilot (a)–(d) per HT.md live-trigger proof, contact 437264483.
- Announce flip (separate gate): empty `ht:pilot-contacts` + stuck-contact list.
