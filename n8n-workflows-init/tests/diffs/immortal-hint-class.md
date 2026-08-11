# Node diff — `immortal-hint-class` (C1 · C2 · C3 · M2)

Plan: `plans/immortal-hint-class-plan.md`. UAC: `tests/uac/IH.md` (+ `tests/uac/00-SAFETY-always-read.md`).
Composition context: `plans/carried-certificate-dump-plan.md` §3.7/§3.8, `plans/dym-probe-before-offer-plan.md` §8f/§8g.

**Nothing was promoted. No UAC executions were run. The live spine `9qVyfUxmRQqrpGRMDLRuz` and the
live parser `XTODTw-dJcV0uRdC056hG` were not touched** (both re-verified `--verify`-current and
unchanged at `f9205b03` / `8a813ddc` after all writes).

| artifact | rollback (all) | rev 1 | **rev 2 — CURRENT** | nodes changed |
|---|---|---|---|---|
| parser fork `wI5RkNGW3EOJfBdo` | `95193323-e6cd-462a-9a91-aea08457b46c` | `aab47959-9ee5-4283-a878-6e8af69d895a` | **`184882c1-9ad8-4aff-bb36-3fe2340a87de`** | 1 — `output_exchange` |
| clone `txiPzSxy3Pclsz6v` | `5fdd12df-a048-4f03-9141-c27b9f09674a` | `544138ca` → rev2 `a2422bb9` | **`879d0f68-15cf-4e18-af0d-34bbd3636f29`** | rev1: 5 · rev2: 2 · rev3: 2 |

**Rev 2** = tester pass-2 fixes (F1 clone, F3 fork). **Rev 3** = reviewer F-STRIP (clone only; the
fork is unchanged at `184882c1`). Each rev rolls back with a single `publish_workflow` of the prior id.

Both: **0 nodes added, 0 removed, connections byte-identical, `versionId == activeVersionId`,
credentials intact (2/2 and 27/27)**. Re-asserted from the published JSON, not from memory.
Manifests: `tests/manifests/immortal-hint-class/`.

> ⚠️ **The clone rollback baseline is `5fdd12df`, NOT the `2d1627c8` in the task.** The clone had
> already moved; `--verify` exits 1 on `2d1627c8`. Plan §0.1 records the same correction.

---

## Rev 2 — tester pass-2 fixes

### 🔴 F1 (promote blocker, clone) — `inventory.probe_cap` `5 → 3`

I shipped this uncalibrated and said so; the tester measured it and it was wrong.
**Exec `11646010`: a single stocked candidate returned 13 rows.** The grain is
warehouse × **system-location**, not warehouse — my estimate was off by ~3×. At 13 rows/candidate the
50-row backend budget admits **3** candidates, not 5; `5 × 13 = 65` saturated every time.

The failure mode is fail-**closed** (saturation ⇒ zero annotation, never a false label), which is why
nothing rendered wrongly — but a cap that always saturates makes the feature **silently vanish on
exactly the multi-token inventory turns it exists for**, i.e. the shape the user reported. So 3 is a
correctness value, not a tuning value, and the node body now says `DO NOT RAISE without re-measuring
the row grain first`.

`product_attachment: 8` is confirmed safe (~0.8–1.3 rows/candidate ⇒ ~10 of 50) and is **unchanged**.
Both caps are now annotated as **measured**, citing exec `11646010`, with the grain finding recorded
so nobody optimises the number back up.

**Confirmation that F1 did not disturb §IH-13's live-proven behaviour** — three independent checks:
1. the PUT reported `dym-annotate`, `dym-annotate-partial` and `build-suggest-offer` as
   **`ALREADY IDENTICAL — skipping`**, and their live shas are unchanged (`2e700477c414`,
   `46882e9a2e5f`, `08aec1d01e2c`);
2. the rev1→rev2 structural diff shows **exactly 2 changed nodes**, both `dym-transform` copies;
3. `§IH-13b` asserts `product_attachment`'s cap is **still 8** on the same fixture that passed live.

New gate `§IH-13b` also asserts the *point* of the fix rather than just the constant: at the measured
grain, `3 × 13 = 39 < 50`, so the annotation **survives**; and the counterfactual `5 × 13 = 65 ≥ 50`
would have saturated. `§IH-FP-F1` (restore `probe_cap: 5`) reddens `§IH-13b` and **only** `§IH-13b`.

