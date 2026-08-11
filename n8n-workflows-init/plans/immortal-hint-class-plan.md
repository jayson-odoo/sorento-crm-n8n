# Change C: the immortal-hint class — `__${hint}` private axes, domain names in the hint field, and the unannotated multi-token D1

**Three linked changes, deliberately NOT bundled into one node write's worth of reasoning
(LESSONS §51), each with exactly one scope tag:**

| id | what | where | scope tag |
|---|---|---|---|
| **C1** | `immortal-hint-axis` — an unrecognised hint must share a real eviction axis, never a private `__hint` island | parser sub `output_exchange` | **`parser`** |
| **C2** | `no-domain-name-hints` — stop the reference-positions block stamping a DOMAIN name into the entity `hint` field | parser sub `output_exchange` | **`parser`** |
| **C3** | `multitoken-d1-annotate` — annotate the multi-token D1 offer without re-sorting or renumbering | spine `dym-transform` + `build-suggest-offer` | **`deterministic`** |

**Build targets:** C1 + C2 → parser fork **`wI5RkNGW3EOJfBdo`** (`sub-semantic-parser FORK
domain-continuity-carry`, the sub the clone actually calls). C3 → clone **`txiPzSxy3Pclsz6v`**.
Promotion of any of them is **user-gated** and out of scope here.
C1/C2's promote target is the **live** sub `XTODTw-dJcV0uRdC056hG`; C3's is the live spine
`9qVyfUxmRQqrpGRMDLRuz`.
**UAC family: `§IH`** (`tests/uac/IH.md`).

**Export baseline, `--verify` green 2026-08-08** (re-exported at plan time — the clone export was
STALE on arrival, see §0):
live spine `f9205b03`, clone **`5fdd12df`**, `sub-semantic-parser` (live `XTODTw`) `8a813ddc`,
`sub-get-results` `61b65e5f`, `sub-get-results-TEST` `da0644da`, `sub-sendmsg` `c712e218`,
`sorento-dispatcher` `32315a54`.
Parser fork `wI5RkNGW3EOJfBdo` @ **`95193323`**, `versionId == activeVersionId` (no unpublished
draft), pulled fresh via REST — at plan time it was **not in the export set**.
🛠 **SUPERSEDED 2026-08-08:** it is now exported as `export/sub-semantic-parser-FORK/` and
`--verify` covers it; §6-IH-V5 is a `git diff` of two exported files.

---

## 0. 🚩 Baseline corrections found before any analysis — read these first

Three premises in the change request or in the repo's own tooling were wrong. Each is corrected
here and each changes what a later agent must do.

1. **The clone had moved.** The request pins clone `2d1627c8`; `--verify` reported
   `export 2d1627c8 vs live 5fdd12df` and **exited 1**. The export has been refreshed and every
   clone line number in this plan is derived against **`5fdd12df`**. Anyone picking this up must
   re-run `--verify` before trusting a number.

2. **The parser fork is stale vs live in exactly the way the request describes — confirmed by
   byte diff, and it is the ONLY fork↔live delta outside B2′.** `diff` live `output_exchange`
   (866 lines) → fork (977 lines) is five hunks: four are B2′ (already built on the fork), the
   fifth is the `DOMAIN_BLOCKED_HINTS` regression:

   ```
   order:    live …,'attachment','resource_attachment','flyer']   fork lacks 'resource_attachment'
   incoming: live …,'flyer','resource_attachment']                fork lacks 'resource_attachment'
   ```

   **Block-copying the fork body to live would silently REGRESS live.** Build the promote target as
   **LIVE + own hunks, by node NAME** (LESSONS §57/§58c) — `oe-patch.py` in
   `tests/offline/carried-certificate-dump/` is the tool for exactly this. Re-diff immediately
   before promote; this delta was current on 2026-08-08 and another may land.

3. **🔴 `tests/UAC.md` is STALE and `scripts/split-uac.py` MUST NOT be re-run.** The script
   regenerates `tests/uac/*` **from** the monolith, and the monolith no longer contains the split
   files' content. Measured at plan time:

   | marker | in `UAC.md` | in `tests/uac/` |
   |---|---|---|
   | `§DP-19` | **0** | 6 |
   | `§CD-11` | **0** | 15 |
   | `§CD-BLIND` | **0** | 6 |
   | `§MC-` | **0** | 48 |

   Re-running `split-uac.py` today would **destroy the entire §MC family and the B2′/dym rev-4..6
   work**. The split files are now the de-facto source of truth; the monolith is provenance for
   pre-split sections only. **This plan therefore writes `tests/uac/IH.md` directly and does not
   touch `UAC.md`.** Recorded in `tests/uac/README.md` as a standing warning. This is the same
   class as LESSONS §24 (a stale artifact that a later "regenerate" silently ships).

---

## 1. The incident — root cause ESTABLISHED, and the request's assumed origin is WRONG

Six consecutive chat turns produced zero has/no annotations. `M2399` appeared on every turn
regardless of what the user typed. The change request's stated carried entity is correct:

```
('M2399', 'product_attachment', False)      ← hint is a DOMAIN name, not an entity hint
```

The request's root-cause reading of the *axis* half is correct and is not re-derived here.
**Its reading of the ORIGIN half is not.** The request asks whether `product_attachment` comes from
the LLM or from code, and offers the LLM as the leading candidate. **It is code.** Evidence below is
direct, not inferential.

### 1.1 Direct evidence — parser exec `11554793`, node `Call 'sub-query-reformulator'`

The fork emits `output._parser_raw = _parser_raw_snapshot` (fork `output_exchange:977`) — the frozen
raw LLM object, captured before any mutation. Retrieved read-only. Verbatim:

**`_parser_raw.entities` — what the LLM actually emitted (TWO entities, both correctly hinted):**

