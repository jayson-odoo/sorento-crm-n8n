# Spine simplification audit — `sorento-consume-main` (re-derived 2026-08-23, live @ `df165492`)

Measured from the verified export (`n8n-workflows-init/export/live-spine-sorento-consume-main/`,
`export-workflows.py --verify` green at `df165492`). Supersedes the 2026-08-22 edition, which was
derived at `57e70ce2` / 127 nodes.

**134 nodes**: 40 Code, 32 If, 21 Execute-Workflow, 15 HTTP, 10 Set, 1 Switch, 1 Wait, 1 NoOp,
2 Aggregate, plus the intake/LLM singletons. **5,924 lines / 343 KB of JS** across the 40 Code nodes
(was 309 KB / 37 at `57e70ce2`).

What moved since the last edition: the **media-intake lane landed (+12 nodes)** and the **old Whisper
lane was deleted (−5: `fetch-audio`, `if-audio-in`, `if-voice-allowed`, `send-voice-not-allowed`,
`whisper-transcribe`)**. Net +7. Nothing in the routing, dym, probe or reply structure changed.

Principle applied: CLAUDE.md "simple is better". Each item is an observed duplication with a
measurement, not taste. **New in this edition:** every item is weighted by what the test harness can
actually catch (`npm run mutate --node <name>`), because an item that touches a node at 8 % mutation
kill is not "ready to attempt" no matter how good the idea is.

---

## Status of the 11 original items

| # | item | status at `df165492` | measurement |
|---|---|---|---|
| 1 | dym twins | **still true, unchanged** | `dym-transform` 416 vs `-partial` 409 = 11 differing lines / 3 hunks, of which 2 are comment-ruler width; **one** semantic delta. `dym-annotate` 169 vs 144 = 29 lines / 2 hunks |
| 2 | probe callers | **still true, worse than stated** | 8 `sub-get-results` callers (7 probes + the main read); the envelope is **5** fields, not 3; ~180 lines of inline expression JS duplicated |
| 3 | sequential Ifs | **still true; the original count was wrong** | the routing chain is **11** sequential `If` + 1 interleaved `Set`, byte-identical to `57e70ce2`. The media lane did **not** make it worse |
| 4 | 8 `tag-*` Set nodes | **still true, unchanged** | 8 Set nodes, each with exactly one assignment `branch_kind = '<literal>'`, all 8 feeding `escalate-catalog` |
| 5 | three miss lanes | **still true, unchanged** | `dym-*` (4) + `sibling-*` (4) + incoming-picker (3), all converging on `build-suggest-offer` (584 lines, was 557) |
| 6 | `compile-current-state` by-name reads | **still true, slightly worse** | reads **15** nodes by name (was 14; `patch-transcript` added by the media lane). Body 684 → **898** lines |
| 7 | `disallowed-entity-gate` read by name | **still true, unchanged** | read by **18** nodes. Body 496 lines |
| 8 | dead surface | **partly done, and the original list was 2/6 wrong** | see §8 — 5 nodes provably dead (this PR deletes them), 2 wrongly listed, 2 new classes found |
| 9 | attachment send | **still true, unchanged** | 3 × `send-message-*` + `Switch` + `Loop Over Items1` + 2 sendmsg calls, 14 nodes in the lane |
| 10 | naming / fork sprawl | **still true, worse** | 9 sendmsg callers (was 7): the media lane added `send-media-reply` and `send-transcript-confirm`. Live's main CRM read still calls `sub-get-results TEST` |
| 11 | canvas layout | **still true, unchanged** | still no lanes, no sticky notes, `If`…`If10` still named `If`…`If10` |

---

## 1. Byte-twin branches: `dym-*` vs `dym-*-partial` (−4 nodes, −29 KB)

