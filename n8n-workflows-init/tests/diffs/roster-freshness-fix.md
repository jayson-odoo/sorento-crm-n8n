# Node diff — judge "new enquiry" on what the customer typed, not on carried entities

**Date:** 2026-08-20 · **Target:** clone `txiPzSxy3Pclsz6v` (`47490b90` → `a2c71918`), node `compile-current-state`, ONE hunk. Live untouched.
**Reported by the captain:** *"why the 'all' didn't get recognised to be all the elements in the list?"* (exec 13238351).

## Cause — a collision between two of the same day's changes

Reconstructed from the session (execs 13238238 → 13238351):

| turn | message | persisted |
|---|---|---|
| 1 | `customer yoo living delivery status for srtwc286` | `selection_context: disambiguation`, customer roster of 2 |
| 2 | `1` | **`selection_context: null`, roster gone** |
| 3 | `2` | picked order #2 from the answer rows |
| 4 | `all` | nothing to expand |

`all` is gated on an open offer context (`_pickCtx` = a reply-to set, `disambiguation`, or `suggest_offer`). By turn 4 the context was null, so the expansion arm never ran and the LLM's `scope_intent: broaden` stood.

The context died at turn 2, and the reason is this morning's own pair of changes working against each other. The persistent-roster block drops the roster when the turn names a "freshly typed" entity, detected as `current_message` with no pick provenance. The pick-keeps-scope block (parser block C) re-attaches the prior scope on a pick — as `current_message`, with no `ordinal`. So the re-attached product looked like a brand-new enquiry and evicted the roster the other change existed to preserve. Proven: turn 2's raw LLM entities were `[]` (the message was "1") while the post-processed set carried `srtwc286`.

## The hunk

Judge freshness on the **LLM's own entity list** (`_parser_raw.entities`) — what the customer actually typed this turn — instead of the post-processed set. Falls back to the previous test when `_parser_raw` is unreadable.

No change to `all` itself: with the roster alive, `selection_context` is `disambiguation` again, so the existing expansion arm fires on its own.

## Acceptance (console, clone `a2c71918`, zero egress)

| step | result |
|---|---|
| `customer yoo living delivery status for srtwc286` | picker, 2 companies |
| `1` | orders for YOO LIVING HOUSE + srtwc286; roster **stays alive** (`cust n: 2`, `selection_context: disambiguation`) |
| `all` | `reference_positions: [1,2]`, `select_all_expanded: true`, entities = both companies **plus** the carried product — exec 13238696 |
| `Customer Mastile Klang Srtwc286 August delivery` | roster cleared, answer is exactly order `202608-2349` — new-enquiry rule intact |

## Promote (HELD)

Ships with the persistent-roster and pick-keeps-scope changes; all three are one behaviour. `compile-current-state` is drifted on live, so the hunk re-applies onto a fresh live GET.
