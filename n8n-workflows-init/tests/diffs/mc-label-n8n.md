# Node diff — `mc-label-n8n` (multi-company reply clarity, n8n half)

**Branch** `fm/mc-label-n8n` · **Coder pass** 2026-08-17 · **revised 2026-08-17 for reviewer B1 + B2** (`n8n-workflows-init/tests/reviews/mc-label-n8n.md`, commit `a0d2a45`) · **n8n MCP unavailable this session — every edit made over the public REST API with curl.**

> **Revision log.** Reviewer returned REQUEST-CHANGES on two blockers.
> **B1** (correctness, `output-structurer`) — fixed and republished to `t4QvrtrPnTwRU6br`; §1 below carries the new
> sha, line count, fix hunk and probe rows. The reviewer's endorsed non-blocking finding 1 (asymmetric
> `lookup_companies` json gate) rode along in the same edit. **B2** (promote mapping incomplete) — fixed in the
> promote-mapping table below; no publish was involved. `not-found-error-message` and `crossdomain-zeroset` were
> approved as-is and are **unchanged** by this revision (clone still at `63967fff-120c-4157-822e-083916fd88d0`).
> **B3** (multi-company-with-rows UAC case) is the tester's; still open.
>
> **Revision 2 (second, independent fresh-context review).** Three more items, all in the clone spine:
> **FIX 1** (MAJOR, `not-found-error-message`) — the `_multiCo` arm dropped the `(+N more)` cap for the whole turn;
> **FIX 2** (MINOR, `crossdomain-zeroset`) — the `ex.uuid` backfill could flip `_xd.active` on a single-company turn;
> **VERIFY 3** (MAJOR-conditional, `not-found-error-message`) — investigated and found **REACHABLE**, so narrowed.
> Both nodes republished together to `txiPzSxy3Pclsz6v` (`33746137-f998-4105-abe3-2d591997ce39`).
> `output-structurer` was **not** touched in revision 2 (`t4QvrtrPnTwRU6br` stays at `179f1842-…`).

Backend counterpart: sorento_crm PR **#193** (merged + deployed). Wire contract, verified on a live clone run (sub-exec 12772435):
when — and only when — a lookup/result set spans **more than one company**, the MCP render envelope gains
`lookup_companies: [{id, name}, …]` (sorted by name, present on found AND empty envelopes), every row in `items[]`
gains a LEADING `{"key":"company_name","label":"Company","value":"Mocha"}` field, and the empty intro becomes
`"No matching results found for Mocha or Sorento."`. A single-company lookup is byte-identical to before: **no**
`lookup_companies` key, **no** Company field. Every change below is written to be inert in that single-company case.

## Captain's rule, honoured in all three nodes
Labels are keyed to the **actual lookup / result company set** — `lookup_companies` from the envelope, or the
`company_name` of the entities actually sent to the tool — **never** the caller's access list. A contact entitled to
three companies who asked about a one-company product searched one company, and saying otherwise would be a false
statement about work never done.

## Workflows touched (exactly two — live never opened for write)

| workflow | id | node | versionId pre | versionId post |
|---|---|---|---|---|
| `sub-get-results CS-BUILD` | `t4QvrtrPnTwRU6br` | `output-structurer` | `4eb8ad78-d5af-42ef-b899-d9baec4e1efb` | `6dbcf061-d626-4bb6-b63b-7451aeb7f827` → **`179f1842-8061-4e59-9c72-74ad2b602f29`** (B1) |
| `sorento-consume-main TEST` (clone spine) | `txiPzSxy3Pclsz6v` | `not-found-error-message`, `crossdomain-zeroset` | `98e93d6e-41b4-4a1f-999c-5fe70daeacc6` | `63967fff-120c-4157-822e-083916fd88d0` → **`33746137-f998-4105-abe3-2d591997ce39`** (rev 2) |

Untouched and re-checked after both publishes: live spine `9qVyfUxmRQqrpGRMDLRuz` (`v=av=469e7259-…`, updatedAt
2026-08-11), live sub `rysSPgUssLDf6xJc` (`v=av=eb0bbcec-…`, updatedAt 2026-08-10).

Pre-edit backups (as fetched, before any write):
`n8n-workflows-init/tests/backups/mc-label-n8n/t4QvrtrPnTwRU6br-pre.json`,
`n8n-workflows-init/tests/backups/mc-label-n8n/txiPzSxy3Pclsz6v-pre.json`.

Published node bodies (the promote artifacts, byte-exact):
`n8n-workflows-init/tests/diffs/mc-label-n8n/{output-structurer,not-found-error-message,crossdomain-zeroset}.js`.

## Promote mapping

| artifact | built on | applies at promote to |
|---|---|---|
| `output-structurer.js` | CS-BUILD `t4QvrtrPnTwRU6br` current (byte-identical to both live subs, sha `68bd130c…`) | **BOTH live subs, MANDATORY — `rysSPgUssLDf6xJc` AND `Fss5aAaXthJSWpZCgKiKR`**, node `output-structurer` in each. See the B2 note directly below. |
| `not-found-error-message.js` | **LIVE spine `9qVyfUxmRQqrpGRMDLRuz` current** (334 lines) | live spine `9qVyfUxmRQqrpGRMDLRuz` node `not-found-error-message` — applies cleanly, no rebase |
| `crossdomain-zeroset.js` | clone `txiPzSxy3Pclsz6v` current (byte-identical to live) | live spine `9qVyfUxmRQqrpGRMDLRuz` node `crossdomain-zeroset` |

### B2 — `output-structurer` must go to BOTH live subs (this supersedes the earlier "optional sync" wording)

My first pass mapped this artifact to `rysSPgUssLDf6xJc` alone and called `Fss5aAaXthJSWpZCgKiKR` an optional sync.
That was wrong. The reviewer enumerated every `executeWorkflow` node in both spines: **live splits its eight
`sub-get-results` call sites across two subs**, while the clone funnels all six of its call sites through the one sub
I edited — which is exactly why the UAC passed end to end and why the asymmetry was invisible from the clone.

| call site | LIVE `9qVyfUxmRQqrpGRMDLRuz` targets | CLONE `txiPzSxy3Pclsz6v` targets |
|---|---|---|
| `Call 'sub-get-results'` | `rysSPgUssLDf6xJc` | `t4QvrtrPnTwRU6br` |
| `probe-incoming` | `rysSPgUssLDf6xJc` | `t4QvrtrPnTwRU6br` |
| `tier-probe` | `rysSPgUssLDf6xJc` | *(not on clone)* |
| `sibling-probe` | **`Fss5aAaXthJSWpZCgKiKR`** | `t4QvrtrPnTwRU6br` |
| `crossdomain-probe` | **`Fss5aAaXthJSWpZCgKiKR`** | `t4QvrtrPnTwRU6br` |
| `dym-probe` | **`Fss5aAaXthJSWpZCgKiKR`** | `t4QvrtrPnTwRU6br` |
| `dym-probe-partial` | **`Fss5aAaXthJSWpZCgKiKR`** | `t4QvrtrPnTwRU6br` |
| `promo-dym-probe` | **`Fss5aAaXthJSWpZCgKiKR`** | *(not on clone)* |

Promoting only `rysSPgUssLDf6xJc` ships an **asymmetric bot**: the main stock answer names the empty company while the
crossdomain / sibling / did-you-mean answers do not, and the `_IDENTITY_KEYS` fix never reaches the projected
`incoming_stock` envelope that `crossdomain-probe` requests — the very path change 3 now deliberately routes both
companies into. Cost of doing it right is nil: both subs' `output-structurer` bodies are byte-identical today
(`68bd130cf367bb7aa644e6bb79194f7360c7430a8d2c6d642d3c2d80b6126935`), so the same artifact applies to both with no
rebase. Confirmed still true after the B1 republish: `rysSPgUssLDf6xJc` `v=av=eb0bbcec-…`,
`Fss5aAaXthJSWpZCgKiKR` `v=av=fd248b16-…`, both untouched.

**Promote order (LESSONS 37, subs before the spine):** `rysSPgUssLDf6xJc` → `Fss5aAaXthJSWpZCgKiKR` →
`9qVyfUxmRQqrpGRMDLRuz` (both spine nodes in one write).

## Zero-egress note
No egress node, connection, node-set, setting, or pinData was touched. Only `.parameters.jsCode` of the three named
Code nodes changed; the clone's five orphaned egress nodes and its eight `is_test=true` sub-calls are exactly as they
were. The clone has **no** Schedule Trigger node (only `executeWorkflowTrigger`), and `redis-pop-main-message-list`
pops `test:q:{{ $json.contact }}` — a per-contact test list, never the shared prod `main-message-list` — so editing
and republishing it cannot consume a prod item.

---

## 1. `output-structurer` — say which company came back empty

