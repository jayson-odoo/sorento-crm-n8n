# Mutation baseline — how much would the suite actually notice?

Measured 2026-08-23 on `main` @ `331a334` + this branch. Reproduce with:

```bash
npm run mutate                                   # every Code node, both slugs, 12 mutants each
npm run mutate -- --node output_exchange --per-node 100
npm run mutate -- --node output_exchange --list  # how many mutants the body admits at all
```

`npm test` going green says "no fixture disagreed with the body". It does **not** say the fixtures
would have noticed if the body were wrong. This file records the second number, so drift in it is
visible. The harness is `tests/harness/mutate.js`; it always exits 0 and is deliberately **not**
wired into `npm test` (it takes ~25 minutes and it is a metric, not a gate).

## What the number means

A mutant is one deliberate edit to one node body — an operator swapped, a boundary shifted, a
constant flipped. The body is loaded through `tests/offline/node-source.js` (sha-verified against
`export/MANIFEST.json`, never a hand copy), mutated into a scratch directory, and fed back to the
suite through that module's `OFFLINE_NODES_DIR` hook. **`export/` is never written.** Comments,
string literals and regex literals are excluded from mutation: `output_exchange.js` is roughly half
prose, and a `===` inside a comment is unkillable by construction, so counting those as survivors
would deflate the score with noise nobody can act on.

Mutants are sampled evenly across the file and the sample is deterministic, so two runs at the same
`--per-node` compare like with like. `output_exchange.js` admits **706** mutants in total; the
headline below samples 100 of them.

A **survivor** is a precise statement of an untested behaviour: "flip this `&&` on line 660 and every
test still passes." That list is the worklist. Survivor lines mark the exact mutated token with
`»…«`, because a long line can hold three `&&`s that mean completely different things.

## Headline: `sub-semantic-parser/output_exchange`

The parser's output shaper, 1,386 lines, the repo owner's #1 regression worry.

| | mutants | killed | rate |
|---|---|---|---|
| before (3 captured fixtures) | 100 | 22 | **22 %** |
| after (74 fixtures: 3 captured + 71 reasoned) | 100 | 88 | **88 %** |

All 12 remaining survivors are argued equivalent below. (A separate ad-hoc harness scored this node
9/30 = 30 % before this work; that run sampled only `===`/`&&` and did not exclude comments, so its
number is not comparable to the ones above. The 22 % row is this harness measuring the same
pre-change fixture set.)

## Whole repo, `--per-node 12`

Overall **126/361 = 35 % → 133/361 = 37 %**. Only `output_exchange` changed; every other row is
today's untouched baseline, and most of them are low. This table exists so that is no longer
invisible.

| node | mutants | killed | % |
|---|---|---|---|
| access-level-choice-message | 12 | 3 | 25 |
| annotate-incoming-picker | 12 | 5 | 42 |
| attach-merge | 12 | 0 | 0 |
| build-cs-member-offer | 12 | 3 | 25 |
| build-ideate-reply | 12 | 8 | 67 |
| build-suggest-offer | 12 | 4 | 33 |
| central-exchange | 10 | 1 | 10 |
| compile-current-state | 12 | 5 | 42 |
| construct-user-prompt | 4 | 4 | 100 |
| crossdomain-compose | 12 | 5 | 42 |
| crossdomain-render | 12 | 8 | 67 |
| crossdomain-zeroset | 12 | 5 | 42 |
| cs-roster-plan | 7 | 5 | 71 |
| disallowed-entity-gate | 12 | 3 | 25 |
| dym-annotate | 12 | 2 | 17 |
| dym-annotate-partial | 12 | 1 | 8 |
| dym-transform | 12 | 8 | 67 |
| dym-transform-partial | 12 | 1 | 8 |
| escalate-catalog | 12 | 3 | 25 |
| escalation-context | 12 | 5 | 42 |
| not-found-error-message | 12 | 3 | 25 |
| patch-transcript | 5 | 5 | 100 |
| presign-fail-notice | 9 | 0 | 0 |
| promo-dym-plan | 10 | 6 | 60 |
| promo-picker | 12 | 2 | 17 |
| sibling-transform | 12 | 5 | 42 |
| tier-gate | 12 | 5 | 42 |
| tier-probe-collect | 12 | 6 | 50 |
| tier-probe-plan | 4 | 2 | 50 |
| tool-filter | 12 | 4 | 33 |
| validator | 12 | 2 | 17 |
| **output_exchange** | 12 | 2 → **9** | 17 → **75** |
| suggest-follow-up | 12 | 5 | 42 |

