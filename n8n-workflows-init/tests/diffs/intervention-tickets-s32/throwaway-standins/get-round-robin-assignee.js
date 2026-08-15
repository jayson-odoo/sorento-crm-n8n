// ─── S8 STAND-IN for the credentialed httpRequest `get-round-robin-assignee` ───
// Real node: POST https://fe-sorento.foundryx.my/api/v1/external/next-assignee
// (credential `crm-n8n-auth`). Replaced by a Code node of the SAME NAME so every
// downstream `$('get-round-robin-assignee')` read still resolves, with no
// credentialed node anywhere in the graph (UAC §0 S8).
//
// Case control rides on the TRIGGER envelope, not on a guard flag:
//   _case_already_assigned : boolean — drives `is_already_assigned`, i.e. which
//                            branch of `if-conversation-unassigned` is taken.
// Missing/non-boolean => THROW. A silent default would make case (b) run as
// case (a) and report green (LESSONS §61: no assertion that cannot fail).

const trig = $('When Executed by Another Workflow').first().json;
const already = trig._case_already_assigned;

if (typeof already !== 'boolean') {
  throw new Error(
    "[stand-in get-round-robin-assignee] trigger json._case_already_assigned must be a boolean (true|false); got " +
    JSON.stringify(already)
  );
}

return {
  json: {
    assignee_id: 'USR-0042',
    assignee_respond_user_id: 123456,
    policy_id: 'POL-1',
    is_already_assigned: already,
    is_working_hours: true,
    conversation_assignee_id: null,
    conversation_assignee_name: null,
    tier_response_hours: 1,
    tier_resolution_hours: 24
  }
};