* **workflow** `sub-get-results CS-BUILD` (`t4QvrtrPnTwRU6br`) · **node** `output-structurer` (`n8n-nodes-base.code`)
* **baseline** CS-BUILD current, which is byte-identical to live sub `rysSPgUssLDf6xJc` (both sha `a05cb661…` as `jq -r` files)
* **lines** 310 → **378** (was 362 before the B1 fix)
* **sha256(`jsCode`)** old `68bd130cf367bb7aa644e6bb79194f7360c7430a8d2c6d642d3c2d80b6126935` → **new `25a2eed93b7fe677a6e1d7d9002522fc3051e4bae415ebe645377ad25f4973de`** (re-read from the server after publish: **MATCH**; the committed artifact was rewritten *from the server copy*, so it cannot drift from what is published)
* **published versionId** `4eb8ad78-d5af-42ef-b899-d9baec4e1efb` → `6dbcf061-d626-4bb6-b63b-7451aeb7f827` (first pass) → **`179f1842-8061-4e59-9c72-74ad2b602f29`** (B1 fix)
* ~~`8b68273f57f2151135b03a419597b1c521a82d0191396137f4c699f8b8ced1d4`~~ — superseded, do **not** promote that body

### Before / after intent
**Before.** The node rendered the envelope's rows through a generic field loop and stopped. On a multi-company
lookup where only one company had rows, the message showed that company's rows and said nothing at all about the
other — the answer read exactly like a single-company answer, so a customer whose product is stocked only in
Sorento could not tell whether Mocha had been checked and was empty, or never checked. On an entirely empty
multi-company lookup the CRM's own intro named both companies and n8n added nothing.

**After.** Three edits, all gated on `lookup_companies.length > 1`, i.e. all inert on a single-company reply:

1. `company_name` added to `_IDENTITY_KEYS`. **This one is load-bearing, not cosmetic.** The requested-attribute
   projection runs on the `incoming_stock` envelope and drops every keyed field that is neither identity nor
   requested — which included the CRM's new `company_name`. Proven offline: on a multi-company `incoming_stock`
   envelope the pre-change node rendered the row **without** the `*Company:* Mocha` line the CRM had put there.
   Inert on single-company lookups because the CRM emits no such field then.
2. A new block after the items loop names each `lookup_companies` entry that produced **no** rendered row, one line
   each: `*Mocha:* no stock records for MWC-SC08B.` The company set comes from the envelope; the codes come from the
   trigger's `entities` input (the gate's `compatible_entities`, deduped by `code`, so one code resolving in two
   companies is named once); the noun comes from the envelope's own `result_type` (`stock` → "stock records",
   `incoming_stock` → "incoming stock records"), so there is no local vocabulary table here to go stale — the same
   discipline the key-based projection is built on. Found rows are **not** re-labelled: they already carry the CRM's
   `Company` field and the existing generic field loop renders it.
3. `lookup_companies` is carried into the returned `json` via a conditional spread, so downstream state knows the
   answer spanned companies while a single-company reply's `json` keeps **exactly** the keys it has today. Gated on
   `> 1`, symmetric with the message gate (reviewer finding 1 — an asymmetric gate is how a "cannot occur" 1-element
   list turns into a stray key on a single-company reply).
4. **`_canAttribute` (reviewer B1).** The silent-company lines are emitted only when they *can* be true.

### B1 — the bug the reviewer caught, and the fix

My first pass asserted absence from a **negative**: a lookup company was called silent when its name was not found
among the rendered rows' `Company` fields. If the envelope returns rows carrying **no** company field at all,
`_shownCos` is empty and **every** lookup company gets declared silent — directly underneath the rows just printed:

```
1. *Product Code:* MWC-SC08B
*Quantity On Hand:* 12

*Mocha:* no stock records for MWC-SC08B.
*Sorento:* no stock records for MWC-SC08B.
```

The customer is shown 12 units and told in the same breath that neither company has any — a worse statement than the
one this block exists to fix. **And it is a live shape, not a hypothetical:** `lookup_companies` rides the *shared*
`ListResponse` passthrough and already reaches `incoming_stock` (exec `12774475`), while the leading `company_name`
row field is a *per-presenter* change; the reviewer scanned all 15 `t4QvrtrPnTwRU6br` executions this cycle and found
every multi-company envelope was empty and every non-empty envelope single-company — so the row half of the wire
contract has never actually been observed. My probe table asserted a partial case built on a fixture, and the fixture
was the assumption.

The fix is the rule the codebase already states three nodes over in `crossdomain-render`
(`// positive facts only — say nothing rather than assert absence`):

```js
const _canAttribute = !(e.items || []).length || _shownCos.size > 0;
```

— speak only when nothing was returned at all (so every lookup company genuinely came back empty), or when the rows
*are* company-attributed (so a company missing from `_shownCos` is genuinely silent). Rows present but unattributed ⇒
say nothing. The captain's reported empty-envelope case is unaffected, and the partial case still works.

### Offline behaviour probe — re-run after B1 (10 shapes, pure function replay, no execution)

Replayed three-way: the **pre-mc-label baseline** (`68bd130c…`), the **first publish** (`8b68273f…`, pre-B1) and the
**published body** (`25a2eed9…`). "identical to baseline" is the byte-for-byte no-regression claim.

| # | case | vs pre-mc-label baseline | vs first publish (pre-B1) | new behaviour |
|---|---|---|---|---|
| A | single-company, found rows, no `lookup_companies` | **identical** | identical | — |
| B | single-company **empty**, no `lookup_companies` | **identical** | identical | — |
| C | single-company `incoming_stock`, projection active | **identical** | identical | — |
| D | multi-company **empty** | differs (intended) | identical | `*Mocha:* no stock records for MWC-SC08B.` / `*Sorento:* …` |
| E | multi-company **partial**, rows attributed (Mocha only) | differs (intended) | identical | Mocha's row keeps its `*Company:*` line; `*Sorento:* no stock records…` follows |
| F | multi-company, **both** companies have attributed rows | differs (intended) | identical | both rows labelled, **no** silent line — nothing is silent |
| **G** | **B1 shape** — multi-company, rows present, **no** `company_name` | differs (intended) | **DIFFERS — the fix** | rows render, **no** silent lines (pre-B1 wrongly emitted both) |
| **H** | **B1 shape** on `incoming_stock` (the `crossdomain-probe` path) | differs (intended) | **DIFFERS — the fix** | rows render, **no** silent lines (pre-B1 wrongly emitted both) |
| I | multi-company `incoming_stock`, rows attributed | differs (intended) | identical | projection keeps the `*Company:*` line the pre-change node stripped; silent line still emitted |
| J | 1-element `lookup_companies` (finding 1) | **identical** | differs | the stray `lookup_companies` json key pre-B1 added to a single-company reply is gone; message was already identical |

G and H are the reviewer's B1 case and the reason for this revision; J is the endorsed finding 1. A, B, C and J are the
single-company no-regression guarantee — **byte-identical to the pre-mc-label baseline**, message *and* json keys.

