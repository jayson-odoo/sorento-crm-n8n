# F-R4-3 — collapse the brand-suffixed promotions team (`marketing_promotion_<brand>` → `marketing_promotion`)

Captain, 2026-08-18, verbatim: **"fix it now, we should do marketing_promotion"**. Folded into round 4.

Sha convention for this file (and the round-4 diff doc): `printf '%s' "<raw param string>" | shasum -a256 | cut -c1-8`
— i.e. the exact bytes n8n stores in `parameters.jsCode`, no added trailing newline.

## The defect

CRM migration 371 merged the brand-suffixed T1 rows, so `marketing_promotion_sorento` is no longer a team
`next-assignee(team_code=…)` can resolve. Three producers disagreed:

| producer | value before | value after |
|---|---|---|
| `disallowed-entity-gate.company_team` | `` `marketing_promotion_${_brands[0]}` `` | `'marketing_promotion'` |
| `promo-picker._escTeam` last-resort default | `'marketing_promotion_sorento'` | `'marketing_promotion'` |
| parser fork `output_exchange.deriveRouting` (`a68c5992`, **not touched**) | `'marketing_promotion'` | unchanged |

Both consumers of `company_team` **prefer it over** the parser's routing, so one promotions turn could name
two different teams for one pool — the brand-suffixed one in `promo-picker`'s not-found / brand-gate offer and
the collapsed one in the round-4 miss offer. That directly breaks the invariant the whole miss-offer feature
rests on: *the phrase must name the team HI will actually assign to.*

## Consumers traced before editing (round-4 coder, 2026-08-18)

- `promo-picker._escTeam` (clone+live, body line 36): `company_team` → else `parser.routing.suggested_team`
  → else the literal default. Feeds all three of its offer strings (brand-gate denial, strict not-found,
  per-item `_promo_unmatched`).
- `escalate-catalog` `escalate_offer` arm, **live only** (live `#9 _ct` hunk, live body line 66):
  `_ct = disallowed-entity-gate.company_team || null`, then `${_ct || qf.routing.suggested_team}`.
  The clone's `escalate-catalog` (`0168df84`) has **no** `company_team` reference at all — the two bodies
  diverge (clone carries the round-2/3 miss work). Verified by grep on both bodies.
- No other node in the clone references `company_team` (JSON scan of all 171 nodes: only
  `disallowed-entity-gate` and `promo-picker`).

**Why no consumer change is needed:** after the collapse, `company_team === 'marketing_promotion'` is exactly
what `deriveRouting` puts in `routing.suggested_team` for the promotion domain. So `A || B` yields the same
string whichever side wins, at *both* consumers, on every promotions turn. The `_brands.length === 1` guard is
kept verbatim, so a mixed/unresolvable company set still yields `null` and both consumers still fall back to
the parser's routing exactly as before. The brand axis is not lost — `routing_brand` / `routing_companies`
(the block immediately below) still carry it for the roster call and the assignment.

## Hunk A — `disallowed-entity-gate` (anchor unique in BOTH bodies)

```js
// ANCHOR (before)
  out.company_team = (domain === 'promotion' && _brands.length === 1)
    ? `marketing_promotion_${_brands[0]}` : null;

// AFTER — 11 comment lines + the one changed expression
  out.company_team = (domain === 'promotion' && _brands.length === 1)
    ? 'marketing_promotion' : null;
```

## Hunk B — `promo-picker._escTeam` last-resort default (anchor unique in BOTH bodies)

```js
// ANCHOR (before)
  return (parser.routing && parser.routing.suggested_team) || 'marketing_promotion_sorento';

// AFTER — 3 comment lines + the collapsed literal
  return (parser.routing && parser.routing.suggested_team) || 'marketing_promotion';
```

Reachable only when `company_team` is null AND the parser emitted no team — rare, but it would still print a
team `next-assignee` cannot resolve, and it is provably the same collapsed-team situation, so it is fixed with
the same hunk rather than left as a second source of the defect.

## Sha table + the LIVE-ANCHOR GATE

**Measured, not trusted:** the live bodies were re-extracted from
`tests/backups/miss-company-routing/LIVE-PROMOTE-STAGED-20260818/PRE-9qVyfUxmRQqrpGRMDLRuz-7aba1447.json`
(the ACTIVE live body at promote-staging time) and compared byte-for-byte against the clone.

| node | clone PRE | live PRE | diverge? | anchor occurrences (clone / live) | POST (both) |
|---|---|---|---|---|---|
| `disallowed-entity-gate` | `ca13af1c` | `ca13af1c` | **no — byte-identical** | 1 / 1 | `069b3691` |
| `promo-picker` | `5d48c524` | `5d48c524` | **no — byte-identical** | 1 / 1 | `05a96e3a` |

⚠️ **This corrects the round-4 scope-change premise.** `disallowed-entity-gate` was expected to diverge
clone-vs-live; it does **not** — clone `061e46c9` and live active `7aba1447` carry the identical
`ca13af1c` body, and the hunk applied to the live body produces the identical `069b3691`. So the
"re-anchor on the live body" risk does not arise for this node. The node that *does* diverge in this
neighbourhood is `escalate-catalog` (clone `0168df84` vs live `8b4ae985`), and it is **not** touched here.

## Promote implication

The staged live payload gains **two** changed nodes, not one:

- `disallowed-entity-gate` `ca13af1c` → `069b3691` (**5th** changed node)
- `promo-picker` `5d48c524` → `05a96e3a` (**6th** changed node)

⇒ **6 changed + 10 new + 12 connection keys @ 137 nodes.** Both are pre-existing live nodes (not part of the
round-2/3 new-node set), both are byte-identical clone↔live at PRE, so each can be applied to live with the
same anchored hunk and sha-gated on `ca13af1c` / `5d48c524` before the write. The coordinator re-stages the
payload.
