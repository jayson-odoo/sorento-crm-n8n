# Sim (newfeatures) results — golden_run 10, real parser+reads+session, in v_replies

Driven by sorento-sim-orchestrator (fF25M2AGjlqYtDF3) over 19 synthetic conversations under real
access contacts (437264483 full, 430229069 general). Inline LLM judge (claude-sim-judge) -> turn_review.
Query: select * from v_replies where golden_run_id=10 order by 1,2;

Final: 25 pass (avg conf 93), 1 warn (60). 0 fail.

## Confirmed (real LLM end-to-end)
- Δ2 routing all domains: purchasing_product, purchasing_certification, marketing_product, marketing_form,
  purchasing(incoming), warehouse, customer_service(order). marketing_promotion_sorento (after brand clamp).
- Δ3 CS flow: offer fires from real "escalate my order"; picks resolve — "1"/"first"/"the 2nd" -> targeted
  preferred_assignee_id; "yes" -> round-robin; "no" -> decline; new question -> abandon+reroute;
  "2nd and 3rd"(multi) and "5"(out-of-range) -> re-offer the list (reprompt).

## Sim-caught issues -> FIXED (re-verified)
- FAIL bare "1" not resolved -> fixed: deterministic position extractor in output_exchange member-block.
- WARN multi-select routed to first -> fixed: multi -> correction=true re-offers list.
- WARN out-of-range generic reply -> fixed: OOR -> correction=true re-offers list.
- WARN malformed promo team 'marketing_promotion_brand zqzq' -> fixed: brand clamped to valid enum.
- WARN demand-qty: NOT a defect — contact 437264483 has is_allowed_stock=true so it correctly hits the
  inventory needs-scope path, not the demand_qty branch. (Test-setup nuance.)

Offline contract kept in sync: tests/unit/delta3-member-flow.test.js (v2) GREEN.