Nodes with 0 mutants (`mock-reformulator-output`, `set-human-intervened`,
`set-ran-query-formulator`, `sorento-sub-respond-findcontact-respond`, `tf-message`) are one-liners
or pure literals with nothing to perturb. `presign-fail-notice` is the one remaining node marked
`.dead` in the fixtures tree. (`Code in JavaScript` and `transcribed-message` were also on both lists
until 2026-08-23, when they were deleted from live with the rest of the dead Whisper lane —
`docs/SIMPLIFY-spine-audit.md` §8.)

> ⚠️ **This table is STALE and reads LOW.** Re-measured 2026-08-23 at the same `--per-node 12` after
> the fixture work in PRs #32–#36: `promo-picker` 17 → **83 %**, `compile-current-state` 42 → **83 %**,
> `build-suggest-offer` 33 → **83 %**, `disallowed-entity-gate` 25 → **75 %**, `dym-transform` 67 →
> **83 %**, `crossdomain-compose` 42 → **50 %**. The rows below have not been re-run wholesale; the
> per-item numbers in `docs/SIMPLIFY-spine-audit.md` are the current ones. Re-run `npm run mutate`
> and replace this table before quoting the 35 % headline again.

`output_exchange`'s 75 % at `--per-node 12` and 88 % at `--per-node 100` are the same suite measured
at two sample sizes; the deeper sample is the one to trust and the one to track.

## Remaining survivors on `output_exchange` — all equivalent

An equivalent mutant changes no observable output, so no test can kill it. Each is justified; if a
future refactor makes one of these reachable, it stops being equivalent and belongs back on the
worklist.

| line | mutation | why it cannot be killed |
|---|---|---|
| 27 | `String(brandEnt.raw \|\| '')` → `&&` | `brand` is computed in `deriveRouting` and never read: the `switch` returns fixed teams, and `promotion` collapsed to one team when the brand moved to `query_brands`. **Dead value — see finding 1.** |
| 95, 204, 539, 657, 688 | `String(v ?? '')` → `\|\|` | `??` and `\|\|` differ only on `''`, `0`, `false`, `NaN`. Every value reaching these is a JSON string, `null` or `undefined`, and `String('')` is `''` either way. A numeric `0` hint / canonical_code / brand / tier token cannot occur. |
| 114 | `_ceRefPickedKeys` exemption `return false` → `true` | The reference-positions block replaces `entities` **wholesale** with only ref-picked rows, so a ref-picked entity can never sit beside a carried evictable one. Judge them all "carried" and the contribution loop skips them all, `_rcEvict` is false and the eviction filter never runs — the same output as the real path, where none is carried and nothing is evictable. M2 is defensive against a control flow that does not exist yet. |
| 878 | `e.current_message === true` → `!==` | That clause is the second disjunct of `A \|\| B` where `A = entities.some(hint === 'attachment_type')`. `B` re-tests the same hint, so `B ⟹ A`: whenever `B` could change the answer, `A` is already true. |
| 1107, 1377 | `Number(positions_resolved) > 0` → `>= 0` / `> 1` | `positions_resolved` is only ever written by the reference-positions block, which runs only when `reference_positions` is non-empty and never clears it — so whenever it is `0`, the `reference_positions.length > 0` disjunct is already true. When it is absent, `Number(undefined)` is `NaN` and compares false under every operator. |
| 1131, 1178 | `!Array.isArray(...)` drop-`!`, `_prev.entities.length > 0` → `>= 0` | Both sit in the `else if` arm of the promotion scope-reuse block, which is **unreachable — see finding 3.** |

## Real findings in the node

### 1. `deriveRouting`'s `brand` is dead code (cosmetic)

Lines 20–34 compute a promotion brand from `query_brands`, the brand entity and the access levels,
then clamp it to the `sorento|cabana|mocha` enum. Nothing reads it: `case 'promotion'` returns the
single `marketing_promotion` team (CRM migration 371 moved the brand to `brand_code`), and no other
arm mentions it. Fifteen lines of load-bearing-looking logic that cannot affect an output. Safe to
delete; kept out of this PR because this PR adds no behaviour changes.

