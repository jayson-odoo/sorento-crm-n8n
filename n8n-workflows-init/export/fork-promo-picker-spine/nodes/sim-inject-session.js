const item = $('redis-pop-main-message-list').first().json.message;
return [{ json: { session_vars: {
  variables: item.previous_conversation_state ?? {},
  referenced_result_set: item.referenced_result_set ?? []
} } }];
