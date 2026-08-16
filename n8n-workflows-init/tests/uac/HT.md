# §HT — human-intervened timeout (5-min inactivity → AI resumes)

> Plan: `plans/human-intervened-timeout-plan.md`. §0 applies to every case.
> Scope: `deterministic` (no LLM anywhere in this feature).
> All cases run against the S1 fork / S2 build copy with redis prefix `test:ht:` — a case that
> touches canonical `ht:*` keys is a §0 hard fail. Fixture envelopes MUST be captured from a real
> `respond-send-user` execution (LESSONS §64), edited minimally per case.

Common setup per case (unless stated): `test:ht:enabled=1`, `test:ht:timeout-sec=300`,
`test:ht:pilot-contacts="437264483"`, no `test:ht:active:*` keys, contact fixture = 437264483 with
`is_human_intervened` per case.

> **Key-shape amendment (build D1/D2, 2026-08-12):** the installed redis node has no ZSET ops, so
> `ht:active` is **one string key per contact** — `test:ht:active:<contact_id>` = ms epoch — and
> `ht:pilot-contacts` is a **comma-separated string**. Read every ZADD/ZSCORE/ZRANGEBYSCORE/ZREM
> in the cases below through the D1 mapping table in
> `tests/manifests/human-intervened-timeout/README.md`. Semantics unchanged.
> Drivers, fixture tags, and per-case entry points: the manifest's "Handover to the tester".

## Trigger side (S1 fork)

- **HT-1 first human message stamps + notices.** Inject agent-message envelope (source=User).
  Assert: `ZSCORE test:ht:active 437264483` set (score ≈ now); intervene notice in the egress
  log / CHAT sink exactly once, body contains "5 minutes" (rendered from timeout-sec, not
  hardcoded); existing `Update a Contact` lane still received its input (runData present).
- **HT-2 second message refreshes silently.** Pre-seed `test:ht:active` score=now−120000; inject
  again. Assert: score advanced to ≈now; **zero** new notice (egress log unchanged — assert the
  count, §61: print the compared population).
- **HT-3 source=api is ignored.** Envelope with `source:"api"` (AI/bot send). Assert: no stamp,
  no notice, `If[0]` lane not taken (per-node runData, never status).
- **HT-4 kill-switch off = inert.** `test:ht:enabled=0`. Assert: no ZADD, no notice; the existing
  flag/SLA lane unaffected.
- **HT-5 non-pilot contact = inert while allowlist non-empty.** Envelope contact 999999.
  Assert: no stamp, no notice.
- **HT-6 empty allowlist = everyone.** `test:ht:pilot-contacts` deleted; contact 999999.
  Assert: stamp + notice fire.
- **HT-7 re-intervention after timeout.** `test:ht:active` empty (post-sweep state), flag
  irrelevant; inject human message. Assert: treated as FIRST (notice fires) — proves the
  ZREM→re-ZADD lifecycle re-arms the notice.

## Sweeper (S2 build copy)

Seed `test:ht:active` with member 437264483, score chosen per case; contact fixture flag per case.

- **HT-8 expired + flag true → clear + notice + ZREM.** score = now−301000. Assert (in order,
  per-node runData): findcontact ran; `ht-clear-flag` stand-in logged
  `{would_write: is_human_intervened:false, blocked:true}`; timeout notice in egress log once,
  body = the locked wording; `ZSCORE` now nil.
- **HT-9 expired + flag false (manual close beat us) → silent ZREM.** score = now−301000,
  fixture flag=false. Assert: ZREM happened; **zero** sends, **zero** flag writes. This is the
  ghost-message gate.
- **HT-10 not expired → untouched.** score = now−200000. Assert: ZRANGEBYSCORE returned it not /
  per-item lane not taken; ZSET intact; zero sends.
