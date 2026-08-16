# Node diff — `dym-multitoken` (coder deliverable)

**Change id:** `dym-multitoken`
**Target:** CLONE `txiPzSxy3Pclsz6v` (`sorento-consume-main TEST`) — **live spine `9qVyfUxmRQqrpGRMDLRuz` NOT touched.**
**Node:** `build-suggest-offer` (id `7972abd8-5d6b-40ff-9d38-152782cd8091`, `n8n-nodes-base.code` tv2) — **D1 block ONLY.**
**Published:** activeVersionId `4026f185…` → `ccff92c3-f85a-4707-9144-01f0c7895405`. Draft==active pre-edit; only this one node changed.
**Byte gate:** intended jsCode sha256 `2cc44525…95393` == draft (post-update) == active (post-publish). node --check OK.
**Scope:** `deterministic`, single-node. `compile-current-state`, `output_exchange`, gate, get-results, all subs — untouched.

---

## What changed (D1 region only)

The whole edit is a replacement of the old 7-line D1 loop (`let d1 = null; … break;`) with a
multi-token accumulator + a new `_survivors.length > 1` numbered multi-block, inserted **directly
above the existing `if (d1) { … }` block, which is kept verbatim**. Everything else in the file
(header, `_mkOffer`, D3 sibling picker, UUID-leak guard, `tokenCandidates`, `missResolutions`
builder, the entire `if (d1) {…}` single-token block, D2) is byte-for-byte unchanged. Confirmed by
`diff bso.current.js bso.new.js` (only the region below differs) and by the §MT-R byte-identity gate.

### BEFORE (old lines 163–169)

```js
let d1 = null;
if (!isClar && !requireSpec) {
  for (const res of missResolutions) {
    const cands = tokenCandidates(res);
    if (cands.length) { d1 = { token: res.token || unresolved[0] || (q?.entities?.[0]?.raw) || 'that item', cands }; break; }
  }
}

if (d1) {
```

Bug: `break` on the **first** token that has candidates — a multi-token miss shows only one
"did you mean" and drops the other missed tokens from the reply and the pick map.

### AFTER (new lines 163–232, ending at the unchanged `if (d1) {`)

```js
// dym-multitoken: accumulate EVERY genuine-miss token that carries candidates (was: break on
// the FIRST such token …). … Cap the number of missed tokens shown at 5 …
let d1s = [];
if (!isClar && !requireSpec) {
  for (const res of missResolutions) {
    const cands = tokenCandidates(res);
    if (cands.length) {
      d1s.push({ token: res.token || unresolved[0] || (q?.entities?.[0]?.raw) || 'that item', cands });
    }
  }
  d1s = d1s.slice(0, 5);                     // cap missed tokens shown at 5
}

// Renderable survivors: a token whose candidates ALL drop via humanLabel (bare uuid, no display)
// is skipped entirely — not shown, idx range never consumed.
const _survivors = d1s
  .map(block => ({ block, picks: cap3(block.cands).map(m => ({ m, label: humanLabel(m) })).filter(p => p.label) }))
  .filter(s => s.picks.length);

// 0 → D2; 1 → existing single-token block (BYTE-IDENTICAL); >1 → new numbered multi-block.
let d1 = _survivors.length === 1 ? _survivors[0].block : null;

if (_survivors.length > 1) {
  let idx = 0;
  const blocks = [];
  out.suggest_last_result_set = [];
  out.dym_candidates = [];
  for (const s of _survivors) {
    const token = s.block.token;
    const _srcEnt = (Array.isArray(q?.entities) ? q.entities : [])
      .find(e => String(e.raw || '').toLowerCase().trim() === String(token || '').toLowerCase().trim());
    const candLines = [];
    for (const p of s.picks) {
      idx += 1;
      const isU = isUuid(p.m.canonical_code);
      candLines.push(`  ${idx}. ${p.label}`);            // humanLabel — never a bare uuid
      out.suggest_last_result_set.push({
        idx, label: p.label, value: isU ? p.label : p.m.canonical_code,
        product: p.m.canonical_code, uuid: p.m.uuid || null, entity_type: p.m.entity_type || null,
      });
      out.dym_candidates.push({
        code: p.m.canonical_code, uuid: p.m.uuid || null, entity_type: p.m.entity_type || null,
        for_raw: token, for_hint: p.m.entity_type || (_srcEnt && _srcEnt.hint) || null,
        for_canonical: (_srcEnt && _srcEnt.canonical_code) || null,
      });
    }
    blocks.push(`"${token}" — did you mean:\n` + candLines.join('\n'));
  }
  out.suggest_offer = true;
  out.suggest_selection_context = 'suggest_offer';
  out.suggest_response =
    `Couldn't find some items:\n\n` + blocks.join('\n') +
    `\n\nReply a number to pick, or 'yes' to escalate to ${team}.`;
  out.suggest_quick_reply = [YES, NO].map(s => String(s).replace(/,/g, '')).join(',');
  out.dym_offer = _mkOffer(out.dym_candidates);   // dym-single-use-fix
  return out;
}

