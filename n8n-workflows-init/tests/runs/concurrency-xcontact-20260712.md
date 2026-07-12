# Concurrency dispatcher — cross-contact parallelism test (T4)

**Date:** 2026-07-12
**Target:** dev clone lane only (never live). Dispatcher `zz-dispatcher-test` `2D0cw2Y1aPW2LOlU` → spine clone `sorento-consume-main TEST` `txiPzSxy3Pclsz6v`.
**Fills gap #3** from the git-tracking review: prior tests (T1 FIFO / T2 single-flight / T3 error-release, all in `plans/concurrency-plan.md`) never exercised **two different contacts in parallel**. This does.

## Helper change (test scaffolding only)
`zz-seed-conc` `wrRISsj7445CCr8j` `clear-ready` node: `DELETE ready-contacts-test` was unconditional → seeding a 2nd contact wiped the 1st contact's ready-token. Gated it: key = `={{ (body.clear_ready === false) ? 'noop-clear-skip' : 'ready-contacts-test' }}`. Default (flag absent/true) = old behavior. `clear_ready:false` preserves the ready list so multiple contacts can be staged. Published.

## Setup
Two contacts, one message each, both tokens in `ready-contacts-test`:
- **A** = `437264483` (dev-test contact) — seeded fresh (`clear_ready` default true)
- **B** = `999000002` (deliberately non-existent id) — `clear_ready:false` to keep A's token

Pre-fire inspect: `A{qlen:1}`, `B{qlen:1}`, `readylen:2`, both `lockval:null`. ✓ (both tokens survived → conditional clear works)

## Fire
`curl POST /webhook/zz-dispatch-test` **×2 concurrently** (backgrounded, `wait`). Fire-hook responds immediately; spines run async.

## Result — PASS

| dispatcher exec | popped contact | call-spine | sub-exec | window (14:19:_) | outcome |
|---|---|---|---|---|---|
| `8353189` | `437264483` (A) | success out[0] | `8353190` | 16.78 → **25.74** (9.0s) | full spine success |
| `8353193` | `999000002` (B) | error out[1] | `8353194` | 17.09 → 17.53 (0.42s) | read-404, error branch |

Post-fire inspect: `A{qlen:0}`, `B{qlen:0}`, `readylen:0`, both `lockval:null`.

### Assertions
1. **No cross-contamination** — each fire popped a distinct contact; `call-spine` invoked with the matching id. ✓
2. **Parallel (overlap)** — B's whole chain (17.09–17.53) runs *inside* A's spine window (16.78–25.74). B acquired `lock:999000002` while A still held `lock:437264483`. Independent per-contact locks; different contacts do not serialize. ✓
3. **Both queues drained** — `qA 1→0`, `qB 1→0`. ✓
4. **Both locks released** — `del-lock` ran on A's success path (out[0]) and B's error path (out[1]); post `lockval:null` both. ✓ (also re-confirms T3 error-release, under concurrency)
5. **No rearm** — both `more-in-queue?` false (`qlen 0`); `readylen 0`. ✓
6. **Zero egress** — A = fail-closed clone (egress nodes orphaned, `is_test`); B errored on a CRM *read* (`"resource could not be found"`) before any send. `redaction.production:false`. ✓

### Limitation
B used a non-existent id → fast 404, not a *full-success* spine. The parallelism claim rests on A (full 9s success) overlapping a second contact; not on B completing happily. A second **valid** contact was deliberately avoided (would touch real CRM read data). Acceptable — overlap is proven by A's window alone.

## Not tested (accepted risk)
TTL-expiry-mid-run overlap (review risk #1). User accepted TTL=120s as fixed; the overlap failure mode is a known/accepted risk, not exercised here.
