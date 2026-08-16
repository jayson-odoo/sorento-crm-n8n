# UAC §DC

> ⚠️ **`00-SAFETY-always-read.md` (§0) applies to every case here.**

## §DC. Canaries owed by the live `tryDymPick` prior-domain deletion — scope `parser`

> # ⛔ RETIRED / SUPERSEDED 2026-08-02 — DO NOT RUN §DC-1 or §DC-2 AS WRITTEN
> The code these two canaries were written against **no longer exists**. Bundle change #5
> (promoted live 2026-08-01, parser `88ef5c40`) replaced that whole region of `applyDymPick`. Live
> `output_exchange` **L204–218** now reads:
> ```js
> const _isBareCode  = norm(_hit.code) === norm(String(parent_input.latest_user_message ?? '').split(/\s*reply to:/i)[0]);
> const _viaNumbered = (_useSlot === false);
> if ((_isBareCode || _viaNumbered) && _offer && _offer.domain) {
>   output.output.domain_hint            = _offer.domain;
>   output.output.intent_hint            = _pv.intent_hint ?? null;
>   output.output.dym_pick_domain_forced = _offer.domain;
> }
> ```
> Three premises of §DC-1/§DC-2 are now false: the domain source is **`_offer.domain`**, not
> `_prev.domain_hint`; the intent rule is **`_pv.intent_hint ?? null`**, not `current || prev` or
> `prev || current`; and there is a **new gate** (`bare-code OR numbered`) that did not exist. Running them
> as written would report the behaviour of deleted code — the `green-that-cannot-fail` class.
>
> **Replacement coverage is already written: run `§DC5` instead** (`§DC5-0`, `§DC5-0b`, `§DC5-1`,
> `§DC5-REGR-newquery`, `§DC5-REGR-abort`, `§DC5-REGR-unrelatedcode`, `§DC5-noreg`). §DC5 tests #5's real
> gate in **both** directions, which is the property §DC-1/§DC-2 were reaching for:
>
> | probe (offer domain) | raw LLM | FINAL | `dym_pick_domain_forced` | fork exec |
> |---|---|---|---|---|
> | `SRT59-CR promotion` (inventory) | promotion | promotion ✅ | `None` — gate declined | `10839868` |
> | `have stock for srtwc8518-SH ?` (product_attachment) | inventory | inventory ✅ | `None` — gate declined | `10839898` |
> | bare `SRT59-CR` (inventory) — **⭐ POSITIVE CONTROL** | master_products | inventory | **`inventory` — FIRED** | `10839914` |
>
> ⚠️ **The positive control is not optional.** A #5 gate family that only ever shows the gate *declining*
> passes whether or not the gate can fire at all. §DC5's sign-off must cite a firing case; a §DC5 result
> without one is not evidence (LESSON 61).
>
> **§DC-0's substance survives, elsewhere:** the fork-parity precondition moved to **§27.0a**, where it is
> now a cheap *re-verify* (fork `wI5RkNGW3EOJfBdo` `output_exchange` is byte-identical to live `XTODTw`,
> sha1 `ceadf7bc…`, `diff` = 0 lines) rather than a build step. Cross-ref: plan §0.3, §0.11.

<details>
<summary>Historical text of §DC-0 / §DC-1 / §DC-2 (kept for provenance — not runnable)</summary>

## §DC-0 — ⛔ BLOCKER (run FIRST; DC-1/DC-2 are VOID until it passes)
- The clone's parser fork **`wI5RkNGW3EOJfBdo` still contains** the deleted line (fork L210):
  `if (_prev.domain_hint) { output.output.domain_hint = _prev.domain_hint; output.output.intent_hint = output.output.intent_hint || _prev.intent_hint; }`
  — absent from live `XTODTw`; every other difference in `output_exchange` is whitespace.
- **Expect:** delete that line from the fork, re-diff live↔fork, require **whitespace-only** difference.
- Until then, any DC canary exercises the **OLD** code and reports the OLD behaviour — false green or false
  red (`green-that-cannot-fail`). A DC result recorded before §DC-0 is **void, not pending**.
- ✅ **CLOSED 2026-08-02** — the line is gone from both sides; see §27.0a.

