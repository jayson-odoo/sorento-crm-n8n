# Node-diff — session-save hint reconciliation (stale cross-domain carryover fix)

**Change-id:** `session-hint-reconcile`
**Plan:** `n8n-workflows-init/plans/session-hint-reconcile-fix.md`
**UAC:** `n8n-workflows-init/tests/session-hint-reconcile-UAC.md`
**Target workflow:** clone `sorento-consume-main TEST` — `txiPzSxy3Pclsz6v` (versionId `491cbbeb-5442-4c37-900b-796091b64d0e`; draft == active at draft time).
**Promotion target (later, user-gated):** live spine `9qVyfUxmRQqrpGRMDLRuz` node of the same name.
**Status when this doc was written:** DRAFT ONLY — **zero workflow mutations made** (a pre-fix baseline capture is running on the clone; no `update_workflow`/`publish` issued).

## Decisions honored (locked by user)
- **D1 = one node.** Upgrade the existing `reconcileEntities(...)` inside `compile-current-state`. No second node, no new data contract.
- **D2 = first match** on heterogeneous tokens.
- Vocabulary: reformulator `hint` and CRM `entity_type` are the same token set → rewrite `hint = entity_type` verbatim, no mapping table.

---

## Node changed (exactly one)

| field | value |
|---|---|
| node name | `compile-current-state` |
| node id | `7a130a0c-530f-4bfb-a8f2-059ec71c2ea2` |
| node type | `n8n-nodes-base.code` |
| param edited | `parameters.jsCode` (the `reconcileEntities` function only) |
| lines touched | the `reconcileEntities` definition + its lead comment (orig lines 125–159). Everything else in the 219-line node is byte-identical. |
| connections/graph | UNCHANGED (pure in-node JS edit). |

No other node is touched. No new node, connection, credential, or param added.

---

## Resolver output shape used (grounded, real field paths)

The function reads `$('resolve-entity').first().json` (`resolverJson`). Field paths are confirmed two ways: (1) plan §0 root-cause from live clone exec `7654198`; (2) the sibling consumer `disallowed-entity-gate` flattens the resolver identically (its lines 29–31):

```js
...(resolver.resolutions ?? []).flatMap(r => r.matches ?? []),
...(resolver.intersection ?? []),
...Object.values(resolver.by_entity_type ?? {}).flat(),
```

Confirmed paths on `resolverJson`:
- `resolutions[]` — OR-mode; each `{ token (aka query), matches[] }`. (`r.token` used in gate lines 136/142/189.)
- `intersection[]` — AND-mode flat matches.
- `by_entity_type{}` — object; `Object.values(...).flat()` yields matches.
- each **match** carries `entity_type`, `canonical_code`, `uuid`, `display.product_name`, and (per plan §0 exec 7654198) `display.via_token` — the parser's raw surface token that produced the match. `via_token` is not consumed by any current node, so it is accessed defensively via optional chaining; if absent, that match tier simply no-ops and the code/name fallback runs.

---

## BEFORE (current `reconcileEntities`, orig lines 125–159)

```js
// ── reconcile parser hints with resolver's authoritative entity_type ──
// The resolver checked against real data; its entity_type wins over the parser's hint.
function reconcileEntities(parserEntities, resolverJson) {
  if (!Array.isArray(parserEntities)) return parserEntities || [];

  const resolutions  = Array.isArray(resolverJson?.resolutions)  ? resolverJson.resolutions  : [];
  const intersection = Array.isArray(resolverJson?.intersection) ? resolverJson.intersection : [];

  // normalize: a lookup from a raw value → resolved match
  // OR-mode: match pe.raw to the resolution token, take its first match
  // AND-mode: match pe.raw to a match's canonical_code / product_name
  const norm = s => String(s || '').toLowerCase().trim();

  return parserEntities.map(pe => {
    const raw = norm(pe.raw);
    let match = null;

    // OR-mode: by token
    const res = resolutions.find(r => norm(r.token || r.query) === raw);
    if (res?.matches?.length) match = res.matches[0];

    // AND-mode (or OR-mode that didn't token-match): by the record's own value
    if (!match && intersection.length) {
      match = intersection.find(m =>
        norm(m.canonical_code) === raw ||
        norm(m.display?.product_name) === raw
      ) || null;
    }

    if (match?.entity_type) {
      return { ...pe, hint: match.entity_type, canonical_code: match.canonical_code };
    }
    return pe;   // unresolved → keep parser's guess
  });
}
```

