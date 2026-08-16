# human-intervened-timeout — plan

> Status: PLAN APPROVED by user 2026-08-12 (grilled + lavish review — "design is good").
> Lavish review notes: user confirmed the intervene notice belongs in `respond-send-user` (it does — S1); no other changes requested.
> UAC family: `tests/uac/HT.md`
> Slices: S1 (trigger-side stamp+notice), S2 (sweeper), S3 (config form), S4 (promote + flip)

## Problem

When a human agent replies to a contact, `is_human_intervened` (a respond.io contact custom
field) goes `true` and every subsequent contact message is **dropped at ingress** — until a human
closes the conversation. Humans forget to close; contacts are stuck with no AI and no human,
forever, silently.

## Measured baseline (traced 2026-08-12, all versionId == activeVersionId)

| workflow | id | versionId (rollback) | role |
|---|---|---|---|
| `sorento-main-INJECT` | `sk0zN90Cas4Y6Y2w` | `e273ac0f-8882-4136-b0e8-b88d6b6ec53d` | ingress (carries 100%). `If1` gates on the flag; **false branch UNWIRED → message vanishes** (not queued, not logged) |
| `respond-send-user` | `eG3AA-TWo17-E1-DlHLnH` | `c23ce991-64d7-43dc-b8e8-bcd4c9c12de0` | **the flag writer.** Trigger `newOutgoingMessage` (eventSource user/api) → `If` (`$json.source == "User"`) → `Update a Contact` sets flag `true` + SLA tracking. Fires on EVERY human agent message |
| `respond-close-convo` | `-WkzJMQZHmsFQm6A2abLJ` | `4a2e963d-dd2a-443e-bbb1-68b43ee29744` | manual-close path: SLA resolve → unassign → flag `false` + `enquiry_type: null` → close message. **NOT in the REST first-page listing (pagination >100) — enumerate with paging** |
| `sorento-main` | `NwMOBEQ1NW7LVky5` | (inert primary) | same `If1` gate — must receive the same treatment ONLY if the primary path is ever revived. Out of scope now; recorded so it isn't forgotten |

Facts that shaped the design:

- The live spine's `is-human-intervened` true-branch (`update-human-intervened` → reset to false
  → continue to AI) is **dead code in practice**: messages with flag=true never pass INJECT `If1`,
  so they never reach the spine. Do not "fix" the spine; do not touch INJECT.
- Dropped messages are unrecoverable from n8n/redis (nothing logs them before the gate).
- Nothing in n8n writes the flag `false` except the manual-close workflow (and the unreachable
  spine node). There is no timeout anywhere.
- AI-sent messages arrive at the trigger with `source == "api"` → the `If` filters them out →
  the AI never marks its own sends as human intervention. (Verify once more from a real
  execution during S1 — this is the one assumption not yet proven from runData.)

## Design (locked with user — grill answers 2026-08-12)

User decisions, verbatim intent:

1. **Do NOT close the conversation on timeout** (they are migrating away from respond.io
   assignee toward CRM-side multi-assignee). Timeout = clear flag + notify contact, nothing else.
   `respond-close-convo` remains the manual path, untouched.
2. Reveal the timeout in the intervene notice.
3. Config UI = n8n native Form. Ship with the feature.
4. Pilot gate: kill-switch + contact allowlist (seeded with dev contact `437264483`).
5. Timer: set/reset on EVERY human agent message (any agent). After timeout clears the flag, the
   next human message is a NEW intervention (notice re-fires).
6. Sweeper cadence **30 s**. Timeout X = **5 min**, runtime-tunable.
7. Contacts stuck from before rollout: deliver the flag=true list to the user at flip; no bulk
   clear.
8. Timeout notice: no "send again" cue — short "team away, AI is back".

### Redis contract (all on the shared prod redis; new namespace, no existing key collides)

| key | type | meaning |
|---|---|---|
| `ht:active` | ZSET | member = respond.io contact id, score = ms epoch of last human agent message |
| `ht:timeout-sec` | string | X in seconds. Default `300`. Floor 60 (form-validated) |
| `ht:enabled` | string | `"1"` / `"0"` kill-switch. Absent ⇒ OFF (fail-closed) |
| `ht:pilot-contacts` | SET | non-empty ⇒ feature acts ONLY on members. Empty/absent ⇒ everyone (the announce flip) |

