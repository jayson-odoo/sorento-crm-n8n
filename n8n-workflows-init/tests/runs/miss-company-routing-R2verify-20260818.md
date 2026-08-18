# rev-2 verification — no-roster brand carry (photo → yes), 2026-08-18

Clone `txiPzSxy3Pclsz6v` @ `d4ce02eb` (rev-2). Journey = captain's `photo for MWCX7608-SH-S10` → `yes`.

- Turn 1 (photo, real parser, exec 12907843): marketing_product/general_enquiries; gate resolved single
  company {Sorento, brand mocha}; ccs persisted routing_brand mocha / routing_company Sorento / plan null.
- Turn 2 (`yes`, exec 12908065, state injected via `previous_conversation_state` from turn 1's persisted
  variables + mock parser escalation confirmation): `escalation-context` → `{brand_code:"mocha",
  company_id:Sorento, routing_source:"prior_state"}` (pre-rev-2 this arm sent brand null — observed on
  execs 12906044/12906192); clarify gate passed through; HI fork sub-exec 12908069 chat path:
  next-assignee got brand mocha → **brand_matched:true, picked Kia Yee (mocha-tagged)** — vs Tay Zhi Yang
  (untagged pool) on the null-brand runs; marker json `{assignee_name:"Kia Yee", brand_code:"mocha",
  company_code:"SRT"}`. No assign/SLA/comment/test-guard nodes ran; egress = the 2 standard guard records.

Harness note (important for future multi-turn uac journeys): in uac mode the session READ is the real
prod CRM (`get-session-vars-http`) and the save is guarded — so consecutive uac turns do NOT see each
other's state, and the canary contact 437264483 is the captain's real WhatsApp contact whose PROD session
carries his latest LIVE-spine state. A first naive `yes` turn (exec 12907873) therefore reconciled against
his real morning multi-company state and correctly took the clarify divert. Multi-turn UAC must inject
state via `previous_conversation_state` (sim-inject-session), as the tester's M-cases do.