```json
[{"raw":"SRTWT2214","hint":"product","canonical_code":null,"current_message":true,"confident":true},
 {"raw":"cert","hint":"attachment_type","canonical_code":"certificate","current_message":true,"confident":true}]
```

**`output.entities` — what left the node (THREE entities):**

```json
[{"raw":"SRTWT2214","hint":"product",…,"current_message":true},
 {"raw":"certificate","hint":"attachment_type","canonical_code":"certificate","current_message":true},
 {"raw":"M2399","hint":"product_attachment","uuid":"487dfe36-cdc7-4950-b6dd-11c15879d568",
  "ordinal":1,"canonical_code":"M2399","current_message":false}]
```

**`M2399` is absent from the LLM output entirely.** It carries `ordinal: 1` — and `ordinal` has
exactly **one writer in the whole codebase**.

### 1.2 The writer: the REFERENCE-POSITIONS block stamps `domain_hint` into `hint`

Fork `output_exchange:562-588` (live `:549-575`), the `REFERENCE POSITIONS → ENTITIES` block:

```js
const HINT_MAP = {
  promotion: 'promotion', product: 'product', order: 'order',
  order_number: 'order', customer: 'customer', form: 'form',
};
…
  const sep = row.label.indexOf(': ');
  let hint, raw;
  if (sep !== -1) {
    const before = row.label.slice(0, sep).trim().toLowerCase();
    raw  = row.label.slice(sep + 2).trim();
    hint = HINT_MAP[before] || before || output.output.domain_hint || 'promotion';   // :580
  } else {
    raw  = row.label.trim();
    hint = output.output.domain_hint || 'promotion';                                  // :583
  }
  resolved.push({ raw, hint, ordinal: pos, current_message: true,
                  uuid: row.uuid || null, canonical_code: row.product || raw });
```

`:583` **assigns `domain_hint` — a DOMAIN name — to the entity `hint` field.** That is the defect,
in one line, and it is unconditional whenever the frozen row's label carries no `"<type>: "` prefix.

**Why the prefix is absent here, and why `product_attachment` results always hit `:583`:** the
frozen row is built by `compile-current-state.js:126-151` (clone `5fdd12df`), whose label priority
begins `it.title`. For a product-attachment answer, `presenters.py` `_product_attachments` builds
`b.item(prod.get("product_code"), …)` — so `title` is a **bare product code** (`"M2399"`), no
`": "`. `sep === -1` ⇒ `:583` ⇒ `hint = "product_attachment"`. The rest of the observed row matches
the same block exactly: `canonical_code: row.product || raw` → `"M2399"`, `uuid: row.uuid` →
`487dfe36-…`, `ordinal: pos` → `1`.

`HINT_MAP` covers only `promotion|product|order|order_number|customer|form`. Every other domain's
result set — `product_attachment`, `inventory`, `master_products`, `incoming`, `resource_attachment`,
`goods_receive`, `portal_link`, `forms`, `spo_allocation` — renders a bare title and therefore mints
a **domain-named hint** on any positional pick.

### 1.3 The hint field is enum-validated NOWHERE

Established by census, read-only, across `export/**`:

- `grep -rnE "VALID_HINTS|ALLOWED_HINTS|HINT_ENUM|KNOWN_HINTS|hintIsValid"` → **zero hits.** There is
  no whitelist in the parser sub, the spine, or the clone.
- The prompt declares an enum (fork `AI Agent.systemMessage:242`):
  `"hint": "product|promotion|customer|transporter|inbound_shipment|warehouse|attachment|form|order|category|brand|attachment_type"`.
  It is **prose in a prompt**, enforced by nothing. Note `certificate` is not in it either, yet a
  `certificate` hint is what B2′ exists to evict — so off-enum hints are already routine.
