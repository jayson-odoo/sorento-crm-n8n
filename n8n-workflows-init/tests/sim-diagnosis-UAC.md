# SIM diagnosis + regression UAC

Purpose: validate root-cause of the 10 issues on a **fresh clone of the current live spine** (`9qVyfUxmRQqrpGRMDLRuz` → `sorento-consume-main SIM`), 0-egress (uac). No logic fixes — capture CURRENT behavior. Each turn logs: reformulator (`entities[] / domain_hint / intent_hint / message_type / routing`) · resolve-entity · disallowed-entity-gate (`gate_passed / gate_reason / compatible_entities[]`) · If-branch · get-results (MCP params + raw incl `alternatives[]`) · not-found-error-message.

Clone gets a **prev-state / replyTo injector**: each test item carries `previous_conversation_state`, `referenced_result_set`, `replyTo` so multi-turn is deterministic (no prod session, no writes).

Legend: **R** = repro (bug should reproduce) · **G** = regression (must still work) · **N** = negative (must NOT fire the bug / boundary).

---

## #1 — casual-clear entity carryover
| tag | message(s) | expect (current / after-fix) |
|---|---|---|
| R | T1 `Check new style lighting order srt104 GY delivery` → didyoumean → T2 pick customer `NEW STYLE LIGHTING (M) SDN BHD` | current: `srt104 GY` dropped. after-fix: retained |
| G | T1 product query w/ entities → T2 `hi` | genuine casual → entities cleared (stickiness guard stays) |
| G | normal single-entity didyoumean pick | resolves pick fine |
| N | offer pending → T2 genuine `hi` (mid-offer) | MUST still clear (not retain) — the boundary you flagged |

## #2A — attachment_type / product parse
| tag | message | expect |
|---|---|---|
| R | `Send me all Sorento WC certificate` | attachment_type=certificate AND product `Sorento WC` both parsed |
| G | `Send me SRTKT1934SS certificate` | clean single product + cert → resolves |
| G | `photo for SRTWC8383` | attachment_type=photo |
| N | `Send me Sorento WC` (no attachment word) | legitimately ask attachment type — do NOT inject certificate |

## #2B / #2C — roster carry on clarification + literal resolve
| tag | message(s) | expect |
|---|---|---|
| R | T1 `Send me all Sorento WC certificate` → T2 `Certificate` (inject T1 roster) | T1 roster retained + cert filter applied (not re-searched) |
| R2C | T3 `Sorento wall hung WC certificate` | resolve behavior for descriptor variant (0 vs family) |
| G | T1 asks type → T2 valid attachment word | applies to roster |
| N | T1 roster → T2 NEW query `SRTBF11705 photo` | fresh query — must NOT reuse old roster |

## #3 — truthful not-found messages
| tag | message(s) | expect |
|---|---|---|
| R | `Srtpcat126 have eta` (resolves, no incoming) | msg names resolved code ("found SRTPCAT126 but no incoming") |
| R | `Srt79ss GM ETA` | same |
| Rpick | T1 `Srtkt1934ss certificate` → T2 `1` (inject 2-cand roster) | msg names picked code, not bare "a Certification" |
| G | `check eta ZZZ999XX` (truly unknown) | "couldn't find product ZZZ999XX" (not-found stays honest) |
| G | resolved-with-data query | returns data normally, no not-found |
| Nmulti | `eta SRT79-SS-GM and ZZZ999XX` | itemize: found SRT79-SS-GM vs not-found ZZZ999XX |

## #4 — dealer/delivery ambiguity → clarify
| tag | message(s) | expect |
|---|---|---|
| R | T1 `Send me William dealer only delivery 7/7/2026` → T2 pick `order` (inject clarify state) | T1: detect BOTH promotion(dealer) + order(delivery) → clarify quick-reply. **T2: on pick, RETAIN prior entities** (customer William + date_filter 7/7/2026 + access_level dealer) into chosen domain — do NOT re-parse/drop |
| G | `delivery for William 7/7/2026` | order directly (no clarify) |
| G | `send me dealer flyer` | promotion directly (no clarify) |
| N | `order status 202607-0227` | clear order — no clarify |

