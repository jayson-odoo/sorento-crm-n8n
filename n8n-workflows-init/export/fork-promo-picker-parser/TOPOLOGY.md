# TOPOLOGY — sub-semantic-parser PROMO-PICKER  (`RJ326g9dwe3bTWyf`)

- versionId **7a3c0a36-cb94-4e6d-943a-97aa3469ddee** · activeVersionId **7a3c0a36-cb94-4e6d-943a-97aa3469ddee** · DRAFT == ACTIVE
- 7 nodes

## Edges
_5 edge groups_

```
AI Agent[0] -> output_exchange
When Executed by Another Workflow[0] -> test-reformulator-bypass
output_exchange[0] -> suggest-follow-up
test-reformulator-bypass[0] -> mock-reformulator-output
test-reformulator-bypass[1] -> AI Agent
```

## Read BY NAME (`$('x')` / `$("x")`)

> Rewiring alone does NOT redirect these. Repoint the expression too.

- **When Executed by Another Workflow** ← AI Agent, mock-reformulator-output, output_exchange, suggest-follow-up, test-reformulator-bypass

## Zero inbound (orphaned / triggers)

- OpenAI Chat Model
- When Executed by Another Workflow

## Credentials (references only — no secrets)

| node | type | credential |
|---|---|---|
| OpenAI Chat Model | openAiApi | sorento-openai |

## Code nodes (bodies exported to `nodes/`)

| node | lines |
|---|---|
| output_exchange | 1378 |
| suggest-follow-up | 55 |
| mock-reformulator-output | 2 |
