# TOPOLOGY — sub-semantic-parser FORK domain-continuity-carry  (`wI5RkNGW3EOJfBdo`)

- versionId **10b1c83e-f5ec-40d7-9e6c-01521e916ac8** · activeVersionId **10b1c83e-f5ec-40d7-9e6c-01521e916ac8** · DRAFT == ACTIVE
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
| OpenAI Chat Model | openAiApi | sorento-openai |
| Postgres Chat Memory | postgres | n8n_test-db |

## Code nodes (bodies exported to `nodes/`)

| node | lines |
|---|---|
| output_exchange | 1807 |
| suggest-follow-up | 34 |
| mock-reformulator-output | 2 |
