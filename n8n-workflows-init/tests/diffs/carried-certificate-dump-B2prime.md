# Node diff — `carried-certificate-dump` **B2′** (`certificate-eviction`, plan §3.6)

| | |
|---|---|
| change id | `carried-certificate-dump-B2prime` |
| scope tag | **`parser`** (mock-blind — `mock_reformulator_output` feeds a branch that skips `output_exchange` entirely, LESSONS §28) |
| build target | parser fork **`wI5RkNGW3EOJfBdo`** (`sub-semantic-parser FORK domain-continuity-carry`) — the sub the clone actually calls |
| **rollback versionId** | **`c9f6e280-e686-4bbb-a5ab-42615b63e997`** (captured BEFORE the first write, plan §9) |
| **new versionId** | **`95193323-e6cd-462a-9a91-aea08457b46c`** — `versionId == activeVersionId`, published |
| nodes added / removed / rewired | **0 / 0 / 0** |
| nodes edited | **1** — `output_exchange` `jsCode`, sha `710e577a1652…` → `a773fff4a7c8…`, 867 → 978 lines |
| clone `txiPzSxy3Pclsz6v` | **UNTOUCHED** — still `2d1627c8-7e49-4cc4-951a-38af549fd3ca` (B1) |
| live spine / live parser | **UNTOUCHED** — `f9205b03` / `8a813ddc` |

Export `--verify` green before the first read (live spine `f9205b03`, clone `2d1627c8`,
`sub-semantic-parser` `8a813ddc`, `sub-get-results` `61b65e5f`, `sub-get-results-TEST` `da0644da`,
`sub-sendmsg` `c712e218`, `sorento-dispatcher` `32315a54`).

---

## 0. What was NOT built, and why

**B2 as specified in plan §3.1/§3.2 was not implemented.** §3.0 rules it NO-GO and §3.6 replaces it. In
particular the plan's original eviction (`keptPrior = prior.filter(...)` at `:409`) is left byte-identical
— it is bypassed by five separate writers and adding axis entries to it fixes nothing on the modal turn.
Also **not** built here, per the task: B3, B4-fix, C1–C3, anything from `multi-company-resolution-plan.md`.

## 1. Prerequisite findings (before any write)

1. **The clone calls the FORK, confirmed from the clone JSON, not from prose.**
   `Call 'sub-query-reformulator'`.`workflowId.value` = `wI5RkNGW3EOJfBdo`
   (`cachedResultName: "sub-semantic-parser FORK domain-continuity-carry"`).
   **`CLAUDE.md`'s prose is wrong** ("the clone calls the live published sub `XTODTw` … there is no wired
   fork to shield it"); its **ID table is right**. Parser edits ARE shielded. Worth correcting in
   `CLAUDE.md` when this lands.
2. **The fork is stale vs live by exactly the two lines plan §3.4 predicted**, re-measured today against
   `export/sub-semantic-parser/nodes/output_exchange.js` (`--verify` green at `8a813ddc`):
   `DOMAIN_BLOCKED_HINTS.order` and `.incoming` — live has `'resource_attachment'`, the fork does not.
   The stale hunk is ~250 lines below every hunk B2′ touches, but it is in the same node.
   🔴 **Promote target must be LIVE + these hunks, never a block-copy of the fork** (LESSONS §57).
   `scripts/…/patch_b2prime.py` (see §6) takes `--src/--out`, so the same four hunks can be re-applied to
   a fresh live body at promote time; its anchors are **asserted, not assumed**, so it aborts loudly if
   live has drifted.
3. **Fork had no unpublished draft** before the write (`versionId == activeVersionId == c9f6e280`), so
   nothing else rode along on the publish (LESSONS §24/§51).
4. **Clone containment prereqs re-asserted from the clone JSON:** its only trigger is
   `When Executed by Another Workflow` (`executeWorkflowTrigger`) — there is no Schedule Trigger and no
   `respondioTrigger`, so the "disable the Schedule Trigger before editing" precondition is satisfied
   vacuously. Recorded because it is a standing gate, not because it was at risk.