### Unified diff (vs the CS-BUILD pre-change body — the whole mc-label change, B1 included)
```diff
--- a/output-structurer.js (CS-BUILD t4QvrtrPnTwRU6br, pre-change)
+++ b/output-structurer.js (published, incl. B1 fix)
@@ -76,6 +76,12 @@
     'product_code', 'product_name', 'shipment_number', 'shipping_container_number',
     'batch_number', 'remaining_incoming_quantity', 'warehouse_allocations',
     'unallocated_quantity', 'warehouse', 'system_location', 'quantity_on_hand',
+    // mc-label (2026-08-17). `company_name` (sorento_crm PR #193) is IDENTITY: it says which
+    // company's row this is. The projection above only ever meets it on the incoming_stock
+    // envelope, and without this line it would strip the Company field off every row on exactly
+    // the answers that exist to show it — a two-company answer would read as a one-company
+    // answer. Inert on single-company lookups: the CRM emits no such field there at all.
+    'company_name',
   ]);
   let _reqAttrs = [];
   try {
@@ -285,6 +291,62 @@
     else if (it.flags && it.flags.partially_allocated) line += '\n🚩  *(PARTIAL ALLOCATION)*';
     msg += line + '\n\n';
   });
+
+  // ── multi-company: name the companies that came back EMPTY (mc-label 2026-08-17) ─────
+  // sorento_crm PR #193 stamps `lookup_companies` on a list envelope ONLY when the lookup spans
+  // more than one company (companies of the products asked about UNION companies of the rows
+  // returned). A single-company reply carries no such key, so everything below is inert there and
+  // the message stays byte-identical to what it was.
+  //
+  // A FOUND row already says which company it belongs to — the CRM prepends a
+  // {key:'company_name', label:'Company'} field and the generic field loop above renders it, so
+  // nothing is duplicated here. What the customer cannot see is the company that WAS searched and
+  // returned nothing: the answer silently reads as though only one company exists. Say it, once
+  // per silent company, keyed to the companies actually looked up — never to the caller's access
+  // list, which names companies this question never touched.
+  const _lookupCos = Array.isArray(e.lookup_companies) ? e.lookup_companies : [];
+  if (_lookupCos.length > 1) {
+    const _coOfRow = (it) => {
+      const f = ((it && it.fields) || []).find(
+        x => x && (String(x.key || '') === 'company_name' || x.label === 'Company'));
+      return f ? String(f.value ?? '').trim() : '';
+    };
+    const _shownCos = new Set((e.items || []).map(_coOfRow).filter(Boolean));
+    // B1 (reviewer, 2026-08-17). NEVER assert absence from a NEGATIVE. If rows were rendered but
+    // not one of them carries a Company field, the CRM did not stamp them — and that is a live
+    // shape, not a hypothetical: `lookup_companies` rides the SHARED ListResponse passthrough and
+    // already reaches `incoming_stock` (exec 12774475), while the leading `company_name` row field
+    // is a per-presenter change. In that case `_shownCos` is empty and EVERY lookup company would
+    // be declared silent directly underneath the rows we just printed:
+    //   1. *Product Code:* MWC-SC08B / *Qty:* 12
+    //   *Mocha:* no stock records for MWC-SC08B.
+    // — a worse statement than the one this block exists to fix. So speak only when we CAN tell:
+    // either nothing was returned at all (every lookup company genuinely came back empty), or the
+    // rows are company-attributed, in which case a company missing from `_shownCos` is genuinely
+    // silent. Rows present but unattributed ⇒ say nothing. Same rule `crossdomain-render` states
+    // three nodes over: "positive facts only — say nothing rather than assert absence".
+    const _canAttribute = !(e.items || []).length || _shownCos.size > 0;
+    // Codes come from the entities the gate resolved and the tool was actually asked about — the
+    // same set the CRM derived the company span from. `code` is the canonical code the customer
+    // recognises (MWC-SC08B), never a uuid. Deduped: one code resolving in two companies arrives
+    // twice, and naming it twice would read as two products.
+    let _codes = [];
+    try {
+      const _ents0 = $('When Executed by Another Workflow').first().json.entities;
+      const _ents = (typeof _ents0 === 'string' ? safe(_ents0) : _ents0) || [];
+      _codes = [...new Set((Array.isArray(_ents) ? _ents : [])
+        .map(x => String((x && x.code) ?? '').trim()).filter(Boolean))];
+    } catch (err) { _codes = []; }
+    // The noun comes from the envelope's own `result_type`, so there is no local vocabulary here
+    // to go stale — the same discipline the key-based projection above is built on.
+    const _noun = String(e.result_type || '').replace(/_/g, ' ').trim();
+    const _what = (_noun ? `${_noun} records` : 'records')
+      + (_codes.length ? ` for ${_codes.join(', ')}` : '');
+    const _silent = _lookupCos
+      .map(c => String((c && c.name) ?? '').trim())
+      .filter(n => n && !_shownCos.has(n));
+    if (_canAttribute && _silent.length) msg += _silent.map(n => `*${n}:* no ${_what}.`).join('\n') + '\n\n';
+  }
 
   if (_accessNotes.length) msg += _accessNotes.join('\n') + '\n\n';
 
@@ -307,4 +369,10 @@
     // A sustained false here with a non-empty requested_attributes means the MCP process
     // needs restarting, NOT that the parser stopped emitting keys.
     keys_served: _anyKeyed,
+    // mc-label (2026-08-17): carried through so downstream state knows the answer spanned more
+    // than one company. Spread-in rather than defaulted to null, so a single-company reply's json
+    // keeps EXACTLY the keys it has today.
+    // `> 1` matches the MESSAGE gate above. The contract says a 1-element list cannot occur, but
+    // asymmetric gates are how a "cannot occur" turns into a stray key on a single-company reply.
+    ...(_lookupCos.length > 1 ? { lookup_companies: _lookupCos } : {}),
   } }];
\ No newline at end of file
```

### Isolated B1 fix hunk (first publish `8b68273f…` → published `25a2eed9…`)
```diff
--- a/output-structurer.js (first publish, pre-B1)
+++ b/output-structurer.js (B1 fix, published)
@@ -312,6 +312,20 @@
       return f ? String(f.value ?? '').trim() : '';
     };
     const _shownCos = new Set((e.items || []).map(_coOfRow).filter(Boolean));
+    // B1 (reviewer, 2026-08-17). NEVER assert absence from a NEGATIVE. If rows were rendered but
+    // not one of them carries a Company field, the CRM did not stamp them — and that is a live
+    // shape, not a hypothetical: `lookup_companies` rides the SHARED ListResponse passthrough and
+    // already reaches `incoming_stock` (exec 12774475), while the leading `company_name` row field
+    // is a per-presenter change. In that case `_shownCos` is empty and EVERY lookup company would
+    // be declared silent directly underneath the rows we just printed:
+    //   1. *Product Code:* MWC-SC08B / *Qty:* 12
+    //   *Mocha:* no stock records for MWC-SC08B.
+    // — a worse statement than the one this block exists to fix. So speak only when we CAN tell:
+    // either nothing was returned at all (every lookup company genuinely came back empty), or the
+    // rows are company-attributed, in which case a company missing from `_shownCos` is genuinely
+    // silent. Rows present but unattributed ⇒ say nothing. Same rule `crossdomain-render` states
+    // three nodes over: "positive facts only — say nothing rather than assert absence".
+    const _canAttribute = !(e.items || []).length || _shownCos.size > 0;
     // Codes come from the entities the gate resolved and the tool was actually asked about — the
     // same set the CRM derived the company span from. `code` is the canonical code the customer
     // recognises (MWC-SC08B), never a uuid. Deduped: one code resolving in two companies arrives
@@ -331,7 +345,7 @@
     const _silent = _lookupCos
       .map(c => String((c && c.name) ?? '').trim())
       .filter(n => n && !_shownCos.has(n));
-    if (_silent.length) msg += _silent.map(n => `*${n}:* no ${_what}.`).join('\n') + '\n\n';
+    if (_canAttribute && _silent.length) msg += _silent.map(n => `*${n}:* no ${_what}.`).join('\n') + '\n\n';
   }
 
   if (_accessNotes.length) msg += _accessNotes.join('\n') + '\n\n';
@@ -358,5 +372,7 @@
     // mc-label (2026-08-17): carried through so downstream state knows the answer spanned more
     // than one company. Spread-in rather than defaulted to null, so a single-company reply's json
     // keeps EXACTLY the keys it has today.
-    ...(_lookupCos.length ? { lookup_companies: _lookupCos } : {}),
+    // `> 1` matches the MESSAGE gate above. The contract says a 1-element list cannot occur, but
+    // asymmetric gates are how a "cannot occur" turns into a stray key on a single-company reply.
+    ...(_lookupCos.length > 1 ? { lookup_companies: _lookupCos } : {}),
   } }];
\ No newline at end of file
```


### Review-2 dispositions on `output-structurer` (accepted as-is, no code change)

**MAJOR-1 — the silent-company line names the UNION of requested codes, not that company's own codes.**
`*Sorento:* no stock records for MWC-SC08B, ZZ1.` lists every code the turn asked about, even if Sorento's catalogue
only ever contained one of them. **Accepted, and the statement is still factually true:** the tool was called once with
every product id under the full scope, so a company that returned zero rows returned zero rows *for all of them*.
Refining to per-company codes is not derivable here — for a **silent** company the envelope carries no row, therefore
no `company_id`, therefore nothing to join its codes on; `lookup_companies` gives names and ids only, and
`compatible_entities` (the code source) carries no company. The only way to compute it would be a second CRM read purely
to attribute codes we already know returned nothing. Not worth it, and the current sentence is not wrong.

**MAJOR-2 — the `_shownCos` join is an exact string match between two backend-supplied names.**
Row `company_name` and `lookup_companies[].name` must agree byte-for-byte or a company with rows is wrongly declared
silent. **Structurally prevented backend-side:** both originate from the *same* `names` map inside PR #193's single
`stamp_lookup_companies` — one batched `db.query(Company.id, Company.name)` — which is then used for both
`row["company_name"] = name` and `payload["lookup_companies"] = [{"id": cid, "name": names.get(cid)}]`. One query, one
map, two consumers: a format divergence cannot arise without splitting the sources.

