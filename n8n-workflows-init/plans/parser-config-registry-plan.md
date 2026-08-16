# Plan — CRM-Configurable Semantic-Parser Registry

Status: DESIGN LOCKED (grilled 2026-07-15). Not built. Engineer-configured (A2).

## Problem (the real one)

The semantic-parser prompt (`sub XTODTw-dJcV0uRdC056hG`, ~28k-char systemMessage) hardcodes
the domain/intent/entity/team taxonomy. But the taxonomy is **triplicated and hand-synced**:

1. **n8n parser prompt** — domain/intent/entity enums, decisive signal words, requested_attributes, routing table
2. **n8n `disallowed-entity-gate`** (spine `9qVyfUxmRQqrpGRMDLRuz`) — `ALLOWED` domain→entity-type map, `ALLOWS_EMPTY`, `REQUIRED_TYPES`, `TYPE_PROMPT`
3. **CRM `references.py`** — `_RESOLVER_ENTITY_TYPES` frozenset, `DOMAIN_STOPWORDS` dict, `domain_hint→attachment_type` logic (all hardcoded Python literals)

Adding a domain today = edit 3 literals in 2 systems and pray they match. That is the scale wall,
not "the prompt is rigid."

Reframe: the pipeline is **already ~70% delegated to CRM** — `resolve-entity`
(`/references/resolve`, takes `domain`), `check-access` (`/access-agent/check`, takes `agent`),
domain→MCP-tool binding (from `get-rag` output), `get-results` (MCP). Render (`compile-current-state`)
is ~generic (only per-domain disclaimer suffix). So this is **not** a generic-runtime rebuild — it's
consolidating 3 hardcoded taxonomy spots into ONE CRM registry consumed by both the resolver and the parser.

## Decisions (grill outcomes)

| # | Decision | Choice |
|---|---|---|
| 1 | Scope | **A** — config drives downstream too, but realized as "one registry, structured pointers"; not a from-scratch generic runtime |
| 2 | Who configures | **A2** — engineer edits CRM rows, never opens n8n; cross-domain tiebreaks stay expert-authored prose (not a no-code UI) |
| 3 | Prompt assembly | **Opt-2** — CRM returns catalog JSON; n8n owns the Stratum-I scaffold and renders locally |
| 4 | Sources of truth | **Opt-B** — ONE registry; refactor CRM `references.py` to load from it too (not n8n-only) |
| 5 | Schema shape | **Opt-3 hybrid** — resolver-critical vocab relational + FK; parser-flavor prose in JSONB |
| 6 | Cache | **Opt-3** — redis cache + explicit bust on publish + `config_version` stamp; long TTL backstop; fail-safe to baked last-known-good; no per-conversation pinning |
| 7 | Build target + gate | fork the parser sub for dev (clone→fork); promote gate = CRM literal-reproduction test + n8n **string-render gate** + golden replay zero-diff |
| 8 | Config-change safety | **Opt-3** — draft/publish + schema/FK/render-smoke + **auto-canary regression gate** |
| 9 | Canary | parser-output layer only; curated stratified ~100-turn `canary_turns`; **split comparator** (below) |
| 10 | Conditional routing | **Opt-2** — flat `suggested_team`/`suggested_agent` + JSONB `routing_override` (`by_entity`, `team_template`) |

## Prompt strata

- **Stratum I — invariant reasoning scaffold** (stays in n8n): affirmation logic, message_type test,
  read-in-context, user_goal, clarification semantics, date-filter extraction. The parser's brain.
- **Stratum II — the catalog** (→ CRM registry): domains, intents, entity-types, decisive signal words,
  requested_attributes vocab, access tiers, disallowed-entity map, routing table, disclaimer suffixes.
- **global_rules** — single CRM text field for irreducible cross-domain tiebreaks
  ("list price beats promotion", "delivery=order not incoming", "DO≠verb"). Expert-authored prose,
  rendered into the prompt. Adding a colliding domain may require a global_rules edit (canary catches the collision).

## Registry schema (hybrid — relational where resolver needs integrity, JSONB for prose)