Test namespace: every UAC run uses `test:ht:*` (fork nodes parameterize the prefix). §53 applies:
never point a test run at the canonical keys.

### S1 — trigger-side stamp + first-notice (`respond-send-user`, LIVE at promote)

On the existing `If[0]` (source==User) branch, add after `Update a Contact`:

1. `ht-gate` (Code): read `ht:enabled`, `ht:pilot-contacts`, `ht:timeout-sec` (redis nodes feed
   it); contact = `$json.contact.id` from the trigger payload. Disabled or not-allowlisted →
   stop (NoOp).
2. `ht-prev-score` (redis ZSCORE `ht:active` member=contact) — read BEFORE stamping.
3. `ht-stamp` (redis ZADD `ht:active` score=now member=contact).
4. `ht-first?` (If: prev score absent) → `ht-intervene-notice` (executeWorkflow →
   `aoydkG1dbItXR5jXFEQsP` sendmsg): message
   `You're now chatting with our team. If the team is inactive for {X} minutes, our AI assistant will resume automatically.`
   ({X} = `ht:timeout-sec`/60, rendered by `ht-gate`).

Notes:
- Gate STAMP as well as notice by allowlist/kill-switch — otherwise pre-flip stamps would make
  the flip retroactively time-out non-pilot contacts.
- The existing `Update a Contact` / SLA lane is untouched. New lane is additive, downstream of it.
- Existing behavior when a stamped intervention is manually closed: flag goes false, `ht:active`
  entry remains → sweeper later finds flag=false → silent ZREM (see S2). No ghost notice by
  construction.

### S2 — sweeper (`ht-sweeper`, NEW workflow)

`scheduleTrigger` 30 s →
1. read `ht:enabled` — off → end.
2. read `ht:timeout-sec` → cutoff = now − X·1000.
3. `ZRANGEBYSCORE ht:active -inf {cutoff}` → items (usually 0).
4. per contact: allowlist re-check (defense in depth) →
   `Call 'sorento-sub-respond-findcontact-respond'` (`D62_NHUOrugeULSFwfjEJ`, read-only) →
   - flag **true** → `ht-clear-flag` (respondio UPDATE_CONTACT `is_human_intervened:false`) →
     `ht-timeout-notice` (sendmsg): `Our team seems to be away at the moment. Our AI assistant is back to assist you.`
     → `ZREM ht:active {contact}`.
   - flag **false** (human closed manually) → `ZREM` only, zero sends.
5. Race with a concurrent human reply: acceptable and self-healing — the human's next message
   re-fires S1 (flag true + fresh stamp). Optional tightening (re-read ZSCORE before clearing)
   only if UAC shows it matters.

Egress inventory (this workflow WILL have real egress once live): `ht-clear-flag`
(UPDATE_CONTACT write), `ht-timeout-notice` (WhatsApp send via sendmsg sub). Both sit behind
kill-switch + allowlist + the flag-still-true check. LESSONS §47: MCP auto-binds `sorento-api` on
creation — the build fork therefore uses **name-preserving Code stand-ins** for both nodes (§0 S8
discipline) until promote assembles the real ones.

### S3 — config form (`ht-config-form`, NEW workflow)

n8n native `formTrigger` (basic-auth credential — MUST be user-created in UI, MCP cannot create
creds, LESSONS §2), fields:
- timeout minutes (number, min 1; stored ×60 into `ht:timeout-sec`)
- kill-switch (dropdown on/off → `ht:enabled`)
- pilot contact ids (comma-separated → replaces `ht:pilot-contacts`; empty = everyone)

Completion screen echoes the values just written (the form is the UI the user asked for; a
read-back path keeps it honest). Native form avoids the LESSONS §43 CSP dead end.

### S4 — promote order + flip