> **NAMED CONTRACT DEPENDENCY.** If the backend ever sources row `company_name` and `lookup_companies[].name`
> separately (a second query, a different column, per-presenter formatting, or trimming/casing on one side only), the
> exact-string join in `_coOfRow`/`_shownCos` breaks **toward false silent lines** — a company that did return rows gets
> a "no records" line under it. The B1 `_canAttribute` guard does **not** catch this: rows would still be attributed, so
> `_shownCos` is non-empty and the block still speaks. If that change is ever made, join on `company_id` instead (the
> ids are already on both sides — `lookup_companies[].id` and the row's `company_id`) and this becomes drift-proof.

---

## 2. `not-found-error-message` — qualify the resolved entities, and name the companies searched

* **workflow** `sorento-consume-main TEST` (clone spine, `txiPzSxy3Pclsz6v`) · **node** `not-found-error-message` (`n8n-nodes-base.code`)
* **baseline** the **LIVE** spine's current body (334 lines). The clone's own copy was 65 lines **behind** live; building
  on the clone would have regressed live at promote, so the published body is live + this change.
* **lines** 334 → **404** (was 374 before revision 2)
* **sha256(`jsCode`)** old (live) `d796e28d84e302130546e750eafaa901f9d5cfb81093a4f401c616536891fee3` → **new `79888de7862725448d10fd0210bf8d8dcf1da6fbd131b1c3427ddc94db2f3da1`** (re-read from the server after publish: **MATCH**; artifact rewritten from the server copy)
* ~~`cfd8a3804d2f4cb28acd247bc990692b19f8e58379728a2a923655c9ead982cb`~~ — revision-1 body, superseded, do **not** promote

> **Reviewer/tester flag — this publish also imports the live→clone drift.** Three pre-existing live hunks that the
> clone did not have now run on the clone: the `_entitlementMiss` promotion arm, the
> "nothing resolved at all" `Couldn't find: "x". Would you like me to escalate…` arm, and the `gate.access_notice`
> prefix. They are additive and were live-proven, but they are **not** part of `mc-label` — a behaviour delta on a
> promotion or zero-resolution UAC case is expected and is the drift, not this change. The clone's
> `disallowed-entity-gate` is *also* behind live and does not emit `access_notice`/`resolved_company`, so the
> `gate.access_notice` prefix is simply falsy on the clone (graceful, no error). The full drift diff is at the end
> of this document.

### Before / after intent
**Before.** `_byType` deduped its entries **on the label string**. When one typed code exists in two companies the
resolver returns two matches with the *same* `canonical_code`, so both collapsed into one bullet:
`• product: MWC-SC08B`. The message then said `But no inventory matched these.` — one product named where two were
searched, and a sentence that reads as one company's answer.

**After.** Four edits, all gated on the searched-company set having more than one member — every single-company turn
is byte-identical:

1. `_coByUuid`: uuid → `company_name`, built from the `_allMatches` already assembled in this node. The field is the
   same one `disallowed-entity-gate`'s `#9 multi-company routing` block already reads, so this adds **no** new CRM
   dependency.
2. `_searchedCos` / `_multiCo`: the distinct company set of **`gate.compatible_entities`** — the entities actually
   sent to the tool. Deliberately not the caller's access list (captain's rule).
3. Labels become `MWC-SC08B (Mocha)` / `MWC-SC08B (Sorento)` in the multi-company case only, and `_foundLines` names
   *all* of them rather than `codes[0] (+1 more)` — the "+1 more" would hide the exact fact this change exists to
   state. The typed-code-first reorder (`_tokSet`) learned to compare against the label with the ` (Company)` suffix
   stripped, **only** when `_multiCo`; stripping unconditionally would have started reordering order labels such as
   `DO123 (Acme Sdn Bhd)` that do not reorder today.
4. `buildBreakdownMsg` appends ` — checked in Mocha and Sorento` (`A, B and C` beyond two) to the
   "no … matched these" sentence. `_coSuffix` is `''` on one company, so that sentence is unchanged there. The
   `_entitlementMiss` arm deliberately does **not** take the suffix: it is about a promotion being withheld from
   this contact, not about where we looked.

### FIX 1 (review 2) — the `(+N more)` cap must count DISTINCT CODES, not labels

My revision-1 arm was `if (_multiCo) { _foundLines.push(`• ${et}: ${codes.join(', ')}`); continue; }` — it skipped the
cap **for the whole turn** whenever any two companies were in play. The reasoning ("the extra entries are the same code
in another company") is true for *one* code and false for the *turn*: a turn resolving eight distinct products in a
multi-company set dumped all eight into the WhatsApp reply. The cap is not incidental — it is what keeps this line a
summary.

The fix groups each type's labels by their **bare code** (insertion order preserved, so the typed-code-first reorder
still chooses the representative), renders the representative group **in full** — naming its company variants is the
entire point of the qualification — and counts the remaining **distinct codes**:

```js
const extra = _order.length > 1 ? ` (+${_order.length - 1} more)` : '';
_foundLines.push(`• ${et}: ${_byCode.get(_order[0]).join(', ')}${extra}`);
```

Single-company is byte-identical by construction: `_bareLabel` is the identity there, so every label is its own group
and this collapses to exactly `codes[0]` + `(+N more)`.

### VERIFY 3 (review 2) — investigated, found REACHABLE, narrowed

**Question.** `_searchedCos` was computed over **all** `compatible_entities` regardless of `entity_type`. Can the gate
emit types that span companies but never reach the tool — making " — checked in Mocha and Sorento" a false statement
about work not done?

**Gate evidence** (`disallowed-entity-gate` fetched fresh from `txiPzSxy3Pclsz6v`, sha `7d6ad3ac6053…`). Its matrix:

```js
inventory:          ['product', 'category', 'brand'],
incoming:           ['product', 'inbound_shipment', 'category', 'brand'],
promotion:          ['product', 'promotion', 'category', 'brand'],
order:              ['order', 'customer_order', 'transporter', 'customer', 'product'],
```

and the only narrowing after it is `compatible_entities = entities.filter(e => allowed.includes(e.entity_type))` (plus
did-you-mean/document-class narrowing that never restricts to products). Cross-referencing every allowed type against
`entity-ids-transformer`'s `TYPE_TO_PARAM` in `sub-get-results`:

| | types |
|---|---|
| `TYPE_TO_PARAM` keys (reach the tool as ids) | `attachment, attachment_type, certificate, customer, customer_order, form, inbound_shipment, order, order_number, product, promotion, shipment, transporter` |
| allowed by the gate across all domains | `attachment, attachment_type, brand, category, certificate, customer, customer_order, form, inbound_shipment, order, product, promotion, transporter` |
| **allowed but reaching NO tool param** | **`brand`, `category`** |

**Conclusion: REACHABLE.** The reviewer's literal example (a `customer` on `domain_hint=inventory`) is *not* reachable —
`customer` is absent from `ALLOWED.inventory` — but `category` and `brand` are, on inventory, incoming, promotion,
master_products and product_attachment alike. The gate passes them for compatibility and the transformer then drops them
as `unmapped_types`, so a category resolved in Mocha beside a product resolved in Sorento produced
" — checked in Mocha and Sorento" for a lookup that only ever queried Sorento's product id. I also sampled 30 recent
spine executions (667 resolver matches): `company_name` is carried on `product`, `customer`, `promotion`,
`customer_order` and (null-valued) `attachment_type` — so the field is real and general; no `brand`/`category` match
appeared in that sample, which makes this rare rather than impossible.

**Narrowing chosen** — exclude the types that carry no tool parameter:

```js
const _NO_TOOL_ID = new Set(['brand', 'category']);
```

A **deny**-list rather than an allow-list, deliberately: every other allowed type does carry a tool param today, and if
the CRM later gives `category` one, this **under**-claims (omits a company we did search) instead of over-claiming.
Silence is recoverable; a false statement about work not done is not. This touches `_searchedCos` only — `_byType` still
renders brand/category bullets exactly as before.

### Offline behaviour probe — re-run after review 2 (8 shapes, three-way replay)

Replayed against the **live pre-change body**, the **revision-1 publish** (`cfd8a380…`) and the **published body**
(`79888de7…`).

| # | case | vs live baseline | vs rev-1 publish | rendered |
|---|---|---|---|---|
| 1 | single company, 1 code | **identical** | identical | `• product: MWC-SC08B` |
| 2 | single company, **8 distinct products** | **identical** | identical | `• product: P0 (+7 more)` |
| 3 | multi, one code × 2 companies | differs (intended) | identical | `• product: MWC-SC08B (Mocha), MWC-SC08B (Sorento)` — no cap, correctly |
| **4** | **multi, 8 distinct products** | differs (intended) | **DIFFERS — FIX 1** | `• product: P0 (Mocha) (+7 more)`; rev-1 dumped all eight |
| **5** | **multi, rep × 2 companies + 3 other codes** | differs (intended) | **DIFFERS — FIX 1** | `• product: MWC-SC08B (Mocha), MWC-SC08B (Sorento) (+3 more)`; rev-1 listed all five |
| **6** | **VERIFY 3** — product (Sorento) + **category** (Mocha) | **identical** | **DIFFERS — VERIFY 3** | no suffix, no qualification; rev-1 falsely said "checked in Sorento and Mocha" |
| **7** | **VERIFY 3** — product (Sorento) + **brand** (Mocha) | **identical** | **DIFFERS — VERIFY 3** | as above |
| 8 | VERIFY 3 must not over-narrow: order (Sorento) + **customer** (Mocha) | differs (intended) | identical | still multi — `customer` does reach a tool param |