### 2. `ideate`'s documented "no CS team" never reaches the output (cosmetic)

`deriveRouting` returns `{suggested_team: null, suggested_agent: 'ideation'}` for `ideate`, with a
comment explaining that an idea is captured and never escalated. But the final assignment is
`… ?? norm(derived.suggested_team) ?? norm(priorRouting.suggested_team) ?? 'customer_service'`, so a
null team is replaced by the previous turn's team, or by `customer_service`. An ideate turn therefore
ships a CS team, and the `default:` arm's null is equally unreachable. Harmless today (the agent —
which is what `check-access-http` keys on — is correct, and ideate does not escalate), but the code
comment and the behaviour disagree. Pinned by `routing-domains-multi-item`.

### 3. The promotion scope-reuse block's second arm is unreachable (cosmetic)

```js
const _prevScope = (_quoted || _dymPick) ? [] : (Array.isArray(_prev.entities) ? _prev.entities : []);
if (domain === 'promotion' && _picking && _prevScope.length > 0) { … }
else if (domain === 'promotion' && _picking && _noScope && !_quoted && !_dymPick
         && Array.isArray(_prev.entities) && _prev.entities.length > 0) { … }
```

The `else if` requires `!_quoted && !_dymPick`, under which `_prevScope` **is** `_prev.entities`; so
`_prev.entities.length > 0` implies `_prevScope.length > 0` and the first arm has already fired. The
second arm can never run, which is why `_noScope` (line 1131) and its length test (line 1178) are
unkillable. Deleting it would remove the only reader of `_noScope`.

### 4. 🔴 Numbered did-you-mean multi-select is last-wins, not ADD-BOTH

The one behavioural defect found. `dymNumberedMultiSelect`'s own comment states the contract:

> LOOP every reference_position (R-v3-1 ADD-BOTH) … a `for_raw` already consumed this turn falls to
> append, so two alternatives for ONE missed token are both ADDED (never last-wins).

They are not, in the common case. `applyDymPick` looks the source entity up in four tiers — stamped
`dym_slot`, `for_raw`, `for_canonical`, then an *unambiguous single `for_hint`*. Passing
`_useSlot = false` disables **only tier 0**. On the second pick `for_raw` no longer matches (pick 1
overwrote that `raw`), so control reaches the `for_hint` tier, finds exactly one entity of that hint
— pick 1's own freshly written entity — and replaces it. The first choice is silently lost. The
shared offer re-hits the first pick's new entity by a different route, which is precisely what
`_useSlot` was introduced to prevent.

Reproduced offline: prior scope `[{raw:'ax', hint:'product'}]`, dym rows `A-1` and `A-2` both
`for_raw:'ax'`, positions `[1,2]` → final entities `[A-2]`. With a second unrelated product in prior
scope the `for_hint` tier becomes ambiguous, the append path runs, and both survive — so the bug is
invisible on any transcript where the customer had more than one entity in scope.

Customer impact: picking two did-you-mean suggestions returns results for only the second.

Both shapes are committed:
`dym-multiselect-adds-both-when-hint-is-ambiguous` (works) and
`dym-multiselect-KNOWN-DEFECT-second-pick-replaces-first` (does not). The second is clearly labelled
in its `source.rationale` as pinning a defect rather than a contract; when the `for_hint` tier is
skipped on the numbered path, its `expected` must change to hold both codes.

Not fixed here: this PR adds tests only, and a parser change edits the LIVE published sub
`XTODTw-dJcV0uRdC056hG` (there is no wired fork shielding it), so it is user-gated promotion work.

## Fixture provenance

`tests/unit/_all-nodes.test.js` now splits the summary table three ways, and S6 enforces the values:

- **runData** — captured from a real execution's `runData`. 121 fixtures.
- **reasoned** — decision fields derived from the node's contract *first*, then confirmed against the
  body; the fixture was only written once every prediction held. 72 fixtures, all on
  `output_exchange`. Three predictions failed on the way and were traced to errors in the
  reasoning, not the body (a forgotten blocklist entry, a mis-read `reuse` trigger, a hint wrongly
  believed blocked); each spec was corrected rather than the expectation rubber-stamped.
- **body-run** — body executed once and whatever it returned frozen. 23 fixtures, all pre-existing.
  These are the weakest and are the reason the kill rate was low.
