# Change B: `carried-certificate-dump` — a carried certificate silently re-scopes a fresh product question

**Two sub-changes, deliberately NOT bundled (LESSONS §51), each with exactly one scope tag:**

| id | what | where | scope tag |
|---|---|---|---|
| **B1** | `attachment-subject-gate` — dead-end the turn when the named product token missed | spine `disallowed-entity-gate` | **`deterministic`** |
| **B2** | `certificate-axis-carry` — give `certificate` an eviction axis so it stops being immortal | parser sub `output_exchange` | **`parser`** |

**Build targets:** B1 → clone `txiPzSxy3Pclsz6v`. B2 → parser fork **`wI5RkNGW3EOJfBdo`**
(`sub-semantic-parser FORK domain-continuity-carry`, the sub the clone actually calls). Promotion of
either is user-gated and out of scope. B2's promote target is the **live** sub `XTODTw-dJcV0uRdC056hG`.
**UAC family: `§CD`** (`tests/uac/CD.md`).
**CRM half is SPEC ONLY** — `/Users/tehjayson/Documents/foundryx/sorento_crm` is read-only from here.

Export baseline, `--verify` green 2026-08-07: live spine `f9205b03`, clone `3a196c44`,
`sub-semantic-parser` `8a813ddc`, `sub-get-results` `61b65e5f`, `sub-get-results-TEST` `da0644da`.

---

## 1. The incident — REPRODUCED AND EXPLAINED (do not re-derive)

User typed `srtwc8317-rl1 cert` and received **26 unrelated products' expired certificates plus an
attached PDF**, then a did-you-mean list. Every row: file `WCM PC 000078 - EXP 13 SEP 2025.pdf`,
`Certificate Number: PC 000078`, `Validity: Expired`; products `SRTWT5815`, `BRHSD213C`, `CB 8113A`,
`CSK14B-NL`, … — none related to the query.

### 1.1 The executions

| | |
|---|---|
| spine exec (the bad turn) | **`11509873`** on the clone `txiPzSxy3Pclsz6v`, 2026-08-07T01:20:46Z, `success` |
| parser sub | `11509876` (`wI5RkNGW3EOJfBdo`) |
| get-results sub | **`11509892`** (`rysSPgUssLDf6xJc`) |
| **control — identical text, 48 s later, after `hi` cleared state** | **`11509954`** → correct did-you-mean |

Found via `n8n_test.chat_histories` (`WHERE message ILIKE '%srtwc8317%'`) to get an exact timestamp, then
one windowed `search_executions`. Paging 100k+ executions for message text is not viable; the DB shortcut
is the right instrument and is worth keeping.

### 1.2 🚩 The earlier framing was wrong — correct it before reading on

The change request's first reading, *"an unscoped read"*, is **not** what happened, and neither is the
follow-up guess that the narrowing filter was missing. **The narrowing filter was satisfied — by the
wrong narrower.**

`entity-ids-transformer` OUTPUT, exec `11509892`, verbatim:

```json
{"attachment_type_ids":["1439736c-20ca-4bba-b387-b242ff4a4599"],
 "certificate_ids":["aa10fd73-96bf-4418-91c3-7780a36305fe"],
 "_diagnostics":{"entities_in":6,"total_uuids_passed":2,"skipped":[],"unmapped_types":[]},
 "view":"render","contact_id":"437264483","space_id":"364817","access_levels":["End User"]}
```

**No `product_ids` key at all.** `certificate_ids` alone satisfies
`TOOL_REQUIRED_NARROWING_FILTERS["crm_master_product_attachments_list"] = ("product_ids",
"attachment_ids", "certificate_ids")` (`sorento_crm_mcp/sorento_crm_mcp/server.py:40`), whose semantics
are **OR** — any one present passes (`server.py:67-77`). The tool then correctly listed every product
carrying certificate `PC 000078`. **The CRM answered the question it was asked. n8n asked the wrong
question.**

### 1.3 Where the certificate came from: carried session state, not the parser and not this turn's resolver

**Parser output for the bad turn** — the LLM emitted exactly two entities:

```json
[{"raw":"srtwc8317-rl1","hint":"product","canonical_code":null,"current_message":true,"confident":true},
 {"raw":"cert","hint":"attachment_type","canonical_code":"certificate","current_message":true,"confident":true}]
```

**`get-session-vars` at the start of that turn** held **seven** entities, five of them the same
certificate:

```
{raw:"MWC7602-RL-P",  hint:"product",         uuid:"72aa8105-…"}
{raw:"Certification", hint:"attachment_type"}
{raw:"PC000078",      hint:"certificate", canonical_code:"PC 000078"}   ×4
{raw:"PC 000078",     hint:"certificate", canonical_code:"PC 000078"}
```

**`resolve-entity`:** `unresolved_tokens: ["srtwc8317-rl1"]`, `matches: []` for that token (only trgm
alternatives `SRTWC8317-RL` @0.8, `-P-RL`, `-SH`). All five `PC000078` tokens resolved to certificate
`aa10fd73-96bf-4418-91c3-7780a36305fe`.

**`disallowed-entity-gate`:** `gate_passed: true`, `require_specific: false`, `gate_reason: "ok"`,
`gate_debug.entities_count: 2` — while `compatible_entities` carried **six** rows (one
`attachment_type`, the certificate **five times**).

**`tool-filter`:** `{"name":"crm_master_product_attachments_list","similarity":0.434,
"_tool_pick":{"chosen":…,"rejected":[],"count":1,"has_product":false}}`.

### 1.4 Root cause — `certificate` has no eviction axis

`export/sub-semantic-parser/nodes/output_exchange.js`, the `replace_combine` branch:

```js
const currentAxes = new Set(current.map(axisOf));
…
keptPrior = prior.filter(e => !currentAxes.has(axisOf(e)));
finalEntities = [...current, ...keptPrior];
```

and the axis maps (`:311-341`):