1. Seed redis: `ht:enabled=0`, `ht:timeout-sec=300`, `ht:pilot-contacts={437264483}`.
2. Publish `ht-sweeper` + `ht-config-form` (NEW workflows; inert — kill-switch OFF).
3. **LIVE promote** of `respond-send-user` (user-gated): LIVE + own hunks by node NAME, byte-gate
   per node, §71 full-param-hash sweep (the diff includes redis + If + executeWorkflow nodes, not
   just Code). Trigger workflow ⇒ expect possible 409-with-persisted-write (LESSONS §60) — judge
   by state; user confirms Active in UI.
4. Set `ht:enabled=1`. Pilot: user sends real agent replies to 437264483; verify notice, refresh,
   timeout, re-intervention on the REAL trigger.
5. Announce flip (user-gated): empty `ht:pilot-contacts`, deliver the stuck-contact list
   (flag=true snapshot via a zz- read-only helper hitting the respond.io contact list API), user
   announces to staff.

Rollback: `publish_workflow` `respond-send-user` @ `c23ce991-…`; `ht:enabled=0`; deactivate
sweeper. Record post-build shas in `tests/manifests/human-intervened-timeout/README.md`.

## Build targets (S1/S2 testing — zero egress)

- **S1 fork**: UI-Duplicate `respond-send-user` → fork. **DELETE the `Respond.io Trigger` in the
  fork immediately** (§52 — a duplicated respondioTrigger subscribes the shared credential to the
  REAL event stream even while inactive). Drive via an executeWorkflowTrigger/webhook wrapper
  with a trigger-shaped envelope **captured from a real `respond-send-user` execution** (§64 — no
  hand-built fixtures). Fork's sendmsg calls → `ublq9nSlrpz63xan` (`sub-sendmsg-CHAT`) or the S8
  standins; fork's `Update a Contact` → name-preserving Code stand-in; redis prefix `test:ht:`.
- **S2 build copy**: build `ht-sweeper` with stand-ins first; swap in real nodes only at S4 step 2
  with kill-switch OFF, and assert the §0 S8 structural check on whatever variant a UAC case runs.
- Offline probes in `tests/offline/human-intervened-timeout/`: the `ht-gate` body + the sweeper's
  decision Code against fixtures derived from real payloads; `mutate.sh` with §0 S9 count+digest
  guards and §72 zero-byte-mutation guard.

## BUILD LOG — S1/S2/S3 built 2026-08-12 (coder seat)

Artifacts (all NEW, all `active:false`; nothing live was written):

| slice | workflow | id | versionId |
|---|---|---|---|
| S1 | `respond-send-user HT-FORK` | `itsbBtShEktWQFx6` | `bd1f70c6-879c-4b91-b16a-0bbcedc72c1b` (rev5) |
| S2 | `ht-sweeper BUILD` | `S0V5TFhPNYJ7d9Ra` | `c38aaa81-5967-404a-8667-200e42461c45` (rev5) |
| S3 | `ht-config-form BUILD` | `tpEueReClq5OWUgv` | `569af22d-feae-4f90-a515-28de4050794e` (rev5) |

Full node diff, per-node sha manifest, rollback commands and findings:
`tests/manifests/human-intervened-timeout/README.md`.
Offline probe: `tests/offline/human-intervened-timeout/` (133 assertions, 23/23 mutants caught,
`assert-built.py` C1–C8 with a 7/7 self-test).

### rev5 — cross-review batch 2026-08-12 (six fixes, all three workflows)

Details + shas: `tests/manifests/human-intervened-timeout/README.md` § rev5.

1. **FAIL-OPEN ALLOWLIST (the serious one).** `readNode` collapsed "read failed" and "value absent" into
   `undefined`, and `parsePilot(undefined)` is `[]` = EVERYONE — so a broken pilot leg with `enabled="1"`
   made the **pilot phase act on every real contact** (measured: contact 999999, `should_act: true`). A
   failed read now yields `ht_skip_reason: 'config-read-failure'` ahead of everything else, in both
   `ht-gate` and `ht-sweep-census`. **The asymmetry is preserved and asserted: an absent/empty VALUE still
   means everyone — that is the announce flip.**
2. **STRANGER-ID WEDGE.** The `!wanted.has(id)` throw refused the whole tick and stamps survive an error,
   so one mis-attributed lookup (realistically a **respond.io contact merge**) wedged the sweeper
   instance-wide forever — the R3 outage shape on the adjacent branch. A stranger is now dropped and
   recorded; its candidate reaps via `forget-unknown` with zero egress, which is also the correct
   semantics for a merged-away contact.