- The only *other* hint writers anywhere: fork `:174` (`flyer`, deliberate, own axis), fork `:613`
  (block (B), copies an existing `attachment_type` entity's own hint), and spine
  `compile-current-state:178` / clone `:189`
  `return { ...pe, hint: match.entity_type, canonical_code: match.canonical_code };`.

That last one is load-bearing for understanding the blast radius: **`reconcileEntities` overwrites
the parser hint with the resolver's authoritative `entity_type` — but only when the token
RESOLVED** (`if (match?.entity_type)`, else `return pe; // unresolved → keep parser's guess`).
So a domain-named hint on a *resolving* entity is corrected within one turn and is invisible.
**It only becomes immortal on an entity that never resolves** — which is precisely the population
the did-you-mean flow is made of. That is why this class hid for so long and why it surfaces as a
did-you-mean defect.

### 1.4 THREE independent immortality mechanisms, not one

The request identifies M1. Planning C1 surfaced two more, and **M2 is a defect in B2′ itself** —
approved, tested, and currently built on the fork.

| # | mechanism | site | why `M2399` survives it |
|---|---|---|---|
| **M1** | private `__hint` axis | `_ceAxisFor` fallback `` `__${hint}` `` (fork `:376`) | `__product_attachment` is never in `currentAxes`, so the executor's `keptPrior = prior.filter(e => !currentAxes.has(axisOf(e)))` always retains it |
| **M2** | 🔴 **B2′'s `ordinal` exemption is PERMANENT, not this-turn** | fork `:99` `if (e.ordinal !== undefined) return false;` inside `_ceIsCarried` | `ordinal` is written once and then **persists in session state forever** — `reconcileEntities` spreads `{...pe}`, `compile-current-state` persists `entities: reconciledEntities`. So the entity is classified "not carried" on **every subsequent turn** and B2′'s reconciliation pass can never evict it |
| **M3** | `current` is never pruned | executor `finalEntities = [...current, ...keptPrior]` | partially addressed by B2′ Part 5 (dedupe); not this defect's driver but it is what lets copies accumulate |

**M2 is the finding that matters most for the existing bundle.** B2′ was designed to be immune to
`applyDymPick`'s corruption by deriving "carried" from provenance instead of `current_message` — and
it is. But the `ordinal` escape hatch reintroduces exactly the same failure shape by a different
route: an entity minted **once** by a positional pick is exempt from B2′ eviction **for the rest of
the session**. B2′ would test green on every §CD case and still leave this entity immortal.

---

## 2. C1 — `immortal-hint-axis` · scope `parser` · parser sub

### 2.1 The rule

Replace the private-axis fallback so **no hint can ever get an axis nothing else can collide with.**
In fork `output_exchange`, `_ceAxisFor` (`:373-377`):

```js
const _ceAxisFor = (e, domain) => {
  const hint = String((e && e.hint) || '').toLowerCase();
  const domainMap = AXIS_BY_DOMAIN[domain];
  return (domainMap && domainMap[hint]) || HINT_AXIS_DEFAULT[hint] || `__${hint}`;   // ← C1
};
```

becomes a **two-step** fallback — the domain's own subject axis first, then ONE shared axis:

```js
// C1 — an unrecognised hint must never get a private axis. `__${hint}` produced an island no
// current-turn entity could ever collide with, so the entity was immortal by construction
// (observed: ('M2399','product_attachment') surviving 6 turns, exec 11554793). Two-step fallback:
//   1. the domain's SUBJECT axis — an unrecognised hint under domain D is, in every observed case,
//      the subject of D's own query (a domain-named hint minted by the reference-positions block
//      is literally that), so it belongs on D's primary axis and evicts normally;
//   2. one SHARED axis for anything left — unknown hints collide with each other rather than each
//      getting an island. Never `__${hint}`.
const DOMAIN_SUBJECT_AXIS = {
  product_attachment: 'product_scope', master_products: 'product_scope',
  inventory: 'product_scope', resource_attachment: 'product_scope',
  incoming: 'incoming_scope', promotion: 'promo_scope',
  order: 'order_scope', spo_allocation: 'order_scope',
  goods_receive: 'doc', forms: 'doc', portal_link: 'doc',
};
const _ceAxisFor = (e, domain) => {
  const hint = String((e && e.hint) || '').toLowerCase();
  const domainMap = AXIS_BY_DOMAIN[domain];
  return (domainMap && domainMap[hint])
      || HINT_AXIS_DEFAULT[hint]
      || DOMAIN_SUBJECT_AXIS[domain]
      || 'unscoped_scope';
};
```

Plus two **explicitly known-missing** hints added to `HINT_AXIS_DEFAULT` (belt and braces — they
should never have been reaching the fallback):

```js
inbound_shipment: 'incoming_scope',   // C1: mapped under `incoming` only; fell to __ elsewhere
grn:              'doc',              // C1: sibling of goods_receive/spo, was unmapped
```

And a diagnostic so the residual class is **measurable in production instead of assumed empty** —
emitted only when non-zero, so it is drop-when-absent in the replay `norm()` (LESSONS §40):

```js
if (_ceUnknownHints.length) output.output.unknown_entity_hints = _ceUnknownHints;
```

### 2.2 Why this axis, and what was rejected

- **REJECTED — a single shared `'misc'` axis with no domain step.** It does not fix the reported
  bug. `M2399`'s axis would become `misc`, but `currentAxes` only gains `misc` if *another*
  unrecognised hint arrives that turn — which never happened across all six turns. It would ship a
  fix that is inert on the exact transcript that motivated it. This is the "test green, stay broken"
  shape §CD-7 was opened to catch.
- **REJECTED — deleting the fallback (throw / drop the entity).** Turns a stale-state bug into a
  dead-ended turn. The whole family is fail-open by contract.
- **CHOSEN — domain subject axis, then one shared axis.** Under `product_attachment`, `M2399`'s axis
  becomes `product_scope`; the turn `SRTWT2214 cert` contributes `SRTWT2214/product` →
  `product_scope ∈ currentAxes` → the executor's `keptPrior` filter **evicts it**. Verified against
  the real entity set of exec `11554793`: `M2399` arrives with `current_message: false`, i.e. in
  `prior`, which is the set the filter actually touches.

### 2.3 🔴 C1 does NOT subsume B2′ — it composes, and it makes ONE B2′ line necessary

The change request asks this explicitly. Answer, in three parts:

**(a) C1 does not subsume B2′.** B2′ Part 4 evicts a carried `certificate` when the turn changes
`product_scope`. That is a **semantic** rule the axis mechanism cannot express, because
`certificate` and `product` are deliberately **different axes** (`attachment_scope` vs
`product_scope`) — a certificate legitimately coexists with a product. Axis collision therefore can
never evict a certificate on a product-only turn, no matter what the fallback does. And after B2′
Part 1, `certificate`/`attachment` are **mapped**, so C1's fallback never even sees them.
**B2′ Parts 1, 2, 4 and 5 all remain necessary and unchanged.**

**(b) B2′ should NOT be rewritten or simplified.** It is approved and tested; the whole point of its
Part 3 provenance design is that it stands independent of `current_message`. Rewriting it to lean on
C1 would re-open a closed review for no gain. **Prefer composing** — which is what §2.4 does.

**(c) B2′ needs exactly ONE corrected line, and C1 is what forces it.** M2 (§1.4). Without it, C1
fixes the executor path while B2′'s reconciliation pass keeps a permanent exemption for the very
entity class C1 is evicting — and worse, because C1 now gives `M2399` the axis `product_scope`, the
exempt entity starts counting as a **this-turn product contribution** (`_rcContribProduct = true`),
which would make B2′ evict carried certificates on turns where nothing real changed. **C1 and the
M2 fix must land together or B2′ becomes less correct than it is today.**

### 2.4 The M2 fix — make the `ordinal` exemption THIS-TURN-ONLY (one line + one line)

B2′ already solved this exact problem for did-you-mean picks by **recording** the keys minted this
turn rather than inferring them from a persisted field (`_ceDymPickedKeys`, fork `:95`/`:213`).
Apply the identical, already-reviewed pattern to reference positions:

```js
// near _ceDymPickedKeys (fork :95)
const _ceRefPickedKeys = new Set();

// in the reference-positions block, immediately after `resolved.push({...})` (fork :587)
_ceRefPickedKeys.add(_ceKey({ hint, canonical_code: row.product || raw, raw }));
```

and change `_ceIsCarried` (fork `:99`) from a **persisted-field** test to a **this-turn-record**
test:

```js
-  if (e.ordinal !== undefined) return false;      // reference-position pick = this-turn selection
+  if (_ceRefPickedKeys.has(_ceKey(e))) return false;   // reference-position pick MINTED THIS TURN
```

This preserves the original intent verbatim (a genuine this-turn positional pick is not "carried")
and removes the permanence. It is a strict tightening: nothing that was evictable becomes exempt.

### 2.5 Blast radius

`_ceAxisFor` is read from exactly two places, both inside `output_exchange`: the executor's
`axisOf` (fork `:381`) and B2′'s reconciliation pass. B2′ hoisted the function to module scope
precisely so there is **one** definition — so C1 is a single-site edit that both consumers inherit.

What C1 must not break, checked:

| dependency | effect of C1 | verdict |
|---|---|---|
| **B2′ eviction** (`_RC_INSTANCE_HINTS` = `certificate`, `attachment`) | both are **mapped** by B2′ Part 1 → never reach the fallback | unaffected |
| **Block (B)'s `attachment_type` re-attach** (fork `:613`) | `attachment_type` is in both maps → never reaches the fallback; block (B) copies an existing entity's own hint | unaffected |
| **`dym-transform`'s `requires: ['attachment_type','certificate']`** | reads `gate.compatible_entities[].entity_type` — the **resolver's** type, in the **spine**, not the parser hint | not touched by C1. Indirect only: if C1 evicts a stale scoping entity the gate falls to `probe_skip_reason:'no_scoping_entity'` ⇒ no annotation ⇒ today's offer. That is the designed fail-closed path, not a regression |
| **`DOMAIN_BLOCKED_HINTS`** | blocklist-apply runs after the reconciliation pass and keys on hint strings, not axes | unaffected |
| **Recognised hints** | first two lookups are unchanged and are tried first | byte-identical |

**Residual, stated not hidden:** an unrecognised hint that is *genuinely orthogonal* to its domain's
subject axis would now be evicted when the subject changes. No such hint is known — the entire
observed unrecognised population is domain names minted by `:580`/`:583` plus `inbound_shipment`/`grn`
(both now mapped explicitly). C2 removes the dominant source. The `unknown_entity_hints` diagnostic
exists so this stops being an assumption; §6-IH-V4 reads it from real traffic.

### 2.6 Node/edge diff

**Add 0 nodes, 0 edges. Edit 1 node:** `output_exchange` `jsCode` on `wI5RkNGW3EOJfBdo`.
C1, C2 and the M2 fix **all land in this one node body** — they are one write, not three
(`setNodeParameter /jsCode` is whole-body). **Publish the sub before testing the parent**
(LESSONS §37).

---

## 3. C2 — `no-domain-name-hints` · scope `parser` · parser sub

### 3.1 The rule

A domain name in the entity `hint` field is wrong regardless of C1. Fix it at the writer
(fork `:580`/`:583`), preferring signals that already exist and are already correct:

```js
// C2 — never stamp a DOMAIN name into an ENTITY hint. `domain_hint` was being assigned directly
// (:583) whenever the frozen row's label had no "<type>: " prefix — which is EVERY product-code
// title, i.e. every product_attachment / inventory / master_products / incoming result. The row
// already carries the resolver's authoritative entity_type; prefer it, then the domain's SUBJECT
// entity hint, and only then the legacy tail.
const DOMAIN_SUBJECT_HINT = {
  product_attachment: 'product', master_products: 'product', inventory: 'product',
  incoming: 'product', resource_attachment: 'attachment', portal_link: 'form',
  goods_receive: 'goods_receive', spo_allocation: 'spo', forms: 'form',
  order: 'order', promotion: 'promotion',
};
const KNOWN_ENTITY_HINTS = new Set([
  'product','promotion','customer','transporter','inbound_shipment','warehouse','attachment',
  'form','order','category','brand','attachment_type','certificate','flyer','order_number',
  'customer_order','goods_receive','spo','grn','forms',
]);
const _c2Hint = (candidate, domain) => {
  const h = String(candidate ?? '').trim().toLowerCase();
  if (h && KNOWN_ENTITY_HINTS.has(h)) return h;
  return DOMAIN_SUBJECT_HINT[domain] || 'product';
};
```

applied at both sites, with `row.entity_type` inserted ahead of the domain fallback:

```js
-  hint = HINT_MAP[before] || before || output.output.domain_hint || 'promotion';
+  hint = _c2Hint(HINT_MAP[before] || before || row.entity_type, output.output.domain_hint);
-  hint = output.output.domain_hint || 'promotion';
+  hint = _c2Hint(row.entity_type, output.output.domain_hint);
```

`row.entity_type` is already persisted by `compile-current-state.js:145`
(`entity_type: it.entity_type || null`), so this costs nothing new. It is `null` for
render-envelope answer items (the `M2399` case), which is exactly when `DOMAIN_SUBJECT_HINT`
carries the decision.

### 3.2 Deliberate choices

- **The `'promotion'` legacy tail is dropped, not preserved.** It is itself a latent instance of
  this same defect — a positional pick on an unknown domain became a *promotion* entity. With
  `DOMAIN_SUBJECT_HINT` covering `promotion: 'promotion'`, every real promotion turn keeps its
  hint byte-identical; the tail was only reachable when `domain_hint` was null, where `'product'`
  is the safer subject. **§IH-8 is the no-regression case that proves the promotion path is
  unchanged** — it is not assumed.
- **`KNOWN_ENTITY_HINTS` is a NARROW guard, not a global validator.** It is applied at this one
  writer only. A repo-wide hint validator is a much larger behavioural change and is filed in §10,
  not smuggled in here.
- **C2 does not repair already-poisoned sessions.** `M2399` is *already* in state with
  `hint: product_attachment`; C2 only stops new poisoning. **C1 is what evicts the existing
  poison.** This is the reason the two ship together and the reason §IH-3 seeds a pre-poisoned
  session rather than starting clean.

### 3.3 A second, lower-risk writer — recorded, NOT fixed here

`dymNumberedMultiSelect` (fork `:526-549`) routes through `applyDymPick`, which takes
`hint: _hit.entity_type || _hit.for_hint || …`. `for_hint` originates in `build-suggest-offer`'s
`dym_candidates` as `p.m.entity_type || (_srcEnt && _srcEnt.hint) || null` — so a poisoned parser
hint can reach it, but only after the resolver's `entity_type` has already declined to supply one.
Strictly lower risk than `:583` (which has no `entity_type` preference at all) and it touches the
pick round-trip, which is high-blast-radius. **Filed §10; do not widen C2 into it.**

---

## 4. C3 — `multitoken-d1-annotate` · scope `deterministic` · spine

### 4.1 The compounding, and why the exclusion is no longer an edge case

The multi-token D1 block is unannotated by design (`dym-probe-before-offer-plan.md` §3.4, §8e).
The stated reason: it assigns a **globally contiguous `idx` across sub-lists**, and has-first
sorting would renumber across blocks. With one stuck entity, every turn carries ≥2 missed tokens,
so every turn takes that path and the annotation is **permanently unreachable**. The exclusion is
not a rare edge case; under C1's bug it is the steady state.

**Resolution: annotate without re-sorting.** Numbering never moves. This dissolves the original
objection entirely — the objection was to the *sort*, never to the *suffix*.

### 4.2 The two edits

**Edit 1 — `dym-transform.js:235`, open the gate.** The node ALREADY supports multi-token; it is
allowed on the partial lane and blocked on d1 by one ternary:

```js
-    const _blocks = _isPartialLane ? _survivors : (_survivors.length === 1 ? _survivors : null);
+    // C3: multi-token now allowed on the D1 lane too. The exclusion existed because D1's global
+    // contiguous idx + has-first sorting would renumber across token blocks; C3 annotates WITHOUT
+    // sorting, so the renumbering hazard does not exist. Same posture as the partial lane, which
+    // has shipped multi-token since rev 4.
+    const _blocks = _survivors;
```

`probe_lane` stays `_isPartialLane ? 'partial' : 'd1'`. `probe_skip_reason: 'multi_token'` becomes
unreachable on both lanes — **keep the literal** so a runData search for it distinguishes
"never fired" from "constant removed", and assert its absence in §IH-11.

**Edit 2 — `build-suggest-offer.js:256-269`, suffix the rendered line only.** Inside the existing
`for (const p of s.picks)` loop, the single changed statement:

```js
-      candLines.push(`  ${idx}. ${p.label}`);
+      const _k = _dymNorm(p.m.canonical_code);
+      const _sfx = (_dymOk && _dymProbed.has(_k))
+        ? (_dymHas.has(_k) ? ` - has ${_dymNoun}` : ` - no ${_dymNoun}`)
+        : '';                                    // unprobed ⇒ BARE, never a misleading "no"
+      candLines.push(`  ${idx}. ${p.label}${_sfx}`);
```

`idx += 1` is untouched and still increments exactly once per pick in exactly the same order.
`_dymAnn`/`_dymOk`/`_dymHas`/`_dymProbed`/`_dymNoun` are already defined at `:195-208`, **above**
`_survivors` (`:232`), so they are in scope with no hoisting.

### 4.3 Shipped invariants — each one checked against the actual code

| invariant | multi-token status | why |
|---|---|---|
| `suggest_quick_reply[i] === suggest_last_result_set[i].value` | **does not apply — and this is a correction to the change request** | multi-token sets `out.suggest_quick_reply = [YES, NO]…` (`:278`) — **no codes at all**. Numbers are typed, not buttoned. There is no index correspondence to preserve. The real invariant to assert is that `suggest_quick_reply` is byte-identical to `"Yes escalate,No it's okay"` |
| quick-reply values stay **bare codes** | preserved trivially | it contains no codes; C3 does not touch the line |
| `dym_candidates` pick-linkage (`for_raw`/`for_hint`/`for_canonical`) | **untouched** | the suffix lands on `candLines`, a local array that feeds only `suggest_response`. `out.dym_candidates.push({…})` (`:264-268`) is a separate statement C3 does not modify |
| `suggest_last_result_set[].label` stays BARE | **critical, and preserved** | the suffix is applied to the rendered string, **never to `p.label`**. `out.suggest_last_result_set.push({ idx, label: p.label, … })` (`:260-263`) is unmodified. A numbered pick resolves off `idx`/`value`, both untouched |
| numbering never moves | **preserved by construction** | no sort is introduced; `idx` increments in the same loop in the same order |

### 4.4 The two questions the change request asks

**(a) What happens when the multi-token set spans both enabled domains?**
**It cannot.** A turn carries exactly one `domain_hint`; `dym-transform:163-164` resolves
`cfg = DOMAIN_PROBE[domain]` once, so a single tool is chosen for the whole turn. There is no
per-token domain. The adjacent worry — tokens of **different entity types** within one turn — is
already handled: `category` and `brand` are in `allowed_lookup` but **not in `MAPPABLE`**
(`dym-transform:53-55`), so such candidates are dropped as `droppedOther`, never probed, and render
**bare**. §IH-12 asserts both facts rather than assuming them.

**(b) Is the per-token probe cost acceptable?**
**The premise is wrong, and the correction matters.** There is **no per-token probe.**
`dym-transform` emits **exactly one item** (`return [{ json: … }]`, `:321`) with a single flattened
`dym_probe_entities` array, so `dym-probe` makes **one** sub-call per turn regardless of token
count. The measured ~417 ms is **per lane, per turn** — it does not multiply by 5. Latency is a
non-issue for C3.

**The real cost risk is rows, not calls — see §4.5.**

### 4.5 🔴 C3's actual hazard: silent page truncation. Established read-only, and it is ALREADY SHIPPED

Single-token probes carry ≤3 candidates. Multi-token carries up to **5 tokens × cap3 = 15**
(`dym-transform:146` `d1s.slice(0,5)`, `:150` `cap3`). Three facts, each verified:

1. **No limit is ever set.** `TOOL_DEFAULT_QUERY_PARAMS` (`sorento_crm_mcp/server.py:110-131`) has
   **no entry** for `crm_master_product_attachments_list` or `crm_inventory_stock_balance_list`, and
   `grep -n "limit\|page" sub-get-results-TEST/nodes/entity-ids-transformer.js` returns **nothing** —
   n8n never passes one. So the backend default applies: `app/schemas/common.py:37` `limit: int = 50`.
2. **Truncation is structurally UNDETECTABLE.** The render envelope
   (`presenters.py:806-818`) is `{result_type, intro, items, attachments, action_links,
   last_updated_at, has_result}` plus `_PASSTHROUGH_KEYS` (`:91-103` — `suggested_escalation`,
   `escalate_team`, `escalated_agent`, `fallback_used`, `alternatives`, `relaxed_axis`,
   `field_access`). **No `total`, no `pagination`, no `page`/`limit`.** And even if the CRM added
   one, `output-structurer.js:84-95` forwards only nine keys and would drop it.
3. **The failure mode is a confident false negative.** A candidate whose rows fell off page 1
   returns zero rows ⇒ `- no stock details` / `- no certificate` — asserted about a product that
   has the thing. That is precisely the class this whole feature exists to remove.

Worst case: `inventory` emits one row **per product × per active warehouse** including genuine
zeros (`dym-probe-before-offer-plan.md` §2 F2b), so 15 candidates × ≥4 active warehouses breaches
50. `product_attachment` is additionally scoped by `attachment_type_ids`, so it is tighter, but
15 × 3 attachments-of-type also breaches it.

> 🚩 **This hazard is NOT introduced by C3. It is already live on the PARTIAL lane.**
> `dym-transform:235` already passes all `_survivors` when `_isPartialLane`, and
> `compile-current-state:340` surfaces `missResolutions.slice(0, 5)` with `cap3` — the same 15.
> Shipped at `dym-probe-before-offer` rev 4. C3 extends the exposure to D1; it does not create it.
> **This is a defect in already-promoted code and it is reported here, per §0 of the pipeline
> contract, rather than silently fixed as a rider.**

**Two fail-open mitigations, both in this change, because either alone leaves a hole:**

- **(i) Cap the probed candidates** in `dym-transform`, per domain, with the overflow rendered
  **bare** (existing semantics: absent from `dym_candidate_codes` ⇒ absent from `_dymProbed` ⇒ no
  suffix). Add `probe_cap` to each `DOMAIN_PROBE` entry, seeded from the measured rows-per-candidate
  in §6-IH-V2/V3, and record `dym_capped_codes[]` + `probe_cap_applied: true`.
- **(ii) Saturation detection** in `dym-annotate`: if `answers.length >= _PAGE_SATURATION` (50,
  named as a constant with the `common.py:37` citation), set `ok:false,
  reason:'page_saturated'` ⇒ zero annotation ⇒ today's offer. This is detection-by-proxy and is the
  only defence if the real row count exceeds the cap's assumption.

(i) bounds the common case; (ii) catches a wrong assumption in (i). Both degrade to the shipped
un-annotated offer and neither can dead-end a turn. **§IH-13 exercises (i); §IH-14 exercises (ii)
with a fixture that forces ≥50 rows.**

### 4.6 Node/edge diff

**Add 0 nodes, 0 edges.** **Edit 3 nodes on the clone:** `dym-transform` `jsCode` (gate + cap),
`dym-annotate` `jsCode` (saturation), `build-suggest-offer` `jsCode` (suffix).
⚠️ `dym-transform`/`dym-annotate` are **deployed twice** (`-partial` copies). The plan's own
standing rule is that the two bodies stay byte-identical apart from the two `_PAYLOAD_SRC`/`_XF_SRC`
literals (`dym-annotate.js:12-20`). **The cap and the saturation check must be applied to BOTH
copies**, and §IH-15 is the normalised-diff gate that proves it.

---

## 5. Secondary findings — logged, NOT bundled

- **D1 — `HINT_MAP` is incomplete by 6+ domains** (§1.2). C2 patches the symptom at the fallback.
  A fuller fix is to derive the label prefix from the result set's own `entity_type` at *render*
  time in `compile-current-state`. Own change.
- **D2 — no hint enum validation anywhere** (§1.3). C2 adds a narrow guard at one writer. A
  repo-wide validator (parser output schema check) is a real improvement and a real blast radius.
  Own change, own UAC.
- **D3 — the partial-lane page-truncation defect** (§4.5). Already promoted. Report filed;
  C3 carries the mitigation for both lanes because the code is shared, but the *finding* is
  pre-existing and must be recorded as such in the promote notes.
- **D4 — `dymNumberedMultiSelect` → `applyDymPick` `for_hint` path** (§3.3).
- **D5 — B4-fix** (`applyDymPick:189/190` prior re-flag) remains filed and remains **not** a
  prerequisite; C1/C2/M2 are all independent of it, by the same provenance argument B2′ used.

---

## 6. Verification tasks (planner-defined) — `§6-IH`

Each is a build-time GO/NO-GO, run **read-only before the coder wires anything**. Each must state
its **compared-population count** — an empty checker output is **never** a pass (LESSONS §61b).

- **§6-IH-V1 — the unrecognised-hint population, measured not assumed.** Over the last ~300 clone +
  live-spine executions, extract every `output.entities[].hint` from
  `Call 'sub-query-reformulator'` runData and bucket them against
  `AXIS_BY_DOMAIN[domain] ∪ HINT_AXIS_DEFAULT`. **Print the full distinct set and its count.**
  Confirms the unrecognised population is domain names + `inbound_shipment`/`grn` and nothing
  orthogonal. **A hint that is genuinely orthogonal to its domain's subject axis is a NO-GO for
  C1's `DOMAIN_SUBJECT_AXIS` step** and forces the shared-axis-only variant.
- **§6-IH-V2 — attachment rows per candidate.** Read-only `crm_master_product_attachments_list`
  with 15 known `product_ids` + one `attachment_type_ids`. **Record `answers.length`.** This
  calibrates `probe_cap` for `product_attachment` and establishes whether 15 breaches 50.
- **§6-IH-V3 — inventory rows per candidate + the active-warehouse count.** Same, for
  `crm_inventory_stock_balance_list`. **Record `answers.length` and the distinct warehouse count.**
  Calibrates `probe_cap` for `inventory`. If a 15-candidate probe returns ≥50 rows, that fixture
  **is** §IH-14.
- **§6-IH-V4 — `ordinal` really does persist across turns (the M2 premise).** From a real
  multi-turn execution where a positional pick occurred, read
  `get-session-vars` on the **following** turn and assert an entity carrying `ordinal` is present in
  `previous_conversation_state.entities`. **Fail ⇒ M2 is not real and §2.4 must be withdrawn**, not
  shipped on inference.
- **§6-IH-V5 — the fork↔live delta is still exactly the `resource_attachment` hunk.** Re-run the
  §0.2 diff immediately before any promote. **Print the hunk count.** Any hunk beyond B2′ + the two
  blocklist lines halts the promote.
- **§6-IH-V6 — the `-partial` twins are byte-identical apart from the two lane literals.**
  Normalised diff of `dym-transform` vs `dym-transform-partial` and `dym-annotate` vs
  `dym-annotate-partial`, **before and after** the C3 edit. Non-empty (beyond the literals) ⇒ NO-GO.

---

## 7. Sequencing, and the promote-ordering implications for the ONE bundle

### 7.1 Build order

1. **C1 + C2 + the M2 fix — one `output_exchange` write on the fork `wI5RkNGW3EOJfBdo`.** They are
   the same node body; splitting them into three writes buys nothing and risks three publishes.
   **Publish the sub before testing the parent** (LESSONS §37).
2. **C3 — three `jsCode` writes on the clone** (plus the two `-partial` twins), one atomic
   `update_workflow` call (LESSONS §33), then publish, then re-export.

C3 is spine-only and does not depend on C1/C2 **mechanically** — but see §7.2, it depends on them
**for its own test fixture**.

### 7.2 🔴 A sequencing trap: C1/C2 destroy C3's motivating fixture

Once C1/C2 land, the stuck `M2399` is evicted — so the reported six-turn transcript **collapses back
to a single missed token** and stops exercising the multi-token path entirely. A C3 case built from
that transcript would pass without ever running the code C3 changes.

**Binding: §IH-11..§IH-15 must use a fixture that is GENUINELY multi-token** — two real product
codes the user typed in one message, both missing, e.g. `srtwc8317-rl1 and srtub2232-1600 cert`.
Not a stuck-entity artefact. This is the discriminator-shape requirement (§IH-FP), not a
convenience.

### 7.3 Promote ordering inside the user's single bundle

The user is bundling **dym-probe-before-offer + B1 + B2′ + C1 + C2 + C3** into ONE promote.
Ordering is forced by two independent constraints:

1. **LESSONS §37 — a parent resolves only the PUBLISHED version of a sub.** So **every parser hunk
   (B2′ + C1 + C2 + M2) publishes to live `XTODTw` BEFORE the spine publishes.** A spine published
   first would run against the old parser for the window between publishes.
2. **LESSONS §57 — build the live target as LIVE + own hunks, by node NAME.** The fork is stale
   (§0.2). `oe-patch.py` re-applies the hunks to a fresh live body. **Never block-copy the fork.**

Resulting order, each step hash-gated (LESSONS §58's protocol: pre-check draft==active → update
draft → re-fetch → byte-gate → publish only on match → re-fetch active==file):

| # | target | hunks |
|---|---|---|
| 1 | live parser `XTODTw-dJcV0uRdC056hG` | B2′ (parts 1–5) + **C1** + **C2** + **M2** — one node, `output_exchange` |
| 2 | live spine `9qVyfUxmRQqrpGRMDLRuz` | B1 (`disallowed-entity-gate`) + dym-probe-before-offer (4 new nodes + rewire) + **C3** (`dym-transform`×2, `dym-annotate`×2, `build-suggest-offer`) |

**Three ordering hazards specific to this bundle:**

- **B1 ↑ increases exposure to the very path C3 annotates.** B1 routes affected customers into a
  did-you-mean; if their message named two products, that is a multi-token D1. So **C3 raises B1's
  value and B1 raises C3's traffic** — they belong in the same promote, which is what the user
  intends.
- **`disallowed-entity-gate` is co-edited by B1 and by Change A** (`multi-company-resolution-plan.md`).
  `carried-certificate-dump-plan.md` §7 already forbids co-editing that node in one op batch.
  **C3 does not touch it**, so C3 adds no new conflict there.
- **`build-suggest-offer` is co-edited by dym-probe-before-offer and C3.** Both are in this bundle.
  **Land the dym hunks first, then re-derive C3's line numbers against the result** — the multi-token
  block's line numbers move when the four dym-probe nodes' reader block is inserted above it.

### 7.4 Rollback

- Parser: `publish_workflow` the prior live `XTODTw` versionId — **capture it before the first
  edit.** Fork rollback = prior fork versionId `95193323`.
- Spine: `publish_workflow` the prior live spine versionId (`f9205b03` at plan time).
- Clone: `publish_workflow` `5fdd12df`.
- Re-run `export-workflows.py` after any of them.

---

## 8. Acceptance criteria

All asserted **at the customer boundary** (`save-session-vars.user_response` / the sendmsg egress
payload), **in addition to** the producing node's object — never the producer alone (LESSONS §63i;
170 green producer assertions once coexisted with bare customer text).

