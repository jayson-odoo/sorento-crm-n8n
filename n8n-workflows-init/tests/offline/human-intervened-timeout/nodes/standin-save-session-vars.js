// REAL NODE: n8n-nodes-base.httpRequest -> PUT conversation-variables on the PROD CRM. This is the
// write that UAC 0 S3 exists to prevent; on the consume-main clone the equivalent node is left
// ORPHANED. Here it must stay WIRED, because `compile-current-state` is kept byte-identical to live
// and its output has to land somewhere observable — so the containment is the stand-in, and the
// would-be payload is retained in runData for inspection (LESSONS 42: reading the frozen payload is
// how you learn what a turn WOULD have written, at zero egress).
const j = $input.first().json || {};
return [{ json: {
  respond_io_id: String($('Respond.io Trigger').first().json.contact.id),
  session_vars: j,
  _standin: { guard: 'save-session-vars', kind: 'would_write', blocked: true,
              target: 'crm:PUT conversation-variables' },
} }];