5. **No UAC executions were run and nothing was promoted** (tester's job / user-gated).

---

## 2. The four hunks

All four are inside `output_exchange` on `wI5RkNGW3EOJfBdo`. Nothing else in the node moved:
`diff` before→after shows **only** the hoist (§2.2) as a removal; everything else is pure insertion.

### Hunk A — part 3: carried-entity **provenance** (inserted after the `_parser_raw_snapshot` IIFE, `:78`)

```js
const _ceNorm = (v) => String(v ?? '').trim().toLowerCase();
const _ceKey  = (e) => _ceNorm(e && e.hint) + '|' + _ceNorm((e && (e.canonical_code || e.raw)) || '');
const _cePriorKeys = new Set(( … previous_conversation_state.entities … ).map(_ceKey));
const _ceLlmKeys   = new Set(( … _parser_raw_snapshot.entities   … ).map(_ceKey));
const _ceDymPickedKeys = new Set();
const _ceIsCarried = (e) => {
  if (!e) return false;
  if (e.ordinal !== undefined) return false;      // reference-position pick = this-turn selection
  const _k = _ceKey(e);
  if (_ceDymPickedKeys.has(_k)) return false;     // did-you-mean pick = this-turn selection
  return _cePriorKeys.has(_k) && !_ceLlmKeys.has(_k);
};
```

**Before:** nothing derived provenance; every consumer read `current_message`.
**After:** "carried" = *in prior state AND not emitted by the LLM this turn*, computed from
`_parser_raw_snapshot` — the frozen raw LLM object captured before any mutation. `current_message` is
**never read** by any B2′ code path.

Why: on parser exec `11509876` **all seven** carried entities arrived `current_message: true` (the
certificate five times). Writers W4 (`applyDymPick:189/:190`) and W7 (block (B), `:581`) both re-flag
carried entities. Anything standing on that flag is standing on a known-broken signal.

Two provenance sources beyond `_parser_raw_snapshot`, both deliberate:
- `_ceDymPickedKeys` — populated by Hunk B. A did-you-mean pick is a genuine this-turn *choice* by the
  customer even though the LLM may emit nothing. Recorded rather than inferred, so a picked code that
  happens to collide with a prior entity key still counts as a contribution. It is a **local variable**:
  no new output key, no replay-diff noise.
- `e.ordinal !== undefined` — the reference-positions block (`:553`) mints entities from
  `last_result_set` with an `ordinal`; those are this-turn selections too.

### Hunk B — part 3 (cont.): record dym picks (inside `applyDymPick`, after the `dym_slot` stamp)

```js
  _ceDymPickedKeys.add(_ceKey(_picked));   // B2' part 3: a did-you-mean pick IS a this-turn choice
```

One added line. `applyDymPick`'s behaviour is otherwise **byte-identical** — in particular the
`_prior.map(e => ({...e, current_message: true}))` re-flag at `:189/:190` is **left alone**. That is B4,
it is load-bearing today (§5.1d), and it is explicitly out of scope.

### Hunk C — part 1 + a hoist: the axis map

The axis maps and `axisOf` were **hoisted out of the executor `if`** to module scope, and `axisOf`
re-expressed as `const axisOf = (e) => _ceAxisFor(e, domain);`. This is a pure refactor — one definition
now serves both the executor and the reconciliation pass, instead of two copies drifting apart. The
executor's `const domain = output.output.domain_hint;` and everything below it is untouched.

Two map entries added (plan §3.1 verbatim):

```js
  product_attachment: {
    …
    attachment_type: 'attachment_scope',
+   certificate:     'attachment_scope',   // was `__certificate` -> never evicted (exec 11509873)
+   attachment:      'attachment_scope',
  },
  const HINT_AXIS_DEFAULT = {
    …
+   certificate: 'attachment_scope', attachment: 'attachment_scope',
  };
```

### Hunk D — parts 2, 4, 5: the post-merge reconciliation pass

**Position (part 2):** immediately **before** the blocklist-apply `if` at `:656`, i.e. after block (B)
(`:584`), after the two domain-continuity carries and after the `#6` `_switchDomain` override.

That is downstream of **every** entity-set writer — `tryDymPick` (`:243`), the op executor (`:311-420`),
`dymNumberedMultiSelect` (`:517`), the reference-positions block (`:566`) and block (B) (`:584`) — each
of which is a documented bypass of the `:409` filter. Everything after the pass either only *removes*
entities (blocklist-apply, the `casual` wipe, the member-pick `entities = []`) or rewrites `raw` in place
(the attachment_type i18n normalize); nothing adds a carried entity back.

Choosing the **late end** of the plan's stated window (`after :584`, `before :656`) rather than the early
end is deliberate and load-bearing: `_ceAxisFor` is **domain-dependent**, and `domain_hint` is not final
until the `#6` switch at `:650-654`. Running the pass at `:585` would classify entities against a
possibly-stale domain. It also leaves the two carry blocks (`:628-645`) reading exactly the set they read
today — zero behaviour change there.

```js
if (output.output && !output.output.is_menu_label && Array.isArray(output.output.entities)) {
  const _RC_INSTANCE_HINTS = new Set(['certificate', 'attachment']);
  let _rcContribAttach = false, _rcContribProduct = false;
  for (const e of _rcEnts) {
    if (_ceIsCarried(e)) continue;
    const _ax = _ceAxisFor(e, _rcDomain);
    if (_ax === 'attachment_scope') _rcContribAttach = true;
    if (_ax === 'product_scope')    _rcContribProduct = true;
  }
  const _rcEvict = _rcContribAttach || _rcContribProduct;          // ← part 4, widened trigger
  if (_rcEvict) _rcKept = _rcEnts.filter(e => !( _ceIsCarried(e)
        && _ceAxisFor(e, _rcDomain) === 'attachment_scope'
        && _RC_INSTANCE_HINTS.has(_ceNorm(e && e.hint)) ));
  … dedupe by _ceKey and by (hint|uuid), backfilling uuid/canonical_code onto the retained twin …
  if (_rcDropped.length) output.output.carried_attachment_evicted = _rcDropped;
  if (_rcDupes > 0)      output.output.entities_deduped = _rcDupes;
}
```

**Two new output keys, both emitted only when non-zero** — so they are drop-when-absent in the replay
`norm()` (LESSONS §40) rather than diffing on all ~2.2k golden turns.

---

## 3. 🔴 Deviation from §3.6 part 4 — read this one

**§3.6 part 4 as written says: "Drop every carried entity on the `attachment_scope` axis (`certificate`,
`attachment`, `attachment_type`)". Implemented literally, that is a regression.** I narrowed the *dropped*
set to `certificate` + `attachment` and left `attachment_type` alone. The trigger is unchanged (still
"contributes an attachment_scope entity **or** any product_scope entity").