```js
product_attachment: {
  product: 'product_scope', category: 'product_scope', brand: 'product_scope',
  attachment_type: 'attachment_scope',   // type is its own axis (coexists with product)
},
const HINT_AXIS_DEFAULT = { …, product:'product_scope', attachment_type:'attachment_scope',
  customer:'order_scope', warehouse:'location', goods_receive:'doc', spo:'doc', form:'doc' };
const axisOf = (e) => (domainMap && domainMap[hint]) || HINT_AXIS_DEFAULT[hint] || `__${hint}`;
```

**`certificate` is in neither map.** It falls through to the private axis `` `__certificate` ``. No
ordinary turn produces a `certificate`-hinted entity — only an explicitly typed certificate number
does — so `currentAxes` never contains `__certificate`, so `keptPrior` **always** retains it.
**Once a certificate lands in session state it is immortal: no axis collision, no TTL, no eviction.**

On the reported turn the prior *product* (`MWC7602-RL-P`) and the prior *attachment_type* were both
correctly evicted by axis collision. Only the certificate survived — and it was the one thing that
should not have.

### 1.5 The blast radius is five turns over 21 hours, not one

From `n8n_test.chat_histories`:

| id | time (UTC) | message | reply |
|---|---|---|---|
| 9151528 | 08-06 02:57 | `certification with number PC000078` | "no certificate matched" |
| 9151535 | 08-06 04:16 | `certification with number PC000078` | **26-row dump (first)** |
| 9151540 | 08-06 04:18 | `certification with number PC000078` | 26-row dump |
| 9151545 | 08-06 04:19 | `mwc7601-rl-p cert` | 26-row dump ← first **wrong-product** carry |
| 9151550 | 08-06 04:20 | `find certificate for MWC7601-rl-p` | 26-row dump |
| 9151555 | 08-06 04:20 | `cert for mwc7602-rl-p` | 26-row dump |
| **9151560** | **08-07 01:20** | **`srtwc8317-rl1 cert`** | **26-row dump (reported)** |
| 9151564 | 08-07 01:21 | `srtwc8317-rl1 cert` (after `hi`) | correct did-you-mean |

**Unknown, flagged rather than guessed:** the 02:57 → 04:16 flip on *identical* text means something
changed CRM-side between those two turns so that `certificate_ids` started returning rows. Not
established. It does not affect either fix, but it should not be quietly dropped.

### 1.6 Why the tester's clean-session runs never reproduced it

Turn `11509954` is the control: the user typed `hi` (`message_type: casual` → entities cleared), then the
**identical** text. `get-session-vars` showed `"entities": []`, `tool-filter` picked the **same** tool
with the **same** `has_product:false`, and the reply was correct:
*"Couldn't find srtwc8317-rl1. Did you mean: 1. SRTWC8317-RL — has certificate …"*.

**The only variable was session state.** Any repro must use the **`sim-inject` seeded-session lane**
(§4.1). This also corrects LESSONS §31's "injecting `previous_conversation_state` in the redis item does
**NOT** work" — that predates the lane and is now **stale**.

### 1.7 Why the control produced the *right* answer, and why that is not a fix

With empty state, `compatible_entities` held only the `attachment_type`. `attachment_type_ids` is
**not** in the tool's narrowing tuple, so the MCP layer short-circuited to an empty page
(`server.py:1340-1342`) and the turn fell through to not-found → did-you-mean.

So today's correct behaviour on a clean session is **an accident of the MCP short-circuit**, not a
deliberate spine gate. B1 makes it deliberate.

---

## 2. B1 — `attachment-subject-gate`  ·  scope `deterministic`  ·  spine

### 2.1 The rule

In `disallowed-entity-gate.js`, after the existing required-type block (`:59-76`) and before the
require-specific block (`:86`):

```js
// B1 — the named subject product MISSED. A carried certificate / attachment_type must not be
// allowed to scope the lookup on its own: certificate_ids alone satisfies the tool's narrowing
// tuple (server.py:40, OR semantics) and returns every product carrying that certificate.
// Observed: exec 11509873, 26 unrelated products + a PDF. Dead-end to not-found so the
// did-you-mean the customer actually needs is what gets rendered.
if (gate_passed && domain === 'product_attachment') {
  const _n = s => String(s ?? '').trim().toLowerCase();
  const _unresolved = (resolver.unresolved_tokens ?? []).map(_n);
  const _productRaws = new Set((parser.entities ?? [])
    .filter(e => String(e.hint || '').toLowerCase() === 'product')
    .map(e => _n(e.raw)));
  const _missedSubject = _unresolved.some(t => _productRaws.has(t));
  const _haveProduct   = compatible_entities.some(e => e.entity_type === 'product');
  if (_missedSubject && !_haveProduct) {
    gate_passed = false;
    gate_reason = `'product_attachment' subject product did not resolve; refusing to scope on carried entities`;
  }
}
```

### 2.2 Why this exact predicate, and not the obvious ones

- **NOT `current_message`.** State on the bad turn carried `current_message: true` on entities that were
  *not* from the current message (§5, B4). Any rule that trusts that flag is standing on a known-broken
  signal.
- **NOT "no product in `compatible_entities`".** That would break the legitimate query
  `certification with number PC000078`, which names no product at all and *should* list the products a
  certificate covers.
- **`unresolved_tokens` ∩ parser product raws** is resolver-derived and reliable. It fires exactly when
  the customer named a product and the resolver could not find it.

Traced against the four real cases:

| turn | `unresolved_tokens` | product hinted | product in `compatible_entities` | B1 fires? | outcome |
|---|---|---|---|---|---|
| `srtwc8317-rl1 cert` (bad) | `["srtwc8317-rl1"]` | yes | no | ✅ **yes** | not-found → did-you-mean — matches the control |
| same, clean session (control) | `["srtwc8317-rl1"]` | yes | no | ✅ yes | identical output, now by design not by accident |
| `certification with number PC000078` | no product raw | no | no | ❌ no | certificate listing preserved |
| `mwc7601-rl-p cert`, product resolves | — | yes | **yes** | ❌ no | `product_ids` AND `certificate_ids` → intersection |

