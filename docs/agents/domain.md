# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## This repo: single-context

`CONTEXT.md` + `docs/adr/` at the repo root. There is no `CONTEXT-MAP.md` and no per-package context — this
is not a monorepo (no `package.json`, no `packages/*`). Ignore the multi-context branch below.

⚠️ **Scope caveat.** Today's root `CONTEXT.md` documents **one capability** — product-description search
(natural-language spec → Sorento product code) — not the repo as a whole. The repo is much broader: the n8n
chatbot spine (`sorento-consume-main`), the zero-egress test harness, the golden-master regression rig, and
the promote pipeline. So `CONTEXT.md` is a *partial* model. When a skill needs domain language for anything
outside product-description search, the authority is **`CLAUDE.md`** (architecture, IDs, the hard safety
rule) and **`docs/LESSONS.md`** (accumulated n8n/MCP gotchas) — read those too, and extend `CONTEXT.md`
rather than assuming its silence means "not modelled".

Existing ADRs (`docs/adr/`) are likewise scoped to product-description search:
`0001-spec-search-is-entity-resolution-fallback`, `0002-specification-is-crm-owned-not-query-time`,
`0003-soft-weighted-rank-with-relevance-floor`.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists — it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo (most repos):

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

Multi-context repo (presence of `CONTEXT-MAP.md` at the root):

```
/
├── CONTEXT-MAP.md
├── docs/adr/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                  ← context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_