`dym-transform` (416) vs `dym-transform-partial` (409): **11 differing lines in 3 hunks**. Two of the
three hunks are a comment ruler one character wider. **The entire semantic difference is one 7-line
block** — the `promotion` entry of `DOMAIN_PROBE`, present in `dym-transform` and absent from the
twin. `dym-annotate` (169) vs `-partial` (144): 29 lines in 2 hunks. Plus the twin `dym-gate` /
`dym-gate-partial`, `dym-probe` / `dym-probe-partial`.

**Merging is still the right call, and the divergence is now easier, not harder, than the previous
edition implied.** The claim that "the twins have drifted apart on live" does not hold at `df165492`:
the two `probe_cap` removals landed in **both** twins in the same publish, so the delta is exactly
what it was at `57e70ce2` — one config block. A `mode: 'full' | 'partial'` parameter reproduces it.

What *did* drift is live vs the TEST clone (see "Blocked on a stale clone" below), and that is the
real obstacle to building this slice.

> 🚩 **Unrelated finding, needs an owner decision.** Between `57e70ce2` and `df165492` live deleted
> `probe_cap: 8` from the `resource_attachment` entry of `DOMAIN_PROBE` in **both** twins — while
> leaving in place the 15-line comment that measures and justifies it ("✅ MEASURED (tester pass 2,
> exec 11646010) … CONFIRMED at 8"). The cap code is fail-open, so the domain is now uncapped: nine
> candidates are all probed and `probe_cap_applied` is `false`. The cap existed to stop a
> structurally-undetectable 50-row truncation that renders a confident "no certificate" about a
> product that has one. Either the removal was deliberate and the comment is now a lie, or it was
> accidental and a mitigation is gone. This audit cannot tell which.

## 2. Eight `sub-get-results` callers, five near-identical envelope fields (−5 nodes)

