let query_reformulator = $('Call \'sub-query-reformulator\'').first().json
let resolved_entities = $('resolve-entity-clarification').first().json.resolutions
let session_vars = $('get-session-vars').first().json.session_vars
let message_type = query_reformulator.output.message_type
let intent_hint = query_reformulator.output.intent_hint
let domain_hint = query_reformulator.output.domain_hint
let entities = resolved_entities.flatMap(res =>
  res.matches?.map(m => ({
    entity_type: m.entity_type,
    canonical_code: m.canonical_code,
  })) || []
)
let input_msg = $('tf-message').first().json.message.message.text || $('tf-message').first().json.message.message.attachment.description
let user_goal = query_reformulator.output.user_goal || input_msg
if (message_type == "casual" || message_type == "unknown") {
  session_vars = {}
}
return {
  "message_type": message_type,
  "intent_hint": intent_hint,
  "domain_hint": domain_hint,
  "session_vars": session_vars,
  "entities": entities,
  "user_goal": user_goal
}