Relational (FK'd, resolver-trusted):
- `entity_types` (key PK, description) — canonical set; replaces CRM `_RESOLVER_ENTITY_TYPES`
- `access_levels` (key PK, display) — the 7 tiers
- `domains` (key PK, intent_hint, supported bool, disclaimer_suffix, suggested_team FK, suggested_agent FK,
  allows_empty bool, rag_namespace nullable, `parser_config` JSONB, `routing_override` JSONB)
- `domain_entity_types` (domain_key FK, entity_type_key FK, required bool, type_prompt text) — the `ALLOWED`/`REQUIRED_TYPES`/`TYPE_PROMPT` maps, typos impossible via FK
- `domain_stopwords` (domain_key FK, term) — replaces CRM `DOMAIN_STOPWORDS`
- `global_rules` (singleton text)

JSONB `parser_config` (per domain, prose-only, no integrity risk): `{description, signal_terms:[{term,meaning}], requested_attributes:[{key,phrases}]}`

JSONB `routing_override` (per domain): shapes = `by_entity` (`{when:{attachment_type:"certificate"},team,agent}`) and `team_template` (`{template:"marketing_promotion_${brand}", allowed:[...]}`)

## Assembly + cache flow

1. Spine top: read `agent:config` from redis. Miss → `GET /agent-config` (CRM projects the registry) → store redis TTL 30–60min.
2. Publish (CRM) → busts redis key + bumps `config_version`. Fail-safe: fetch fail **and** redis empty → baked last-known-good catalog (parser must never go silent from a config fetch).
3. Spine passes catalog JSON into the parser sub. A `render-parser-prompt` Code node in the sub interpolates catalog + global_rules into the Stratum-I scaffold → that string is the agent `systemMessage`. `config_version` stamped on the turn for debug.

## Consumers rewired to the registry

- parser prompt: Stratum-II render (above)
- **`output_exchange` (parser sub, ~35k Code node — the deterministic policy layer, BIGGER than the prompt).** The LLM emits semantic signals; `output_exchange` applies hardcoded per-domain/entity policy maps. AUTHORITATIVE home of routing (the prompt routing table is only advisory). Maps to lift into the registry:
  - `ROUTING DERIVATION` switch → domain→team/agent + `isCert` split + `promotion_${brand}` template (= the `routing_override` design; belongs HERE, not the prompt)
  - `DATE_FILTER_DOMAINS` (which domains use the date window)
  - `DOMAIN_BLOCKED_HINTS` / `DOMAIN_BROADEN_BLOCKED_HINTS` (per-domain entity-type blocklists — the incoming-axis-gate work)
  - `AXIS_BY_DOMAIN`, `HINT_AXIS_DEFAULT`, `HINT_MAP`, `MENU_LABELS`
  - Domain-agnostic procedural logic (entity-op executor, ALL/SEMUA expansion, CS member-pick, entry-gate precedence, attachment_type i18n) STAYS as Stratum-I scaffold.
- `disallowed-entity-gate`: ALLOWED/ALLOWS_EMPTY/REQUIRED_TYPES/TYPE_PROMPT from `domain_entity_types` + `domains`
- `not-supported-domain`: `domains.supported`
- `compile-current-state`: `domains.disclaimer_suffix`
- routing/check-access: `suggested_team`/`suggested_agent` + `routing_override` (computed in `output_exchange`)
- CRM `references.py`: `_RESOLVER_ENTITY_TYPES`/`DOMAIN_STOPWORDS` loaded from registry (cached), seeded to reproduce current literals

Note: routing is DUPLICATED today (prompt advisory + `output_exchange` authoritative). Registry collapses it — drop/downgrade the prompt routing table. Registry schema must carry the extra map fields: `date_filter` bool, `blocked_hints`/`broaden_blocked_hints` (domain→entity-types), `axis` config (per domain + per entity-hint), `menu_label`, `hint_map`.

### Core principle — "config = rows within fixed rule shapes; lift the data, not the interpreter"

`output_exchange` also holds `if domain=X (& has entity Y) → do Z` predicate rules, not just flat maps. These are NOT arbitrary — they collapse into a SMALL fixed set of rule SHAPES. The interpreter for each shape stays as scaffold code; the registry supplies the rows.

| Rule (example) | Shape | Configurable row |
|---|---|---|
| `resource_attachment + has product → product_attachment` | coercion-by-entity-presence | `{from, requires_entity, to_domain, to_intent}` |
| `MENU_LABELS["complaint"] → portal_link` | label-override | `{exact_label → domain/intent/portal}` |
| `product_attachment + no attachment_type → carry prior forward` | carry-forward-entity | `{domain, hint_to_carry}` |
| `DOMAIN_BLOCKED_HINTS[domain]` | blocklist | `{domain → [hints]}` |
| routing switch (isCert, brand template) | routing-override | `{domain, by_entity / template}` |
| `DATE_FILTER_DOMAINS` | domain-flag | `date_filter: bool` |

Boundary (same as `global_rules`, consistent with A2): **known shape → add a row (no code). New rule SHAPE → engineer scaffold edit (rare).** Do NOT build a general predicate DSL/interpreter to make arbitrary new predicates configurable — that is the A1 no-code trap (unauditable config language that can silently break routing). Reading confirms no long tail: the `if domain` logic fits these ~6 shapes; remaining procedural code (member-pick, entry-gate precedence, entity-op executor, i18n) is domain-agnostic algorithm and stays scaffold.

## Neutrality gates (phase-1 refactor must be behavior-identical)

1. **CRM literal-reproduction test**: registry-derived frozenset/dict `==` old literals exactly.
2. **n8n string-render gate**: `render(seeded_catalog) == current_28k_prompt` (whitespace-modulo). Deterministic diff, no LLM, no tokens, no egress. Primary n8n proof + ongoing regression guard.
2b. **`output_exchange` map-reproduction assertion**: config-derived maps (ROUTING, DATE_FILTER_DOMAINS, DOMAIN_BLOCKED_HINTS, AXIS_BY_DOMAIN, HINT_AXIS_DEFAULT, HINT_MAP, MENU_LABELS, DOMAIN_BROADEN_BLOCKED_HINTS) `==` current literals exactly. Same discipline as the CRM literal-reproduction test — this Code node is a second in-sub consumer, not just the prompt.
3. **Golden replay** (2,216 turns) on fork + registry → **zero node diffs**.
4. User-gated promote: publish CRM refactor + registry → promote parser sub to live `XTODTw`.

## Ongoing config-change safety (draft/publish + auto-canary)

- Draft vs published state; validation = required fields + entity_type FK + enum + render smoke (placeholders filled, length band, no dup keys/signal terms) + collision heuristic (new signal term ⊂ existing decisive term → warn).
- **Auto-canary on publish**: config-diff → *touched* key set. Re-run parser LLM (tokens-only, **0 prod-read, 0 egress** — parser does no reads/sends) over `canary_turns`. Gate:
  - golden domain ∉ touched → parser output MUST match golden → mismatch = **block** (this auto-trips on signal-word collisions)
  - golden domain ∈ touched → diff expected → surface for review, non-blocking
- `canary_turns`: curated, **stratified to cover every domain**, pre-filtered to historically-stable outputs (~100).

### Split comparator (parser output vs golden)

| Field | Comparator | Tolerance |
|---|---|---|
| `domain_hint`, `intent_hint`, `message_type` | exact enum equality | **zero — flip = block** |
| `suggested_team`, `suggested_agent` | exact equality | **zero** (safety-critical routing) |
| `access_levels`, `entities[].hint` | exact set equality | zero |
| `entities[].raw` | normalized (lowercase/trim) equality | normalization only |
| `user_goal` + other prose | LLM-score ≥ threshold | fuzzy OK (not a routing decision) |

LLM-judge scoped ONLY to prose. Never gets a vote on routing fields — a fuzzy score must never pass a domain/team flip. De-flake via curation (stable turns only) + flaky allowlist, not by loosening routing comparison.

## Build sequence

- **Phase 0 (CRM):** create registry tables; seed rows byte-reproducing current `_RESOLVER_ENTITY_TYPES` + `DOMAIN_STOPWORDS` + n8n `ALLOWED`; literal-reproduction test green; existing resolver tests green.
- **Phase 1 (CRM):** `references.py` loads from registry (cached); behavior-identical; golden replay support.
- **Phase 2 (CRM):** `GET /agent-config` projection; draft/publish + validation + cache-bust webhook.
- **Phase 3 (n8n fork):** Stratum-I scaffold + `render-parser-prompt`; string-render gate green; spine fetch+redis cache+fail-safe.
- **Phase 4:** auto-canary harness + `canary_turns` seed + split comparator.
- **Phase 5:** golden replay zero-diff on fork+registry → user-gated promote (CRM refactor live, parser sub → `XTODTw`).

## Open items / risks

- CRM `references.py` resolver refactor touches tuned behavior — the literal-reproduction test + golden replay are the safety net; keep Phase-1 a pure swap.
- LLM nondeterminism in canary — mitigated by curation + flaky allowlist, not routing-comparison loosening.
- Adding a colliding domain still needs a global_rules edit — accepted (A2); canary blocks if forgotten.
- `get-rag` (`tWP33QOFT7SxThfT`) VERIFIED CLEAN 2026-07-15: zero hardcoded taxonomy. Takes `domain`+`source_type`, pgvector query `WHERE source_type=$2 AND source_id LIKE '%'||domain||'%'` → tools from `embedding_chunks`. Domain→tool binding already data-driven in the embedding store (add a domain's tools = embed rows, no n8n edit). NOT a hidden source. Only adjacent check: how the spine derives the `source_type` arg passed to get-rag (likely straight from parser output — confirm it's not a small hardcoded domain→source_type map at the call site).