Recounted: **8** callers, not 7 — `crossdomain-probe`, `dym-probe`, `dym-probe-partial`,
`promo-dym-probe`, `sibling-probe`, `probe-incoming`, `tier-probe`, plus the main
`Call 'sub-get-results'`. Targets: **5 → `Fss5aAaXthJSWpZCgKiKR`**, **3 → `rysSPgUssLDf6xJc`**
("sub-get-results TEST" — still carrying live's main CRM read, 🚩). No caller was re-pointed since
`57e70ce2`.

The envelope is **five** fields, not three, and here is how much of it is copy-paste:

| field | distinct values across the 8 callers |
|---|---|
| `contact_id` | **1** — identical in 8/8 |
| `semantic_input` | 5, and one 22-line IIFE is byte-identical in 4 of them |
| `user_prompt` | 7, mostly the same 2-line template |
| `tool` | 5 |
| `entities` | 6 — **the only field that genuinely differs per caller** |

That is roughly **180 lines of inline n8n-expression JavaScript duplicated across 8 node parameters**,
none of it reachable by any Code-node unit test. → one `probe` node fed by `$json.probe_entities`;
each producer sets that key. Also collapses the two-workflow-id split into one place.

## 3. Eleven sequential `If` nodes = one `Switch` on parser output (−7 nodes)

The previous edition said nine; the chain is **eleven**:

```
check-access → If5 → If2 → If-ideate → If10 → is-escalation-declined → If9 → If1
             → not-supported-domain → If → If7 → [Edit Fields2] → If8 → resolve-entity
```

Each tests one field of `$('Call 'sub-query-reformulator'').output`. The order is the routing
priority and it is invisible.

**The media lane did NOT make this worse.** It added 4 `If` nodes (`if-media-in`, `if-media-poll`,
`if-media-ok`, `if-media-reply`, total If count 30 → 32), but they form a short linear intake chain
upstream of `tf-message`, not part of the routing cascade — which is byte-identical to `57e70ce2`.

→ one Code node `route-turn` returning a `branch` string, then one `Switch`. Priority becomes 20
readable lines. Names `If`…`If10` violate the tidy rule anyway.

## 4. Eight `tag-*` Set nodes → one field on the branch that already knows (−8 nodes)

Confirmed unchanged and confirmed trivial: every one of the eight carries exactly one assignment,
`branch_kind = '<literal>'`, and all eight feed `escalate-catalog`. The node that chose the branch can
set it (or `route-turn` from §3 does).

## 5. Three parallel "miss → suggest" lanes converge on `build-suggest-offer` (584 lines)

Unchanged. `dym-*` (4 nodes), `sibling-*` (4), `incoming-picker` (3) each do *transform candidates →
probe CRM → annotate availability → build-suggest-offer*. `build-suggest-offer` already switches on
kind internally (reads `dym-annotate`, `sibling-probe`, `sibling-transform`,
`annotate-incoming-picker` **by name**). → one lane: `miss-candidates` → `probe` → `annotate` →
`build-suggest-offer`.

## 6. `compile-current-state` (898 lines) reads 15 nodes by name

Grew by 214 lines and one by-name dependency since `57e70ce2` — the media lane's MI-D block, which
reads `$('patch-transcript')` to prepend the CRM's photo/voice confirmation to whatever reply the
node produced. It is now the largest body in the repo after the parser's `output_exchange`.
→ every branch ends in one explicit `reply` object (`{text, quick_replies, session_patch,
branch_kind}`); `compile-current-state` reads `$json` only.

## 7. `disallowed-entity-gate` (496 lines) is read by name from **18** nodes

Unchanged. → emit it once into a `ctx` object carried on the item.

> **§6/§7 undersell the problem.** The spine has **165 by-name read edges** total, and the biggest hub
> is neither of these two: `sorento-sub-respond-findcontact-respond` is read by **33** nodes and
> `tf-message` by **15**. Those two are the de-facto turn context — contact id and message text — and
> any structural rewire has to carry them. Fixing §6/§7 without also giving those two a home just
> moves the coupling.

## 8. Dead surface — re-derived (this PR deletes 5 of the 6 originally listed)

**Provably dead at `df165492`** — zero inbound, no `$('name')` reader anywhere, unreachable from
either trigger, and not feeding any surviving node:

| node | type | evidence |
|---|---|---|
| `Code in JavaScript` | Code (3 lines) | root of the old `Transcribe a recording` lane, 0 inbound |
| `Transcribe a recording` | OpenAI (credentialed) | only inbound is `Code in JavaScript` |
| `transcribed-message` | Code (5 lines) | only inbound is `Transcribe a recording` |
| `sorento-sub-respond-sendmsg-respond-transcribed-message` | Execute-Workflow (sendmsg) | only inbound is `Transcribe a recording` |
| `sorento-sub-respond-sendmsg-respond3` | Execute-Workflow (sendmsg) | 0 inbound, 0 readers, a numbered leftover |

The first four are one whole dead lane. Note the previous edition called it "superseded by
`whisper-transcribe`" — `whisper-transcribe` itself has since been deleted, and this older lane
outlived it.

**Two entries in the original §8 list were wrong:**

- ❌ **`OpenAI Chat Model` is NOT an orphan.** It has zero inbound and is unreachable by a forward
  walk from the triggers, so every "orphan" heuristic flags it — but n8n's langchain sub-nodes point
  **provider → consumer**, and this one is the model behind `Basic LLM Chain` (the clarification
  path). Deleting it would have silently removed the clarification LLM. `prune-nodes.py` has a
  dedicated check for this class, with this node as its worked example.
- ⚠️ **`Schedule Trigger` is disabled, not dead.** It is the redis-poll ingress kept as the failover
  lever (see the `production-running-on-failover` note). Disabled is an operator switch; leave it.

**Left in place deliberately, with reasons:**

- **`presign-fail-notice` + `sorento-sub-respond-sendmsg-presign-fail`** pass every deadness test —
  and are *not* dead surface. Their own header says why: they are the un-landed half of a decided fix
  ("`get-presigned-url`'s ERROR output, which was UNWIRED (here AND on live) … User decision
  2026-08-04: keep the mention, wire this path"). The live bug they address is real: a presign
  failure is swallowed and the customer reads a file-mention sentence with no file. Deleting them in
  a zero-behaviour-change slice would silently cancel a user decision. The right resolution is a
  separate slice that **wires** them (a behaviour change with its own UAC), or an explicit owner call
  to drop the fix. `prune-nodes.py` would happily delete them — the judgement is the reason they are
  not on the list.
- **`if-transcribed-confirm` → `send-transcript-confirm`** — see the new dead-surface class below.

### 🆕 New dead-surface class: **dark by flag, invisible to the orphan list**

`if-transcribed-confirm`'s only condition is `leftValue: "={{ false }}"`, so
`send-transcript-confirm` — a credentialed customer-send node — can never fire. But the pair has real
inbound edges from `sorento-sub-respond-findcontact-respond`, so it appears in **no** orphan list, in
`TOPOLOGY.md` or anywhere else, and every structural tool reports it as live. `compile-current-state`
documents the intent ("send-transcript-confirm is gated off (if-transcribed-confirm forced false)")
because MI-D merged the media confirmation into the answer instead of sending it separately.

This is unreachable because a flag is off, not because it is disconnected — someone may flip it back.
**Leave it, and name the class**, because the class is what is dangerous: a graph can carry arbitrary
amounts of dark surface that every reachability check calls live. Two more instances on this spine:
`Loop Over Items1` output 0 (the loop-done branch) and `if-message-is-audio` output 0 are both wired
to nothing.

## 9. Attachment send: 3 × `send-message-*` + Switch + Loop + 2 sendmsg calls (−5 nodes)

Unchanged; 14 nodes in the outbound-attachment lane. `send-message-images/video/files` are the same
respond.io node with a different media type and `Switch` picks by type. → one `send-media` node with
`type = {{$json.media_type}}`.

## 10. Sub-workflow naming and fork sprawl (readability, no node count)

Now **9** callers of `aoydkG1dbItXR5jXFEQsP` (`sorento-sub-respond-sendmsg-respond`), up from 7: the
media lane added `send-media-reply` and `send-transcript-confirm` rather than reaching an existing
send. Slice 1 removes two of the nine (`…-transcribed-message`, `…respond3`), leaving 7. Live's main
CRM read still calls a sub named `sub-get-results TEST`. → rename by what they do; retire forks whose
only difference is history.

## 11. Canvas layout has never been done (readability, 0 nodes)

Unchanged, and the media lane was dropped in wherever the editor put it. → lay out once by the target
shape below, positions written by script from the export so it is reproducible.

---

## 🆕 12. The media-intake lane (12 nodes) — what it duplicates and what it costs

```
redis-pop → detect-media → if-media-in ─true→ media-extract-http → media-extract → media-route
                          └false→ tf-message                                        │
   if-media-poll ─true→ wait-media-poll → media-poll-http → media-poll-merge ────────┘
                 └false→ if-media-ok ─true→ patch-transcript → tf-message
                                     └false→ if-media-reply → send-media-reply
```

- **It does not duplicate the outbound attachment path (§9).** That lane sends files *out*; this one
  reads media *in*. Different problem, no overlap.
- **It does duplicate "send one text message to the customer"** — twice. `send-media-reply` and
  `send-transcript-confirm` are the 8th and 9th callers of the same sendmsg sub, both reachable only
  from inside this lane. `send-transcript-confirm` is already dark (see §8).
- **It replaced a 5-node lane with a 12-node one** and left the *older* 4-node Whisper lane behind
  (slice 1 deletes it). Net intake cost since `57e70ce2`: +7 nodes, −5 after slice 1 → +2.
- **The async poll loop has no observed live traffic.** Across the 25 most recent spine executions,
  `media-poll-merge` and `media-poll-http` appear in **zero** of them — the CRM answered
  synchronously every time. So `wait-media-poll` → `media-poll-http` → `media-poll-merge` → back into
  `media-route` (4 nodes, a `Wait`, and the only loop in the spine) is carried on the strength of
  hand-written fixtures alone. That is the single best candidate for "does this branch need to exist
  at all" once the CRM's latency profile is known.
- It added one more by-name read into `compile-current-state` (§6).

## 🆕 13. `tests/MUTATION-BASELINE.md` is stale, in the flattering direction

Its whole-repo table reads 126/361 = 35 %. Re-measured on `origin/main` at the same
`--per-node 12`, several rows are far higher: `promo-picker` 17 → **83 %**, `compile-current-state`
42 → **83 %**, `build-suggest-offer` 33 → **83 %**, `disallowed-entity-gate` 25 → **75 %**. The fixture
work merged since it was written (PRs #32–#36) raised them and the file was not re-run. Nothing is
broken, but the document that exists to make coverage drift visible has itself drifted — and it drifted
*downward-reading*, which is the direction that makes you distrust good coverage.

---

## What the harness can actually catch — per-item weighting

`npm run mutate -- --node <name> --per-node 12`, measured on this branch. A **survivor** is a
statement of an untested behaviour: "flip this and every test still passes." An item touching a node
at 80 %+ can be attempted with the suite as the gate. An item touching a node in the teens cannot —
the refactor would be graded by a test that cannot fail.

| item | nodes it touches | kill rate | verdict |
|---|---|---|---|
| **§8 delete dead** | (deletes only; no body edited) | n/a — the guard is `prune-nodes.py`'s proof + the S2 wiring pin + `assemble.py --check` | ✅ **safe now** (this PR) |
| **§4 tag-* Set nodes** | 8 Set nodes + `escalate-catalog` 25 % | Set-node params are covered by the **S2 wiring pin** (exact param diff) and the `tag-set` flow lane, not by mutation | ✅ **safe to attempt** |
| **§3 routing Ifs** | 11 If nodes | If params covered by the **S2 wiring pin** + `route` flow lane asserts the PATH taken across 6 executions | ✅ **safe to attempt** — the path assertion is exactly the right gate |
| **§7 `ctx` object** | `disallowed-entity-gate` **75 %** + 18 readers | mechanical, and the gate itself is well covered | ✅ **safe to attempt**, one reader at a time |
| **§6 explicit `reply`** | `compile-current-state` **83 %** | the biggest body, but also one of the best covered | ✅ **safe to attempt** |
| **§2 single probe** | 0 Code nodes — 8 `executeWorkflow` param blocks | **no mutation coverage exists at all**: mutation only touches `jsCode`, and every line of those 180 duplicated lines lives in node *parameters*. The S2 wiring pin diffs them exactly, which catches an accidental change but proves nothing about behaviour | ⚠️ **attempt only behind a functional (clone) run** |
| **§1 dym twins** | `dym-transform` **83 %**, `-partial` **67 %**, `dym-annotate` **17 %**, `dym-annotate-partial` **8 %** | the *transform* half is gated; the *annotate* half is effectively untested | 🚫 **blocked on coverage** — write `dym-annotate*` fixtures first, or the merge is unverifiable exactly where the twins differ most (29 lines) |
| **§5 one miss lane** | `build-suggest-offer` **83 %**, `sibling-transform` 42 %, `annotate-incoming-picker` 42 %, `dym-annotate*` 17/8 % | same annotate hole as §1, over more nodes | 🚫 **blocked on coverage** |
| **§9 media send** | `Switch` + 3 respondio nodes, 0 Code | wiring pin only; a respondio node's parameters are not executed by anything | ⚠️ **functional run required** |
| **§12 drop the poll loop** | `media-poll-merge` **92 %**, `media-route` 58 %, `detect-media` 58 % | decent unit coverage, **zero live traffic evidence** | ⚠️ needs a latency measurement, not a test |
| **§10 renames / §11 layout** | none | wiring pin catches a rename; layout is `position` only | ✅ **safe now** |

Nodes the refactor will touch that are worth fixture work *before* anything else, measured on this
branch: `attach-merge` **0 %**, `dym-annotate-partial` **8 %**, `central-exchange` **10 %**,
`dym-annotate` **17 %**, `not-found-error-message` **17 %**, `validator` **17 %**,
`escalate-catalog` **25 %**. Full re-measured set, `--per-node 12`:

```
dym-transform 83   dym-transform-partial 67   dym-annotate 17   dym-annotate-partial  8
build-suggest-offer 83   compile-current-state 83   disallowed-entity-gate 75
annotate-incoming-picker 42   sibling-transform 42   not-found-error-message 17
crossdomain-compose 50   crossdomain-render 67   crossdomain-zeroset 42
detect-media 58   media-route 58   media-poll-merge 92   patch-transcript 100
promo-picker 83   escalate-catalog 25   tier-gate 42   tool-filter 33   validator 17
attach-merge 0    central-exchange 10   promo-dym-plan 60   tier-probe-collect 50
```

## 🚫 Blocked on a stale clone

The usual build-then-promote path routes through `sorento-consume-main TEST`
(`txiPzSxy3Pclsz6v`). Measured 2026-08-23: of the 40 Code bodies live and clone share, **13 differ**,
including `compile-current-state` by **635 lines** and `disallowed-entity-gate` by **197**. The clone
is not a copy of live any more; a structural refactor built on it would be rebasing blind. Any slice
past §8 needs a **fresh clone off `df165492`** first — which is also what
`plans/test-pyramid-and-git-deploy.md` step 6 says.

---

## Target shape (what the owner should be able to read in TOPOLOGY)

```
pop → media-intake → load-session → parse (LLM) → route-turn (Switch)
   ├ escalate / declined / access-choice / not-supported / clarify / ideate   → reply
   └ happy: resolve-entity → gate(ctx) → rag → get-results → validate
        ├ hit  → promo-picker → crossdomain → reply
        └ miss → miss-candidates → probe → annotate → suggest-offer → reply
reply → compile-current-state($json) → send + save-session + log
```

## Honest node-count target

The previous edition's "127 → ~80" was arithmetic over items 1–9. Redone at 134, and separating what
is *gated today* from what needs coverage first:

| | nodes |
|---|---|
| live today (`df165492`) | **134** |
| after §8 delete dead (this PR) | **129** |
| + §3 routing Switch (−7) + §4 tag-* (−8) — both wiring-pin/path-gated | **114** |
| + §2 single probe (−5) + §9 media send (−4) — need a functional run | **105** |
| + §1 dym twins (−4) + §5 one miss lane (−6) — **need fixtures first** | **95** |
| §6/§7 contracts unlock further cuts, unquantified until the contracts exist | ~85–90 |

So: **134 → ~95 with zero behaviour change**, of which **134 → 114 is reachable with the gate that
exists today**. The old "~80" was optimistic by roughly the size of the media lane plus the §6/§7
guess.

## Order (each step a separate hash-gated deploy, tests green, zero behaviour change)

1. **§8 delete dead** — 134 → 129. Safest, and it proves the `git → prune-nodes.py → deploy.py` loop
   end to end. *(this PR)*
2. **§11 scripted layout** — zero risk, biggest readability win per hour, and it makes every later
   diff legible. Can be done any time.
3. **§4 + §3 routing** — the wiring pin and the `route` flow lane's path assertion are the right gate.
4. Fresh clone off live; **fixture work on `dym-annotate*`** and the other sub-30 % nodes.
5. **§1 dym twins** → **§5 one miss lane** (now gated).
6. **§2 single probe** + **§9 media send**, behind a functional clone run.
7. **§6/§7** explicit `reply` / `ctx` contracts — the change that makes the rest of the graph
   rewireable, and the one to do last because everything above shrinks its blast radius.

Open decisions for the owner, surfaced by this re-derivation and **not** resolved here: the
`probe_cap: 8` removal (§1), whether `presign-fail-notice` gets wired or dropped (§8), and whether
the media poll loop has ever been needed (§12).
