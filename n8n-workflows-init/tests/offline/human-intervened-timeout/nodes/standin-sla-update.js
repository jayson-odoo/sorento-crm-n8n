// REAL NODE: n8n-nodes-base.httpRequest -> conversation SLA tracking UPDATE (a PROD WRITE that
// triggers staff email/WhatsApp ripple). Never executed in the harness — `Select rows from a table`
// emits zero items, exactly as live does — but present as a stand-in so no credentialed httpRequest
// node exists anywhere in this fork's JSON (UAC 0 S8 asserts on node TYPE, because MCP redacts
// credentials on read and an armed fork looks identical to a clean one).
return [{ json: { _standin: { guard: 'conversation-sla-tracking-update', kind: 'would_write', blocked: true } } }];
