// ─── S8 STAND-IN for the credentialed httpRequest `conversation-sla-tracking-create` ───
// Real node: POST https://fe-sorento.foundryx.my/api/v1/sla-management/conversation-sla-tracking/integration
// (credential `crm-n8n-auth`) — a REAL CRM write. Replaced by a Code node of the SAME NAME
// so every downstream `$('conversation-sla-tracking-create')` read still resolves.
//
// It does BOTH halves of the test double:
//  (i)  RENDERS the exact request body the real HTTP node would have sent. The jsonBody
//       template below is transplanted VERBATIM from the fork's httpRequest node — same
//       $() reads, same JSON.stringify calls, same quoting (message_id unquoted numeric,
//       source_message_id quoted string). It is rendered as a STRING and then JSON.parse'd,
//       so an unescapable value fails here exactly as it would have corrupted the real
//       request — a hand-built object literal would have silently papered over that.
//       HARDENING 2026-08-12: contact_phone_number / agent_code / team_set_code are now
//       emitted via JSON.stringify(x ?? '') with the template's surrounding quote chars
//       REMOVED (stringify supplies them), so a `"`, `\` or newline in any of the three no
//       longer malforms the body. `assigned_to_id` is deliberately left raw-interpolated
//       between quote chars — byte-for-byte with the fork — so a `"` there is still a
//       render failure, which is what keeps this instrument able to go red.
//  (ii) RETURNS the verbatim dev-backend fixture selected by the trigger's `_case_fixture`.
//
// `_rendered_body` / `_rendered_body_raw` / `_rendered_url` are merged ALONGSIDE the
// fixture keys, so downstream reads of in_working_hours / initiated_at / due_at /
// due_at_resolution / assigned_to are unaffected.

// ── verbatim from tests/diffs/intervention-tickets-s32/create-response-fixtures.json ──
const FIXTURES = {
  "fresh_insert_in_hours": {
    "status": "success",
    "message": "SLA tracking created successfully.",
    "tracking_id": "1926bae0-ed33-40c9-b324-96bde109d06e",
    "is_update": false,
    "already_active": false,
    "in_working_hours": true,
    "initiated_at": "2026-08-12T13:58:54.229717",
    "due_at": "2026-08-12T14:58:54.229717",
    "due_at_resolution": "2026-08-12T14:58:54.229717",
    "assigned_to": "1096809",
    "assigned_to_id": "4f684bc8-e0c0-42e5-af06-efaa4346116c"
  },
  "retry_already_active": {
    "status": "success",
    "message": "Active SLA tracking already exists for this contact; returned existing tracking.",
    "tracking_id": "1926bae0-ed33-40c9-b324-96bde109d06e",
    "is_update": true,
    "already_active": true,
    "in_working_hours": true,
    "initiated_at": "2026-08-12T13:58:54.229717",
    "due_at": "2026-08-12T14:58:54.229717",
    "due_at_resolution": "2026-08-12T14:58:54.229717",
    "assigned_to": "1096809",
    "assigned_to_id": "4f684bc8-e0c0-42e5-af06-efaa4346116c"
  },
  "fresh_insert_out_of_hours": {
    "status": "success",
    "message": "SLA tracking created successfully.",
    "tracking_id": "33ae44ea-4286-471a-8dc7-5caa76b3cdb1",
    "is_update": false,
    "already_active": false,
    "in_working_hours": false,
    "initiated_at": "2026-08-12T13:59:53.939402",
    "due_at": "2026-08-13T00:59:53.939402",
    "due_at_resolution": "2026-08-13T00:59:53.939402",
    "assigned_to": "1096809",
    "assigned_to_id": "4f684bc8-e0c0-42e5-af06-efaa4346116c"
  }
};

const ALLOWED = [
  'fresh_insert_in_hours',
  'retry_already_active',
  'fresh_insert_out_of_hours',
  'missing_in_working_hours'
];

const trig = $('When Executed by Another Workflow').first().json;
const caseKey = trig._case_fixture;

if (ALLOWED.indexOf(caseKey) === -1) {
  throw new Error(
    "[stand-in conversation-sla-tracking-create] trigger json._case_fixture must be one of " +
    ALLOWED.join(' | ') + "; got " + JSON.stringify(caseKey)
  );
}

// ── (i) render the real request, verbatim transplant of the httpRequest node ──
const _rendered_url =
  'https://fe-sorento.foundryx.my/api/v1/sla-management/conversation-sla-tracking/integration';

const _rendered_body_raw = `{
    "assigned_to_id": "${ $('get-round-robin-assignee').item.json.assignee_id }",
    "contact_phone_number": ${ JSON.stringify($('When Executed by Another Workflow').first().json.contact_phone_number ?? '') },
    "agent_code": ${ JSON.stringify($('When Executed by Another Workflow').first().json.agent ?? '') },
    "team_set_code": ${ JSON.stringify($('When Executed by Another Workflow').first().json.team ?? '') },
    "message_id": ${ $('When Executed by Another Workflow').first().json.message_id },
    "source_message_id": "${ $('When Executed by Another Workflow').first().json.message_id }",
    "source_message_text": ${ JSON.stringify($('When Executed by Another Workflow').first().json.input_message || '') }
}`;

let _rendered_body;
try {
  _rendered_body = JSON.parse(_rendered_body_raw);
} catch (e) {
  throw new Error(
    '[stand-in conversation-sla-tracking-create] the rendered request body is not valid JSON — ' +
    'the real HTTP node would have sent this same malformed payload: ' + e.message +
    '\n---\n' + _rendered_body_raw + '\n---'
  );
}

// ── (ii) the pinned dev-backend response ──
let response;
if (caseKey === 'missing_in_working_hours') {
  // case (f): fresh_insert_in_hours with the in_working_hours key ABSENT, to exercise
  // `if-in-working-hours`'s typeValidation:"strict" (must error, not silently go FALSE).
  response = { ...FIXTURES.fresh_insert_in_hours };
  delete response.in_working_hours;
} else {
  response = { ...FIXTURES[caseKey] };
}

return {
  json: {
    ...response,
    _stand_in: 'sla-create',
    _case_fixture: caseKey,
    _rendered_url,
    _rendered_body,
    _rendered_body_raw
  }
};