⚠️ **Residual to confirm in the repro (§CD-2):** turn 9151545 (`mwc7601-rl-p cert`) *did* dump, which
implies `product_ids` was absent even though the product looks resolvable. Either the token was also
unresolved, or `compatible_entities` was replaced upstream. **Confirm from runData; do not assume B1
covers it.**

### 2.3 Blast radius

Only `product_attachment`, only when a named product token missed. Every other domain and every turn
where the subject resolved is **byte-identical**. `inventory` and `master_products` plausibly want the
same rule — their tools have different narrowing contracts (`crm_inventory_stock_balance_list` has
**none**), so that is a separate change, not a widened predicate. Filed, §6.

### 2.4 Node/edge diff

**Add 0 nodes, 0 edges. Edit 1 node:** `disallowed-entity-gate` `jsCode`. Publish the clone; re-export.

---

## 3. B2 — `certificate-axis-carry`  ·  scope `parser`  ·  parser sub

### 3.0 🔴 B4 GATE RESULT — **B2 AS DESIGNED IS NO-GO.** Superseded by B2′ (§3.6)

The §CD-7 / §7-step-2 gate ran (2026-08-07, read-only). Verdict on each of its three questions:

1. **Is B4 real? YES — confirmed empirically, not inferred.**
2. **What sets it? `applyDymPick` — plan §5's candidate is CORRECT**, plus a second writer §5 did not
   list (block (B), `output_exchange.js:581`). Full writer census in §5.1.
3. **Does it defeat B2's eviction? YES, on the single most likely post-B1 turn in the whole flow.**

**The mechanism, in four lines.** B2's eviction is `keptPrior = prior.filter(e => !currentAxes.has(axisOf(e)))`
(`output_exchange.js:409`) followed by `finalEntities = [...current, ...keptPrior]` (`:412`).
The axis filter is applied to **`prior` only** — `current` is spread unconditionally, nothing prunes it.
`applyDymPick` (`:189`,`:190`) does `_prior.map(e => ({...e, current_message: true}))`, and `tryDymPick`
calls it at `:243`, **before** the executor. So on a did-you-mean pick turn every carried entity —
including the stale certificate — arrives in `current`, where **the axis map is never consulted**.
Adding `certificate: 'attachment_scope'` changes nothing on that turn.

**Why this is the turn that matters.** B1 converts the reported dump into
`"Did you mean: 1. SRTWC8317-RL … Reply with a code to continue"`. The customer's next message is a code
reply — which is *precisely* the `tryDymPick` trigger. So B2 would be bypassed on the exact turn B1
funnels every affected customer into, and the outcome is the **F-CARRY-NARROW confident false negative**
the tester measured (`No certificate for SRTWC8317-RL`) rather than the dump. **B2 would test green on
§CD-5 and be inert in production.**

The numbered-reply variant is worse: `dymNumberedMultiSelect` (`:493-517`) runs **after** the executor and
does `output.output.entities = _base` (`:514`) — it **discards the executor's output wholesale**. On that
path B2's map is not merely bypassed, it is unreachable. **Unconditionally inert.**

**And the semantic model is wrong independently of B4.** §3.2's row 2 — *"`cert PC000078` then
`and MWC7601?` ⇒ cert still carried. Correct: same certificate, different product"* — is the
**F-CARRY-NARROW generator**, not a feature. A carried `certificate` is a narrowing filter bound to the
product it was resolved against; when `product_scope` changes it is stale by construction. Retaining it
across a product change yields `product_ids ∧ certificate_ids = ∅` → *"No certificate for X"* for a
product that has one. Evicting it instead is better on **both** branches: if the new product does carry
that certificate the un-narrowed query still returns it; if it does not, the customer gets the truth
instead of a false denial. The only cost is a slightly wider result set. **§3.2 row 2 is a design error.**

### 3.1 The edit — ⚠️ NECESSARY BUT NOT SUFFICIENT (see §3.6)

In `output_exchange.js`, two one-line map additions:

```js
product_attachment: {
  product: 'product_scope', category: 'product_scope', brand: 'product_scope',
  attachment_type: 'attachment_scope',
  certificate:     'attachment_scope',   // B2: was `__certificate` → never evicted (exec 11509873)
  attachment:      'attachment_scope',   // B2: same class, same hazard
},
const HINT_AXIS_DEFAULT = { …, attachment_type: 'attachment_scope',
  certificate: 'attachment_scope', attachment: 'attachment_scope', … };
```

### 3.2 What this does and does not evict — ⚠️ ROW 2 IS A DESIGN ERROR (§3.0)

| turn sequence | before B2 | after B2 (as designed) | ruling |
|---|---|---|---|
| `cert PC000078` then `srtwc8317-rl1 cert` | cert carried → dump | current turn has `attachment_type` (`cert`) → `attachment_scope` in `currentAxes` → **carried certificate evicted** | ✅ works — **but only when `applyDymPick` did not run this turn** (§3.0) |
| `cert PC000078` then `and MWC7601?` (bare product) | cert carried | cert **still carried** | 🔴 **WRONG.** This is the F-CARRY-NARROW generator — `product_ids ∧ certificate_ids = ∅` → *"No certificate for MWC7601"*. B2′ evicts here. |
| `cert PC000078` then `cert PC000079` | both retained | both current → both retained (the filter only drops **prior**) | unchanged; and it is the same `current`-is-never-pruned property that produced **five** copies of `PC000078` in the observed state (§5.1c) |
| **any dym code/number reply after B1's did-you-mean** | cert carried | **cert STILL carried — B2 bypassed entirely** | 🔴 **the gate failure.** §3.0 |

### 3.3 Why this needs the `parser` tier