## §DC-1 — Incompatible pick: prev domain `order`, picked candidate `entity_type: promotion`  ⛔ RETIRED
- **Pre:** a turn establishing `variables.domain_hint = 'order'` plus a `dym_offer` whose candidates include
  one with `entity_type: 'promotion'`.
- **Chat input:** type that promotion code (a bare-code dym pick).
- **Expect:** the deleted line no longer force-carries `order`. Domain now comes solely from the rev4
  domain-continuity block (`output_exchange` L499–525), which inherits the prior domain **only** when every
  current-message entity's hint is compatible per `DOMAIN_BLOCKED_HINTS[prevDom]`. Assert: the picked entity
  keeps `hint: 'promotion'` (tryDymPick forces `_picked.hint = _hit.entity_type`), and either
  `domain_inherit_blocked: 'order'` is present **or** `domain_inherited_compatible` is absent.
- **Hard fail:** `domain_hint = 'order'` alongside a `promotion` entity (order-domain contamination).
- **Safety:** §0 all.
- ⛔ **Invalid as of #5:** a bare-code pick is now *deliberately* force-routed to `_offer.domain`, so the
  "domain comes solely from the rev4 block" premise is false, and the expectation would produce a
  spurious red. The order↔promotion contamination question is now covered by `§DC5-REGR-unrelatedcode`.

## §DC-2 — Intent precedence flipped: old `current || prev`, rev4 L520 is `prev || current`  ⛔ RETIRED
- **Pre:** turn 1 establishes `variables.intent_hint = 'check_stock'`.
- **Chat input (turn 2):** a bare-code dym pick where the LLM emits a **different non-null** `intent_hint`
  (e.g. `check_price`) and the domain signal is **not** explicit (`_explicit === false`).
- **Expect:** `intent_hint = 'check_stock'` (**prev wins** under rev4 L520
  `prev.intent_hint || current || null`), and the reply is the **stock** answer, not the price answer. Under
  the deleted line the current value would have won.
- **Safety:** §0 all.
- ⛔ **Invalid as of #5:** on a fired pick, `intent_hint` is now `_pv.intent_hint ?? null` — an
  **unconditional overwrite** from prior state, not an `||` precedence choice. The expected value happens to
  coincide in this one scenario, which makes the case *worse* than useless: it would pass for the wrong
  reason. Covered by `§DC5-0` / `§DC5-0b`.

</details>

---

# Change: `quoted-turn-state-pointer` — plan `../plans/quoted-turn-state-pointer-plan.md`

Four deltas. **C1** = CRM read-contract widening (`session_vars.referenced_state`) — CRM side, verified by
CRM pytest (§27.11), **not** by this harness. **C2** = the parser rebase, scope **`parser`**, **touches
LIVE** (parser `XTODTw-dJcV0uRdC056hG`, user-gated). **C3** = one spine leaf, scope **`deterministic`**,
**touches LIVE** (spine `9qVyfUxmRQqrpGRMDLRuz`, user-gated). **C4** = clone-only harness injection, scope
**`deterministic`**, touches nothing live.

> # ⚠️ REVISED 2026-08-02 — read this before running any §27 case
> The 6-change did-you-mean/partial-resolution/domain bundle went **LIVE 2026-08-01** (parser `88ef5c40`,
> spine `a40cd16d`; `output_exchange` 740 → 867 lines). Five changes to §27:
> 1. **§27.0a is SATISFIED** — the fork re-sync happened as part of the bundle. It is now a *re-verify*
>    gate, still mandatory.
> 2. **§27.0c is NEW** — clone-spine parity with the bundle (verified; re-verify before running).
> 3. **§27.3 is REWRITTEN.** The old "carry-site count stays at two" gate is **WRONG and would
>    false-fail** — live has 9+9 assignment sites and both carry gates gained `&& !_switchDomain`. It is
>    now a *content* gate with a mandatory induced-failure step.
> 4. **`referenced_state` now carries FIVE keys** — `dym_last_result_set` was added (plan §0.9). §27.5
>    gains rows **h/i**, and **§27.2b** and **§27.12** are NEW and are the two cases that hold that line.
> 5. **§27.13 is NEW** — it *records* the F7 gap (a quoted numbered dym pick needs a live dym marker),
>    scored MASKED. A §27 sign-off that does not mention F7 is incomplete.
>
> Also: **C1's four-key projection is already DEPLOYED and proven against prod** (clone execs `10820850`
> non-null / `10820865` null-with-key-present). The 5th key is the only CRM work left, and **C2 must not be
> promoted before it lands** (plan §6 ordering constraint / §9 M14).

