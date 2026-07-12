# Rollback values — sub-human-intervention rrYXzE61gCNUck_zmXe-G (pre-Δ3-B)
activeVersionId: da86c8e9-f091-4969-86cb-8345e51b8f86

## When Executed by Another Workflow .workflowInputs.values (restore to 11 entries):
[{"name":"contact_id","type":"any"},{"name":"agent"},{"name":"team"},{"name":"contact_phone_number"},{"name":"current_assignee","type":"any"},{"name":"message_id","type":"any"},{"name":"is_test","type":"boolean"},{"name":"test_run_id"},{"name":"input_message"},{"name":"started_at"},{"name":"contact","type":"object"}]

## get-round-robin-assignee .jsonBody (restore):
={
    "agent_code": "{{ $('When Executed by Another Workflow').first().json.agent }}",
    "team_code": "{{ $('When Executed by Another Workflow').first().json.team }}",
    "contact_phone_number": "{{ $('When Executed by Another Workflow').first().json.contact_phone_number }}",
    "policy_code": "NORMAL",
    "tier": 1
}
