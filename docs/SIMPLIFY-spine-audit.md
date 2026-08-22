# Spine simplification audit — `sorento-consume-main` (2026-08-22, live @ 57e70ce2)

Measured from the verified export (`n8n-workflows-init/export/live-spine-sorento-consume-main/`).
**127 nodes**: 37 Code, 30 If, 21 Execute-Workflow, 14 HTTP, 10 Set. 309 KB of JS across 37 Code nodes.
Principle applied: CLAUDE.md "simple is better". Each item = observed duplication, not taste.

## 1. Byte-twin branches: `dym-*` vs `dym-*-partial` (−4 nodes, −29 KB)
`dym-transform` (417 lines) vs `dym-transform-partial` (410): **11 differing lines**.
`dym-annotate` (169) vs `dym-annotate-partial` (144): 29 differing lines. Plus twin `dym-gate`/`dym-gate-partial`,
`dym-probe`/`dym-probe-partial`. Every dym fix must be applied twice (and has been missed — see the
`answered-token-offered-as-dym` lesson). → One `dym-transform` with a `mode: 'full'|'partial'` input from the
caller; one probe; one annotate.

## 2. Seven `sub-get-results` probe callers with the same 3-field envelope (−5 nodes)
`crossdomain-probe`, `dym-probe`, `dym-probe-partial`, `promo-dym-probe`, `sibling-probe`, `probe-incoming`,
`tier-probe` all pass `{contact_id, entities, semantic_input}` with identical `contact_id`/`semantic_input`
expressions — only `entities` differs. Three point at `Fss5aAaX…`, three at `rysSPgUssLDf6xJc` ("TEST" — live's
main read path, 🚩). → One `probe` node fed by `$json.probe_entities`; each producer sets that key.
Also resolves the live-calls-TEST-fork mess in one place.

## 3. Nine sequential `If` nodes = one `Switch` on parser output (−7 nodes)
`If → If1 → If7 → If8 → If9 → If10 → If2 → If5 → If-ideate` each test one field of
`$('Call 'sub-query-reformulator'').output` (`intent_hint`, `message_type`, `escalation.*`, `correction`,
`demand_qty`, `domain_hint`). The order is the routing priority but it is invisible. → one Code node
`route-turn` that returns `branch` (a string), then one `Switch`. Priority becomes 20 readable lines.
Names `If`…`If10` violate the tidy rule anyway.

## 4. Eight `tag-*` Set nodes → one field on the branch that already knows (−8 nodes)
`tag-access-choice`…`tag-out-of-scope` each set the single key `branch_kind` then feed `escalate-catalog`.
The upstream node that chose the branch can set `branch_kind` itself (or `route-turn` from §3 does).

## 5. Three parallel "miss → suggest" lanes converge on `build-suggest-offer` (557 lines)
`dym-*` (4 nodes), `sibling-*` (4 nodes), `incoming-picker` (3 nodes) each do
*transform candidates → probe CRM → annotate availability → build-suggest-offer*. Same shape, three
implementations. → one lane: `miss-candidates` (Code: which kind + candidate list) → `probe` → `annotate` →
`build-suggest-offer`. `build-suggest-offer` already switches on kind internally (reads `dym-annotate`,
`sibling-probe`, `sibling-transform`, `annotate-incoming-picker` by name).

## 6. `compile-current-state` (684 lines) reads 14 nodes by name
It is the real "reply assembler" but its inputs are implicit (`$('x')` into 14 upstream nodes, some of which did
not run on this branch). Any rewire silently breaks it (TOPOLOGY "Read BY NAME" warning exists because of this).
→ every branch ends in one explicit `reply` object (`{text, quick_replies, session_patch, branch_kind}`);
`compile-current-state` reads `$json` only. That one change makes the rest of the graph rewireable.

## 7. `disallowed-entity-gate` (496 lines) is read by name from **18** nodes
Same disease as §6. Its output is the de-facto turn context. → emit it once into a `ctx` object carried on the
item; downstream reads `$json.ctx.*`. Mechanical, no behaviour change.

## 8. Dead / orphaned surface to delete (−6 nodes)
`Code in JavaScript`, `presign-fail-notice`, `sorento-sub-respond-sendmsg-respond3`, disabled
`Schedule Trigger`, `Transcribe a recording` lane (superseded by `whisper-transcribe`), `OpenAI Chat Model`
orphan. `$('x')` reference in `dym-transform*` targets a node that does not exist (⚠️ in TOPOLOGY).

## 9. Attachment send: 3 × `send-message-*` + Switch + Loop + 2 sendmsg calls (−5 nodes)
`send-message-images/video/files` are the same respond.io node with a different media type; `Switch` picks by
type. → one `send-media` node with `type = {{$json.media_type}}`; drop Switch + one of the two error paths.

## 10. Sub-workflow naming and fork sprawl (readability, no node count)
Live calls `sub-get-results TEST` for its main read. Nine `sorento-sub-respond-sendmsg-respond{,2,3,4,5,…}`
callers. → rename to what they do (`send-reply`, `send-clarify`, `send-media-fail`); retire forks whose only
difference is history (`stale-byte-identical-fork-claim` lesson).

## 11. Canvas layout has never been done (readability, 0 nodes)
Nodes were dropped where the editor put them at build time; no lanes, no sticky notes, `If`…`If10` names.
→ lay out once by the target shape below: one horizontal spine, one lane per branch stacked below it, sticky
note per lane (`INTAKE`, `ROUTE`, `HAPPY`, `MISS`, `REPLY`), positions written by script from the export
(`workflow.json` → set `position` per node → REST PUT) so it is reproducible and part of every later promote.

## Target shape (what the owner should be able to read in TOPOLOGY)
```
pop → media-intake → load-session → parse (LLM) → route-turn (Switch)
   ├ escalate / declined / access-choice / not-supported / clarify / ideate   → reply
   └ happy: resolve-entity → gate(ctx) → rag → get-results → validate
        ├ hit  → promo-picker → crossdomain → reply
        └ miss → miss-candidates → probe → annotate → suggest-offer → reply
reply → compile-current-state($json) → send + save-session + log
```
Rough arithmetic: 127 → ~80 nodes with **zero behaviour change**, then §5/§6 unlock further cuts.

## Order (each step a separate hash-gated promote, UAC-green, zero behaviour change)
1. §8 delete dead (safest, proves the promote loop) → 2. §4 + §3 routing → 3. §1 dym twins →
4. §2 single probe → 5. §9 media → 6. §6/§7 explicit `reply`/`ctx` contracts → 7. §5 one miss lane → 8. §10 renames + §11 scripted layout (layout can also be done FIRST — zero-risk, biggest readability win per hour).
Regression harness (`regress-capture` before step 1, `regress-replay` after each) is the correctness gate.