Notation: cases run on the clone `txiPzSxy3Pclsz6v` in `mode=regress-capture` (session from
`n8n_test.respond_contacts_test`) unless the case says `sim-inject`. `sim-inject` cases put
`previous_conversation_state` + `referenced_result_set` + **`referenced_state`** (C4) directly in the redis
item — `sim-inject-gate` routes them to `sim-inject-session` → the `get-session-vars` NoOp, bypassing both
the Postgres and CRM session reads. Contact `437264483` (FULL access) unless stated. Every case is bound by
**§0 S1–S8**; a §0 failure is a hard fail regardless of functional correctness.

> **Grounded premises (measured live; ⭐ = re-measured or corrected 2026-08-02 — do NOT re-derive):**
> (a) **Outgoing `turn_id` is threaded on the ESCALATION path** — `Call 'sub-human-intervention'` passes
> `turn_id = $execution.id`, the sub declares it, all three of its sendmsg calls forward it, and both
> sendmsg loggers persist it. The predecessor plan's blocker #1 is CLOSED.
> (b) **Live parser emits `_parser_raw`** — ⭐ `output_exchange` **L76 + L866** (was 737) →
> `state_trace.parser_raw` is populated on live, so both raw and applied parser state are inspectable per
> turn. Note `_parser_raw_snapshot` snapshots `output.output`, **not** `parent_input`.
> (c) **`state_trace`'s `trim()` collapses ONLY `last_result_set` / `referenced_result_set` /
> `dym_candidates`, and only at TOP LEVEL** → `dym_offer.candidates`, `entities`, `domain_hint`,
> `intent_hint` survive intact. ⭐ **`dym_last_result_set` is NOT in that list either, so it also survives
> VERBATIM** — that is what makes the 5th key possible. `state_trace.after` is `compile-current-state`'s
> unwrapped `variables` (20 keys + a conditional 21st `dym_last_result_set`, emitted only when a dym set
> was armed).
> (d) ⭐ **The fork is now BYTE-IDENTICAL to live on `output_exchange`** (sha1
> `ceadf7bc933b4156b5e65c8758eddefd03c8c673`, `diff` = 0 lines, 867 lines each) and on `systemMessage`
> (sha1 `eaf99055f458caeebb787049de6b5a46c0c4c631`, 31,377 bytes). The 2-line `tryDymPick` overwrite is
> gone from both sides. The fork still carries the extra **orphaned** `Postgres Chat Memory` node (8 nodes
> vs live's 7) — so LESSON 57's "never block-copy the fork" rule stands.
> (e) **The clone CAN take injected session state** — `sim-inject-gate` → `sim-inject-session` (LESSON 31 is
> stale for the clone). ⭐ Re-fetched: it is still the **2-key** form; C4's third key is genuinely unbuilt.
> (f) ⭐ **NEW — quoting an INCOMING message yields `referenced_result_set: null`**, because incoming rows
> carry no `result`. Only quoting an **OUTGOING bot bubble** yields both keys. Any case that quotes a
> customer message and asserts on `referenced_result_set` is a `green-that-cannot-fail`.
> (g) ⭐ **NEW — `chat_histories.result` holds the STOCK set, never the dym set.** Only
> `sorento-sub-respond-sendmsg-respond2` passes `result_set` at all
> (`= compile-current-state.variables.last_result_set`), and the sub's `Code in JavaScript` further filters
> it by every line-start number scraped from the bubble text (`/(?:^|\n)\s*\*?(\d{1,3})[.)]/g`) — which
> **includes the did-you-mean numbers**, since they render as `  N. label`. Plan §0.10 / flag F8.