Reasoning:
- `certificate` / `attachment` are **instance**-level: a specific certificate number, a specific file.
  They are narrowing filters bound to the product they were resolved against, so they are stale by
  construction the moment product scope changes. That is the whole §3.0 argument.
- `attachment_type` (certificate / photo / drawing) is a **type** filter. Carrying it across a product
  change is correct and is an existing deliberate feature — it is exactly what block (B) exists to do,
  and the axis map's own comment says "type is its own axis (coexists with product)".

Two concrete breakages the literal reading would cause, both on the §CD-11 negative control
(`cert PC000078` → `and MWC7601?`):
1. the turn would lose the "certificate" narrowing and return *all* attachments for MWC7601 —
   the customer asked about certificates;
2. `dym-transform`'s product_attachment probe declares
   `requires: ['attachment_type', 'certificate']` — "≥1 UUID-shaped scoping entity or we do not probe".
   Evicting **both** on a bare-product follow-up leaves zero scoping entities, so the probe-before-offer
   gate silently stops probing on precisely that shape.

Fixture `FP8-D` asserts both halves (`noHint: ['certificate']`, `hasHint: ['attachment_type']`).

---

## 4. How the eviction survives `tryDymPick` and `dymNumberedMultiSelect`

Three independent properties, each with its own mutation gate:

| bypass | mechanism | what defeats it | proven by |
|---|---|---|---|
| `tryDymPick` (`:243`, **before** the executor) promotes every carried entity into `current`, which `:412` spreads unfiltered — the axis map is never consulted | position + provenance | the pass runs **after** the executor, and asks provenance, not `current_message` | `CD-11a`, `CD-11a2` (RED on the pre-fix body, green after) |
| `dymNumberedMultiSelect` (`:517`, **after** the executor) does `output.output.entities = _base`, discarding the executor's output wholesale | **position only** | the pass sits below `:517` | `CD-11b` + **`CD-FP-6`**: moving the pass above `:493` turns `CD-11b` RED while `CD-11a` stays green — that asymmetry is the proof, a single green `CD-11` cannot distinguish placement |
| B4: the promoted entities all carry `current_message: true`, so any flag-based test sees them as this-turn | **provenance only** | `_ceIsCarried` never reads the flag | **`CD-FP-7`**: swapping `_ceIsCarried`'s body for `e.current_message !== true` turns `CD-11a/11a2/11b/7c2` RED while `CD-5` stays green |

The fixtures carry the B4 corruption **verbatim from exec `11509876`** (`current_message: true` on all
carried rows, `dym_slot: "11400339"` on the carried product), so `CD-FP-7` is a real discrimination and
not a synthetic one.

## 5. What part 4 changed

Part 4 is the `|| _rcContribProduct` half. Without it, a turn that changes only the **product** does not
evict the carried certificate, and the customer gets `product_ids ∧ certificate_ids = ∅` rendered as a
confident *"No certificate for X"* for a product that has one (F-CARRY-NARROW; measured on
`SRTWT2214`, whose real certificate is `PC 000373`, `Validity: Valid`).

It is load-bearing on two shapes: the bare-product follow-up (§3.2 row 2, which §3.0 rules a design
error) and — the modal one — the **code reply to B1's did-you-mean**, where the only thing the turn
contributes is the picked product.

