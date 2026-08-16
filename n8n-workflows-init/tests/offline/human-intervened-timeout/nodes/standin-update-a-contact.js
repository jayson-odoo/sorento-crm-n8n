// REAL NODE: @respond-io/n8n-nodes-respond-io.respondio CONTACTS/UPDATE_CONTACT setting
// is_human_intervened = true. Real output observed on executions 12146305 / 12146929 / 12154913 is
// exactly `{contactId: <id>}` — reproduced here so nothing downstream can tell the difference.
const env = $('Respond.io Trigger').first().json;
const contactId = env.contact.id;
return [{ json: {
  contactId,
  _standin: {
    guard: 'update-a-contact',
    kind: 'would_write',
    blocked: true,
    target: 'respondio:contact:UPDATE_CONTACT',
    payload: { contactId, fields: { is_human_intervened: true } },
    test_run_id: env.test_run_id === undefined ? null : env.test_run_id,
  },
} }];
