# §PP-0 — promotion-picker baselines (recorded 2026-08-09)

Plan: `plans/promotion-picker-plan.md` · UAC: `tests/uac/PP.md` · Ticket: GH #3

**Target:** fork `RnpxEnAV3g20MmKj` (`sorento-consume-main PROMO-PICKER`) @ `9c00e846`, parser fork
`RJ326g9dwe3bTWyf` @ `9f848231`. Driven via forked runner `M5m6EYDLdSc0ofto`
(webhook `zz-run-promo-picker`), `mode: "uac"`, `previous_conversation_state: {}` unless the case
carries state forward. Exports `--verify` green at run time.

**These are recordings of TODAY's behaviour, before any edit.**

---

## PP-0a — bare ask, contact with many access types ✅ RECORDED

`"any promotion?"`, contact `437264483`, clean state.

- `intent_hint: check_promotion`, `domain_hint: promotion`, `access_levels: []`
- `If4` **FALSE** → `access-level-choice-message` → prompt
- reply: **"Please specify which access level you'd like to use for promotions:"**
- `quick_reply`: `Cabana Dealer,Cabana Office,End User,Mocha Dealer,Mocha Office,Sorento Dealer,Sorento Office`

🔑 **This contact holds SEVEN access types across THREE companies.** Every bare promotion ask costs a
round-trip to pick one of seven buttons.

Egress clean: `save-message-redis would_log`, `save-session-vars would_write`, `sendmsg-sub would_send`.

## PP-0b — 🔴 THE RED — stale carry **REPRODUCES** ✅

Three turns, state carried forward each time:

| turn | message | `access_levels` after | reply |
|---|---|---|---|
| 1 | "any promotion?" | `[]` | the access-level prompt |
| 2 | "Sorento Dealer" | `["Sorento Dealer"]` | 1 promotion + PDF attached |
| 3 | **"any promotion?"** (level NOT restated) | **`["Sorento Dealer"]`** | same Sorento Dealer promotion |

Turn 3 inherited a level the customer never restated. **The premise of the change is confirmed — the
build may proceed.**

Node-level confirmation (exec `11823385`, turn 2): parser emitted `access_levels: ["Sorento Dealer"]`;
`Aggregate.name` = all 7 types; `If4` **TRUE**; `access-level-choice-message` **NOT EXECUTED`;
`compile-current-state` persisted the level. Asserted from `runData`, not from execution status.

## PP-0c — 1 access type — ⏸ NOT RUN

No contact with exactly one access type identified. `437264483` has seven. Not blocking: the
`names.length === 1` shortcut is visible in `If4`'s condition and S2 subsumes it (the OR-pair
collapses to `names.length > 0`).

## PP-0d — ⚠️ MEASURED THE WRONG GATE

`CONTACT_NO_ACCESS` (`457216562`) returns **"Sorry, you are not allowed to access general_enquiries"**.

That is `check-access` → `If5` — **agent-level** access — not `If4`'s zero-access-**types** branch.
Two different gates; the plan conflated them.

🔴 **Consequence: the branch S2 must preserve is UNVERIFIED.** Testing it needs a contact that passes
`check-access` for `general_enquiries` but whose `get-access-types` returns `[]`. Until such a contact
exists, do not claim the 0-type path is preserved — and do not assume it is dead either.

## PP-0e — product-scoped promotion ✅ RECORDED (and it moved the design)

**`"any promotion for SRTSH1040"`, clean state → the SAME access-level prompt.**
The product resolved (`{raw: SRTSH1040, hint: product, confident: true}`) and it still never reached
get-results, because `access_levels: []` → `If4` FALSE.

🔑 **Today, EVERY promotion turn without a stated level is gated — scoped or not.** The prompt costs a
round-trip even when the customer was already specific. This widens S2's value beyond the bare ask.

With a level forced, to reach get-results:

| query | promotions returned |
|---|---|
| "Sorento Dealer" (bare, turn 2 above) | **1** — file attached immediately |
| "Sorento Dealer promotion for SRTSH1040" | **0** |
| "Mocha Dealer any promotion" | **0** |

🔑 **Measured volumes are 0–1, not 22.** The CRM's `AND_MODE_LIMIT` comment ("22 Sorento+End-User
promotions") describes a different, entitlement-wide scenario and must not be used to size this
feature. Consequences: **no cap is needed**, **grouping by company is unnecessary**, and D2
(one promotion ⇒ send the file) is the *common* path, not an edge case.

---

## Pre-existing defects found while baselining (NOT introduced here)

**D-1 — the access level is printed twice in the not-found message.**

```
Mocha Dealer any promotion
→ "Could not find promotion for Mocha Dealer for Mocha Dealer.
   Would you like me to escalate to marketing_promotion_mocha team?"
```

`not-found-error-message` builds `Could not find ... ${requested}${access}`, where `requested` falls
back to the token text ("Mocha Dealer") and `access` appends `" for " + access_levels.join(', ')`.
Live has this today. Cosmetic, customer-visible. Out of scope for PP — log it separately.

**D-2 — a bare product token fans out to 5 products.**
`"Sorento Dealer promotion for SRTSH1040"` rendered `• product: SRTSH1040-T (+4 more)`. Worth knowing
before S4 renders a picker over product-scoped promotions; it is the multi-match surface, not a
promotion-count surface.

---

## §0 safety

Every run: egress rows were `would_log` / `would_write` / `would_send` only — no real send, no CRM
write. All sub calls resolve to forks (verified statically after the repoint; no call reaches a live
sub). S7a/S7b snapshots are taken by the runner (`llen-sink-before/after`,
`llen-prod-before/after`) — **assert them from the run output before signing off any case**, per §0's
8-minute retention rule.