3. **MINUTES INTEGRITY.** Fractional minutes (1.5 → 90 s) let the notice misstate the timeout by ~50%.
   Minutes round to whole numbers, so `ht:timeout-sec` is always a multiple of 60 (asserted as an
   invariant). The 60 s floor clamp is now unreachable through this path and stays as defence in depth.
4. **SILENT KILL-SWITCH INVERSION.** An unrecognised non-empty kill value wrote OFF with an EMPTY
   `notes[]`, so a dropdown relabel silently disabled the feature with a clean echo. Now a loud note.
5. **EPOCH-0 CONSISTENCY.** The census treated `<=0` as unparseable-forever (never reaped, flag
   immortalised) while `ht-arm` treats 0 as valid. `<=0` is now expired-reapable; genuinely non-numeric is
   still refused. `ht-classify` reports `recheck_ms: null` for an absent re-read instead of `0`.
   **Residual recorded:** a non-numeric stamp is still never reaped (the recheck reads the same garbage).
6. **DARK-SHIP COST.** The kill-switch was consulted only *inside* the census, i.e. AFTER `ht-sweep-keys`
   — so a dark-shipped feature paid an O(keyspace) `KEYS` + N GETs on the shared prod redis every 30 s for
   nothing. New `ht-sweep-armed` → `ht-armed?` → `ht-sweep-idle` gates the scan; the census keeps its own
   check as defence in depth.

**⚠️ UAC IMPACT — HT-11 must be rewritten.** With the kill-switch off, `ht-sweep-keys` and
`ht-sweep-census` no longer run at all, so HT-11 can no longer assert "the census shows kill-switch-off".
Assert instead: `ht-armed?` took output 1, `ht-sweep-idle` ran, and `ht-sweep-keys` / `ht-sweep-census` /
`ht-findcontact` are ABSENT from runData — strictly stronger (nothing was even read) and keyed on node
presence, not status.

**⚠️ S4 ADDITION:** `ht-sweep-armed`, `ht-armed?` and `ht-sweep-idle` must be promoted with the sweeper —
they are the reason a dark-shipped feature is free rather than expensive.

**Recorded, not built (see the manifest's record-only section):** the **hash-key alternative** (`HGETALL`
on one `ht:active` hash instead of `KEYS` + N GETs) is the **designated fallback if the pre-activation
G0.4 keyspace measurement is bad** — its cost is that the native Redis node has no `HDEL`, so the three
reap paths become non-atomic; consolidating the three S1 config GETs into one JSON key; and four
harness-internal ergonomics items (skipped — churn against byte-gated files with no correctness effect).

### rev4 — fixture-layer tags 2026-08-12 (tester PASS + non-blocking follow-up)

S2 only (`e17c61bd-2da7-4c7c-8d94-b93b36fcd399`), one node: `ht-findcontact`.

Two halves of one defect, both **below** the code in the layer that chooses which fixture a case gets:

1. **No tag produced a zero-item lookup**, so HT-18 — the `forget-unknown` gate, i.e. the path that used
   to WEDGE the sweeper permanently (R3) — was **not live-drivable**. `"notfound"` now emits zero items
   for that contact, mirroring the real sub's hard miss exactly.
2. **An unknown tag fell through to the default**, which is `flag=true` ⇒ **clear-and-notify** — the one
   outcome authorising a flag write and a send. The tester's invented tag ran it silently
   (exec 12179301). Unknown tags now **THROW**, naming the known set; an ABSENT tag still defaults to the
   egress-producing shape on purpose (a harness must not pass by handing itself the inert fixture).
   "Absent" is a decision, "unrecognised" is a mistake, and they must not share a branch — LESSONS §61
   one level below the code, where every gate this build has (211 assertions, 36 mutants, C1–C9b) sits
   above it and would have stayed green.

Coverage: 17 new assertions over the tag map (which had none) + 3 mutants. `FP-TAGKNOWN` CRASHED first
(a bare call, so the mutant killed the suite instead of asserting — §72/F6) and was wrapped. The rev3
resync gate refused to run `mutate.sh` at all until the change was deployed.