### 🟠 F3 (fork) — `unknown_entity_hints` was blind to dormant carried entities

`_ceUnknownHints` is populated as a side effect of `_ceAxisFor`, and the contribution loop
short-circuits on `if (_ceIsCarried(e)) continue;` **before** classifying. Worse, on a reuse turn the
executor takes `finalEntities = prior` and never calls `axisOf` at all. So a dormant carried entity —
**precisely the immortal population the diagnostic exists to measure** — was never counted. Exec
`11645628` carried the unrecognised `M2399` all turn and emitted nothing. Exactly inverted from plan
§2.1's intent.

```js
// diagnostic-only sweep of the FINAL entity set, after every eviction decision is already taken
if (output.output && !output.output.is_menu_label && Array.isArray(output.output.entities)) {
  for (const e of output.output.entities) _ceAxisFor(e, output.output.domain_hint);
}
```

Cannot change behaviour: `_ceAxisFor` is pure apart from the Set, and every eviction decision was
made above it.

**The gate is `IH-3-CTRL`, not `IH-3`, and the difference is the whole point.** On `IH-3` the
executor's prior-filter classifies the entity on its way to evicting it, so the diagnostic fires with
or without F3 — `IH-3` could never have caught this. `IH-3-CTRL` is the reuse-turn shape where the
entity is dormant. Measured: the rev-1 body reddens **`IH-3-CTRL` only**, and `§IH-FP-F3` (remove the
sweep) reproduces that exact red-set.

---

## Rev 3 — reviewer fixes

### 🔴 F-STRIP — two C3 keys missing from `_DYM_CTRL_KEYS`

Confirmed and **re-derived rather than assumed symmetric**, as asked:

- `build-suggest-offer._DYM_CTRL_KEYS` is the **only** strip list in the clone (grepped by name
  across all 38 code nodes). It had 12 entries; `dym_capped_codes` and `probe_cap_applied` are now
  added, with a standing note that any new `dym-transform` output key must be added in the same
  commit.
- The **partial lane needs no strip list** — `compile-current-state` builds a *fresh object literal*
  and copies named fields across (the F-CCS-STRIP invariant). That invariant holds for these two
  keys, so no functional change was needed there. But its rationale comment enumerated
  **"10 harness control keys"** and was already stale at 12 before C3 added two more. A load-bearing
  invariant with wrong documentation decays into a refactor hazard, so the count is corrected.
  **Comment-only** — mechanically proven: every changed line in that node begins with `//`.

Impact was as the reviewer described — not a session leak, not customer-visible, no consumer reads
them — but it broke §DP-10 on the path covering most traffic.

### 🔴 F-STALE — fixed structurally, not by re-copying

The reviewer's causal point is the important one and it is now designed against: the stale
`dym-transform.js` never emitted `dym_capped_codes`, so the stale `build-suggest-offer.js` was
*correct* not to strip it. **The pair was self-consistent, so the gate built to catch F-STRIP passed
green.** A right assertion pointed at the wrong artifact (LESSONS §63).

New `tests/offline/node-source.js` is now the only sanctioned way to load a node body:

- bodies are read from `export/`, which `export-workflows.py --verify` polices against live;
- each body is re-checked against the export's own `MANIFEST.json` sha256, so a corrupt or
  hand-edited export **aborts** instead of being compared;
- a suite that legitimately keeps a local *after* copy must call `assertMatchesExport()` on it —
  `c3-probe.js` and `ih-probe.js` now do, and **the gate was shown to fire** (appending one comment
  line to `c3.after/dym-transform.js` aborts with `local copy DIFFERS from the published body`);
- **the eight stale local copies were deleted**, so there is no file left to read by accident;
- `mutate.sh` must still perturb bodies, but must never edit the audited export — it now stages a
  scratch copy and redirects via `OFFLINE_NODES_DIR`, which prints a loud banner stating the run
  certifies nothing about what is published. Re-proven both ways: dropping the two strip keys
  reddens `byteid.js`; a search string that does not occur **aborts** instead of passing.

### Which suites changed verdict once they read the real bodies

| suite | before (stale copies) | reading published `a2422bb9` | now, on `879d0f68` |
|---|---|---|---|
| `byteid.js` | ALL PASS | **11 FAILURES** | ALL PASS |
| `harness.js` | ALL PASS | **8 FAILURES** | ALL PASS |
| `ccs-harness.js` | ALL PASS | ALL PASS | ALL PASS |
| `parity.js` | ALL PASS (valid — already export-sourced) | *broke on a local read* | ALL PASS |

