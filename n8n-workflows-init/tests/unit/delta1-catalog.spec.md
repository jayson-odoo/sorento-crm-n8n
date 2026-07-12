# Δ1 catalog refactor — characterization contract

Pure refactor: replace 7 escalate `Edit Fields` (each setting `escalate_message`) +
the 7-arm `isExecuted` ladder in `compile-current-state` with:
- 7 tiny `branch_kind` tag-setters (uniform),
- one `escalate-catalog` Code node (branch_kind → message + flags),
- a 2-way read in `compile-current-state` (catalog vs central-exchange).

**No-regression contract:** for every branch, the catalog must emit the SAME
`{response, manualResponse, includeResponse}` the old ladder did. The compile-tail
(userResponse capture, business_query summary, reconcileEntities, output assembly) is
UNCHANGED, so identical ladder outputs ⇒ identical compile outputs. `is_escalate_offer`
is a NEW additive field (consumed only in Δ3); asserted separately, must not perturb Δ1.

| branch_kind | feeder | response | manualResponse | includeResponse | is_escalate_offer |
|---|---|---|---|---|---|
| not_found | not-found-error-message | upstream `escalate_message` | `!require_specific` | true | `!is_clarification` |
| access_choice | access-level-choice-message | upstream `escalate_message` | true | true | false |
| demand_qty | If8 | "Please specify your demand quantity" | true | true | false |
| not_supported | not-supported-domain | "Sorry, we don't support direct goods receive & SPO…" | true | true | false |
| clarify_menu | If1 | "I see you're ${user_goal}, Let me understand more.\n\n…menu…" | true | true | false |
| escalate_offer | If10 | "I am sorry the provided answer does not meet your requirements. Would you like me to escalate to ${suggested_team} team?" | true | true | true |
| out_of_scope | If2 | "Informed the user that request is out of scope and will proceed to escalate to the ${suggested_team} team" | true | **false** | false |
| (happy) | central-exchange | central-exchange.response | false | true | n/a (catalog not run) |

Executable check: `node delta1-catalog.test.js` — implements old ladder + new catalog,
runs both, asserts deep-equality of the three flags for every branch + the additive
`is_escalate_offer`. Exit 0 = green.