### rev3 — reviewer R1/R2/R3/R8 fixed 2026-08-12 (APPROVE for S1/S2/S3, two blocking S4 gates landed)

Review: `tests/reviews/human-intervened-timeout-review.md`. Details + shas:
`tests/manifests/human-intervened-timeout/README.md` § rev3.

**R1 — F-RECHECK's class recurred one node DOWNSTREAM, on the promote path.** `ht-forget` and
`ht-timeout-notice` read `$json.contact_id` / `$json.ht_timeout_notice` from `ht-clear-flag`, which at S4
becomes the real respondio UPDATE_CONTACT whose measured output (live exec 12146305) is
`{"contactId": …}` ONLY. Unfixed on live: the stamp delete misses **and the timeout notice fires with an
empty recipient and an empty body.** Fixed by a new node **`ht-carry-clear`**, matching on the id the
egress node itself reports and re-checking that the row was authorised before a send.

**R2 + R3 were ONE defect.** The mis-attribution guard demanded a contradiction rather than an
identification, so an id-less payload reached `clear-and-notify`. And a hard not-found (zero items from the
findcontact sub) made the old index-aligned pairing **THROW** — so one deleted contact **wedged the sweeper
permanently**, every tick erroring forever because the stamp survives the error. The literal R2 fix (throw
on id-less) had the same shape. `ht-carry-contact` now pairs **by identity** with three outcomes:
paired · **`forget-unknown`** (reap the stamp, zero flag write, zero notice) · THROW only for a contact
nobody asked for. R3's reaper falls out for free and routes to the existing `ht-forget-silent`.
⚠️ Deviation from the reviewer's literal "must throw": it refuses via a non-egress outcome instead, which
meets the safety requirement without shipping the permanent wedge. Recorded, not substituted silently.

**R8** — `ht-gate` pluralises; the harness previously PINNED "1 minutes" as intended (§73).

**New gate: `assert-built.py` C9b (promote-shape pass).** R1's real lesson is that C9 passed and would have
kept passing, because it resolves against the stand-in's fields and a stand-in that re-forwards a field is
correct on the build and absent on live (§65). C9b resolves against each converted node's **real recorded
output** (`fixtures/promote-real-shapes.json`, captured from execs 12146305 / 12166204). Shown RED on the
shipped rev2 graph, and `--self-test` additionally proves **plain C9 PASSES the same graph C9b fails** — so
"C9 could not have caught this" is measured, not argued.

**⚠️ S4 ADDITIONS TO THIS PLAN'S §S4:**
- **`ht-carry-contact` AND `ht-carry-clear` must both be promoted.** Neither is harness scaffolding;
  omitting either ships a silently dead feature.
- **`is_test` must be DELETED (not set false) from both notice call sites.** The live sendmsg sub's
  `test-guard` TRUE branch logs and STOPS, so carrying it means every notice is logged and never
  delivered — §48(a), invisible to a happy-path smoke test.
- **`DBSIZE` / `KEYS ht:active:*` p99 is a PRE-ACTIVATION measurement, not pre-flip** (`KEYS` is
  O(total keyspace) on a single-threaded server, so the cost is independent of pilot size). **Unmeasured
  by me** — no redis client, and prod hosts must not be probed.

### rev2 — F-RECHECK fixed 2026-08-12 (tester REQUEST-CHANGES → fixed)

`ht-recheck-stamp`'s key read `$json.contact_id` while its upstream `ht-findcontact` emits a respond.io
contact carrying `id` and never `contact_id`. Every recheck missed, `ht-classify` always answered
`skip-vanished`, and **clear-and-notify / forget-silent were structurally unreachable — flags never
cleared and no timeout notice was ever sent.** Failed safe (§0 held throughout); the feature was inert.

Fix: a new node **`ht-carry-contact`** between `ht-findcontact` and `ht-recheck-stamp` re-attaches the
CANDIDATE's `contact_id` and owns the mis-attribution refusal (moved out of `ht-classify`, deliberately
upstream of the first redis-key derivation). The key expression itself is unchanged.

