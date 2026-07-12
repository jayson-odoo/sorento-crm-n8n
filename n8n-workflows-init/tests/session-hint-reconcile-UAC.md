# UAC / TDD — session-save hint reconciliation (stale cross-domain carryover fix)

**Plan:** `n8n-workflows-init/plans/session-hint-reconcile-fix.md`
**Change under test:** upgrade `reconcileEntities` in `compile-current-state` so a resolved entity's stored `hint` is rewritten to the CRM `entity_type` via a token/`via_token` match (not just canonical_code) → next turn's axis-merge evicts same-axis stale entities.
**Fix target:** clone `txiPzSxy3Pclsz6v` › `compile-current-state` (Code). Reformulator fork `CpxE8LroLzCkrAQN` UNCHANGED.
**Scope tag:** `parser` (real reformulator required — mock bypasses the observed `output_exchange` eviction; LESSON 28).
**Driver contact:** `437264483`. **Mode:** `regress-capture` (session round-trips through `respond_contacts_test`, isolated from prod).

---

## §0 SAFETY GATE (S1–S6) — binds EVERY case below
A run PASSES the gate only if `test:egress:{test_run_id}` records **would_*** entries exclusively and no real action:
- **S1** no WhatsApp/comment send to a real respond.io contact (`send-message-*` orphaned; only `would_send`).
- **S2** no assign/reassign (`Call 'sub-human-intervention'` → guarded fork `vUfFUDjLAuMaeQE6`, short-circuits on `is_test=true`).
- **S3** no SLA-tracking POST, no PIC comment.
- **S4** no prod conversation-variable / custom-field write: `save-session-vars` (prod PUT) has 0 inbound (orphaned); session writes hit `pg-upsert-session → respond_contacts_test` (n8n_test only).
- **S5** no CRM record create/mutate — reads only (resolve-entity, check-access, get-results).
- **S6** every shared-sub call carries `is_test=true`.
> Any case that cannot assert all of S1–S6 is a **hard FAIL** regardless of functional outcome.

---

## Case TDD-1 — crafted 2-turn fix-proof (PRIMARY; `parser` tier)

**Purpose:** the minimal failing test — proves the bug pre-fix, passes post-fix.

**Setup:** reset `respond_contacts_test['437264483'] → {"variables":{}}` (Postgres cred `Dnnofg8Xb27VQOhI`; host psql unavailable).

| Turn | Redis item (mode=`regress-capture`, contact `437264483`) | Trigger message |
|---|---|---|
| 1 | seed → fire `zz-canary-run` | `any incoming for SRTWCX7405-S-289UF-PJ` |
| 2 | seed → fire again (session carried) | `SRTWT165-QT has stock?` |

**Turn-1 assertions**
- Path: reformulator → resolve-entity → `disallowed-entity-gate` → get-results (reads only).
- **A1 (store):** `compile-current-state.variables.entities` entry for the SRTWCX7405 token has **`hint === "product"`** and a non-null `canonical_code`. *(PRE-fix: hint is a non-product token — the bug seed. Inspect via `get_execution` runData, LESSON 42.)*

**Turn-2 assertions**
- Expected branch: inventory/stock happy path.
- **A2 (PRIMARY):** `Call 'sub-get-results'` input `entities` **AND** turn-2 reformulator `output.entities` contain **ONLY `SRTWT165-QT`**; **SRTWCX7405 ABSENT**. *(PRE-fix: SRTWCX7405 present → bug reproduced.)*
- **A3:** turn-2 reformulator `output.entities.length === 1`.
- **A4:** turn-2 `user_response` does not contain `SRTWCX7405`.
- **Safety:** S1–S6 all asserted.

**Verdict logic:** `A2 && A1` ⇒ PASS (fix effective). SRTWCX7405 present in turn-2 query ⇒ FAIL. Running the *pre-fix* clone MUST FAIL A2 (proves the test bites).

---

## Case TDD-2 — unresolved-entity passthrough (no-regression; deterministic tier)

**Purpose:** the fix must not clobber the hint of an entity with no CRM match.

- Single turn, contact `437264483`, message: `does zzqq999 have stock?` (a token that resolves to nothing).
- **B1:** `resolve-entity` returns no match for `zzqq999`.
- **B2:** `compile-current-state.variables.entities` entry for `zzqq999` has `hint` **equal to the parser's original hint** (unchanged). `canonical_code` remains null.
- **Safety:** S1–S6 asserted.

---

## Case TDD-3 — same-turn response invariance (regression guard; unit)

**Purpose:** confirm the hint-only rewrite never alters the current turn's user-facing text.

- For each of TDD-1 turn 1, TDD-1 turn 2, and one happy `promotion` turn (e.g. `check promotion for Srtwc8504`): capture `compile-current-state.user_response` on PRE-fix and POST-fix clone.
- **C1:** `user_response` **byte-identical** pre/post. *(Grounded by design: in-node entity consumers key on `e.raw`, never `hint`/`canonical_code` — plan §2.)*

---

## Case REG-1 — sequential multi-turn replay of 5 busiest real contacts (no-regression)

**Purpose:** prove the fix changes nothing for the worse across real traffic and organically exercises carryover.

**Corpus (from `n8n_test.chat_histories`, INCOMING only, `ORDER BY sent_at, id`, EXCLUDING `437264483`):**

| # | respond_io_id | name | incoming |
|---|---|---|---|
| 1 | 445239386 | Saidatun Najida Binti Husni | 336 |
| 2 | 445239390 | Ili Mahfuzah | 225 |
| 3 | 404285551 | Jayden Loo | 125 |
| 4 | 428126355 | — | 94 |
| 5 | 423729094 | Ms ACT | 55 |

**Cap:** first **N = 40** incoming turns per contact (200/pass; 400 across pre+post). Planner-recommended; raise per-contact only if diffs cluster at the cap.

**Procedure**
1. For each contact: reset `respond_contacts_test['437264483'] → {"variables":{}}`.
2. Feed that contact's first 40 incoming messages one at a time, in order, each a redis item under driver `437264483`, mode `regress-capture`. Record per-turn `user_response` + get-results `entities`.
3. Do the whole thing on **pre-fix** clone, then apply fix, then on **post-fix** clone (identical order).
4. Diff per turn; **classify every non-identical turn:**
   - **(a) fix-improvement** — stale cross-domain entity now absent / spurious code dropped. OK.
   - **(b) REGRESSION** — legitimate same-domain carryover lost, or a good answer now wrong/empty. NOT OK.

**Pass criterion:** **zero (b).** Most turns byte-identical; a few (a) allowed. Every (b) is a blocking finding for the reviewer.
**Safety:** S1–S6 asserted on every turn (egress log per turn; between-contact resets only, never mid-conversation — LESSON 30/31 contention rules).

---

## Acceptance summary
| Case | Tier | Blocks release on |
|---|---|---|
| TDD-1 | parser | A2 fails post-fix (fix ineffective) OR A2 passes pre-fix (test doesn't bite) |
| TDD-2 | deterministic | B2 fails (unresolved hint clobbered) |
| TDD-3 | unit | C1 fails (same-turn text drifted) |
| REG-1 | parser | any (b) regression across the 5 sequences |
| §0 gate | all | any S1–S6 violation on any run |

**Release = all of the above green + reviewer sign-off. Promotion to live `9qVyfUxmRQqrpGRMDLRuz` is a separate user-gated step (backup + sha-gated publish, LESSONS 24/25).**