1. **C1.** Seeded with a session carrying `{"raw":"M2399","hint":"product_attachment","ordinal":1,
   "uuid":"487dfe36-…","canonical_code":"M2399"}`, a turn naming any product evicts it:
   `output_exchange` output entities contain **no** `product_attachment`-hinted entity, and the
   customer-visible reply names **no** `M2399`.
2. **C1.** No entity in `output_exchange`'s output carries an axis matching `/^__/` — asserted by
   recomputing `_ceAxisFor` over the output set. This is the class assertion, not the instance one.
3. **C2.** On a positional pick over a `product_attachment` result set, the minted entity's `hint`
   is `product` (never `product_attachment`), and `_parser_raw` is unchanged — proving the fix is in
   the code path, not in prompt behaviour.
4. **C2 no-regression.** A positional pick on a **promotion** result set still mints
   `hint: 'promotion'`, byte-identical to today.
5. **M2.** On the turn AFTER a positional pick, the picked entity is classified **carried**
   (`_ceIsCarried === true`) and is evictable. Asserted by seeding a session containing an
   `ordinal`-bearing entity and showing B2′'s pass now reaches it.
6. **C3.** A genuinely multi-token D1 offer in an enabled domain renders `- has <noun>` /
   `- no <noun>` on every **probed** code, **bare** on every unprobed one, with
   `suggest_response` line numbers **identical** to the un-annotated render
   (assert the numbering by stripping suffixes and diffing against the pre-change string).
