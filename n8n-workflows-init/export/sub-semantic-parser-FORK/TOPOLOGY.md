# TOPOLOGY — sub-semantic-parser FORK domain-continuity-carry  (`wI5RkNGW3EOJfBdo`)

- versionId **339a66d9-940f-4f16-9c91-9d30756c369d** · activeVersionId **339a66d9-940f-4f16-9c91-9d30756c369d** · DRAFT == ACTIVE
- 8 nodes

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

- **When Executed by Another Workflow** ← AI Agent, Postgres Chat Memory, mock-reformulator-output, output_exchange, suggest-follow-up, test-reformulator-bypass

## Zero inbound (orphaned / triggers)

- OpenAI Chat Model
- Postgres Chat Memory
- When Executed by Another Workflow

## Credentials (references only — no secrets)

| node | type | credential |
|---|---|---|
| OpenAI Chat Model | openAiApi | sorento-n8n-ai-agent |
| Postgres Chat Memory | postgres | n8n_test-db |

## Code nodes (bodies exported to `nodes/`)

| node | lines |
|---|---|
| output_exchange | 1951 |
| suggest-follow-up | 34 |
| mock-reformulator-output | 2 |
