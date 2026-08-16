# Codex cross-model review — `spec-raw-text-migration` rev 4

Run 2026-08-16 by the main session (`/codex-review`), read-only over the verified export at clone
`98e93d6e`. Scope: `nodes/compile-current-state.js` (ccs) + `nodes/build-suggest-offer.js` (bso).
The Anthropic reviewer seat is out on a weekly limit until 2026-08-18 17:00 KL, so this is the
only independent review this diff has had — it does NOT replace `sorento-reviewer`, whose rev-4
pass is still owed.

Codex findings are CANDIDATES. Every line below was verified against the actual body before a
verdict was written.

**Transport note for whoever runs this next:** `codex exec "<prompt>"` HUNG on stdin ("Reading
additional input from stdin...") and produced nothing for 600 s, twice. Fix: redirect
`< /dev/null`. Worth adding to the skill.

| # | codex claim | verdict | evidence |
|---|---|---|---|
| C1 | Q1 `_valueFor` takes the value from the first row that HAS the key, not one that EARNED it | ✅ **CONFIRMED — already open as plan §6** | `ccs:349-355`: `for (const m of _specRows) { … hasOwnProperty(_sp,_k) → return _sp[_k] }`, no reference to that row's `matched_specs` |
| C2 | Q2 three customer strings duplicated across ccs and bso (`"${token}" — did you mean:`, the numbered line, the ` - has/no ${noun}` suffix) | ✅ duplication real, ❌ **proposed fix REJECTED** | n8n Code nodes are standalone — there is no import, so "centralize the renderer" means inventing a shared sub or injected helper: machinery, against the standing design rule. The real guard already exists at runtime: SA-4-B asserts `ccs.user_response === bso.suggest_response`, which fails the moment the copies diverge |
| C3 | Q3 `res.resolved !== true` treats missing/null as unresolved → miss rendering on non-authoritative data | ❌ **REJECTED — the proposed fix would REGRESS a shipped fix** | `resolved:false` ≠ unanswered is a known landmine; that is exactly why the ccs filter refines the coarse flag with OUTCOME checks (`_tokenWasAnswered`, `_tokenReachedSpecSearch`, `_gateResolvedTokens`, exact-match). "Require an explicit unresolved signal" would key on the mechanism again |
| **C3b** | *(not codex's finding — surfaced while verifying C3)* | 🔴 **NEW, HIGHEST-VALUE ITEM** | see below |
| C4 | Q3 `_isDerivedQueryToken('')` returns false, leaving the miss branch open for an empty token | ⚠️ **UNPROVEN — do not fix speculatively** | Mechanically true (`ccs:823`, `bso:209`). No evidence the CRM ever emits a resolution with an empty token; adding a guard for an unwitnessed input is machinery. Cheap to settle: if a real envelope ever shows one, fix then |
| C5 | Q4 bso's single-token D1 recomputes `picks` and guards `if (picks.length)` though `_survivors` already proved it | ✅ **CONFIRMED — real dead guard** | `bso:284-286` builds `_survivors` with `.filter(s => s.picks.length)`; `bso:290` sets `d1` only when `_survivors.length === 1`; `bso:352-354` recomputes the identical expression and guards it. That guard cannot be false — a check that cannot fail, in production code. Fix: carry `_survivors[0].picks`, delete the recompute and the guard |

## 🔴 C3b — the two emitters no longer share a miss-suppression rule

Verifying C3 exposed something codex framed wrongly but pointed at. The miss filter is duplicated
in both emitters with **different predicates**:

- `ccs:830-834` — five conjuncts, including `!_tokenReachedSpecSearch(res.token)` and
  `!_tokenWasAnswered(res)`.
- `bso:215-218` — three conjuncts. **`_tokenWasAnswered` and `_tokenReachedSpecSearch` are not
  defined anywhere in bso** (grep: zero hits).

Those two conjuncts are the outcome-keyed N-3 suppression — the fix that stopped the partial-miss
block offering the answer's own rows back to the customer. On any turn whose reply is rendered
through bso, that protection is simply absent, so the older defect can resurface there.

Exactly the F1 family: one behaviour, two emitters, and the fix applied to the one we were looking
at. F1 taught it about the dym label; this is the same split one predicate deeper.

**Status: NOT verified reachable.** Proving it needs a clone run on a partial-success turn routed
through bso, and the tester seat is on the same weekly limit. Do NOT patch it blind — bso's path
may make the answered-token case unreachable, in which case adding the conjuncts is machinery.
**Rev 5 opens by measuring reachability, then either fixes or documents why it cannot happen.**

## Rev 5 queue (when the seats return, 2026-08-18 17:00 KL)

1. **C3b** — measure first: does a partial-success turn render through bso? Then fix or document.
2. **C1 / plan §6** — `_valueFor` reads the value from a row whose own `matched_specs` holds the
   key. RED from exec 12607257's envelope (`CKS12050` brand CABANA matched only `bowl_count`,
   while `SRTKS4040-O/F` earned `brand`), mutant restoring first-row-with-key.
3. **C5** — delete the dead recompute and guard in bso's single-token D1.

Not queued: C2 (guarded by SA-4-B's cross-check), C3 (rejected), C4 (unwitnessed).