7. **C3 invariants.** `suggest_quick_reply === "Yes escalate,No it's okay"` byte-identical;
   `suggest_last_result_set[].label` bare; `dym_candidates[].for_raw`/`for_hint`/`for_canonical`
   byte-identical to the pre-change run.
8. **C3 fail-open.** Probe error / empty / unscoped / capped / **page-saturated** ⇒ byte-identical
   to today's un-annotated multi-token offer; the turn never dead-ends.
9. **C3 scope.** Non-enabled domains, single-token modes and D2 are **byte-identical to today**.
10. Every §IH assertion has been **shown to fail on purpose** under §0 **S9**'s three-part mutation
    procedure, using **discriminator shapes** (§IH-FP), not convenient turns.
11. **§0 S1–S9 hold on every case.**

---

## 9. Fixture and session-state discipline (binding)

**At least one fixture per change carries realistic prior session state.** All three findings behind
this plan came from *outside* the node under test, and every dym test to date ran on a clean session
— which is precisely why the defect shipped.

- **C1 → §IH-3** seeds the **pre-poisoned** session (an `ordinal`-bearing,
  `product_attachment`-hinted entity). Clean-session C1 cases cannot reproduce the bug at all.
- **C2 → §IH-6** runs a real two-turn sequence (answer a `product_attachment` query, then pick a
  position) so the poisoning is *created* by the code under test, not injected.