Case 8 is the guard against over-narrowing, and cases 6/7 return to **byte-identity with the live baseline**, because
once the non-queried type is excluded the turn is single-company and nothing should have changed at all.

### Unified diff (vs the LIVE pre-change body — the whole mc-label change, revision 2 included)
```diff
--- a/not-found-error-message.js (LIVE spine, pre-change)
+++ b/not-found-error-message.js (published, incl. review-2 fixes)
@@ -137,12 +137,55 @@
   for (const res of (Array.isArray(r?.resolutions) ? r.resolutions : [])) {
     if ((res.matches ?? []).some(m => _compatUuids.has(m.uuid))) _resolvedToks.add(normRaw(res.token));
   }
+  // ── multi-company: which company each resolved entity belongs to (mc-label 2026-08-17) ──
+  // The resolver stamps `company_name` on every match — the same field disallowed-entity-gate's
+  // #9 routing block already reads, so this adds no new dependency on the CRM.
+  // The problem: one typed code can exist in TWO companies, and the resolver returns one match
+  // per company with the SAME canonical_code. The dedup below is on the LABEL STRING, so the two
+  // collapse into one bullet — "• product: MWC-SC08B" says one product where two were searched,
+  // and the "no ... matched these" that follows reads as one company's answer.
+  const _coByUuid = new Map();
+  for (const m of _allMatches) {
+    const cn = String((m && m.company_name) ?? '').trim();
+    if (m && m.uuid && cn && !_coByUuid.has(m.uuid)) _coByUuid.set(m.uuid, cn);
+  }
+  // Keyed to what was ACTUALLY sent to the tool (`_compat`), NEVER to the caller's access list:
+  // a contact entitled to three companies who asked about a one-company product searched ONE, and
+  // "checked in Mocha, Sorento and Cabana" would be a false statement about work never done.
+  // VERIFY 3 (review 2, 2026-08-17). Only entity types that actually become TOOL IDS may
+  // contribute to a claim about what was searched. `sub-get-results`' entity-ids-transformer maps
+  // entity_type -> an `*_ids` tool param, and `brand` / `category` appear in NEITHER map: the gate
+  // lets them through for compatibility (ALLOWED.inventory = ['product','category','brand'],
+  // ALLOWED.incoming adds inbound_shipment) and the transformer then drops them as
+  // `unmapped_types`. So a category or brand resolved in Mocha, beside a product resolved in
+  // Sorento, would make " — checked in Mocha and Sorento" a false statement about a lookup that
+  // only ever queried Sorento's product id.
+  // DENY-list, not an allow-list, ON PURPOSE: every other allowed type (product, promotion, order,
+  // customer_order, customer, transporter, form, inbound_shipment, attachment, attachment_type,
+  // certificate) does carry a tool param today, and if the CRM later gives `category` one this
+  // UNDER-claims — it omits a company we did search — instead of over-claiming. Silence is
+  // recoverable; a false statement about work not done is not.
+  const _NO_TOOL_ID = new Set(['brand', 'category']);
+  const _searchedCos = [...new Set(_compat
+    .filter(c => !_NO_TOOL_ID.has(String((c && c.entity_type) ?? '')))
+    .map(c => _coByUuid.get(c.uuid)).filter(Boolean))];
+  const _multiCo = _searchedCos.length > 1;
+  // "Mocha and Sorento"; "A, B and C" beyond two.
+  const _andList = (a) => a.length <= 1
+    ? (a[0] || '')
+    : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;
+
   const _byType = new Map();
   for (const c of _compat) {
     const et = c.entity_type || 'item';
     // prefer the human display (e.g. promotion description) over a raw UUID code
-    const label = _dispByUuid.get(c.uuid) || c.code || c.uuid;
-    if (!label) continue;
+    const base = _dispByUuid.get(c.uuid) || c.code || c.uuid;
+    if (!base) continue;
+    const _co = _coByUuid.get(c.uuid);
+    // Qualify ONLY in the multi-company case. One company keeps today's bare label byte for byte,
+    // and "MWC-SC08B (Sorento)" on a single-company answer would be noise about a distinction the
+    // customer has no reason to care about.
+    const label = (_multiCo && _co) ? `${base} (${_co})` : base;
     if (!_byType.has(et)) _byType.set(et, []);
     const arr = _byType.get(et);
     if (!arr.includes(label)) arr.push(label);
@@ -151,8 +194,13 @@
   // representative. `_compat` order is arbitrary, so codes[0] could name a sibling variant
   // (SRTSH1040-T for a typed SRTSH1040), reading as if we looked up a different product.
   const _tokSet = new Set(tokens.map(t => String(t ?? '').trim().toLowerCase()).filter(Boolean));
+  // mc-label: the label may now carry a " (Company)" suffix, which no typed token will ever match.
+  // Strip it for the comparison ONLY in the multi-company case — an order label is legitimately
+  // `DO123 (Acme Sdn Bhd)`, and stripping unconditionally would start reordering single-company
+  // types that do not reorder today.
+  const _bareLabel = (l) => _multiCo ? String(l).replace(/\s+\([^)]*\)$/, '') : String(l);
   for (const arr of _byType.values()) {
-    const i = arr.findIndex(l => _tokSet.has(String(l).trim().toLowerCase()));
+    const i = arr.findIndex(l => _tokSet.has(_bareLabel(l).trim().toLowerCase()));
     if (i > 0) arr.unshift(arr.splice(i, 1)[0]);
   }
   // ── entitlement miss ≠ data miss ─────────────────────────────────────────────
@@ -201,9 +249,26 @@
 
   const _foundLines = [];
   for (const [et, codes] of _byType) {
-    // one representative per type + count; true ambiguity is handled by the gate (did-you-mean)
-    const extra = codes.length > 1 ? ` (+${codes.length - 1} more)` : '';
-    _foundLines.push(`• ${et}: ${codes[0]}${extra}`);
+    // one representative per type + count; true ambiguity is handled by the gate (did-you-mean).
+    // FIX 1 (review 2, 2026-08-17). The cap is over DISTINCT CODES, not over labels. My first
+    // version skipped it entirely whenever `_multiCo`, on the reasoning that the extra entries are
+    // the same code in another company — true for ONE code, false for the turn: a turn that
+    // resolved eight distinct products in a multi-company set dumped all eight into the WhatsApp
+    // reply. The cap is not incidental, it is what keeps this line a summary.
+    // So: group the type's labels by their BARE code (insertion order preserved, so the
+    // typed-code-first reorder above still chooses the representative), render the representative
+    // group IN FULL — naming its company variants is the entire point of the qualification — and
+    // count the remaining DISTINCT CODES. Single-company is byte-identical: `_bareLabel` is the
+    // identity there, so every label is its own group and this collapses to `codes[0]` + (+N).
+    const _order = [];
+    const _byCode = new Map();
+    for (const l of codes) {
+      const bare = _bareLabel(l);
+      if (!_byCode.has(bare)) { _byCode.set(bare, []); _order.push(bare); }
+      _byCode.get(bare).push(l);
+    }
+    const extra = _order.length > 1 ? ` (+${_order.length - 1} more)` : '';
+    _foundLines.push(`• ${et}: ${_byCode.get(_order[0]).join(', ')}${extra}`);
   }
   _found_summary = _foundLines.join('\n');   // datemiss-summary: reused by build-suggest-offer
   // tokens the user gave that resolved to NOTHING (exclude those that resolved via fallback tiers)
@@ -211,13 +276,18 @@
   const _useBreakdown = _foundLines.length > 0;
   // notFoundRaw override lets a branch fold some unresolved tokens into the searched noun
   // instead of listing them as "couldn't find" (e.g. attachment qualifiers like "SPAN").
+  // mc-label: state the SEARCH SCOPE, so "nothing matched" cannot be read as "nothing matched in
+  // the one company you were thinking of". Empty on a single-company turn, which keeps the
+  // sentence byte-identical there. `_entitlementMiss` deliberately does not take it — that arm is
+  // about a promotion being withheld from this contact, not about where we looked.
+  const _coSuffix = _multiCo ? ` — checked in ${_andList(_searchedCos)}` : '';
   const buildBreakdownMsg = (domainWord, notFoundRaw) => {
     const nf = (notFoundRaw ?? _notFoundRaw).map(t => `"${t}"`);
     const parts = [];
     if (_foundLines.length) parts.push(`Here's what you want:\n${_foundLines.join('\n')}`);
     if (nf.length) parts.push(`Couldn't find: ${nf.join(', ')}.`);
     parts.push(_entitlementMiss
-      || `But no${active_inactive} ${domainWord}${dateRange}${access} matched these. Would you like me to escalate to ${team} team?`);
+      || `But no${active_inactive} ${domainWord}${dateRange}${access} matched these${_coSuffix}. Would you like me to escalate to ${team} team?`);
     return parts.join('\n\n');
   };
 