`output_exchange` runs **after** the LLM (`AI Agent → output_exchange`), and the deterministic bypass
`mock_reformulator_output` feeds a sibling branch that **skips `output_exchange` entirely**
(LESSONS §28; plan §8's parser-tier note). A mock cannot exercise this edit. `scope: parser`, real
reformulator, multi-turn.

### 3.4 Build target and the promote hazard

Build on fork **`wI5RkNGW3EOJfBdo`** (the sub the clone calls — CLAUDE.md's key table; confirmed as the
parser sub in exec `11509876`). Memory `ideation-intake-parser` records the fork as byte-identical to
live `XTODTw` — **that claim decays** (LESSONS §57 / memory `stale-byte-identical-fork-claim`).

🚩 **MEASURED 2026-08-07 — THE MEMORY IS NOW FALSE. The fork is STALE vs live by one promoted hunk,
inside the node B2 edits.** Fork `output_exchange` = 55,499 chars / sha `710e577a1652`; live
`XTODTw` = 55,545 / sha `c8b7f14572a8`. `diff` is exactly two lines, `DOMAIN_BLOCKED_HINTS`:

```
 order:    live has  …,'attachment','resource_attachment','flyer']   fork lacks 'resource_attachment'
 incoming: live has  …,'flyer','resource_attachment']                fork lacks 'resource_attachment'
```

Consequences, both binding:
- **Block-copying the fork's `output_exchange` to live would REGRESS live**, silently removing
  `resource_attachment` from the order and incoming blocklists. Build the live target as
  **LIVE + your own hunks, by node NAME** (LESSONS §57/§58c). Never block-copy.
- The fork is behind live in the *same node and the same function region* B2′ edits, so re-diff again
  immediately before promote — this delta was found today; another may land tomorrow.
- Fork `versionId == activeVersionId` (`c9f6e280`) — no unpublished draft. Verified.

### 3.5 Node/edge diff

**Edit 1 node:** `output_exchange` `jsCode` on `wI5RkNGW3EOJfBdo`. **Publish the sub before testing the
parent** (LESSONS §37 — a parent resolves only the *published* version of a sub).

### 3.6 🔴 B2′ — the re-spec that survives B4  ·  scope `parser`

**B2 is NO-GO. B2′ replaces it.** Four parts; parts 2 and 3 are what make it immune.

**Part 1 — the axis-map entries (§3.1 verbatim).** Still required: it is what makes `certificate` a
first-class scope rather than a private `` `__certificate` `` island. Necessary, not sufficient.

**Part 2 — evict on the FINAL MERGED SET, not on `prior`.** Add a single reconciliation pass placed
**after every entity-set writer** — i.e. after block (B) (`:584`) and **before** blocklist-apply
(`:656`). That position is downstream of `tryDymPick` (`:243`), the executor (`:311-420`),
`dymNumberedMultiSelect` (`:517`), reference-positions (`:566`) and block (B) (`:584`), so no writer can
land after it. Every one of those five is a documented bypass of the current `:409` filter.

**Part 3 — derive "carried" from PROVENANCE, never from `current_message`.** `current_message` is a
proven-corrupted signal (§5.1) and B2′ must not stand on it. The uncorrupted this-turn signal already
exists in the node: **`_parser_raw_snapshot`** (`:76-78`), the frozen raw LLM object captured before any
mutation. Define, once, near the top:

```
priorKeys   = keys of parent_input.previous_conversation_state.entities   // snapshot, pre-mutation
llmKeys     = keys of _parser_raw_snapshot.entities                       // what the USER actually said
key(e)      = `${hint}|${canonical_code || raw}` normalized (trim+lowercase)
isCarried(e) = priorKeys.has(key(e)) && !llmKeys.has(key(e))
```

An entity is **carried** iff it was in prior state and the LLM did not emit it this turn. This is true
regardless of what `applyDymPick` or block (B) stamped on it.

**Part 4 — the eviction rule, with the widened trigger (§3.0).** In the reconciliation pass:

> Drop every **carried** entity on the `attachment_scope` axis (`certificate`, `attachment`,
> `attachment_type`) when the current turn contributes **either** an `attachment_scope` entity **or** any
> `product_scope` entity — where "contributes" means non-carried per Part 3 (so a dym pick, which is a
> genuine this-turn product choice, counts).

The `product_scope` half is the fix for §3.2 row 2 **and** for the post-B1 dym-pick turn. It is also what
turns F-CARRY-NARROW from a defect into a passing case. It does **not** touch the certificate-first query
(`certification with number PC000078`): that turn contributes no product and its certificate is
`llmKeys`-present, therefore not carried — nothing is dropped. §CD-2 stays green by construction.

**Part 5 — dedupe the final set** by `key(e)` + `uuid`. Same root cause (`current` is never pruned), and
it is what produced **five** `PC000078` rows. Cheap, and it makes `gate_debug.entities_count` agree with
reality without waiting for B3.

**What B2′ deliberately does NOT do:** it does not repair `applyDymPick`'s re-flag. That is filed
separately as **B4-fix** (§5.1d). B2′ must be correct whether or not B4-fix ever lands — that is the
whole point of Part 3. Do not bundle them.

**Tier:** still `parser`. Parts 2–5 live in `output_exchange`, after the LLM, on a branch
`mock_reformulator_output` skips entirely (LESSONS §28). Real reformulator, multi-turn.

### 3.7 🔴 DEFECT IN B2′ AS BUILT — the `ordinal` exemption is PERMANENT, not this-turn

*(Found 2026-08-08 while planning Change C. Fix specified in
`plans/immortal-hint-class-plan.md` §2.4 as "M2". B2′ is built on the fork @ `95193323` with this
defect present.)*

Part 3's `_ceIsCarried` opens with:

```js
if (e.ordinal !== undefined) return false;      // reference-position pick = this-turn selection
```

The comment states the intent correctly; the code does not implement it. **`ordinal` is written once
and then persists in session state forever** — `reconcileEntities` spreads `{...pe}`
(`compile-current-state.js:178`), and the spine persists `entities: reconciledEntities` (`:426`).
So an entity minted by a positional pick is classified "not carried" on **every subsequent turn**,
and B2′'s reconciliation pass can never evict it.

This is the same failure shape Part 3 was designed to defeat, arriving by a different route: B2′ is
correctly immune to `applyDymPick`'s `current_message` corruption, and then re-opens the hole on a
*different* persisted field. **B2′ would test green on every §CD case and still leave this entity
class immortal** — measured on parser exec `11554793`, entity
`{"raw":"M2399","hint":"product_attachment","ordinal":1,…}` surviving six consecutive turns.

**The fix follows B2′'s own already-reviewed pattern** (`_ceDymPickedKeys`): record the keys minted
this turn in a `_ceRefPickedKeys` set inside the reference-positions block, and test membership of
that set instead of the persisted field. Strict tightening — nothing evictable becomes exempt.

⚠️ **It must land together with Change C's C1.** C1 gives an unrecognised hint the domain's subject
axis, so the permanently-exempt entity would start counting as a this-turn `product_scope`
**contribution** (`_rcContribProduct = true`) and would make B2′ evict carried certificates on turns
where nothing real changed. C1 without M2 makes B2′ *less* correct than it is today.

### 3.8 Change C composes with B2′ — it does not subsume or replace it

`plans/immortal-hint-class-plan.md` §2.3 settles this. Summary, so nobody re-opens it:
**B2′ Parts 1, 2, 4 and 5 all remain necessary and unchanged.** C1 only alters the *fallback* for
hints absent from both axis maps; `certificate` and `attachment` are **mapped** by B2′ Part 1, so
C1 never sees them. And B2′ Part 4's rule (evict a carried certificate when `product_scope` changes)
is semantic, not axial — `certificate` and `product` are deliberately different axes, so axis
collision can never express it. **Do not simplify B2′; compose with it.** The only change to B2′ is
the one corrected line in §3.7.

---

## 4. Reproduction method (binding for the tester)

### 4.1 The seeded-session lane

The clone has a session-injection lane, off `if-message-is-audio[1]`:

```
if-message-is-audio[1] -> sim-inject-gate
sim-inject-gate[0]     -> sim-inject-session -> get-session-vars
sim-inject-gate[1]     -> session-get-gate
```

`sim-inject-gate` condition (from the clone JSON):
`{{ !!($('redis-pop-main-message-list').first().json.message.previous_conversation_state) }}`

`sim-inject-session.js` (whole body):

```js
const item = $('redis-pop-main-message-list').first().json.message;
return [{ json: { session_vars: {
  variables: item.previous_conversation_state ?? {},
  referenced_result_set: item.referenced_result_set ?? []
} } }];
```

So: put `previous_conversation_state` on the redis item and the clone reads **that** instead of the prod
session. This is mode-independent and bypasses the prod read entirely.

📌 **LESSONS §31 correction:** "Injecting `previous_conversation_state` in the redis item does **NOT**
work" is **stale**. It predates this lane. Update LESSONS when this change lands.

### 4.2 The seed for §CD-1

Reproduce the *state*, not the utterance — the utterance alone provably does not reproduce it (§1.6):

```json
"previous_conversation_state": {
  "domain_hint": "product_attachment",
  "intent_hint": "check_product_attachment",
  "entities": [
    {"raw":"MWC7602-RL-P","hint":"product","uuid":"72aa8105-…","canonical_code":"MWC7602-RL-P"},
    {"raw":"Certification","hint":"attachment_type"},
    {"raw":"PC000078","hint":"certificate","canonical_code":"PC 000078"}
  ]
}
```

Re-confirm the certificate uuid `aa10fd73-96bf-4418-91c3-7780a36305fe` still resolves at test time.

---

## 5. Secondary defects found — logged, NOT bundled

- **B3 — `compatible_entities` is not deduped.** `disallowed-entity-gate` dedups `entities` by uuid
  (`:33-35`) but `exact_entities` is built by unguarded `push` (`:117`, `:125`, `:128`, `:151-152`), so
  the bad turn emitted **six** rows for **two** uuids and `gate_debug.entities_count` (2) silently
  disagreed with `compatible_entities.length` (6). Harmless downstream only because
  `entity-ids-transformer` dedups by uuid (`:39`), but it inflates the LLM prompt (the same certificate
  listed five times) and makes `gate_debug` misleading as a diagnostic. **One-line fix, own change.**
- **B4 — carried entities re-flagged `current_message: true`, and duplicate accumulation.**
  **✅ RESOLVED 2026-08-07 — see §5.1. Confirmed true; `applyDymPick` confirmed as the writer; and it
  DOES defeat B2 as designed.** B2 is superseded by B2′ (§3.6). B4 itself is filed as **B4-fix**, its
  own change (§5.1d) — B2′ does not depend on it.
- **B5 — an unresolved product token never blocks.** `disallowed-entity-gate` OR-mode does
  `if (matches.length === 0) continue;` (`:108`), so a token with zero matches contributes nothing and
  raises no `require_specific`. B1 patches this for one domain; the general shape is a separate change.
- **B6 — `tool-filter` cannot see that the product missed.** It ranks purely on `sub-get-rag`
  similarity and returns the argmax; it *computes* `has_product` from `compatible_entities` but only
  stores it in `_tool_pick` for diagnostics ("the old `hasProduct` was dead code", `tool-filter.js:20`).
  Both the bad turn and the control show `has_product:false` and both selected
  `crm_master_product_attachments_list`. Making `has_product` load-bearing is a plausible alternative to
  B1 — **rejected** for phase 1: it would change tool selection for every domain, where B1 changes one
  gate for one domain.

---

---

## 5.1 B4 — the investigation, settled (read-only, 2026-08-07)

**Bodies read:** live parser `XTODTw-dJcV0uRdC056hG` `output_exchange` via
`export/sub-semantic-parser/nodes/output_exchange.js` (866 lines, `--verify` green at `8a813ddc`), and
fork `wI5RkNGW3EOJfBdo` `output_exchange` pulled fresh (`710e577a1652`). **The two are identical in every
region below** — the only fork↔live delta anywhere in the node is the `DOMAIN_BLOCKED_HINTS` hunk in
§3.4. So every finding here applies unchanged to both build target and promote target.

### (a) Is it true? YES — direct observation, not inference

`get_execution(wI5RkNGW3EOJfBdo, 11509876)`, the parser sub of the reported bad turn. Its
`When Executed by Another Workflow` input carries the session state verbatim:

```json
"previous_conversation_state": { "entities": [
  {"raw":"MWC7602-RL-P","hint":"product","uuid":"72aa8105-…","dym_slot":"11400339",
   "canonical_code":"MWC7602-RL-P","current_message":true},
  {"raw":"Certification","hint":"attachment_type","canonical_code":"Certification","current_message":true},
  {"raw":"PC000078","hint":"certificate","canonical_code":"PC 000078","current_message":true},   ×4
  {"raw":"PC 000078","hint":"certificate","canonical_code":"PC 000078","current_message":true}
] }
```

**All seven carried entities carry `current_message: true`.** That is a direct read of the previous
turn's `output_exchange` OUTPUT: the spine persists `entities: reconciledEntities`
(`compile-current-state.js:426`), `reconciledEntities = reconcileEntities(qf.entities, …)` (`:187`),
`qf = $('Call \'sub-query-reformulator\'').first().json.output` (`:2`), and `reconcileEntities` spreads
`{...pe}` (`:182`) — `current_message` passes through byte-for-byte. No LLM turn emits seven current
entities including the same certificate five times.

### (b) What sets it? `applyDymPick` — plan §5's candidate CONFIRMED, plus one more

The smoking gun is `dym_slot: "11400339"` on the carried product. **`dym_slot` has exactly one writer in
the entire codebase:** `output_exchange.js:187`, `if (_slot != null) _picked.dym_slot = _slot;` — inside
`applyDymPick`. And the only site that maps priors to `true` is `applyDymPick:189/:190`. The prior turn
was a did-you-mean pick; the re-flag is its footprint.

**Full census of every `current_message` WRITER** (both bodies, identical):

| # | line | site | writes | carried entities? | fires when |
|---|---|---|---|---|---|
| W1 | 103 | `reuse`→`replace_combine` correction | `true` on LLM entities | **No** — guarded by `_priorEnts0.length === 0` | no prior entities exist at all |
| W2 | 149 | flyer injection | `true` on a **new** `flyer` entity | No | `contains_flyer === true` |
| W3 | 186 | `applyDymPick` `_picked` | `true` on the picked candidate | No — legitimately this turn | any pick |
| **W4** | **189, 190** | **`applyDymPick` prior re-map** — `_prior.map(e=>({...e, current_message:true}))` | **`true` on EVERY prior entity** | **YES — this is B4** | a dym pick: `tryDymPick` (`:221-244`, code/button reply matching `dym_offer.candidates` or legacy `dym_candidates`) **or** `dymNumberedMultiSelect` (`:493-517`, numbered reply with `reference_target==='dym'` + non-empty `dym_last_result_set`) |
| W5 | 358 | executor `prior` normalization — `.map(e=>({...e, current_message:false}))` | **`false`** on all priors | **the SANITIZER** | always, inside the executor |
| W6 | 553 | reference-positions → entities | `true` on entities minted from `last_result_set` | Borderline: sourced from a prior result set, but genuinely selected this turn — and the block **replaces** `output.output.entities` wholesale, so priors are dropped, not re-flagged | `reference_positions` non-empty |
| **W7** | **581** | **block (B), `product_attachment` attachment_type re-attach** | **`true` on prior `attachment_type` entities copied forward** | **YES — a second carried re-flag, NOT in plan §5** | `domain_hint==='product_attachment'` AND the merged set holds no `attachment_type` |

**Spine writers: none. Spine readers: none.** `grep -rn current_message export/**/*.js` returns hits only
in the parser sub plus one *comment* in the clone's `disallowed-entity-gate.js:85` (B1's own note that
the flag is untrustworthy — that judgement is now vindicated). **The corruption is confined to
`output_exchange` + `suggest-follow-up`.** That is the blast-radius bound.