🔴 **§CD-FP-8's stated expectation is partly blind, measured.** CD.md says removing the `product_scope`
half should turn **§CD-10b** RED. It does not: §CD-10b's turn (`SRTWT2214 cert`) also contributes an
`attachment_scope` entity (`cert`), so the `attachment_scope` half alone still evicts. Measured
red-set for that mutation is `CD-11a CD-11a2 CD-11b CD-7c2 FP8-D` — the **bare-product** shape
(`and MWC7601?`, listed in CD.md only as §CD-11's negative control) is the discriminator. Fixture
`FP8-D` exists for this. §CD-10b remains valuable as the customer-visible acceptance; it is just not the
FP-8 instrument.

---

## 6. Offline evidence — and it is **not** blind (shown, not asserted)

`tests/offline/carried-certificate-dump/` (new files prefixed `oe-`; B1's `gate.*` files untouched):

| file | what |
|---|---|
| `oe.before.js` | fork `output_exchange` @ `c9f6e280` (sha `710e577a1652…`) — pulled by REST, byte-exact |
| `oe.after.js` | the published body @ `95193323` (sha `a773fff4a7c8…`) — the SAME bytes that were PUT |
| `oe-cases.js` | 15 fixtures; the seeded state is exec `11509876`'s verbatim, B4 flags included |
| `oe-run.js` | runs a real body with `$`/`$json` mocked — no n8n, no network |
| `oe-probe.js` | the assertions; prints the compared-population count |
| `oe-byte-identity.js` | non-interference across all 15 fixtures, whole returned object |
| `oe-mutate.sh` | §0 S9 mutation suite |

Results:

```
oe-probe.js oe.before.js   RED   8/11    ← the defect reproduces on the unmodified fork
oe-probe.js oe.after.js    GREEN 11/11
oe-byte-identity.js        identical 7 / changed 8, 0 UNEXPECTED
```

**Every assertion is shown to fail on purpose.** `oe-mutate.sh` enforces §0 S9 (occurrence count `N>0`
**and** digest change, else it aborts without running) *and* goes further: each step declares the **exact
set of fixtures** it expects to redden and fails on any mismatch — "the suite went red somewhere" is not
evidence that the assertion *named* for that mutation is the instrument (LESSONS §63, wrong-object
assertions). Measured:

| mutation | expected RED | observed RED | |
|---|---|---|---|
| `CD-FP-4a` drop `certificate` from `AXIS_BY_DOMAIN` only | *(none — non-instrument)* | none | ✅ |
| `CD-FP-4b` drop it from `HINT_AXIS_DEFAULT` only | *(none — non-instrument)* | none | ✅ |
| `CD-FP-4c` drop it from **both** | 7 fixtures | `CD-10b CD-11a CD-11a2 CD-11b CD-5 CD-7c2 FP8-D` | ✅ |
| `CD-FP-6` move the pass above `dymNumberedMultiSelect` | `CD-11b` only | `CD-11b` | ✅ |
| `CD-FP-7` `_ceIsCarried` → the `current_message` flag | `CD-11a CD-11a2 CD-11b CD-7c2` | same | ✅ |
| `CD-FP-8` drop the `product_scope` half | `CD-11a CD-11a2 CD-11b CD-7c2 FP8-D` | same | ✅ |
| `CD-FP-9` disable the dedupe | `CD-7c CD-7c2` | same | ✅ |
| `CD-FP-0` negative control (string absent) | **ABORT, suite not run** | ABORT | ✅ |

📌 **`CD-FP-4a`/`4b` are recorded as non-instruments on purpose.** CD.md §CD-FP-4 prescribes removing the
`AXIS_BY_DOMAIN` entry "and then from both"; the first step is inert because `HINT_AXIS_DEFAULT` shadows
it (and vice-versa) for a `product_attachment` turn. Only the both-maps mutation is a gate. That is the
§CD-BLIND pattern again, and it is stated rather than left to be re-discovered.

**Was my first harness blind?** Partly, and here is the disclosure. Two blind spots, both found by
running the mutations rather than by reading:
1. My first `CD-7c` fixture (`certification with number PC000078` over the five-cert state) could not test
   the dedupe at all: part 1's axis entries evict all five prior certificates at the **executor**, so only
   one reaches the pass. It reported a `uuid` failure that had nothing to do with the dedupe. Replaced
   with a `reuse`-turn fixture (nothing contributed ⇒ nothing evicted ⇒ dedupe is the only variable) plus
   `CD-7c2` on a dym-pick turn, which is the shape that actually *generates* the accumulation.
2. `CD-FP-4b` as first written expected a red set and got none, because the two axis maps shadow each
   other. Split into 4a/4b/4c rather than quietly re-aimed.

**What this harness does NOT cover** — it is coder-side and has no customer boundary in it. Per LESSONS
§63 rule (i) every rendered-text assertion still has to be made in the real run on
`save-session-vars.user_response` / the sendmsg payload. §CD-5, §CD-10b and §CD-11 are `parser` tier:
real reformulator, multi-turn, mock-blind.

## 7. Downstream re-sourcing check (LESSONS §63, all three forms)

Scanned every export'd node body for `$('Call \'sub-query-reformulator\'')`, `$("Call …")` and the
two-hop bind-then-read form. 12 readers on the clone, 10 on live. Assessed against B2′'s output delta
(a possibly-smaller `entities`, plus two new optional keys):

| reader | consumes | verdict |
|---|---|---|
| `disallowed-entity-gate` | `parser.entities` → `compatible_entities` | **intended** — the evicted certificate stops reaching `entity-ids-transformer`, which is acceptance §8.2 / §CD-10b |
| `compile-current-state` | `qf.entities` → persisted state | **intended** — the eviction is what stops the certificate being immortal |
| `dym-transform` / `dym-transform-partial` | `requires: ['attachment_type','certificate']` via `gate.compatible_entities` | **safe, and the reason for §3 above** — the carried `attachment_type` is retained, so the probe gate keeps its scoping entity |
| `build-suggest-offer:403`, `dym-transform:143` | `q.entities[0].raw` — **positional** | behaviour-relevant: both are the `askedCode` / token fallback used only when `compatible_entities` is empty. Evicting a carried certificate can only move a *product* into slot 0, which is the correct label for "No {noun} for {code}". Called out because it is a positional read, not because it is a defect |
| `crossdomain-zeroset:9` | two-hop `$("Call 'sub-query-reformulator'")` → `qf.domain_hint`, `qf.message_type` | unaffected (no entity read) |
| `not-found-error-message`, `escalate-catalog`, `access-level-choice-message`, `validator`, `construct-user-prompt` | domain/intent/message_type, or the whole object spread | unaffected |

Nobody reads `carried_attachment_evicted` or `entities_deduped` — they are diagnostics only.

## 8. Residuals and known limits (nothing hidden)

1. **`product_scope` is domain-relative, by the plan's literal wording.** `AXIS_BY_DOMAIN` maps `product`
   to `promo_scope` under `promotion`, `order_scope` under `order`, `incoming_scope` under `incoming`. So
   part 4's product half fires under `product_attachment` / `master_products` / the default map, and
   **not** under those three. `certificate` is in **no** `DOMAIN_BLOCKED_HINTS` list, so a carried
   certificate can still ride into an `order`/`incoming` turn. It is inert there (those tools have no
   `certificate_ids` narrowing), so I implemented the literal reading rather than widening the blast
   radius — but it is a real residual and a reviewer may reasonably ask for the wider form.
2. **Plan §8.6 "every other domain byte-identical" is not literally true of B2′**, and
   `oe-byte-identity.js` says so in its header rather than asserting something false: part 5 (dedupe) is
   domain-independent, so any turn carrying a duplicate entity key changes in every domain. The invariant
   actually asserted is: *a turn with no carried instance-attachment entity and no duplicate entity key is
   byte-identical* — 7/15 fixtures identical, 8/15 changed, **0 unexpected**.
3. **§CD-11's two-turn recipe is likely vacuous as written** (tester-facing). Turn 1 is
   `srtwc8317-rl1 cert` under B2′ — which already evicts the certificate — so turn 2's prior state has
   nothing left to carry and the case degenerates into §CD-5. To keep §CD-11 discriminating, **turn 2 must
   be `sim-inject`-seeded directly** with the certificate still present *plus* a `dym_offer` /
   `dym_last_result_set`. `oe-cases.js` `CD-11a/11a2/11b` are built that way and can be lifted as the seed
   shape.
4. **B4 is untouched and still red.** §CD-7a should be recorded as a known-open finding, not a blocker —
   `CD-FP-7` is the evidence that B2′ is immune rather than merely untested against it.
5. `validate_workflow` **cannot be run against a workflow id on this MCP surface** — it validates n8n SDK
   *source code* only (consistent with LESSONS §32's "classic-server features are NOT on this surface").
   Substituted, and all green: `node --check` on the exact published body; a REST GET→PUT→GET round-trip
   with a **byte gate** on `output_exchange` (draft *and* `activeVersion`); connections byte-identical;
   node-name set identical; `output_exchange` the **only** node whose `parameters` changed; both
   credentials intact (`OpenAI Chat Model` `openAiApi`, `Postgres Chat Memory` `postgres`).

## 9. Rollback

```
publish_workflow wI5RkNGW3EOJfBdo c9f6e280-e686-4bbb-a5ab-42615b63e997
```
then re-run `export-workflows.py`. Manifests: `tests/manifests/carried-certificate-dump/`
`rev0-fork-c9f6e280.MANIFEST.json` (baseline) and `rev2-fork-95193323.MANIFEST.json` (this rev).
The fork is **not** in the export set (`export/sub-semantic-parser` tracks live `XTODTw`), so
`--verify` says nothing about it — these two manifests are the only staleness handle it has.