Two findings, not formalities:

1. **`byteid.js`'s 11 and 4 of `harness.js`'s 8 were F-STRIP itself** — the leaked keys, on
   `order` / `master_products` / `promotion` / `incoming`. The gate worked the instant it was aimed
   at the real artifact.
2. **The other 4 `harness.js` failures were obsolete-by-design assertions** (`DP-13a reason`,
   `DP-13a probe_needed`, `D1 lane still multi_token`, `D1 lane probe_needed false`) — C3
   deliberately inverts them. In rev 1 I flagged these and chose **not** to edit that harness,
   reasoning it was the shipped feature's evidence. That was the wrong call once the suite reads
   live bodies: four permanently-red assertions make the suite useless as a gate and would mask the
   next real red. They are now **inverted to their C3-correct values, not deleted**, each with a
   note saying C3 lifted the exclusion, plus a new assertion that the D1 lane is still *labelled*
   `d1` (so a lane-detection regression is still caught).
3. **`parity.js` had one local read** (`crossdomain-compose.js`) while the rest of it read the
   export — the single inconsistency in the only suite that was otherwise sourcing correctly. Fixed.

---

## §0 safety — nothing in this change can egress

| gate | status |
|---|---|
| S1/S2 | No egress node touched. All 5 egress nodes re-confirmed **0 inbound** from the published clone JSON: `send-message-files`, `send-message-images`, `send-message-video`, `update-human-intervened`, `save-session-vars`. |
| S3 | `Call 'sub-respond-save-message-redis'2`.`workflowId.value === tWm5DYLxfypmVC1T` (the TEST fork), inbound `['if-message-is-audio']` — unchanged. |
| S4 | C3 changes **which candidates** are probed and **how many**, never the tool. `DOMAIN_PROBE[*].tool` is byte-identical: `crm_master_product_attachments_list` / `crm_inventory_stock_balance_list`. Both are READ tools. The cap can only ever *reduce* the probed set. |
| connections | byte-identical on both artifacts, so no path was created or removed. |

---

## C1 — `immortal-hint-axis` · `output_exchange` · fork

### C1a — the axis fallback (the defect, in one line)

```diff
-  return (domainMap && domainMap[hint]) || HINT_AXIS_DEFAULT[hint] || `__${hint}`;
+  const known = (domainMap && domainMap[hint]) || HINT_AXIS_DEFAULT[hint];
+  if (known) return known;
+  if (hint) _ceUnknownHints.add(hint);
+  return DOMAIN_SUBJECT_AXIS[domain] || 'unscoped_scope';
```

plus a new module-scope `DOMAIN_SUBJECT_AXIS` (11 domains) and `const _ceUnknownHints = new Set()`,
both declared immediately above `_ceAxisFor`.

**Before:** an unrecognised hint got a private axis nothing could ever collide with, so the
executor's `keptPrior = prior.filter(e => !currentAxes.has(axisOf(e)))` retained it on every
subsequent turn — `('M2399','product_attachment',ordinal:1)` survived six consecutive turns.
**After:** under `product_attachment` its axis is `product_scope`; a turn naming any product
contributes `product_scope`, and it is evicted.

### C1b — two explicitly known-missing hints

```diff
   warehouse: 'location', goods_receive: 'doc', spo: 'doc', form: 'doc',
+  inbound_shipment: 'incoming_scope',   // C1: mapped under `incoming` only; fell to __ elsewhere
+  grn:              'doc',              // C1: sibling of goods_receive/spo, was unmapped
```

Near-inert in practice, and checked rather than assumed: `inbound_shipment` is in
`DOMAIN_BLOCKED_HINTS` for **every** domain except `incoming`, where the domain map already covers
it; `grn` is blocked in every domain that has a blocklist entry.

### C1c — the residual-class diagnostic

```js
if (output.output && !output.output.is_menu_label && _ceUnknownHints.size) {
  output.output.unknown_entity_hints = [..._ceUnknownHints].sort();
}
```

Placed immediately after the B2′ reconciliation pass — the **last** caller of `_ceAxisFor` (the
executor is the other and runs earlier), so the set is complete. Sorted for determinism; emitted
only when non-empty ⇒ drop-when-absent in the replay `norm()` (LESSONS §40). This is what turns
"the residual unrecognised population is assumed empty" into something measurable on real traffic.
*(Deviation from plan §2.1: a `Set` + sorted array rather than an array, so the diagnostic is
deduped and replay-stable.)*