**⚠️ S4 MUST PROMOTE `ht-carry-contact`.** This is not harness scaffolding: on live, `ht-findcontact`
becomes the real `executeWorkflow` call to `sorento-sub-respond-findcontact-respond`, which returns the
same shape — `id`, no `contact_id`. Promoting the sweeper without this node ships the identical dead
feature. The one-leaf alternative (`{{ $json.id }}`) was rejected: it keys the redis DELETE on the id the
lookup *returned* rather than the candidate we decided to expire, so a mis-attributed lookup would delete
another contact's stamp before any guard ran.

New gate: **`assert-built.py` C9** resolves every `$json.<field>` / `$('N')…json.<field>` reference in the
DEPLOYED parameters against the field set its source actually emits (derived by executing the bodies, not
from a hand-written registry), and forbids `.first()` inside the per-item fan-out region. C1–C8 and the
whole offline suite had passed, correctly, while the feature was dead — C9 is the missing instrument, and
`--self-test` proves it red against a faithful reconstruction of the pre-fix graph.

Full write-up, shas and the residual-key cleanup procedure:
`tests/manifests/human-intervened-timeout/README.md` § rev2.

### ⚠️ DEVIATIONS from this plan, as built

**D1 — the redis contract is NOT a ZSET.** `n8n-nodes-base.redis` — the only redis node installed on
this instance (184 usages across all 111 workflows) — supports only
`delete/get/incr/info/keys/llen/pop/publish/push/set`. **There are no sorted-set operations**, so
§"Redis contract"'s `ZADD`/`ZSCORE`/`ZRANGEBYSCORE`/`ZREM` cannot be built.
`n8n-nodes-redis-extended.redisExtended` does expose them and appears in `search_nodes`, but it is used
by **zero** workflows here and its installation could not be confirmed — not a dependency worth taking
for a production timer. Implemented as one string key per contact:

| plan | as built |
|---|---|
| `ZADD ht:active <now> <contact>` | `SET ht:active:<contact> = <now ms>` |
| `ZSCORE ht:active <contact>` | `GET ht:active:<contact>` |
| `ZRANGEBYSCORE ht:active -inf <cutoff>` | `KEYS ht:active:*` (`getValues:true`) + expiry filter in `ht-sweep-census` |
| `ZREM ht:active <contact>` | `DELETE ht:active:<contact>` |

Semantics unchanged, every op still atomic. **Open cost for S4:** `KEYS` is O(total keyspace) and would
run every 30 s against the shared prod redis. Negligible at pilot scale; the keyspace size is unknown
(redis was not probed) and must be checked **before the announce flip**. If large, use `SCAN` (needs
the extended node) or lengthen the cadence.

**D2 — `ht:pilot-contacts` is a comma-separated STRING, not a SET.** The Redis node's `set` writes a
single scalar (one `SADD` member) and there is no `SREM`, so a SET could be read but never maintained by
the config form. Empty/absent still means everyone.

**D3 — sweeper order is clear → log → FORGET → notify** (§S2 step 4 says clear → notice → ZREM).
(a) If the send fails the stamp is already gone, so the next tick cannot re-notice — a lost notice beats
a notice storm. (b) It keeps every node between the flag write and the send on a *passthrough* redis op,
so per-item attribution needs no n8n paired-item lineage through a sub-workflow call.

**A1 — ADDITION: the optional stamp re-read (§S2 step 5) IS implemented.** One `redis get`
(`ht-recheck-stamp`) + one predicate in `ht-classify`, adding outcomes `skip-refreshed` and
`skip-vanished`. Reason: without it, a human replying while a tick is in flight has their intervention
cleared and the contact is told "our team seems to be away" mid-conversation — customer-visible, and the
guard is one node. **`tests/uac/HT.md` has no case for this branch**; coverage is offline-only
(`FP-RACE`). Add an HT case or accept it as offline-only.

**D4 — the S3 form uses `authentication: n8nUserAuth`, not a basic-auth credential.** MCP cannot create
credentials (LESSONS §2) and no `httpBasicAuth` credential exists to bind. n8n login is required to open
the form, which is no weaker; if basic auth is still wanted the user must create the credential first.