- **HT-11 kill-switch off → whole tick inert BEFORE the scan.** (Rewritten rev5: the enabled
  gate now precedes the keyspace scan.) score = now−9999999, `test:ht:enabled=0`. Assert from
  runData by NODE PRESENCE, not status: `ht-armed?` took output 1 (disabled), `ht-sweep-idle`
  ran, and `ht-sweep-keys` / `ht-sweep-census` / `ht-findcontact` are **absent from runData**;
  no sends, stamp keys intact. (Old form asserted the census's `skip_reason:
  kill-switch-off` — that node no longer runs when disabled; asserting its absence is strictly
  stronger.)
- **HT-12 non-pilot member in ZSET → skipped while allowlist non-empty.** member 999999 expired.
  Assert: no findcontact for it, entry retained (so the flip can still process it).
- **HT-13 timeout-sec change honored without redeploy.** `test:ht:timeout-sec=60`, score =
  now−90000. Assert: treated as expired (proves runtime read, not baked constant).

- **HT-16 race guard — stamp refreshed mid-sweep → skip, no clear, no notice.** (Covers build
  addition A1.) Seed stamp expired (score = now−301000), fixture flag=true, but have the driver
  refresh the stamp to ≈now between census and classify (drive via the sweeper's re-check: seed
  the expired value, then before firing set `test:ht:active:437264483` fresh so `ht-recheck-stamp`
  reads a non-expired value while the census saw the expired one — if the drivers cannot interleave,
  assert the offline `FP-RACE` outcomes `skip-refreshed`/`skip-vanished` instead and record this
  case as offline-only). Assert: `ht-classify` emits `skip-refreshed`; **zero** flag writes, **zero**
  sends, stamp NOT deleted.
- **HT-17 race guard — stamp vanished mid-sweep → silent skip.** Same shape, delete the key before
  classify reads it. Assert `skip-vanished`; zero writes/sends/deletes attempted.

- **HT-18 deleted/unknown contact → reap stamp, never wedge.** (Covers rev3 R3 fix.) Seed an
  expired stamp for a contact the findcontact lookup returns zero items for (fixture tag per the
  manifest). Assert: `ht-carry-contact` emits `forget-unknown`; stamp deleted via
  `ht-forget-silent`; **zero** flag writes, **zero** sends; the execution completes WITHOUT error
  and other candidates in the same tick are still processed (seed a second, valid candidate in the
  same run and assert its lane ran) — the wedge gate.

## Config form (S3)

- **HT-14 form round-trip.** Submit timeout=7, kill=on, pilot="437264483". Assert redis:
  `test:ht:timeout-sec=420`, `test:ht:enabled=1`, SET membership exact. Completion screen echoes
  the three values.
- **HT-15 floor validation.** timeout=0 → rejected / clamped to 60; assert redis NOT written
  with 0.

## Fail-on-purpose (§0 S9 — count+digest guards mandatory, §72 zero-byte guard mandatory)

- **HT-FP1** mutate `ht-gate`: invert the allowlist predicate → HT-5 must go RED.
- **HT-FP2** mutate sweeper decision: drop the flag-still-true check → HT-9 must go RED.
- **HT-FP3** mutate `ht-gate`: hardcode `{X}` to "5" → HT-13's notice-wording sibling assert in
  HT-1 stays green but HT-13 path unaffected — instead assert HT-1 goes RED under
  `test:ht:timeout-sec=120` expecting "2 minutes". (The mutation must be proven applied.)
- **HT-FP4** empty-fixture vacuity check: run HT-9 with a fixture missing `custom_fields`
  entirely — the case must ERROR loudly, not pass (guards §64's absent-vs-empty class).

## Live-trigger proof (S4 pilot — real egress, user-gated, dev contact only)

Not a §-case; recorded in the run log. User sends real agent replies to 437264483 from the
respond.io inbox: (a) first reply → intervene notice arrives on WhatsApp; (b) reply again inside
5 min → no duplicate notice; (c) go silent 5 min → flag observed false + timeout notice arrives
≤ 5:30 after last reply; (d) reply again → notice re-fires. Canonical `ht:*` keys,
`ht:pilot-contacts={437264483}` throughout.
