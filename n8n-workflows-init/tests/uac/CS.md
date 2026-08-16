# §CS — container status (n8n side)

Read with `00-SAFETY-always-read.md`. Build: clone `a3269e1f`, parser FORK `3f52b411`,
CS-BUILD get-results `4070c23c`. Node-diff: `tests/diffs/container-status-node-diff.md`.

## §0 assertion for this bundle (run 2026-08-09)

| gate | verdict | evidence |
|---|---|---|
| **S1** no real send | PASS | 5 egress nodes orphaned (0 inbound) in the clone JSON: `send-message-files/images/video`, `update-human-intervened`, `save-session-vars`. None appears in any run's node list. `guard-g-record` recorded `would_send`. |
| **S2** no assignment/SLA write | PASS | `Call 'sub-human-intervention'` never executed in any run. |
| **S3** no CRM/contact write | PASS | `save-session-vars` never executed; `guard-d-record` fired `would_write`. Session writes bind `n8n_test-db`. |
| **S4** no MCP write tool | PASS (partial) | Reads only; `ideate-turn-http` (the one reachable CRM write) never ran. ⚠️ the resolved `tool` name is not captured in the run artifacts, so "∈ read allowlist" is inferred from answer shape, not read off the payload. |
| **S5** `test_mode` present | PASS (partial) | `is_test=true` is static on all 8 sub calls. ⚠️ `When Executed by Another Workflow.json.test_mode` is not recorded per-run. |
| **S6** token sinks bounded | PASS | parser + get-results tiers only. |
| **S7a** TEST-sink delta positive | PASS | `tWm5DYLxfypmVC1T` (`sub-respond-save-message-redis TEST`) — 50 executions, all `success`, window 04:37–12:22. Every harness save landed on the unconsumed `sorento-respond-message-TEST`. |
| **S7b** prod-sink delta zero | PASS **for the final window only** | Depth series off `Srs08P0Ha3Cv--YPx0-Yn`.`Redis1` (`{"sorento-respond-message": N}`): **100 samples @5s, 12:17:00–12:25:15 UTC, min 0 max 0, zero non-zero samples.** |

### ⚠️ S7b has a retention horizon — worth adding to §0 itself

The prod consumer polls every 5 s and n8n retains ~100 of its executions, so the depth series only
reaches back **≈8 minutes**. Runs older than that cannot be assessed retrospectively: the samples have
aged out. S7b is therefore only usable if snapshotted **during or immediately after** the run.

Consequence here: S7b is asserted for the final regression pass (r01–r16). The earlier 22 exploratory
runs are covered by S7a + static containment only. Stated rather than papered over.

### Instrument note

`Redis1` keys its output by the **list name** (`{"sorento-respond-message": 0}`), not by a `len`/`count`
field. A scan looking for a key named like a length finds nothing and reads as "instrument unavailable".

## Cases (all against real CRM reads, `mode:uac`, `previous_conversation_state:{}`)

| # | message | expect |
|---|---|---|
| r01 | when is SRTSH1040 arriving | `incoming`, `["estimated_arrival_date"]`, identity + ETA only |
| r02 | has SRTSH1040 cleared CIDB and when can I collect it | 4 keys: inspection, approval, gatepass, collection |
| r03 | who is the forwarder for SRTSH1040 | both china + malaysia forwarder |
| r05 | SRTWC193 got stock? | stock domain untouched — no keys projected, no notes |
| r12 | srtwc8317-rl1 cert | product_attachment did-you-mean intact, `- has certificate` annotations intact |
| r13 | SRTWC19301 got stock? | stock did-you-mean intact, `- has/no stock details` intact |
| — | what's the container status of SRTWCY8605 | `incoming` + `["__all__"]`, every recorded checkpoint, facts-then-dates-ascending, NO absence/denial lines |
| — | send me container status report/list/softcopy | `resource_attachment`, returns the xlsx, no did-you-mean underneath |
| — | what's the gatepass date for srtwc286-sh-new | per-ROW `*Gatepass:* not recorded yet` on every row |
| — | what's the eta delay for srtwc286-sh-new (grant revoked) | ONE global `I can't share the …`, value absent from the row |

## Not covered — state plainly, do not let a green imply otherwise

- **`crossdomain-render` (S0) has offline evidence only.** It never executed in any of the ~30 live runs:
  the stock→incoming pivot needs a product with ZERO stock rows, and four candidates all had stock.
  Risk is bounded — the change alters sort ORDER only, never content; worst case is today's behaviour.
  **Post-promote verification item.**
- **`field_access.denied`** was proven once end-to-end against a genuinely revoked grant, then the user
  restored the grant. Offline coverage remains; not re-runnable.
- **T3** (`proj-test.js`, sentinel alone) cannot falsify the `!_isTimeline` guard; **T3b** (mixed
  `['__all__', <denied key>]`) is the case that can, and does. An earlier version of this bundle
  concluded the guard was redundant because the mutant only ever saw the sentinel-alone shape.

## Known under-delivery: mixed-array emission

`_isTimeline` is `.some(k === '__all__')` — *contains* the sentinel, not *is* it alone. The parser is
instructed to emit the sentinel by itself, but that is an instruction, not an invariant. Under a mixed
emission such as `['__all__', 'gatepass_date']`:

- the denial line is suppressed (correct — and the guard is what does it), and
- the **explicitly named key loses its per-row `not recorded yet`**, which slightly under-delivers
  R6's "naming a field turns both messages back on".

Harmless in practice — timeline mode already renders every recorded checkpoint, so nothing is hidden —
but stated here rather than left latent.