### 🔴 How C1's shared axis avoids breaking B2′ / block (B) / `dym-transform`

Asked explicitly in the task. Each answer is **measured**, not argued — the offline suite is the
evidence, and each row names the fixture.

| dependency | why C1 cannot reach it | evidence |
|---|---|---|
| **B2′ eviction** (`_RC_INSTANCE_HINTS = certificate, attachment`) | both hints are **mapped** by B2′ part 1 in *both* `AXIS_BY_DOMAIN.product_attachment` and `HINT_AXIS_DEFAULT`, so `known` is truthy and the new fallback is never reached. Their axis stays `attachment_scope` — deliberately a **different** axis from `product_scope`, which is exactly why B2′ part 4's rule is semantic and cannot be expressed as axis collision. | `IH-5` asserts `axisOf('certificate') === 'attachment_scope'` **and** that the carried certificate is still evicted. All 11 pre-existing §CD fixtures stay **GREEN 11/11** against the new body. |
| **Block (B)'s `attachment_type` re-attach** (`output_exchange:613`) | `attachment_type` is in both maps ⇒ never reaches the fallback. Block (B) also copies an **existing entity's own hint**, so it cannot mint an unrecognised one. | §CD `FP8-D` (bare-product follow-up) asserts `attachment_type` is RETAINED while the certificate is evicted — still green. |
| **`dym-transform`'s `requires: ['attachment_type','certificate']`** | it reads `gate.compatible_entities[].entity_type` — the **resolver's** type, in the **spine**. It never reads a parser hint, so C1 cannot touch it. The only coupling is indirect: if C1 evicts a stale scoping entity, the gate falls to `probe_skip_reason: 'no_scoping_entity'` ⇒ no annotation ⇒ today's offer. That is the designed fail-closed path. | `c3-probe.js` fail-open block: every degraded path renders **byte-identical to the un-annotated offer**. |
| **`DOMAIN_BLOCKED_HINTS`** | blocklist-apply runs after the reconciliation pass and keys on hint **strings**, not axes. | unchanged code. |
| **recognised hints** | the first two lookups are unchanged and tried first. | `IH-2` + 5 `NI-*` fixtures assert the **whole returned object** is byte-identical to the pre-change body. |

**Residual, stated not hidden:** an unrecognised hint genuinely *orthogonal* to its domain's subject
axis would now be evicted when the subject changes. No such hint is known. `unknown_entity_hints`
exists so this stops being an assumption — **§IH-0a is still the GO/NO-GO and I could not run it**
(see "Blocked" below).

---

## C2 — `no-domain-name-hints` · `output_exchange` · fork

### C2a — a narrow guard, declared inside the reference-positions block

New: `DOMAIN_SUBJECT_HINT` (11 domains), `KNOWN_ENTITY_HINTS` (20 hints), `_c2Hint(candidate, domain)`.
Scoped to the one writer — **not** a repo-wide validator (that is D2, filed separately).

### C2b — both writer sites

```diff
-      hint = HINT_MAP[before] || before || output.output.domain_hint || 'promotion';
+      hint = _c2Hint(HINT_MAP[before] || before || row.entity_type, output.output.domain_hint);
...
-      hint = output.output.domain_hint || 'promotion';
+      hint = _c2Hint(row.entity_type, output.output.domain_hint);
```

`row.entity_type` is already persisted by `compile-current-state` (`entity_type: it.entity_type || null`),
so this costs nothing new; it is `null` for render-envelope answer items — the `M2399` case — which
is exactly when `DOMAIN_SUBJECT_HINT` carries the decision.

The legacy `|| 'promotion'` tail is **dropped**, and that is proven both ways:
`IH-8a` (promotion result set still mints `promotion`, byte-identical) and `IH-8b` (the
discriminator: `domain_hint === null` now mints `product`, not `promotion`). Without `IH-8b` the
suite could not tell the new map from the old default.

---

## M2 — the `ordinal` exemption, made this-turn-only · `output_exchange` · fork

```diff
 const _ceDymPickedKeys = new Set();
+const _ceRefPickedKeys = new Set();
...
-  if (e.ordinal !== undefined) return false;      // reference-position pick = this-turn selection
+  if (_ceRefPickedKeys.has(_ceKey(e))) return false;   // M2: reference-position pick MINTED THIS TURN
...
   resolved.push({ raw, hint, ordinal: pos, current_message: true,
                   uuid: row.uuid || null, canonical_code: row.product || raw });
+  _ceRefPickedKeys.add(_ceKey({ hint, canonical_code: row.product || raw, raw }));
```