**Why it silently no-ops for this bug class:** AND-mode / typed-code / brand / fuzzy resolutions carry `canonical_code:"SRTWC8504-RL-P"` while the parser entity's `raw` is `"Srtwc8504"` — `norm("srtwc8504") !== "srtwc8504-rl-p"`, so the code/name branch misses; the token branch also misses because those matches live in `intersection[]` (no `resolutions[].token` to key on). The authoritative link `display.via_token === "Srtwc8504"` is never consulted, so the hint is never rewritten and the stale parser hint (`"incoming"`) is persisted to `variables.entities`.

---

## AFTER (upgraded `reconcileEntities`)

```js
// ── reconcile parser hints with resolver's authoritative entity_type ──
// The resolver checked against real data; its entity_type wins over the parser's hint.
// Join on the TOKEN that produced the resolution FIRST (OR-mode resolutions[].token,
// AND-mode display.via_token), then fall back to the record's own canonical_code /
// product_name. Typed-code / brand / fuzzy entities carry a null/partial canonical_code
// (parser raw "Srtwc8504" vs match code "SRTWC8504-RL-P"), so a code-only join silently
// misses and the stale parser hint would persist into variables.entities → next turn's
// axis-merge keeps the stale entity. First match wins (D2).
function reconcileEntities(parserEntities, resolverJson) {
  if (!Array.isArray(parserEntities)) return parserEntities || [];

  const norm = s => String(s || '').toLowerCase().trim();

  const resolutions  = Array.isArray(resolverJson?.resolutions)  ? resolverJson.resolutions  : [];
  const intersection = Array.isArray(resolverJson?.intersection) ? resolverJson.intersection : [];
  const byType = (resolverJson?.by_entity_type && typeof resolverJson.by_entity_type === 'object')
    ? Object.values(resolverJson.by_entity_type).flat()
    : [];

  // flat pool of every resolver match; tag OR-mode matches with the token that produced them
  const pool = [
    ...resolutions.flatMap(r => Array.isArray(r.matches)
      ? r.matches.map(m => ({ ...m, _token: r.token || r.query }))
      : []),
    ...intersection,
    ...byType,
  ];

  return parserEntities.map(pe => {
    const raw = norm(pe.raw);
    if (!raw) return pe;

    // authoritative join, first-match wins: the token that produced the resolution
    // (OR-mode _token, AND-mode display.via_token), then the record's own code / name.
    const match =
      pool.find(m => norm(m._token) === raw) ||
      pool.find(m => norm(m.display?.via_token) === raw) ||
      pool.find(m => norm(m.canonical_code) === raw || norm(m.display?.product_name) === raw) ||
      null;

    if (match?.entity_type) {
      return { ...pe, hint: match.entity_type, canonical_code: match.canonical_code ?? pe.canonical_code ?? null };
    }
    return pe;   // unresolved → keep parser's guess
  });
}
```

---

## Line-by-line rationale

