// REAL NODE: n8n-nodes-base.httpRequest -> conversation SLA event tracking CREATE (a PROD WRITE).
// See standin-sla-update.js — same reasoning, same unreachability on the live-faithful path.
return [{ json: { _standin: { guard: 'conversation-sla-event-tracking-create', kind: 'would_write', blocked: true } } }];
