# Node diff — `mc-label-n8n` (multi-company reply clarity, n8n half)

**Branch** `fm/mc-label-n8n` · **Coder pass** 2026-08-17 · **n8n MCP unavailable this session — every edit made over the public REST API with curl.**

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
| `sub-get-results CS-BUILD` | `t4QvrtrPnTwRU6br` | `output-structurer` | `4eb8ad78-d5af-42ef-b899-d9baec4e1efb` | `6dbcf061-d626-4bb6-b63b-7451aeb7f827` |
| `sorento-consume-main TEST` (clone spine) | `txiPzSxy3Pclsz6v` | `not-found-error-message`, `crossdomain-zeroset` | `98e93d6e-41b4-4a1f-999c-5fe70daeacc6` | `63967fff-120c-4157-822e-083916fd88d0` |

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
| `output-structurer.js` | CS-BUILD `t4QvrtrPnTwRU6br` current (byte-identical to the live sub) | live sub **`rysSPgUssLDf6xJc`** node `output-structurer` — this is the sub the LIVE spine calls (verified drift; **not** `Fss5aAaXthJSWpZCgKiKR`, which carries identical code today and should be promoted alongside if it is to stay in sync) |
| `not-found-error-message.js` | **LIVE spine `9qVyfUxmRQqrpGRMDLRuz` current** (334 lines) | live spine `9qVyfUxmRQqrpGRMDLRuz` node `not-found-error-message` — applies cleanly, no rebase |
| `crossdomain-zeroset.js` | clone `txiPzSxy3Pclsz6v` current (byte-identical to live) | live spine `9qVyfUxmRQqrpGRMDLRuz` node `crossdomain-zeroset` |

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
* **lines** 310 → 362
* **sha256(`jsCode`)** old `68bd130cf367bb7aa644e6bb79194f7360c7430a8d2c6d642d3c2d80b6126935` → new `8b68273f57f2151135b03a419597b1c521a82d0191396137f4c699f8b8ced1d4` (re-read from the server after publish: **MATCH**)

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
   answer spanned companies while a single-company reply's `json` keeps **exactly** the keys it has today.

### Offline behaviour probe (no execution, pure function replay of old vs new)
| case | result |
|---|---|
| single-company, found rows, no `lookup_companies` | **byte-identical** to old |
| single-company `incoming_stock` with projection active | **byte-identical** to old |
| multi-company **empty** | intro unchanged, then `*Mocha:* no stock records for MWC-SC08B.` / `*Sorento:* …` |
| multi-company **partial** (Mocha has rows) | Mocha's row renders with its `*Company:* Mocha` line; then `*Sorento:* no stock records for MWC-SC08B.` |
| multi-company `incoming_stock` | old **dropped** the `*Company:*` line (projection); new keeps it and adds the Sorento line |

### Unified diff (vs CS-BUILD pre-change)
```diff
--- a/output-structurer.js (CS-BUILD t4QvrtrPnTwRU6br, pre)
+++ b/output-structurer.js (published)
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
@@ -285,6 +291,48 @@
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
+    if (_silent.length) msg += _silent.map(n => `*${n}:* no ${_what}.`).join('\n') + '\n\n';
+  }
 
   if (_accessNotes.length) msg += _accessNotes.join('\n') + '\n\n';
 
@@ -307,4 +355,8 @@
     // A sustained false here with a non-empty requested_attributes means the MCP process
     // needs restarting, NOT that the parser stopped emitting keys.
     keys_served: _anyKeyed,
+    // mc-label (2026-08-17): carried through so downstream state knows the answer spanned more
+    // than one company. Spread-in rather than defaulted to null, so a single-company reply's json
+    // keeps EXACTLY the keys it has today.
+    ...(_lookupCos.length ? { lookup_companies: _lookupCos } : {}),
   } }];
\ No newline at end of file
```

---

## 2. `not-found-error-message` — qualify the resolved entities, and name the companies searched

* **workflow** `sorento-consume-main TEST` (clone spine, `txiPzSxy3Pclsz6v`) · **node** `not-found-error-message` (`n8n-nodes-base.code`)
* **baseline** the **LIVE** spine's current body (334 lines). The clone's own copy was 65 lines **behind** live; building
  on the clone would have regressed live at promote, so the published body is live + this change.
* **lines** 334 → 374
* **sha256(`jsCode`)** old (live) `d796e28d84e302130546e750eafaa901f9d5cfb81093a4f401c616536891fee3` → new `cfd8a3804d2f4cb28acd247bc990692b19f8e58379728a2a923655c9ead982cb` (re-read from the server after publish: **MATCH**)

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

