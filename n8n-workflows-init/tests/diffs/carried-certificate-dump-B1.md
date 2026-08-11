# Node diff — `carried-certificate-dump` **B1 `attachment-subject-gate`**

> 🔴 **B1 was SILENTLY REVERTED on the clone and RESTORED on 2026-08-08. See
> "Revert and restore" at the bottom — it changes how this change must be tested.**
> **Current clone versionId: `3f1b20d4-33dc-4994-8758-2f868192220d`.**
> **`disallowed-entity-gate` must hash to `a8938abe2e5c0189c43d3af376c2689dc4597ea222520d6b28e5e01e33a4ea27`.**
> Check it with `tests/offline/carried-certificate-dump/assert-b1-present.sh` **at the start of
> every pass** — behaviour looking right does **not** prove B1 is present (B2′ masks its absence).

| | |
|---|---|
| target | clone `txiPzSxy3Pclsz6v` (`sorento-consume-main TEST`) — **live spine `9qVyfUxmRQqrpGRMDLRuz` untouched** |
| rollback versionId (original build) | **`3a196c44-66d3-4c43-8039-17130f60ef7d`** (confirmed still current immediately before the write; draft == active) |
| rollback versionId (restore) | **`879d0f68-15cf-4e18-af0d-34bbd3636f29`** |
| **current versionId** | **`3f1b20d4-33dc-4994-8758-2f868192220d`** — published, `versionId == activeVersionId` |
| versionId at original build | `2d1627c8-7e49-4cc4-951a-38af549fd3ca` (superseded — reverted, then restored) |
| **post-build node sha (the presence gate)** | `disallowed-entity-gate` = **`a8938abe…`**; pre-B1 = `7626c83e…` |
| plan | `plans/carried-certificate-dump-plan.md` §2 (B1), §7 sequencing, §8 acceptance, §9 rollback |
| UAC | `tests/uac/CD.md` §CD-1…§CD-4, §CD-FP-1/2/3 · scope tag **`deterministic`** |
| scope | **B1 only.** B2 / B3 / C1–C3 / Change A not built. |
| offline harness | `tests/offline/carried-certificate-dump/` |
| manifest snapshot | `tests/manifests/carried-certificate-dump/rev1-2d1627c8.MANIFEST.json` |

**Nodes added: 0. Nodes removed: 0. Edges changed: 0. Nodes changed: 1.**

Proven mechanically by diffing the pre-PUT live GET against the post-PUT live GET, per-node
`sha256(parameters)`:

```
pre nodes 149  post nodes 149
added  : []      removed: []
CHANGED: ['disallowed-entity-gate']
connections identical: True
position/disabled/type drift: []
credentials: before 28 after 28 identical=True
```

Node names/positions were not touched, so there is no rename/reposition debt and no generic leftover
name.

---

## The one change — `disallowed-entity-gate` (`b07ca5db-1b95-4249-97d1-63d10a112ca4`)

`parameters.jsCode`, sha256 `7626c83e…` → `a8938abe…` (10,643 → 11,976 chars). **One contiguous
insertion, nothing else edited.** `diff -w before after` is exactly this hunk:

Inserted between the required-type block (ends old `:76`) and the
`// ── AMBIGUITY → REQUIRE SPECIFIC SELECTION` block (old `:78`) — the position the plan specifies:

