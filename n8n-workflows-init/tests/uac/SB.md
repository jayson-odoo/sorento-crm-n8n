# SB — shape B: require predicate + honest rendering (spec-search-shapeB-predicate-plan.md)

§0 applies to every case. ⛔ GATED: probes need the CRM `require` contract DEPLOYED (built at CRM
commit `5ded454b8`, not merged/deployed); clone cases additionally wait for the SA family to land
on the clone. `previous_conversation_state: {}` on every case (uac-mode prod-session landmine).
Assert at the CUSTOMER BOUNDARY, per-node runData, never execution status.

## Contract probes (offline, live CRM read-only, post-deploy)

| id | body | expect |
|---|---|---|
| SB-P1 | free_terms `["wall hung basin"]` + `require:{certificate:true}` | every match certified; `predicate.qualifying_total` ≥ matches; `truncated` correct; counting unit = variant families (spot-check: no two matches same family) |
| SB-P2 | same, `require:{attachment_type:"technical drawing"}` (label, not code) | label resolved server-side; echo carries as-resolved form |
| SB-P3 | `require:{attachment_type:"blorptype"}` | `qualifying_total: 0`, label in `unrecognized_terms`, NOT an empty-none |
| SB-P4 | free_terms `["flurbish"]` + `require:{stock:true}` — PINNED cross-side, same word as CRM `test_unrecognized_terms_reach_the_wire` / `test_unrecognized_terms_do_not_silently_mean_none` | `unrecognized_terms == ["flurbish"]`, `qualifying_total: 0`, candidates [] — NEVER a whole-catalogue answer |
| SB-P4b | free_terms `["wall hung"]` (registry mounting VALUE — recognized but not a class; CRM `test_filter_specs_drops_known_spec_words_without_flagging_them`) + require | dropped from membership WITHOUT appearing in `unrecognized_terms` — three-verdict vocabulary: class / recognized-boost-only / unrecognized |
| SB-P5 | require-only, NO free_terms (`"what products have certs"`) | deterministic code-ordered shortlist, score 0.0, stable across two runs (ORDER BY tiebreak) |
| SB-P6 | no `require` at all | response byte-identical to pre-deploy fixture (inertness re-proof after CRM deploy — SA-P2's twin) |
| SB-P7 | `require:{certificate:{scheme:"SPAN", validity_state:"valid"}}` | object form narrows; expired-cert product absent |
| SB-P8 | unknown key `require:{warranty:true}` | 422 UNKNOWN_REQUIRE_KEY — pins the guard n8n must never trip |

`mutate.sh` S9: (m1) drop require → SB-P1 red; (m2) point SB-P6 comparison at a doctored fixture →
red; (m3) break the family-dedup spot-check → red.

## Parser probes (offline, fork node body, no network)

| id | in (parser output fixture, real execution-derived) | expect `require` |
|---|---|---|
| SB-R1 | domain product_attachment, entity hint attachment_type "SIRIM cert", descriptive entity, no code | `{certificate: true}` (or `{attachment_type:"SIRIM cert"}` per plan §4.1 decision) |
| SB-R2 | domain promotion, descriptive-only ("any promo for kitchen sinks") | `{promotion: true}` |
| SB-R3 | domain inventory, descriptive-only ("which faucets have stock") | `{stock: true}` |
| SB-R4 | ANY code-shaped entity present ("SRTWC286 got cert?") | NO require — forward path |
| SB-R5 | casual/escalation/other domains | NO require |
| SB-R6 | every emitted key ∈ the 4 allowed | never a 5th key (the 422 guard, asserted at the source) |

## Clone cases (uac mode, post-SA, post-deploy)

| id | act | assert at the boundary |
|---|---|---|
| SB-1 | "what wall hung basins have certs?" | reply carries the deterministic count suffix ("N … showing K"); every named code is from the predicate matches; get-results input uuids ⊆ predicate matches |
| SB-2 | "any promo for kitchen sinks" | promo answer over qualifying products only; count suffix; no `cabana`-style substring pollution (the old broken promo-description path must NOT fire — `require` supersedes) |
| SB-3 | "which faucets have stock" | stock answer, count suffix; no unscoped claims |
| SB-4 | "got flurbish document for basins?" (pinned word) | CLARIFY naming the term — never "none" (unrecognized ≠ empty) |
| SB-4b | "wall hung basins with certs" | NO clarify — "wall hung" is recognized-boost-only, absent from `unrecognized_terms`; the renderer must clarify ONLY on unrecognized, never on a dropped-but-known spec word |
| SB-5 | genuine none (pick a class×predicate measured empty in SB-P probes) | the catalogue-wide "none" wording — the ONLY unscoped negative allowed, because it is true |
| SB-6 | "SRTWC286 got cert?" | forward path untouched: code resolves, attachment answer, NO require in resolve-entity runData input |
| SB-7 | follow-up after SB-1: "the black one" | continuity over `last_result_set` — pick resolves against the SHOWN 15 |
| SB-8 | SA-2 rerun ("check stock SRTWC286") | still parity with its baseline — SB layers must not have moved the code path |

RED-first: SB-1/2/3 inputs recorded on the pre-SB rev (they dead-end or answer wrong-set today).
Egress: zero, sink-delta with payload attribution.