Follows B2′'s own already-reviewed `_ceDymPickedKeys` pattern (record, don't infer). Ordering is
safe: the reference-positions block (`:552`) runs **before** the reconciliation pass (`:700`), the
only reader of `_ceIsCarried`.

### 🚩 The load-bearing consequence is CONTRIBUTION ACCOUNTING, and the plan's §IH-4 assertion is under-specified

Plan §IH-4 says "the seeded entity is classified carried — i.e. it is **absent from the final entity
set**". That does not follow: an entity is not removed for being carried. What `_ceIsCarried`
actually drives is (a) whether an entity counts as a **this-turn contribution** and (b) the drop
filter. The real regression C1-without-M2 introduces is (a):

- prior state carries an `ordinal`-bearing product **and** a carried certificate; the LLM emits
  nothing this turn;
- pre-M2 the ordinal entity is permanently "not carried" ⇒ `_rcContribProduct = true` ⇒ B2′ part 4
  evicts the certificate **on a turn where nothing changed**;
- post-M2 it is carried ⇒ no contribution ⇒ the certificate survives.

`IH-4a` measures exactly that. It reddens on the pre-change body and greens after.

### 🔴 And the obvious shape for the *other* arm does not work — first draft had it wrong

`IH-4b` was first written as "a genuine pick this turn still contributes, so the carried certificate
IS evicted". That fixture **cannot** discriminate, because on the **byIdx** arm the
reference-positions block does `output.output.entities = [...resolved]` (`output_exchange.js:664`),
a wholesale overwrite, so a carried certificate never reaches the reconciliation pass on that arm.

> 🛠 **CORRECTED (tester pass 2).** My rev-1 wording said this was true of "the reference-positions
> block" generally. It is **not** — it is true of the byIdx arm **only**. `dymNumberedMultiSelect`
> (`:585`) sets `entities = _base`, seeded from `prevState.entities`, and then clears
> `reference_positions`; so on a `reference_target === 'dym'` pick, carried entities **do** reach
> reconciliation. The §IH-4 conclusion is unaffected — the fixture still had to change — but do not
> build on the overstated version. The arm that does discriminate picks a **certificate row whose key is also in prior state**
alongside a product row: the product contributes `product_scope`, so a freshly-picked certificate
misclassified as carried would be **dropped**. It must be retained. Both directions are then gated
by `§IH-FP-3` (restore the persisted-field test ⇒ `IH-4a` reddens) and `§IH-FP-3b` (never record the
pick ⇒ `IH-4b` reddens).

---

## C3 — `multitoken-d1-annotate` · clone

### Edit 1 — `dym-transform` ×2: open the D1 gate

```diff
-    const _blocks = _isPartialLane ? _survivors : (_survivors.length === 1 ? _survivors : null);
+    const _blocks = _survivors;
```

`probe_lane` still resolves `_isPartialLane ? 'partial' : 'd1'`. **The `'multi_token'` literal is
deliberately retained** so a runData search distinguishes "never fired" from "constant removed"
(§IH-11 clause 5 asserts both the absence of the value and the presence of the literal in source).

### Edit 2 — `dym-transform` ×2: per-domain probe cap (mitigation i)

New `probe_cap` on each `DOMAIN_PROBE` entry, new `dym_capped_codes[]` / `probe_cap_applied`, both
added to the returned object; the cap itself:

```js
const _cap = Number(cfg.probe_cap);
if (Number.isFinite(_cap) && _cap > 0 && cands.length > _cap) {
  dym_capped_codes = cands.slice(_cap).map(c => c.code);
  cands.length = _cap;
  dym_candidate_codes = dym_candidate_codes.slice(0, _cap);
  probe_cap_applied = true;
}
```

`cands` and `dym_candidate_codes` are built in the same loop under the same condition, so a matched
truncation is exact. Fail-open by construction: a missing / non-numeric / non-positive `probe_cap`
disables the cap rather than dropping candidates. Overflow renders **bare** (absent from
`dym_candidate_codes` ⇒ absent from `_dymProbed` ⇒ no suffix), so the cap can only ever *withhold*
an annotation, never invent one.

### Edit 3 — `dym-annotate` ×2: page-saturation detection (mitigation ii)

