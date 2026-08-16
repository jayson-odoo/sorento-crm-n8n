// ─── S8 STAND-IN for the credentialed respondio node `Assign or unassign a Conversation1` ───
// Real node: the respond.io community node, resource CONVERSATIONS,
// assignmentType userId, credential `sorento-api` — a REAL assignment write with a
// staff email/WhatsApp ripple. Replaced by a Code node of the SAME NAME.
//
// The two expressions the real node evaluates are transplanted verbatim and emitted
// as `would_assign_*` so the tester can assert WHAT would have been assigned:
//   contactId       = {{ $('When Executed by Another Workflow').first().json.contact_id }}
//   assigneeUserId  = {{ $json.assignee_respond_user_id }}

const passthrough = $input.item.json;

return {
  json: {
    ...passthrough,
    _stand_in: 'assign',
    would_assign_contact: $('When Executed by Another Workflow').first().json.contact_id,
    would_assign_user: $json.assignee_respond_user_id
  }
};
