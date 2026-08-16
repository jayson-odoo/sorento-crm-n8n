# Offline harness — `carried-certificate-dump` B1 (`attachment-subject-gate`)

Runs the **real `disallowed-entity-gate` body** (pre- and post-B1, pulled byte-exact from the clone)
against pinned `parser` / `resolve-entity` fixtures, with no n8n and no network. Coder-side; it does
**not** replace §CD — it has no customer boundary in it, so per LESSONS §63 rule (i) every
rendered-text assertion still has to be made on `save-session-vars.user_response` / the sendmsg
payload in the real run.

```bash
./assert-b1-present.sh  # 🔴 RUN FIRST, EVERY PASS — is B1 still on the clone? (§CD-0b)
node discriminator.js gate.after.js   # B1-present  signature (exit 0)
node discriminator.js gate.before.js  # B1-ABSENT   signature (exit 1)
node byte-identity.js   # §CD-4: before-vs-after on identical inputs, whole output object
node probe.js gate.after.js
./mutate.sh             # §CD-FP-1/2/3 + a negative control, under §0 S9
```

## 🔴 B1 was silently reverted once — check presence before believing any result

On 2026-08-07 a UI save from a stale editor tab reset `disallowed-entity-gate` to its pre-B1 body,
and it stayed that way for over a day. **Every behavioural check kept passing**, because B2′
evicts the carried certificate, so the dump cannot occur whether or not B1 is present — identical
customer-visible text in both states. Sound assertion, right object, **no power to discriminate**
(LESSONS §64). Hence the two scripts above: `assert-b1-present.sh` proves the code is *there*
(expected sha `a8938abe…`, pre-B1 `7626c83e…`), and `discriminator.js` keys on **execution shape**
— `Call 'sub-get-results'` absence — which B2′ does not affect. `discriminator.js` was proven RED
against the real B1-absent clone body before B1 was restored.

| file | what |
|---|---|
| `gate.before.js` | clone `disallowed-entity-gate` @ `3a196c44` (sha `7626c83e…`) |
| `gate.after.js` | clone `disallowed-entity-gate` @ `2d1627c8` (sha `a8938abe…`) |
| `cases.json` | 8 pinned fixtures (also consumed by `probe.js`) |
| `byte-identity.js` | asserts **exactly 1** of the 8 differs — plan §2.3 "every other domain byte-identical" |
| `probe.js` | asserts B1 fires / stays inert per fixture; prints the compared-population count |
| `mutate.sh` | §0 S9 compliant: occurrence count `N>0` **and** digest change, or it aborts without running |

## Fixtures, and why the last three exist

`CD-1` … `CD-4`, `CD-x` trace plan §2.2's table. **`FP1-D`/`FP2-D`/`FP3-D` were added after the first
draft of this harness went GREEN under all three §CD-FP mutations** — i.e. it was a §61 "green that
cannot fail". Each discriminator is the case that makes exactly one mutation go red:

| fixture | discriminates | why the original set couldn't |
|---|---|---|
| `FP1-D` `master_products`, brand resolves, product raw misses | FP-1 (`domain === 'product_attachment'` → `true`) | every other non-`product_attachment` fixture was already `gate_passed === false` before B1 runs, so `gate_passed &&` short-circuits |
| `FP2-D` one product resolves, a second product raw misses | FP-2 (drop `!_haveProduct`) | `CD-3` has an empty `unresolved_tokens`, so `_missedSubject` is false regardless |
| `FP3-D` unknown certificate number misses, no product hint | FP-3 (hint filter → all) | `CD-2` has an empty `unresolved_tokens`, same reason |

Current state: 8/8 pass on `gate.after.js`; `CD-1` alone fails on `gate.before.js` (the defect
reproduces); each mutation reddens exactly its own discriminator.