```

### Isolated review-2 hunks (rev-1 `cfd8a380…` → published `79888de7…`)
```diff
--- a/not-found-error-message.js (review-1 publish)
+++ b/not-found-error-message.js (review-2: FIX 1 + VERIFY 3)
@@ -152,7 +152,23 @@
   // Keyed to what was ACTUALLY sent to the tool (`_compat`), NEVER to the caller's access list:
   // a contact entitled to three companies who asked about a one-company product searched ONE, and
   // "checked in Mocha, Sorento and Cabana" would be a false statement about work never done.
-  const _searchedCos = [...new Set(_compat.map(c => _coByUuid.get(c.uuid)).filter(Boolean))];
+  // VERIFY 3 (review 2, 2026-08-17). Only entity types that actually become TOOL IDS may
+  // contribute to a claim about what was searched. `sub-get-results`' entity-ids-transformer maps
+  // entity_type -> an `*_ids` tool param, and `brand` / `category` appear in NEITHER map: the gate
+  // lets them through for compatibility (ALLOWED.inventory = ['product','category','brand'],
+  // ALLOWED.incoming adds inbound_shipment) and the transformer then drops them as
+  // `unmapped_types`. So a category or brand resolved in Mocha, beside a product resolved in
+  // Sorento, would make " — checked in Mocha and Sorento" a false statement about a lookup that
+  // only ever queried Sorento's product id.
+  // DENY-list, not an allow-list, ON PURPOSE: every other allowed type (product, promotion, order,
+  // customer_order, customer, transporter, form, inbound_shipment, attachment, attachment_type,
+  // certificate) does carry a tool param today, and if the CRM later gives `category` one this
+  // UNDER-claims — it omits a company we did search — instead of over-claiming. Silence is
+  // recoverable; a false statement about work not done is not.
+  const _NO_TOOL_ID = new Set(['brand', 'category']);
+  const _searchedCos = [...new Set(_compat
+    .filter(c => !_NO_TOOL_ID.has(String((c && c.entity_type) ?? '')))
+    .map(c => _coByUuid.get(c.uuid)).filter(Boolean))];
   const _multiCo = _searchedCos.length > 1;
   // "Mocha and Sorento"; "A, B and C" beyond two.
   const _andList = (a) => a.length <= 1
@@ -233,12 +249,26 @@
 
   const _foundLines = [];
   for (const [et, codes] of _byType) {
-    // mc-label: in the multi-company case the extra entries are the SAME code in another company,
-    // not other products, so "(+1 more)" hides the one fact this change exists to state. Name them.
-    if (_multiCo) { _foundLines.push(`• ${et}: ${codes.join(', ')}`); continue; }
-    // one representative per type + count; true ambiguity is handled by the gate (did-you-mean)
-    const extra = codes.length > 1 ? ` (+${codes.length - 1} more)` : '';
-    _foundLines.push(`• ${et}: ${codes[0]}${extra}`);
+    // one representative per type + count; true ambiguity is handled by the gate (did-you-mean).
+    // FIX 1 (review 2, 2026-08-17). The cap is over DISTINCT CODES, not over labels. My first
+    // version skipped it entirely whenever `_multiCo`, on the reasoning that the extra entries are
+    // the same code in another company — true for ONE code, false for the turn: a turn that
+    // resolved eight distinct products in a multi-company set dumped all eight into the WhatsApp
+    // reply. The cap is not incidental, it is what keeps this line a summary.
+    // So: group the type's labels by their BARE code (insertion order preserved, so the
+    // typed-code-first reorder above still chooses the representative), render the representative
+    // group IN FULL — naming its company variants is the entire point of the qualification — and
+    // count the remaining DISTINCT CODES. Single-company is byte-identical: `_bareLabel` is the
+    // identity there, so every label is its own group and this collapses to `codes[0]` + (+N).
+    const _order = [];
+    const _byCode = new Map();
+    for (const l of codes) {
+      const bare = _bareLabel(l);
+      if (!_byCode.has(bare)) { _byCode.set(bare, []); _order.push(bare); }
+      _byCode.get(bare).push(l);
+    }
+    const extra = _order.length > 1 ? ` (+${_order.length - 1} more)` : '';
+    _foundLines.push(`• ${et}: ${_byCode.get(_order[0]).join(', ')}${extra}`);
   }
   _found_summary = _foundLines.join('\n');   // datemiss-summary: reused by build-suggest-offer
   // tokens the user gave that resolved to NOTHING (exclude those that resolved via fallback tiers)
```

---

## 3. `crossdomain-zeroset` — probe every company's product, not just the first

* **workflow** `sorento-consume-main TEST` (clone spine, `txiPzSxy3Pclsz6v`) · **node** `crossdomain-zeroset` (`n8n-nodes-base.code`)
* **baseline** clone current, **byte-identical to the live spine's copy** (both sha `2c3b4fff…` as `jq -r` files)
* **lines** 104 → **143** (was 138 before revision 2)
* **sha256(`jsCode`)** old `2eef3fa37454d5931e50747631df0463e152afdd58e6aeecea0a804040646245` → **new `a880d01e3629538bdde874f60875b481af7415acb6c7f12d4795171074518f92`** (re-read from the server after publish: **MATCH**; artifact rewritten from the server copy)
* ~~`2c562c7e974fa043e5bffe12b10ab97ed523c19df04196a1980119a2e4d4ff42`~~ — revision-1 body, superseded, do **not** promote

### Before / after intent
**Before.** The requested set is deduped by **code**, and both `_add()` and `_uuidByCode` were **first-wins** on the
uuid. A code that exists in two companies produced two resolver matches with the same `canonical_code`, so the
second company's uuid was silently discarded: `probe_entities` carried one uuid, the cross-domain probe asked the
other tool about **one** company's product, and the second company was reported to the customer as plainly absent
when it had never been asked about.

**After.** Every uuid per code is kept and the requested id set becomes the **union**:

* `_add()` accumulates into a new `uuids` array. `uuid` still holds the first one, so `missing[].uuid` and the
  `probeable = missing.filter(m => m.uuid)` filter keep the exact shape their consumers read.
  **FIX 2 (review 2):** revision 1 also carried `if (!ex.uuid) ex.uuid = ex.uuids[0] || null;`. That backfill reaches
  outside this change's blast radius — on a turn where the FIRST `_add` for a code carried no uuid and a later one did,
  it promoted the entry into `probeable` and flipped `_xd.active` **false → true**, starting a cross-domain probe that
  does not run today. Removed; `uuid` keeps first-add semantics exactly as before mc-label. The `uuids` union
  accumulation itself is unchanged — that is the actual feature.
* `_uuidByCode` maps code → **all** uuids (it feeds the DYM-picked `_add` calls, which now accept an array).
* `missing[]` gains a `uuids` key **only when the code really spans companies** — so a single-company turn's
  `_xd.missing` keeps exactly the keys it has today. This matters: `_xd.missing` is read by `crossdomain-render`
  (`m._n`) and `compile-current-state` (`m.code`), and it rides into the persisted turn state.
* `probe_entities` becomes one entry per `(code, uuid)`. `sub-get-results`' `entity-ids-transformer` dedupes on
  **uuid** into `product_ids`, so repeating the code across entries is exactly how both companies reach the tool.

### Downstream consumers checked (all in the same workflow, none needing a change)
| consumer | reads | effect |
|---|---|---|
| `crossdomain-gate` (IF) | `_xd.active` | unchanged |
| `crossdomain-probe` (executeWorkflow → `t4QvrtrPnTwRU6br`) | `_xd.probe_entities` as `entities`, `.map(e => e.code)` in the prompt string | now sends both uuids; the prompt string repeats the code once per company (cosmetic, LLM hint only — the node's params were **not** edited) |
| `crossdomain-render` | `zs.missing[]._n`, `zs.origin_domain`, `zs.team` | unchanged; the extra `uuids` key is inert |
| `compile-current-state` | `zs.missing[].code` | unchanged; the extra `uuids` key is inert |
| `attach-merge` | `_xdBlock` | untouched |

### Offline behaviour probe — re-run after review 2 (6 shapes, three-way replay)

Replayed against the **live/clone pre-change body**, the **revision-1 publish** (`2c562c7e…`) and the **published body**
(`a880d01e…`). Compared on the whole `_xd` object.

| # | case | vs pre-change baseline | vs rev-1 publish | `_xd` |
|---|---|---|---|---|
| 1 | single company, exact | **identical** | identical | `active:true`, one uuid |
| 2 | two companies, both missing | differs (intended) | identical | `missing[0].uuids:["u1","u2"]`, 2 `probe_entities` |
| **3** | **FIX 2 shape** — first `_add` for the code is uuid-less, a later resolution supplies one | **identical** | **DIFFERS — FIX 2** | new: `active:false`, `uuid:null`, no probe. Rev-1: `active:true`, `uuid:"u9"`, **a probe that does not run today** |
| 4 | DYM-picked, single company | **identical** | identical | unchanged |
| 5 | DYM-picked spanning two companies | differs (intended) | identical | union via the rewritten `_uuidByCode` |
| 6 | a row was returned ⇒ nothing missing | **identical** | identical | `active:false`, `missing:[]` |

Case 3 reproduces the reviewer's finding exactly, and the fixed body is **byte-identical to the pre-change baseline**
there — which is the whole point: that shape is outside what mc-label was supposed to change.

### Unified diff (vs the clone pre-change body — the whole change, FIX 2 included)
```diff
--- a/crossdomain-zeroset.js (clone, pre-change)
+++ b/crossdomain-zeroset.js (published, incl. FIX 2)
@@ -39,21 +39,46 @@
 const _isProd = m => m && String(m.entity_type).toLowerCase() === 'product';
 const requested = [];
 const _seen = new Set();