**Readers, and which are actually harmed:**

| line | reader | harmed by W4/W7? |
|---|---|---|
| **355** | `current = all.filter(e => e.current_message === true)` — the executor split | **YES. This is the one that defeats B2.** |
| 101 | reuse-correction guard | no (runs before any re-flag) |
| 236 | `_curEnts` inside `tryDymPick`'s `_codeMatches` | **no** — reads `output.output.entities`, which at `:236` is still the raw LLM list; the corruption lives in `previous_conversation_state`. Checked explicitly because a self-retriggering pick loop would have been severe. |
| 298 | `_swHasCurEnt`, the #6 domain-switch defence | minor: on a dym-pick turn this reads the post-`tryDymPick` set, so it is true even for a bare switch word. Low impact (a pick turn is a code, not "promo"). Noted, not filed. |
| 573 | block (B) guard | no — reads the merged set, which is the intent |
| 632 | `curEnts` for the domain-inherit carry | minor: on a dym-pick turn the "compatible with prev domain" test also evaluates carried entities, making inherit harder to satisfy. Noted, not filed. |
| `suggest-follow-up.js:11` | `_hasEntityPick` | yes, cosmetically — reads `true` on a turn with no real pick |

**W5 is why B4 has been survivable so far.** On any turn where `applyDymPick` did **not** run, the
executor re-derives `prior` from state and force-stamps `current_message: false` (`:358`), so the
corrupted flags arriving in state are discarded before the split. That is exactly what happened on the
reported bad turn `11509876`: its output shows the five carried certificates at
`current_message: false`, and the executor correctly axis-evicted the prior product and prior
attachment_type. **B2 would have worked on that specific turn.** It is the *next* turn — the pick reply —
where it does not.

