# rev-4 verification — captain's "srt" transcript replayed (planner, 2026-08-18)

Clone `txiPzSxy3Pclsz6v` @ `0557b0b4`, parser fork `de9ff09d`. Both-miss MUB6201 offer state (rev-3 render, from exec
12910350) injected via `previous_conversation_state`; real parser; no chat_id (HI fork short-circuits at test-guard).

| turn | exec | parser | escalation-context | result |
|---|---|---|---|---|
| "yes please escalate to srt team" | 12913160 | casual, is_escalation_confirmation:true, company_pick:Sorento | company_pick / Sorento | HI called (guarded), no clarify |
| "srt" | 12913172 | same | company_pick / Sorento | HI called, no clarify |
| "please escalate to sorento team" | 12913185 | request_for_help, company_pick:Sorento | company_pick / Sorento | HI called, no clarify |
| "hmm what" | 12913195 | casual, member_reprompt:out_of_range, offer_hold:true | (not run) | offer-hold lane: clarify text sent, HI not called, state RE-PERSISTED (selection_context member_offer, 9 rows, plan 2) |

Pre-rev-4 (captain's console, execs 12910551/575/616/642) the same replies re-clarified forever and the offer state was
lost after "srt". Egress on all four: only would_log/would_write/would_send guard records.

## rev-5 verification (F5 short-path guard) — planner, parser fork `c7d9cfa2`, clone `0557b0b4`

Same both-miss MUB6201 offer state injected, real parser:

| reply | exec | parser | outcome |
|---|---|---|---|
| "mocha promotions" | 12914974 | business_query / promotion, no pick | answered as a promotion query (no HI, no hold) — on rev-4 this became company_pick Mocha |
| "show sorento orders" | 12914987 | business_query / order, no pick | order lookup ran (get-results), no HI |
| "srt" | 12915006 | company_pick Sorento | HI (guarded) — single-token pick unaffected |
| "yes mocha" | 12915016 | company_pick Mocha | HI (guarded) — evidenced pick unaffected |
Egress: guard records only on all four.