+// mc-label (2026-08-17): KEEP EVERY UUID PER CODE, not the first.
+// One typed code can exist in more than one company (CRM multi-company), and the resolver returns
+// one product match per company with the SAME canonical_code. This set is deduped by CODE, so
+// first-wins silently dropped the other company's uuid — the cross-probe then checked one
+// company's product and the other company was reported as plainly absent. `uuid` stays the first
+// one so `missing[].uuid` and the `probeable` filter keep the exact shape their consumers read;
+// `uuids` is the union, and the probe requests all of them.
+const _uuidList = (u) => u == null ? [] : (Array.isArray(u) ? u.filter(Boolean) : [u]);
 const _add = (code, uuid, strict) => {
   if (code == null || code === '') return;
   const n = norm(code); if (!n) return;
+  const us = _uuidList(uuid);
   if (_seen.has(n)) {
-    if (strict) { const ex = requested.find(x => x._n === n); if (ex) ex.strict = true; }
+    const ex = requested.find(x => x._n === n);
+    if (ex) {
+      if (strict) ex.strict = true;
+      for (const u of us) if (!ex.uuids.includes(u)) ex.uuids.push(u);
+      // FIX 2 (review 2, 2026-08-17): NO backfill of `ex.uuid`. It used to read
+      // `if (!ex.uuid) ex.uuid = ex.uuids[0] || null;`, which reaches outside this change's blast
+      // radius: on a turn where the FIRST `_add` for a code carried no uuid and a later one did,
+      // it promoted the entry into `probeable` and flipped `_xd.active` false -> true, starting a
+      // cross-domain probe that does not run today. `uuid` keeps first-add semantics exactly as it
+      // did before mc-label; only the `uuids` union above is new.
+    }
     return;
   }
   _seen.add(n);
-  requested.push({ _n: n, code, uuid: uuid || null, strict: !!strict });
+  requested.push({ _n: n, code, uuid: us[0] || null, uuids: us.slice(), strict: !!strict });
 };
 const _or = Array.isArray(_rz.resolutions) ? _rz.resolutions : null;
+// mc-label: code -> EVERY uuid that code resolved to (was: first-wins). The DYM-picked lookups
+// below feed this straight into `_add`, which now takes an array.
 const _uuidByCode = new Map();
 for (const r of (_or || [])) {
   for (const m of ((r && r.matches) || [])) {
-    if (_isProd(m) && m.canonical_code && !_uuidByCode.has(norm(m.canonical_code))) _uuidByCode.set(norm(m.canonical_code), m.uuid);
+    if (!_isProd(m) || !m.canonical_code || !m.uuid) continue;
+    const k = norm(m.canonical_code);
+    if (!_uuidByCode.has(k)) _uuidByCode.set(k, []);
+    const a = _uuidByCode.get(k);
+    if (!a.includes(m.uuid)) a.push(m.uuid);
   }
 }
 if (_or) {
@@ -87,7 +112,14 @@
   let ok = false;
   if (rq.strict) ok = returnedCodes.has(rq._n);
   else for (const rc of returnedCodes) if (rc === rq._n || rc.startsWith(rq._n)) { ok = true; break; }
-  if (!ok) missing.push({ code: rq.code, uuid: rq.uuid, _n: rq._n, entity_type: 'product' });
+  if (!ok) {
+    const _miss = { code: rq.code, uuid: rq.uuid, _n: rq._n, entity_type: 'product' };
+    // Added ONLY when the code really spans companies, so a single-company turn's `_xd.missing`
+    // keeps exactly the keys it has today (it is read by crossdomain-render and
+    // compile-current-state, and it lands in the persisted turn state).
+    if (rq.uuids.length > 1) _miss.uuids = rq.uuids.slice();
+    missing.push(_miss);
+  }
 }
 const probeable = missing.filter(m => m.uuid);
 
@@ -99,6 +131,13 @@
   requested: requested.map(r => r.code),
   returned_codes: [...returnedCodes],
   missing,
-  probe_entities: probeable.map(m => ({ uuid: m.uuid, entity_type: 'product', code: m.code })),
+  // mc-label: one entry per (code, uuid) so the probe asks about EVERY company's product.
+  // sub-get-results' entity-ids-transformer dedupes on uuid into `product_ids`, so repeating the
+  // code across entries is exactly how both companies reach the tool. Single-company turns emit
+  // the identical single entry they emit today.
+  probe_entities: probeable.flatMap(m => {
+    const us = (Array.isArray(m.uuids) && m.uuids.length) ? m.uuids : [m.uuid];
+    return us.map(u => ({ uuid: u, entity_type: 'product', code: m.code }));
+  }),
 };
 return [{ json: out }];
\ No newline at end of file
```

### Isolated review-2 hunk (rev-1 `2c562c7e…` → published `a880d01e…`)
```diff
--- a/crossdomain-zeroset.js (review-1 publish)
+++ b/crossdomain-zeroset.js (review-2: FIX 2)
@@ -56,7 +56,12 @@
     if (ex) {
       if (strict) ex.strict = true;
       for (const u of us) if (!ex.uuids.includes(u)) ex.uuids.push(u);
-      if (!ex.uuid) ex.uuid = ex.uuids[0] || null;
+      // FIX 2 (review 2, 2026-08-17): NO backfill of `ex.uuid`. It used to read
+      // `if (!ex.uuid) ex.uuid = ex.uuids[0] || null;`, which reaches outside this change's blast
+      // radius: on a turn where the FIRST `_add` for a code carried no uuid and a later one did,
+      // it promoted the entry into `probeable` and flipped `_xd.active` false -> true, starting a
+      // cross-domain probe that does not run today. `uuid` keeps first-add semantics exactly as it
+      // did before mc-label; only the `uuids` union above is new.
     }
     return;
   }
```

---

## Verification evidence (all re-read from the server after publish)

`t4QvrtrPnTwRU6br` last written in **revision 1** (B1); `txiPzSxy3Pclsz6v` last written in **revision 2**
(FIX 1 + FIX 2 + VERIFY 3). Every row below was re-read from the server after the write that owns it.

| check | `t4QvrtrPnTwRU6br` (B1 republish) | `txiPzSxy3Pclsz6v` (revision-2 republish) |
|---|---|---|
| PUT / activate HTTP | 200 / 200 (both passes) | 200 / 200 |
| pre-edit `v == av`, no stale draft | ✅ `6dbcf061-…`, node sha still equalled my first publish — **had not moved** | ✅ `63967fff-…`, both node shas still equalled revision 1 — **had not moved** |
| `versionId == activeVersionId` | ✅ `179f1842-8061-4e59-9c72-74ad2b602f29` | ✅ `33746137-f998-4105-abe3-2d591997ce39` |
| `active` | true | true |
| node count unchanged | 8 → 8 | 148 → 148 |
| `connections` identical to pre | ✅ | ✅ |
| nodes differing vs pre | `['output-structurer']` only | `['not-found-error-message', 'crossdomain-zeroset']` only |
| `settings` preserved incl. the keys the PUT schema rejects | ✅ `availableInMCP:true`, `callerPolicy`, `executionOrder` | ✅ `availableInMCP:true`, `binaryMode:"separate"`, `callerPolicy`, `executionOrder` |
| `pinData` intact | n/a (null before and after) | ✅ same 2 keys, byte-identical (`Schedule Trigger`, `When Executed by Another Workflow`) |
| published `jsCode` sha matches what was written | ✅ | ✅ (both nodes) |

Live workflows re-checked after the B1 republish, all still unchanged:

| workflow | id | versionId (== activeVersionId) | updatedAt |
|---|---|---|---|
| live spine | `9qVyfUxmRQqrpGRMDLRuz` | `469e7259-6cfb-4505-bef4-f37a36bf454f` | 2026-08-11T16:23:58Z |
| live sub `sub-get-results TEST` | `rysSPgUssLDf6xJc` | `eb0bbcec-daab-4c79-8a68-c7d5eca5cf0a` | 2026-08-10T06:13:06Z |
| live sub `sub-get-results` | `Fss5aAaXthJSWpZCgKiKR` | `fd248b16-82ee-4307-abfb-657b9b6a4aa7` | 2026-08-11T00:50:25Z |

**Artifact sha256 as committed (these are the promote bytes):**

```
25a2eed93b7fe677a6e1d7d9002522fc3051e4bae415ebe645377ad25f4973de  output-structurer.js        (rev 1 / B1; supersedes 8b68273f…)
79888de7862725448d10fd0210bf8d8dcf1da6fbd131b1c3427ddc94db2f3da1  not-found-error-message.js  (rev 2 / FIX 1 + VERIFY 3; supersedes cfd8a380…)
a880d01e3629538bdde874f60875b481af7415acb6c7f12d4795171074518f92  crossdomain-zeroset.js      (rev 2 / FIX 2; supersedes 2c562c7e…)
```

Each artifact was written **from the server's own copy** after publish, so a repo/live divergence is not possible;
re-verified byte-for-byte against a fresh `GET` for all three.

`validate_workflow` was **not** run — the n8n MCP server is unavailable in this session and the public REST API has
no equivalent endpoint. The substitutes actually performed: `POST /activate` (which runs n8n's own node-config
validation and returned 200 on both), a JS parse of each new body via `new Function(...)`, and the old-vs-new
behaviour probes tabulated above.

---

## Appendix — live→clone drift on `not-found-error-message` imported by this change

Not part of `mc-label`. This is what the clone gains simply by being rebased onto the live body, and it is the
expected source of any clone behaviour delta on promotion or zero-resolution cases.

```diff
--- a/not-found-error-message.js (CLONE, pre)
+++ b/not-found-error-message.js (LIVE, pre) — drift imported by this change
@@ -155,6 +155,50 @@
     const i = arr.findIndex(l => _tokSet.has(String(l).trim().toLowerCase()));
     if (i > 0) arr.unshift(arr.splice(i, 1)[0]);
   }
