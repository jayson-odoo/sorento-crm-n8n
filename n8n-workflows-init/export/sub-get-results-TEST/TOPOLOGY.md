# TOPOLOGY — sub-get-results TEST  (`rysSPgUssLDf6xJc`)

- versionId **7c97c03c-d2cd-462b-bb9f-67c8b929f9c4** · activeVersionId **7c97c03c-d2cd-462b-bb9f-67c8b929f9c4** · DRAFT == ACTIVE
- 8 nodes

## Edges
_4 edge groups_

```
AI Agent[0] -> output_exchange
MCP Client1[0] -> output-structurer
When Executed by Another Workflow[0] -> entity-ids-transformer
entity-ids-transformer[0] -> MCP Client1
```

## Read BY NAME (`$('x')` / `$("x")`)

> Rewiring alone does NOT redirect these. Repoint the expression too.

- **MCP Client1** ← output-structurer
- **When Executed by Another Workflow** ← AI Agent, MCP Client, MCP Client1, entity-ids-transformer, output-structurer

## Zero inbound (orphaned / triggers)

- AI Agent
- MCP Client
- OpenAI Chat Model
- When Executed by Another Workflow

## Credentials (references only — no secrets)

| node | type | credential |
|---|---|---|
| OpenAI Chat Model | openAiApi | sorento-openai |

## Code nodes (bodies exported to `nodes/`)

| node | lines |
|---|---|
| output-structurer | 403 |
| output_exchange | 177 |
| entity-ids-transformer | 138 |