## #5 — silent customer-drop → wrong scope
| tag | message | expect |
|---|---|---|
| R | `Delxue ceramic delivery 7/7/2026` (typo — the ACTUAL leak seen) | current: SKY PURE leak (date-only dump). after-fix: surface unresolved customer, no date-only dump |
| R2 | `Deluxe ceramic delivery 7/7/2026` (corrected spelling) | same class — customer unresolved → no wrong-scope dump |
| G | `YOO LIVING delivery 7/7/2026` (valid customer) | returns YOO LIVING orders correctly |
| N | `delivery 7/7/2026` (no customer at all) | ask for scope — MUST NOT dump all customers |

## #6 — prefetch data-availability in picker
| tag | message(s) | expect |
|---|---|---|
| R | `Srtub905 ETA` → picker → T2 `1` (inject roster) | current: pick dead-ends (no incoming). after-fix: annotated / pre-checked |
| G | `SRTUB905-BI ETA` (unambiguous, has incoming) | returns data directly |
| G | picker where a candidate HAS data | annotate "(has incoming)" |
| N | picker where ALL candidates empty | list all + "none have incoming" + alternatives — MUST NOT silently skip pick |

## #7 — ambiguity handling (not variant spelling)
| tag | message | expect |
|---|---|---|
| R | `check promotion srt79ss` | current: miss. after-fix: tiebreak resolves like dashed |
| G | `check promotion srt79-ss` | resolves (hit) |
| G | `check stock srt86cr` | resolves (hit) — consistency |
| N | `check promotion zzz999xx` (real non-existent) | genuine not-found — do NOT false-pick a candidate. Message must say **"zzz999xx not found in the system"** — product-NOT-found must be distinguishable from product-found-but-no-promo-data (ties to #3 truthful distinction) |

## #8 — sibling alternatives on miss
| tag | message | expect |
|---|---|---|
| R | `check eta SRTBF11705` (base, no incoming) | get-results raw `alternatives[]` contains SRTBF11705-NEW (literal proof) |
| G | `check eta SRTBF11705-NEW` | has data; no alternatives block |
| G | any code with incoming | returns data, alternatives absent |
| N | code with no siblings AND no data | plain not-found — no fake alternatives |

## #9 — gratitude/closing regression
| tag | message(s) | expect |
|---|---|---|
| R | T1 `may know delivery for cust yoo living for today` → T2 `okay thankyou` (inject order prev-state) | current: order guard error. after-fix: casual |
| R2 | T1 `Hi, can send me agreement` → T2 `thank you` (inject forms prev-state) | current: re-lists forms. after-fix: casual |
| G | product query → `and its ETA?` | legit continuation stays business (stickiness intact) |
| G | escalation offer → `yes` | escalation (not casual) |
| N | `thanks, can you also check SRT79-SS-GM stock` | gratitude + real request → business (NOT casual) — boundary |

## #10 — reply-to → escalation team
| tag | message(s) | expect |
|---|---|---|
| R | T1 `check eta SRTWT7448` → T2 `Nobody reply me` (inject replyTo=incoming-offer) | does LLM derive incoming→purchasing? (decides prompt vs downstream fix) |
| G | order-miss → `Nobody reply me` reply-to | customer_service team |
| G | direct `I want to talk to a human` (no context) | default team, no crash |
| N | reply-to on a non-escalation delivered-answer | must not force wrong team |

---

## Run mechanics
1. Fork current live spine → `sorento-consume-main SIM`; strip egress (orphan send/assign/session-write; subs `is_test=true`); add prev-state/replyTo injector reading from the test item.
2. Seed each case's item(s) → drive clone → `get_execution(includeData)` → capture the node fields above → write per-case rows to `tests/runs/sim-diagnosis/`.
3. Assert egress log `test:egress:{id}` = 0 real sends/writes (safety gate §0).
4. Produce a per-issue evidence table (repro confirmed? regression pass? negative pass?).