### Offline behaviour probe (old-live vs new, pure function replay)
| case | result |
|---|---|
| single company | **byte-identical** (message + `found_summary`) |
| resolver returns **no** `company_name` at all (pre-#193 CRM) | **byte-identical** — `_searchedCos` is empty, `_multiCo` false |
| single-company order (`DO123 (Acme Sdn Bhd)` label) | **byte-identical** — the suffix strip stays off |
| two companies | `• product: MWC-SC08B (Mocha), MWC-SC08B (Sorento)` … `But no inventory matched these — checked in Mocha and Sorento. Would you like me to escalate to warehouse team?` |
| three companies + an unresolved token | `… — checked in Mocha, Sorento and Cabana Co.`; the `Couldn't find: "zzz".` part is unchanged |

### Node references verified present in the clone before publishing
`$('Aggregate')`, `$('Call \'sub-query-reformulator\'')`, `$('disallowed-entity-gate')`, `$('resolve-entity')` —
all four extracted from the live body and confirmed by name against the clone's 148-node set. **4/4 OK.**

### Unified diff (vs the LIVE pre-change body)
```diff
--- a/not-found-error-message.js (LIVE spine 9qVyfUxmRQqrpGRMDLRuz, pre)
+++ b/not-found-error-message.js (published to clone)
@@ -137,12 +137,39 @@
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
+  const _searchedCos = [...new Set(_compat.map(c => _coByUuid.get(c.uuid)).filter(Boolean))];
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
@@ -151,8 +178,13 @@
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
@@ -201,6 +233,9 @@
 
   const _foundLines = [];
   for (const [et, codes] of _byType) {
+    // mc-label: in the multi-company case the extra entries are the SAME code in another company,
+    // not other products, so "(+1 more)" hides the one fact this change exists to state. Name them.
+    if (_multiCo) { _foundLines.push(`• ${et}: ${codes.join(', ')}`); continue; }
     // one representative per type + count; true ambiguity is handled by the gate (did-you-mean)
     const extra = codes.length > 1 ? ` (+${codes.length - 1} more)` : '';
     _foundLines.push(`• ${et}: ${codes[0]}${extra}`);
@@ -211,13 +246,18 @@
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

---

## 3. `crossdomain-zeroset` — probe every company's product, not just the first

* **workflow** `sorento-consume-main TEST` (clone spine, `txiPzSxy3Pclsz6v`) · **node** `crossdomain-zeroset` (`n8n-nodes-base.code`)
* **baseline** clone current, **byte-identical to the live spine's copy** (both sha `2c3b4fff…` as `jq -r` files)
* **lines** 104 → 138
* **sha256(`jsCode`)** old `2eef3fa37454d5931e50747631df0463e152afdd58e6aeecea0a804040646245` → new `2c562c7e974fa043e5bffe12b10ab97ed523c19df04196a1980119a2e4d4ff42` (re-read from the server after publish: **MATCH**)

### Before / after intent
**Before.** The requested set is deduped by **code**, and both `_add()` and `_uuidByCode` were **first-wins** on the
uuid. A code that exists in two companies produced two resolver matches with the same `canonical_code`, so the
second company's uuid was silently discarded: `probe_entities` carried one uuid, the cross-domain probe asked the
other tool about **one** company's product, and the second company was reported to the customer as plainly absent
when it had never been asked about.

**After.** Every uuid per code is kept and the requested id set becomes the **union**:

* `_add()` accumulates into a new `uuids` array. `uuid` still holds the first one, so `missing[].uuid` and the
  `probeable = missing.filter(m => m.uuid)` filter keep the exact shape their consumers read.
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

### Offline behaviour probe (old vs new, pure function replay)
| case | result |
|---|---|
| single company | `_xd` **byte-identical** |
| multi-company w/ a returned row (nothing missing) | `_xd` **byte-identical** (`active:false`, `missing:[]`) |
| two companies, both missing | `missing[0].uuids: ["u1","u2"]`; `probe_entities` gains the second `{uuid:"u2", entity_type:"product", code:"MWC-SC08B"}` |
| DYM-picked code spanning two companies | same union, via the rewritten `_uuidByCode` |

### Unified diff (vs the clone pre-change body)
```diff
--- a/crossdomain-zeroset.js (clone txiPzSxy3Pclsz6v, pre)
+++ b/crossdomain-zeroset.js (published)
@@ -39,21 +39,41 @@
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
+      if (!ex.uuid) ex.uuid = ex.uuids[0] || null;
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
@@ -87,7 +107,14 @@
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
 
@@ -99,6 +126,13 @@
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

---

## Verification evidence (all re-read from the server after publish)

| check | `t4QvrtrPnTwRU6br` | `txiPzSxy3Pclsz6v` |
|---|---|---|
| PUT / activate HTTP | 200 / 200 | 200 / 200 |
| `versionId == activeVersionId` | ✅ `6dbcf061-d626-4bb6-b63b-7451aeb7f827` | ✅ `63967fff-120c-4157-822e-083916fd88d0` |
| `active` | true | true |
| node count unchanged | 8 → 8 | 148 → 148 |
| `connections` identical to pre | ✅ | ✅ |
| nodes differing vs pre | `['output-structurer']` only | `['not-found-error-message', 'crossdomain-zeroset']` only |
| `settings` preserved incl. the keys the PUT schema rejects | ✅ `availableInMCP:true`, `callerPolicy`, `executionOrder` | ✅ `availableInMCP:true`, `binaryMode:"separate"`, `callerPolicy`, `executionOrder` |
| `pinData` intact | n/a (null before and after) | ✅ same 2 keys, byte-identical (`Schedule Trigger`, `When Executed by Another Workflow`) |
| published `jsCode` sha matches what was written | ✅ | ✅ (both nodes) |

Live workflows re-checked after both publishes, unchanged:
`9qVyfUxmRQqrpGRMDLRuz` `v=av=469e7259-6cfb-4505-bef4-f37a36bf454f` (updatedAt 2026-08-11T16:23:58Z);
`rysSPgUssLDf6xJc` `v=av=eb0bbcec-daab-4c79-8a68-c7d5eca5cf0a` (updatedAt 2026-08-10T06:13:06Z).

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
