# Node diff — quick-reply comma-strip (LIVE promotion prep)

**Change-id:** `quick-reply-comma-strip`
**Status:** DRAFT / BACKUP / VALIDATE ONLY — no workflow mutation performed by coder. Coordinator applies + publishes after review.
**Target:** LIVE spine `sorento-consume-main` `9qVyfUxmRQqrpGRMDLRuz` (active=true)
**Node:** `build-suggest-offer` (Code) — id `7972abd8-5d6b-40ff-9d38-152782cd8091`
**Promotion type:** user-gated, prod-first (user explicitly chose direct-to-live). Not the clone.

## Root cause
WhatsApp quick-reply buttons are built as a comma-joined string. The send sub
`aoydkG1dbItXR5jXFEQsP` HTTP Request node splits it back on comma:
`replies: {{ JSON.stringify($json.quick_reply.split(",")) }}`.
The button labels defined in `build-suggest-offer` contain literal commas —
`YES = 'Yes, escalate'` and `NO = "No, it's okay"` — so each label splits into
two buttons. A 3-button offer (`[code, YES, NO]`) renders as 5 buttons.

**Decision:** strip commas from every element at the JOIN site (robust, future-proof
— also neutralises any comma that ever appears inside a `code`/`value`). The split
site in the send sub is left UNTOUCHED.

## Change (2 lines, nothing else)

Line 82 (D1 "did you mean" arm):
```
- out.suggest_quick_reply = [...codes, YES, NO].join(',');
+ out.suggest_quick_reply = [...codes,  YES, NO].map(s => String(s).replace(/,/g, '')).join(',');
```

Line 142 (D2 "alternatives" arm):
```
- out.suggest_quick_reply = [...values, YES, NO].join(',');
+ out.suggest_quick_reply = [...values, YES, NO].map(s => String(s).replace(/,/g, '')).join(',');
```

`diff backup -> patched` shows exactly these two hunks and no others.

### Other join sites in this node — deliberately NOT touched
These build human-readable message TEXT, not the quick_reply delimiter, so they must
keep their commas:
- L19 `codes.slice(0,-1).join(', ')` — "A, B, or C" prose in `humanList`.
- L129 `picks.map(...).join('; ')` — semicolon-joined date list in `suggest_response`.
- L135 `values.join(', ')` — "Try: A, B, C." prose in `suggest_response`.

There are no other `join(',')` quick-reply sites in this node.

## Apply instruction (for the coordinator — NOT executed here)
- Backup first (this doc records it). Then, on `9qVyfUxmRQqrpGRMDLRuz`:
- `setNodeParameter` on node `build-suggest-offer`, JSON pointer `/jsCode`, value =
  the full patched body at
  `.../scratchpad/build-suggest-offer.PATCHED.js` (source byte-exact — do NOT retype; lesson 25).
- Prefer replacing the whole `/jsCode` leaf with the patched file contents (surgical
  single-leaf write per lesson 32), then `publish_workflow`.
- Per lesson 24: BEFORE publish, sha the draft `/jsCode` == patched file; AFTER publish,
  re-sha the active == patched. Auto-revert to prior versionId on any mismatch.
- NOTE (lesson 23): at read time `versionId != activeVersionId` — an unpublished DRAFT
  already exists on this workflow. `get_workflow_details` returned the DRAFT body, which
  is what this backup/patch is based on. Coordinator MUST confirm the draft's OTHER nodes
  are the intended state before publishing (publish ships the whole draft, not just this
  hunk). If the draft carries unintended changes, reconcile before publish.

## Backup + version (rollback anchors)
- Backup file (verbatim current jsCode): `.../scratchpad/build-suggest-offer.LIVE.backup.js` (7256 bytes, 147 lines)
- Patched file: `.../scratchpad/build-suggest-offer.PATCHED.js`
- Workflow `versionId` at read time (DRAFT pointer): `5d6202a5-cb77-49b5-b2ee-7362c6a10411`
- Workflow `activeVersionId` at read time: `2dc20a62-3c60-410a-82e7-3c68145f6777`
- Read timestamp (updatedAt): `2026-07-06T04:12:10.829Z`

(Absolute scratchpad prefix:
`/private/tmp/claude-501/-Users-tehjayson-Documents-foundryx-sorento-crm-n8n/5d37007e-4bfc-4aef-9e5d-6ca37abf1f9d/scratchpad/`)

## Rollback
1. If publish went wrong: `publish_workflow` the prior `activeVersionId`
   `2dc20a62-3c60-410a-82e7-3c68145f6777` to restore the last-known-good active version.
2. Or restore the node body: `setNodeParameter` `/jsCode` = contents of
   `build-suggest-offer.LIVE.backup.js`, then publish.

## Validation (offline, done)
- `node -c` on the full patched body (wrapped as a function for the top-level `return`): SYNTAX_OK.
- Unit test:
  `[...['PS1'],'Yes, escalate',"No, it's okay"].map(s=>String(s).replace(/,/g,'')).join(',').split(',')`
  === `['PS1','Yes escalate',"No it's okay"]` → PASS (3 buttons).
- Pre-fix control (proves the bug): same input without the map → 5 buttons.
- Same output shape otherwise: only commas inside labels removed; array/order/other
  `out.*` fields unchanged.

## Risk
Pure string sanitize at emit — no egress, branch, or business-logic change. The
`.split(",")` in send sub `aoydkG1dbItXR5jXFEQsP` is unchanged. Access-level-choice
labels (built elsewhere) contain no commas, so they are unaffected and untouched. Net
user-visible effect: the escalate offer renders 3 buttons ("Yes escalate", "No it's
okay") instead of 5. Emoji/leading commas none present.
