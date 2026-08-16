// REAL NODE: n8n-nodes-base.postgres against the PROD CRM database (a SELECT returning the SLA
// policy id). Stubbed for determinism and to keep the harness off the production DB entirely.
// Real output shape: {policy_id: '<uuid>'} — executions 12146305/12146929/12154913 all returned
// 225c8090-0e5f-43dc-be0b-6e06657c05fa. A zero uuid is used so a leaked value cannot be mistaken
// for a real policy.
return [{ json: { policy_id: '00000000-0000-0000-0000-000000000000', _standin: { guard: 'execute-a-sql-query', kind: 'would_read', blocked: true } } }];
