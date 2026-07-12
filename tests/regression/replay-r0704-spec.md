# Replay r0704 — spec (per-contact sequential regression of the 202607041149 CSV)

## Goal
Deterministic A/B regression of THIS session's live changes over 312 real incoming
messages (24 contacts), **per contact, in time order, session threaded**.
HARD SAFETY: 0 real WhatsApp send, 0 assignment, 0 prod CRM session write. Session state
lives ONLY in `n8n_test.respond_contacts_test`. Assert `test:egress:{run}` == 0 every run.

## Frozen target
"Current live" = spine `9qVyfUxmRQqrpGRMDLRuz` @ **activeVersionId 98a061cd** (freeze; live
kept moving this session). All business deltas ported to the clone must match THIS version.

## Data (already loaded, isolated — DO NOT touch the 2216 corpus)
- `n8n_test.chat_histories_r0704` — the 710 rows (312 incoming) from the CSV. ids 37825–38534 (disjoint from corpus).
- `n8n_test.v_turns_r0704` — VIEW, same shape as `v_turns` but over the r0704 table. 312 incoming turns, 24 contacts, turn_index per contact by sent_at.
- Rationale for isolation: 17 of 24 contacts also exist in the corpus; selecting by contact_id on the shared `v_turns` would mix datasets. r0704 view is clean.

## A/B method (baseline = REAL production reply)
The CSV already carries the real prod replies (`type='outgoing'`), paired per incoming in
`v_turns_r0704.expected_reply`. That IS the pre-change baseline — no re-capture needed.
1. **Port current-live (98a061cd) deltas** onto the clone (below), preserving the fail-closed rig.
2. **One capture pass** over `v_turns_r0704` on the ported (new-logic) clone — per contact, sequential, session threaded via `respond_contacts_test`, 0 egress. Record each turn's NEW reply + branch.
3. **Diff** new reply vs `v_turns_r0704.expected_reply` (real prod reply). Semantic compare (tolerate LLM phrasing noise; focus on: branch changed, entity dropped, not-found↔found flip, crash/not-supported, uuid/description leak).
4. Triage each divergence: intended-fix | regression | no-change.
(Optional stricter pass later: capture baseline on stale clone + pinned replay for node-level determinism — skip unless a divergence is ambiguous.)

## Deltas to port onto the clone (match live 98a061cd)
Port the CURRENT-LIVE version of these business nodes onto the clone, adapting node refs to the clone's names and keeping the clone's is_test/egress-orphan wiring:
1. `disallowed-entity-gate` — promo "Ambiguous result" blanket guard REMOVED; require_specific machinery intact.
2. `not-found-error-message` — compatible_entities itemize; `_dispByUuid` incl `type_name` before `description`; `_resolvedToks` filter (fallback tokens not listed as not-found); header "Here's what you want:".
3. `escalate-catalog` — `case 'not_found'` falls back to `annotate-incoming-picker` when `not-found-error-message` didn't execute (`.isExecuted`).
4. NEW nodes on the fail branch: `If-incoming-picker` (IF require_specific===true AND gate_debug.domain==='incoming') → `probe-incoming` → `annotate-incoming-picker` → build-suggest-offer; false → not-found. See live wiring.
   - **probe-incoming on the CLONE must call the clone's get-results (is_test-guarded) fork**, tool literal `crm_incoming_stock_list`, entities = clone gate's compatible_entities. crm_incoming_stock_list is a READ (allowed), but use the clone's fork for consistency + guarantee no accidental egress path.

## Orchestrator wiring
- Point the capture orchestrator (`MGm32814G7XcGSD2`) + replay orchestrator (`aROEBlQyyoQaB7a1`) conversation source at `v_turns_r0704` (fork the orchestrators or parameterize the source query). Select all 24 contacts, min_turns=1, ordered by turn_index.
- Per-contact session reset at turn_index=1 from `seed_session_vars` in `respond_contacts_test`. SEED the 24 r0704 contacts into `respond_contacts_test` first (empty/default session) if absent.

## Safety gate (§0) — assert on EVERY run
- After each turn: `test:egress:{run}` list has 0 real send/write (only guard no-op records allowed).
- No write to prod `respond_contacts.session_vars`, no conversation-variables PUT, no respond.io send/assign.
- If any egress attempted → STOP, report, do not continue.

## Deliverable
Per-turn table: contact · turn · user_message · baseline_reply · new_reply · branch · diff_class
(intended-fix | regression | no-change) + a rollup of regressions. Write to tests/runs/replay-r0704/.