**D5 — the HT-3 (`source: api`) fixture is EDITED, not captured** — see F3.

**Sendmsg target** — the plan offers `sub-sendmsg-CHAT` (`ublq9nSlrpz63xan`) or an S8 stand-in. CHAT
**fails** the §0 S8 structural check (it contains `respondio`, `httpRequest` and `postgres` nodes), so
both notice call sites use `zz-sub-sendmsg-STANDIN` (`lJ4IZEGwoTh6aay4`).

### Findings that change this plan's premises

**F1 — the "Measured baseline" for `respond-send-user` is incomplete, and the gap is all egress.** It
describes 4 nodes; live has **12**. Undocumented egress: `save-session-vars` (**PUT
conversation-variables on the prod CRM**, fed by a `compile-current-state` that also exists here), two
prod-CRM `postgres` nodes, and a **second ingress path** (`Webhook` → `webhook-to-respond-convert` →
`Execute a SQL query`) that reaches the SLA lane **bypassing the `If` gate entirely**. A fork built from
this plan's description alone would have left a prod CRM write wired. Anyone planning S4 must diff
against all 12 nodes.

**F3 — the `source == "api"` assumption is still UNVERIFIED, but the evidence is better than assumed.**
All 5 retained `respond-send-user` executions are `source: "User"`, so there is no api payload to
capture. The absence is the signal: 03:14–06:24Z the sendmsg sub logged **100** executions (≈100 AI
sends) while `respond-send-user`'s newest execution was **04:23Z**, 5 total. AI/api sends appear not to
reach this trigger *at all*, rather than reaching it and being filtered by the `If`. Safer than assumed,
but inferred from absence — so `ht-gate` re-checks `source === 'User'` itself and HT-3 asserts the gate
rather than the branch counts.

**F7 — Redis node passthrough rule, needed by anyone extending this feature.** Only `push` / `set` /
`delete` pass the upstream item through. `get` / `keys` / `pop` / `incr` / `llen` / `info` emit a
**fresh** item and DISCARD it. This is why every Code node in this feature reads its inputs via
`$('<node>')` — an earlier `ht-classify` draft read `$input`, which would have thrown in production while
the offline suite went green. **F-RECHECK is the same rule biting on a PARAMETER instead of a body**, and
it shipped: `$json.contact_id` in a redis key expression, resolved against the wrong upstream. A
body-level rule was not enough; the parameter-level gate (C9) is.

## Step-8 record: /codex-review NOT COMPLETED (2026-08-12)

Three `codex exec --sandbox read-only` attempts (full suite → nodes+builder → nodes only) each ran
past a 9–10 min window with zero output and were killed. The cross-model (OpenAI) second opinion is
therefore MISSING from this change's evidence chain — recorded per the /feature rule, not silently
dropped. Partial mitigation: the /code-review pass ran 7 finder angles (3 completed before session
caps), whose findings were all fixed in rev5 and re-verified. If codex becomes runnable before S4,
run it over `tests/offline/human-intervened-timeout/nodes/*.js` and treat findings as candidates
against the rev5 shas.

## Test-ops note (rev5 FINAL pass, 2026-08-12)

Activating `ht-sweeper BUILD` to drive its test webhook also arms its live 30 s Schedule Trigger —
one activation window produced an unattributed `mode:'trigger'` execution (12184520) that ran the
full guarded chain (§0 held; all writes stand-ins). For future passes: either keep activation
windows short and expect stray trigger executions, or `setNodeDisabled` the Schedule Trigger on
the BUILD copy for the pass and re-enable after. At S4 the promoted sweeper NEEDS the trigger —
do not carry a disabled trigger into the promote.

## Out of scope (recorded, not silently dropped)

- Replaying messages dropped during the intervened window (unrecoverable pre-gate; user accepted
  notice-without-resend-cue).
- `sorento-main` primary-path parity (inert; do at failover-return time).
- Escalation-assignment-without-reply timer (SLA checker's domain — user: no).
- CRM-side assignee migration (peer project; this feature deliberately avoids deepening
  respond.io assignment coupling — no close, no unassign).
- Wiring INJECT `If1`'s false branch (logging dropped messages) — worth a backlog ticket, not
  this change.