if (d1) {                                    // ← existing single-token block, unchanged from here down
```

---

## Mapping to plan §2 / task steps

| Step | Implemented |
|---|---|
| 1 remove `break`, accumulate all miss tokens w/ non-empty `tokenCandidates`, cap 5, drop-empty via `humanLabel==null` | `d1s` accumulation + `.slice(0,5)`; `_survivors` drops tokens whose picks all filter out |
| 2 exactly ONE contributing token → today's behaviour byte-identical; >1 → new numbered block | `_survivors.length===1 → d1 = block → existing if(d1) runs verbatim`; `>1 → multi-block` |
| 3 numbered multi-block message shape | `Couldn't find some items:\n\n` + per-token `"<token>" — did you mean:\n  <n>. <label>` blocks joined `\n` + `\n\nReply a number to pick, or 'yes' to escalate to <team>.` |
| 4 `suggest_offer=true`, `suggest_selection_context='suggest_offer'` | set |
| 5 `suggest_quick_reply` = `[YES,NO]` comma-stripped only | `Yes escalate,No it's okay` (no number/code buttons) |
| 6 `suggest_last_result_set` flattened global idx 1..N; code → value/product=canonical_code; uuid → product=canonical_code, label=humanLabel | per-row `value: isU ? p.label : canonical_code`, `product: canonical_code`, `label: p.label` (mirrors existing uuid numbered-mode row) |
| 7 `dym_candidates` flattened, each keeps OWN `for_raw`; `for_hint=m.entity_type\|\|srcEnt.hint`; `for_canonical=srcEnt.canonical_code`; then `dym_offer=_mkOffer(...)` | `_srcEnt` looked up **per token** by `raw===block.token`; `dym_offer` from `_mkOffer` |
| 8 numbered subsumes code/uuid split — no `anyUuid` branch on multi path | no `anyUuid` on the `>1` path |

Guards preserved: multi-block only when `!isClar && !requireSpec` (`d1s` only populated then).
Passthrough `out = {...$input.first().json}` intact. `cap3` per token retained.

---

## Coder pre-flight (0-token offline logic check — NOT the UAC; tester runs the real gate)

Stubbed n8n globals (`$input`/`$`/`$execution`) and ran the four §MT fixtures against the new jsCode:

- **§MT-1** — 3 blocks, contiguous idx 1..7; `suggest_last_result_set` len 7 with values
  `C2181XUW-P-ENG,C21131XUW-P-ENG,C21132XUW-P-ENG,BRCX01014UW-P-ENG,SRTWCY8605,SRTWCY8605-PJ,SRTWC8605-SC-RL`,
  all `entity_type:'product'`; `dym_offer={id,domain:'inventory',ttl:3,candidates:[7],picked:[]}`;
  `for_raw` per token (1-3 tokenA, 4 tokenB, 5-7 tokenC), `for_hint` all `product`;
  `suggest_quick_reply='Yes escalate,No it's okay'`; message begins `Couldn't find some items:` and
  ends `…escalate to customer_service.`
- **§MT-R** — single-token (tokenA only) output of the NEW node is **byte-identical** (diff empty) to
  the CURRENT live `build-suggest-offer` jsCode: code-mode message + 3 code buttons + Yes/No,
  `suggest_last_result_set` len 3, `dym_candidates` len 3 all `for_raw:'C21263XUW-P-ENG'`.
- **§MT-cap** — 6 tokens → exactly 5 blocks, idx contiguous 1..10, LRS len 10 (≤15).
- **§MT-drop** — middle token = bare uuid no display → block omitted, 2 blocks (A then C), idx
  contiguous 1..6, `dym_candidates` len 6, none `for_raw:'Bravat C01014UW-P-ENG'`.

These are a coder sanity check only. The tester owns §MT via `prepare_test_pin_data`→`test_workflow`
on the clone and the §0 safety gate.
