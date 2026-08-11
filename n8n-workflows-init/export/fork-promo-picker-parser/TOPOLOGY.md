# TOPOLOGY — sub-semantic-parser PROMO-PICKER  (`RJ326g9dwe3bTWyf`)

- versionId **7c5ff7fd-9cb1-427e-82d4-8556311f4807** · activeVersionId **7c5ff7fd-9cb1-427e-82d4-8556311f4807** · DRAFT == ACTIVE
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
| output_exchange | 1254 |
| suggest-follow-up | 34 |
| mock-reformulator-output | 2 |