+  // ── entitlement miss ≠ data miss ─────────────────────────────────────────────
+  // "Here's what you want: • promotion: X … But no promotion matched these." names a promotion
+  // and then denies it in the same breath. Measured (exec 11917052): the resolver DID resolve
+  // `SORENTO PP PROMO COMBINE_29072026.pdf` this turn via promotion_membership, display.is_active
+  // TRUE, display.products ["SRTWB247"] — no stale carry. The contact's entitlement is
+  // Aggregate.name = ["End User"], get-results applied it, and the Office-only promo came back
+  // empty. Every fact needed to say so was already on the wire; only the sentence was wrong.
+  //
+  // Fires ONLY when a promotion was genuinely resolved and nothing came back. A turn that
+  // resolved no promotion at all is a real data miss and keeps the original wording (B7), and an
+  // INACTIVE promotion has ended rather than being withheld (B8) — blaming access there would be
+  // a second false statement, not a fix for the first.
+  const _entitlementMiss = (() => {
+    if (q.domain_hint !== 'promotion') return null;
+    const _promoMatches = [];
+    const _push = (arr) => { for (const m of (arr || [])) if (m && m.entity_type === 'promotion') _promoMatches.push(m); };
+    _push(r?.intersection);
+    _push(r?.by_entity_type?.promotion);
+    for (const res of (r?.resolutions || [])) _push(res?.matches);
+    if (!_promoMatches.length) return null;
+    const _seen = new Set(); const _uniq = [];
+    for (const m of _promoMatches) {
+      const k = m.uuid || m.canonical_code;
+      if (!k || _seen.has(k)) continue;
+      _seen.add(k); _uniq.push(m);
+    }
+    const _named = _uniq.map(m => (m.display && m.display.description) || null).filter(Boolean);
+    if (!_named.length) return null;
+    const _label = _named[0] + (_named.length > 1 ? ` and ${_named.length - 1} other${_named.length > 2 ? 's' : ''}` : '');
+    const _anyActive = _uniq.some(m => m.display && m.display.is_active !== false);
+    if (!_anyActive) {
+      return `${_label} has ended, so there is nothing to send. Would you like me to escalate to ${team} team?`;
+    }
+    // Entitlement comes from the CRM read, not from anything the customer said. Absent ⇒ do not
+    // invent a level (B9): say it is unavailable to them without naming one.
+    let _levels = [];
+    try {
+      const _agg = $('Aggregate');
+      if (_agg.isExecuted) _levels = (_agg.first().json.name || []).map(x => String(x || '').trim()).filter(Boolean);
+    } catch (e) { _levels = []; }
+    const _at = _levels.length ? ` at your access level (${_levels.join(', ')})` : ' to you';
+    return `${_label} is not available${_at}. Would you like me to escalate to ${team} team?`;
+  })();
+
   const _foundLines = [];
   for (const [et, codes] of _byType) {
     // one representative per type + count; true ambiguity is handled by the gate (did-you-mean)
@@ -172,7 +216,8 @@
     const parts = [];
     if (_foundLines.length) parts.push(`Here's what you want:\n${_foundLines.join('\n')}`);
     if (nf.length) parts.push(`Couldn't find: ${nf.join(', ')}.`);
-    parts.push(`But no${active_inactive} ${domainWord}${dateRange}${access} matched these. Would you like me to escalate to ${team} team?`);
+    parts.push(_entitlementMiss
+      || `But no${active_inactive} ${domainWord}${dateRange}${access} matched these. Would you like me to escalate to ${team} team?`);
     return parts.join('\n\n');
   };
 
@@ -250,6 +295,20 @@
       }
     } else if (_useBreakdown) {
       escalate_message = buildBreakdownMsg(`${_statusLabel}${q.domain_hint}`);
+    } else if (_notFoundRaw.length && !_foundLines.length) {
+      // NOTHING resolved. "Could not find promotion for stwc26" states that promotions were
+      // searched and none matched — they were not. If3 dead-ends on the no-compatible-entity
+      // branch and `Call 'sub-get-results'` never runs (verified, execs 12069620 / 12069702:
+      // tool-filter, validator and the sub-call are all absent from runData). Saying we searched
+      // sends the customer off correcting the wrong thing — retyping the domain rather than the
+      // code they mistyped.
+      // Phrasing is buildBreakdownMsg's, verbatim, so the zero-resolution and partial-resolution
+      // misses read identically; the did-you-mean variant ("Couldn't find \"x\". Did you mean...")
+      // still overrides this whenever the resolver returns alternatives.
+      // Domain-agnostic ON PURPOSE: this node serves promotion, inventory and incoming alike.
+      escalate_message =
+      `Couldn't find: ${_notFoundRaw.map(t => `"${t}"`).join(', ')}. ` +
+      `Would you like me to escalate to ${team} team?`;
     } else {
       const _forRequested = requested ? ` for ${requested}` : '';
       escalate_message =
@@ -260,6 +319,12 @@
   }
 }
 
+// Q23: the customer named an access level they do not hold. The gate detects it; say so here
+// too, or an entitlement problem reads as an ordinary "couldn't find it".
+if (gate && gate.access_notice && escalate_message) {
+  escalate_message = `${gate.access_notice}\n\n${escalate_message}`;
+}
+
 const out = $input.first().json;
 out.escalate_message = escalate_message;
 out.is_clarification = is_clarification;
```

## Follow-up (2026-08-17, post-PR #21): `disallowed-entity-gate` — same-code multi-company exact hits must not prompt

**Symptom (captain, chat console):** `incoming for MUB5202` → "incoming search needs to be more specific. Multiple matches found — please choose: MUB5202 / MUB5202". Two exact hits (Mocha + Sorento uuids, same code) were treated as ambiguous because the gate required `exacts.length === 1` (OR-mode) / `prodExacts.length === 1` (AND-mode).

**Fix (spine node `disallowed-entity-gate`, `tests/diffs/mc-label-n8n/disallowed-entity-gate.js`, sha `5f92319ffb10ed7125a35a996603e3ece719966ee02d15b70c919d3949abfb3f`):** when all exact hits share one canonical_code, resolve every uuid as an exact entity (no prompt); downstream `crossdomain-zeroset` / `not-found-error-message` already label per company. Two hunks, ~8 lines. Published on clone spine `txiPzSxy3Pclsz6v` versionId `1e3ce430-ff50-4f3f-a10a-af7ad69404b7` (pre-fix backup `tests/backups/mc-label-n8n/txiPzSxy3Pclsz6v-pre-gatefix.json`, versionId `33746137-…`).

**Evidence:** chat_id `gatefix-1786948517`, run `chatcon-1786948517691` → reply `• product: MUB5202 (Mocha), MUB5202 (Sorento)` / `But no incoming matched these — checked in Mocha and Sorento.` + Mocha stock rows; no choose-prompt.

**Promote mapping:** add spine node #4 `disallowed-entity-gate` → live spine `9qVyfUxmRQqrpGRMDLRuz` (same two hunks; verify live body first — clone/live drift not re-checked for this node). Review: NOT independently reviewed (captain "just fix" + usage limit) — reviewer pass pending before promote.
