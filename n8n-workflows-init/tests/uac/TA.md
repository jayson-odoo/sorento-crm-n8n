# TA — tier-only access ask (access-tier-ask-plan.md)

§0 (`00-SAFETY-always-read.md`) applies to every case. Drive the FORK `RnpxEnAV3g20MmKj` via the
uac runner with `previous_conversation_state: {}` unless a case says otherwise (uac mode otherwise
reads 437264483's stale prod session). Assert at the CUSTOMER BOUNDARY (rendered reply + sendmsg
payload/attachments), per-node runData never execution status.

Fixture entitlement (real, execs 12031183/12024557/12020037): the dev contact holds all 7 compound
levels → tiers {dealer, office, end_user} — the ask-fires population by default.

| id | arrange | act | assert |
|---|---|---|---|
| TA-1 ask fires | multi-tier contact, no tier word | "promo for SRTBF11710" | reply is the 3-option numbered tier ask (Office/Dealer/End user), NO quick-reply buttons, NO files; state: selection_context `tier_offer`, roster = 3 tiers; original product scope carried in state |
| TA-2 pick answers with files | after TA-1 | "2" | answer for SRTBF11710 at the picked tier ONLY; attachments non-empty and = the answer rows (always-attach, D5); no roster gate; no re-ask |
| TA-3 multi-pick | after TA-1 | "1 and 2" | answer spans office+dealer files together; attachments = union |
| TA-4 "all" | after TA-1 | "all" | all 3 tiers; attachments = full set for the product |
| TA-5 stated tier skips ask | fresh state | "promo for SRTBF11710 dealer" | straight to dealer answer + files; no ask turn; `access_levels`/tier signal = dealer only |
| TA-6 single-tier silent | inject entitlement ["End User"] (sim-inject or fixture) | "promo for SRTBF11710" | no ask; end-user answer + files |
| TA-7 non-persistence (D4) | complete TA-2, then | "promo for CBS212-WH" | ask fires AGAIN (tier not carried); prior pick absent from state |
| TA-8 continuation ≠ new query | after TA-2 (2 dealer promos answered) | "the august one" / "1" | continuation resolves against the ANSWER, no re-ask |
| TA-9 unheld tier | inject entitlement ["End User"] | "office promo for SRTBF11710" | Q23-style notice ("don't have access to office") + answer at real entitlement; NOT a bare not-found |
| TA-10 brand×tier | fresh state | "cabana promo for CBS212-WH dealer" | recomposed filter = ["Cabana Dealer"] on the get-results input; answer + files |
| TA-11 brand gate fail-closed | inject entitlement ["Sorento Dealer","End User"] | "cabana dealer promo for CBS212-WH" | brand_gate_empty path: notice, NO Sorento-dealer files served for a cabana ask (probe R5 class) |
| TA-12 ask abandoned by new query | after TA-1 | "check stock srtwc286" | tier_offer context dies; stock answers normally; no tier leakage into inventory |
| TA-13 ask + casual | after TA-1 | "thank you" | no reprompt loop; casual handled; tier_offer cleared or inert (mirror casual-aborts-member-reprompt behaviour) |
| TA-14 roster collision | member_offer or suggest_offer pending (arrange via prior turn) | numbered reply | number resolves against the CORRECT roster per context precedence; tier_offer never shadows member/suggest |
| TA-15 non-promo never asks | fresh state | "check stock srtwc286" then "eta for SRTWC286-SH" | no tier ask on any non-promotion domain |

Safety gates per §0 as always: zero egress (`test:egress:{run_id}`), sink-delta with payload
attribution, per-node runData. S9: every new assertion shown red once (offline mutate.sh covers the
mapper; the UAC runner cases go red by running them against the PRE-change fork rev).
