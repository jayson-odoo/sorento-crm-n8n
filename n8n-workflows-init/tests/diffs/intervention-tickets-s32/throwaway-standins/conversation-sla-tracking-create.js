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
//       longer malforms the body.
//       HARDENING 2026-08-16 (codex cross-model review, VERDICT: FIX): the last three raw
//       interpolations are gone too.
//         · assigned_to_id  -> JSON.stringify(x ?? '')  — an undefined assignee no longer
//           renders the literal string "undefined" (backend 400 "User not found").
//           Empty string is CORRECT on missing: it means "round-robin server-side".
//         · message_id      -> JSON.stringify(x ?? null) — UNQUOTED before, so a null/undefined
//           rendered `"message_id": ,` = MALFORMED JSON = the create fails and the
//           intervention dies silently after the customer was told help is coming.
//           Now a bare JSON null when missing (the field is optional), the number otherwise.
//         · source_message_id -> ternary. Quoted-raw before, so a missing id rendered `""` —
//           an EMPTY IDEMPOTENCY KEY, and that key is the identity of the whole feature
//           (AC-A2 dedups on it). Silently broken dedup is worse than a loud failure, so it
//           now renders a bare JSON null and the backend rejects it loudly (REQUIRED string
//           in the contract). `== null` catches undefined AND null but not 0 or "".
//       Consequence for this instrument: no interpolation can malform the body any more, so
//       the JSON.parse guard below is defence-in-depth with no fail-on-purpose driver. The
//       probe's red-proof moved to the new invariants (bare null vs "" vs quoted string) —
//       see probe.js, and throwaway-build.md §13.
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
    "tracking_id": "04473f95-0f4a-4956-83fd-7ebda2a1fb7d",
    "is_update": false,
    "already_active": false,
    "in_working_hours": true,
    "initiated_at": "2026-08-13T01:25:12.693268",
    "due_at": "2026-08-13T02:25:12.693268",
    "due_at_resolution": "2026-08-13T02:25:12.693268",
    "assigned_to": "1096809",
    "assigned_to_id": "4f684bc8-e0c0-42e5-af06-efaa4346116c"
  },
  "retry_already_active": {
    "status": "success",
    "message": "Active SLA tracking already exists for this contact; returned existing tracking.",
    "tracking_id": "04473f95-0f4a-4956-83fd-7ebda2a1fb7d",
    "is_update": true,
    "already_active": true,
    "in_working_hours": true,
    "initiated_at": "2026-08-13T01:25:12.693268",
    "due_at": "2026-08-13T02:25:12.693268",
    "due_at_resolution": "2026-08-13T02:25:12.693268",
    "assigned_to": "1096809",
    "assigned_to_id": "4f684bc8-e0c0-42e5-af06-efaa4346116c"
  },
  "fresh_insert_out_of_hours": {
    "status": "success",
    "message": "SLA tracking created successfully.",
    "tracking_id": "6907d9f0-b445-4beb-8254-bed12d4944e4",
    "is_update": false,
    "already_active": false,
    "in_working_hours": false,
    "initiated_at": "2026-08-13T01:25:25.919155",
    "due_at": "2026-08-14T01:00:00",
    "due_at_resolution": "2026-08-14T01:00:00",
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
    "assigned_to_id": ${ JSON.stringify($('get-round-robin-assignee').item.json.assignee_id ?? '') },
    "contact_phone_number": ${ JSON.stringify($('When Executed by Another Workflow').first().json.contact_phone_number ?? '') },
    "agent_code": ${ JSON.stringify($('When Executed by Another Workflow').first().json.agent ?? '') },
    "team_set_code": ${ JSON.stringify($('When Executed by Another Workflow').first().json.team ?? '') },
    "message_id": ${ JSON.stringify($('When Executed by Another Workflow').first().json.message_id ?? null) },
    "source_message_id": ${ $('When Executed by Another Workflow').first().json.message_id == null ? 'null' : JSON.stringify(String($('When Executed by Another Workflow').first().json.message_id)) },
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