```js
const _PAGE_SATURATION = 50;   // app/schemas/common.py:37  limit: int = 50
...
} else if (answers.length >= _PAGE_SATURATION) {
  meta.answer_count = answers.length;
  meta.reason = 'page_saturated';
}
```

Checked **before** either predicate: both attribute by code, and an attribution built on a truncated
page is wrong in the one direction that matters (a missing code reads as "no"). `meta.ok` stays
false ⇒ `available = []` ⇒ zero annotation.

### Edit 4 — `build-suggest-offer`: the suffix

```diff
       idx += 1;
       const isU = isUuid(p.m.canonical_code);
-      candLines.push(`  ${idx}. ${p.label}`);
+      const _k = _dymNorm(p.m.canonical_code);
+      const _sfx = (_dymOk && _dymProbed.has(_k))
+        ? (_dymHas.has(_k) ? ` - has ${_dymNoun}` : ` - no ${_dymNoun}`)
+        : '';
+      candLines.push(`  ${idx}. ${p.label}${_sfx}`);
```

Plus a one-line correction to the now-stale scope comment above `_dymAnn`.

### 🔴 How C3 annotates without renumbering

Asked explicitly in the task.

1. **No sort is introduced.** `idx += 1` is untouched and still increments exactly once per pick, in
   the same loop, in the same order. Numbering is preserved *by construction*, not by a comparator
   that happens to be stable.
2. **The suffix lands on `candLines`**, a local array that feeds **only** `suggest_response`. It is
   never applied to `p.label`, so `out.suggest_last_result_set.push({ idx, label: p.label, … })` and
   `out.dym_candidates.push({ code, for_raw, for_hint, for_canonical })` are untouched statements —
   the numbered pick still round-trips on `idx`/`value`.
