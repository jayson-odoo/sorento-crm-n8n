// ─── S8 STAND-IN for the executeWorkflow node `Call 'sub-add-comment-respond'` ───
// Real node calls sub `2l8egTLJbyGOPvG-DbtDX` (`sub-add-comment-respond`), which is an
// UNGUARDED LIVE sub — it posts a real respond.io comment on a real conversation, with a
// staff-notification ripple. `test_workflow` does NOT pin executeWorkflow nodes (they
// execute normally), so this node MUST be removed, not pinned (UAC §0 S8).
//
// Replaced by a Code node of the SAME NAME. The SLA-alert comment template is transplanted
// VERBATIM from the fork's `workflowInputs.value.comment` expression (the live/rebased form:
// DateTime.fromISO(..., { zone: 'utc' }).setZone('Asia/Kuala_Lumpur')), so the tester asserts
// the exact string the real sub would have been handed. `user_id` is read the same way the
// real node reads it: $('get-round-robin-assignee').first().json.assignee_respond_user_id.

const _rendered_comment = `Team: ${ $('When Executed by Another Workflow').item.json.team }
⏰ SLA Alert: This contact is routed to you at ${ DateTime.fromISO($('conversation-sla-tracking-create').item.json.initiated_at, { zone: 'utc' }).setZone('Asia/Kuala_Lumpur').toFormat('yyyy-MM-dd HH:mm:ss') }.
You have until ${ DateTime.fromISO($('conversation-sla-tracking-create').item.json.due_at, { zone: 'utc' }).setZone('Asia/Kuala_Lumpur').toFormat('yyyy-MM-dd HH:mm:ss') } to respond.
You have until ${ DateTime.fromISO($('conversation-sla-tracking-create').item.json.due_at_resolution, { zone: 'utc' }).setZone('Asia/Kuala_Lumpur').toFormat('yyyy-MM-dd HH:mm:ss') } to resolve.
Reference message: https://app.respond.io/space/364817/inbox/${ $('When Executed by Another Workflow').first().json.contact_id }#${ $('When Executed by Another Workflow').first().json.message_id }`;

const passthrough = $input.item.json;

return {
  json: {
    ...passthrough,
    _stand_in: 'comment',
    _rendered_comment,
    _comment_user_id: $('get-round-robin-assignee').first().json.assignee_respond_user_id,
    _comment_contact_id: $('When Executed by Another Workflow').first().json.contact_id
  }
};