1. **`norm` hoisted above the pools** — needed by both pool construction and matching; no behavior change, cosmetic reorder.
2. **`byType` added** — `Object.values(resolverJson.by_entity_type ?? {}).flat()`, guarded by an `object` typeof check. Covers resolver payloads that only populate `by_entity_type` (mirrors the gate's own flatten). No throw when absent.
3. **`pool` (flat match list)** — merges all three shapes into one array so a single first-match scan covers OR-mode, AND-mode, and by-type. OR-mode matches are tagged with a synthetic `_token` (= `r.token || r.query`) so the token that produced them survives the flatten. `r.matches` guarded by `Array.isArray` → no throw on malformed resolution rows.
4. **`if (!raw) return pe`** — new guard: an entity with empty `raw` can no longer accidentally match a pool record whose `canonical_code`/`via_token` is also empty (`norm('') === norm('')`). Strictly safer than the BEFORE code, which lacked this guard. (Unit test #6.)
5. **Tiered `pool.find` (the join)** — the fix. Priority: (a) `_token === raw` (OR-mode authoritative), (b) `display.via_token === raw` (AND-mode authoritative — the previously-missing link), (c) `canonical_code === raw || display.product_name === raw` (exact-typed-code fallback, = the BEFORE behavior). `.find` returns the FIRST match, and tiers are ordered, so **first-match-wins (D2)** across heterogeneous candidates. `display?.via_token` optional-chained → no throw if `display`/`via_token` missing.
6. **`hint: match.entity_type`** — verbatim rewrite of the CRM entity_type onto the stored hint (no mapping table; the CRM set is a clean subset of the hint vocabulary — plan §3).
7. **`canonical_code: match.canonical_code ?? pe.canonical_code ?? null`** — fills a previously-null canonical_code from the match, but no longer clobbers an existing parser canonical_code with `undefined` (BEFORE did `canonical_code: match.canonical_code` unconditionally). Sanctioned by plan §2 ("touches only `hint` (+ fills a previously-null `canonical_code`)").
8. **`return pe` for unresolved** — unchanged: an entity with no CRM match keeps its parser hint (we have no better truth). (Unit tests #3, TDD-2.)

---

## Invariants held (verified by node -c + 12 unit assertions, all PASS)

- **(a) Same-turn output unchanged.** `compile-current-state` is terminal; `reconciledEntities` flows only into `output.variables.entities` (stored state) and into the `resource_attachment` disclaimer, which keys on **`e.raw`** (`/catalog|katalog/i`), never `hint`/`canonical_code`. `user_response` is provably hint-independent → byte-identical current-turn text. (UAC TDD-3 / C1.)
- **(b) Only RESOLVED entities change.** Matched → `hint` rewritten + `canonical_code` filled; unmatched → returned untouched.
- **(c) No throw on missing/empty resolver fields.** Every access guarded (`Array.isArray`, `typeof === 'object'`, optional chaining). Tested with `{}`, `null`, missing `matches`, empty arrays.

Behavioral proof (representative): raw `"Srtwc8504"` + `intersection[{entity_type:"product", canonical_code:"SRTWC8504-RL-P", display:{via_token:"Srtwc8504"}}]` → `hint` becomes `"product"`, `canonical_code` becomes `"SRTWC8504-RL-P"`, sibling fields preserved. Post-fix this moves the entity from the `__incoming` private axis to `product_scope`, where turn-2's axis-merge evicts it (plan §4).

---

## Guards to strip for live promotion

**None.** This is a pure deterministic in-node JS logic change with no test-mode / `is_test` branch and no egress. The upgraded `reconcileEntities` is promotable byte-for-byte to the live spine node of the same name. (Promotion remains a separate user-gated step: backup prior versionId + node body, sha-verify draft pre-publish & active post-publish, auto-revert on mismatch — LESSONS 24/25.)

---

## Validation performed (no write)

- `node -c` syntax check on the isolated function AND the full 219-line reconstructed node body: **SYNTAX OK** both.
- 12 behavioral unit assertions (via_token match, OR-mode token, by_entity_type, unresolved passthrough, empty/null resolver no-throw, empty-raw skip, first-match-wins): **all PASS**.
- `validate_workflow` (SDK-code validator) was **not** run: this surface's `validate_workflow` takes full SDK **code**, not a workflowId, and reconstructing all ~97 nodes as SDK source from the runtime JSON is lossy and out of scope for a single in-node param edit; the change does not alter the node graph or any node's structural params, so graph-level validation is unaffected. Noted per task ("if validate requires a write, skip and note").

## Apply instructions (for the later go-ahead)

Single surgical op on `txiPzSxy3Pclsz6v` — `update_workflow` with `setNodeParameter { nodeName: "compile-current-state", path: "/jsCode", value: <full AFTER node body> }` (LESSON 32: byte-exact single-leaf write). Source the full node body from `…/scratchpad/compile-new.js` (the validated reconstruction), not a retype. Then re-`validate_workflow`/publish per the harness rules. **Do NOT apply until user go-ahead — baseline capture must finish first.**
```
```