3. **The gate that proves it**: `§IH-11.3` strips every ` - has …`/` - no …` suffix from
   `suggest_response` and asserts byte-identity against a **captured pre-change baseline**
   (`§IH-10`), not a re-derivation. `§IH-FP-7` (apply D3's has-first sort to the multi-token picks)
   reddens `§IH-11.3` + `§IH-11.inv` + `§IH-13.n` while leaving the **suffix** clauses `§IH-11.1`
   green — so clause 3 demonstrably detects renumbering rather than riding on clause 1.
4. **`suggest_quick_reply` is byte-identical** to `"Yes escalate,No it's okay"`. The task's
   correction is confirmed: this block sets `[YES, NO]` only, with no codes, so
   `suggest_quick_reply[i] === suggest_last_result_set[i].value` does not apply here and was not
   "fixed into existence".

### The `-partial` twins

`dym-transform` and `dym-transform-partial` are **byte-identical** (sha `d75a5198befc`, both before
and after). `dym-annotate` vs `dym-annotate-partial` differ **only** in the two lane literals, before
and after. `§IH-15` asserts both, and `§IH-FP-11` (revert the gate on the twin only) reddens it.

---

## What was actually verified, and how

All offline, no n8n, no network, no UAC executions.

| suite | result |
|---|---|
| `tests/offline/immortal-hint-class/ih-probe.js oe.before.js` | **RED 7/16** — the defect reproduces on the pre-change fork body |
| `tests/offline/immortal-hint-class/ih-probe.js oe.after.js` | **GREEN 16/16** |
| `tests/offline/immortal-hint-class/ih-mutate.sh` | **8/8 mutations behaved as declared** (incl. a negative control) |
| `tests/offline/immortal-hint-class/c3-probe.js` | **ALL PASS 69/69** |
| `tests/offline/immortal-hint-class/c3-mutate.sh` | **7/7 mutations behaved as declared** |
| `tests/offline/carried-certificate-dump/oe-probe.js <new body>` | **GREEN 11/11** — every B2′ fixture still passes ⇒ C1/C2/M2 **compose** with B2′ |
| `node --check` | all 6 changed bodies |
| REST byte gate | all 6 nodes byte-identical live vs file after publish |

**The `-partial`/`--verify`/fork-delta gates are green**: `export-workflows.py --verify` all current;
`diff fork ↔ oe-patch(live)` is **exactly one hunk** (the two `resource_attachment` entries).

### 🔴 Where these harnesses are BLIND — read this before reading a green

- **No customer boundary.** Neither suite models `save-session-vars.user_response` or the sendmsg
  payload. LESSONS §63i is not satisfied by them. The tester must assert the customer boundary.
- **`ih-probe.js` has no renderer at all** — it proves the parser node's returned object only.
- **`c3-probe.js` proves the producer object and the `suggest_response` string**, and I added
  `§IH-FP-R` for the one downstream consumer that could have been a wrong-object trap
  (`crossdomain-compose` splices a cross-domain block into this exact render at a marker index):
  the earliest marker index, the lead-in line and every `— did you mean:` header line are asserted
  **byte-identical**, and the suffix is asserted to contain no `. ` that could re-target the
  sentence snap. The other by-name consumer, `compile-current-state`
  (`response = _sug.suggest_response`), reads the whole object and therefore carries the annotation.
- **I found two of my own declared red-sets wrong by running them** (§IH-FP-2 does not redden
  `IH-4a/4b`; §IH-FP-4 does not redden `IH-3`). Both are recorded in the scripts rather than
  re-aimed. A third: my first `ih-probe.js` **re-implemented** `_ceAxisFor` instead of lifting the
  body's own, which made the class gate stay green under §IH-FP-1 — the wrong-object class, in the
  instrument built to detect it. Fixed; it now lifts the real function.

---

## Blocked / not done — say it plainly

> ⚠️ **Node count 149 → 148 — established, and it is NOT this change.** `3a196c44` and `2d1627c8`
> are 149; every rev here is 148. The drop happened in `2d1627c8 → 5fdd12df`, and `5fdd12df` is the
> state this change *found* — confirmed by the first REST GET, taken before any write. Also
> established: the removed node was **not a code node** (38 code-node hashes, identical name-set
> across `2d1627c8` and today) and **was credentialed** (28 → 27, stable at 27 since). The removal
> was clean — no dangling connection endpoints, no `$('X')`/`$("X")` read resolving to a missing
> node. **Its identity is not recoverable here:** no backup holds a 149-node snapshot (max 141
> @ `4c63eb41`), the git-tracked export has one commit at 141 @ `a5cf2434`, REST
> `?includeData=true` does not return `workflowData` on this n8n version, and MCP `get_execution`
> returns metadata only. **Open item for the owner of the `2d1627c8 → 5fdd12df` interval** — I
> cannot close it, and I am not claiming it was intentional.

> ✅ **Pass-2 results that supersede parts of this section.** §IH-0a is **GO** (165 hint occurrences
> across 108 executions; 2 distinct unrecognised hint strings, 18 occurrences, **zero orthogonal** —
> and one pair, `('incoming','incoming')`, was on the **live spine for a real customer**, so this was
> never confined to the dev contact). §IH-0b is **proven live, not inferred** — `ordinal` persists
> into the next turn's `get-session-vars` (execs `11555030`, `11642553`, plus 17 clone rows), with a
> negative control showing all 11 `sim-inject` rows carried zero `ordinal`. **M2 stands.** §IH-4 both
> arms pass live, including the over-eviction shape (exec `11645628`). §IH-13 passed live twice.
> `probe_cap` is no longer uncalibrated — see F1 above.

- **§IH-14 is BLOCKED BY DESIGN** (reviewer reclassification, same status as the
  `_dym_probe_input` sentinel): with `probe_cap` measured, a real probe *cannot* return ≥50 rows, so
  a live fixture would require first shipping a cap known to be unsafe. Covered offline with a
  synthetic 50-row set + a 49-row boundary case; `§IH-FP-9` reddens it on demand. Superseded text: §IH-0c/§IH-0d need live CRM reads to build a ≥50-row fixture,
  and I may not run executions. `c3-probe.js` exercises the saturation branch against a
  **synthetic** 50-row answer set (plus a 49-row boundary case proving the gate is not a constant),
  which proves the code path but **not** that a real 15-candidate probe saturates.
- **🔴 `probe_cap` is UNCALIBRATED.** §IH-0c/§IH-0d were to seed it. Shipped values —
  `product_attachment: 8`, `inventory: 5` — are derived, not measured, and both are commented as
  such in the node bodies with the §IH-0c/0d citation. Any cap ≥3 leaves the single-token lane
  byte-identical (`§IH-16` asserts this), so the risk is confined to multi-token.
- **§IH-0a (§6-IH-V1) NOT RUN** — the unrecognised-hint population census over ~300 executions. It
  is the plan's own **NO-GO gate** for C1's `DOMAIN_SUBJECT_AXIS` step. C1 ships on the plan's
  code-census argument plus the new `unknown_entity_hints` diagnostic; the tester should run it.
- **§IH-0b is GRADED INFERENCE, not observation.** That `ordinal` persists into the next turn's
  `get-session-vars` is read from the code (`reconcileEntities` spreads `{...pe}`;
  `compile-current-state` persists `entities: reconciledEntities`), not seen in a real execution.
  **If the tester disproves it, M2 is withdrawn** — but note the M2 fix is a strict tightening
  either way: nothing that was evictable becomes exempt.
- **`validate_workflow txiPzSxy3Pclsz6v` could not be run as specified.** On this n8n-mcp surface
  `validate_workflow` takes SDK **`code`**, not a workflow id — there is no id-based validator. The
  equivalent structural gate was run instead and is reported above (node count 148→148, node-name
  set identical, connections byte-identical, exactly 5 nodes with changed parameters, `node --check`
  on every body, REST byte gate on every node).

---

## Findings against the plans

1. **Plan §4.5 / dym §8f arithmetic is wrong in one place.** "15 × 3 attachments-of-type also
   breaches it" — 45 < 50. The `product_attachment` hazard needs >3 attachments-of-type per product
   to breach, so it is looser than stated. The `inventory` case (15 × ≥4 warehouses) is correct and
   is the real driver. `probe_cap` is sized accordingly (8 vs 5).
2. **Plan §IH-4's assertion is under-specified** (see M2 above): "classified carried ⇒ absent from
   the final entity set" does not follow, and the naive fixture for the pick arm is vacuous because
   the reference-positions block overwrites `entities` wholesale.
3. **`§IH-FP-8`'s stated expectation is wrong.** IH.md expects it to redden `§IH-16`. It cannot —
   `§IH-16` exercises the **single-token** code-mode block, a different arm C3 does not touch.
   Measured red-set is the `suggest_last_result_set` bare assertion only. Recorded in
   `c3-mutate.sh`, not re-aimed.
4. **`§IH-FP-2`'s "§IH-1 stays green" is right for the wrong reason as I could measure it.** It
   reddens `IH-3` and nothing else — `IH-4a/4b` carry only *recognised* hints, so the fallback is
   never reached there. The asymmetry the plan wants is real and is now measured.
5. **Plan §2.1 does not say where `unknown_entity_hints` is emitted.** Placed after the
   reconciliation pass (the last `_ceAxisFor` caller) and changed from an array to a sorted deduped
   Set, so it is replay-stable.
6. ~~**The existing `harness.js` carries three stale assertions** … I did not edit that harness.~~
   🛠 **REVERSED in rev 3.** Leaving them was defensible only while the suite read frozen copies;
   once it reads published bodies, permanently-red assertions mask the next real red. They are now
   inverted to their C3-correct values with the reason recorded inline. There were **four**, not
   three (`DP-13a` contributes two).
7. **Tooling:** the parser fork `wI5RkNGW3EOJfBdo` is now in the export set as
   `export/sub-semantic-parser-FORK/`, so `--verify` covers it and §IH-0e is a `git diff` rather
   than a hand-rolled REST pull. `oe-patch.py` gained `--c-only` (fork build: C hunks alone, so the
   stale `resource_attachment` delta is **not** ridden in as an undeclared collateral change) and
   `--no-c` (B2′-only, for provenance).
8. **`scripts/split-uac.py` was NOT run**, per the standing warning.

## Known bounds recorded from pass 2 (no code change)

- **F4 — a poisoned session still dumps on a pure reuse turn.** Exec `11645628`: a reuse turn over a
  poisoned session produces the 26-product dump. Correct per this change's scope — C1 evicts on
  *axis collision*, and a reuse turn contributes no axis — but it is customer-visible until the user
  names something. Recorded as a known bound, not a defect of C1.
- **F5 — a harness trap for future pick fixtures.** `sim-inject-session` coerces an absent
  `referenced_result_set` to `[]`, and `output_exchange` guards with `Array.isArray(...)`, which `[]`
  passes — so the `prevState.last_result_set` fallback is never taken and a positional-pick fixture
  goes **silently vacuous**. Not a live defect (live has the key absent in 62 of 67 executions).
  Future `sim-inject` pick fixtures must pass `referenced_result_set` explicitly. Also in the
  harness README.
- **F6 — no prior IH run artifact** existed in `tests/runs/` before pass 2, so pass 1 has no file to
  diff against. Nothing to fix; do not rely on it.