```js
// ── B1 attachment-subject-gate ─────────────────────────────────────────
// The named subject product MISSED. A carried certificate / attachment_type must not be
// allowed to scope the lookup on its own: certificate_ids alone satisfies the tool's narrowing
// tuple (server.py:40, OR semantics) and returns every product carrying that certificate.
// Observed: exec 11509873, 26 unrelated products + a PDF. Dead-end to not-found so the
// did-you-mean the customer actually needs is what gets rendered.
// Predicate is resolver-derived (unresolved_tokens ∩ parser product raws) on purpose — NOT
// `current_message`, which is a known-corrupted signal (plan §5 B4).
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

Deviations from the plan's §2.1 snippet: **none in code.** Only the two leading comment lines were
extended (banner + the explicit "NOT `current_message`" note). The predicate, the guard, the two
assignments and the `gate_reason` string are byte-for-byte as specified.

### Before / after intent

| | before | after |
|---|---|---|
| `srtwc8317-rl1 cert` with a carried `PC 000078` | `gate_passed: true`, `gate_reason: "ok"` → `If3[1]` → `sub-get-rag` → `sub-get-results`; `entity-ids-transformer` emits `certificate_ids` and **no** `product_ids`; the tool's OR-narrowing is satisfied by the certificate alone → 26 unrelated products + a PDF | `gate_passed: false`, `gate_reason: "'product_attachment' subject product did not resolve; …"` → `If3[0]` → the not-found / did-you-mean path. `Call 'sub-get-results'` never runs |
| everything else | — | unchanged |

Note the fix works by **not asking the wrong question**, not by filtering the answer: the CRM was
correct, `entity-ids-transformer` is untouched, and no MCP-side change is involved.

---

## Renderer surfaces B1's dead-end text reaches (LESSONS §63 rule ii)

**B1 introduces no new customer-facing string.** `gate_clarification` stays `''` and `require_specific`
stays `false`, so the turn joins the pre-existing `gate_passed === false` dead-end path — which
`If3`'s first condition (`gate_passed === false`) already drives today for incompatible-type,
missing-required-type and ambiguous turns. The rendering surfaces are therefore the existing
not-found set, enumerated by rendered string and by-name re-sourcing (all three forms), not by graph
inbound:

| surface | role on this path | why it is safe |
|---|---|---|
| `not-found-error-message` | **producer.** `q.domain_hint === 'product_attachment'` arm → `"Could not find a cert for product srtwc8317-rl1 … escalate?"` | reached via `If3[0] → If-incoming-picker[1]` (picker needs `require_specific && domain==='incoming'`; both false here) |
| `dym-transform` → `dym-gate` → `dym-probe` → `dym-annotate` → **`build-suggest-offer`** | renders the numbered did-you-mean + quick replies from the resolver's trgm alternatives | reached via `sibling-gate[1]` (sibling lane needs `domain==='incoming'`) |
| **`escalate-catalog`** (`branch_kind:'not_found'`) | **re-sources `escalate_message` BY NAME** — the two-hop `const nfNode = $('not-found-error-message'); … nf.escalate_message` that discarded a correct annotation for a whole revision | already fixed at rev 6: it now prefers `$('build-suggest-offer')`'s annotated copy and falls back. **Untouched by B1** — B1 adds no field for it to drop |
| `compile-current-state` → `crossdomain-compose` | final `user_response` to sendmsg / `save-session-vars` | the customer boundary the tester must assert on |
| `annotate-incoming-picker` | 4th renderer of this text family | **not on this path** (`incoming` only) — listed so the reviewer sees it was enumerated, not missed |

By-name reads of the changed node were re-checked in all three forms — inline `$('x')`, the `$("x")`
quote variant, and the two-hop `const v = $('x'); … v.first().json.k`. 14 nodes read
`disallowed-entity-gate` by name. **`gate_reason` has exactly one consumer anywhere in the clone:**
`not-found-error-message:11`, and only through `/requires a scoping entity/.test(gateReason)` — which
the new string deliberately does **not** match, so `needsScope` stays `false` and the message arm is
unchanged. `gate_passed` / `require_specific` consumers (`If3`, `If-incoming-picker`, `sibling-gate`,
`dym-transform`, `dym-transform-partial`, `build-suggest-offer`, `compile-current-state`,
`escalate-catalog`, `annotate-incoming-picker`) all already handle `gate_passed === false`.

---

## Evidence produced at build time

`tests/offline/carried-certificate-dump/` runs the **real node body** (byte-exact, both revisions)
against 8 pinned fixtures, offline.

- **`byte-identity.js` — plan §2.3 "every other domain byte-identical."** Before-body and after-body
  on identical inputs, diffing the **whole output object**: `compared population: 8, identical: 7,
  differing: 1`. The single differing case is CD-1 and it differs in exactly two leaf keys
  (`gate_passed`, `gate_reason`). `compatible_entities` and `gate_debug` are unchanged even there.
- **The defect reproduces pre-fix and is fixed post-fix:** CD-1 is the only case that fails on
  `gate.before.js` (`gate_passed: true`, `gate_reason: "ok"`).
- **`mutate.sh` — §0 S9 compliant.** FP-1/2/3 each go **RED** on exactly their own fixture; a
  deliberate negative control (a string not present in the file) **aborts without running the suite**.

⚠️ **The first version of this harness was itself a §61 "green that cannot fail"** — all three
mutations passed. Three discriminator fixtures (`FP1-D`/`FP2-D`/`FP3-D`) were added to fix it;
the reasons are tabulated in that directory's README. Flagging it because the same blind spot exists
in the §CD case list as written: **§CD-4 as specified cannot redden §CD-FP-1**, and **§CD-3 as
specified cannot redden §CD-FP-2** — see "Findings" below.

---

## Safety (§0)

Zero egress by construction: B1 is a pure in-node predicate on already-fetched data, adds no node,
no edge and no HTTP/sub call, and its only effect is to **reduce** the work a turn does (it removes a
`sub-get-results` call). Re-asserted from the post-change clone JSON, not from memory:

- **S3 containment intact — 5 orphaned + 1 sinked.** Zero-inbound: `save-session-vars`,
  `send-message-files`, `send-message-images`, `send-message-video`, `update-human-intervened`
  (plus the known-orphaned `sorento-sub-respond-sendmsg-respond3`, `Code in JavaScript`,
  `OpenAI Chat Model`). `Call 'sub-respond-save-message-redis'2`.`workflowId.value` ===
  `tWm5DYLxfypmVC1T`.
- **S4** — B1 can only *prevent* a `sub-get-results` call; it never adds or changes a tool.
- **S6 `deterministic`** — no LLM node added or newly reachable; B1 removes LLM/tool work on the
  turns it fires.
- Live spine `9qVyfUxmRQqrpGRMDLRuz` was never opened for write. No promote performed. No UAC
  executions run.

Transport: written by **REST PUT built from a fresh REST GET** of the clone (LESSONS §55), which
avoids the MCP U+2500 banner mangling. PUT returned **HTTP 200** (clean — no webhook trigger on this
clone, cf. LESSONS §60) and auto-published. Post-write re-fetch confirms the body byte-equals the
intended file, 28/28 credentials survived, and no collateral node moved.

---

## Findings — things in the plan/UAC that are wrong or under-specified

1. 🚩 **§CD-4 as written cannot detect §CD-FP-1.** It prescribes "one `inventory` miss turn, one
   `order` turn, one `incoming` require-specific turn". On all three, `gate_passed` is **already
   `false`** by the time B1's clause is reached (incompatible types / no scoping entity), so
   `gate_passed &&` short-circuits and mutating the domain guard to `true` changes nothing. §CD-4
   needs at least one non-`product_attachment` fixture that is **still `gate_passed === true`** at
   B1 *and* has a missed product raw. `FP1-D` in the offline harness is such a case
   (`master_products`, brand resolves, product raw misses) and can be lifted directly.
2. 🚩 **§CD-3 as written cannot detect §CD-FP-2.** "a product code that resolves exactly" gives an
   empty `unresolved_tokens`, so `_missedSubject` is `false` and dropping `!_haveProduct` is
   invisible. The discriminating shape is **one product resolving while a second product raw
   misses** (`FP2-D`) — which is also the closest analogue of the §2.2 residual (turn 9151545).
3. 🚩 **§CD-2 as written cannot detect §CD-FP-3**, same mechanism: `certification with number
   PC000078` resolves cleanly, so `unresolved_tokens` is empty. `FP3-D` (an *unknown* certificate
   number, no product hint) is the discriminator.
4. **Under-specified: B1 sets `gate_passed = false` but the require-specific block below it still
   runs** and can overwrite `gate_reason` (and set `require_specific = true`) if `specific_options`
   comes out non-empty. It cannot happen on §CD-1 (the missed token has `matches: []`, so
   `disallowed-entity-gate:108` `continue`s it), but a turn with a missed product raw **plus** a
   second genuinely-ambiguous product token would render the picker instead of the dead-end and
   §CD-1's `gate_reason` regex would not match. Behaviourally that is arguably the better reply, so
   I left the plan's placement alone rather than improvising — flagging it for the reviewer to rule
   on rather than silently guarding it.
5. **Note for the tester on §CD-1's `compatible_entities` assertion.** "contains no entity with
   `entity_type === 'product'`" holds, but the carried **certificate is still present** in
   `compatible_entities` after B1 (see the byte-identity output above). B1 stops the certificate
   being *used to scope a read*; it does not evict it — eviction is B2's job. Assert absence of
   `product`, not absence of the certificate.
6. **`validate_workflow txiPzSxy3Pclsz6v` is not runnable on this MCP surface.** The tool here
   validates **n8n Workflow SDK source code** and takes a `code` argument; it has no workflow-id
   form. Substituted equivalents, all green: `node --check` on the new body; the 149-node /
   1-changed-node / identical-connections per-node diff above; and a clean
   `export-workflows.py --verify` round-trip (clone now `2d1627c8`).
7. **The clone has no `Schedule Trigger`.** Its only trigger is
   `When Executed by Another Workflow` (`executeWorkflowTrigger`), so the "confirm the Schedule
   Trigger is disabled before editing" prerequisite does not apply here; there is no shared
   `main-message-list` consumption risk from this edit.

## 🔴 Revert and restore (2026-08-08)

**B1 was gone from the clone for over a day and every behavioural check kept passing.**

**What happened.** A UI save from a stale editor tab — the same window in which the user
deliberately removed `get-presigned-url` to cut prod load — rewrote `disallowed-entity-gate` back
to its pre-B1 body. B1 was collateral. From `workflow_history`, every clone version from
`b94eea53` (08-07 07:46) through `879d0f68` (08-08 04:41) carries the pre-B1 sha `7626c83e`. This
is LESSONS §24's revert-landmine biting the **clone**, where nobody was watching for it.

**Why nothing caught it.** B2′ (parser-side certificate eviction) shipped in between. B2′ removes
the *cause*, so the 26-row dump **cannot occur whether or not B1 is present**. Every B1 regression
check kept passing — **correctly, in both states**. The assertion was sound, pointed at the right
object, and could go red; it simply **could not discriminate the two states**. Filed as
**LESSONS §64**, a third class distinct from §61 (cannot go red) and §63 (right assertion, wrong
object). Redundant fixes for one symptom produce this hazard by construction.

**Restore, verified.**

| check | result |
|---|---|
| rollback captured before write | `879d0f68-15cf-4e18-af0d-34bbd3636f29` (draft == active) |
| base guard | live body asserted **byte-identical** to the recorded pre-B1 `gate.before.js` before patching — the PUT would have halted otherwise |
| **restored node sha256** | **`a8938abe2e5c0189c43d3af376c2689dc4597ea222520d6b28e5e01e33a4ea27`** — **exact-match gate PASSED**, byte-for-byte equal to `gate.after.js` |
| new versionId | `3f1b20d4-33dc-4994-8758-2f868192220d`, `versionId == activeVersionId` |
| node count | 148 — `get-presigned-url` **not** reintroduced (the user's removal preserved) |
| collateral | nodes differing vs PUT body: none · connections identical · credentials 27/27 |
| offline suite | 8/8 pass · byte-identity 7 identical / 1 differing · all 3 FP mutations RED · negative control aborts |

**Base note.** No rebase was performed and none was needed: the user's live edit adding
`'certificate'` to `ALLOWED.product_attachment` was **already present** in the recorded pre-B1
body (`gate.before.js:8`), so the reverted clone body was exactly the right base and the restored
node reproduces the original post-build hash exactly.

### New standing assertion — B1 presence, and a discriminator that can fail

Both added to `tests/uac/CD.md` as **§CD-0b** (standing, binding) and folded into §CD-1:

1. **Presence by sha, every pass.** `tests/offline/carried-certificate-dump/assert-b1-present.sh`
   — three distinct outcomes, not two: PASS (`a8938abe…`), **reverted** (`7626c83e…` → record no
   B1 result from that pass), or **someone else edited the node** (any other value → diff first).
2. **The discriminator is execution shape, not text:** **`Call 'sub-get-results'` absent from
   runData.** B1 dead-ends *before* the sub is called; with B1 absent but B2′ active the sub runs
   and returns a correctly-scoped result with **the same customer-visible text**. §CD-1 now marks
   this as *the* B1 discriminator — a run that does not record it cannot be signed off.

   **Graph-sound in the asserted direction**, verified by reachability over the clone's
   `connections`: `If3[0]` (the B1 branch) reaches `Call 'sub-get-results'` = **False**; `If3[1]`
   reaches it = **True**. So absence is a hard consequence of B1 firing, not an inference.

   `tests/offline/carried-certificate-dump/discriminator.js` is the offline half. It evaluates
   **If3's real condition expression, sourced from the clone JSON and drift-checked against it**,
   never retyped. **Proven RED against the actual B1-absent clone body before B1 was restored:**

   ```
   ## against the live B1-ABSENT body (gate.live-now.js, sha 7626c83e)
   B1 block present: false
   gate_passed     : true
   gate_reason     : "ok"
   If3 condition   : false  -> output 1
   => Call 'sub-get-results' WILL RUN        (B1-ABSENT signature)      exit=1

   ## against the restored body (gate.after.js, sha a8938abe)
   B1 block present: true
   gate_passed     : false
   gate_reason     : "'product_attachment' subject product did not resolve; …"
   If3 condition   : true   -> output 0
   => Call 'sub-get-results' WILL NOT RUN    (B1-PRESENT signature)     exit=0
   ```

**Manifest snapshots:** `rev1-2d1627c8` (original build) and `rev2-3f1b20d4` (restore) in
`tests/manifests/carried-certificate-dump/`. There is no snapshot for the reverted revisions —
they were not produced by this pipeline.

## Co-edit notice for Change A

⚠️ **This change edits `disallowed-entity-gate`, which Change A
(`multi-company-resolution-plan.md`: `specific_options` labels + render) also edits.** Per plan §7
they were kept as separate publishes and A was not in flight. **Change A must re-derive its line
numbers against `2d1627c8`** — everything from the old `:78` (`// ── AMBIGUITY → REQUIRE SPECIFIC
SELECTION`) down has shifted **+22 lines**; nothing above it moved.