### (c) The duplicate accumulation — same root cause, mechanism established, specific turns unretrievable

`current` is spread unconditionally at `:412` and is **never** deduped or pruned; only `prior` is
filtered. Once `applyDymPick` promotes the carried set into `current`, the entity set becomes
**append-only for that axis** — every later turn's fresh entity is added to a set that can no longer be
collapsed. `applyDymPick`'s in-place replacement (`_idx >= 0`) is the only non-growing path, and it
requires a `dym_slot` / `for_raw` / `for_canonical` / unambiguous-single-hint match; a miss takes the
`else` at `:190`, **prepends**, and sets `dym_replace_unmatched = true`.

Corroboration from the observed state: four rows have `raw: "PC000078"` (the user's typed form) and one
has `raw: "PC 000078"` **with `canonical_code` identical to `raw`** — which is exactly the shape
`applyDymPick` mints at `:185-186` (`raw: _hit.code, canonical_code: _hit.code`), and it carries no
`dym_slot`, consistent with the legacy flat-`dym_candidates` path where `_offer` is null.

**Honest limit:** the executions that *produced* the growth are 2026-08-06 04:16–04:20 and have aged out
of retention (~350 executions / ~16 h). The mechanism is established from code and is consistent with
every artifact of the observed state, but the specific triggering turns were **not** re-read. Graded
**strongly-supported inference, not direct observation** — do not upgrade this without a fresh repro.
Part 5 of B2′ fixes it regardless of which pick minted which row.

### (d) B4-fix — filed as its own change, NOT bundled, and NOT a prerequisite for B2′

The narrow repair is `applyDymPick:189/:190` → stop re-flagging priors (`_prior.map(e => ({...e}))`,
leaving `current_message` as it was). ⚠️ **Do not assume this is a safe one-liner: the re-flag is
load-bearing today.** It is what carries the picked-turn entity set past the executor intact; removing it
changes which entities the axis filter evicts on every dym-pick turn in every domain — a far wider blast
radius than B2′. It needs its own plan, its own UAC family and its own regression sample.

**Critically: even a fully-fixed B4 does NOT fix the customer-visible defect.** With the re-flag removed,
a bare-code pick reply contributes only `product_scope` to `currentAxes`, so under B2-as-designed the
carried certificate is still retained (§3.2 row 2) → still `product_ids ∧ certificate_ids = ∅` → still
*"No certificate for SRTWC8317-RL"*. **The widened `product_scope` trigger in B2′ Part 4 is the load-bearing
half, and it is independent of B4.** This is the reason B2′ is specified on provenance (Part 3) rather
than waiting for B4-fix.

---

## 6. CRM half — SPEC ONLY

None of these is required for B1/B2 to work. They bound the blast radius of the *class*.

| id | change | file:line | risk |
|---|---|---|---|
| **C1** | `_empty_narrowing_response` returns `{"data":[],"total":0,"page":1,"limit":…}` — an envelope that **does not match** the real one (`data` / `pagination{total,page,limit}` / `empty`), and it accepts `needed` but never uses it, so the caller gets no machine-readable hint about which narrower was missing. Emit the real envelope + `missing_narrowing_filters: [...]`. | `sorento_crm_mcp/sorento_crm_mcp/server.py:78-87` | low, additive. Tests: `sorento_crm_mcp/tests/test_catalog_compile.py:48-61,102-124` |
| **C2** | 🚩 **Doc/behaviour contradiction.** The tool description and the backend `Query(...)` help both say superseded revisions are included ("read `certificate.is_current_revision`"), but the `certificate_ids` filter is **current-revision-only** by design — `q.filter(ProductAttachment.attachment_id.in_(cert_attachment_ids))` where the subquery pins `CertificateRevision.is_current.is_(True)`. Fix the **docs**, not the behaviour. | `sorento_crm_mcp/sorento_crm_mcp/catalog.py:115-141`; `sorento_crm_backend/app/api/v1/master_data/product_attachments.py:42-46`; authoritative comment at `app/services/product_service.py:2261-2265` | doc-only |
| **C3** | Default ordering for product-attachments is **`created_at ASC`** — oldest first (`product_service.py:2318-2331`; only `created_at`/`sort_order`/`is_primary` are honoured, anything else falls back silently). For a certificate listing that leads the page with the oldest file. Set an MCP-side default via `TOOL_DEFAULT_QUERY_PARAMS` (`server.py:104-127`) rather than changing the backend default. | `sorento_crm_mcp/sorento_crm_mcp/server.py:104-127` | low |
| **C4** | Result cap: no MCP default limit for this tool; backend default `limit=50`, cap `MAX_PAGE_LIMIT=1000` (`app/schemas/common.py:31`). The 26-row dump was *under* the default. A cap would not have prevented it — **do not "fix" this one**; recording it so nobody proposes it as the fix. | — | n/a |
| **C5** | **Filed, adjacent, do NOT bundle:** `crm_inventory_stock_balance_list` is **absent** from `TOOL_REQUIRED_NARROWING_FILTERS`; its spec says verbatim *"ALL FILTERS OPTIONAL — call with none to span every product + active warehouse"* (`catalog.py:379-398`). The n8n-side F2a guard in `dym-transform` is the **sole** protection against a full-table stock read. | `sorento_crm_mcp/sorento_crm_mcp/server.py:36-65`, `catalog.py:379-398` | — |

**Useful reference for the annotation work in Change A:** the `certificate_ids` filter AND-s with
`product_ids` (each is a separate `.filter()` on the same query — `product_service.py:2246-2280`), while
the MCP narrowing gate ORs across the same key names (`server.py:67-77`). Same key names, opposite
combinators, one layer apart. Worth knowing before anyone "harmonises" them.

---

## 7. Sequencing

1. **B1 first** — `deterministic`, spine-only, no live parser touch, and it converts the dump into the
   correct did-you-mean immediately. Highest value per unit of risk.
2. ~~**B4 investigation**~~ — ✅ **DONE 2026-08-07 (§5.1). Outcome: B2 NO-GO, B2′ (§3.6) supersedes it.**
   The hazard was real and B2 was not immune; the "test green while staying broken" scenario was the
   actual outcome, on the modal post-B1 turn.
3. **B2′** — `parser`, on the fork, real reformulator, multi-turn UAC (§CD-5, §CD-10, §CD-11).
   ⚠️ Re-diff fork↔live first (§3.4 — the fork is currently STALE by one hunk).
4. **B3** (dedup) — largely absorbed by B2′ Part 5; keep only the `gate_debug` half if B2′ lands first.
   **B4-fix** (§5.1d) — own plan, own UAC family, own regression sample. **C1/C2/C3** — independent.

**Ordering note:** B1 is already live-on-clone and it *increases* exposure to F-CARRY-NARROW by routing
affected customers into a did-you-mean whose reply triggers the `applyDymPick` bypass. That is not an
argument to roll B1 back — the dump was worse — but it does make B2′ **the next change**, not a
follow-up. Do not let B1's green run stand in for the family being fixed.

Change A (`multi-company-resolution-plan.md`) and Change B are independent. They touch different
nodes; the only overlap is that both edit `disallowed-entity-gate` (A: `specific_options` labels +
render; B1: a new gate clause). **If both are in flight, land them as separate, separately-reviewed
publishes and re-derive line numbers between them** — do not co-edit that node in one op batch.

## 8. Acceptance criteria

1. Seeded with the §4.2 state, `srtwc8317-rl1 cert` produces the **did-you-mean**, asserted at the
   customer boundary (`save-session-vars.user_response` / sendmsg payload), and the reply contains
   **none** of `PC 000078`, `WCM PC 000078`, `Validity`, and **no attachment**.
2. `entity-ids-transformer` (exec of the get-results sub) shows **no** `certificate_ids` key on that
   turn — or the sub is never called at all because B1 dead-ended first. State which, per case.
3. `certification with number PC000078` **still** lists the products that certificate covers. B1 must
   not fire.
4. 🚩 **FIXTURE CORRECTED 2026-08-07 — the old criterion was untestable and was never exercised.**
   The prescribed fixture **`MWC7602-RL-P` does not resolve**, so "a resolving product" was never
   satisfied. Confirmed live today, `resolve-entity` in clone exec `11524951`:
   `{"token":"MWC7602-RL-P","resolved":false,"ambiguous":false,"matches":[]}`,
   `unresolved_tokens:["MWC7602-RL-P"]` — trgm alternatives only (`MWC7602-P` 0.769,
   `MWC7601-RL-P` 0.733, `MWC7609-RL-P` 0.733, `MWC7602-RL-S8` 0.688).
   ⚠️ **Do not substitute `MWC7602-P`:** it returns **two different uuids**
   (`eba62893-2779-49ec-a107-2fc8fea46678`, `1c9460bb-c931-4634-ac58-8d9e90083ea8`) — the
   product-code-unique-**per-company** shape (LESSONS §61c). An ambiguous fixture cannot test an exact
   resolve. ⚠️ Also note the §4.2 seed pins `MWC7602-RL-P` with `uuid: 72aa8105-…`, a **uuid that no
   longer resolves**. Harmless for a *seeded state* fixture (the seed is state, not a resolution) but do
   not reuse that uuid anywhere a real lookup is expected.

   **Replacement fixture: `SRTWT2214`** — resolves `match_tier: exact` (clone exec `11525013`); its real
   certificate is **`PC 000373`**, file `WCM - Cold Tap - EXP 13 SEP 2026.pdf`, `Validity: Valid`.
   The criterion splits into three, because the old single line conflated a clean-session check with an
   intersection check and hid a live defect between them:

   - **§8.4a — clean session.** `SRTWT2214 cert`, no seeded state → returns that product's certificate
     (`PC 000373`, Validity Valid, with the file). **PASSES today** (tester `CD4-CONTROL-clean`).
   - **§8.4b — the real AND-intersection.** `SRTWT2214 cert` with a **matching** certificate seeded
     (`PC 000373`) → `entity-ids-transformer` emits **both** `product_ids` and `certificate_ids`, the
     tool AND-s them (`product_service.py:2246-2280`), and the reply names `SRTWT2214` and no other
     product. **This is the criterion §8.4 was always meant to be and has never been run.**
     🔧 **Prerequisite:** the uuid for `PC 000373` is **not established** — resolve `PC000373` at
     §CD-0a-1 time and **print it**. Do not guess it and do not reuse `aa10fd73-…` (that is `PC 000078`).
   - **§8.4c — the non-matching carry must not confidently deny.** `SRTWT2214 cert` with `PC 000078`
     seeded → today returns *"No certificate for SRTWT2214. Try: SRTWT2216, SRTWT2219, SRTWT2225."*
     while the clean-session control returns the real certificate. **RED today** (tester
     `F-CARRY-NARROW`, exec `11525013`; B1 provably inert — `match_tier: exact`,
     `unresolved_tokens: []`, `gate_passed: true`). **This is B2′'s headline acceptance.**

5. 🚩 **SUPERSEDED — the old §8.5 is satisfiable by a B2 that is inert in production.** Replaced by:
   - **§8.5a** — a turn naming an attachment_type evicts a carried `certificate` from `output_exchange`'s
     output entities, on the **parser sub's** runData, multi-turn, real reformulator. (The original.)
   - **§8.5b — 🔴 the B4-bypass criterion.** The same eviction holds on a turn where **`applyDymPick`
     ran** — i.e. the customer replies to B1's did-you-mean with a code (`tryDymPick`) *and*, separately,
     with a number (`dymNumberedMultiSelect`). Assert `dym_pick_applied === true` on the turn, so the
     case **cannot pass by failing to trigger the pick path**. Without §8.5b, §8.5a alone is exactly the
     green-that-cannot-fail this gate was opened to prevent.
   - **§8.5c** — a carried `certificate` is evicted when the current turn changes `product_scope` with
     **no** attachment_type named (B2′ Part 4's widened trigger; the §3.2-row-2 correction).
   - **§8.5d** — no entity key appears more than once in `output_exchange`'s output (B2′ Part 5).
   - **§8.5e — negative control**, unchanged in spirit: `certification with number PC000078` (no product
     contributed) retains its certificate and still lists the covered products.
6. Every other domain byte-identical.
7. Every §CD assertion **shown to fail on purpose** under §0 S9's three-part mutation procedure.
8. §0 S1–S9 hold on every case.

## 9. Rollback

B1: `publish_workflow` the prior clone versionId (`3a196c44` at plan time).
B2: `publish_workflow` the prior fork versionId — **capture it before the first edit**.
Re-run `export-workflows.py` after either.
