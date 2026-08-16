// REAL NODE: n8n-nodes-base.postgres SELECT against the PROD CRM database.
//
// It returns ZERO ITEMS on every real execution inspected (12146305, 12146929, 12154913), which is
// why `conversation-sla-tracking-update` and `-create` never appear in those runs' runData. Emitting
// [] here reproduces live EXACTLY and, as a side effect, means the two SLA stand-ins downstream are
// unreachable on the happy path — the faithful behaviour and the safe one coincide. Do not "fix"
// this to return a row: that would exercise a lane live does not take.
return [];