- **C3 → §IH-11** seeds nothing but requires a genuinely multi-token utterance (§7.2).
- Seeding uses the **`sim-inject` lane** (`carried-certificate-dump-plan.md` §4.1):
  `previous_conversation_state` on the redis item →
  `if-message-is-audio[1] → sim-inject-gate[0] → sim-inject-session → get-session-vars`.
  Mode-independent; bypasses the prod session read entirely.
- Cases needing a **clean** session omit that key **and** reset the `respond_contacts_test` row
  (LESSONS §31; memory `uac-mode-reads-prod-session` — `437264483`'s prod session is
  stale-contaminated and `uac` mode reads it, which has silently produced wrong-question answers
  twice). Parser-tier cases run **`mode=regress-capture`**.

---

## 10. Out of scope / filed separately

- **D2 — a repo-wide entity-hint schema validator** on parser output. Real improvement, real blast
  radius, own change.
- **D1 — deriving the reference-position label prefix from the result set's `entity_type`** at
  render time in `compile-current-state`, which would remove the `HINT_MAP` gap at source.
- **D4 — `applyDymPick`'s `for_hint` acceptance path** (§3.3).
- **D5 — B4-fix** (`applyDymPick` prior re-flag), unchanged from
  `carried-certificate-dump-plan.md` §5.1d.
- **Setting an explicit `limit` in `TOOL_DEFAULT_QUERY_PARAMS`** for the two probe tools, and
  **adding `total`/`has_more` to the render envelope** so truncation becomes detectable rather than
  merely avoidable. Both CRM-side; `/Users/tehjayson/Documents/foundryx/sorento_crm` is read-only
  from here. **Spec only** — and the better long-term end state than C3's cap.
- **Annotating D1 numbered mode and D2**, unchanged from `dym-probe-before-offer-plan.md` §3.4.
- **`tests/UAC.md` reconciliation** — either re-derive the monolith from the split files (reversing
  `split-uac.py`) or formally retire it. Until then, **do not run the script** (§0.3).
</content>
