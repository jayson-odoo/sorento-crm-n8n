# Offline harness — `immortal-hint-class` (C1 · C2 · C3 · M2)

Runs the **real node bodies**, pulled byte-exact via REST, against pinned fixtures. No n8n, no
network. Coder-side.

```bash
node ih-probe.js oe.before.js   # the defect reproduces:   RED 7/16
node ih-probe.js oe.rev1-aab47959.js   # F3 discriminator: RED 1/16, IH-3-CTRL only
node ih-probe.js                # post-fix:                GREEN 16/16
./ih-mutate.sh                  # §0 S9 fail-on-purpose, C1/C2/M2 — 8/8 as declared
node c3-probe.js                # C3:                      ALL PASS 69/69
./c3-mutate.sh                  # §0 S9 fail-on-purpose, C3 — 7/7 as declared

# composition with B2′ — every §CD fixture must still pass against the new body
node ../carried-certificate-dump/oe-probe.js oe.after.js     # GREEN 11/11
```

| file | what |
|---|---|
| `oe.before.js` | parser fork `output_exchange` @ `95193323` (B2′, M2 defect present) |
| `oe.rev1-aab47959.js` | fork `output_exchange` @ `aab47959` (rev 1, F3 defect present) — the **F3 discriminator baseline** |
| `oe.after.js`  | parser fork `output_exchange` @ `184882c1` — the bytes actually PUT, sha `536f8fb67d3a` |
| `ih-cases.js` / `ih-probe.js` / `ih-mutate.sh` | C1 / C2 / M2 |
| `c3.before/` `c3.after/` | the five clone bodies, `5fdd12df` → `544138ca` |
| `c3-probe.js` / `c3-mutate.sh` | C3 |
| `c3-patch.py` | applies the C3 hunks to a source dir; every hunk is exact-count-asserted |

The C1/C2/M2 hunks live in `../carried-certificate-dump/oe-patch.py` (extended, not forked), so the
**promote target is generated as LIVE + hunks** and never copied from the fork (LESSONS §57).

## 🔴 Where this harness is BLIND — read before reading a green

- **No customer boundary anywhere.** LESSONS §63i is NOT satisfied by these suites. Every rendered
  claim still has to be asserted on `save-session-vars.user_response` / the sendmsg payload in a
  real run.
- `ih-probe.js` has **no renderer at all** — it proves the parser node's returned object.
- `c3-probe.js` proves the producer object and the `suggest_response` string. The one downstream
  by-name consumer that could have been a wrong-object trap is covered by `§IH-FP-R`
  (`crossdomain-compose` splices a cross-domain block at a marker index — the marker index, the
  lead-in line and every `— did you mean:` header line are asserted byte-identical). The other,
  `compile-current-state` (`response = _sug.suggest_response`), reads the whole object.
- **F5 (tester pass 2) — `sim-inject` pick fixtures go SILENTLY VACUOUS.** `sim-inject-session`
  coerces an absent `referenced_result_set` to `[]`, and `output_exchange` guards with
  `Array.isArray(...)`, which `[]` passes — so the `prevState.last_result_set` fallback is never
  taken and a positional-pick fixture exercises nothing while reporting green. Not a live defect
  (live has the key absent in 62 of 67 executions). **Any future `sim-inject` pick fixture must pass
  `referenced_result_set` explicitly.** The offline fixtures here set it directly and are unaffected.
- **§IH-14 is exercised against a SYNTHETIC 50-row answer set** plus a 49-row boundary case. That
  proves the code path, **not** that a real 15-candidate probe saturates. §IH-0d is still required.
- ✅ **`probe_cap` is now MEASURED** (`product_attachment: 8`, `inventory: 3`; exec `11646010`).
  Rev 1 shipped `inventory: 5` on an assumed warehouse grain; the real grain is warehouse ×
  system-location at 13 rows/candidate. `§IH-13b` gates it. Do not raise it without re-measuring.

## Three things this harness got wrong before it got them right

Recorded rather than quietly fixed, because each is an instance of a class this repo keeps hitting.

1. **`ih-probe.js` RE-IMPLEMENTED `_ceAxisFor`** instead of lifting the body's own. Under
   `§IH-FP-1` — which reverts `_ceAxisFor` but leaves `DOMAIN_SUBJECT_AXIS` declared — the
   re-implementation kept computing the FIXED answer, so the class gate stayed **green on a body
   that had the bug back**. That is LESSONS §63 (wrong-object) occurring *inside the instrument
   built to detect it*. It now lifts the real function out of the body under test.
2. **Two declared red-sets were wrong** (`§IH-FP-2` does not redden `IH-4a/4b`; `§IH-FP-4` does not
   redden `IH-3`). Found by *running* the mutations, not by reading. Both corrected in place with
   the measurement recorded.
3. **The first "negative control" was not one** — it edited `dym-transform.js` only, which trips the
   §IH-15 twin gate, i.e. it was a second `§IH-FP-11`. It now edits both twins.

Plus one fixture that could not discriminate: the first `IH-4b` asserted a carried certificate is
evicted on a pick turn. The reference-positions block does `entities = [...resolved]`, a wholesale
overwrite, so nothing carried ever reaches the reconciliation pass there and the assertion was
vacuous. Replaced with the mixed product+certificate pick shape.
